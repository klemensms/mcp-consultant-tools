/**
 * GroupChatService tests
 *
 * The chat and member shapes are captured from a live tenant on 2026-09-29 (a
 * group-chat page of GET /me/chats?$filter=chatType eq 'group'&$expand=members,
 * and GET /chats/{id}?$expand=members on a one-on-one chat), with ids and names
 * replaced by sanctioned placeholders. The request bodies follow the Graph v1.0
 * create-chat and add-member examples, which is all the evidence there is for
 * them until the first live send.
 */

import { describe, it, expect, vi } from 'vitest';
import { GroupChatService } from '../group-chat-service.js';
import type { TeamsService } from '../teams-service.js';

const MY_ID = '99999999-8888-7777-6666-555555555555';
const JANE_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
const JOHN_ID = 'bbbbbbbb-1111-2222-3333-444444444444';
const SAM_ID = 'cccccccc-1111-2222-3333-444444444444';
const GROUP_ID = '19:561082c0f3f847a58069deb8eb300807@thread.v2';
const ONE_ON_ONE_ID = '19:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_11111111-2222-3333-4444-555555555555@unq.gbl.spaces';

const DIRECTORY: Record<string, any[]> = {
  'jane doe': [{ id: JANE_ID, displayName: 'Jane Doe', mail: 'jdoe@example.com', userPrincipalName: 'jdoe@example.com' }],
  'jdoe@example.com': [{ id: JANE_ID, displayName: 'Jane Doe', mail: 'jdoe@example.com', userPrincipalName: 'jdoe@example.com' }],
  'john smith': [{ id: JOHN_ID, displayName: 'John Smith', mail: 'jsmith@example.com', userPrincipalName: 'jsmith@example.com' }],
  'sam@contoso.com': [{ id: SAM_ID, displayName: 'Sam Guest', mail: 'sam@contoso.com', userPrincipalName: 'sam_contoso.com#EXT#@yourtenant.onmicrosoft.com' }],
  'sam': [{ id: SAM_ID, displayName: 'Sam Guest', mail: 'sam@contoso.com', userPrincipalName: 'sam_contoso.com#EXT#@yourtenant.onmicrosoft.com' }],
  'me': [{ id: MY_ID, displayName: 'Me Myself', mail: 'me@example.com', userPrincipalName: 'me@example.com' }],
  'alex': [
    { id: 'd1', displayName: 'Alex One', mail: 'alex1@example.com', userPrincipalName: 'alex1@example.com' },
    { id: 'd2', displayName: 'Alex Two', mail: 'alex2@example.com', userPrincipalName: 'alex2@example.com' },
  ],
};

function member(userId: string, displayName = 'Someone') {
  return {
    '@odata.type': '#microsoft.graph.aadUserConversationMember',
    id: `MCMj${userId}`,
    roles: ['owner'],
    displayName,
    visibleHistoryStartDateTime: '0001-01-01T00:00:00Z',
    userId,
    email: `${displayName.toLowerCase().replace(' ', '.')}@example.com`,
    tenantId: '11111111-2222-3333-4444-555555555555',
  };
}

function groupChat(id: string, userIds: string[], topic: string | null = null) {
  return { id, topic, chatType: 'group', members: userIds.map((u) => member(u)) };
}

/**
 * Graph stub. `chatPages` is what successive GET /me/chats pages return;
 * `chat` is what GET /chats/{id} returns. Every GET query and POST is recorded.
 */
