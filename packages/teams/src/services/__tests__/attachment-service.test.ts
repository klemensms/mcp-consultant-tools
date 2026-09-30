/**
 * AttachmentService tests
 *
 * The message shapes below are captured from a live tenant on 2026-09-29, with
 * ids, hosts and names replaced by sanctioned placeholders. The attachment keys,
 * the `reference` content type and the hostedContents src format are exactly as
 * Graph sent them; the Graph reference was not used as a source.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AttachmentService,
  extractHostedImageUrls,
  safeFileName,
  toShareId,
} from '../attachment-service.js';
import type { TeamsService } from '../teams-service.js';

const TEAM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CHANNEL_ID = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';
const CHAT_ID = '19:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_11111111-2222-3333-4444-555555555555@unq.gbl.spaces';
const MESSAGE_ID = '1616990032035';

const IMAGE_SRC = `https://graph.microsoft.com/v1.0/chats/${CHAT_ID}/messages/${MESSAGE_ID}/hostedContents/aWQ9eF8wLXd1cy1kMTEt/$value`;
const FILE_URL = 'https://contoso-my.sharepoint.com/personal/jdoe_example_com/Documents/Microsoft%20Teams%20Chat%20Files/Report.pdf';
const DOWNLOAD_URL = 'https://contoso-my.sharepoint.com/_layouts/15/download.aspx?UniqueId=abc&tempauth=xyz';

function attachment(overrides: Record<string, unknown>) {
  return {
    id: 'att-1',
    contentType: 'reference',
    contentUrl: null,
    content: null,
    name: null,
    thumbnailUrl: null,
    teamsAppId: null,
    ...overrides,
  };
}

function chatMessage(bodyHtml: string, attachments: unknown[] = []) {
  return {
    id: MESSAGE_ID,
    messageType: 'message',
    body: { contentType: 'html', content: bodyHtml },
    attachments,
  };
}

const IMAGE_HTML = `<p><img src="${IMAGE_SRC}" width="928" height="220" alt="image" itemid="0-wuk-d4-a84bce1a"></p>`;

/**
 * Graph stub keyed on path. A value that is a Response is what a RAW request
 * returns; anything else is the parsed JSON a normal .get() returns.
 */
function createGraphStub(routes: Record<string, unknown>) {
  const calls: Array<{ path: string; responseType?: string }> = [];

  const client = {
    api: (p: string) => {
      const call: { path: string; responseType?: string } = { path: p };
      calls.push(call);
      const request: any = {
        responseType: (t: string) => { call.responseType = t; return request; },
        get: async () => {
          if (!(p in routes)) {
            throw Object.assign(new Error(`no route for ${p}`), { statusCode: 404 });
          }
          const result = routes[p];
          if (result instanceof Error) throw result;
          return result;
        },
      };
      return request;
    },
  };

  return { client, calls };
}

function createService(stub: ReturnType<typeof createGraphStub>) {
  const teams = {
    getGraphClient: vi.fn().mockResolvedValue(stub.client),
    getTeamId: (id?: string) => id ?? TEAM_ID,
    getChannelId: (id?: string) => id ?? CHANNEL_ID,
  } as unknown as TeamsService;
  return new AttachmentService(teams);
}

function pngResponse() {
  return new Response(Buffer.from('PNGDATA'), { status: 200, headers: { 'content-type': 'image/png' } });
}

function shareRoute(url: string) {
  return `/shares/${toShareId(url)}/driveItem`;
}

