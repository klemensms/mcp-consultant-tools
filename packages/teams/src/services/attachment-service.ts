/**
 * Attachment Service - saving the images and files a Teams message carries
 *
 * A message holds downloadable content in two unrelated places, and each needs
 * a different route:
 *
 *   inline images    -> Graph hostedContents, referenced by <img src> in the body.
 *                       Read on the same scope as the message itself: Chat.ReadWrite
 *                       for a chat, ChannelMessage.Read.All for a channel.
 *   file attachments -> `reference` entries in attachments[], pointing at the file in
 *                       the sender's OneDrive (chats) or the team's SharePoint
 *                       (channels). Resolved through /shares, which Graph
 *                       documents as needing Files.ReadWrite, Files.ReadWrite.All
 *                       or Sites.ReadWrite.All - no read-only form. Only GETs are
 *                       made; the write half of the scope is never exercised.
 *
 * The files scope is deliberately NOT in DEVICE_CODE_SCOPES, for the same reason
 * ChannelMessage.ReadWrite is not: Entra returns every admin-consented scope in
 * the token regardless of what MSAL requests, so where it is consented the file
 * downloads work with no code change, and where it is not, asking for it would
 * fail at sign-in and take every tool down. Without it, images still download
 * and each file is reported as failed with the scope named.
 *
 * Everything else in attachments[] - quoted replies, forwarded messages, cards -
 * is not a file, and is reported as skipped rather than silently dropped.
 *
 * The Graph token is only ever sent to graph.microsoft.com. A file's bytes come
 * from the pre-authenticated @microsoft.graph.downloadUrl, fetched with no
 * Authorization header.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ResponseType } from "@microsoft/microsoft-graph-client";
import { JSDOM } from "jsdom";
import type { TeamsService } from "./teams-service.js";
import { wrapGraphError } from "./message-service.js";
import type { AttachmentDownloadResult, DownloadedAttachment, UndownloadedAttachment } from "../types.js";

const GRAPH_HOST = "graph.microsoft.com";

/** Where files land when the caller names no folder: outside every repo and synced folder. */
const DEFAULT_ROOT = path.join(os.tmpdir(), "mcp-teams-attachments");

/** The attachment types that are never files, and how to describe them. */
const NOT_A_FILE: Record<string, string> = {
  messageReference: "a quoted reply, not a file",
  forwardedMessageReference: "a forwarded message, not a file",
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

export interface DownloadOptions {
  /** A chat message. Without it the message is read from a channel. */
  chatId?: string;
  teamId?: string;
  channelId?: string;
  /** A reply inside a channel thread, rather than the thread's parent. */
  replyId?: string;
  /** Folder to save into. Defaults to a per-message folder under the system temp directory. */
  outputDir?: string;
}

export class AttachmentService {
  constructor(private teams: TeamsService) {}

  /**
   * Save every inline image and file attachment of one message to disk.
   *
   * One item failing does not stop the rest: each is reported as downloaded,
   * skipped (not a file) or failed (should have downloaded and did not).
   */
  async downloadMessageAttachments(
    messageId: string,
    options: DownloadOptions = {}
  ): Promise<AttachmentDownloadResult> {
    if (options.chatId && options.replyId) {
      throw new Error("replyId applies to channel threads only - chats have no thread replies.");
    }

    const client = await this.teams.getGraphClient();
    const messagePath = this.messagePath(messageId, options);
    const outputDir = path.resolve(options.outputDir ?? path.join(DEFAULT_ROOT, safeFileName(messageId, "message")));

    let message: any;
    try {
      message = await client.api(messagePath).get();
    } catch (error) {
      throw wrapGraphError(error, `read message ${messageId}`);
    }

    const result: AttachmentDownloadResult = { messageId, outputDir, downloaded: [], skipped: [], failed: [] };
    const saver = new FileSaver(outputDir);

    const images = extractHostedImageUrls(message?.body?.content ?? "");
    for (const [index, src] of images.hosted.entries()) {
      const label = `image ${index + 1}`;
      try {
        const response: Response = await client.api(src).responseType(ResponseType.RAW).get();
        if (!response.ok) {
          throw new Error(`Graph answered HTTP ${response.status}`);
        }
        const contentType = mediaType(response.headers.get("content-type"));
        const name = `image-${index + 1}.${IMAGE_EXTENSIONS[contentType ?? ""] ?? "bin"}`;
        result.downloaded.push(await saver.save(response, name, "image", contentType));
      } catch (error) {
        result.failed.push({ name: label, reason: errorMessage(error) });
      }
    }
    for (const src of images.external) {
      result.skipped.push({ name: src, reason: "an image hosted outside Microsoft Graph (a sticker or external picture)" });
    }

    for (const attachment of message?.attachments ?? []) {
      const outcome = await this.downloadAttachment(client, attachment, saver);
      if ("path" in outcome) result.downloaded.push(outcome);
      else if (outcome.failed) result.failed.push({ name: outcome.name, reason: outcome.reason });
      else result.skipped.push({ name: outcome.name, reason: outcome.reason });
    }

    return result;
  }

  private async downloadAttachment(
    client: any,
    attachment: any,
    saver: FileSaver
  ): Promise<DownloadedAttachment | (UndownloadedAttachment & { failed: boolean })> {
    const contentType: string = attachment?.contentType ?? "unknown";
    // Quoted replies and cards carry no name; their reason says what they are.
    const name: string = attachment?.name ?? "";

    if (contentType !== "reference") {
      const reason = NOT_A_FILE[contentType]
        ?? (contentType.includes("card") ? "a card, not a file" : `a ${contentType} attachment, not a file`);
      return { name, reason, failed: false };
    }

    const url: string | undefined = attachment.contentUrl ?? undefined;
    if (!url || !isSharePointUrl(url)) {
      return { name, reason: "a link, not a file stored in SharePoint or OneDrive", failed: false };
    }

    let item: any;
    try {
      item = await client.api(`/shares/${toShareId(url)}/driveItem`).get();
    } catch (error) {
      return { name, reason: describeShareError(error), failed: true };
    }

    if (!item?.file) {
      return { name, reason: item?.folder ? "a folder, not a file" : "not a file (a page or list item)", failed: false };
    }

    const downloadUrl: string | undefined = item["@microsoft.graph.downloadUrl"];
    if (!downloadUrl) {
      return { name, reason: "Graph returned no download URL for this file", failed: true };
    }

    try {
      // Pre-authenticated and short-lived: no Authorization header goes with it.
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`the download answered HTTP ${response.status}`);
      }
      return await saver.save(response, item.name ?? name, "file", item.file.mimeType ?? undefined);
    } catch (error) {
      return { name, reason: errorMessage(error), failed: true };
    }
  }

  private messagePath(messageId: string, options: DownloadOptions): string {
    if (options.chatId) {
      return `/chats/${options.chatId}/messages/${messageId}`;
    }
    const teamId = this.teams.getTeamId(options.teamId);
    const channelId = this.teams.getChannelId(options.channelId);
    const base = `/teams/${teamId}/channels/${channelId}/messages/${messageId}`;
    return options.replyId ? `${base}/replies/${options.replyId}` : base;
  }
}

