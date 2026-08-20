/**
 * Read CLI Commands - 9 commands mapping to the message-read, reply, chat and
 * reaction MCP tools
 *
 * CLI parity: get-channel-messages, get-message-replies, reply-to-message,
 * list-chats, get-chat-messages, send-chat-message, mark-chat-read,
 * update-chat-message, delete-chat-message, undo-delete-chat-message,
 * update-channel-message, delete-channel-message, undo-delete-channel-message,
 * react-to-channel-message, react-to-chat-message.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

/** Commander gives option values as strings; Graph wants a number. */
function parseTop(value?: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`--top must be a number, got "${value}"`);
  }
  return parsed;
}

/** The reaction names the service knows how to map to an emoji. */
const REACTION_TYPES = ['like', 'angry', 'sad', 'laugh', 'heart', 'surprised'] as const;

/**
 * Validate --type locally rather than letting an unknown name reach Graph.
 *
 * An unmapped name resolves to `undefined` in the emoji lookup, so Graph
 * receives an empty reactionType and answers "ReactionType cannot be null or
 * whitespace" - which points at the wrong thing entirely, since the user typed
 * a word rather than leaving it blank. The MCP tools are unaffected: their zod
 * enum rejects it before the service is called.
 */
function resolveReactionType(value: string): (typeof REACTION_TYPES)[number] {
  if (!(REACTION_TYPES as readonly string[]).includes(value)) {
    throw new Error(`--type must be one of ${REACTION_TYPES.join(', ')}, got "${value}"`);
  }
  return value as (typeof REACTION_TYPES)[number];
}

/**
 * Resolve the reaction action from either spelling.
 *
 * The MCP tools take `action: "add" | "remove"` while the CLI grew a `--remove`
 * flag, so the two surfaces read differently for the same operation and
 * `--action remove` was rejected outright. Both are accepted now; `--remove`
 * wins when they disagree, since a bare flag is the more explicit of the two.
 */
function resolveReactionAction(opts: { remove?: boolean; action?: string }): 'add' | 'remove' {
  if (opts.remove) {
    return 'remove';
  }

  if (opts.action !== undefined) {
    if (opts.action !== 'add' && opts.action !== 'remove') {
      throw new Error(`--action must be "add" or "remove", got "${opts.action}"`);
    }
    return opts.action;
  }

  return 'add';
}

