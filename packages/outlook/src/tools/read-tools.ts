/**
 * Outlook read tools. Everything read from the mailbox is untrusted: message
 * bodies are wrapped by the service, and list and search output here.
 */

import { z } from 'zod';
import { wrapUntrusted } from '../mail-content.js';
import type { ServiceContext } from '../types.js';

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const untrusted = (value: unknown, source: string) => ({
  content: [{ type: 'text', text: wrapUntrusted(JSON.stringify(value, null, 2), source) }],
});
const fail = (what: string, error: any) => {
  console.error(`Error: ${what}:`, error);
  return { content: [{ type: 'text', text: `Failed to ${what}: ${error.message}` }], isError: true };
};

export function registerReadTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'mail-list-folders',
    'List the top-level mail folders with their unread and total counts. A folder id, or a well-known name ' +
      '(inbox, archive, drafts, sentitems, deleteditems), can be passed to mail-list-messages.',
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        return json(await ctx.mail.listFolders());
      } catch (error: any) {
        return fail('list folders', error);
      }
    }
  );

  server.tool(
    'mail-list-messages',
    'List messages in a folder, newest first, as summaries (subject, sender, received time, read state, preview, id). ' +
      'Filters combine: unread only, sender, received since/until, has attachments.',
    {
      folder: z.string().optional().describe('Well-known name (inbox, archive, drafts, sentitems, deleteditems) or folder id. Default inbox'),
      top: z.number().int().min(1).max(50).optional().describe('Number of messages (default 20, max 50)'),
      unreadOnly: z.boolean().optional().describe('Only unread messages'),
      from: z.string().optional().describe('Sender email address, e.g. jdoe@example.com'),
      since: z.string().optional().describe('Received on or after, ISO date or date-time, e.g. 2026-09-01'),
      until: z.string().optional().describe('Received on or before, ISO date or date-time'),
      hasAttachments: z.boolean().optional().describe('Only messages with (true) or without (false) attachments'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        return untrusted(await ctx.mail.listMessages(args), 'mailbox message list');
      } catch (error: any) {
        return fail('list messages', error);
      }
    }
  );

  server.tool(
    'mail-search-messages',
    'Search the whole mailbox (Microsoft Search, relevance order). Supports KQL such as from:jdoe@example.com, ' +
      'subject:budget, hasattachments:true, received>=2026-09-01. Returns summaries.',
    {
      query: z.string().describe('Search text or KQL'),
      top: z.number().int().min(1).max(50).optional().describe('Number of results (default 20, max 50)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ query, top }: any) => {
      try {
        return untrusted(await ctx.mail.searchMessages(query, top), 'mailbox search results');
      } catch (error: any) {
        return fail('search messages', error);
      }
    }
  );

  server.tool(
    'mail-get-message',
    'Read one message: sender, recipients, body as readable text (links kept), and its attachment list with ids for mail-download-attachment.',
    {
      id: z.string().describe('Message id from mail-list-messages or mail-search-messages'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ id }: any) => {
      try {
        return json(await ctx.mail.getMessage(id));
      } catch (error: any) {
        return fail('read message', error);
      }
    }
  );

  server.tool(
    'mail-get-conversation',
    'Read every message in a conversation (thread), oldest first, each with its body as text and its attachment list.',
    {
      conversationId: z.string().describe('conversationId from a message summary'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ conversationId }: any) => {
      try {
        return json(await ctx.mail.getConversation(conversationId));
      } catch (error: any) {
        return fail('read conversation', error);
      }
    }
  );

  server.tool(
    'mail-download-attachment',
    'Save a file attachment to the download folder (OUTLOOK_DOWNLOAD_DIR, default ~/Downloads/mcp-outlook) and return its path. ' +
      'Never overwrites an existing file. Embedded items and cloud-file links are refused.',
    {
      messageId: z.string().describe('Message id'),
      attachmentId: z.string().describe('Attachment id from mail-get-message'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ messageId, attachmentId }: any) => {
      try {
        return json(await ctx.mail.downloadAttachment(messageId, attachmentId));
      } catch (error: any) {
        return fail('download attachment', error);
      }
    }
  );
}
