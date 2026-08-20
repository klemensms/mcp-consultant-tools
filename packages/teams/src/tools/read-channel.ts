/**
 * Channel message read + reply tools
 *
 * - get-channel-messages: recent messages in a channel, without replies
 * - get-message-replies:  replies to one message
 * - reply-to-message:     post a reply into a thread
 * - update-channel-message / delete-channel-message / undo-delete-channel-message:
 *                        correct or withdraw a message already posted
 *
 * The last three need ChannelMessage.ReadWrite, which is admin-consent gated and
 * which the device-code flow deliberately never requests - see the note at the
 * top of services/message-service.ts. They work where an administrator has
 * granted it and return a clear 403 naming it where they have not.
 *
 * Reads default to 20 messages. get-channel-messages deliberately does not fetch
 * each thread's replies, so a wide skim stays cheap; use get-message-replies on
 * the ids it returns.
 */

import { z } from "zod";
import type { ServiceContext, MessageInfo } from "../types.js";
import {
  descWithExamples,
  MESSAGE_TOP_EXAMPLES,
  MESSAGE_DATE_EXAMPLES,
  MESSAGE_ID_EXAMPLES,
  MESSAGE_FORMAT_EXAMPLES,
  MESSAGE_CONTENT_EXAMPLES,
  MENTION_SYNTAX_HINT,
} from "../tool-examples.js";
import { formatMessages } from "./format-messages.js";

const topParam = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe(descWithExamples("Number of messages to return, newest first. Defaults to 20, Graph maximum 50.", MESSAGE_TOP_EXAMPLES));

const sinceParam = z
  .string()
  .optional()
  .describe(descWithExamples("Only messages modified at or after this ISO-8601 timestamp.", MESSAGE_DATE_EXAMPLES));

const untilParam = z
  .string()
  .optional()
  .describe(descWithExamples("Only messages modified before this ISO-8601 timestamp.", MESSAGE_DATE_EXAMPLES));

export const getChannelMessagesSchema = {
  teamId: z.string().optional().describe("Team ID (optional if TEAMS_DEFAULT_TEAM_ID is set). Use list-teams to find it."),
  channelId: z.string().optional().describe("Channel ID (optional if TEAMS_DEFAULT_CHANNEL_ID is set). Use list-channels to find it."),
  top: topParam,
  since: sinceParam,
  until: untilParam,
};

export const getMessageRepliesSchema = {
  messageId: z.string().describe(descWithExamples("ID of the parent message to read replies for. Get it from get-channel-messages.", MESSAGE_ID_EXAMPLES)),
  teamId: z.string().optional().describe("Team ID (optional if TEAMS_DEFAULT_TEAM_ID is set)"),
  channelId: z.string().optional().describe("Channel ID (optional if TEAMS_DEFAULT_CHANNEL_ID is set)"),
  top: topParam,
};

export const replyToMessageSchema = {
  messageId: z.string().describe(descWithExamples("ID of the message to reply to. Get it from get-channel-messages.", MESSAGE_ID_EXAMPLES)),
  message: z.string().describe(descWithExamples("Reply content (text or markdown)." + MENTION_SYNTAX_HINT, MESSAGE_CONTENT_EXAMPLES)),
  teamId: z.string().optional().describe("Team ID (optional if TEAMS_DEFAULT_TEAM_ID is set)"),
  channelId: z.string().optional().describe("Channel ID (optional if TEAMS_DEFAULT_CHANNEL_ID is set)"),
  format: z
    .enum(["text", "markdown"])
    .optional()
    .default("markdown")
    .describe(descWithExamples("Reply format: 'text' for plain text, 'markdown' for rich formatting", MESSAGE_FORMAT_EXAMPLES)),
};

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function registerGetChannelMessagesTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-channel-messages",
    "Read recent messages from a Microsoft Teams channel, newest first. Returns author, timestamp, message text and message ID for each. Does NOT include thread replies - use get-message-replies with a returned message ID for those. Defaults to the 20 most recent messages.",
    getChannelMessagesSchema,
    { readOnlyHint: true, openWorldHint: true },
    async (args: { teamId?: string; channelId?: string; top?: number; since?: string; until?: string }) => {
      try {
        const messages: MessageInfo[] = await ctx.messages.getChannelMessages(args);

        return {
          content: [
            {
              type: "text",
              text: formatMessages(messages, {
                heading: "Channel Messages",
                emptyMessage: "No messages found in this channel for the given range.",
                showReplyCount: true,
              }),
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to read channel messages: ${error.message}`);
      }
    }
  );
}

export function registerGetMessageRepliesTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-message-replies",
    "Read the replies to a specific Microsoft Teams channel message. Use the message ID returned by get-channel-messages.",
    getMessageRepliesSchema,
    { readOnlyHint: true, openWorldHint: true },
    async (args: { messageId: string; teamId?: string; channelId?: string; top?: number }) => {
      try {
        const messages: MessageInfo[] = await ctx.messages.getMessageReplies(args.messageId, args);

        return {
          content: [
            {
              type: "text",
              text: formatMessages(messages, {
                heading: `Replies to message ${args.messageId}`,
                emptyMessage: `No replies to message ${args.messageId}.`,
              }),
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to read message replies: ${error.message}`);
      }
    }
  );
}

