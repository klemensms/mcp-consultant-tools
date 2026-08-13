/**
 * People CLI Commands - 2 commands mapping to the people MCP tools
 *
 * CLI parity: find-user, send-direct-message.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

/** Commander gives option values as strings; the service wants a number. */
function parseCount(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${flag} must be a number, got "${value}"`);
  }
  return parsed;
}

export function registerPeopleCommands(program: Command, ctx: ServiceContext): void {
  // ── find-user ───────────────────────────────────────────────
  program
    .command('find-user')
    .description('Find people in the directory by name, email address or user principal name')
    .argument('<query>', 'Name, email address or user principal name')
    .option('-n, --top <count>', 'Number of users to return (default 10, max 25)')
    .action(async (query: string, opts: any) => {
      try {
        const users = await ctx.people.findUsers(query, { top: parseCount(opts.top, '--top') });
        const summary = users.length === 0
          ? `No users found matching "${query}".`
          : `Found ${users.length} user(s): ${users.map(u => `${u.displayName} <${u.mail ?? u.userPrincipalName ?? u.id}>`).join(' | ')}`;
        outputResult(
          { fileName: 'find-user', data: users, summary },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'find users'); }
    });

  // ── send-direct-message ─────────────────────────────────────
  program
    .command('send-direct-message')
    .description('Send a direct message to a person by name or email (reuses the existing 1:1 chat)')
    .argument('<to>', 'Name, email address or user principal name of the recipient')
    .argument('<message>', 'Message content (text or markdown). Use @[Name or email] inline to @-mention someone.')
    .option('-f, --format <format>', 'Message format: text or markdown', 'markdown')
    .action(async (to: string, message: string, opts: any) => {
      try {
        const result = await ctx.people.sendDirectMessage(to, message, { format: opts.format });
        const chatNote = result.chatExisted
          ? 'posted into the existing chat'
          : 'opened a new chat';
        outputResult(
          {
            fileName: 'send-direct-message',
            data: result,
            summary: `Direct message sent to ${result.recipient.displayName} (${chatNote}). Chat ID: ${result.chatId}. Message ID: ${result.messageId}`,
            persist: false,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'send direct message'); }
    });
}
