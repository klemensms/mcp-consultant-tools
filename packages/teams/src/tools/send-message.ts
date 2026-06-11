/**
 * send-channel-message tool
 *
 * Sends text or markdown messages to a Teams channel.
 */

import { z } from "zod";
import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ServiceContext } from "../types.js";
import {
  descWithExamples,
  MESSAGE_FORMAT_EXAMPLES,
  IMPORTANCE_EXAMPLES,
  MESSAGE_CONTENT_EXAMPLES,
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
  message: z.string().describe(descWithExamples("Message content (text or markdown)", MESSAGE_CONTENT_EXAMPLES)),
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
};

/**
 * Convert markdown to sanitized HTML for Teams
 */
function markdownToHtml(markdown: string): string {
  // Create a DOM for DOMPurify (use any to avoid complex type mismatch with JSDOM)
  const window = new JSDOM("").window;
  const purify = DOMPurify(window as any);

  // Convert markdown to HTML
  const rawHtml = marked.parse(markdown, { async: false }) as string;

  // Sanitize HTML (whitelist safe tags)
  const sanitizedHtml = purify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    ALLOWED_ATTR: ["href", "target"],
  });

  return sanitizedHtml;
}

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
    async ({
      teamId,
      channelId,
      message,
      format,
      importance,
    }: {
      teamId?: string;
      channelId?: string;
      message: string;
      format?: "text" | "markdown";
      importance?: "normal" | "high" | "urgent";
    }) => {
      try {
        const service = ctx.teams;

        // Convert markdown to HTML if needed
        let content: string;
        let contentType: "text" | "html";

        if (format === "markdown") {
          content = markdownToHtml(message);
          contentType = "html";
        } else {
          content = message;
          contentType = "text";
        }

        const result = await service.sendChannelMessage(content, {
          teamId,
          channelId,
          contentType,
          importance,
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ Message sent successfully!\n\nMessage ID: ${result.messageId}${result.webUrl ? `\nView: ${result.webUrl}` : ""}`,
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
