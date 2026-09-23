/**
 * Outlook write tools (OUTLOOK_ENABLE_WRITE): drafts and mailbox organising.
 * Nothing here sends mail. Registered whatever the switch says, so an agent can
 * see them and tell the user which variable turns them on.
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (what: string, error: any) => {
  console.error(`Error: ${what}:`, error);
  return { content: [{ type: 'text', text: `Failed to ${what}: ${error.message}` }], isError: true };
};

const OFF = ' Off unless OUTLOOK_ENABLE_WRITE=true.';
const addresses = z.array(z.string()).describe('Email addresses, e.g. ["jdoe@example.com"]');
const format = z.enum(['markdown', 'text', 'html']).optional().describe('Body format (default markdown). HTML is sanitised.');

export function registerWriteTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'mail-create-draft',
    'Create a new draft in Drafts. Nothing is sent; review it in Outlook or send it with mail-send-draft.' + OFF,
    {
      to: addresses,
      cc: addresses.optional(),
      bcc: addresses.optional(),
      subject: z.string(),
      body: z.string().describe('Message body'),
      format,
      importance: z.enum(['low', 'normal', 'high']).optional(),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.write.createDraft(args));
      } catch (error: any) {
        return fail('create draft', error);
      }
    }
  );

  server.tool(
    'mail-create-reply-draft',
    'Create a reply (or reply-all) draft with your text above the quoted thread. Nothing is sent.' + OFF,
    {
      messageId: z.string().describe('Id of the message to reply to'),
      replyAll: z.boolean().optional().describe('Reply to everyone (default false)'),
      body: z.string().describe('Your reply'),
      format,
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.write.createReplyDraft(args));
      } catch (error: any) {
        return fail('create reply draft', error);
      }
    }
  );

  server.tool(
    'mail-create-forward-draft',
    'Create a forward draft to new recipients, with an optional note above the forwarded message. Nothing is sent.' + OFF,
    {
      messageId: z.string().describe('Id of the message to forward'),
      to: addresses,
      body: z.string().optional().describe('Optional note above the forwarded message'),
      format,
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.write.createForwardDraft(args));
      } catch (error: any) {
        return fail('create forward draft', error);
      }
    }
  );

  server.tool(
    'mail-update-draft',
    'Change a draft: recipients, subject or body. A given body replaces the whole body.' + OFF,
    {
      draftId: z.string(),
      to: addresses.optional(),
      cc: addresses.optional(),
      bcc: addresses.optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      format,
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.write.updateDraft(args));
      } catch (error: any) {
        return fail('update draft', error);
      }
    }
  );

  server.tool(
    'mail-add-draft-attachment',
    'Attach a local file to a draft. The file must be inside your home folder; hidden folders and credential files ' +
      '(.env, id_*, .pem, .key, .p12, .pfx) are refused. Size cap OUTLOOK_MAX_ATTACHMENT_MB (default 25).' + OFF,
    {
      draftId: z.string(),
      filePath: z.string().describe('Absolute path, or a path starting with ~/'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.write.addDraftAttachment(args));
      } catch (error: any) {
        return fail('attach file', error);
      }
    }
  );

  server.tool(
    'mail-mark-read',
    'Mark a message read or unread.' + OFF,
    {
      messageId: z.string(),
      isRead: z.boolean(),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ messageId, isRead }: any) => {
      try {
        await ctx.write.markRead(messageId, isRead);
        return json({ messageId, isRead });
      } catch (error: any) {
        return fail('mark message', error);
      }
    }
  );

  server.tool(
    'mail-move-message',
    'Move a message to another folder. The message gets a new id, which is returned.' + OFF,
    {
      messageId: z.string(),
      destinationFolder: z.string().describe('Well-known name (archive, inbox, drafts, deleteditems, junkemail) or a folder id'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ messageId, destinationFolder }: any) => {
      try {
        return json(await ctx.write.moveMessage(messageId, destinationFolder));
      } catch (error: any) {
        return fail('move message', error);
      }
    }
  );

  server.tool(
    'mail-flag-message',
    'Flag a message for follow-up, mark the flag complete, or clear it.' + OFF,
    {
      messageId: z.string(),
      flag: z.enum(['flagged', 'complete', 'notFlagged']),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ messageId, flag }: any) => {
      try {
        await ctx.write.flagMessage(messageId, flag);
        return json({ messageId, flag });
      } catch (error: any) {
        return fail('flag message', error);
      }
    }
  );
}
