/**
 * Outlook send tools (OUTLOOK_ENABLE_SEND). Independent of the write switch.
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';

const fail = (what: string, error: any) => {
  console.error(`Error: ${what}:`, error);
  return { content: [{ type: 'text', text: `Failed to ${what}: ${error.message}` }], isError: true };
};

const OFF = ' Off unless OUTLOOK_ENABLE_SEND=true.';
const addresses = z.array(z.string()).describe('Email addresses, e.g. ["jdoe@example.com"]');

export function registerSendTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'mail-send-draft',
    'Send an existing draft by id, as the signed-in user. This sends real mail and cannot be undone.' + OFF,
    {
      draftId: z.string(),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ draftId }: any) => {
      try {
        await ctx.send.sendDraft(draftId);
        return { content: [{ type: 'text', text: `Sent draft ${draftId}.` }] };
      } catch (error: any) {
        return fail('send draft', error);
      }
    }
  );

  server.tool(
    'mail-send',
    'Compose and send a message in one call, saved to Sent Items. This sends real mail and cannot be undone; ' +
      'prefer mail-create-draft when the user should review first.' + OFF,
    {
      to: addresses,
      cc: addresses.optional(),
      bcc: addresses.optional(),
      subject: z.string(),
      body: z.string(),
      format: z.enum(['markdown', 'text', 'html']).optional().describe('Body format (default markdown). HTML is sanitised.'),
      importance: z.enum(['low', 'normal', 'high']).optional(),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        await ctx.send.sendMail(args);
        return { content: [{ type: 'text', text: `Sent "${args.subject}" to ${args.to.join(', ')}.` }] };
      } catch (error: any) {
        return fail('send mail', error);
      }
    }
  );
}
