/**
 * Outlook read CLI commands.
 *
 * Maps mail-list-folders, mail-list-messages, mail-search-messages,
 * mail-get-message, mail-get-conversation and mail-download-attachment.
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import type { MailSummary } from '../../types.js';
import { outputResult, handleCliError } from '../output.js';

const int = (value: string) => parseInt(value, 10);

function summaryLines(messages: MailSummary[]): string {
  return messages
    .map((m) => `  ${m.isRead ? ' ' : '*'} ${m.receivedDateTime}  ${m.from}  ${m.subject}${m.hasAttachments ? '  [att]' : ''}\n      id: ${m.id}`)
    .join('\n');
}

export function registerReadCommands(program: Command, ctx: ServiceContext): void {

  // mail-list-folders
  program
    .command('folders')
    .description('List top-level mail folders with unread and total counts')
    .action(async () => {
      try {
        const folders = await ctx.mail.listFolders();
        outputResult({
          fileName: 'folders',
          data: folders,
          summary: folders.map((f) => `  ${f.displayName}  (${f.unreadItemCount} unread / ${f.totalItemCount})  id: ${f.id}`).join('\n'),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-list-messages
  program
    .command('list')
    .description('List messages in a folder, newest first (* marks unread)')
    .option('--folder <folder>', 'Well-known name (inbox, archive, drafts, sentitems, deleteditems) or folder id', 'inbox')
    .option('--top <n>', 'Number of messages (default 20, max 50)', int)
    .option('--unread-only', 'Only unread messages')
    .option('--from <address>', 'Sender email address')
    .option('--since <date>', 'Received on or after (ISO date or date-time)')
    .option('--until <date>', 'Received on or before (ISO date or date-time)')
    .option('--has-attachments', 'Only messages with attachments')
    .action(async (opts: any) => {
      try {
        const messages = await ctx.mail.listMessages({
          folder: opts.folder,
          top: opts.top,
          unreadOnly: opts.unreadOnly,
          from: opts.from,
          since: opts.since,
          until: opts.until,
          hasAttachments: opts.hasAttachments,
        });
        outputResult({
          fileName: `list-${opts.folder}`,
          data: messages,
          summary: `${messages.length} message(s) in ${opts.folder}:\n${summaryLines(messages)}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-search-messages
  program
    .command('search')
    .description('Search the whole mailbox (text or KQL, relevance order)')
    .requiredOption('--query <query>', 'Search text or KQL')
    .option('--top <n>', 'Number of results (default 20, max 50)', int)
    .action(async (opts: any) => {
      try {
        const messages = await ctx.mail.searchMessages(opts.query, opts.top);
        outputResult({
          fileName: `search-${opts.query}`,
          data: messages,
          summary: `${messages.length} hit(s):\n${summaryLines(messages)}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-get-message
  program
    .command('get')
    .description('Read one message with its body as text and its attachment list')
    .requiredOption('--id <id>', 'Message id')
    .action(async (opts: any) => {
      try {
        const message = await ctx.mail.getMessage(opts.id);
        outputResult({
          fileName: `message-${opts.id}`,
          data: message,
          summary:
            `From: ${message.from}\nTo: ${message.to.join(', ')}\nSubject: ${message.subject}\nReceived: ${message.receivedDateTime}\n` +
            `Attachments: ${message.attachments.map((a) => `${a.name} (id ${a.id})`).join(', ') || 'none'}\n\n${message.bodyText}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-get-conversation
  program
    .command('thread')
    .description('Read every message in a conversation, oldest first')
    .requiredOption('--conversation-id <id>', 'conversationId from a message summary')
    .action(async (opts: any) => {
      try {
        const thread = await ctx.mail.getConversation(opts.conversationId);
        outputResult({
          fileName: `thread-${opts.conversationId}`,
          data: thread,
          summary: `${thread.length} message(s):\n` + thread.map((m) => `  ${m.receivedDateTime}  ${m.from}  ${m.subject}`).join('\n'),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-download-attachment
  program
    .command('attachment')
    .description('Save a file attachment to the download folder (never overwrites)')
    .requiredOption('--message-id <id>', 'Message id')
    .requiredOption('--attachment-id <id>', 'Attachment id from "get"')
    .action(async (opts: any) => {
      try {
        const saved = await ctx.mail.downloadAttachment(opts.messageId, opts.attachmentId);
        outputResult({
          fileName: 'attachment',
          data: saved,
          summary: `Saved ${saved.size} bytes (${saved.contentType}) to ${saved.path}`,
          persist: false,
        });
      } catch (error) {
        handleCliError(error);
      }
    });
}
