/**
 * Content CLI commands: `mcp-spo-cli content <verb>`, one per content tool
 * (spo-read-text, spo-write-text, ...). Same settings as the MCP tools.
 */

import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

/** --url, or --drive-id with --item-id, on every content command. */
export function withItemRef(command: Command): Command {
  return command
    .option('--url <url>', 'SharePoint or OneDrive link to the file (sign-in mode)')
    .option('--drive-id <driveId>', 'Drive ID (with --item-id)')
    .option('--item-id <itemId>', 'Item ID (with --drive-id)');
}

export const refOf = (opts: any) => ({ url: opts.url, driveId: opts.driveId, itemId: opts.itemId });

/** A value given inline, or read from a local file with --<name>-file. */
export function inlineOrFile(inline: string | undefined, file: string | undefined, name: string): string {
  if (inline !== undefined && file !== undefined) throw new Error(`Give --${name} or --${name}-file, not both.`);
  if (file !== undefined) return readFileSync(file, 'utf8');
  if (inline === undefined) throw new Error(`--${name} or --${name}-file is required.`);
  return inline;
}

export function registerContentCommands(program: Command, ctx: ServiceContext): void {
  const content = program.command('content').description('Read and edit file content in place, without a local copy');

  // spo-read-text
  withItemRef(content.command('read-text').description('Read a text file as UTF-8, with its eTag'))
    .action(async (opts: any) => {
      try {
        const result = await ctx.content.text.read(refOf(opts));
        outputResult({
          fileName: `read-text-${result.name}`,
          data: result,
          summary: `${result.name} (eTag ${result.eTag})\n\n${result.content}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-write-text
  withItemRef(content.command('write-text').description('Replace the whole content of a text file'))
    .option('--content <text>', 'The complete new content')
    .option('--content-file <path>', 'Read the new content from a local file')
    .requiredOption('--etag <eTag>', 'eTag returned by read-text')
    .action(async (opts: any) => {
      try {
        const text = inlineOrFile(opts.content, opts.contentFile, 'content');
        const result = await ctx.content.text.write(refOf(opts), text, opts.etag);
        outputResult({
          fileName: `write-text-${result.name}`,
          data: result,
          summary: `Saved ${result.name}${result.version ? ` as version ${result.version}` : ''} (new eTag ${result.eTag})`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-read-excel
  withItemRef(content.command('read-excel').description('List worksheets, or read a range (values, text, formulas) on the server'))
    .option('--worksheet <name>', 'Worksheet name; leave out to list the worksheets')
    .option('--range <range>', 'A1 range; leave out for the used range')
    .action(async (opts: any) => {
      try {
        if (!opts.worksheet) {
          const result = await ctx.content.excel.listWorksheets(refOf(opts));
          outputResult({
            fileName: `read-excel-${result.name}`,
            data: result,
            summary: `${result.name}: ${result.worksheets.length} worksheet(s)\n` +
              result.worksheets.map((w) => `  - ${w.name}  ${w.usedRange ?? '(empty)'}`).join('\n'),
          });
          return;
        }
        const result = await ctx.content.excel.readRange(refOf(opts), opts.worksheet, opts.range);
        outputResult({
          fileName: `read-excel-${result.name}-${result.worksheet}`,
          data: result,
          summary: `${result.address} (${result.rowCount} x ${result.columnCount})\n` + result.text.map((row) => row.join('\t')).join('\n'),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-write-excel
  withItemRef(content.command('write-excel').description('Set values or formulas on a range, on the server'))
    .requiredOption('--worksheet <name>', 'Worksheet name')
    .requiredOption('--range <range>', 'A1 range such as B2 or A1:C3')
    .option('--values <json>', 'Values as a JSON array of rows, such as [[1,2],[3,4]]')
    .option('--formulas <json>', 'Formulas as a JSON array of rows, such as [["=A1*2"]]')
    .action(async (opts: any) => {
      try {
        const parse = (raw: string | undefined, name: string) => {
          if (raw === undefined) return undefined;
          try { return JSON.parse(raw); } catch { throw new Error(`--${name} must be a JSON array of rows.`); }
        };
        const result = await ctx.content.excel.writeRange(refOf(opts), {
          worksheet: opts.worksheet,
          range: opts.range,
          values: parse(opts.values, 'values'),
          formulas: parse(opts.formulas, 'formulas'),
        });
        outputResult({ fileName: `write-excel-${result.name}`, data: result, summary: `Wrote ${result.address} in ${result.name}` });
      } catch (error) {
        handleCliError(error);
      }
    });
}
