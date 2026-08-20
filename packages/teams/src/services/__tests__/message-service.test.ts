/**
 * MessageService tests
 *
 * These exist because the two failure classes for this service - wrong endpoint
 * path/query, and mishandled response shape - are catchable without credentials,
 * while permission failures are not. Every response fixture below is a real
 * payload copied from the Microsoft Graph v1.0 reference for that endpoint, so a
 * passing test means the mapping handles what Graph actually returns rather than
 * what would be convenient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageService } from '../message-service.js';
import type { TeamsService } from '../teams-service.js';

const TEAM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CHANNEL_ID = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';
const CHAT_ID = '19:561082c0f3f847a58069deb8eb300807@thread.v2';
const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const MY_USER_ID = '99999999-8888-7777-6666-555555555555';

/**
 * Records the fluent Graph chain so tests can assert the exact request that would
 * go on the wire: client.api(path).top(n).orderby(x).filter(y).expand(z).get()
 */
function createGraphStub() {
  const calls = {
    path: '' as string,
    top: undefined as number | undefined,
    orderby: undefined as string | undefined,
    filter: undefined as string | undefined,
    expand: undefined as string | undefined,
    select: undefined as string | undefined,
    postBody: undefined as any,
    patchBody: undefined as any,
  };

  let getResult: any = { value: [] };
  let postResult: any = {};
  let thrown: any = null;

  const request: any = {
    top: (n: number) => { calls.top = n; return request; },
    orderby: (v: string) => { calls.orderby = v; return request; },
    filter: (v: string) => { calls.filter = v; return request; },
    expand: (v: string) => { calls.expand = v; return request; },
    select: (v: string) => { calls.select = v; return request; },
    get: async () => { if (thrown) throw thrown; return getResult; },
    post: async (body: any) => { calls.postBody = body; if (thrown) throw thrown; return postResult; },
    patch: async (body: any) => { calls.patchBody = body; if (thrown) throw thrown; return undefined; },
  };

  const client = {
    api: (path: string) => { calls.path = path; return request; },
  };

  return {
    calls,
    client,
    setGet: (r: any) => { getResult = r; },
    setPost: (r: any) => { postResult = r; },
    setThrow: (e: any) => { thrown = e; },
  };
}

function createService(stub: ReturnType<typeof createGraphStub>) {
  const teams = {
    getGraphClient: vi.fn().mockResolvedValue(stub.client),
    getTeamId: (id?: string) => id ?? TEAM_ID,
    getChannelId: (id?: string) => id ?? CHANNEL_ID,
    getTenantId: () => TENANT_ID,
    getMe: vi.fn().mockResolvedValue({
      id: MY_USER_ID,
      displayName: 'Jane Doe',
      userPrincipalName: 'jdoe@example.com',
    }),
  } as unknown as TeamsService;

  return new MessageService(teams);
}

/** Real channel-message payload from the Graph "List channel messages" reference. */
const CHANNEL_MESSAGE = {
  id: '1616965872395',
  replyToId: null,
  messageType: 'message',
  createdDateTime: '2021-03-28T21:11:12.395Z',
  lastModifiedDateTime: '2021-03-28T21:11:12.395Z',
  deletedDateTime: null,
  importance: 'normal',
  webUrl: 'https://teams.microsoft.com/l/message/19%3Aabc/1616965872395',
  from: {
    application: null,
    device: null,
    user: { id: '8ea0e38b-efb3-4757-924a-5f94061cf8c2', displayName: 'Robin Kline', userIdentityType: 'aadUser' },
  },
  body: { contentType: 'html', content: 'Hello World <at id="0">Jane Smith</at>' },
  attachments: [],
  mentions: [],
  reactions: [],
};

/** Real system-event payload - note from: null, which must not crash the mapper. */
const SYSTEM_MESSAGE = {
  id: '1616883610266',
  messageType: 'systemEventMessage',
  createdDateTime: '2021-03-28T03:50:10.266Z',
  lastModifiedDateTime: '2021-03-28T03:50:10.266Z',
  deletedDateTime: null,
  importance: 'normal',
  from: null,
  body: { contentType: 'html', content: '<systemEventMessage/>' },
};