/**
 * Writes responses into one folder, created on first use, never overwriting a
 * file already there. Files are readable only by the signed-in user.
 */
class FileSaver {
  private created = false;

  constructor(private dir: string) {}

  async save(
    response: Response,
    name: string,
    kind: DownloadedAttachment["kind"],
    contentType: string | undefined
  ): Promise<DownloadedAttachment> {
    if (!response.body) {
      throw new Error("the response had no content");
    }
    if (!this.created) {
      fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      this.created = true;
    }

    const fileName = this.freeName(safeFileName(name, kind));
    const filePath = path.join(this.dir, fileName);

    try {
      // `wx` fails rather than overwrite, should a file appear between the check and the write.
      await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(filePath, { flags: "wx", mode: 0o600 }));
    } catch (error) {
      fs.rmSync(filePath, { force: true });
      throw error;
    }

    return { kind, name: fileName, path: filePath, size: fs.statSync(filePath).size, contentType };
  }

  /** "Report.pdf", then "Report (2).pdf", skipping any name already on disk. */
  private freeName(name: string): string {
    const ext = path.extname(name);
    const stem = name.slice(0, name.length - ext.length);
    let candidate = name;
    for (let n = 2; fs.existsSync(path.join(this.dir, candidate)); n++) {
      candidate = `${stem} (${n})${ext}`;
    }
    return candidate;
  }
}

/**
 * Split a message body's images into Graph hostedContents (downloadable with the
 * Graph token) and everything else. The host is compared exactly, so a lookalike
 * such as graph.microsoft.com.example is never sent the token.
 */
export function extractHostedImageUrls(html: string): { hosted: string[]; external: string[] } {
  const hosted: string[] = [];
  const external: string[] = [];
  if (!html) {
    return { hosted, external };
  }

  const { document } = new JSDOM(`<body>${html}</body>`).window;
  for (const img of Array.from(document.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (!src) continue;
    let host = "";
    try {
      host = new URL(src).hostname;
    } catch {
      // Not an absolute URL - nothing to fetch.
    }
    (host === GRAPH_HOST ? hosted : external).push(src);
  }
  return { hosted, external };
}

/** The /shares id for a sharing URL: "u!" plus unpadded url-safe base64. */
export function toShareId(url: string): string {
  return `u!${Buffer.from(url, "utf8").toString("base64url")}`;
}

/**
 * A name that is safe to write inside the output folder. The name comes from
 * whoever sent the message, so any directory component is dropped - "../x"
 * can never land outside the folder - and leading dots are removed.
 */
export function safeFileName(name: string | undefined, fallback: string): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  return cleaned || fallback;
}

function isSharePointUrl(url: string): boolean {
  try {
    return /(^|\.)sharepoint(-df)?\.(com|us|de|cn)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** "image/png; charset=binary" -> "image/png" */
function mediaType(header: string | null): string | undefined {
  return header?.split(";")[0].trim().toLowerCase() || undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A 403 from /shares cannot say which of two causes it is, so name both. The
 * generic "re-authenticate" advice elsewhere in the package would be wrong for
 * either.
 */
function describeShareError(error: unknown): string {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode === 403 || statusCode === 401) {
    return (
      "access denied. Either the signed-in user cannot open this file, or the app registration " +
      "has no files permission consented (Files.ReadWrite.All or Sites.ReadWrite.All). " +
      "Re-authenticating will not help with the second: an administrator has to grant it."
    );
  }
  if (statusCode === 404) {
    return "the file was not found - it may have been moved, renamed or deleted since it was shared";
  }
  return `could not resolve the file: ${errorMessage(error)}`;
}
