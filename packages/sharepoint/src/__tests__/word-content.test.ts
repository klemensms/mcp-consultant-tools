import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { ContentService } from '../services/content/content-service.js';
import { contentAccess } from '../services/content/content-access.js';
import { recordingGraph, type RecordedRequest } from './graph-recorder.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const BODY = [
  '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Project plan</w:t></w:r></w:p>',
  '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">The budget is </w:t></w:r><w:r><w:t>ten</w:t></w:r><w:r><w:t xml:space="preserve"> thousand.</w:t></w:r></w:p>',
  '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First step</w:t></w:r></w:p>',
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Owner</w:t></w:r></w:p></w:tc></w:tr>' +
    '<w:tr><w:tc><w:p><w:r><w:t>Build</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Jane | Doe</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
  '<w:p><w:r><w:t>Closing ten words.</w:t></w:r></w:p>',
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>',
].join('');

function docx(body = BODY): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`
    ),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${W}"><w:style w:styleId="Heading1"/><w:style w:styleId="Heading2"/></w:styles>`),
    'word/media/image1.png': new Uint8Array([1, 2, 3]),
  });
}

const ITEM = { id: 'i1', name: 'Plan.docx', eTag: 'e1', webUrl: 'w', size: 100, file: {}, parentReference: { driveId: 'd1' } };

function service(env: Record<string, string> = { SHAREPOINT_CONTENT_WRITE: 'word' }, bytes = docx()) {
  const graph = recordingGraph((r: RecordedRequest) => {
    if (r.method === 'PUT') return { id: 'i1', name: 'Plan.docx', eTag: 'e2', size: 200 };
    if (r.path.endsWith('/content')) return bytes;
    if (r.path.endsWith('/versions')) return { value: [{ id: '3.0', lastModifiedDateTime: '2026-01-01T00:00:00Z' }] };
    return ITEM;
  });
  const content = new ContentService({
    spo: { getAuthenticatedGraphClient: async () => graph.client, handleError: (e: any) => e },
    resolveLink: async () => ({ driveId: 'd1', itemId: 'i1' }),
    access: contentAccess(env),
  });
  return { content, requests: graph.requests };
}

const ref = { driveId: 'd1', itemId: 'i1' };

/** The document.xml that was PUT, and the full set of zip entries. */
function written(requests: RecordedRequest[]) {
  const put = requests.find((r) => r.method === 'PUT')!;
  const files = unzipSync(new Uint8Array(put.body));
  return { xml: strFromU8(files['word/document.xml']), files };
}

describe('word read', () => {
  it('returns Markdown with an anchor per body block', async () => {
    const { content } = service();
    const result = await content.word.read(ref);
    expect(result.eTag).toBe('e1');
    expect(result.markdown).toBe(
      [
        '[p1] # Project plan',
        '[p2] The budget is ten thousand.',
        '[p3] - First step',
        '[p4]\n| Name | Owner |\n| --- | --- |\n| Build | Jane \\| Doe |',
        '[p5] Closing ten words.',
      ].join('\n\n')
    );
    expect(result.blockCount).toBe(5);
  });

  it('is refused when SHAREPOINT_CONTENT_READ excludes word', async () => {
    const { content, requests } = service({ SHAREPOINT_CONTENT_READ: 'text' });
    await expect(content.word.read(ref)).rejects.toThrow(/Reading Word files is off/);
    expect(requests).toHaveLength(0);
  });

  it('refuses a file that is not a Word document', async () => {
    const { content } = service({}, new Uint8Array([1, 2, 3]));
    await expect(content.word.read(ref)).rejects.toThrow(/not a valid Word document/);
  });
});

