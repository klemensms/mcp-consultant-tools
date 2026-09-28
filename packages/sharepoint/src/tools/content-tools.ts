/**
 * Content tools: read and edit the content of SharePoint and OneDrive files in
 * place, without a local copy. Reads are governed by SHAREPOINT_CONTENT_READ
 * (default: every format), edits by SHAREPOINT_CONTENT_WRITE (default: none).
 * Both are independent of SHAREPOINT_ENABLE_WRITE.
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (what: string, error: any) => {
  console.error(`Error: ${what}:`, error);
  return { content: [{ type: 'text', text: `Failed to ${what}: ${error.message}` }], isError: true };
};

/** Every content tool names its file the same way. */
export const itemRefShape = {
  url: z.string().optional().describe('SharePoint or OneDrive link to the file, including a sharing link (sign-in mode). Use this OR driveId and itemId.'),
  driveId: z.string().optional().describe('Drive ID (with itemId)'),
  itemId: z.string().optional().describe('Item ID (with driveId)'),
};

const refOf = ({ url, driveId, itemId }: any) => ({ url, driveId, itemId });

const READ_NOTE = ' Nothing is saved to disk. Off when SHAREPOINT_CONTENT_READ excludes the format.';
const WRITE_NOTE =
  ' Saves a new version of the same file (see its version history to roll back), and refuses if the file changed since it was read.' +
  ' Off unless SHAREPOINT_CONTENT_WRITE includes the format.';

export function registerContentTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'spo-read-text',
    'Read a text file (.txt, .md, .csv, .json, .xml, .yaml, .html) as UTF-8, with the eTag spo-write-text needs.' + READ_NOTE,
    { ...itemRefShape },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.content.text.read(refOf(args)));
      } catch (error: any) {
        return fail('read text file', error);
      }
    }
  );

  server.tool(
    'spo-write-text',
    'Replace the whole content of an existing text file. Pass the eTag from spo-read-text.' + WRITE_NOTE,
    {
      ...itemRefShape,
      content: z.string().describe('The complete new content (UTF-8)'),
      eTag: z.string().describe('eTag returned by spo-read-text'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.content.text.write(refOf(args), args.content, args.eTag));
      } catch (error: any) {
        return fail('write text file', error);
      }
    }
  );
}
