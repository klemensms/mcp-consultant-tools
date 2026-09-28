import { describe, it, expect } from 'vitest';
import { ContentService } from '../services/content/content-service.js';
import { contentAccess } from '../services/content/content-access.js';
import { rangeShape } from '../services/content/excel-content.js';
import { recordingGraph, type RecordedRequest } from './graph-recorder.js';

const ITEM = { id: 'i1', name: 'Budget.xlsx', eTag: 'e1', webUrl: 'w', size: 9000, file: {}, parentReference: { driveId: 'd1' } };

function service(respond: (r: RecordedRequest) => unknown, env: Record<string, string> = {}) {
  const graph = recordingGraph((r) => (r.path === '/drives/d1/items/i1' ? ITEM : respond(r)));
  const content = new ContentService({
    spo: { getAuthenticatedGraphClient: async () => graph.client, handleError: (e: any) => e },
    resolveLink: async () => ({ driveId: 'd1', itemId: 'i1' }),
    access: contentAccess(env),
  });
  const wire = () => graph.requests.filter((r) => r.path !== '/drives/d1/items/i1').map((r) => ({ ...r, path: decodeURIComponent(r.path) }));
  return { content, wire };
}

const ref = { driveId: 'd1', itemId: 'i1' };

describe('rangeShape', () => {
  it('measures plain A1 ranges', () => {
    expect(rangeShape('B2')).toEqual({ rows: 1, columns: 1 });
    expect(rangeShape('A1:C3')).toEqual({ rows: 3, columns: 3 });
    expect(rangeShape('$AA$10:$AB$11')).toEqual({ rows: 2, columns: 2 });
    expect(rangeShape('Table1[Col]')).toBeUndefined();
  });
});

describe('Excel content', () => {
  it('reads a range through /workbook without downloading the file', async () => {
    const { content, wire } = service(() => ({ address: 'Sheet1!A1:B1', rowCount: 1, columnCount: 2, values: [[1, 2]], text: [['1', '2']], formulas: [[1, '=A1+1']] }));
    const result = await content.excel.readRange(ref, 'Sheet1', 'A1:B1');
    expect(result.formulas).toEqual([[1, '=A1+1']]);
    expect(wire().every((r) => r.path.startsWith("/drives/d1/items/i1/workbook/worksheets/Sheet1/range(address='A1:B1')"))).toBe(true);
    expect(wire().some((r) => r.path.endsWith('/content'))).toBe(false);
  });

  it("encodes a worksheet name with spaces and an apostrophe", async () => {
    const { content, wire } = service(() => ({ address: 'x', rowCount: 1, columnCount: 1, values: [[1]], text: [['1']], formulas: [[1]] }));
    await content.excel.readRange(ref, "Bob's Sheet");
    expect(wire()[0].path).toBe("/drives/d1/items/i1/workbook/worksheets/Bob's Sheet/usedRange");
  });

  it('refuses a read over the cell limit', async () => {
    const { content } = service(() => ({ address: 'Sheet1!A1:Z1000', rowCount: 1000, columnCount: 26 }));
    await expect(content.excel.readRange(ref, 'Sheet1')).rejects.toThrow(/smaller ranges/);
  });

  it('write is off by default', async () => {
    const { content, wire } = service(() => ({}));
    await expect(content.excel.writeRange(ref, { worksheet: 'Sheet1', range: 'A1', values: [[1]] })).rejects.toThrow(/SHAREPOINT_CONTENT_WRITE=excel/);
    expect(wire()).toHaveLength(0);
  });

  it('refuses a grid that does not match the range', async () => {
    const { content } = service(() => ({}), { SHAREPOINT_CONTENT_WRITE: 'excel' });
    await expect(content.excel.writeRange(ref, { worksheet: 'Sheet1', range: 'A1:B2', values: [[1, 2]] })).rejects.toThrow(/2 row\(s\) by 2 column\(s\), but 1 by 2/);
  });

  it('writes inside a persistent session and always closes it', async () => {
    const { content, wire } = service(
      (r) => (r.path.endsWith('/createSession') ? { id: 's1' } : r.method === 'PATCH' ? { address: 'Sheet1!A1', rowCount: 1, columnCount: 1, values: [[42]], formulas: [[42]] } : {}),
      { SHAREPOINT_CONTENT_WRITE: 'excel' }
    );
    const result = await content.excel.writeRange(ref, { worksheet: 'Sheet1', range: 'A1', values: [[42]] });
    expect(result.values).toEqual([[42]]);
    const [create, patch, close] = wire();
    expect(create.body).toEqual({ persistChanges: true });
    expect(patch.method).toBe('PATCH');
    expect(patch.headers['workbook-session-id']).toBe('s1');
    expect(patch.body).toEqual({ values: [[42]] });
    expect(close.path).toBe('/drives/d1/items/i1/workbook/closeSession');
  });
});
