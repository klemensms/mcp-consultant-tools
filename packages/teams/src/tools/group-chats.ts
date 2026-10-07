/**
 * Group chat tools - messaging several people, and adding people to chats
 *
 * - send-group-message: message several people at once, in the group chat that
 *                       holds exactly them, creating it only when there is none
 * - add-chat-member:    add one person to an existing group or meeting chat
 *
 * send-group-message does not expose its steps (resolve everyone, find or create
 * the chat, post) separately, for the same reason as send-direct-message: a
 * group chat is not deduplicated by Graph, so a caller doing the steps itself
 * would create a new thread on every send.
 */

import { z } from "zod";
import { describeUploaded } from "../services/outbound-attachments.js";
import type { ServiceContext, UserInfo } from "../types.js";
import {
  descWithExamples,
  CHAT_ID_EXAMPLES,
  USER_QUERY_EXAMPLES,
  MESSAGE_FORMAT_EXAMPLES,
  MESSAGE_CONTENT_EXAMPLES,
  MENTION_SYNTAX_HINT,
  ATTACHMENTS_DESCRIPTION,
  ATTACHMENT_PATH_EXAMPLES,
} from "../tool-examples.js";

export const sendGroupMessageSchema = {
  to: z
    .array(z.string())
    .min(2)
    .max(20)
    .describe(
      descWithExamples(
        "The people to message: two or more names or email addresses. You are included automatically. Every name must resolve to exactly one person or nothing is sent; a guest must be named by their exact email address.",
        USER_QUERY_EXAMPLES
      )
    ),
  message: z
    .string()
    .describe(descWithExamples("Message content (text or markdown)." + MENTION_SYNTAX_HINT, MESSAGE_CONTENT_EXAMPLES)),
  topic: z
    .string()
    .optional()
    .describe(
      "Optional chat name. With a topic, only a group chat of that name with exactly these people is reused, otherwise a new named chat is started. Without one, the most recently active group chat with exactly these people is reused."
    ),
  format: z
    .enum(["text", "markdown"])
    .optional()
    .default("markdown")
    .describe(descWithExamples("Message format: 'text' for plain text, 'markdown' for rich formatting", MESSAGE_FORMAT_EXAMPLES)),
  attachments: z.array(z.string()).max(10).optional().describe(descWithExamples(ATTACHMENTS_DESCRIPTION, ATTACHMENT_PATH_EXAMPLES)),
};

export const addChatMemberSchema = {
  chatId: z
    .string()
    .describe(descWithExamples("ID of the group or meeting chat to add the person to. Use list-chats to find it. A one-on-one chat is refused.", CHAT_ID_EXAMPLES)),
  person: z
    .string()
    .describe(descWithExamples("Name or email address of the person to add. A guest must be named by their exact email address.", USER_QUERY_EXAMPLES)),
  shareHistory: z
    .union([z.enum(["none", "all"]), z.number().int().min(1).max(365)])
    .optional()
    .default("none")
    .describe(
      'How much of the earlier conversation the new member can read: "none" (the default), "all", or a number of days back, 1 to 365.'
    ),
};

function who(user: UserInfo): string {
  return user.mail ? `${user.displayName} <${user.mail}>` : user.displayName;
}

function errorResult(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function registerSendGroupMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "send-group-message",
    "Send one Microsoft Teams message to several people at once, by name or email address, without needing a chat ID. Reuses the group chat that holds exactly those people and you, and only starts a new group chat when there is none. Every name must resolve to exactly one person, or nothing is created or sent and the unresolved names are listed. For one person, use send-direct-message.",
    sendGroupMessageSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: { to: string[]; message: string; topic?: string; format?: "text" | "markdown"; attachments?: string[] }) => {
      try {
        const result = await ctx.groupChats.sendGroupMessage(args.to, args.message, {
          topic: args.topic,
          format: args.format,
          attachments: args.attachments,
        });

        const chatLine = result.chatExisted
          ? "Posted into your existing group chat with exactly these people."
          : `No group chat with exactly these people${result.topic ? ` named "${result.topic}"` : ""}, so a new one was started.`;

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Group message sent to ${result.recipients.length} people\n\n` +
                result.recipients.map((r) => `- ${who(r)}`).join("\n") +
                `\n\n${chatLine}\nChat ID: ${result.chatId}\nMessage ID: ${result.messageId}` +
                (result.webUrl ? `\nView: ${result.webUrl}` : "") +
                describeUploaded(result.attachments ?? []),
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to send group message: ${error.message}`);
      }
    }
  );
}

export function registerAddChatMemberTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "add-chat-member",
    "Add a person to an existing Microsoft Teams group or meeting chat, by name or email address. By default they see no earlier messages; shareHistory can give them all of it or a number of days. A one-on-one chat cannot take a third person, so it is refused - use send-group-message with both people instead.",
    addChatMemberSchema,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (args: { chatId: string; person: string; shareHistory?: "none" | "all" | number }) => {
      try {
        const result = await ctx.groupChats.addChatMember(args.chatId, args.person, {
          shareHistory: args.shareHistory,
        });

        if (result.alreadyMember) {
          return {
            content: [{ type: "text", text: `${who(result.member)} is already in this chat. Nothing was changed.\n\nChat ID: ${result.chatId}` }],
          };
        }

        const history =
          result.history === "none"
            ? "They cannot see earlier messages."
            : result.history === "all"
              ? "They can see the whole chat history."
              : `They can see the last ${result.history} day(s) of history.`;

        return {
          content: [{ type: "text", text: `✅ Added ${who(result.member)} to the chat.\n\n${history}\nChat ID: ${result.chatId}` }],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to add chat member: ${error.message}`);
      }
    }
  );
}
