/**
 * Chat tools - 1:1, group and meeting chats
 *
 * - list-chats:              chats the signed-in user is part of
 * - get-chat-messages:       recent messages in one chat
 * - send-chat-message:       post into an existing chat
 * - mark-chat-read:          clear a chat's unread state
 * - update-chat-message:     correct a message already sent
 * - delete-chat-message:     withdraw one that cannot be corrected
 * - undo-delete-chat-message: put a withdrawn one back
 *
 * All seven run on the consented Chat.ReadWrite scope. There is no create-chat
 * tool: Graph cannot create a chat through this endpoint, and this registration
 * cannot search the directory for people to add.
 *
 * There are no channel equivalents of the last three. The same operations against
 * a channel need ChannelMessage.ReadWrite, which is admin-consent gated and not
 * consented - see the note in services/message-service.ts.
 */

import { z } from "zod";
import type { ServiceContext, ChatInfo, MessageInfo } from "../types.js";
import {
  descWithExamples,
  CHAT_ID_EXAMPLES,
  MESSAGE_TOP_EXAMPLES,
  MESSAGE_DATE_EXAMPLES,
  MESSAGE_FORMAT_EXAMPLES,
  MESSAGE_CONTENT_EXAMPLES,
  MESSAGE_ID_EXAMPLES,
  MENTION_SYNTAX_HINT,
} from "../tool-examples.js";
import { formatChats, formatMessages } from "./format-messages.js";

const chatIdParam = z
  .string()
  .describe(descWithExamples("Chat ID. Use list-chats to find it.", CHAT_ID_EXAMPLES));

export const listChatsSchema = {
  top: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(descWithExamples("Number of chats to return, most recently active first. Defaults to 20, Graph maximum 50.", MESSAGE_TOP_EXAMPLES)),
  includeMembers: z
    .boolean()
    .optional()
    .describe("Include member display names. Useful for naming one-on-one chats, which have no topic. Graph caps members at 25 per chat."),
};

export const getChatMessagesSchema = {
  chatId: chatIdParam,
  top: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(descWithExamples("Number of messages to return, newest first. Defaults to 20, Graph maximum 50.", MESSAGE_TOP_EXAMPLES)),
  since: z
    .string()
    .optional()
    .describe(descWithExamples("Only messages modified at or after this ISO-8601 timestamp.", MESSAGE_DATE_EXAMPLES)),
  until: z
    .string()
    .optional()
    .describe(descWithExamples("Only messages modified before this ISO-8601 timestamp.", MESSAGE_DATE_EXAMPLES)),
};

export const sendChatMessageSchema = {
  chatId: chatIdParam,
  message: z.string().describe(descWithExamples("Message content (text or markdown)." + MENTION_SYNTAX_HINT, MESSAGE_CONTENT_EXAMPLES)),
  format: z
    .enum(["text", "markdown"])
    .optional()
    .default("markdown")
    .describe(descWithExamples("Message format: 'text' for plain text, 'markdown' for rich formatting", MESSAGE_FORMAT_EXAMPLES)),
};

export const markChatReadSchema = {
  chatId: chatIdParam,
};

const chatMessageIdParam = z
  .string()
  .describe(
    descWithExamples(
      "ID of the message to act on. Get it from get-chat-messages or from the result of send-chat-message.",
      MESSAGE_ID_EXAMPLES
    )
  );

export const updateChatMessageSchema = {
  chatId: chatIdParam,
  messageId: chatMessageIdParam,
  message: z
    .string()
    .describe(
      descWithExamples(
        "The replacement content, in full. This replaces the entire message body rather than patching part of it, so an @-mention in the original must be restated here or it is lost." +
          MENTION_SYNTAX_HINT,
        MESSAGE_CONTENT_EXAMPLES
      )
    ),
  format: z
    .enum(["text", "markdown"])
    .optional()
    .default("markdown")
    .describe(descWithExamples("Message format: 'text' for plain text, 'markdown' for rich formatting", MESSAGE_FORMAT_EXAMPLES)),
};

export const deleteChatMessageSchema = {
  chatId: chatIdParam,
  messageId: chatMessageIdParam,
};

