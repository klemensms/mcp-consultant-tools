import { describe, it, expect } from 'vitest';
import { FileOperationsService } from '../services/file-operations-service.js';
import { recordingGraph } from './graph-recorder.js';

/**
 * Pinned against a live failure: the conflict behaviour was sent as an HTTP header named
 * "@microsoft.graph.conflictBehavior", which is not a legal header name, so every simple
 * upload threw before reaching Graph. Graph takes it as a query parameter on PUT .../content.
 */
describe('uploadFile (simple upload)', () => {
  function service() {
    const graph = recordingGraph(() => ({ id: 'new1', name: 'a.txt', size: 5, webUrl: 'https://contoso.sharepoint.com/x' }));
    const spo = { getAuthenticatedGraphClient: async () => graph.client };
    const files = new FileOperationsService(spo as any, { maxDownloadSizeMB: 50, maxUploadSizeMB: 100, downloadDir: '/tmp' });
    return { files, requests: graph.requests };
  }

  it('PUTs the bytes to the path and sends conflictBehavior=fail as a query parameter, not a header', async () => {
    const { files, requests } = service();
    const result = await files.uploadFile('site', 'd1', 'mcp-test-data/a.txt', 'hello', 'utf-8', false);
    expect(result).toMatchObject({ itemId: 'new1', name: 'a.txt' });
    expect(requests).toHaveLength(1);
    const [req] = requests;
    expect(req.method).toBe('PUT');
    expect(decodeURIComponent(req.path)).toBe('/drives/d1/root:/mcp-test-data/a.txt:/content');
    expect(req.query['@microsoft.graph.conflictBehavior']).toBe('fail');
    expect(Object.keys(req.headers).some((h) => h.toLowerCase().includes('conflictbehavior'))).toBe(false);
    expect(Buffer.from(req.body).toString('utf8')).toBe('hello');
  });

  it('overwrite sends conflictBehavior=replace', async () => {
    const { files, requests } = service();
    await files.uploadFile('site', 'd1', '/b.docx', Buffer.from('bin').toString('base64'), 'base64', true);
    expect(requests[0].query['@microsoft.graph.conflictBehavior']).toBe('replace');
    expect(Buffer.from(requests[0].body).toString('utf8')).toBe('bin');
  });
});
