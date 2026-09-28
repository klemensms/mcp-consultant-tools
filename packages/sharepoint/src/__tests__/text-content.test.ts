import { describe, it, expect } from 'vitest';
import { ContentService } from '../services/content/content-service.js';
import { contentAccess } from '../services/content/content-access.js';
import { recordingGraph, type RecordedRequest } from './graph-recorder.js';

const ITEM = { id: 'i1', name: 'Notes.md', eTag: 'e1', webUrl: 'w', size: 8, file: {}, parentReference: { driveId: 'd1' } };

function service(respond: (r: RecordedRequest) => unknown, env: Record<string, string> = {}) {
  const graph = recordingGraph(respond);
  const content = new ContentService({
    spo: { getAuthenticatedGraphClient: async () => graph.client, handleError: (e: any) => e },
    resolveLink: async () => ({ driveId: 'd1', itemId: 'i1' }),
    access: contentAccess(env),
  });
  return { content, requests: graph.requests };
}

describe('text content', () => {
  it('reads UTF-8 and drops a byte-order mark', async () => {
    const { content } = service((r) => (r.path.endsWith('/content') ? new Uint8Array(Buffer.from('﻿# Title', 'utf8')) : ITEM));
    const result = await content.text.read({ driveId: 'd1', itemId: 'i1' });
    expect(result).toMatchObject({ content: '# Title', eTag: 'e1', name: 'Notes.md' });
  });

  it('write is off by default and sends nothing', async () => {
    const { content, requests } = service(() => ITEM);
    await expect(content.text.write({ driveId: 'd1', itemId: 'i1' }, 'x', 'e1')).rejects.toThrow(/SHAREPOINT_CONTENT_WRITE=text/);
    expect(requests).toHaveLength(0);
  });

  it('read is refused when SHAREPOINT_CONTENT_READ excludes text', async () => {
    const { content, requests } = service(() => ITEM, { SHAREPOINT_CONTENT_READ: 'excel' });
    await expect(content.text.read({ driveId: 'd1', itemId: 'i1' })).rejects.toThrow(/Reading text files is off/);
    expect(requests).toHaveLength(0);
  });

  it('write sends the new content as UTF-8 with If-Match', async () => {
    const { content, requests } = service(
      (r) => (r.method === 'PUT' ? { id: 'i1', name: 'Notes.md', eTag: 'e2', size: 3 } : r.path.endsWith('/versions') ? { value: [] } : ITEM),
      { SHAREPOINT_CONTENT_WRITE: 'text' }
    );
    const result = await content.text.write({ driveId: 'd1', itemId: 'i1' }, 'new', 'e1');
    const put = requests.find((r) => r.method === 'PUT')!;
    expect(put.headers['if-match']).toBe('e1');
    expect(Buffer.from(put.body).toString('utf8')).toBe('new');
    expect(result.eTag).toBe('e2');
  });
});
