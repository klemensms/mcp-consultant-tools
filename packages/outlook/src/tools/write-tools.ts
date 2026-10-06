/**
 * Outlook draft tools (OUTLOOK_ENABLE_DRAFTS, which follows OUTLOOK_ENABLE_WRITE
 * while unset), mailbox organising (OUTLOOK_ENABLE_WRITE) and categories
 * (OUTLOOK_ENABLE_CATEGORIES). Nothing here
 * sends mail. Registered whatever the switch says, so an agent can
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
const DRAFTS_OFF = ' Off unless OUTLOOK_ENABLE_DRAFTS=true (while unset, it follows OUTLOOK_ENABLE_WRITE).';
const addresses = z.array(z.string()).describe('Email addresses, e.g. ["jdoe@example.com"]');
const format = z.enum(['markdown', 'text', 'html']).optional().describe('Body format (default markdown). HTML is sanitised.');

export function registerWriteTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'mail-create-draft',
    'Create a new draft in Drafts. Nothing is sent; review it in Outlook or send it with mail-send-draft.' + DRAFTS_OFF,
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
    'Create a reply (or reply-all) draft with your text above the quoted thread. Nothing is sent.' + DRAFTS_OFF,
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
    'Create a forward draft to new recipients, with an optional note above the forwarded message. Nothing is sent.' + DRAFTS_OFF,
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
    'Change a draft: recipients, subject or body. A given body replaces the whole body. Nothing is sent.' + DRAFTS_OFF,
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
    'Attach a file to a draft: give filePath (a local file) or url (a SharePoint or OneDrive link), not both. ' +
      'A local file must be inside your home folder; hidden folders and credential files (.env, id_*, .pem, .key, .p12, .pfx) are refused. ' +
      'A linked file is read into memory with the Outlook sign-in and never saved to disk; if the sign-in may not read it ' +
      '(needs Files.Read.All), a link to the file is put in the draft instead and the result says attached: false. ' +
      'Size cap OUTLOOK_MAX_ATTACHMENT_MB (default 25). Nothing is sent.' + DRAFTS_OFF,
    {
      draftId: z.string(),
      filePath: z.string().optional().describe('Absolute path, or a path starting with ~/'),
      url: z.string().optional().describe('SharePoint or OneDrive link, e.g. https://contoso.sharepoint.com/:w:/s/team/Abc123'),
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
    'Flag a message for follow-up, mark the flag complete, or clear it. With flag "flagged" it can also set a due date and ' +
      'a reminder. This is how to "snooze" an email or "remind me about this later": Outlook mail has no true snooze, so the ' +
      'message stays in the Inbox, flagged, and a reminder pops up at the chosen time. Times without Z or an offset are read ' +
      'in timeZone. notFlagged and complete also switch the reminder off and take no dates.' + OFF,
    {
      messageId: z.string(),
      flag: z.enum(['flagged', 'complete', 'notFlagged']),
      dueDateTime: z
        .string()
        .optional()
        .describe('Follow-up due date, ISO local date or date-time, e.g. "2026-10-10" or "2026-10-10T17:00". Only with flagged'),
      startDateTime: z
        .string()
        .optional()
        .describe('Follow-up start, ISO local date or date-time; needs dueDateTime. Default: now (or the due date if already past)'),
      timeZone: z
        .string()
        .optional()
        .describe('Zone for the dates, e.g. "Europe/London" (IANA) or "GMT Standard Time" (Windows). Default OUTLOOK_TIME_ZONE, else the machine zone'),
      reminderDateTime: z
        .string()
        .optional()
        .describe('When the reminder pops up, ISO date-time, e.g. "2026-10-10T09:00". Only with flagged'),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ messageId, flag, dueDateTime, startDateTime, timeZone, reminderDateTime }: any) => {
      try {
        return json(await ctx.write.flagMessage(messageId, flag, { dueDateTime, startDateTime, timeZone, reminderDateTime }));
      } catch (error: any) {
        return fail('flag message', error);
      }
    }
  );

  server.tool(
    'mail-set-categories',
    'Add and remove named categories on one message. Categories you do not name are kept: the current list is read and merged ' +
      'before it is written back. Names match without regard to case. Use a name from mail-list-categories; a new name is ' +
      'set on the message but gets no colour. Returns the categories before and after.' +
      ' Off unless OUTLOOK_ENABLE_CATEGORIES=true (independent of OUTLOOK_ENABLE_WRITE).',
    {
      messageId: z.string(),
      add: z.array(z.string()).optional().describe('Category names to add, e.g. ["Follow-up"]'),
      remove: z.array(z.string()).optional().describe('Category names to remove, e.g. ["Contoso"]'),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.write.setCategories(args));
      } catch (error: any) {
        return fail('set categories', error);
      }
    }
  );
}
