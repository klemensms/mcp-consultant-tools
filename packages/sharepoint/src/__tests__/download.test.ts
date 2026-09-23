import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileOperationsService } from '../services/file-operations-service.js';
import { fakeGraph } from './fake-graph.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('downloadFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-download-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function files(name: string, mimeType: string, content = 'file-bytes') {
    const graph = fakeGraph({
      '/drives/d1/items/i1': { id: 'i1', name, size: content.length, webUrl: 'https://contoso.sharepoint.com/x', file: { mimeType } },
      '/drives/d1/items/i1/content': new TextEncoder().encode(content).buffer,
      '/drives/d1/items/i1/content?format=pdf': new TextEncoder().encode('%PDF-1.7').buffer,
    });
    const spo = { getAuthenticatedGraphClient: async () => graph.client };
    const service = new FileOperationsService(spo as any, { maxDownloadSizeMB: 50, maxUploadSizeMB: 100, downloadDir: dir });
    return { service, calls: graph.calls };
  }

  it('without options returns the content inline, as before', async () => {
    const { service } = files('notes.txt', 'text/plain', 'hello');
    const result = await service.downloadFile('site', 'd1', 'i1');
    expect(result).toMatchObject({ content: 'hello', encoding: 'utf-8', mimeType: 'text/plain', fileName: 'notes.txt' });
    expect(result.path).toBeUndefined();
  });

  it('saveToDisk writes under the download folder and returns an absolute path instead of content', async () => {
    const { service } = files('notes.txt', 'text/plain', 'hello');
    const result = await service.downloadFile('site', 'd1', 'i1', false, { saveToDisk: true });
    expect(result.path).toBe(path.join(dir, 'notes.txt'));
    expect(result.content).toBeUndefined();
    expect(fs.readFileSync(result.path!, 'utf8')).toBe('hello');
  });

  it('a hostile file name cannot escape the download folder', async () => {
    const { service } = files('../../evil.txt', 'text/plain');
    const result = await service.downloadFile('site', 'd1', 'i1', false, { saveToDisk: true });
    expect(path.dirname(result.path!)).toBe(dir);
  });

  it('convertToPdf requests /content?format=pdf and returns a PDF', async () => {
    const { service, calls } = files('Plan.docx', DOCX_MIME);
    const result = await service.downloadFile('site', 'd1', 'i1', false, { convertToPdf: true, saveToDisk: true });
    expect(calls.map((c) => c.path)).toContain('/drives/d1/items/i1/content?format=pdf');
    expect(calls.map((c) => c.path)).not.toContain('/drives/d1/items/i1/content');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.fileName).toBe('Plan.pdf');
    expect(fs.readFileSync(result.path!, 'utf8')).toBe('%PDF-1.7');
  });

  it('convertToPdf by path uses the path form of the content URL', async () => {
    const graph = fakeGraph({
      '/drives/d1/root:/Docs/Plan.docx': { id: 'i1', name: 'Plan.docx', size: 10, file: { mimeType: DOCX_MIME } },
      '/drives/d1/root:/Docs/Plan.docx:/content?format=pdf': new TextEncoder().encode('%PDF').buffer,
    });
    const service = new FileOperationsService({ getAuthenticatedGraphClient: async () => graph.client } as any, {
      maxDownloadSizeMB: 50,
      maxUploadSizeMB: 100,
      downloadDir: dir,
    });
    const result = await service.downloadFile('site', 'd1', 'Docs/Plan.docx', true, { convertToPdf: true });
    expect(result).toMatchObject({ encoding: 'base64', mimeType: 'application/pdf' });
  });

  it('convertToPdf is refused for a non-Office file, listing the supported extensions, before any download', async () => {
    const { service, calls } = files('notes.txt', 'text/plain');
    await expect(service.downloadFile('site', 'd1', 'i1', false, { convertToPdf: true })).rejects.toThrow(
      /\.txt.*docx.*pptx.*xlsx/s
    );
    expect(calls.map((c) => c.path)).toEqual(['/drives/d1/items/i1']);
  });
});
