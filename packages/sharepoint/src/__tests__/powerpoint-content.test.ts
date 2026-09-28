import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { ContentService } from '../services/content/content-service.js';
import { contentAccess } from '../services/content/content-access.js';
import { recordingGraph, type RecordedRequest } from './graph-recorder.js';

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const shape = (ph: string | null, paragraphs: string[]) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr>` +
  `<p:txBody><a:bodyPr/>${paragraphs.join('')}</p:txBody></p:sp>`;
const para = (...runs: string[]) => `<a:p>${runs.map((t) => `<a:r><a:rPr lang="en-GB"/><a:t>${t}</a:t></a:r>`).join('')}</a:p>`;
const slide = (shapes: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;

function pptx(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'ppt/presentation.xml': strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<Relationships xmlns="${REL}"><Relationship Id="rId3" Type="${RT}/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="${RT}/slide" Target="slides/slide2.xml"/></Relationships>`
    ),
    // slide2.xml is shown first, because presentation.xml lists rId2 first.
    'ppt/slides/slide2.xml': strToU8(slide(shape('title', [para('Intro')]) + shape(null, [para('Budget is ', 'ten', ' thousand'), para('Second point')]))),
    'ppt/slides/_rels/slide2.xml.rels': strToU8(
      `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${RT}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`
    ),
    'ppt/notesSlides/notesSlide1.xml': strToU8(
      `<p:notes ${NS}><p:cSld><p:spTree>${shape('sldImg', [])}${shape('body', [para('Say ten')])}${shape('sldNum', [para('1')])}</p:spTree></p:cSld></p:notes>`
    ),
    'ppt/slides/slide1.xml': strToU8(slide(shape('ctrTitle', [para('Close')]) + shape(null, [para('Ten out of ten')]))),
    'ppt/media/image1.png': new Uint8Array([9, 8, 7]),
  });
}

const ITEM = { id: 'i1', name: 'Deck.pptx', eTag: 'e1', webUrl: 'w', size: 100, file: {}, parentReference: { driveId: 'd1' } };

function service(env: Record<string, string> = { SHAREPOINT_CONTENT_WRITE: 'powerpoint' }) {
  const graph = recordingGraph((r: RecordedRequest) => {
    if (r.method === 'PUT') return { id: 'i1', name: 'Deck.pptx', eTag: 'e2', size: 200 };
    if (r.path.endsWith('/content')) return pptx();
    if (r.path.endsWith('/versions')) return { value: [{ id: '2.0' }] };
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

function written(requests: RecordedRequest[]) {
  const put = requests.find((r) => r.method === 'PUT')!;
  const files = unzipSync(new Uint8Array(put.body));
  const text = (path: string) => strFromU8(files[path]);
  return { files, text };
}

describe('powerpoint read', () => {
  it('returns slides in presentation order with title, text and notes', async () => {
    const { content } = service();
    const result = await content.powerpoint.read(ref);
    expect(result.eTag).toBe('e1');
    expect(result.slides).toEqual([
      { number: 1, title: 'Intro', text: ['Budget is ten thousand', 'Second point'], notes: ['Say ten'] },
      { number: 2, title: 'Close', text: ['Ten out of ten'], notes: [] },
    ]);
  });

  it('is refused when SHAREPOINT_CONTENT_READ excludes powerpoint', async () => {
    const { content, requests } = service({ SHAREPOINT_CONTENT_READ: 'word' });
    await expect(content.powerpoint.read(ref)).rejects.toThrow(/Reading PowerPoint files is off/);
    expect(requests).toHaveLength(0);
  });
});

describe('powerpoint edit', () => {
  it('is off by default and sends nothing', async () => {
    const { content, requests } = service({});
    await expect(content.powerpoint.edit(ref, [{ text: 'a', replacement: 'b' }], 'e1')).rejects.toThrow(/SHAREPOINT_CONTENT_WRITE=powerpoint/);
    expect(requests).toHaveLength(0);
  });

  it('replaces across runs on a slide and keeps the first run formatting', async () => {
    const { content, requests } = service();
    const result = await content.powerpoint.edit(ref, [{ text: 'is ten thousand', replacement: 'is twelve thousand' }], 'e1');
    const { text, files } = written(requests);
    expect(text('ppt/slides/slide2.xml')).toContain('<a:t>Budget is twelve thousand</a:t></a:r><a:r><a:rPr lang="en-GB"/><a:t/></a:r>');
    expect(text('ppt/slides/slide2.xml')).not.toContain('xml:space');
    expect(result.applied[0]).toMatch(/1 match/);
    expect(result.notes.join(' ')).toMatch(/first run's formatting/);
    expect(Array.from(files['ppt/media/image1.png'])).toEqual([9, 8, 7]);
    expect(requests.find((r) => r.method === 'PUT')!.headers['if-match']).toBe('e1');
  });

  it('counts slide text and notes together, and refuses an ambiguous replace', async () => {
    const { content, requests } = service();
    await expect(content.powerpoint.edit(ref, [{ text: 'ten', replacement: 'X' }], 'e1')).rejects.toThrow(/3 places/);
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('scopes to one slide, including its notes, and replaces all', async () => {
    const { content, requests } = service();
    const result = await content.powerpoint.edit(ref, [{ text: 'ten', replacement: 'X', slide: 1, all: true }], 'e1');
    const { text } = written(requests);
    expect(text('ppt/notesSlides/notesSlide1.xml')).toContain('Say X');
    expect(text('ppt/slides/slide1.xml')).toContain('Ten out of ten');
    expect(result.applied[0]).toMatch(/2 matches on slide 1/);
  });

  it('refuses a missing slide or a text not found', async () => {
    const { content } = service();
    await expect(content.powerpoint.edit(ref, [{ text: 'Intro', replacement: 'X', slide: 3 }], 'e1')).rejects.toThrow(/2 slides/);
    await expect(content.powerpoint.edit(ref, [{ text: 'absent', replacement: 'X' }], 'e1')).rejects.toThrow(/not found/);
  });
});
