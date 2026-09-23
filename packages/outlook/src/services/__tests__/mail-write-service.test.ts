/**
 * MailWriteService tests: drafts, attachments, organising and delete.
 *
 * Pinned: a reply draft keeps the quoted thread (new text first, then the
 * body Graph generated); delete never uses permanentDelete; markup from the
 * caller is sanitised before it reaches Graph; oversize and credential files
 * are refused before any request.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MailWriteService } from '../mail-write-service.js';
import { recordingGraph } from '../../__tests__/graph-recorder.js';
import type { RecordedRequest } from '../../__tests__/graph-recorder.js';

const SWITCHES = ['OUTLOOK_ENABLE_WRITE', 'OUTLOOK_ENABLE_SEND', 'OUTLOOK_ENABLE_DELETE'];
const QUOTED = '<html><body><div id="quoted">From: Jane Doe<br>Original text</div></body></html>';

let home: string;

beforeEach(() => {
  process.env.OUTLOOK_ENABLE_WRITE = 'true';
  process.env.OUTLOOK_ENABLE_DELETE = 'true';
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mail-write-')));
});

afterEach(() => {
  for (const name of SWITCHES) delete process.env[name];
  fs.rmSync(home, { recursive: true, force: true });
});

interface PutCall {
  url: string;
  headers: Record<string, string>;
  length: number;
}

function service(respond: (r: RecordedRequest) => unknown = () => ({ id: 'DRAFT1', webLink: 'https://outlook.example.com/draft' }), maxAttachmentMB = 25) {
  const graph = recordingGraph(respond);
  const puts: PutCall[] = [];
  const fakeFetch = async (url: string, init: any) => {
    puts.push({ url, headers: init.headers, length: (init.body as Buffer).length });
    return new Response(null, { status: puts.length === 0 ? 200 : 201 });
  };
  const svc = new MailWriteService(
    { getGraphClient: () => graph.client },
    { maxAttachmentMB, homeDir: home, fetch: fakeFetch as any }
  );
  return { svc, requests: graph.requests, puts };
}

describe('createDraft', () => {
  it('posts a draft with sanitised HTML from markdown and mapped recipients', async () => {
    const { svc, requests } = service();
    const draft = await svc.createDraft({
      to: ['jdoe@example.com'],
      cc: ['team@example.com'],
      subject: 'Budget',
      body: '**Hello** <script>alert(1)</script>',
      importance: 'high',
    });
    expect(draft).toEqual({ id: 'DRAFT1', webLink: 'https://outlook.example.com/draft' });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].path).toBe('/me/messages');
    const body = requests[0].body;
    expect(body.subject).toBe('Budget');
    expect(body.importance).toBe('high');
    expect(body.toRecipients).toEqual([{ emailAddress: { address: 'jdoe@example.com' } }]);
    expect(body.ccRecipients).toEqual([{ emailAddress: { address: 'team@example.com' } }]);
    expect(body.body.contentType).toBe('HTML');
    expect(body.body.content).toContain('<strong>Hello</strong>');
    expect(body.body.content).not.toContain('<script');
  });

  it('escapes a plain-text body and keeps its line breaks', async () => {
    const { svc, requests } = service();
    await svc.createDraft({ to: ['jdoe@example.com'], subject: 'x', body: 'a < b\nnext', format: 'text' });
    expect(requests[0].body.body.content).toBe('a &lt; b<br>next');
  });

  it('sanitises an HTML body', async () => {
    const { svc, requests } = service();
    await svc.createDraft({ to: ['jdoe@example.com'], subject: 'x', body: '<p onclick="x()">Hi</p><iframe src="y"></iframe>', format: 'html' });
    expect(requests[0].body.body.content).toBe('<p>Hi</p>');
  });

  it('rejects a recipient without @ before calling Graph', async () => {
    const { svc, requests } = service();
    await expect(svc.createDraft({ to: ['Jane Doe'], subject: 'x', body: 'y' })).rejects.toThrow(/Jane Doe/);
    expect(requests).toHaveLength(0);
  });
});

describe('createReplyDraft', () => {
  function replyGraph() {
    return service((r) => {
      if (r.method === 'POST') return { id: 'REPLY1', webLink: 'https://outlook.example.com/reply' };
      if (r.method === 'GET') return { id: 'REPLY1', body: { contentType: 'html', content: QUOTED } };
      return { id: 'REPLY1' };
    });
  }

  it('creates the reply empty, reads it back, then writes the new text above the quoted thread', async () => {
    const { svc, requests } = replyGraph();
    const draft = await svc.createReplyDraft({ messageId: 'MSG1', body: 'Thanks, **agreed**.' });
    expect(draft).toEqual({ id: 'REPLY1', webLink: 'https://outlook.example.com/reply' });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /me/messages/MSG1/createReply',
      'GET /me/messages/REPLY1',
      'PATCH /me/messages/REPLY1',
    ]);
    expect(requests[0].body ?? {}).toEqual({});
    const content: string = requests[2].body.body.content;
    expect(content.indexOf('agreed')).toBeGreaterThan(-1);
    expect(content.indexOf('agreed')).toBeLessThan(content.indexOf('Original text'));
    expect(content).toContain('<div id="quoted">');
  });

  it('uses createReplyAll for reply-all', async () => {
    const { svc, requests } = replyGraph();
    await svc.createReplyDraft({ messageId: 'MSG1', body: 'x', replyAll: true });
    expect(requests[0].path).toBe('/me/messages/MSG1/createReplyAll');
  });
});

describe('createForwardDraft', () => {
  it('creates the forward with its recipients, then writes the note above the forwarded message', async () => {
    const { svc, requests } = service((r) => {
      if (r.method === 'POST') return { id: 'FWD1', webLink: 'https://outlook.example.com/fwd' };
      if (r.method === 'GET') return { id: 'FWD1', body: { contentType: 'html', content: QUOTED } };
      return { id: 'FWD1' };
    });
    await svc.createForwardDraft({ messageId: 'MSG1', to: ['jdoe@example.com'], body: 'FYI' });
    expect(requests[0].path).toBe('/me/messages/MSG1/createForward');
    expect(requests[0].body).toEqual({ toRecipients: [{ emailAddress: { address: 'jdoe@example.com' } }] });
    expect(requests[2].method).toBe('PATCH');
    expect(requests[2].body.body.content.indexOf('FYI')).toBeLessThan(requests[2].body.body.content.indexOf('Original text'));
  });

  it('skips the read-back when there is no note', async () => {
    const { svc, requests } = service(() => ({ id: 'FWD1', webLink: 'w' }));
    await svc.createForwardDraft({ messageId: 'MSG1', to: ['jdoe@example.com'] });
    expect(requests).toHaveLength(1);
  });
});

describe('updateDraft', () => {
  it('patches only the fields given', async () => {
    const { svc, requests } = service();
    await svc.updateDraft({ draftId: 'DRAFT1', subject: 'New subject', bcc: ['x@example.com'] });
    expect(requests[0].method).toBe('PATCH');
    expect(requests[0].path).toBe('/me/messages/DRAFT1');
    expect(requests[0].body).toEqual({
      subject: 'New subject',
      bccRecipients: [{ emailAddress: { address: 'x@example.com' } }],
    });
  });
});

describe('addDraftAttachment', () => {
  function file(name: string, bytes: number): string {
    const full = path.join(home, 'Documents', name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.alloc(bytes, 7));
    return full;
  }

  it('posts a file of 3 MB or less as base64 in one request', async () => {
    const { svc, requests, puts } = service(() => ({ id: 'ATT1' }));
    const result = await svc.addDraftAttachment({ draftId: 'DRAFT1', filePath: file('notes.txt', 3 * 1024 * 1024) });
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe('/me/messages/DRAFT1/attachments');
    expect(requests[0].body['@odata.type']).toBe('#microsoft.graph.fileAttachment');
    expect(requests[0].body.name).toBe('notes.txt');
    expect(Buffer.from(requests[0].body.contentBytes, 'base64').length).toBe(3 * 1024 * 1024);
    expect(puts).toHaveLength(0);
    expect(result).toEqual({ attachmentId: 'ATT1', name: 'notes.txt', size: 3 * 1024 * 1024 });
  });

  it('uploads a file above 3 MB through an upload session in 320 KiB-multiple chunks', async () => {
    const size = 4 * 1024 * 1024;
    const { svc, requests, puts } = service(() => ({ uploadUrl: 'https://outlook.example.com/upload/abc' }));
    const result = await svc.addDraftAttachment({ draftId: 'DRAFT1', filePath: file('deck.pptx', size) });
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe('/me/messages/DRAFT1/attachments/createUploadSession');
    expect(requests[0].body).toEqual({ AttachmentItem: { attachmentType: 'file', name: 'deck.pptx', size } });
    expect(puts.length).toBeGreaterThan(1);
    let start = 0;
    puts.forEach((put, index) => {
      expect(put.url).toBe('https://outlook.example.com/upload/abc');
      if (index < puts.length - 1) expect(put.length % (320 * 1024)).toBe(0);
      expect(put.headers['Content-Range']).toBe(`bytes ${start}-${start + put.length - 1}/${size}`);
      expect(put.headers['Content-Length']).toBe(String(put.length));
      expect(put.headers).not.toHaveProperty('Authorization');
      start += put.length;
    });
    expect(start).toBe(size);
    expect(result).toMatchObject({ name: 'deck.pptx', size });
  });

  it('refuses a file above OUTLOOK_MAX_ATTACHMENT_MB before any request', async () => {
    const { svc, requests } = service(undefined, 1);
    await expect(svc.addDraftAttachment({ draftId: 'DRAFT1', filePath: file('big.zip', 2 * 1024 * 1024) })).rejects.toThrow(/OUTLOOK_MAX_ATTACHMENT_MB/);
    expect(requests).toHaveLength(0);
  });

  it('refuses a credential file before any request', async () => {
    const { svc, requests } = service();
    const key = path.join(home, 'server.pem');
    fs.writeFileSync(key, 'x');
    await expect(svc.addDraftAttachment({ draftId: 'DRAFT1', filePath: key })).rejects.toThrow(/refused/i);
    expect(requests).toHaveLength(0);
  });
});

describe('organising', () => {
  it('marks read and unread', async () => {
    const { svc, requests } = service();
    await svc.markRead('MSG1', false);
    expect(requests[0]).toMatchObject({ method: 'PATCH', path: '/me/messages/MSG1', body: { isRead: false } });
  });

  it.each(['archive', 'deleteditems', 'inbox', 'drafts', 'AAMkFolderId='])('moves to %s', async (destination) => {
    const { svc, requests } = service(() => ({ id: 'NEWID' }));
    expect(await svc.moveMessage('MSG1', destination)).toEqual({ newId: 'NEWID' });
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/me/messages/MSG1/move', body: { destinationId: destination } });
  });

  it('flags a message', async () => {
    const { svc, requests } = service();
    await svc.flagMessage('MSG1', 'complete');
    expect(requests[0].body).toEqual({ flag: { flagStatus: 'complete' } });
  });
});

describe('deleteMessage', () => {
  it('refuses without confirm: true', async () => {
    const { svc, requests } = service();
    await expect(svc.deleteMessage('MSG1', false)).rejects.toThrow(/confirm/);
    expect(requests).toHaveLength(0);
  });

  it('sends DELETE, which moves the message to Deleted Items, and never permanentDelete', async () => {
    const { svc, requests } = service(() => undefined);
    await svc.deleteMessage('MSG1', true);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('DELETE');
    expect(requests[0].path).toBe('/me/messages/MSG1');
    expect(requests.some((r) => r.path.includes('permanentDelete'))).toBe(false);
  });
});