function createStub(opts: { chatPages?: any[][]; chat?: any } = {}) {
  const posts: Array<{ path: string; body: any }> = [];
  const chatQueries: Array<{ filter?: string; expand?: string; orderby?: string }> = [];
  const pages = opts.chatPages ?? [[]];

  const client = {
    api: (path: string) => {
      let term = '';
      const q: { filter?: string; expand?: string; orderby?: string } = {};
      const chain: any = {
        header: () => chain,
        count: () => chain,
        select: () => chain,
        top: () => chain,
        search: (s: string) => { term = (/displayName:([^"]+)"/.exec(s)?.[1] ?? '').toLowerCase(); return chain; },
        filter: (v: string) => { q.filter = v; return chain; },
        expand: (v: string) => { q.expand = v; return chain; },
        orderby: (v: string) => { q.orderby = v; return chain; },
        get: async () => {
          if (path === '/users') return { value: DIRECTORY[term] ?? [] };
          if (path === '/me/chats' || path.startsWith('next-page-')) {
            chatQueries.push(q);
            const index = path === '/me/chats' ? 0 : Number(path.slice('next-page-'.length));
            const value = pages[index] ?? [];
            return index + 1 < pages.length ? { value, '@odata.nextLink': `next-page-${index + 1}` } : { value };
          }
          if (path.startsWith('/chats/')) return opts.chat;
          return { value: [] };
        },
        post: async (body: any) => {
          posts.push({ path, body });
          if (path === '/chats') return { id: '19:newgroupchat000@thread.v2' };
          return { id: '1616965872395', webUrl: 'https://teams.microsoft.com/l/message/x' };
        },
      };
      return chain;
    },
  };

  return { client, posts, chatQueries };
}

function createService(stub: ReturnType<typeof createStub>) {
  const teams = {
    getGraphClient: vi.fn().mockResolvedValue(stub.client),
    getMe: vi.fn().mockResolvedValue({ id: MY_ID, displayName: 'Me Myself', userPrincipalName: 'me@example.com' }),
  } as unknown as TeamsService;
  return new GroupChatService(teams);
}

const messagePosts = (stub: ReturnType<typeof createStub>) => stub.posts.filter((p) => p.path.endsWith('/messages'));
const chatCreates = (stub: ReturnType<typeof createStub>) => stub.posts.filter((p) => p.path === '/chats');

describe('sendGroupMessage', () => {
  it('reuses the group chat whose members are exactly me plus the recipients', async () => {
    const stub = createStub({
      chatPages: [[
        groupChat('19:superset@thread.v2', [MY_ID, JANE_ID, JOHN_ID, SAM_ID]),
        groupChat('19:subset@thread.v2', [MY_ID, JANE_ID]),
        groupChat(GROUP_ID, [MY_ID, JOHN_ID, JANE_ID], 'Planning'),
      ]],
    });

    const result = await createService(stub).sendGroupMessage(['Jane Doe', 'John Smith'], 'hello both');

    expect(result.chatExisted).toBe(true);
    expect(result.chatId).toBe(GROUP_ID);
    expect(chatCreates(stub)).toEqual([]);
    expect(messagePosts(stub).map((p) => p.path)).toEqual([`/chats/${GROUP_ID}/messages`]);
    expect(stub.chatQueries[0]).toMatchObject({ filter: "chatType eq 'group'" });
    expect(stub.chatQueries[0].expand).toContain('members');
  });

  it('keeps looking on later pages before creating a chat', async () => {
    const stub = createStub({ chatPages: [[groupChat('19:other@thread.v2', [MY_ID, SAM_ID, JANE_ID])], [groupChat(GROUP_ID, [MY_ID, JANE_ID, JOHN_ID])]] });

    const result = await createService(stub).sendGroupMessage(['Jane Doe', 'John Smith'], 'hi');

    expect(result.chatId).toBe(GROUP_ID);
    expect(chatCreates(stub)).toEqual([]);
  });

  it('creates a group chat, with me in it, when none has exactly these people', async () => {
    const stub = createStub({ chatPages: [[groupChat('19:subset@thread.v2', [MY_ID, JANE_ID])]] });

    const result = await createService(stub).sendGroupMessage(['Jane Doe', 'John Smith'], 'hi');

    expect(result.chatExisted).toBe(false);
    const [create] = chatCreates(stub);
    expect(create.body.chatType).toBe('group');
    expect(create.body).not.toHaveProperty('topic');
    const binds = create.body.members.map((m: any) => m['user@odata.bind']);
    expect(binds).toEqual([MY_ID, JANE_ID, JOHN_ID].map((id) => `https://graph.microsoft.com/v1.0/users('${id}')`));
    expect(create.body.members.every((m: any) => m['@odata.type'] === '#microsoft.graph.aadUserConversationMember')).toBe(true);
    expect(messagePosts(stub).map((p) => p.path)).toEqual(['/chats/19:newgroupchat000@thread.v2/messages']);
  });

  it('with a topic, reuses only a chat of that name and otherwise creates a named one', async () => {
    const unnamed = createStub({ chatPages: [[groupChat(GROUP_ID, [MY_ID, JANE_ID, JOHN_ID])]] });
    const created = await createService(unnamed).sendGroupMessage(['Jane Doe', 'John Smith'], 'hi', { topic: 'Budget' });
    expect(created.chatExisted).toBe(false);
    expect(chatCreates(unnamed)[0].body.topic).toBe('Budget');

    const named = createStub({ chatPages: [[groupChat(GROUP_ID, [MY_ID, JANE_ID, JOHN_ID], 'budget')]] });
    const reused = await createService(named).sendGroupMessage(['Jane Doe', 'John Smith'], 'hi', { topic: 'Budget' });
    expect(reused.chatId).toBe(GROUP_ID);
    expect(chatCreates(named)).toEqual([]);
  });

  it('gives a guest the guest role, as Graph requires for an in-tenant guest', async () => {
    const stub = createStub();

    await createService(stub).sendGroupMessage(['Jane Doe', 'sam@contoso.com'], 'hi');

    const roles = Object.fromEntries(
      chatCreates(stub)[0].body.members.map((m: any) => [m['user@odata.bind'], m.roles])
    );
    expect(roles[`https://graph.microsoft.com/v1.0/users('${SAM_ID}')`]).toEqual(['guest']);
    expect(roles[`https://graph.microsoft.com/v1.0/users('${JANE_ID}')`]).toEqual(['owner']);
  });

  it('resolves everyone first and sends nothing when any one of them fails', async () => {
    const stub = createStub();

    const attempt = createService(stub).sendGroupMessage(['Jane Doe', 'Alex', 'Nobody Here', 'Sam'], 'hi');

    await expect(attempt).rejects.toThrow(/Nothing was sent/);
    await expect(createService(createStub()).sendGroupMessage(['Jane Doe', 'Alex', 'Nobody Here', 'Sam'], 'hi'))
      .rejects.toThrow(/Alex[\s\S]*Nobody Here[\s\S]*Sam/);
    expect(stub.posts).toEqual([]);
  });

  it('drops the signed-in user and duplicates, then needs at least two other people', async () => {
    const stub = createStub();

    await expect(createService(stub).sendGroupMessage(['Jane Doe', 'jdoe@example.com', 'me'], 'hi'))
      .rejects.toThrow(/send-direct-message/);
    expect(stub.posts).toEqual([]);
  });

  it('creates no chat when a mention in the message cannot be resolved', async () => {
    const stub = createStub();

    await expect(createService(stub).sendGroupMessage(['Jane Doe', 'John Smith'], '@[Ghost Person] hi'))
      .rejects.toThrow(/@\[Ghost Person\]/);
    expect(stub.posts).toEqual([]);
  });
});

describe('addChatMember', () => {
  const groupWithJane = { ...groupChat(GROUP_ID, [MY_ID, JANE_ID]) };

  it('adds the person with no chat history by default', async () => {
    const stub = createStub({ chat: groupWithJane });

    const result = await createService(stub).addChatMember(GROUP_ID, 'John Smith');

    expect(result.added).toBe(true);
    expect(stub.posts).toEqual([
      {
        path: `/chats/${GROUP_ID}/members`,
        body: {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${JOHN_ID}')`,
          roles: ['owner'],
        },
      },
    ]);
  });

  it('shares all history, or a number of days, when asked', async () => {
    const all = createStub({ chat: groupWithJane });
    await createService(all).addChatMember(GROUP_ID, 'John Smith', { shareHistory: 'all' });
    expect(all.posts[0].body.visibleHistoryStartDateTime).toBe('0001-01-01T00:00:00Z');

    const days = createStub({ chat: groupWithJane });
    const before = Date.now();
    await createService(days).addChatMember(GROUP_ID, 'John Smith', { shareHistory: 7 });
    const start = new Date(days.posts[0].body.visibleHistoryStartDateTime).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(start).toBeGreaterThanOrEqual(before - sevenDays - 1000);
    expect(start).toBeLessThanOrEqual(Date.now() - sevenDays + 1000);
  });

  it('refuses a one-on-one chat and changes nothing', async () => {
    const stub = createStub({ chat: { id: ONE_ON_ONE_ID, chatType: 'oneOnOne', members: [member(MY_ID), member(JANE_ID)] } });

    await expect(createService(stub).addChatMember(ONE_ON_ONE_ID, 'John Smith')).rejects.toThrow(/send-group-message/);
    expect(stub.posts).toEqual([]);
  });

  it('reports someone already in the chat without posting', async () => {
    const stub = createStub({ chat: groupWithJane });

    const result = await createService(stub).addChatMember(GROUP_ID, 'Jane Doe');

    expect(result.added).toBe(false);
    expect(result.alreadyMember).toBe(true);
    expect(stub.posts).toEqual([]);
  });

  it('adds a guest with the guest role, and only from their exact address', async () => {
    const byAddress = createStub({ chat: groupWithJane });
    await createService(byAddress).addChatMember(GROUP_ID, 'sam@contoso.com');
    expect(byAddress.posts[0].body.roles).toEqual(['guest']);

    const byName = createStub({ chat: groupWithJane });
    await expect(createService(byName).addChatMember(GROUP_ID, 'Sam')).rejects.toThrow(/guest/);
    expect(byName.posts).toEqual([]);
  });
});
