/**
 * Attachment tools
 *
 * - download-message-attachments: save the images and files one message carries
 *
 * Message reads render an image as "[image: ...]" and a file as
 * "[attachment: name - url]"; this is the tool that gets the content itself.
 * See services/attachment-service.ts for which scope each kind needs.
 */

import { z } from "zod";
import type { ServiceContext, AttachmentDownloadResult } from "../types.js";
import {
  descWithExamples,
  CHAT_ID_EXAMPLES,
  MESSAGE_ID_EXAMPLES,
  OUTPUT_DIR_EXAMPLES,
} from "../tool-examples.js";

export const downloadMessageAttachmentsSchema = {
  messageId: z
    .string()
    .describe(
      descWithExamples(
        "ID of the message whose images and files to download. Get it from get-chat-messages, get-channel-messages or get-message-replies, or from the last path segment of a Teams message link.",
        MESSAGE_ID_EXAMPLES
      )
    ),
  chatId: z
    .string()
    .optional()
    .describe(
      descWithExamples(
        "Chat ID, for a message in a chat. Omit for a channel message. In a Teams message link it is the segment before the message ID.",
        CHAT_ID_EXAMPLES
      )
    ),
  teamId: z.string().optional().describe("Team ID, for a channel message (optional if TEAMS_DEFAULT_TEAM_ID is set). Ignored when chatId is given."),
  channelId: z.string().optional().describe("Channel ID, for a channel message (optional if TEAMS_DEFAULT_CHANNEL_ID is set). Ignored when chatId is given."),
  replyId: z
    .string()
    .optional()
    .describe(
      descWithExamples(
        "Download from this reply inside the channel thread instead of the parent message. Get it from get-message-replies. Channels only.",
        MESSAGE_ID_EXAMPLES
      )
    ),
  outputDir: z
    .string()
    .optional()
    .describe(
      descWithExamples(
        "Folder to save into, created if missing. Defaults to a folder named after the message under the system temp directory. An existing file is never overwritten; a clash gets a numbered name.",
        OUTPUT_DIR_EXAMPLES
      )
    ),
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describe(item: { name: string; reason: string }): string {
  return item.name ? `- ${item.name}: ${item.reason}` : `- ${item.reason}`;
}

export function formatAttachmentDownload(result: AttachmentDownloadResult): string {
  const lines: string[] = [];
  const { downloaded, skipped, failed } = result;

  if (downloaded.length === 0 && skipped.length === 0 && failed.length === 0) {
    return `No images or files found in message ${result.messageId}.`;
  }

  if (downloaded.length > 0) {
    lines.push(`✅ Downloaded ${downloaded.length} item(s) from message ${result.messageId}`, "", `Folder: ${result.outputDir}`, "");
    for (const item of downloaded) {
      const type = item.contentType ? `${item.contentType}, ` : "";
      lines.push(`- **${item.name}** (${item.kind}, ${type}${formatSize(item.size)})`, `  ${item.path}`);
    }
  } else {
    lines.push(`Nothing downloaded from message ${result.messageId}.`);
  }

  if (failed.length > 0) {
    lines.push("", `❌ Failed (${failed.length}):`);
    for (const item of failed) lines.push(describe(item));
  }

  if (skipped.length > 0) {
    lines.push("", `Not downloaded, not files (${skipped.length}):`);
    for (const item of skipped) lines.push(describe(item));
  }

  if (downloaded.length > 0) {
    lines.push("", "Read or open the paths above to see the content. Files are readable only by the signed-in user.");
  }

  return lines.join("\n");
}

export function registerDownloadMessageAttachmentsTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "download-message-attachments",
    "Download the images and files attached to one Microsoft Teams message (chat or channel) and save them to disk: pasted screenshots and pictures, and shared documents of any type (PDF, Word, Excel, PowerPoint and others) stored in OneDrive or SharePoint. Returns the saved file paths. Quoted replies, cards and plain links are listed but not downloaded.",
    downloadMessageAttachmentsSchema,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (args: {
      messageId: string;
      chatId?: string;
      teamId?: string;
      channelId?: string;
      replyId?: string;
      outputDir?: string;
    }) => {
      try {
        const result = await ctx.attachments.downloadMessageAttachments(args.messageId, args);
        return { content: [{ type: "text", text: formatAttachmentDownload(result) }] };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Failed to download message attachments: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
