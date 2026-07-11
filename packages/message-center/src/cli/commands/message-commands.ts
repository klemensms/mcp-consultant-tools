/**
 * Message Center CLI commands — 2 commands mapping 1:1 to the m365-* message MCP tools.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import {
  parsePositiveInt,
  parseEnum,
  parseBoolean,
  truncationNote,
  MESSAGE_CATEGORIES,
  MESSAGE_SEVERITIES,
} from './helpers.js';
import type { GraphServiceUpdateMessage } from '../../models/message-center-types.js';

function summariseMessage(message: GraphServiceUpdateMessage): string {
  const major = message.isMajorChange ? ' [MAJOR]' : '';
  const services = (message.services ?? []).join(', ');
  return `  [${message.id ?? '?'}] ${message.title ?? '(no title)'}${major} | ${message.category ?? '?'} | ${services}`;
}

export function registerMessageCommands(program: Command, ctx: ServiceContext): void {
  const message = program.command('message').description('Microsoft 365 Message Center posts');

  message
    .command('list-messages')
    .description('Message Center posts (filtered client-side)')
    .option('-c, --category <category>', `Filter: ${MESSAGE_CATEGORIES.join(', ')}`)
    .option('-v, --severity <severity>', `Filter: ${MESSAGE_SEVERITIES.join(', ')}`)
    .option('-s, --service <name>', 'Substring match on an affected service name')
    .option('-M, --is-major-change <bool>', "Filter major changes: 'true' or 'false'")
    .option('-m, --max-results <count>', 'Maximum messages to return, newest first')
    .action(
      async (opts: {
        category?: string;
        severity?: string;
        service?: string;
        isMajorChange?: string;
        maxResults?: string;
      }) => {
        try {
          const result = await ctx.messages.listMessages({
            category: parseEnum(opts.category, MESSAGE_CATEGORIES, '--category'),
            severity: parseEnum(opts.severity, MESSAGE_SEVERITIES, '--severity'),
            service: opts.service,
            isMajorChange: parseBoolean(opts.isMajorChange, '--is-major-change'),
            maxResults: parsePositiveInt(opts.maxResults, '--max-results'),
          });

          outputResult(
            {
              fileName: 'm365-messages',
              data: result,
              summary: [
                `Found ${result.total} message(s)`,
                truncationNote(result.truncated),
                '',
                ...(result.messages.length === 0 ? ['  (none)'] : result.messages.map(summariseMessage)),
              ]
                .filter((line) => line !== '')
                .join('\n'),
            },
            getGlobalFlags(program)
          );
        } catch (error) {
          handleCliError(error, 'list messages');
        }
      }
    );

  message
    .command('get-message <messageId>')
    .description('Full detail for one Message Center message (e.g. MC172851)')
    .action(async (messageId: string) => {
      try {
        const msg = await ctx.messages.getMessage(messageId);
        outputResult(
          {
            fileName: `m365-message-${msg.id ?? messageId}`,
            data: msg,
            summary: [
              `Message:      ${msg.id ?? '?'} - ${msg.title ?? '(no title)'}`,
              `Category:     ${msg.category ?? '?'}`,
              `Severity:     ${msg.severity ?? '?'}`,
              `Major change: ${msg.isMajorChange ?? false}`,
              `Services:     ${(msg.services ?? []).join(', ')}`,
              `Start:        ${msg.startDateTime ?? '?'}`,
              msg.actionRequiredByDateTime ? `Action by:    ${msg.actionRequiredByDateTime}` : '',
              (msg.tags ?? []).length > 0 ? `Tags:         ${(msg.tags ?? []).join(', ')}` : '',
              `\nBody:\n${msg.body?.content ?? 'N/A'}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get message');
      }
    });
}
