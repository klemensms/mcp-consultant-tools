/**
 * File attachments across every outbound path
 *
 * Same reason as outbound-mentions.test.ts: five send paths on four services, so
 * the realistic bug is "attachments work everywhere except one". Each path is
 * run through one table.
 *
 * The request shapes follow the Graph v1.0 references for createUploadSession,
 * driveItem invite, channel filesFolder and the chatMessage file-attachment
 * example. They are not captured live, so a live send is still the proof that
 * Graph and the Teams client accept them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

// Hoisted, because vi.mock runs before the module body and teams-service reads homedir at load.
const HOME = vi.hoisted(() => `/tmp/mcp-teams-attach-test-home-${process.pid}`);

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const patched = { ...actual, homedir: () => HOME };
  return { ...patched, default: patched };
});

vi.mock('../../auth/token-cache.js', () => ({
  TokenCache: class {
    createPlugin() { return {}; }
    exists() { return false; }
    clear() {}
    getCachePath() { return `${HOME}/cache.enc`; }
  },
}));

import { TeamsService } from '../teams-service.js';
import { MessageService } from '../message-service.js';
import { PeopleService } from '../people-service.js';
import { GroupChatService } from '../group-chat-service.js';
import { guidFromETag, withAttachments, describeUploaded } from '../outbound-attachments.js';

const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEAM_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const CHANNEL_ID = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';
const CHAT_ID = '19:561082c0f3f847a58069deb8eb300807@thread.v2';
const MY_ID = '99999999-8888-7777-6666-555555555555';
const JANE_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
const JOHN_ID = 'bbbbbbbb-1111-2222-3333-444444444444';
const FILE_GUID = '6E5E3E07-1D2A-4E30-9A1B-0C5D2F3E4A5B';
const DRIVE_ID = 'b!test-drive-id';
const UPLOAD_URL = 'https://contoso.sharepoint.com/_api/v2.0/drives/x/items/y/uploadSession?guid=1';
const FILE_URL = 'https://contoso-my.sharepoint.com/personal/jdoe_example_com/Documents/Microsoft%20Teams%20Chat%20Files/one-pager.docx';

const JANE = { id: JANE_ID, displayName: 'Jane Doe', mail: 'jdoe@example.com', userPrincipalName: 'jdoe@example.com' };
const JOHN = { id: JOHN_ID, displayName: 'John Smith', mail: 'jsmith@example.com', userPrincipalName: 'jsmith@example.com' };

let docPath: string;

beforeAll(() => {
  fs.mkdirSync(path.join(HOME, 'Documents'), { recursive: true });
  docPath = path.join(HOME, 'Documents', 'one-pager.docx');
  fs.writeFileSync(docPath, 'fake docx bytes');
  fs.mkdirSync(path.join(HOME, '.ssh'), { recursive: true });
  fs.writeFileSync(path.join(HOME, '.ssh', 'notes.txt'), 'secret');
  fs.writeFileSync(path.join(HOME, 'Documents', 'server.pem'), 'key');
  fs.writeFileSync(path.join(HOME, 'Documents', 'empty.txt'), '');
});

afterAll(() => fs.rmSync(HOME, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

/** Graph stub covering directory, chat lookup, members, folder, upload session, item read and invite. */
function createStub() {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const client = {
    api: (p: string) => {
      let term = '';
      const chain: any = {
        header: () => chain, count: () => chain, select: () => chain, top: () => chain,
        orderby: () => chain, filter: () => chain, expand: () => chain,
        search: (s: string) => { term = (/displayName:([^"]+)"/.exec(s)?.[1] ?? '').toLowerCase(); return chain; },
        get: async () => {
          calls.push({ method: 'GET', path: p });
          if (p === '/users') {
            if (term === 'john smith') return { value: [JOHN] };
            return { value: term === 'jane doe' ? [JANE] : [] };
          }
          if (p === '/me') return { id: MY_ID };
          if (p === '/me/chats') {
            return { value: [
              { id: CHAT_ID, chatType: 'oneOnOne', members: [{ userId: JANE_ID }, { userId: MY_ID }] },
              { id: CHAT_ID, chatType: 'group', members: [{ userId: JANE_ID }, { userId: JOHN_ID }, { userId: MY_ID }] },
            ] };
          }
          if (p === `/chats/${CHAT_ID}/members`) {
            return { value: [
              { userId: MY_ID, email: 'me@example.com' },
              { userId: JANE_ID, email: 'jdoe@example.com' },
              { userId: JOHN_ID, email: null },
            ] };
          }
          if (p.endsWith('/filesFolder')) return { id: 'FOLDER1', parentReference: { driveId: DRIVE_ID } };
          if (p.startsWith('/drives/') && !p.includes(':')) {
            return { id: 'ITEM1', name: 'one-pager.docx', eTag: `"{${FILE_GUID}},1"`, webUrl: FILE_URL, parentReference: { driveId: DRIVE_ID } };
          }
          return { value: [] };
        },
        post: async (body: any) => {
          calls.push({ method: 'POST', path: p, body });
          if (p.endsWith(':/createUploadSession')) return { uploadUrl: UPLOAD_URL };
          return { id: '1616965872395', webUrl: 'https://teams.microsoft.com/l/message/x' };
        },
      };
      return chain;
    },
  };
  const fetchMock = vi.fn(async (_url: string, _init: any) =>
    new Response(JSON.stringify({ id: 'ITEM1', parentReference: { driveId: DRIVE_ID } }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  return { client, calls, fetchMock };
}

function teamsFor(client: any): TeamsService {
  const service = new TeamsService({
    authMode: 'device-code', tenantId: TENANT_ID, clientId: CLIENT_ID,
    defaultTeamId: TEAM_ID, defaultChannelId: CHANNEL_ID,
  });
  vi.spyOn(service, 'getGraphClient').mockResolvedValue(client);
  vi.spyOn(service, 'getMe').mockResolvedValue({ id: MY_ID, displayName: 'Me', userPrincipalName: 'me@example.com' } as any);
  return service;
}

const PATHS: Array<{
  name: string;
  surface: 'chat' | 'channel';
  send: (teams: TeamsService, content: string, attachments: string[]) => Promise<any>;
}> = [
  { name: 'send-channel-message', surface: 'channel', send: (t, c, a) => t.sendChannelMessage(c, { attachments: a }) },
  { name: 'reply-to-message', surface: 'channel', send: (t, c, a) => new MessageService(t).replyToMessage('1616965872395', c, { attachments: a }) },
  { name: 'send-chat-message', surface: 'chat', send: (t, c, a) => new MessageService(t).sendChatMessage(CHAT_ID, c, { attachments: a }) },
  { name: 'send-direct-message', surface: 'chat', send: (t, c, a) => new PeopleService(t).sendDirectMessage('Jane Doe', c, { attachments: a }) },
  { name: 'send-group-message', surface: 'chat', send: (t, c, a) => new GroupChatService(t).sendGroupMessage(['Jane Doe', 'John Smith'], c, { attachments: a }) },
];

describe.each(PATHS)('$name with attachments', ({ surface, send }) => {
  it('uploads, then posts one message carrying the file card', async () => {
    const stub = createStub();
    const result = await send(teamsFor(stub.client), 'One pager attached', [docPath]);

    const session = stub.calls.find((c) => c.path.endsWith(':/createUploadSession'))!;
    expect(session.body).toEqual({ item: { '@microsoft.graph.conflictBehavior': 'rename' } });
    expect(session.path).toBe(surface === 'chat'
      ? '/me/drive/root:/Microsoft%20Teams%20Chat%20Files/one-pager.docx:/createUploadSession'
      : `/drives/${DRIVE_ID}/items/FOLDER1:/one-pager.docx:/createUploadSession`);

    // Bytes go to the pre-authenticated URL, never with the Graph token.
    const [url, init] = stub.fetchMock.mock.calls[0];
    expect(url).toBe(UPLOAD_URL);
    expect(init.method).toBe('PUT');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.headers['Content-Range']).toBe('bytes 0-14/15');

    const message = stub.calls.filter((c) => c.method === 'POST' && c.body?.body).pop()!;
    expect(message.body.body.contentType).toBe('html');
    expect(message.body.body.content).toContain(`<attachment id="${FILE_GUID}"></attachment>`);
    expect(message.body.attachments).toEqual([
      { id: FILE_GUID, contentType: 'reference', contentUrl: FILE_URL, name: 'one-pager.docx' },
    ]);
    expect(result.attachments).toEqual([expect.objectContaining({ id: FILE_GUID, webUrl: FILE_URL, name: 'one-pager.docx' })]);
  });

  it(surface === 'chat' ? 'shares the file with every other chat member, read-only, without an email' : 'does not invite anyone, because channel members already have access', async () => {
    const stub = createStub();
    await send(teamsFor(stub.client), 'x', [docPath]);

    const invites = stub.calls.filter((c) => c.path.endsWith('/invite'));
    if (surface === 'channel') {
      expect(invites).toEqual([]);
      return;
    }
    expect(invites).toEqual([{
      method: 'POST',
      path: `/drives/${DRIVE_ID}/items/ITEM1/invite`,
      body: {
        recipients: [{ email: 'jdoe@example.com' }, { objectId: JOHN_ID }],
        roles: ['read'],
        requireSignIn: true,
        sendInvitation: false,
      },
    }]);
  });

  it.each([
    ['outside the home folder', () => '/etc/hosts', /outside your home folder/],
    ['in a hidden folder', () => path.join(HOME, '.ssh', 'notes.txt'), /hidden/],
    ['credential-shaped', () => path.join(HOME, 'Documents', 'server.pem'), /credential/],
    ['empty', () => path.join(HOME, 'Documents', 'empty.txt'), /empty/],
    ['missing', () => path.join(HOME, 'Documents', 'nope.docx'), /not found/],
  ])('refuses a file %s and makes no Graph call at all', async (_label, file, reason) => {
    const stub = createStub();
    // A good file first: one refusal must still stop everything.
    await expect(send(teamsFor(stub.client), 'x', [docPath, file()])).rejects.toThrow(reason);
    expect(stub.calls).toEqual([]);
    expect(stub.fetchMock).not.toHaveBeenCalled();
  });

  it('uploads nothing when the file is swapped after the check', async () => {
    const stub = createStub();
    const swapped = path.join(HOME, 'Documents', 'swap-me.docx');
    fs.writeFileSync(swapped, 'checked bytes');
    const original = stub.client.api;
    // The first Graph call happens after the check and before the upload: swap the file then.
    stub.client.api = (p: string) => {
      if (fs.existsSync(swapped) && fs.readFileSync(swapped, 'utf8') === 'checked bytes') {
        fs.rmSync(swapped);
        fs.writeFileSync(swapped, 'other bytes!!');
      }
      return original(p);
    };
    await expect(send(teamsFor(stub.client), 'x', [swapped])).rejects.toThrow(/changed after it was checked/);
    expect(stub.calls.filter((c) => c.path.endsWith(':/createUploadSession'))).toEqual([]);
    expect(stub.calls.filter((c) => c.method === 'POST' && c.body?.body)).toEqual([]);
    expect(stub.fetchMock).not.toHaveBeenCalled();
  });

  it('refuses more than ten files before doing anything', async () => {
    const stub = createStub();
    await expect(send(teamsFor(stub.client), 'x', Array(11).fill(docPath))).rejects.toThrow(/at most 10/);
    expect(stub.calls).toEqual([]);
  });

  it('posts nothing when the upload is refused for want of a files permission', async () => {
    const stub = createStub();
    const original = stub.client.api;
    stub.client.api = (p: string) => {
      const chain = original(p);
      if (p.endsWith(':/createUploadSession') || p.endsWith('/filesFolder')) {
        const denied = async () => { throw Object.assign(new Error('Access denied'), { statusCode: 403 }); };
        chain.post = denied;
        chain.get = denied;
      }
      return chain;
    };
    await expect(send(teamsFor(stub.client), 'x', [docPath])).rejects.toThrow(/Nothing was sent[\s\S]*Sites\.ReadWrite\.All/);
    expect(stub.calls.filter((c) => c.method === 'POST' && c.body?.body)).toEqual([]);
  });

  it('leaves the payload untouched when no attachments are given', async () => {
    const stub = createStub();
    await send(teamsFor(stub.client), 'plain', []);
    const message = stub.calls.filter((c) => c.method === 'POST' && c.body?.body).pop()!;
    expect(message.body).not.toHaveProperty('attachments');
    expect(stub.fetchMock).not.toHaveBeenCalled();
  });
});

describe('message shape helpers', () => {
  it('takes the GUID out of a driveItem eTag', () => {
    expect(guidFromETag(`"{${FILE_GUID}},1"`)).toBe(FILE_GUID);
    expect(guidFromETag('"no-guid"')).toBeUndefined();
  });

  it('turns a text body into escaped HTML so the attachment tag renders', () => {
    const { body } = withAttachments({ contentType: 'text', content: 'a <b>\nline' }, [
      { id: FILE_GUID, name: 'f.docx', webUrl: FILE_URL, size: 1 },
    ]);
    expect(body).toEqual({ contentType: 'html', content: `a &lt;b&gt;<br>line<attachment id="${FILE_GUID}"></attachment>` });
  });

  it('lists each attached file with its link', () => {
    expect(describeUploaded([{ id: FILE_GUID, name: 'f.docx', webUrl: FILE_URL, size: 2048, sharedWith: 2 }]))
      .toBe(`\n\nAttached:\n- f.docx (2.0 KB, shared with 2 chat members): ${FILE_URL}`);
  });
});
