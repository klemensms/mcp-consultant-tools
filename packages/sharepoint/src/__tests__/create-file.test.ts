import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { ContentService } from '../services/content/content-service.js';
import { contentAccess } from '../services/content/content-access.js';
import { blankDocx, blankPptx, blankXlsx } from '../services/content/blank-files.js';
import { recordingGraph, graphError, type RecordedRequest } from './graph-recorder.js';

function service(env: Record<string, string>, respond: (r: RecordedRequest) => unknown = (r) => ({ id: 'n1', name: decodeURIComponent(r.path).split('/').slice(-2)[0].replace(/:$/, ''), eTag: 'e1', webUrl: 'w', size: 10 })) {
  const graph = recordingGraph(respond);
  const content = new ContentService({
    spo: { getAuthenticatedGraphClient: async () => graph.client, handleError: (e: any) => e },
    resolveLink: async () => ({ driveId: 'd2', itemId: 'folder1', isFolder: true }),
    access: contentAccess(env),
  });
  return { content, requests: graph.requests };
}

/** A service whose download returns these bytes, to read a generated file back with the read tools. */
function reader(name: string, bytes: Buffer, env: Record<string, string> = {}) {
  return service(env, (r) =>
    r.path.endsWith('/content') ? new Uint8Array(bytes) : r.path.endsWith('/versions') ? { value: [] } : r.method === 'PUT' ? { id: 'i1', eTag: 'e2' } : { id: 'i1', name, eTag: 'e1', webUrl: 'w', size: bytes.length, file: {}, parentReference: { driveId: 'd1' } }
  ).content;
}

const ref = { driveId: 'd1', itemId: 'i1' };

describe('blank files', () => {
  it('a blank Word file reads as one empty paragraph and defines the heading styles', async () => {
    const content = reader('New.docx', blankDocx(), { SHAREPOINT_CONTENT_WRITE: 'word' });
    const read = await content.word.read(ref);
    expect(read.blockCount).toBe(1);
    const edit = await content.word.edit(ref, [{ op: 'append', text: 'Heading', style: 'Heading2' }, { op: 'append', text: 'Item', style: 'ListBullet' }], read.eTag);
    expect(edit.notes).toEqual([]);
  });

  it('a blank PowerPoint file has one title slide', async () => {
    const read = await reader('New.pptx', blankPptx()).powerpoint.read(ref);
    expect(read.slides).toEqual([{ number: 1, text: [], notes: [] }]);
  });

  it('a blank Excel file has one worksheet named Sheet1', () => {
    const files = unzipSync(new Uint8Array(blankXlsx()));
    expect(strFromU8(files['xl/workbook.xml'])).toContain('<sheet name="Sheet1" sheetId="1" r:id="rId1"/>');
    expect(files['xl/worksheets/sheet1.xml']).toBeDefined();
    expect(strFromU8(files['[Content_Types].xml'])).toContain('/xl/workbook.xml');
  });
});

describe('create file', () => {
  it('is off unless SHAREPOINT_CONTENT_WRITE includes the format, and sends nothing', async () => {
    const { content, requests } = service({ SHAREPOINT_CONTENT_WRITE: 'text' });
    await expect(content.create.create({ driveId: 'd1', folderPath: '/Reports', fileName: 'Plan.docx' })).rejects.toThrow(/SHAREPOINT_CONTENT_WRITE=text,word/);
    expect(requests).toHaveLength(0);
  });

  it('uploads a blank Word file by folder path and never replaces an existing file', async () => {
    const { content, requests } = service({ SHAREPOINT_CONTENT_WRITE: 'all' });
    const result = await content.create.create({ driveId: 'd1', folderPath: '/Team Reports/', fileName: 'Q3 plan.docx' });
    const put = requests[0];
    expect(put.method).toBe('PUT');
    expect(decodeURIComponent(put.path)).toBe('/drives/d1/root:/Team Reports/Q3 plan.docx:/content');
    expect(put.query['@microsoft.graph.conflictBehavior']).toBe('fail');
    expect(unzipSync(new Uint8Array(put.body))['word/document.xml']).toBeDefined();
    expect(result).toMatchObject({ itemId: 'n1', eTag: 'e1', format: 'word' });
  });

  it('writes the content of a text file, into the drive root when no folder is given', async () => {
    const { content, requests } = service({ SHAREPOINT_CONTENT_WRITE: 'text' });
    await content.create.create({ driveId: 'd1', fileName: 'notes.md', content: '# Notes' });
    expect(decodeURIComponent(requests[0].path)).toBe('/drives/d1/root:/notes.md:/content');
    expect(Buffer.from(requests[0].body).toString('utf8')).toBe('# Notes');
  });

  it('creates inside a folder named by a link', async () => {
    const { content, requests } = service({ SHAREPOINT_CONTENT_WRITE: 'excel' });
    await content.create.create({ folderUrl: 'https://contoso.sharepoint.com/sites/example/Shared%20Documents/Reports', fileName: 'Model.xlsx' });
    expect(decodeURIComponent(requests[0].path)).toBe('/drives/d2/items/folder1:/Model.xlsx:/content');
  });

  it('refuses content for an Office file, a bad name, an unknown format and a missing location', async () => {
    const { content, requests } = service({ SHAREPOINT_CONTENT_WRITE: 'all' });
    await expect(content.create.create({ driveId: 'd1', fileName: 'a.docx', content: 'x' })).rejects.toThrow(/blank/);
    await expect(content.create.create({ driveId: 'd1', fileName: 'a/b.md' })).rejects.toThrow(/file name/);
    await expect(content.create.create({ driveId: 'd1', fileName: 'a.pdf' })).rejects.toThrow(/\.pdf/);
    await expect(content.create.create({ fileName: 'a.md' })).rejects.toThrow(/driveId/);
    expect(requests).toHaveLength(0);
  });

  it('says so when the file already exists', async () => {
    const { content } = service({ SHAREPOINT_CONTENT_WRITE: 'all' }, () => graphError(409, 'nameAlreadyExists', 'exists'));
    await expect(content.create.create({ driveId: 'd1', fileName: 'a.md' })).rejects.toThrow(/already exists/);
  });
});
