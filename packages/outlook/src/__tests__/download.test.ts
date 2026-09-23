import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MailReadService } from '../services/mail-read-service.js';
import { recordingGraph } from './graph-recorder.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outlook-download-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function fileAttachment(name: string, text: string) {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    id: 'ATT1',
    name,
    contentType: 'text/plain',
    size: text.length,
    contentBytes: Buffer.from(text).toString('base64'),
  };
}

function service(attachment: unknown) {
  const graph = recordingGraph(() => attachment);
  const svc = new MailReadService({ getGraphClient: () => graph.client }, { downloadDir: dir });
  return { svc, requests: graph.requests };
}

describe('downloadAttachment', () => {
  it('reads the attachment and writes its bytes under the download folder', async () => {
    const { svc, requests } = service(fileAttachment('notes.txt', 'hello'));
    const result = await svc.downloadAttachment('MSG=1', 'ATT1');
    expect(requests[0].path).toBe(`/me/messages/${encodeURIComponent('MSG=1')}/attachments/ATT1`);
    expect(result.path).toBe(path.join(dir, 'notes.txt'));
    expect(fs.readFileSync(result.path, 'utf-8')).toBe('hello');
    expect(result).toMatchObject({ size: 5, contentType: 'text/plain' });
  });

  it('never overwrites an existing file', async () => {
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'already here');
    const { svc } = service(fileAttachment('notes.txt', 'new'));
    const result = await svc.downloadAttachment('MSG', 'ATT1');
    expect(path.basename(result.path)).toBe('notes (1).txt');
    expect(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf-8')).toBe('already here');
  });

  it('sanitises a hostile name so it cannot leave the folder', async () => {
    const { svc } = service(fileAttachment('../../evil/x.txt', 'x'));
    const result = await svc.downloadAttachment('MSG', 'ATT1');
    expect(path.dirname(result.path)).toBe(dir);
  });

  it.each([
    ['#microsoft.graph.itemAttachment', 'itemAttachment'],
    ['#microsoft.graph.referenceAttachment', 'referenceAttachment'],
  ])('refuses a %s and names the type', async (odataType, name) => {
    const { svc } = service({ '@odata.type': odataType, id: 'ATT1', name: 'Forwarded mail', size: 10 });
    await expect(svc.downloadAttachment('MSG', 'ATT1')).rejects.toThrow(name);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
