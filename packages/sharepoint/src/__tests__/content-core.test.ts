import { describe, it, expect } from 'vitest';
import { ContentCore } from '../services/content/content-core.js';
import { contentAccess } from '../services/content/content-access.js';
import { recordingGraph, graphError, type RecordedRequest } from './graph-recorder.js';

const ITEM = {
  id: 'i1',
  name: 'Notes.md',
  eTag: '"{AAAA},1"',
  webUrl: 'https://contoso.sharepoint.com/sites/example/Notes.md',
  size: 5,
  lastModifiedDateTime: '2026-09-28T09:00:00Z',
  file: { mimeType: 'text/markdown' },
  parentReference: { driveId: 'd1' },
};

function core(respond: (r: RecordedRequest) => unknown, env: Record<string, string> = {}) {
  const graph = recordingGraph(respond);
  const resolved: string[] = [];
  const c = new ContentCore({
    spo: { getAuthenticatedGraphClient: async () => graph.client, handleError: (e: any) => e },
    resolveLink: async (url) => {
      resolved.push(url);
      return { driveId: 'd1', itemId: 'i1' };
    },
    access: contentAccess(env),
  });
  return { core: c, requests: graph.requests, resolved };
}

describe('ContentCore.locate', () => {
  it('reads the item by ids and returns its eTag and format', async () => {
    const { core: c, requests } = core(() => ITEM);
    const item = await c.locate({ driveId: 'd1', itemId: 'i1' }, ['text']);
    expect(item).toMatchObject({ driveId: 'd1', itemId: 'i1', name: 'Notes.md', format: 'text', eTag: '"{AAAA},1"' });
    expect(requests[0].path).toBe('/drives/d1/items/i1');
    expect(requests[0].query.$select).toContain('eTag');
  });

  it('resolves a link first', async () => {
    const { core: c, resolved } = core(() => ITEM);
    await c.locate({ url: 'https://contoso.sharepoint.com/:t:/s/example/abc' }, ['text']);
    expect(resolved).toEqual(['https://contoso.sharepoint.com/:t:/s/example/abc']);
  });

  it('refuses a link and ids together, and neither', async () => {
    const { core: c } = core(() => ITEM);
    await expect(c.locate({ url: 'https://x', driveId: 'd1' }, ['text'])).rejects.toThrow(/not both/);
    await expect(c.locate({}, ['text'])).rejects.toThrow(/url/);
  });

  it('refuses a file of another format and a folder', async () => {
    const { core: c } = core(() => ({ ...ITEM, name: 'Deck.pptx' }));
    await expect(c.locate({ driveId: 'd1', itemId: 'i1' }, ['word'])).rejects.toThrow(/PowerPoint file; this tool handles Word/);
    const { core: f } = core(() => ({ ...ITEM, file: undefined, folder: { childCount: 1 } }));
    await expect(f.locate({ driveId: 'd1', itemId: 'i1' }, ['text'])).rejects.toThrow(/folder/);
  });
});

describe('ContentCore.readBytes', () => {
  it('returns the content bytes in memory', async () => {
    const { core: c, requests } = core((r) => (r.path.endsWith('/content') ? new Uint8Array(Buffer.from('hello')) : ITEM));
    const item = await c.locate({ driveId: 'd1', itemId: 'i1' }, ['text']);
    expect((await c.readBytes(item)).toString('utf8')).toBe('hello');
    expect(requests[1].path).toBe('/drives/d1/items/i1/content');
  });

  it('refuses a file over SHAREPOINT_CONTENT_MAX_MB before downloading it', async () => {
    const { core: c, requests } = core(() => ({ ...ITEM, size: 3 * 1024 * 1024 }), { SHAREPOINT_CONTENT_MAX_MB: '2' });
    const item = await c.locate({ driveId: 'd1', itemId: 'i1' }, ['text']);
    await expect(c.readBytes(item)).rejects.toThrow(/SHAREPOINT_CONTENT_MAX_MB/);
    expect(requests).toHaveLength(1);
  });
});

describe('ContentCore.writeBytes', () => {
  const item = { driveId: 'd1', itemId: 'i1', name: 'Notes.md', format: 'text' as const, eTag: '"{AAAA},1"', webUrl: 'w', size: 5 };

  it('PUTs the bytes with If-Match and reports the new eTag and version', async () => {
    const { core: c, requests } = core((r) =>
      r.method === 'PUT'
        ? { id: 'i1', name: 'Notes.md', eTag: '"{AAAA},2"', webUrl: 'w', size: 3 }
        : { value: [{ id: '1.0', lastModifiedDateTime: '2026-09-01T00:00:00Z' }, { id: '2.0', lastModifiedDateTime: '2026-09-28T00:00:00Z' }] }
    );
    const result = await c.writeBytes(item, Buffer.from('new'), '"{AAAA},1"');
    expect(requests[0].method).toBe('PUT');
    expect(requests[0].path).toBe('/drives/d1/items/i1/content');
    expect(requests[0].headers['if-match']).toBe('"{AAAA},1"');
    expect(Buffer.from(requests[0].body).toString('utf8')).toBe('new');
    expect(result).toMatchObject({ eTag: '"{AAAA},2"', version: '2.0' });
  });

  it('turns a 412 into a changed-since-read refusal', async () => {
    const { core: c } = core(() => graphError(412, 'resourceModified', 'ETag does not match'));
    await expect(c.writeBytes(item, Buffer.from('new'), '"{AAAA},1"')).rejects.toThrow(/changed since it was read/);
  });

  it('refuses a write without an eTag and sends nothing', async () => {
    const { core: c, requests } = core(() => ({}));
    await expect(c.writeBytes(item, Buffer.from('new'), '')).rejects.toThrow(/eTag is required/);
    expect(requests).toHaveLength(0);
  });
});
