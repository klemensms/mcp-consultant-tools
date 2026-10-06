/**
 * MailWriteService tests: drafts, attachments, organising and delete.
 *
 * Pinned: a reply draft keeps the quoted thread (new text first, then the
 * body Graph generated); delete never uses permanentDelete; markup from the
 * caller is sanitised before it reaches Graph; oversize and credential files
 * are refused before any request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MailWriteService } from '../mail-write-service.js';
import { graphError, recordingGraph } from '../../__tests__/graph-recorder.js';
import type { RecordedRequest } from '../../__tests__/graph-recorder.js';

const SWITCHES = ['OUTLOOK_ENABLE_WRITE', 'OUTLOOK_ENABLE_DRAFTS', 'OUTLOOK_ENABLE_SEND', 'OUTLOOK_ENABLE_DELETE', 'OUTLOOK_ENABLE_CATEGORIES'];
const NOTE = expect.stringMatching(/nothing was sent/i);
const OUTLOOK_REPLY = '<html><body><p>My reply</p><div id="appendonsend"></div><hr><div id="divRplyFwdMsg">From: Jane Doe</div><div>Original text</div></body></html>';
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

function service(
  respond: (r: RecordedRequest) => unknown = () => ({ id: 'DRAFT1', webLink: 'https://outlook.example.com/draft' }),
  maxAttachmentMB = 25,
  download?: Buffer
) {
  const graph = recordingGraph(respond);
  const puts: PutCall[] = [];
  const gets: { url: string; headers: Record<string, string> }[] = [];
  const fakeFetch = async (url: string, init: any = {}) => {
    if ((init.method ?? 'GET') === 'GET') {
      gets.push({ url, headers: init.headers ?? {} });
      return new Response(download ?? Buffer.alloc(0), { status: 200 });
    }
    puts.push({ url, headers: init.headers, length: (init.body as Buffer).length });
    return new Response(null, { status: puts.length === 0 ? 200 : 201 });
  };
  const svc = new MailWriteService(
    { getGraphClient: () => graph.client },
    { maxAttachmentMB, homeDir: home, fetch: fakeFetch as any }
  );
  return { svc, requests: graph.requests, puts, gets };
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
    expect(draft).toEqual({ id: 'DRAFT1', webLink: 'https://outlook.example.com/draft', note: NOTE });
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
    expect(draft).toEqual({ id: 'REPLY1', webLink: 'https://outlook.example.com/reply', note: NOTE });
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
    expect(result).toEqual({ attached: true, attachmentId: 'ATT1', name: 'notes.txt', size: 3 * 1024 * 1024, note: NOTE });
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

describe('addDraftAttachment from a SharePoint or OneDrive link', () => {
  const LINK = 'https://contoso.sharepoint.com/:w:/s/team/Abc123?e=x';
  const SHARE = `/shares/u!${Buffer.from(LINK).toString('base64url')}/driveItem`;
  const DOWNLOAD = 'https://contoso.sharepoint.com/download/pre-authorised';

  function item(size: number, extra: Record<string, unknown> = {}) {
    return { id: 'ITEM1', name: 'plan.docx', size, file: {}, webUrl: 'https://contoso.sharepoint.com/plan.docx', '@microsoft.graph.downloadUrl': DOWNLOAD, ...extra };
  }

  it('looks the link up through /shares, fetches the bytes into memory and posts them inline', async () => {
    const bytes = Buffer.alloc(1000, 3);
    const { svc, requests, gets } = service((r) => (r.method === 'GET' ? item(bytes.length) : { id: 'ATT1' }), 25, bytes);
    const result = await svc.addDraftAttachment({ draftId: 'DRAFT1', url: LINK });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([`GET ${SHARE}`, 'POST /me/messages/DRAFT1/attachments']);
    expect(gets).toEqual([{ url: DOWNLOAD, headers: {} }]);
    expect(requests[1].body.name).toBe('plan.docx');
    expect(Buffer.from(requests[1].body.contentBytes, 'base64').equals(bytes)).toBe(true);
    expect(result).toEqual({ attached: true, attachmentId: 'ATT1', name: 'plan.docx', size: 1000, note: NOTE });
  });

  it('uploads a linked file above 3 MB through an upload session, from memory', async () => {
    const size = 4 * 1024 * 1024;
    const { svc, requests, puts } = service(
      (r) => (r.method === 'GET' ? item(size) : { uploadUrl: 'https://outlook.example.com/upload/abc' }),
      25,
      Buffer.alloc(size, 1)
    );
    const result = await svc.addDraftAttachment({ draftId: 'DRAFT1', url: LINK });
    expect(requests[1].path).toBe('/me/messages/DRAFT1/attachments/createUploadSession');
    expect(puts.reduce((sum, put) => sum + put.length, 0)).toBe(size);
    expect(result).toMatchObject({ attached: true, name: 'plan.docx', size });
  });

  it('refuses a linked file above the size cap before downloading it', async () => {
    const { svc, requests, gets } = service(() => item(2 * 1024 * 1024), 1);
    await expect(svc.addDraftAttachment({ draftId: 'DRAFT1', url: LINK })).rejects.toThrow(/OUTLOOK_MAX_ATTACHMENT_MB/);
    expect(requests).toHaveLength(1);
    expect(gets).toHaveLength(0);
  });

  it('refuses a link to a folder', async () => {
    const { svc } = service(() => ({ id: 'F1', name: 'Team', folder: { childCount: 3 } }));
    await expect(svc.addDraftAttachment({ draftId: 'DRAFT1', url: LINK })).rejects.toThrow(/folder/i);
  });

  it('on 403 puts a link to the file above any quoted thread and says Files.Read.All is needed', async () => {
    const { svc, requests, gets } = service((r) => {
      if (r.path.startsWith('/shares/')) return graphError(403, 'accessDenied', 'Access denied');
      if (r.method === 'GET') return { body: { contentType: 'html', content: OUTLOOK_REPLY } };
      return {};
    });
    const result: any = await svc.addDraftAttachment({ draftId: 'DRAFT1', url: LINK });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([`GET ${SHARE}`, 'GET /me/messages/DRAFT1', 'PATCH /me/messages/DRAFT1']);
    expect(gets).toHaveLength(0);
    const content: string = requests[2].body.body.content;
    expect(content).toContain(`href="${LINK.replace(/&/g, '&amp;')}"`);
    expect(content.indexOf('My reply')).toBeLessThan(content.indexOf('href'));
    expect(content.indexOf('href')).toBeLessThan(content.indexOf('Original text'));
    expect(result).toMatchObject({ attached: false, linkInserted: true, url: LINK, note: NOTE });
    expect(result.reason).toMatch(/Files\.Read\.All/);
  });

  it('needs exactly one of filePath and url', async () => {
    const { svc, requests } = service();
    await expect(svc.addDraftAttachment({ draftId: 'DRAFT1' })).rejects.toThrow(/filePath or url/);
    await expect(svc.addDraftAttachment({ draftId: 'DRAFT1', url: LINK, filePath: '/x' })).rejects.toThrow(/not both/);
    expect(requests).toHaveLength(0);
  });

  it('refuses a url that is not https', async () => {
    const { svc, requests } = service();
    await expect(svc.addDraftAttachment({ draftId: 'DRAFT1', url: 'file:///etc/passwd' })).rejects.toThrow(/https/);
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
    expect(requests[0].body).toEqual({
      flag: { flagStatus: 'complete' },
      singleValueExtendedProperties: [{ id: 'Boolean {00062008-0000-0000-C000-000000000046} Id 0x8503', value: 'false' }],
    });
  });
});

describe('flagMessage with dates and a reminder', () => {
  const REMINDER_SET = 'Boolean {00062008-0000-0000-C000-000000000046} Id 0x8503';
  const REMINDER_TIME = 'SystemTime {00062008-0000-0000-C000-000000000046} Id 0x8502';
  const SIGNAL_TIME = 'SystemTime {00062008-0000-0000-C000-000000000046} Id 0x8560';

  beforeEach(() => {
    process.env.OUTLOOK_TIME_ZONE = 'Europe/London';
  });
  afterEach(() => {
    delete process.env.OUTLOOK_TIME_ZONE;
    vi.useRealTimers();
  });

  it('a plain flag sends the flag status alone, with no dates and no extended properties', async () => {
    const { svc, requests } = service();
    await svc.flagMessage('MSG1', 'flagged');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'PATCH', path: '/me/messages/MSG1' });
    expect(requests[0].body).toEqual({ flag: { flagStatus: 'flagged' } });
  });

  it('a due date is sent in UTC, with start defaulting to now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T08:30:00Z'));
    const { svc, requests } = service();
    const result = await svc.flagMessage('MSG1', 'flagged', { dueDateTime: '2026-10-10T17:00' });
    expect(requests[0].body).toEqual({
      flag: {
        flagStatus: 'flagged',
        startDateTime: { dateTime: '2026-10-06T08:30:00', timeZone: 'UTC' },
        dueDateTime: { dateTime: '2026-10-10T16:00:00', timeZone: 'UTC' },
      },
    });
    expect(result).toMatchObject({ messageId: 'MSG1', flag: 'flagged' });
  });

  it('an explicit start and zone are honoured', async () => {
    const { svc, requests } = service();
    await svc.flagMessage('MSG1', 'flagged', {
      startDateTime: '2026-10-08T09:00',
      dueDateTime: '2026-10-09T09:00',
      timeZone: 'America/New_York',
    });
    expect(requests[0].body.flag).toEqual({
      flagStatus: 'flagged',
      startDateTime: { dateTime: '2026-10-08T13:00:00', timeZone: 'UTC' },
      dueDateTime: { dateTime: '2026-10-09T13:00:00', timeZone: 'UTC' },
    });
  });

  it('a due date already past moves the default start back to the due date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T08:30:00Z'));
    const { svc, requests } = service();
    await svc.flagMessage('MSG1', 'flagged', { dueDateTime: '2026-10-01T09:00' });
    expect(requests[0].body.flag.startDateTime).toEqual({ dateTime: '2026-10-01T08:00:00', timeZone: 'UTC' });
  });

  it('a Windows zone name goes to Graph as given, since it cannot be converted here', async () => {
    const { svc, requests } = service();
    await svc.flagMessage('MSG1', 'flagged', { dueDateTime: '2026-10-10T17:00', timeZone: 'GMT Standard Time' });
    expect(requests[0].body.flag).toEqual({
      flagStatus: 'flagged',
      startDateTime: { dateTime: '2026-10-10T17:00:00', timeZone: 'GMT Standard Time' },
      dueDateTime: { dateTime: '2026-10-10T17:00:00', timeZone: 'GMT Standard Time' },
    });
  });

  it('a due date plus a reminder sets the three reminder properties in UTC', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T08:30:00Z'));
    const { svc, requests } = service();
    const result = await svc.flagMessage('MSG1', 'flagged', {
      dueDateTime: '2026-10-10T17:00',
      reminderDateTime: '2026-10-10T09:00',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({
      flag: {
        flagStatus: 'flagged',
        startDateTime: { dateTime: '2026-10-06T08:30:00', timeZone: 'UTC' },
        dueDateTime: { dateTime: '2026-10-10T16:00:00', timeZone: 'UTC' },
      },
      singleValueExtendedProperties: [
        { id: REMINDER_SET, value: 'true' },
        { id: REMINDER_TIME, value: '2026-10-10T08:00:00Z' },
        { id: SIGNAL_TIME, value: '2026-10-10T08:00:00Z' },
      ],
    });
    expect(result.reminderUtc).toBe('2026-10-10T08:00:00Z');
  });

  it('a reminder with an explicit offset is taken as it is', async () => {
    const { svc, requests } = service();
    await svc.flagMessage('MSG1', 'flagged', { reminderDateTime: '2026-10-10T09:00:00Z' });
    expect(requests[0].body.flag).toEqual({ flagStatus: 'flagged' });
    expect(requests[0].body.singleValueExtendedProperties[1]).toEqual({ id: REMINDER_TIME, value: '2026-10-10T09:00:00Z' });
  });

  it('notFlagged clears the reminder as well as the flag', async () => {
    const { svc, requests } = service();
    await svc.flagMessage('MSG1', 'notFlagged');
    expect(requests[0].body).toEqual({
      flag: { flagStatus: 'notFlagged' },
      singleValueExtendedProperties: [{ id: REMINDER_SET, value: 'false' }],
    });
  });

  it.each([
    [{ dueDateTime: '2026-10-10' }],
    [{ startDateTime: '2026-10-10' }],
    [{ reminderDateTime: '2026-10-10T09:00' }],
    [{ timeZone: 'Europe/London' }],
  ])('rejects dates or a reminder with notFlagged before any request (%o)', async (options) => {
    const { svc, requests } = service();
    await expect(svc.flagMessage('MSG1', 'notFlagged', options)).rejects.toThrow(/notFlagged/);
    expect(requests).toHaveLength(0);
  });

  it('rejects dates or a reminder with complete before any request', async () => {
    const { svc, requests } = service();
    await expect(svc.flagMessage('MSG1', 'complete', { dueDateTime: '2026-10-10' })).rejects.toThrow(/flagged/);
    expect(requests).toHaveLength(0);
  });

  it('rejects a start without a due date', async () => {
    const { svc, requests } = service();
    await expect(svc.flagMessage('MSG1', 'flagged', { startDateTime: '2026-10-10' })).rejects.toThrow(/dueDateTime/);
    expect(requests).toHaveLength(0);
  });

  it('rejects a start after the due date', async () => {
    const { svc, requests } = service();
    await expect(
      svc.flagMessage('MSG1', 'flagged', { startDateTime: '2026-10-12', dueDateTime: '2026-10-10' })
    ).rejects.toThrow(/after/);
    expect(requests).toHaveLength(0);
  });

  it('rejects a reminder without a zone when the zone is a Windows name', async () => {
    const { svc, requests } = service();
    await expect(
      svc.flagMessage('MSG1', 'flagged', { reminderDateTime: '2026-10-10T09:00', timeZone: 'GMT Standard Time' })
    ).rejects.toThrow(/reminderDateTime/);
    expect(requests).toHaveLength(0);
  });

  it('rejects an unreadable date', async () => {
    const { svc, requests } = service();
    await expect(svc.flagMessage('MSG1', 'flagged', { dueDateTime: 'next Friday' })).rejects.toThrow(/dueDateTime/);
    expect(requests).toHaveLength(0);
  });

  it('is still held to OUTLOOK_ENABLE_WRITE', async () => {
    delete process.env.OUTLOOK_ENABLE_WRITE;
    const { svc, requests } = service();
    await expect(svc.flagMessage('MSG1', 'flagged', { dueDateTime: '2026-10-10' })).rejects.toThrow(/OUTLOOK_ENABLE_WRITE/);
    expect(requests).toHaveLength(0);
  });
});

describe('setCategories', () => {
  beforeEach(() => {
    process.env.OUTLOOK_ENABLE_CATEGORIES = 'true';
  });

  /** Answers the read of the current categories; the PATCH gets an empty 200. */
  const withCurrent = (current: string[]) => (r: RecordedRequest) =>
    r.method === 'GET' ? { id: 'MSG1', categories: current } : undefined;

  it('reads the current categories, then patches them with the new one added and the existing ones kept', async () => {
    const { svc, requests } = service(withCurrent(['Blue category', 'Contoso']));
    const result = await svc.setCategories({ messageId: 'MSG1', add: ['Follow-up'] });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ method: 'GET', path: '/me/messages/MSG1', query: { $select: 'categories' } });
    expect(requests[1]).toMatchObject({ method: 'PATCH', path: '/me/messages/MSG1' });
    expect(requests[1].body).toEqual({ categories: ['Blue category', 'Contoso', 'Follow-up'] });
    expect(result).toEqual({
      messageId: 'MSG1',
      before: ['Blue category', 'Contoso'],
      categories: ['Blue category', 'Contoso', 'Follow-up'],
      changed: true,
    });
  });

  it('removes only the named category and leaves the others untouched', async () => {
    const { svc, requests } = service(withCurrent(['Blue category', 'Contoso', 'Follow-up']));
    const result = await svc.setCategories({ messageId: 'MSG1', remove: ['Contoso'] });
    expect(requests[1].body).toEqual({ categories: ['Blue category', 'Follow-up'] });
    expect(result.categories).toEqual(['Blue category', 'Follow-up']);
  });

  it('adds and removes in one call', async () => {
    const { svc, requests } = service(withCurrent(['Blue category', 'Contoso']));
    await svc.setCategories({ messageId: 'MSG1', add: ['Follow-up'], remove: ['Blue category'] });
    expect(requests[1].body).toEqual({ categories: ['Contoso', 'Follow-up'] });
  });

  it('matches names without regard to case and keeps the existing spelling', async () => {
    const { svc, requests } = service(withCurrent(['Contoso']));
    const result = await svc.setCategories({ messageId: 'MSG1', add: ['contoso'] });
    expect(result).toMatchObject({ categories: ['Contoso'], changed: false });
    expect(requests).toHaveLength(1);
    const removed = service(withCurrent(['Contoso', 'Follow-up']));
    await removed.svc.setCategories({ messageId: 'MSG1', remove: ['CONTOSO'] });
    expect(removed.requests[1].body).toEqual({ categories: ['Follow-up'] });
  });

  it('sends no PATCH when nothing would change', async () => {
    const { svc, requests } = service(withCurrent(['Contoso']));
    const result = await svc.setCategories({ messageId: 'MSG1', remove: ['Follow-up'] });
    expect(result).toEqual({ messageId: 'MSG1', before: ['Contoso'], categories: ['Contoso'], changed: false });
    expect(requests).toHaveLength(1);
  });

  it('treats a message with no categories as an empty list', async () => {
    const { svc, requests } = service((r) => (r.method === 'GET' ? { id: 'MSG1' } : undefined));
    await svc.setCategories({ messageId: 'MSG1', add: ['Contoso'] });
    expect(requests[1].body).toEqual({ categories: ['Contoso'] });
  });

  it('refuses with nothing to add or remove, and a name in both lists, before any Graph call', async () => {
    const { svc, requests } = service(withCurrent([]));
    await expect(svc.setCategories({ messageId: 'MSG1' })).rejects.toThrow(/add or remove/);
    await expect(svc.setCategories({ messageId: 'MSG1', add: [' '], remove: [] })).rejects.toThrow(/add or remove/);
    await expect(svc.setCategories({ messageId: 'MSG1', add: ['Contoso'], remove: ['contoso'] })).rejects.toThrow(/both/);
    expect(requests).toHaveLength(0);
  });

  it('refuses while OUTLOOK_ENABLE_CATEGORIES is off, and is not opened by OUTLOOK_ENABLE_WRITE', async () => {
    delete process.env.OUTLOOK_ENABLE_CATEGORIES;
    const { svc, requests } = service(withCurrent([]));
    await expect(svc.setCategories({ messageId: 'MSG1', add: ['Contoso'] })).rejects.toThrow(/Set OUTLOOK_ENABLE_CATEGORIES=true/);
    expect(requests).toHaveLength(0);
  });

  it('explains a 403 as the missing Mail.ReadWrite permission', async () => {
    const { svc } = service(() => graphError(403, 'ErrorAccessDenied', 'Access is denied.'));
    const error = await svc.setCategories({ messageId: 'MSG1', add: ['Contoso'] }).catch((e) => e);
    expect(error.message).toMatch(/Mail\.ReadWrite/);
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
