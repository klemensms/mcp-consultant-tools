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

  const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

  server.tool(
    'spo-read-excel',
    'Read an Excel workbook on the server, without downloading it. Without worksheet: list the worksheets with their used ranges. ' +
      'With worksheet: values, displayed text and formulas for range (such as A1:D20), or for the used range when range is left out.' +
      ' Off when SHAREPOINT_CONTENT_READ excludes excel.',
    {
      ...itemRefShape,
      worksheet: z.string().optional().describe('Worksheet name; leave out to list the worksheets'),
      range: z.string().optional().describe('A1 range such as A1:D20; leave out for the used range'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        const ref = refOf(args);
        return json(args.worksheet ? await ctx.content.excel.readRange(ref, args.worksheet, args.range) : await ctx.content.excel.listWorksheets(ref));
      } catch (error: any) {
        return fail('read Excel workbook', error);
      }
    }
  );

  server.tool(
    'spo-write-excel',
    'Set values or formulas on a range of an Excel workbook, on the server, so co-authors see it as it happens. ' +
      'Give values or formulas as rows, matching the range: A1:B2 takes [[1, 2], [3, 4]]. Formulas start with =.' +
      ' Off unless SHAREPOINT_CONTENT_WRITE includes excel.',
    {
      ...itemRefShape,
      worksheet: z.string().describe('Worksheet name'),
      range: z.string().describe('A1 range such as B2 or A1:C3'),
      values: z.array(z.array(cell)).optional().describe('Values, one inner array per row'),
      formulas: z.array(z.array(cell)).optional().describe('Formulas, one inner array per row'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.content.excel.writeRange(refOf(args), { worksheet: args.worksheet, range: args.range, values: args.values, formulas: args.formulas }));
      } catch (error: any) {
        return fail('write Excel range', error);
      }
    }
  );

  server.tool(
    'spo-read-word',
    'Read a Word document (.docx) as Markdown: headings as #, list items as -, tables as Markdown tables. ' +
      'Each paragraph or table starts with its anchor, such as [p12], which spo-edit-word uses. Returns the eTag spo-edit-word needs.' + READ_NOTE,
    { ...itemRefShape },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.content.word.read(refOf(args)));
      } catch (error: any) {
        return fail('read Word document', error);
      }
    }
  );

  const wordOp = z.object({
    op: z.enum(['replace', 'insertAfter', 'insertBefore', 'append', 'delete']).describe('What to do'),
    text: z.string().optional().describe('replace: the text to find. insert and append: the new paragraph text (a newline starts another paragraph)'),
    replacement: z.string().optional().describe('replace: the new text'),
    all: z.boolean().optional().describe('replace: replace every match; without it a text found in more than one place is refused'),
    anchor: z.string().optional().describe('insertAfter, insertBefore, delete: the block anchor from spo-read-word, such as p12'),
    style: z.string().optional().describe('insert and append: paragraph style ID such as Heading2 or ListBullet; leave out for Normal'),
  });

  server.tool(
    'spo-edit-word',
    'Edit a Word document with a list of operations, applied in order, all or none. Anchors refer to the numbering from spo-read-word, ' +
      'even after earlier operations in the same call. Formatting outside the edited text is kept; a replacement across differently ' +
      'formatted runs takes the first run\'s formatting, and the result says so.' + WRITE_NOTE,
    {
      ...itemRefShape,
      operations: z.array(wordOp).min(1).describe('Operations, such as [{"op":"replace","text":"draft","replacement":"final"},{"op":"insertAfter","anchor":"p3","text":"New paragraph"}]'),
      eTag: z.string().describe('eTag returned by spo-read-word'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.content.word.edit(refOf(args), args.operations, args.eTag));
      } catch (error: any) {
        return fail('edit Word document', error);
      }
    }
  );

  server.tool(
    'spo-read-powerpoint',
    'Read a PowerPoint deck (.pptx): for each slide, its title, the other text on it, and its speaker notes. ' +
      'Returns the eTag spo-edit-powerpoint needs.' + READ_NOTE,
    { ...itemRefShape },
    { readOnlyHint: true, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.content.powerpoint.read(refOf(args)));
      } catch (error: any) {
        return fail('read PowerPoint deck', error);
      }
    }
  );

  server.tool(
    'spo-edit-powerpoint',
    'Replace text on the slides and in the speaker notes of a PowerPoint deck, all replacements or none. ' +
      'Formatting outside the edited text is kept; a replacement across differently formatted runs takes the first run\'s formatting, and the result says so.' +
      WRITE_NOTE,
    {
      ...itemRefShape,
      replacements: z
        .array(
          z.object({
            text: z.string().describe('The text to find'),
            replacement: z.string().describe('The new text'),
            slide: z.number().int().positive().optional().describe('Limit to this slide number (its notes included)'),
            all: z.boolean().optional().describe('Replace every match; without it a text found in more than one place is refused'),
          })
        )
        .min(1)
        .describe('Replacements, such as [{"text":"Q3","replacement":"Q4"},{"text":"draft","replacement":"final","slide":2}]'),
      eTag: z.string().describe('eTag returned by spo-read-powerpoint'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.content.powerpoint.edit(refOf(args), args.replacements, args.eTag));
      } catch (error: any) {
        return fail('edit PowerPoint deck', error);
      }
    }
  );

  server.tool(
    'spo-create-file',
    'Create a new file: a blank Word (.docx), Excel (.xlsx) or PowerPoint (.pptx) file, or a text file (.md, .txt, .csv, .json and similar) with the content given. ' +
      'Never replaces an existing file. Fill a new Office file in with spo-edit-word, spo-write-excel or spo-edit-powerpoint; ' +
      'for a richly formatted file, build it locally and use spo-upload-file with localPath. Off unless SHAREPOINT_CONTENT_WRITE includes the format.',
    {
      folderUrl: z.string().optional().describe('SharePoint or OneDrive link to the folder (sign-in mode). Use this OR driveId with folderPath.'),
      driveId: z.string().optional().describe('Drive ID (with folderPath)'),
      folderPath: z.string().optional().describe('Folder path from the drive root, such as /Reports/2026; leave out for the root'),
      fileName: z.string().describe('New file name with extension, such as Plan.docx or notes.md'),
      content: z.string().optional().describe('Text files only: the content (UTF-8)'),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (args: any) => {
      try {
        return json(await ctx.content.create.create(args));
      } catch (error: any) {
        return fail('create file', error);
      }
    }
  );
}
