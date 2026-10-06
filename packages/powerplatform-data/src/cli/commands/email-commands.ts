/**
 * Email CLI Commands - 1 command mapping to the track-email MCP tool
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerEmailCommands(program: Command, ctx: ServiceContext): void {
  const email = program.command('email').description('Email tracking in Dynamics 365');

  email
    .command('track')
    .description('Track an email as a completed email activity (requires POWERPLATFORM_ENABLE_CREATE=true)')
    .argument('<internetMessageId>', 'Internet message id, e.g. <abc123@example.com>')
    .requiredOption('--from <address>', 'Sender email address')
    .option('--to <addresses...>', 'To addresses')
    .option('--cc <addresses...>', 'Cc addresses')
    .option('--bcc <addresses...>', 'Bcc addresses')
    .option('--subject <text>', 'Email subject')
    .option('--body <text>', 'Email body (HTML kept as HTML)')
    .option('--sent-on <iso>', 'When the email was sent, ISO 8601')
    .option('--direction <direction>', 'outgoing or incoming (default: outgoing when sent by the signed-in user)')
    .option('--regarding-entity <logicalName>', 'Logical name of the regarding table, e.g. opportunity')
    .option('--regarding-id <guid>', 'GUID of the regarding record')
    .option('--attach <paths...>', 'Local files to attach (text only when omitted)')
    .action(async (internetMessageId: string, opts: any) => {
      try {
        ctx.checkCreateEnabled();
        if (!!opts.regardingEntity !== !!opts.regardingId) {
          throw new Error('Pass --regarding-entity and --regarding-id together.');
        }
        if (opts.direction && !['outgoing', 'incoming'].includes(opts.direction)) {
          throw new Error('--direction must be outgoing or incoming.');
        }
        const result = await ctx.pp.trackEmail({
          internetMessageId,
          from: opts.from,
          to: opts.to,
          cc: opts.cc,
          bcc: opts.bcc,
          subject: opts.subject,
          body: opts.body,
          sentOn: opts.sentOn,
          direction: opts.direction,
          regarding: opts.regardingEntity
            ? { entityLogicalName: opts.regardingEntity, recordId: opts.regardingId }
            : undefined,
          attachments: opts.attach?.map((p: string) => ({ path: p })),
        });
        outputResult(
          {
            persist: false,
            fileName: `track-email-${result.activityId}`,
            data: result,
            summary: result.created
              ? `Email tracked as ${result.direction} email ${result.activityId}`
              : `Email already tracked as ${result.activityId}${result.regarding ? '; Regarding set' : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'track email');
      }
    });
}