export const undoDeleteChatMessageSchema = {
  chatId: chatIdParam,
  messageId: chatMessageIdParam,
};

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function registerListChatsTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "list-chats",
    "List the Microsoft Teams chats the signed-in user is part of (1:1, group and meeting chats), most recently active first. Use this to find chat IDs for get-chat-messages and send-chat-message.",
    listChatsSchema,
    { readOnlyHint: true, openWorldHint: true },
    async (args: { top?: number; includeMembers?: boolean }) => {
      try {
        const chats: ChatInfo[] = await ctx.messages.listChats(args);
        return { content: [{ type: "text", text: formatChats(chats) }] };
      } catch (error: any) {
        return errorResult(`❌ Failed to list chats: ${error.message}`);
      }
    }
  );
}

export function registerGetChatMessagesTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-chat-messages",
    "Read recent messages from a Microsoft Teams chat, newest first. Returns author, timestamp, message text and message ID for each. Defaults to the 20 most recent messages.",
    getChatMessagesSchema,
    { readOnlyHint: true, openWorldHint: true },
    async (args: { chatId: string; top?: number; since?: string; until?: string }) => {
      try {
        const messages: MessageInfo[] = await ctx.messages.getChatMessages(args.chatId, args);

        return {
          content: [
            {
              type: "text",
              text: formatMessages(messages, {
                heading: "Chat Messages",
                emptyMessage: "No messages found in this chat for the given range.",
              }),
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to read chat messages: ${error.message}`);
      }
    }
  );
}

export function registerSendChatMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "send-chat-message",
    "Send a message to an existing Microsoft Teams chat. Cannot create a new chat - use list-chats to find the ID of a chat that already exists.",
    sendChatMessageSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: { chatId: string; message: string; format?: "text" | "markdown" }) => {
      try {
        const result = await ctx.messages.sendChatMessage(args.chatId, args.message, {
          format: args.format,
        });

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Message sent to chat\n\nMessage ID: ${result.messageId}` +
                (result.webUrl ? `\nView: ${result.webUrl}` : ""),
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to send chat message: ${error.message}`);
      }
    }
  );
}

export function registerMarkChatReadTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "mark-chat-read",
    "Mark a Microsoft Teams chat as read for the signed-in user, clearing its unread state.",
    markChatReadSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: { chatId: string }) => {
      try {
        await ctx.messages.markChatRead(args.chatId);
        return {
          content: [{ type: "text", text: `✅ Chat marked as read.\n\nChat ID: ${args.chatId}` }],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to mark chat as read: ${error.message}`);
      }
    }
  );
}

export function registerUpdateChatMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "update-chat-message",
    "Correct a Microsoft Teams chat message that has already been sent, in place. Only works on messages the signed-in user sent themselves, and only in a chat - a channel message cannot be edited on the permissions this app registration holds. The replacement content is the whole new body, not a patch.",
    updateChatMessageSchema,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (args: { chatId: string; messageId: string; message: string; format?: "text" | "markdown" }) => {
      try {
        await ctx.messages.updateChatMessage(args.chatId, args.messageId, args.message, {
          format: args.format,
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ Message updated.\n\nChat ID: ${args.chatId}\nMessage ID: ${args.messageId}\n\nTeams marks an edited message as "Edited" for everyone who can see it.`,
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to update chat message: ${error.message}`);
      }
    }
  );
}

export function registerDeleteChatMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "delete-chat-message",
    "Withdraw a Microsoft Teams chat message that has already been sent. This is a soft delete and can be reversed with undo-delete-chat-message. Only works on messages the signed-in user sent themselves, and only in a chat - a channel message cannot be deleted on the permissions this app registration holds. Prefer update-chat-message when the message can be corrected rather than withdrawn.",
    deleteChatMessageSchema,
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    async (args: { chatId: string; messageId: string }) => {
      try {
        await ctx.messages.deleteChatMessage(args.chatId, args.messageId);

        return {
          content: [
            {
              type: "text",
              text: `✅ Message deleted.\n\nChat ID: ${args.chatId}\nMessage ID: ${args.messageId}\n\nThis was a soft delete - undo-delete-chat-message restores it with the same IDs.`,
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to delete chat message: ${error.message}`);
      }
    }
  );
}

export function registerUndoDeleteChatMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "undo-delete-chat-message",
    "Restore a Microsoft Teams chat message that was soft-deleted with delete-chat-message. Takes the same chat and message IDs the delete used.",
    undoDeleteChatMessageSchema,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (args: { chatId: string; messageId: string }) => {
      try {
        await ctx.messages.undoDeleteChatMessage(args.chatId, args.messageId);

        return {
          content: [
            {
              type: "text",
              text: `✅ Message restored.\n\nChat ID: ${args.chatId}\nMessage ID: ${args.messageId}`,
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to restore chat message: ${error.message}`);
      }
    }
  );
}
