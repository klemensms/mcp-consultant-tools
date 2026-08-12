/**
 * Read CLI Commands - 7 commands mapping to the message-read, reply and chat MCP tools
 *
 * CLI parity: get-channel-messages, get-message-replies, reply-to-message,
 * list-chats, get-chat-messages, send-chat-message, mark-chat-read.
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
    .argument('<message>', 'Reply content (text or markdown)')
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
          { fileName: 'reply-to-message', data: result, summary: `Reply posted to ${messageId}. Reply ID: ${result.messageId}` },
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
    .argument('<message>', 'Message content (text or markdown)')
    .option('-f, --format <format>', 'Message format: text or markdown', 'markdown')
    .action(async (chatId: string, message: string, opts: any) => {
      try {
        const result = await ctx.messages.sendChatMessage(chatId, message, { format: opts.format });
        outputResult(
          { fileName: 'send-chat-message', data: result, summary: `Message sent to chat. ID: ${result.messageId}` },
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
          { fileName: 'mark-chat-read', data: { chatId, status: 'read' }, summary: `Chat ${chatId} marked as read.` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'mark chat as read'); }
    });
}