describe('word edit', () => {
  it('is off by default and sends nothing', async () => {
    const { content, requests } = service({});
    await expect(content.word.edit(ref, [{ op: 'append', text: 'x' }], 'e1')).rejects.toThrow(/SHAREPOINT_CONTENT_WRITE=word/);
    expect(requests).toHaveLength(0);
  });

  it('replaces text across runs, keeps the first run formatting and says so', async () => {
    const { content, requests } = service();
    const result = await content.word.edit(ref, [{ op: 'replace', text: 'budget is ten', replacement: 'cost is twelve' }], 'e1');
    const { xml } = written(requests);
    expect(xml).toContain('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">The cost is twelve</w:t></w:r><w:r><w:t xml:space="preserve"/></w:r>');
    expect(result.applied[0]).toMatch(/1 match/);
    expect(result.notes.join(' ')).toMatch(/first run's formatting/);
    expect(result.version).toBe('3.0');
    expect(requests.find((r) => r.method === 'PUT')!.headers['if-match']).toBe('e1');
  });

  it('refuses an ambiguous replace unless all is set, and writes nothing', async () => {
    const { content, requests } = service();
    await expect(content.word.edit(ref, [{ op: 'replace', text: 'ten', replacement: 'X' }], 'e1')).rejects.toThrow(/2 places/);
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('replaces every match with all, including inside tables', async () => {
    const { content, requests } = service();
    const result = await content.word.edit(ref, [{ op: 'replace', text: 'ten', replacement: 'X', all: true }, { op: 'replace', text: 'Build', replacement: 'Ship' }], 'e1');
    const { xml } = written(requests);
    expect(xml).toContain('Closing X words.');
    expect(xml).toContain('<w:t xml:space="preserve">Ship</w:t>');
    expect(result.applied[0]).toMatch(/2 matches/);
  });

  it('refuses a replace that finds nothing', async () => {
    const { content } = service();
    await expect(content.word.edit(ref, [{ op: 'replace', text: 'absent', replacement: 'X' }], 'e1')).rejects.toThrow(/not found/);
  });

  it('inserts before and after anchors with an optional style, and appends before sectPr', async () => {
    const { content, requests } = service();
    await content.word.edit(
      ref,
      [
        { op: 'insertAfter', anchor: 'p1', text: 'Intro', style: 'Heading2' },
        { op: 'insertBefore', anchor: 'p5', text: 'Line a\nLine b' },
        { op: 'append', text: 'The end & more' },
      ],
      'e1'
    );
    const { xml, files } = written(requests);
    expect(xml).toMatch(/Project plan<\/w:t><\/w:r><\/w:p><w:p><w:pPr><w:pStyle w:val="Heading2"\/><\/w:pPr><w:r><w:t xml:space="preserve">Intro<\/w:t>/);
    expect(xml).toMatch(/Line a<\/w:t><\/w:r><\/w:p><w:p><w:r><w:t xml:space="preserve">Line b<\/w:t><\/w:r><\/w:p><w:p><w:r><w:t>Closing/);
    expect(xml).toMatch(/The end &amp; more<\/w:t><\/w:r><\/w:p><w:sectPr>/);
    expect(Array.from(files['word/media/image1.png'])).toEqual([1, 2, 3]);
    expect(files['[Content_Types].xml']).toBeDefined();
  });

  it('warns when a style is not defined in the document', async () => {
    const { content } = service();
    const result = await content.word.edit(ref, [{ op: 'append', text: 'x', style: 'Fancy' }], 'e1');
    expect(result.notes.join(' ')).toMatch(/Fancy/);
  });

  it('deletes a paragraph or a table by anchor, with anchors from the read', async () => {
    const { content, requests } = service();
    await content.word.edit(ref, [{ op: 'delete', anchor: 'p2' }, { op: 'delete', anchor: 'p4' }, { op: 'insertAfter', anchor: 'p3', text: 'After list' }], 'e1');
    const { xml } = written(requests);
    expect(xml).not.toContain('budget');
    expect(xml).not.toContain('<w:tbl>');
    expect(xml).toContain('After list');
  });

  it('refuses an unknown or deleted anchor, and writes nothing', async () => {
    const { content, requests } = service();
    await expect(content.word.edit(ref, [{ op: 'delete', anchor: 'p9' }], 'e1')).rejects.toThrow(/No block p9/);
    await expect(content.word.edit(ref, [{ op: 'delete', anchor: 'p2' }, { op: 'insertAfter', anchor: 'p2', text: 'x' }], 'e1')).rejects.toThrow(/deleted/);
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('refuses an operation missing its fields', async () => {
    const { content } = service();
    await expect(content.word.edit(ref, [{ op: 'insertAfter', text: 'x' } as any], 'e1')).rejects.toThrow(/anchor/);
    await expect(content.word.edit(ref, [], 'e1')).rejects.toThrow(/at least one/);
  });
});
