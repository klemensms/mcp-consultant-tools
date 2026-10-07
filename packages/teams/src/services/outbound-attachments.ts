/**
 * Outbound attachments - sending local files with a Teams message
 *
 * Graph has no "attach a file" field on a message. A file in Teams is a file in
 * OneDrive or SharePoint plus a `reference` attachment pointing at it, so a send
 * with files is three steps:
 *
 *   1. upload  -> chats: the sender's OneDrive folder "Microsoft Teams Chat Files",
 *                 the same folder the Teams client uses.
 *                 channels: the channel's own files folder (GET .../filesFolder),
 *                 whose members can already open it.
 *   2. share   -> chats only: every other chat member is invited to read the file
 *                 (requireSignIn, no invitation email), so nobody meets a
 *                 "request access" page.
 *   3. post    -> the body carries `<attachment id="{guid}"></attachment>` and
 *                 attachments[] carries { id, contentType: "reference", contentUrl,
 *                 name }. The id is the GUID inside the driveItem's eTag.
 *
 * Every path is checked by assertSafeLocalFile before anything is created,
 * uploaded or sent: `checkAttachmentPaths` runs first in every send, and the
 * upload only ever reads the real paths it returned.
 *
 * Scope: upload and invite need Files.ReadWrite, Files.ReadWrite.All or
 * Sites.ReadWrite.All; filesFolder also accepts the read forms. None is in
 * DEVICE_CODE_SCOPES, for the reason given in attachment-service.ts: a consented
 * one arrives in the token anyway, and requesting an unconsented one would fail
 * every tool at sign-in. Without one, the send fails at the upload with the scope
 * named, and no message is posted.
 *
 * The Graph token only goes to graph.microsoft.com. The bytes go to the upload
 * session's pre-authenticated uploadUrl with no Authorization header.
 */

import fs from "node:fs";
import path from "node:path";
import { assertSafeLocalFile } from "../local-file-guard.js";
import { escapeHtml } from "../mentions.js";
import { wrapGraphError } from "./message-service.js";

/** Teams shows ten file cards on a message comfortably; more is almost certainly a mistake. */
export const MAX_ATTACHMENTS = 10;

/** Upload chunk size. Graph requires a multiple of 320 KiB; this is 32 of them (10 MiB). */
const CHUNK_SIZE = 32 * 320 * 1024;

const CHAT_FILES_FOLDER = "Microsoft Teams Chat Files";

export type AttachmentTarget =
  | { kind: "chat"; chatId: string }
  | { kind: "channel"; teamId: string; channelId: string };

export interface CheckedAttachment {
  /** The real path, symlinks followed, as returned by the guard. */
  realPath: string;
  name: string;
  size: number;
}

export interface UploadedAttachment {
  /** GUID from the driveItem eTag; the id the message's <attachment> tag and attachments[] share. */
  id: string;
  /** The name the file landed under, which differs from the local name when a rename avoided a clash. */
  name: string;
  webUrl: string;
  size: number;
  /** Chats only: how many members were given read access. */
  sharedWith?: number;
}

/**
 * Check every path before anything happens. Throws on the first refusal, naming
 * the path, so one bad file stops the whole send rather than part of it.
 */
export function checkAttachmentPaths(paths: string[] | undefined): CheckedAttachment[] {
  if (!paths || paths.length === 0) {
    return [];
  }
  if (paths.length > MAX_ATTACHMENTS) {
    throw new Error(`Nothing was sent. ${paths.length} attachments named; at most ${MAX_ATTACHMENTS} can go on one message.`);
  }

  return paths.map((filePath) => {
    let realPath: string;
    try {
      realPath = assertSafeLocalFile(filePath);
    } catch (error) {
      throw new Error(`Nothing was sent. ${error instanceof Error ? error.message : String(error)}`);
    }
    const size = fs.statSync(realPath).size;
    if (size === 0) {
      throw new Error(`Nothing was sent. ${filePath} is empty, and Graph will not upload an empty file this way.`);
    }
    return { realPath, name: path.basename(filePath), size };
  });
}

/**
 * Upload the checked files to the target's folder and, for a chat, share each
 * with the other members. Returns what the message needs to reference them.
 */
export async function uploadAttachments(
  client: any,
  files: CheckedAttachment[],
  target: AttachmentTarget
): Promise<UploadedAttachment[]> {
  if (files.length === 0) {
    return [];
  }

  const folderPath = await resolveFolderPath(client, target);
  const recipients = target.kind === "chat" ? await chatRecipients(client, target.chatId) : [];

  const uploaded: UploadedAttachment[] = [];
  for (const file of files) {
    try {
      const item = await uploadOne(client, folderPath, file);
      const id = guidFromETag(item.eTag);
      const webUrl: string | undefined = item.webUrl;
      if (!id || !webUrl) {
        throw new Error("Graph returned the uploaded file without an eTag GUID or webUrl");
      }

      let sharedWith: number | undefined;
      if (target.kind === "chat") {
        sharedWith = await shareWith(client, item, recipients);
      }

      uploaded.push({ id, name: item.name ?? file.name, webUrl, size: file.size, sharedWith });
    } catch (error) {
      const already = uploaded.length > 0
        ? ` Already uploaded, and left in place: ${uploaded.map((u) => u.webUrl).join(", ")}.`
        : "";
      const wrapped = wrapGraphError(error, `attach ${file.name}`);
      throw new Error(`Nothing was sent. ${wrapped.message}${scopeHint(error)}${already}`);
    }
  }
  return uploaded;
}

/**
 * Add the attachments to a message payload: one <attachment> tag per file after
 * the text, and the matching attachments[] entries. A text body is escaped and
 * turned into HTML first, because the tag only works in an HTML body.
 */