let outDir: string;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teams-att-test-'));
  fetchMock = vi.fn(async () => new Response('PDFDATA', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('extractHostedImageUrls', () => {
  it('returns Graph hostedContents srcs and leaves other images out', () => {
    const html = `${IMAGE_HTML}<img src="https://statics.teams.cdn.office.net/evergreen-assets/sticker.gif" alt="sticker">`;
    const result = extractHostedImageUrls(html);
    expect(result.hosted).toEqual([IMAGE_SRC]);
    expect(result.external).toEqual(['https://statics.teams.cdn.office.net/evergreen-assets/sticker.gif']);
  });

  it('does not treat a lookalike host as Graph', () => {
    const result = extractHostedImageUrls('<img src="https://graph.microsoft.com.evil.example/v1.0/x/$value">');
    expect(result.hosted).toEqual([]);
    expect(result.external).toHaveLength(1);
  });
});

describe('toShareId', () => {
  it('encodes as u! plus unpadded url-safe base64, as /shares requires', () => {
    const id = toShareId(FILE_URL);
    expect(id.startsWith('u!')).toBe(true);
    expect(id).not.toMatch(/[=+/]/);
    expect(Buffer.from(id.slice(2), 'base64url').toString()).toBe(FILE_URL);
  });
});

describe('safeFileName', () => {
  it('strips directory components so a name cannot escape the output folder', () => {
    expect(safeFileName('../../etc/passwd', 'x')).toBe('passwd');
    expect(safeFileName('..\\..\\evil.bat', 'x')).toBe('evil.bat');
  });

  it('falls back when nothing usable is left', () => {
    expect(safeFileName('..', 'fallback')).toBe('fallback');
    expect(safeFileName(undefined, 'fallback')).toBe('fallback');
    expect(safeFileName('   ', 'fallback')).toBe('fallback');
  });

  it('replaces characters that are invalid in a file name', () => {
    expect(safeFileName('a:b*c?.pdf', 'x')).toBe('a_b_c_.pdf');
  });
});

describe('downloadMessageAttachments', () => {
  it('reads a chat message from the chat path and saves its inline image', async () => {
    const stub = createGraphStub({
      [`/chats/${CHAT_ID}/messages/${MESSAGE_ID}`]: chatMessage(IMAGE_HTML),
      [IMAGE_SRC]: pngResponse(),
    });

    const result = await createService(stub).downloadMessageAttachments(MESSAGE_ID, { chatId: CHAT_ID, outputDir: outDir });

    expect(stub.calls[0].path).toBe(`/chats/${CHAT_ID}/messages/${MESSAGE_ID}`);
    expect(result.downloaded).toHaveLength(1);
    expect(result.downloaded[0]).toMatchObject({ kind: 'image', name: 'image-1.png', contentType: 'image/png', size: 7 });
    expect(fs.readFileSync(result.downloaded[0].path, 'utf8')).toBe('PNGDATA');
    expect(stub.calls.find((c) => c.path === IMAGE_SRC)?.responseType).toBe('raw');
  });

  it('uses the channel path, and the reply path when a replyId is given', async () => {
    const channelPath = `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`;
    const stub = createGraphStub({
      [channelPath]: chatMessage('<p>no attachments</p>'),
      [`${channelPath}/replies/1616990099999`]: chatMessage('<p>no attachments</p>'),
    });
    const service = createService(stub);

    await service.downloadMessageAttachments(MESSAGE_ID, { outputDir: outDir });
    await service.downloadMessageAttachments(MESSAGE_ID, { replyId: '1616990099999', outputDir: outDir });

    expect(stub.calls.map((c) => c.path)).toEqual([channelPath, `${channelPath}/replies/1616990099999`]);
  });

  it('refuses a replyId on a chat, since chats have no thread replies', async () => {
    const service = createService(createGraphStub({}));
    await expect(
      service.downloadMessageAttachments(MESSAGE_ID, { chatId: CHAT_ID, replyId: '1', outputDir: outDir })
    ).rejects.toThrow(/chats have no thread replies/i);
  });

  it('downloads a OneDrive file through /shares and the pre-authenticated URL, sending no token to it', async () => {
    const stub = createGraphStub({
      [`/chats/${CHAT_ID}/messages/${MESSAGE_ID}`]: chatMessage('<attachment id="att-1"></attachment>', [
        attachment({ contentUrl: FILE_URL, name: 'Report.pdf' }),
      ]),
      [shareRoute(FILE_URL)]: {
        name: 'Report.pdf',
        size: 7,
        file: { mimeType: 'application/pdf' },
        '@microsoft.graph.downloadUrl': DOWNLOAD_URL,
      },
    });

    const result = await createService(stub).downloadMessageAttachments(MESSAGE_ID, { chatId: CHAT_ID, outputDir: outDir });

    expect(result.downloaded).toHaveLength(1);
    expect(result.downloaded[0]).toMatchObject({ kind: 'file', name: 'Report.pdf', contentType: 'application/pdf', size: 7 });
    expect(fs.readFileSync(path.join(outDir, 'Report.pdf'), 'utf8')).toBe('PDFDATA');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe(DOWNLOAD_URL);
    expect(JSON.stringify(init ?? {})).not.toMatch(/authorization/i);
  });

  it('skips a folder, a non-SharePoint link and the attachments that are not files', async () => {
    const folderUrl = 'https://contoso.sharepoint.com/sites/Team/Shared%20Documents/Plans';
    const stub = createGraphStub({
      [`/chats/${CHAT_ID}/messages/${MESSAGE_ID}`]: chatMessage('', [
        attachment({ id: 'a', contentUrl: folderUrl, name: 'Plans' }),
        attachment({ id: 'b', contentUrl: 'https://www.example.com/page', name: 'page' }),
        attachment({ id: 'c', contentType: 'messageReference', content: '{"messageId":"1"}' }),
        attachment({ id: 'd', contentType: 'forwardedMessageReference', content: '{}' }),
        attachment({ id: 'e', contentType: 'application/vnd.microsoft.card.adaptive', content: '{}' }),
      ]),
      [shareRoute(folderUrl)]: { name: 'Plans', folder: { childCount: 3 } },
    });

    const result = await createService(stub).downloadMessageAttachments(MESSAGE_ID, { chatId: CHAT_ID, outputDir: outDir });

    expect(result.downloaded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/folder/i),
      expect.stringMatching(/not a file stored in SharePoint or OneDrive/i),
      expect.stringMatching(/quoted reply/i),
      expect.stringMatching(/forwarded message/i),
      expect.stringMatching(/card/i),
    ]);
    // The non-SharePoint link must never be sent to /shares.
    expect(stub.calls.some((c) => c.path === shareRoute('https://www.example.com/page'))).toBe(false);
  });

  it('records a failed item and still downloads the rest', async () => {
    const deniedUrl = 'https://contoso-my.sharepoint.com/personal/x/Documents/Secret.docx';
    const stub = createGraphStub({
      [`/chats/${CHAT_ID}/messages/${MESSAGE_ID}`]: chatMessage(IMAGE_HTML, [
        attachment({ id: 'a', contentUrl: deniedUrl, name: 'Secret.docx' }),
      ]),
      [IMAGE_SRC]: pngResponse(),
      [shareRoute(deniedUrl)]: Object.assign(new Error('Access denied'), { statusCode: 403 }),
    });

    const result = await createService(stub).downloadMessageAttachments(MESSAGE_ID, { chatId: CHAT_ID, outputDir: outDir });

    expect(result.downloaded.map((d) => d.name)).toEqual(['image-1.png']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe('Secret.docx');
    expect(result.failed[0].reason).toMatch(/Files\.ReadWrite\.All or Sites\.ReadWrite\.All/);
  });

  it('reports a hosted image that answers an error status as failed, and writes no file for it', async () => {
    const stub = createGraphStub({
      [`/chats/${CHAT_ID}/messages/${MESSAGE_ID}`]: chatMessage(IMAGE_HTML),
      [IMAGE_SRC]: new Response('{"error":{}}', { status: 404 }),
    });

    const result = await createService(stub).downloadMessageAttachments(MESSAGE_ID, { chatId: CHAT_ID, outputDir: outDir });

    expect(result.downloaded).toEqual([]);
    expect(result.failed[0].reason).toMatch(/HTTP 404/);
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('never overwrites an existing file, and gives same-named attachments distinct names', async () => {
    fs.writeFileSync(path.join(outDir, 'Report.pdf'), 'ALREADY HERE');
    const secondUrl = FILE_URL.replace('Chat%20Files/', 'Chat%20Files/Other/');
    const driveItem = { name: 'Report.pdf', size: 7, file: { mimeType: 'application/pdf' }, '@microsoft.graph.downloadUrl': DOWNLOAD_URL };
    const stub = createGraphStub({
      [`/chats/${CHAT_ID}/messages/${MESSAGE_ID}`]: chatMessage('', [
        attachment({ id: 'a', contentUrl: FILE_URL, name: 'Report.pdf' }),
        attachment({ id: 'b', contentUrl: secondUrl, name: 'Report.pdf' }),
      ]),
      [shareRoute(FILE_URL)]: driveItem,
      [shareRoute(secondUrl)]: driveItem,
    });
    fetchMock.mockImplementation(async () => new Response('PDFDATA', { status: 200 }));

    const result = await createService(stub).downloadMessageAttachments(MESSAGE_ID, { chatId: CHAT_ID, outputDir: outDir });

    expect(fs.readFileSync(path.join(outDir, 'Report.pdf'), 'utf8')).toBe('ALREADY HERE');
    expect(result.downloaded.map((d) => d.name)).toEqual(['Report (2).pdf', 'Report (3).pdf']);
  });

  it('defaults to a per-message folder under the system temp directory', async () => {
    const stub = createGraphStub({
      [`/chats/${CHAT_ID}/messages/${MESSAGE_ID}`]: chatMessage('<p>nothing</p>'),
    });

    const result = await createService(stub).downloadMessageAttachments(MESSAGE_ID, { chatId: CHAT_ID });

    expect(result.outputDir).toBe(path.join(os.tmpdir(), 'mcp-teams-attachments', MESSAGE_ID));
  });
});
