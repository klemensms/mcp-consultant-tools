/**
 * Outlook write and delete CLI commands (OUTLOOK_ENABLE_WRITE, OUTLOOK_ENABLE_DELETE).
 *
 * Maps mail-create-draft, mail-create-reply-draft, mail-create-forward-draft,
 * mail-update-draft, mail-add-draft-attachment, mail-mark-read,
 * mail-move-message, mail-flag-message and mail-delete-message.
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

const list = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);
const FORMAT = 'Body format: markdown (default), text or html';

function done(summary: string, data: unknown): void {
  outputResult({ fileName: 'write', data, summary, persist: false });
}

export function registerWriteCommands(program: Command, ctx: ServiceContext): void {

  // mail-create-draft
  program
    .command('draft')
    .description('Create a new draft (nothing is sent)')
    .requiredOption('--to <addresses>', 'Comma-separated addresses', list)
    .option('--cc <addresses>', 'Comma-separated addresses', list)
    .option('--bcc <addresses>', 'Comma-separated addresses', list)
    .requiredOption('--subject <subject>', 'Subject')
    .requiredOption('--body <body>', 'Body')
    .option('--format <format>', FORMAT)
    .option('--importance <level>', 'low, normal or high')
    .action(async (opts: any) => {
      try {
        const draft = await ctx.write.createDraft(opts);
        done(`Draft created: ${draft.id}\n${draft.webLink}`, draft);
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-create-reply-draft
  program
    .command('reply')
    .description('Create a reply draft with your text above the quoted thread (nothing is sent)')
    .requiredOption('--message-id <id>', 'Message to reply to')
    .requiredOption('--body <body>', 'Your reply')
    .option('--all', 'Reply to everyone')
    .option('--format <format>', FORMAT)
    .action(async (opts: any) => {
      try {
        const draft = await ctx.write.createReplyDraft({ messageId: opts.messageId, body: opts.body, replyAll: opts.all, format: opts.format });
        done(`Reply draft created: ${draft.id}\n${draft.webLink}`, draft);
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-create-forward-draft
  program
    .command('forward')
    .description('Create a forward draft (nothing is sent)')
    .requiredOption('--message-id <id>', 'Message to forward')
    .requiredOption('--to <addresses>', 'Comma-separated addresses', list)
    .option('--body <body>', 'Optional note above the forwarded message')
    .option('--format <format>', FORMAT)
    .action(async (opts: any) => {
      try {
        const draft = await ctx.write.createForwardDraft(opts);
        done(`Forward draft created: ${draft.id}\n${draft.webLink}`, draft);
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-update-draft
  program
    .command('update-draft')
    .description('Change a draft (a given body replaces the whole body)')
    .requiredOption('--draft-id <id>', 'Draft id')
    .option('--to <addresses>', 'Comma-separated addresses', list)
    .option('--cc <addresses>', 'Comma-separated addresses', list)
    .option('--bcc <addresses>', 'Comma-separated addresses', list)
    .option('--subject <subject>', 'Subject')
    .option('--body <body>', 'Body')
    .option('--format <format>', FORMAT)
    .action(async (opts: any) => {
      try {
        const result = await ctx.write.updateDraft(opts);
        done(`Draft updated: ${result.id}`, result);
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-add-draft-attachment
  program
    .command('attach')
    .description('Attach a local file from your home folder to a draft')
    .requiredOption('--draft-id <id>', 'Draft id')
    .requiredOption('--file <path>', 'Absolute path or ~/ path')
    .action(async (opts: any) => {
      try {
        const result = await ctx.write.addDraftAttachment({ draftId: opts.draftId, filePath: opts.file });
        done(`Attached ${result.name} (${result.size} bytes)`, result);
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-mark-read
  program
    .command('mark-read')
    .description('Mark a message read, or unread with --unread')
    .requiredOption('--message-id <id>', 'Message id')
    .option('--unread', 'Mark unread instead')
    .action(async (opts: any) => {
      try {
        await ctx.write.markRead(opts.messageId, !opts.unread);
        done(`Marked ${opts.unread ? 'unread' : 'read'}: ${opts.messageId}`, { messageId: opts.messageId, isRead: !opts.unread });
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-move-message
  program
    .command('move')
    .description('Move a message to a folder (well-known name or id); prints the new id')
    .requiredOption('--message-id <id>', 'Message id')
    .requiredOption('--to <folder>', 'archive, inbox, drafts, deleteditems, junkemail, or a folder id')
    .action(async (opts: any) => {
      try {
        const result = await ctx.write.moveMessage(opts.messageId, opts.to);
        done(`Moved. New id: ${result.newId}`, result);
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-flag-message
  program
    .command('flag')
    .description('Set a follow-up flag: flagged, complete or notFlagged')
    .requiredOption('--message-id <id>', 'Message id')
    .requiredOption('--flag <flag>', 'flagged, complete or notFlagged')
    .action(async (opts: any) => {
      try {
        await ctx.write.flagMessage(opts.messageId, opts.flag);
        done(`Flag set to ${opts.flag}: ${opts.messageId}`, { messageId: opts.messageId, flag: opts.flag });
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-delete-message
  program
    .command('delete')
    .description('Move a message to Deleted Items (recoverable); needs --confirm')
    .requiredOption('--message-id <id>', 'Message id')
    .option('--confirm', 'Confirm the delete')
    .action(async (opts: any) => {
      try {
        await ctx.write.deleteMessage(opts.messageId, opts.confirm === true);
        done(`Moved to Deleted Items: ${opts.messageId}`, { messageId: opts.messageId });
      } catch (error) {
        handleCliError(error);
      }
    });
}