export function withAttachments(
  body: { contentType: string; content: string },
  uploaded: UploadedAttachment[]
): { body: { contentType: string; content: string }; attachments?: any[] } {
  if (uploaded.length === 0) {
    return { body };
  }

  const html = body.contentType === "html"
    ? body.content
    : escapeHtml(body.content).replace(/\n/g, "<br>");
  const tags = uploaded.map((u) => `<attachment id="${escapeHtml(u.id)}"></attachment>`).join("");

  return {
    body: { contentType: "html", content: `${html}${tags}` },
    attachments: uploaded.map((u) => ({
      id: u.id,
      contentType: "reference",
      contentUrl: u.webUrl,
      name: u.name,
    })),
  };
}

/**
 * The POST body for a message: text, any @-mentions, and any uploaded files.
 * Every send path builds its payload here so the three cannot drift apart.
 */
export function messagePayload(
  outbound: { body: { contentType: string; content: string }; mentions?: any[] },
  uploaded: UploadedAttachment[] = []
): Record<string, any> {
  const { body, attachments } = withAttachments(outbound.body, uploaded);
  return {
    body,
    ...(outbound.mentions ? { mentions: outbound.mentions } : {}),
    ...(attachments ? { attachments } : {}),
  };
}

/** One line per file for a tool result. */
export function describeUploaded(uploaded: UploadedAttachment[]): string {
  if (uploaded.length === 0) {
    return "";
  }
  const lines = uploaded.map((u) => {
    const shared = u.sharedWith === undefined ? "" : `, shared with ${u.sharedWith} chat member${u.sharedWith === 1 ? "" : "s"}`;
    return `- ${u.name} (${formatSize(u.size)}${shared}): ${u.webUrl}`;
  });
  return `\n\nAttached:\n${lines.join("\n")}`;
}

/** The eTag looks like "{6E5E3E07-...},1"; the GUID is the part in braces. */
export function guidFromETag(eTag: string | undefined): string | undefined {
  const match = /\{([0-9a-f-]{36})\}/i.exec(eTag ?? "");
  return match ? match[1] : undefined;
}

async function resolveFolderPath(client: any, target: AttachmentTarget): Promise<string> {
  if (target.kind === "chat") {
    return `/me/drive/root:/${encodeURIComponent(CHAT_FILES_FOLDER)}`;
  }
  try {
    const folder = await client
      .api(`/teams/${target.teamId}/channels/${target.channelId}/filesFolder`)
      .get();
    const driveId = folder?.parentReference?.driveId;
    if (!driveId || !folder?.id) {
      throw new Error("Graph returned the channel's files folder without a drive or item id");
    }
    return `/drives/${driveId}/items/${folder.id}:`;
  } catch (error) {
    const wrapped = wrapGraphError(error, "find the channel's files folder");
    throw new Error(`Nothing was sent. ${wrapped.message}${scopeHint(error)}`);
  }
}

/** Everyone in the chat except the sender, as invite recipients. */
async function chatRecipients(client: any, chatId: string): Promise<Array<{ email?: string; objectId?: string }>> {
  const me = await client.api("/me").select("id").get();
  const response = await client.api(`/chats/${chatId}/members`).get();
  return (response.value ?? [])
    .filter((m: any) => m.userId && m.userId !== me.id)
    .map((m: any) => (m.email ? { email: m.email } : { objectId: m.userId }));
}

async function uploadOne(client: any, folderPath: string, file: CheckedAttachment): Promise<any> {
  const session = await client
    .api(`${folderPath}/${encodeURIComponent(file.name)}:/createUploadSession`)
    .post({ item: { "@microsoft.graph.conflictBehavior": "rename" } });
  const uploadUrl: string | undefined = session?.uploadUrl;
  if (!uploadUrl) {
    throw new Error("Graph did not return an upload URL");
  }

  const handle = await fs.promises.open(file.realPath, "r");
  try {
    let offset = 0;
    let last: any;
    while (offset < file.size) {
      const length = Math.min(CHUNK_SIZE, file.size - offset);
      const chunk = Buffer.alloc(length);
      await handle.read(chunk, 0, length, offset);
      // Pre-authenticated URL: no Authorization header, so the token never leaves Graph.
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(length),
          "Content-Range": `bytes ${offset}-${offset + length - 1}/${file.size}`,
        },
        body: chunk,
      });
      if (!response.ok) {
        throw new Error(`upload stopped at byte ${offset} with HTTP ${response.status}: ${await response.text()}`);
      }
      last = response;
      offset += length;
    }
    const item = await last.json();
    // The final chunk's response is the driveItem; read it back for its webUrl
    // and eTag, which are not guaranteed on that response.
    const driveId = item?.parentReference?.driveId;
    return driveId && item?.id
      ? await client.api(`/drives/${driveId}/items/${item.id}`).select("id,name,eTag,webUrl,parentReference").get()
      : item;
  } finally {
    await handle.close();
  }
}

async function shareWith(client: any, item: any, recipients: Array<{ email?: string; objectId?: string }>): Promise<number> {
  if (recipients.length === 0) {
    return 0;
  }
  await client.api(`/drives/${item.parentReference.driveId}/items/${item.id}/invite`).post({
    recipients,
    roles: ["read"],
    requireSignIn: true,
    sendInvitation: false,
  });
  return recipients.length;
}

function scopeHint(error: unknown): string {
  const status = (error as { statusCode?: number })?.statusCode;
  return status === 401 || status === 403
    ? " Sending a file needs a files permission on the app registration (Files.ReadWrite, Files.ReadWrite.All or Sites.ReadWrite.All)."
    : "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
