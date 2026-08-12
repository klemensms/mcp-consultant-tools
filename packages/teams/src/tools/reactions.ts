/**
 * Reaction tools - add or remove an emoji reaction on a message
 *
 * - react-to-channel-message: a channel message, or one reply within its thread
 * - react-to-chat-message:    a message in a 1:1, group or meeting chat
 *
 * Split channel/chat to match the rest of the package. Both run on already
 * consented scopes: ChannelMessage.Send for channels, Chat.ReadWrite for chats.
 */

import { z } from "zod";
import type { ReactionType, ServiceContext } from "../types.js";
import { descWithExamples, CHAT_ID_EXAMPLES, MESSAGE_ID_EXAMPLES } from "../tool-examples.js";

/** The reaction types Graph v1.0 accepts on setReaction/unsetReaction. */
const reactionTypeParam = z
  .enum(["like", "angry", "sad", "laugh", "heart", "surprised"])
  .optional()
  .default("like")
  .describe("Reaction to apply. Graph v1.0 accepts like, angry, sad, laugh, heart and surprised.");

const actionParam = z
  .enum(["add", "remove"])
  .optional()
  .default("add")
  .describe("'add' sets the reaction, 'remove' clears one previously set by the signed-in user.");

export const reactToChannelMessageSchema = {
  messageId: z
    .string()
    .describe(descWithExamples("ID of the channel message. Get it from get-channel-messages.", MESSAGE_ID_EXAMPLES)),
  replyId: z
    .string()
    .optional()
    .describe(descWithExamples("ID of a reply within that message's thread. Omit to react to the parent message itself.", MESSAGE_ID_EXAMPLES)),
  teamId: z.string().optional().describe("Team ID (optional if TEAMS_DEFAULT_TEAM_ID is set)"),
  channelId: z.string().optional().describe("Channel ID (optional if TEAMS_DEFAULT_CHANNEL_ID is set)"),
  reactionType: reactionTypeParam,
  action: actionParam,
};

export const reactToChatMessageSchema = {
  chatId: z.string().describe(descWithExamples("Chat ID. Use list-chats to find it.", CHAT_ID_EXAMPLES)),
  messageId: z
    .string()
    .describe(descWithExamples("ID of the chat message. Get it from get-chat-messages.", MESSAGE_ID_EXAMPLES)),
  reactionType: reactionTypeParam,
  action: actionParam,
};

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function successText(reactionType: string, action: string, target: string): string {
  return action === "remove"
    ? `✅ Removed ${reactionType} reaction from ${target}`
    : `✅ Reacted ${reactionType} to ${target}`;
}

export function registerReactToChannelMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "react-to-channel-message",
    "Add or remove an emoji reaction on a Microsoft Teams channel message, or on a single reply within its thread. Reactions are posted as the signed-in user.",
    reactToChannelMessageSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: {
      messageId: string;
      replyId?: string;
      teamId?: string;
      channelId?: string;
      reactionType?: ReactionType;
      action?: "add" | "remove";
    }) => {
      try {
        await ctx.messages.reactToChannelMessage(args.messageId, {
          teamId: args.teamId,
          channelId: args.channelId,
          replyId: args.replyId,
          reactionType: args.reactionType,
          action: args.action,
        });

        const target = args.replyId ? `reply ${args.replyId}` : `message ${args.messageId}`;
        return {
          content: [
            { type: "text", text: successText(args.reactionType ?? "like", args.action ?? "add", target) },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to react to channel message: ${error.message}`);
      }
    }
  );
}

export function registerReactToChatMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "react-to-chat-message",
    "Add or remove an emoji reaction on a message in a Microsoft Teams chat. Reactions are posted as the signed-in user.",
    reactToChatMessageSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: {
      chatId: string;
      messageId: string;
      reactionType?: ReactionType;
      action?: "add" | "remove";
    }) => {
      try {
        await ctx.messages.reactToChatMessage(args.chatId, args.messageId, {
          reactionType: args.reactionType,
          action: args.action,
        });

        return {
          content: [
            {
              type: "text",
              text: successText(
                args.reactionType ?? "like",
                args.action ?? "add",
                `chat message ${args.messageId}`
              ),
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to react to chat message: ${error.message}`);
      }
    }
  );
}