export function registerReplyToMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "reply-to-message",
    "Post a reply to an existing message in a Microsoft Teams channel, keeping it in the same thread. Use the message ID returned by get-channel-messages.",
    replyToMessageSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: {
      messageId: string;
      message: string;
      teamId?: string;
      channelId?: string;
      format?: "text" | "markdown";
    }) => {
      try {
        const result = await ctx.messages.replyToMessage(args.messageId, args.message, {
          teamId: args.teamId,
          channelId: args.channelId,
          format: args.format,
        });

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Reply posted to message ${args.messageId}\n\n` +
                `Reply ID: ${result.messageId}` +
                (result.webUrl ? `\nView: ${result.webUrl}` : ""),
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to post reply: ${error.message}`);
      }
    }
  );
}

const editTeamIdParam = z
  .string()
  .optional()
  .describe("Team ID (optional if TEAMS_DEFAULT_TEAM_ID is set). Use list-teams to find it.");

const editChannelIdParam = z
  .string()
  .optional()
  .describe("Channel ID (optional if TEAMS_DEFAULT_CHANNEL_ID is set). Use list-channels to find it.");

const editMessageIdParam = z
  .string()
  .describe(descWithExamples("ID of the channel message. Get it from get-channel-messages.", MESSAGE_ID_EXAMPLES));

const editReplyIdParam = z
  .string()
  .optional()
  .describe(
    descWithExamples(
      "Act on this reply inside the thread instead of the parent message. Get it from get-message-replies.",
      MESSAGE_ID_EXAMPLES
    )
  );

export const updateChannelMessageSchema = {
  messageId: editMessageIdParam,
  message: z
    .string()
    .describe(
      descWithExamples(
        "The replacement content, in full. This replaces the entire message body rather than patching part of it, so an @-mention in the original must be restated here or it is lost." +
          MENTION_SYNTAX_HINT,
        MESSAGE_CONTENT_EXAMPLES
      )
    ),
  replyId: editReplyIdParam,
  teamId: editTeamIdParam,
  channelId: editChannelIdParam,
  format: z
    .enum(["text", "markdown"])
    .optional()
    .default("markdown")
    .describe(descWithExamples("Message format: 'text' for plain text, 'markdown' for rich formatting", MESSAGE_FORMAT_EXAMPLES)),
};

export const deleteChannelMessageSchema = {
  messageId: editMessageIdParam,
  replyId: editReplyIdParam,
  teamId: editTeamIdParam,
  channelId: editChannelIdParam,
};

export const undoDeleteChannelMessageSchema = deleteChannelMessageSchema;

export function registerUpdateChannelMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "update-channel-message",
    "Correct a Microsoft Teams channel message that has already been posted, in place. Works on messages the signed-in user sent themselves, and on a thread reply via replyId. The replacement content is the whole new body, not a patch. Needs the ChannelMessage.ReadWrite permission; if it is not granted the tool says so explicitly.",
    updateChannelMessageSchema,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (args: {
      messageId: string;
      message: string;
      replyId?: string;
      teamId?: string;
      channelId?: string;
      format?: "text" | "markdown";
    }) => {
      try {
        await ctx.messages.updateChannelMessage(args.messageId, args.message, {
          teamId: args.teamId,
          channelId: args.channelId,
          replyId: args.replyId,
          format: args.format,
        });

        const target = args.replyId ? `reply ${args.replyId}` : `message ${args.messageId}`;
        return {
          content: [
            {
              type: "text",
              text: `✅ Channel ${target} updated.\n\nTeams marks an edited message as "Edited" for everyone who can see it.`,
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to update channel message: ${error.message}`);
      }
    }
  );
}

export function registerDeleteChannelMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "delete-channel-message",
    "Withdraw a Microsoft Teams channel message that has already been posted. This is a soft delete and can be reversed with undo-delete-channel-message. Works on messages the signed-in user sent themselves, and on a thread reply via replyId. Prefer update-channel-message when the message can be corrected rather than withdrawn.",
    deleteChannelMessageSchema,
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    async (args: { messageId: string; replyId?: string; teamId?: string; channelId?: string }) => {
      try {
        await ctx.messages.deleteChannelMessage(args.messageId, {
          teamId: args.teamId,
          channelId: args.channelId,
          replyId: args.replyId,
        });

        const target = args.replyId ? `reply ${args.replyId}` : `message ${args.messageId}`;
        return {
          content: [
            {
              type: "text",
              text: `✅ Channel ${target} deleted.\n\nThis was a soft delete - undo-delete-channel-message restores it with the same IDs.`,
            },
          ],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to delete channel message: ${error.message}`);
      }
    }
  );
}

export function registerUndoDeleteChannelMessageTool(server: any, ctx: ServiceContext): void {
  server.tool(
    "undo-delete-channel-message",
    "Restore a Microsoft Teams channel message that was soft-deleted with delete-channel-message. Takes the same IDs the delete used.",
    undoDeleteChannelMessageSchema,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (args: { messageId: string; replyId?: string; teamId?: string; channelId?: string }) => {
      try {
        await ctx.messages.undoDeleteChannelMessage(args.messageId, {
          teamId: args.teamId,
          channelId: args.channelId,
          replyId: args.replyId,
        });

        const target = args.replyId ? `reply ${args.replyId}` : `message ${args.messageId}`;
        return {
          content: [{ type: "text", text: `✅ Channel ${target} restored.` }],
        };
      } catch (error: any) {
        return errorResult(`❌ Failed to restore channel message: ${error.message}`);
      }
    }
  );
}