export function registerReadCommands(program: Command, ctx: ServiceContext): void {
  // ── get-channel-messages ────────────────────────────────────
  program
    .command('get-channel-messages')
    .description('Read recent messages from a Teams channel (newest first, replies not included)')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-n, --top <count>', 'Number of messages to return (default 20, max 50)')
    .option('--since <iso>', 'Only messages modified at or after this ISO-8601 timestamp')
    .option('--until <iso>', 'Only messages modified before this ISO-8601 timestamp')
    .action(async (opts: any) => {
      try {
        const messages = await ctx.messages.getChannelMessages({
          teamId: opts.teamId,
          channelId: opts.channelId,
          top: parseTop(opts.top),
          since: opts.since,
          until: opts.until,
        });
        const summary = messages.length === 0
          ? 'No messages found in this channel for the given range.'
          : `Found ${messages.length} message(s). Most recent from ${messages[0].authorName} at ${messages[0].createdDateTime}`;
        outputResult(
          { fileName: 'get-channel-messages', data: messages, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'read channel messages'); }
    });

  // ── get-message-replies ─────────────────────────────────────
  program
    .command('get-message-replies')
    .description('Read the replies to a specific Teams channel message')
    .argument('<messageId>', 'ID of the parent message')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-n, --top <count>', 'Number of replies to return (default 20, max 50)')
    .action(async (messageId: string, opts: any) => {
      try {
        const replies = await ctx.messages.getMessageReplies(messageId, {
          teamId: opts.teamId,
          channelId: opts.channelId,
          top: parseTop(opts.top),
        });
        const summary = replies.length === 0
          ? `No replies to message ${messageId}.`
          : `Found ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'} to message ${messageId}`;
        outputResult(
          { fileName: `get-message-replies-${messageId}`, data: replies, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'read message replies'); }
    });

  // ── reply-to-message ────────────────────────────────────────
  program
    .command('reply-to-message')
    .description('Post a reply to an existing Teams channel message')
    .argument('<messageId>', 'ID of the message to reply to')
    .argument('<message>', 'Reply content (text or markdown). Use @[Name or email] inline to @-mention someone.')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-f, --format <format>', 'Reply format: text or markdown', 'markdown')
    .action(async (messageId: string, message: string, opts: any) => {
      try {
        const result = await ctx.messages.replyToMessage(messageId, message, {
          teamId: opts.teamId,
          channelId: opts.channelId,
          format: opts.format,
        });
        outputResult(
          { fileName: 'reply-to-message', data: result, summary: `Reply posted to ${messageId}. Reply ID: ${result.messageId}`, persist: false },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'post reply'); }
    });

  // ── list-chats ──────────────────────────────────────────────
  program
    .command('list-chats')
    .description('List the Teams chats the signed-in user is part of')
    .option('-n, --top <count>', 'Number of chats to return (default 20, max 50)')
    .option('-m, --members', 'Include member display names (max 25 per chat)')
    .action(async (opts: any) => {
      try {
        const chats = await ctx.messages.listChats({
          top: parseTop(opts.top),
          includeMembers: opts.members,
        });
        const summary = chats.length === 0
          ? 'No chats found.'
          : `Found ${chats.length} chat(s): ${chats.map(c => c.topic || c.memberNames?.join(', ') || c.chatType).join(' | ')}`;
        outputResult(
          { fileName: 'list-chats', data: chats, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list chats'); }
    });

  // ── get-chat-messages ───────────────────────────────────────
  program
    .command('get-chat-messages')
    .description('Read recent messages from a Teams chat (newest first)')
    .argument('<chatId>', 'Chat ID (use list-chats to find it)')
    .option('-n, --top <count>', 'Number of messages to return (default 20, max 50)')
    .option('--since <iso>', 'Only messages modified at or after this ISO-8601 timestamp')
    .option('--until <iso>', 'Only messages modified before this ISO-8601 timestamp')
    .action(async (chatId: string, opts: any) => {
      try {
        const messages = await ctx.messages.getChatMessages(chatId, {
          top: parseTop(opts.top),
          since: opts.since,
          until: opts.until,
        });
        const summary = messages.length === 0
          ? 'No messages found in this chat for the given range.'
          : `Found ${messages.length} message(s). Most recent from ${messages[0].authorName} at ${messages[0].createdDateTime}`;
        outputResult(
          { fileName: 'get-chat-messages', data: messages, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'read chat messages'); }
    });

  // ── send-chat-message ───────────────────────────────────────
  program
    .command('send-chat-message')
    .description('Send a message to an existing Teams chat')
    .argument('<chatId>', 'Chat ID (use list-chats to find it)')
    .argument('<message>', 'Message content (text or markdown). Use @[Name or email] inline to @-mention someone.')
    .option('-f, --format <format>', 'Message format: text or markdown', 'markdown')
    .action(async (chatId: string, message: string, opts: any) => {
      try {
        const result = await ctx.messages.sendChatMessage(chatId, message, { format: opts.format });
        outputResult(
          { fileName: 'send-chat-message', data: result, summary: `Message sent to chat. ID: ${result.messageId}`, persist: false },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'send chat message'); }
    });

  // ── mark-chat-read ──────────────────────────────────────────
  program
    .command('mark-chat-read')
    .description('Mark a Teams chat as read for the signed-in user')
    .argument('<chatId>', 'Chat ID (use list-chats to find it)')
    .action(async (chatId: string) => {
      try {
        await ctx.messages.markChatRead(chatId);
        outputResult(
          { fileName: 'mark-chat-read', data: { chatId, status: 'read' }, summary: `Chat ${chatId} marked as read.`, persist: false },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'mark chat as read'); }
    });

  // ── update-channel-message ──────────────────────────────────
  program
    .command('update-channel-message')
    .description('Correct a channel message already posted, in place (needs ChannelMessage.ReadWrite)')
    .argument('<messageId>', 'ID of the channel message (from get-channel-messages)')
    .argument('<message>', 'Replacement content in full - this replaces the whole body, so restate any @[Name or email] mention')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-r, --reply-id <id>', 'Correct this reply inside the thread instead of the parent message')
    .option('-f, --format <format>', 'Message format: text or markdown', 'markdown')
    .action(async (messageId: string, message: string, opts: any) => {
      try {
        await ctx.messages.updateChannelMessage(messageId, message, {
          teamId: opts.teamId, channelId: opts.channelId, replyId: opts.replyId, format: opts.format,
        });
        outputResult(
          {
            fileName: 'update-channel-message',
            data: { messageId, replyId: opts.replyId, status: 'updated' },
            summary: `Channel ${opts.replyId ? `reply ${opts.replyId}` : `message ${messageId}`} updated. Teams marks it as "Edited" for everyone who can see it.`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update channel message'); }
    });

  // ── delete-channel-message ──────────────────────────────────
  program
    .command('delete-channel-message')
    .description('Withdraw a channel message already posted - soft delete, reversible (needs ChannelMessage.ReadWrite)')
    .argument('<messageId>', 'ID of the channel message (from get-channel-messages)')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-r, --reply-id <id>', 'Withdraw this reply inside the thread instead of the parent message')
    .action(async (messageId: string, opts: any) => {
      try {
        await ctx.messages.deleteChannelMessage(messageId, {
          teamId: opts.teamId, channelId: opts.channelId, replyId: opts.replyId,
        });
        outputResult(
          {
            fileName: 'delete-channel-message',
            data: { messageId, replyId: opts.replyId, status: 'deleted' },
            summary: `Channel ${opts.replyId ? `reply ${opts.replyId}` : `message ${messageId}`} deleted. Reversible with undo-delete-channel-message.`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete channel message'); }
    });

  // ── undo-delete-channel-message ─────────────────────────────
  program
    .command('undo-delete-channel-message')
    .description('Restore a channel message that was soft-deleted')
    .argument('<messageId>', 'ID of the deleted channel message')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-r, --reply-id <id>', 'Restore this reply inside the thread instead of the parent message')
    .action(async (messageId: string, opts: any) => {
      try {
        await ctx.messages.undoDeleteChannelMessage(messageId, {
          teamId: opts.teamId, channelId: opts.channelId, replyId: opts.replyId,
        });
        outputResult(
          {
            fileName: 'undo-delete-channel-message',
            data: { messageId, replyId: opts.replyId, status: 'restored' },
            summary: `Channel ${opts.replyId ? `reply ${opts.replyId}` : `message ${messageId}`} restored.`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'restore channel message'); }
    });

  // ── update-chat-message ─────────────────────────────────────
  program
    .command('update-chat-message')
    .description('Correct a chat message already sent, in place (own messages, chats only)')
    .argument('<chatId>', 'Chat ID (use list-chats to find it)')
    .argument('<messageId>', 'ID of the message to correct (from get-chat-messages)')
    .argument('<message>', 'Replacement content in full - this replaces the whole body, so restate any @[Name or email] mention')
    .option('-f, --format <format>', 'Message format: text or markdown', 'markdown')
    .action(async (chatId: string, messageId: string, message: string, opts: any) => {
      try {
        await ctx.messages.updateChatMessage(chatId, messageId, message, { format: opts.format });
        outputResult(
          {
            fileName: 'update-chat-message',
            data: { chatId, messageId, status: 'updated' },
            summary: `Message ${messageId} updated. Teams marks it as "Edited" for everyone who can see it.`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update chat message'); }
    });

  // ── delete-chat-message ─────────────────────────────────────
  program
    .command('delete-chat-message')
    .description('Withdraw a chat message already sent - soft delete, reversible (own messages, chats only)')
    .argument('<chatId>', 'Chat ID (use list-chats to find it)')
    .argument('<messageId>', 'ID of the message to withdraw (from get-chat-messages)')
    .action(async (chatId: string, messageId: string) => {
      try {
        await ctx.messages.deleteChatMessage(chatId, messageId);
        outputResult(
          {
            fileName: 'delete-chat-message',
            data: { chatId, messageId, status: 'deleted' },
            summary: `Message ${messageId} deleted. Reversible with: undo-delete-chat-message ${chatId} ${messageId}`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete chat message'); }
    });

  // ── undo-delete-chat-message ────────────────────────────────
  program
    .command('undo-delete-chat-message')
    .description('Restore a chat message that was soft-deleted')
    .argument('<chatId>', 'Chat ID (use list-chats to find it)')
    .argument('<messageId>', 'ID of the deleted message')
    .action(async (chatId: string, messageId: string) => {
      try {
        await ctx.messages.undoDeleteChatMessage(chatId, messageId);
        outputResult(
          {
            fileName: 'undo-delete-chat-message',
            data: { chatId, messageId, status: 'restored' },
            summary: `Message ${messageId} restored.`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'restore chat message'); }
    });

  // ── react-to-channel-message ────────────────────────────────
  program
    .command('react-to-channel-message')
    .description('Add or remove an emoji reaction on a Teams channel message or thread reply')
    .argument('<messageId>', 'ID of the channel message')
    .option('-t, --team-id <id>', 'Team ID (uses TEAMS_DEFAULT_TEAM_ID if not set)')
    .option('-c, --channel-id <id>', 'Channel ID (uses TEAMS_DEFAULT_CHANNEL_ID if not set)')
    .option('-r, --reply-id <id>', 'React to this reply within the message thread instead of the parent')
    .option('--type <reaction>', 'Reaction: like, angry, sad, laugh, heart or surprised', 'like')
    .option('--remove', 'Remove the reaction instead of adding it')
    .option('--action <action>', "'add' or 'remove' - the same as --remove, named to match the MCP tool")
    .action(async (messageId: string, opts: any) => {
      try {
        const action = resolveReactionAction(opts);
        const reactionType = resolveReactionType(opts.type);
        await ctx.messages.reactToChannelMessage(messageId, {
          teamId: opts.teamId,
          channelId: opts.channelId,
          replyId: opts.replyId,
          reactionType,
          action,
        });
        const target = opts.replyId ? `reply ${opts.replyId}` : `message ${messageId}`;
        outputResult(
          {
            fileName: 'react-to-channel-message',
            data: { messageId, replyId: opts.replyId, reactionType: opts.type, action },
            summary: `${action === 'remove' ? 'Removed' : 'Added'} ${opts.type} reaction on ${target}.`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'react to channel message'); }
    });

  // ── react-to-chat-message ───────────────────────────────────
  program
    .command('react-to-chat-message')
    .description('Add or remove an emoji reaction on a Teams chat message')
    .argument('<chatId>', 'Chat ID (use list-chats to find it)')
    .argument('<messageId>', 'ID of the chat message')
    .option('--type <reaction>', 'Reaction: like, angry, sad, laugh, heart or surprised', 'like')
    .option('--remove', 'Remove the reaction instead of adding it')
    .option('--action <action>', "'add' or 'remove' - the same as --remove, named to match the MCP tool")
    .action(async (chatId: string, messageId: string, opts: any) => {
      try {
        const action = resolveReactionAction(opts);
        const reactionType = resolveReactionType(opts.type);
        await ctx.messages.reactToChatMessage(chatId, messageId, {
          reactionType,
          action,
        });
        outputResult(
          {
            fileName: 'react-to-chat-message',
            data: { chatId, messageId, reactionType: opts.type, action },
            summary: `${action === 'remove' ? 'Removed' : 'Added'} ${opts.type} reaction on chat message ${messageId}.`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'react to chat message'); }
    });
}
