/**
 * send-channel-message tool
 *
 * Sends text or markdown messages to a Teams channel.
 */

import { z } from "zod";
import { describeUploaded } from "../services/outbound-attachments.js";
import type { ServiceContext } from "../types.js";
import {
  descWithExamples,
  MESSAGE_FORMAT_EXAMPLES,
  IMPORTANCE_EXAMPLES,
  MESSAGE_CONTENT_EXAMPLES,
  MENTION_SYNTAX_HINT,
  ATTACHMENTS_DESCRIPTION,
  ATTACHMENT_PATH_EXAMPLES,
} from "../tool-examples.js";

// Input schema for send-channel-message
export const sendMessageSchema = {
  teamId: z
    .string()
    .optional()
    .describe("Team ID (optional if TEAMS_DEFAULT_TEAM_ID is set)"),
  channelId: z
    .string()
    .optional()
    .describe("Channel ID (optional if TEAMS_DEFAULT_CHANNEL_ID is set)"),
  message: z.string().describe(descWithExamples("Message content (text or markdown)." + MENTION_SYNTAX_HINT, MESSAGE_CONTENT_EXAMPLES)),
  format: z
    .enum(["text", "markdown"])
    .optional()
    .default("markdown")
    .describe(descWithExamples("Message format: 'text' for plain text, 'markdown' for rich formatting", MESSAGE_FORMAT_EXAMPLES)),
  importance: z
    .enum(["normal", "high", "urgent"])
    .optional()
    .default("normal")
    .describe(descWithExamples("Message importance level", IMPORTANCE_EXAMPLES)),
  attachments: z.array(z.string()).max(10).optional().describe(descWithExamples(ATTACHMENTS_DESCRIPTION, ATTACHMENT_PATH_EXAMPLES)),
};

/**
 * Register the send-channel-message tool
 */
export function registerSendMessageTool(
  server: any,
  ctx: ServiceContext
): void {
  server.tool(
    "send-channel-message",
    "Send a message to a Microsoft Teams channel. Supports plain text and markdown formatting.",
    sendMessageSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({
      teamId,
      channelId,
      message,
      format,
      importance,
      attachments,
    }: {
      teamId?: string;
      channelId?: string;
      message: string;
      format?: "text" | "markdown";
      importance?: "normal" | "high" | "urgent";
      attachments?: string[];
    }) => {
      try {
        // Conversion, sanitisation and @-mention resolution all happen in the
        // service, so this tool and the CLI cannot diverge on any of them.
        const result = await ctx.teams.sendChannelMessage(message, {
          teamId,
          channelId,
          format,
          importance,
          attachments,
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ Message sent successfully!\n\nMessage ID: ${result.messageId}${result.webUrl ? `\nView: ${result.webUrl}` : ""}${describeUploaded(result.attachments ?? [])}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to send message: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
