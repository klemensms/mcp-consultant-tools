import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

describe('uploadLocalFile', () => {
  let home: string;
  const mb = 1024 * 1024;

  beforeAll(() => {
    home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'upload-home-')));
    fs.mkdirSync(path.join(home, 'Documents'));
    fs.writeFileSync(path.join(home, 'Documents', 'model.xlsx'), Buffer.from([1, 2, 3, 4]));
    fs.writeFileSync(path.join(home, 'Documents', 'big.bin'), Buffer.alloc(5 * mb, 7));
    fs.mkdirSync(path.join(home, '.ssh'));
    fs.writeFileSync(path.join(home, '.ssh', 'config'), 'x');
  });
  afterAll(() => {
    fs.rmSync(home, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  function service(maxUploadSizeMB = 100) {
    const graph = recordingGraph((r) =>
      r.path.endsWith('/createUploadSession') ? { uploadUrl: 'https://upload.example/session' } : { id: 'new1', name: 'model.xlsx', size: 4 }
    );
    const spo = { getAuthenticatedGraphClient: async () => graph.client };
    const files = new FileOperationsService(spo as any, { maxDownloadSizeMB: 50, maxUploadSizeMB, downloadDir: '/tmp' });
    return { files, requests: graph.requests };
  }

  it('PUTs a small local file as its exact bytes', async () => {
    const { files, requests } = service();
    await files.uploadLocalFile('site', 'd1', '/Reports/model.xlsx', path.join(home, 'Documents', 'model.xlsx'), false, home);
    expect(decodeURIComponent(requests[0].path)).toBe('/drives/d1/root:/Reports/model.xlsx:/content');
    expect(Array.from(new Uint8Array(requests[0].body))).toEqual([1, 2, 3, 4]);
    expect(requests[0].query['@microsoft.graph.conflictBehavior']).toBe('fail');
  });

  it('sends a file over 4 MB through an upload session in ranged chunks', async () => {
    const ranges: string[] = [];
    let sent = 0;
    vi.stubGlobal('fetch', async (_url: string, init: any) => {
      ranges.push(init.headers['Content-Range']);
      sent += init.body.length;
      return new Response(JSON.stringify({ id: 'big1', name: 'big.bin' }), { status: sent === 5 * mb ? 201 : 202 });
    });
    const { files, requests } = service();
    const result = await files.uploadLocalFile('site', 'd1', '/big.bin', path.join(home, 'Documents', 'big.bin'), true, home);
    expect(requests[0].path.endsWith('/createUploadSession')).toBe(true);
    expect(requests[0].body.item['@microsoft.graph.conflictBehavior']).toBe('replace');
    expect(ranges).toEqual([`bytes 0-${3276800 - 1}/${5 * mb}`, `bytes 3276800-${5 * mb - 1}/${5 * mb}`]);
    expect(sent).toBe(5 * mb);
    expect(result.itemId).toBe('big1');
  });

  it('refuses a hidden folder and a file over the upload limit, and sends nothing', async () => {
    const { files, requests } = service(1);
    await expect(files.uploadLocalFile('site', 'd1', '/c', path.join(home, '.ssh', 'config'), false, home)).rejects.toThrow(/hidden/);
    await expect(files.uploadLocalFile('site', 'd1', '/big.bin', path.join(home, 'Documents', 'big.bin'), false, home)).rejects.toThrow(/SHAREPOINT_MAX_UPLOAD_SIZE_MB/);
    expect(requests).toHaveLength(0);
  });
});
