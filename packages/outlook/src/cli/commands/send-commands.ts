/**
 * Outlook send CLI commands (OUTLOOK_ENABLE_SEND).
 *
 * Maps mail-send-draft and mail-send. Both send real mail.
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { handleCliError } from '../output.js';

const list = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

export function registerSendCommands(program: Command, ctx: ServiceContext): void {

  // mail-send-draft
  program
    .command('send-draft')
    .description('Send an existing draft (sends real mail)')
    .requiredOption('--draft-id <id>', 'Draft id')
    .action(async (opts: any) => {
      try {
        await ctx.send.sendDraft(opts.draftId);
        console.log(`Sent draft ${opts.draftId}.`);
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-send
  program
    .command('send')
    .description('Compose and send in one step, saved to Sent Items (sends real mail)')
    .requiredOption('--to <addresses>', 'Comma-separated addresses', list)
    .option('--cc <addresses>', 'Comma-separated addresses', list)
    .option('--bcc <addresses>', 'Comma-separated addresses', list)
    .requiredOption('--subject <subject>', 'Subject')
    .requiredOption('--body <body>', 'Body')
    .option('--format <format>', 'Body format: markdown (default), text or html')
    .option('--importance <level>', 'low, normal or high')
    .action(async (opts: any) => {
      try {
        await ctx.send.sendMail(opts);
        console.log(`Sent "${opts.subject}" to ${opts.to.join(', ')}.`);
      } catch (error) {
        handleCliError(error);
      }
    });
}
