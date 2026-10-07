/**
 * Group chat CLI Commands - 2 commands mapping to the group chat MCP tools
 *
 * CLI parity: send-group-message, add-chat-member.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import type { ShareHistory } from '../../services/group-chat-service.js';
import { outputResult } from '../output.js';
import { describeUploaded } from '../../services/outbound-attachments.js';

/** --history takes the MCP tool's values: none, all, or a number of days. */
function parseHistory(value: string | undefined): ShareHistory | undefined {
  if (value === undefined || value === 'none' || value === 'all') {
    return value;
  }
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error(`--history must be none, all or a whole number of days from 1 to 365, got "${value}"`);
  }
  return days;
}

export function registerGroupChatCommands(program: Command, ctx: ServiceContext): void {
  // ── send-group-message ──────────────────────────────────────
  program
    .command('send-group-message')
    .description('Message several people at once, in the group chat that holds exactly them and you')
    .argument('<message>', 'Message content (text or markdown); @[Name] mentions supported')
    .requiredOption('--to <people...>', 'Two or more names or email addresses')
    .option('--topic <name>', 'Chat name; reuses only a chat of that name, otherwise starts a new named chat')
    .option('-f, --format <format>', 'text or markdown', 'markdown')
    .option('-a, --attach <paths...>', 'Local files to send with the message (inside your home folder; at most 10)')
    .action(async (message: string, opts: any) => {
      try {
        const result = await ctx.groupChats.sendGroupMessage(opts.to, message, {
          topic: opts.topic,
          format: opts.format,
          attachments: opts.attach,
        });
        const names = result.recipients.map((r) => r.displayName).join(', ');
        const summary = `Sent to ${names} in ${result.chatExisted ? 'the existing' : 'a new'} group chat ${result.chatId}.${describeUploaded(result.attachments ?? [])}`;
        outputResult(
          { fileName: 'send-group-message', data: result, summary, persist: false },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'send group message'); }
    });

  // ── add-chat-member ─────────────────────────────────────────
  program
    .command('add-chat-member')
    .description('Add a person to an existing group or meeting chat')
    .argument('<chatId>', 'Chat ID (use list-chats to find it); a one-on-one chat is refused')
    .argument('<person>', 'Name or email address of the person to add')
    .option('--history <share>', 'Earlier messages they can read: none (default), all, or a number of days', 'none')
    .action(async (chatId: string, person: string, opts: any) => {
      try {
        const result = await ctx.groupChats.addChatMember(chatId, person, {
          shareHistory: parseHistory(opts.history),
        });
        const summary = result.alreadyMember
          ? `${result.member.displayName} is already in chat ${chatId}. Nothing was changed.`
          : `Added ${result.member.displayName} to chat ${chatId} (history shared: ${result.history}).`;
        outputResult(
          { fileName: 'add-chat-member', data: result, summary, persist: false },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'add chat member'); }
    });
}
