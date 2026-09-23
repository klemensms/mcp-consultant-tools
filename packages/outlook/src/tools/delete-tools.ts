/**
 * Outlook delete tool (OUTLOOK_ENABLE_DELETE). Moves to Deleted Items only;
 * there is no permanent delete.
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';

export function registerDeleteTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'mail-delete-message',
    'Delete a message: it moves to Deleted Items and can be recovered there. Needs confirm: true. ' +
      'Off unless OUTLOOK_ENABLE_DELETE=true.',
    {
      messageId: z.string(),
      confirm: z.boolean().describe('Must be true'),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ messageId, confirm }: any) => {
      try {
        await ctx.write.deleteMessage(messageId, confirm);
        return { content: [{ type: 'text', text: `Moved message ${messageId} to Deleted Items.` }] };
      } catch (error: any) {
        console.error('Error: delete message:', error);
        return { content: [{ type: 'text', text: `Failed to delete message: ${error.message}` }], isError: true };
      }
    }
  );
}