describe('MessageService.getChannelMessages', () => {
  let stub: ReturnType<typeof createGraphStub>;

  beforeEach(() => { stub = createGraphStub(); });

  it('requests the documented channel messages endpoint with the default page size', async () => {
    stub.setGet({ value: [CHANNEL_MESSAGE] });
    const service = createService(stub);

    await service.getChannelMessages({ teamId: TEAM_ID, channelId: CHANNEL_ID });

    expect(stub.calls.path).toBe(`/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages`);
    expect(stub.calls.top).toBe(20);
    // Channel messages support neither $filter nor $orderby - sending them 400s.
    expect(stub.calls.filter).toBeUndefined();
    expect(stub.calls.orderby).toBeUndefined();
  });

  it('maps a real Graph payload to reader-facing fields, keeping the id and rendering mentions', async () => {
    stub.setGet({ value: [{ ...CHANNEL_MESSAGE, 'replies@odata.count': 3 }] });
    const service = createService(stub);

    const [message] = await service.getChannelMessages();

    expect(message.id).toBe('1616965872395');
    expect(message.authorName).toBe('Robin Kline');
    expect(message.authorId).toBe('8ea0e38b-efb3-4757-924a-5f94061cf8c2');
    expect(message.text).toBe('Hello World @Jane Smith');
    expect(message.replyCount).toBe(3);
    expect(message.createdDateTime).toBe('2021-03-28T21:11:12.395Z');
  });

  // The renderer can only coalesce per-word mentions if the service actually
  // hands it mentions[]. Testing the renderer alone would pass with the
  // argument unplumbed, which is the whole failure this asserts against.
  it('passes mentions[] to the renderer, so a multi-word mention arrives as one @tag', async () => {
    stub.setGet({
      value: [{
        ...CHANNEL_MESSAGE,
        body: {
          contentType: 'html',
          content: '<p>Thanks <at id="0">Jane</at>&nbsp;<at id="1">Doe</at>&nbsp;- noted.</p>',
        },
        mentions: [
          { id: 0, mentionText: 'Jane', mentioned: { user: { id: 'aaaaaaaa-1111-2222-3333-444444444444' } } },
          { id: 1, mentionText: 'Doe', mentioned: { user: { id: 'aaaaaaaa-1111-2222-3333-444444444444' } } },
        ],
      }],
    });
    const service = createService(stub);

    const [message] = await service.getChannelMessages();

    expect(message.text).toBe('Thanks @Jane Doe - noted.');
  });

  it('labels a system message instead of throwing on from: null', async () => {
    stub.setGet({ value: [SYSTEM_MESSAGE] });
    const service = createService(stub);

    const [message] = await service.getChannelMessages();

    expect(message.authorName).toBe('System');
    expect(message.authorId).toBeUndefined();
    expect(message.text).toBe('[system message]');
  });

  it('records that Graph supplied an eventDetail, so the renderer can drop the placeholder type', async () => {
    stub.setGet({
      value: [
        {
          ...SYSTEM_MESSAGE,
          messageType: 'unknownFutureValue',
          eventDetail: { '@odata.type': '#microsoft.graph.membersAddedEventMessageDetail' },
        },
      ],
    });
    const service = createService(stub);

    const [message] = await service.getChannelMessages();

    expect(message.hasEventDetail).toBe(true);
  });

  it('flags deleted messages', async () => {
    stub.setGet({ value: [{ ...CHANNEL_MESSAGE, deletedDateTime: '2021-04-01T00:00:00Z', body: { contentType: 'html', content: '' } }] });
    const service = createService(stub);

    const [message] = await service.getChannelMessages();

    expect(message.isDeleted).toBe(true);
  });

  it('clamps top to Graph maximum of 50 and floors invalid values to the default', async () => {
    const service = createService(stub);

    await service.getChannelMessages({ top: 500 });
    expect(stub.calls.top).toBe(50);

    await service.getChannelMessages({ top: 0 });
    expect(stub.calls.top).toBe(20);

    await service.getChannelMessages({ top: 7 });
    expect(stub.calls.top).toBe(7);
  });

  it('filters the fetched page by date client-side, because Graph cannot for channels', async () => {
    stub.setGet({
      value: [
        { ...CHANNEL_MESSAGE, id: 'new', lastModifiedDateTime: '2026-08-10T12:00:00Z' },
        { ...CHANNEL_MESSAGE, id: 'old', lastModifiedDateTime: '2026-07-01T12:00:00Z' },
      ],
    });
    const service = createService(stub);

    const messages = await service.getChannelMessages({ since: '2026-08-01T00:00:00Z' });

    expect(messages.map((m) => m.id)).toEqual(['new']);
  });

  it('rejects an unparseable date rather than silently sending garbage to Graph', async () => {
    const service = createService(stub);

    await expect(service.getChannelMessages({ since: 'last tuesday' })).rejects.toThrow(/Invalid date/);
  });

  it('explains a 403 as a stale-scope problem, which the raw Graph error does not', async () => {
    stub.setThrow(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    const service = createService(stub);

    await expect(service.getChannelMessages()).rejects.toThrow(/logout.*authenticate/s);
  });
});

describe('MessageService.getMessageReplies', () => {
  it('requests the replies sub-collection of the parent message', async () => {
    const stub = createGraphStub();
    stub.setGet({ value: [CHANNEL_MESSAGE] });
    const service = createService(stub);

    await service.getMessageReplies('1616989510408', { teamId: TEAM_ID, channelId: CHANNEL_ID });

    expect(stub.calls.path).toBe(
      `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616989510408/replies`
    );
    expect(stub.calls.top).toBe(20);
  });
});

describe('MessageService.replyToMessage', () => {
  it('posts to the replies endpoint with markdown converted to sanitized HTML', async () => {
    const stub = createGraphStub();
    stub.setPost({ id: '1616990171266', webUrl: 'https://teams.microsoft.com/l/message/x' });
    const service = createService(stub);

    const result = await service.replyToMessage('1616990032035', '**bold** reply');

    expect(stub.calls.path).toBe(
      `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616990032035/replies`
    );
    expect(stub.calls.postBody.body.contentType).toBe('html');
    expect(stub.calls.postBody.body.content).toContain('<strong>bold</strong>');
    expect(result.messageId).toBe('1616990171266');
  });

  it('never forwards script content to Graph', async () => {
    const stub = createGraphStub();
    stub.setPost({ id: '1' });
    const service = createService(stub);

    await service.replyToMessage('1', 'hi <script>alert(1)</script>');

    expect(stub.calls.postBody.body.content).not.toMatch(/script/i);
  });

  it('sends plain text unconverted when format is text', async () => {
    const stub = createGraphStub();
    stub.setPost({ id: '1' });
    const service = createService(stub);

    await service.replyToMessage('1', '**not bold**', { format: 'text' });

    expect(stub.calls.postBody.body).toEqual({ contentType: 'text', content: '**not bold**' });
  });
});

describe('MessageService.listChats', () => {
  /** Real payload from the Graph "List chats" reference. */
  const CHAT = {
    id: CHAT_ID,
    topic: 'Group chat sample',
    createdDateTime: '2020-12-03T19:41:07.054Z',
    lastUpdatedDateTime: '2020-12-08T23:53:11.012Z',
    chatType: 'group',
    webUrl: 'https://teams.microsoft.com/l/chat/19%3Aabc/0',
  };

  it('reads the signed-in user chats, most recently active first', async () => {
    const stub = createGraphStub();
    stub.setGet({ value: [CHAT] });
    const service = createService(stub);

    const [chat] = await service.listChats();

    expect(stub.calls.path).toBe('/me/chats');
    expect(stub.calls.orderby).toBe('lastMessagePreview/createdDateTime desc');
    // Graph does not return lastMessagePreview unless it is expanded, even
    // though it will happily order by it - so ordering silently worked while
    // the timestamp behind the ordering was never in the response.
    expect(stub.calls.expand).toBe('lastMessagePreview');
    expect(chat.topic).toBe('Group chat sample');
    expect(chat.chatType).toBe('group');
    expect(chat.memberNames).toBeUndefined();
  });

  it('reports the last message time, not the time the chat itself changed', async () => {
    const stub = createGraphStub();
    stub.setGet({
      value: [{
        ...CHAT,
        lastUpdatedDateTime: '2026-07-01T10:44:15Z',
        lastMessagePreview: {
          id: '1622853091207',
          createdDateTime: '2026-08-13T06:07:41Z',
          body: { contentType: 'text', content: 'Testing unread read status' },
        },
      }],
    });
    const service = createService(stub);

    const [chat] = await service.listChats();

    expect(chat.lastMessageDateTime).toBe('2026-08-13T06:07:41Z');
    expect(chat.lastUpdatedDateTime).toBe('2026-07-01T10:44:15Z');
  });

  it('expands members only when asked, and surfaces their display names', async () => {
    const stub = createGraphStub();
    stub.setGet({
      value: [{
        ...CHAT,
        topic: null,
        chatType: 'oneOnOne',
        members: [
          { displayName: 'Tony Stark', userId: '4595d2f2-7b31-446c-84fd-9b795e63114b' },
          { displayName: 'Peter Parker', userId: 'd74fc2ed-cb0e-4288-a219-b5c71abaf2aa' },
        ],
      }],
    });
    const service = createService(stub);

    const [chat] = await service.listChats({ includeMembers: true });

    expect(stub.calls.expand).toBe('members,lastMessagePreview');
    expect(chat.memberNames).toEqual(['Tony Stark', 'Peter Parker']);
    expect(chat.topic).toBeUndefined();
  });
});

describe('MessageService.getChatMessages', () => {
  const CHAT_MESSAGE = {
    id: '1616964509832',
    messageType: 'message',
    createdDateTime: '2021-03-28T20:48:29.832Z',
    lastModifiedDateTime: '2021-03-28T20:48:29.832Z',
    deletedDateTime: null,
    chatId: CHAT_ID,
    importance: 'normal',
    from: {
      application: null,
      device: null,
      user: { id: '8ea0e38b-efb3-4757-924a-5f94061cf8c2', displayName: 'Robin Kline', userIdentityType: 'aadUser' },
    },
    body: { contentType: 'text', content: 'Hello world' },
  };

  it('reads a chat message collection without filter parameters when no range is given', async () => {
    const stub = createGraphStub();
    stub.setGet({ value: [CHAT_MESSAGE] });
    const service = createService(stub);

    const [message] = await service.getChatMessages(CHAT_ID);

    expect(stub.calls.path).toBe(`/chats/${CHAT_ID}/messages`);
    expect(stub.calls.filter).toBeUndefined();
    expect(stub.calls.orderby).toBeUndefined();
    expect(message.text).toBe('Hello world');
    expect(message.authorName).toBe('Robin Kline');
  });

  it('pairs $filter with a matching $orderby, which Graph requires or it ignores the filter', async () => {
    const stub = createGraphStub();
    stub.setGet({ value: [] });
    const service = createService(stub);

    await service.getChatMessages(CHAT_ID, {
      since: '2026-08-01T00:00:00Z',
      until: '2026-08-12T00:00:00Z',
    });

    expect(stub.calls.orderby).toBe('lastModifiedDateTime desc');
    expect(stub.calls.filter).toBe(
      'lastModifiedDateTime gt 2026-08-01T00:00:00.000Z and lastModifiedDateTime lt 2026-08-12T00:00:00.000Z'
    );
  });
});

describe('MessageService.sendChatMessage', () => {
  it('posts sanitized HTML to the chat messages endpoint', async () => {
    const stub = createGraphStub();
    stub.setPost({ id: '1616991463150' });
    const service = createService(stub);

    const result = await service.sendChatMessage(CHAT_ID, 'Hello *there*');

    expect(stub.calls.path).toBe(`/chats/${CHAT_ID}/messages`);
    expect(stub.calls.postBody.body.contentType).toBe('html');
    expect(stub.calls.postBody.body.content).toContain('<em>there</em>');
    expect(result.messageId).toBe('1616991463150');
  });
});

describe('MessageService reactions', () => {
  it('posts setReaction on the parent message path', async () => {
    const stub = createGraphStub();
    const service = createService(stub);

    await service.reactToChannelMessage('1616965872395', { reactionType: 'heart' });

    expect(stub.calls.path).toBe(
      `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616965872395/setReaction`
    );
    expect(stub.calls.postBody).toEqual({ reactionType: '❤️' });
  });

  it('targets the reply path when a replyId is given', async () => {
    const stub = createGraphStub();
    const service = createService(stub);

    await service.reactToChannelMessage('1616965872395', { replyId: '1616991463150' });

    expect(stub.calls.path).toBe(
      `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616965872395/replies/1616991463150/setReaction`
    );
    // Graph requires a reactionType even to remove; 'like' is the default.
    expect(stub.calls.postBody).toEqual({ reactionType: '👍' });
  });

  it('switches to unsetReaction when removing', async () => {
    const stub = createGraphStub();
    const service = createService(stub);

    await service.reactToChannelMessage('1616965872395', { action: 'remove', reactionType: 'laugh' });

    expect(stub.calls.path).toBe(
      `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616965872395/unsetReaction`
    );
    expect(stub.calls.postBody).toEqual({ reactionType: '😆' });
  });

  it('posts chat reactions on the chat message path', async () => {
    const stub = createGraphStub();
    const service = createService(stub);

    await service.reactToChatMessage(CHAT_ID, '1616991463150', { reactionType: 'surprised' });

    expect(stub.calls.path).toBe(`/chats/${CHAT_ID}/messages/1616991463150/setReaction`);
    expect(stub.calls.postBody).toEqual({ reactionType: '😮' });
  });

  // Graph rejects the friendly name with "Unicode 'like' in the payload is not
  // supported". Assert the absence, not only the expected value: the previous
  // tests asserted the name and stayed green while every live call 400'd.
  it('never sends a friendly name on the wire, for any reaction type', async () => {
    const types = ['like', 'angry', 'sad', 'laugh', 'heart', 'surprised'] as const;

    for (const reactionType of types) {
      const stub = createGraphStub();
      const service = createService(stub);

      await service.reactToChannelMessage('1616965872395', { reactionType });

      expect(stub.calls.postBody.reactionType).not.toMatch(/^[a-z]+$/);
      expect(stub.calls.postBody.reactionType).not.toBe(reactionType);
    }
  });

  it('explains a 403 on a reaction as a stale-scope problem', async () => {
    const stub = createGraphStub();
    stub.setThrow(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    const service = createService(stub);

    await expect(service.reactToChatMessage(CHAT_ID, '1616991463150')).rejects.toThrow(
      /logout' then 'authenticate/
    );
  });
});

describe('MessageService.markChatRead', () => {
  it('posts the signed-in user identity, which the action requires', async () => {
    const stub = createGraphStub();
    stub.setPost({});
    const service = createService(stub);

    await service.markChatRead(CHAT_ID);

    expect(stub.calls.path).toBe(`/chats/${CHAT_ID}/markChatReadForUser`);
    expect(stub.calls.postBody).toEqual({
      user: { id: MY_USER_ID, tenantId: TENANT_ID },
    });
  });
});

/**
 * Delta needs its own stub: it follows nextLink across several requests, and the
 * single-request recorder above cannot express a multi-page walk.
 */
function createPagingService(pages: any[]) {
  const paths: string[] = [];
  let page = 0;

  const client = {
    api: (path: string) => {
      paths.push(path);
      const response = pages[Math.min(page, pages.length - 1)];
      page++;
      return { get: async () => response };
    },
  };

  const teams = {
    getGraphClient: vi.fn().mockResolvedValue(client),
    getTeamId: (id?: string) => id ?? TEAM_ID,
    getChannelId: (id?: string) => id ?? CHANNEL_ID,
  } as unknown as TeamsService;

  return { service: new MessageService(teams), paths };
}

const DELTA_PATH = `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/delta`;
const NEXT_LINK = 'https://graph.microsoft.com/v1.0/teams/x/channels/y/messages/delta?$skiptoken=abc';
const DELTA_LINK = 'https://graph.microsoft.com/v1.0/teams/x/channels/y/messages/delta?$deltatoken=xyz';

describe('MessageService.getChannelMessagesDelta', () => {
  it('starts at the channel delta endpoint on a cold start', async () => {
    const { service, paths } = createPagingService([
      { value: [CHANNEL_MESSAGE], '@odata.deltaLink': DELTA_LINK },
    ]);

    await service.getChannelMessagesDelta();

    expect(paths[0]).toBe(DELTA_PATH);
  });

  it('resumes from a supplied deltaLink instead of walking history again', async () => {
    const { service, paths } = createPagingService([
      { value: [], '@odata.deltaLink': DELTA_LINK },
    ]);

    await service.getChannelMessagesDelta({ deltaLink: DELTA_LINK });

    expect(paths).toEqual([DELTA_LINK]);
  });

  it('follows nextLink until a deltaLink arrives, and returns it', async () => {
    const { service, paths } = createPagingService([
      { value: [CHANNEL_MESSAGE], '@odata.nextLink': NEXT_LINK },
      { value: [CHANNEL_MESSAGE], '@odata.deltaLink': DELTA_LINK },
    ]);

    const result = await service.getChannelMessagesDelta();

    expect(paths).toEqual([DELTA_PATH, NEXT_LINK]);
    expect(result.messages).toHaveLength(2);
    expect(result.deltaLink).toBe(DELTA_LINK);
    expect(result.truncated).toBe(false);
    expect(result.pagesFetched).toBe(2);
  });

  it('withholds the deltaLink when the walk was truncated - a partial one skips history', async () => {
    const { service } = createPagingService([{ value: [CHANNEL_MESSAGE], '@odata.nextLink': NEXT_LINK }]);

    const result = await service.getChannelMessagesDelta({ maxPages: 2 });

    expect(result.truncated).toBe(true);
    expect(result.deltaLink).toBeUndefined();
    expect(result.pagesFetched).toBe(2);
  });

  it('maps delta entries through the same reader-facing shape as a normal read', async () => {
    const { service } = createPagingService([
      { value: [CHANNEL_MESSAGE], '@odata.deltaLink': DELTA_LINK },
    ]);

    const result = await service.getChannelMessagesDelta();

    expect(result.messages[0].authorName).toBe('Robin Kline');
    expect(result.messages[0].id).toBe('1616965872395');
  });

  it('survives a response carrying neither nextLink nor deltaLink', async () => {
    const { service } = createPagingService([{ value: [] }]);

    const result = await service.getChannelMessagesDelta();

    expect(result.messages).toEqual([]);
    expect(result.deltaLink).toBeUndefined();
    expect(result.truncated).toBe(false);
  });
});

/**
 * A Graph 403 as the client actually throws it: the inner error that identifies
 * what really went wrong lives in `body`, not in `message`. Both of the 403s
 * these tests pin would be misdiagnosed if only `message` were read.
 */
function graph403(innerMessage: string, outerMessage = 'Forbidden') {
  return Object.assign(new Error(outerMessage), {
    statusCode: 403,
    body: JSON.stringify({ error: { code: 'Forbidden', message: outerMessage, innerError: { message: innerMessage } } }),
  });
}

describe('MessageService.updateChatMessage', () => {
  let stub: ReturnType<typeof createGraphStub>;

  beforeEach(() => { stub = createGraphStub(); });

  it('PATCHes the chat message endpoint with a converted html body', async () => {
    const service = createService(stub);

    await service.updateChatMessage(CHAT_ID, '1616990032035', 'Corrected *properly*');

    expect(stub.calls.path).toBe(`/chats/${CHAT_ID}/messages/1616990032035`);
    expect(stub.calls.patchBody.body.contentType).toBe('html');
    expect(stub.calls.patchBody.body.content).toContain('<em>properly</em>');
    // No mention markers in the content, so no mentions array should be sent.
    expect(stub.calls.patchBody.mentions).toBeUndefined();
  });

  it('sends a text body untouched when format is text', async () => {
    const service = createService(stub);

    await service.updateChatMessage(CHAT_ID, '1616990032035', 'Corrected *properly*', { format: 'text' });

    expect(stub.calls.patchBody.body).toEqual({ contentType: 'text', content: 'Corrected *properly*' });
  });

  it('never POSTs - an edit that falls through to POST would send a second message', async () => {
    const service = createService(stub);

    await service.updateChatMessage(CHAT_ID, '1616990032035', 'Corrected');

    expect(stub.calls.postBody).toBeUndefined();
  });
});

describe('MessageService.deleteChatMessage', () => {
  let stub: ReturnType<typeof createGraphStub>;

  beforeEach(() => { stub = createGraphStub(); });

  it('posts softDelete under the signed-in user segment, not the bare chat path', async () => {
    const service = createService(stub);

    await service.deleteChatMessage(CHAT_ID, '1616990032035');

    // POST /chats/{chat}/messages/{id}/softDelete answers 405 - the users-segment
    // form is the only one Graph exposes, and MY_USER_ID must be the signed-in
    // user rather than the chat.
    expect(stub.calls.path).toBe(`/users/${MY_USER_ID}/chats/${CHAT_ID}/messages/1616990032035/softDelete`);
  });

  it('restores via undoSoftDelete on the same path', async () => {
    const service = createService(stub);

    await service.undoDeleteChatMessage(CHAT_ID, '1616990032035');

    expect(stub.calls.path).toBe(`/users/${MY_USER_ID}/chats/${CHAT_ID}/messages/1616990032035/undoSoftDelete`);
  });
});

describe('MessageService channel edit and delete', () => {
  let stub: ReturnType<typeof createGraphStub>;

  beforeEach(() => { stub = createGraphStub(); });

  it('PATCHes the channel message endpoint', async () => {
    const service = createService(stub);

    await service.updateChannelMessage('1616990032035', 'Corrected *properly*');

    expect(stub.calls.path).toBe(`/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616990032035`);
    expect(stub.calls.patchBody.body.content).toContain('<em>properly</em>');
  });

  it('addresses a thread reply when replyId is given', async () => {
    const service = createService(stub);

    await service.updateChannelMessage('1616990032035', 'x', { replyId: '1616990032099' });

    expect(stub.calls.path).toBe(
      `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616990032035/replies/1616990032099`
    );
  });

  it('deletes without a /users segment - the team and channel already scope it', async () => {
    const service = createService(stub);

    await service.deleteChannelMessage('1616990032035');

    expect(stub.calls.path).toBe(`/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616990032035/softDelete`);
    expect(stub.calls.path).not.toContain('/users/');
  });

  it('restores a thread reply on the same path', async () => {
    const service = createService(stub);

    await service.undoDeleteChannelMessage('1616990032035', { replyId: '1616990032099' });

    expect(stub.calls.path).toBe(
      `/teams/${TEAM_ID}/channels/${CHANNEL_ID}/messages/1616990032035/replies/1616990032099/undoSoftDelete`
    );
  });
});

describe('wrapGraphError 403 disambiguation', () => {
  let stub: ReturnType<typeof createGraphStub>;

  beforeEach(() => { stub = createGraphStub(); });

  it('reports an out-of-range message id as an id problem, not a permissions one', async () => {
    stub.setThrow(graph403('MessageIdNotInAllowedRange-The messageId is not in the allowed range of messages.', 'InsufficientPrivileges'));
    const service = createService(stub);

    await expect(service.updateChatMessage(CHAT_ID, '1600000000000', 'x')).rejects.toThrow(
      /outside the range Graph will act on/
    );
    // The generic advice would send the reader after a consent problem that is not there.
    await expect(service.updateChatMessage(CHAT_ID, '1600000000000', 'x')).rejects.not.toThrow(
      /run 'logout' then 'authenticate'/
    );
  });

  it('names the administrator when Graph asks for ChannelMessage.ReadWrite', async () => {
    stub.setThrow(
      Object.assign(new Error("Missing scope permissions on the request. API requires one of 'ChannelMessage.ReadWrite, Group.ReadWrite.All'."), {
        statusCode: 403,
      })
    );
    const service = createService(stub);

    await expect(service.updateChatMessage(CHAT_ID, '1616990032035', 'x')).rejects.toThrow(
      /admin-consent gated/
    );
  });

  it('reports an AclCheckFailed as a Teams policy refusal, not a scope problem', async () => {
    stub.setThrow(graph403('AclCheckFailed-Delete Message: Initiator (8:orgid:...) is not allowed to delete message', 'AclCheckFailed'));
    const service = createService(stub);

    await expect(service.deleteChatMessage(CHAT_ID, '1616990032035')).rejects.toThrow(
      /Teams administrator has to change the messaging policy/
    );
    await expect(service.deleteChatMessage(CHAT_ID, '1616990032035')).rejects.not.toThrow(
      /run 'logout' then 'authenticate'/
    );
  });

  it('still gives the re-authenticate advice for an ordinary 403', async () => {
    stub.setThrow(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    const service = createService(stub);

    await expect(service.updateChatMessage(CHAT_ID, '1616990032035', 'x')).rejects.toThrow(
      /run 'logout' then 'authenticate'/
    );
  });
});
