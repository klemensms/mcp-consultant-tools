/**
 * Excel cells read and written on the server through the Graph workbook API.
 * Nothing is downloaded, and co-authors see a write as it happens.
 */
import type { ContentCore, ItemRef } from './content-core.js';

/** Largest range returned in one read; ask for a smaller range above this. */
export const MAX_READ_CELLS = 10_000;

type Cell = string | number | boolean | null;

export interface WorksheetInfo {
  name: string;
  position: number;
  visibility: string;
  /** The used range, such as "Sheet1!A1:D20", or undefined for an empty sheet. */
  usedRange?: string;
}

export interface ExcelRangeResult {
  name: string;
  webUrl: string;
  worksheet: string;
  address: string;
  rowCount: number;
  columnCount: number;
  values: Cell[][];
  text: string[][];
  formulas: Cell[][];
}

export interface ExcelWriteInput {
  worksheet: string;
  range: string;
  values?: Cell[][];
  formulas?: Cell[][];
}

const sheetPath = (worksheet: string) => `worksheets/${encodeURIComponent(worksheet)}`;
const rangePath = (address: string) => `range(address='${encodeURIComponent(address)}')`;

/** Rows and columns of a plain A1 range ("B2", "A1:C3"); undefined for anything fancier. */
export function rangeShape(address: string): { rows: number; columns: number } | undefined {
  const match = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i.exec(address.trim());
  if (!match) return undefined;
  const column = (letters: string) => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const [, c1, r1, c2 = c1, r2 = r1] = match;
  return {
    rows: Math.abs(Number(r2) - Number(r1)) + 1,
    columns: Math.abs(column(c2) - column(c1)) + 1,
  };
}

export class ExcelContent {
  constructor(private readonly core: ContentCore) {}

  private base(item: { driveId: string; itemId: string }): string {
    return `/drives/${item.driveId}/items/${item.itemId}/workbook`;
  }

  /** Every worksheet with its used range. */
  async listWorksheets(ref: ItemRef): Promise<{ name: string; webUrl: string; worksheets: WorksheetInfo[] }> {
    this.core.access.checkRead('excel');
    const item = await this.core.locate(ref, ['excel']);
    try {
      const client = await this.core.client();
      const sheets = (await client.api(`${this.base(item)}/worksheets`).get())?.value ?? [];
      const worksheets: WorksheetInfo[] = [];
      for (const sheet of sheets) {
        const used = await client
          .api(`${this.base(item)}/${sheetPath(sheet.name)}/usedRange(valuesOnly=true)`)
          .select('address,rowCount,columnCount,values')
          .get();
        const empty = used?.rowCount === 1 && used?.columnCount === 1 && (used.values?.[0]?.[0] ?? '') === '';
        worksheets.push({ name: sheet.name, position: sheet.position, visibility: sheet.visibility, usedRange: empty ? undefined : used?.address });
      }
      return { name: item.name, webUrl: item.webUrl, worksheets };
    } catch (error) {
      throw this.core.fail(error, 'list worksheets');
    }
  }

  /** Values, displayed text and formulas for a range, or for the worksheet's used range. */
  async readRange(ref: ItemRef, worksheet: string, range?: string): Promise<ExcelRangeResult> {
    this.core.access.checkRead('excel');
    const item = await this.core.locate(ref, ['excel']);
    const target = range ? rangePath(range) : 'usedRange';
    let result: any;
    try {
      const client = await this.core.client();
      const url = `${this.base(item)}/${sheetPath(worksheet)}/${target}`;
      const size = await client.api(url).select('address,rowCount,columnCount').get();
      if (size.rowCount * size.columnCount > MAX_READ_CELLS) {
        throw new Error(
          `${size.address} holds ${size.rowCount * size.columnCount} cells, over the ${MAX_READ_CELLS}-cell limit for one read. ` +
            'Read it in smaller ranges.'
        );
      }
      result = await client.api(url).select('address,rowCount,columnCount,values,text,formulas').get();
    } catch (error: any) {
      if (error instanceof Error && /-cell limit/.test(error.message)) throw error;
      throw this.core.fail(error, 'read Excel range');
    }
    return {
      name: item.name,
      webUrl: item.webUrl,
      worksheet,
      address: result.address,
      rowCount: result.rowCount,
      columnCount: result.columnCount,
      values: result.values,
      text: result.text,
      formulas: result.formulas,
    };
  }

  /** Set values or formulas on a range, inside a persistent workbook session that is always closed. */
  async writeRange(ref: ItemRef, input: ExcelWriteInput): Promise<Omit<ExcelRangeResult, 'text' | 'formulas'> & { formulas: Cell[][] }> {
    this.core.access.checkWrite('excel');
    const grid = input.values ?? input.formulas;
    if (!grid || (input.values && input.formulas)) {
      throw new Error('Give values or formulas (a two-dimensional array, one inner array per row), not both.');
    }
    if (grid.length === 0 || grid.some((row) => !Array.isArray(row) || row.length !== grid[0].length)) {
      throw new Error('values and formulas must be a rectangular two-dimensional array: every row the same length.');
    }
    const shape = rangeShape(input.range);
    if (shape && (shape.rows !== grid.length || shape.columns !== grid[0].length)) {
      throw new Error(
        `Range ${input.range} is ${shape.rows} row(s) by ${shape.columns} column(s), but ${grid.length} by ${grid[0].length} were given.`
      );
    }

    const item = await this.core.locate(ref, ['excel']);
    const client = await this.core.client();
    let sessionId: string | undefined;
    try {
      sessionId = (await client.api(`${this.base(item)}/createSession`).post({ persistChanges: true }))?.id;
      const request = client.api(`${this.base(item)}/${sheetPath(input.worksheet)}/${rangePath(input.range)}`);
      if (sessionId) request.header('workbook-session-id', sessionId);
      const result = await request.patch(input.values ? { values: input.values } : { formulas: input.formulas });
      return {
        name: item.name,
        webUrl: item.webUrl,
        worksheet: input.worksheet,
        address: result.address,
        rowCount: result.rowCount,
        columnCount: result.columnCount,
        values: result.values,
        formulas: result.formulas,
      };
    } catch (error) {
      throw this.core.fail(error, 'write Excel range');
    } finally {
      if (sessionId) {
        await client
          .api(`${this.base(item)}/closeSession`)
          .header('workbook-session-id', sessionId)
          .post({})
          .catch(() => undefined);
      }
    }
  }
}
