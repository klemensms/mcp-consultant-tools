/**
 * PeopleService tests
 *
 * Same rationale as message-service.test.ts: wrong path/query/body and mishandled
 * response shapes are catchable without credentials; permission failures are not.
 * Response fixtures are real payloads from the Graph v1.0 reference.
 *
 * The assertions that matter most here are the negative ones:
 *   - $search on /users without BOTH ConsistencyLevel: eventual and $count=true is
 *     rejected by Graph, and neither is visible in the resulting error text.
 *   - send-direct-message must not POST /chats when a one-on-one chat already
 *     exists, because a caller reading "new chat opened" would go looking for a
 *     thread that is not new.
 */

import { describe, it, expect, vi } from 'vitest';
import { PeopleService } from '../people-service.js';
import type { TeamsService } from '../teams-service.js';

const MY_USER_ID = '99999999-8888-7777-6666-555555555555';
const THEIR_USER_ID = 'd74fc2ed-cb0e-4288-a219-b5c71abaf2aa';
const ONE_ON_ONE_CHAT_ID = `19:${THEIR_USER_ID}_${MY_USER_ID}@unq.gbl.spaces`;

interface RecordedRequest {
  path: string;
  headers: Record<string, string>;
  count?: boolean;
  search?: string;
  select?: string;
  top?: number;
  filter?: string;
  expand?: string;
  method?: 'get' | 'post';
  body?: any;
}

/**
 * Records every request in the fluent Graph chain, in order, so a multi-step
 * operation like sendDirectMessage can be asserted step by step.
 */
function createGraphStub(responder: (req: RecordedRequest) => any) {
  const requests: RecordedRequest[] = [];

  const client = {
    api: (path: string) => {
      const req: RecordedRequest = { path, headers: {} };
      requests.push(req);

      const chain: any = {
        header: (k: string, v: string) => { req.headers[k] = v; return chain; },
        count: (v: boolean) => { req.count = v; return chain; },
        search: (v: string) => { req.search = v; return chain; },
        select: (v: string) => { req.select = v; return chain; },
        top: (n: number) => { req.top = n; return chain; },
        filter: (v: string) => { req.filter = v; return chain; },
        expand: (v: string) => { req.expand = v; return chain; },
        get: async () => { req.method = 'get'; return responder(req); },
        post: async (body: any) => { req.method = 'post'; req.body = body; return responder(req); },
      };

      return chain;
    },
  };

  return { requests, client };
}

function createService(responder: (req: RecordedRequest) => any) {
  const stub = createGraphStub(responder);

  const teams = {
    getGraphClient: vi.fn().mockResolvedValue(stub.client),
    getMe: vi.fn().mockResolvedValue({
      id: MY_USER_ID,
      displayName: 'Jane Doe',
      userPrincipalName: 'jdoe@example.com',
    }),
  } as unknown as TeamsService;

  return { service: new PeopleService(teams), requests: stub.requests };
}

/** Real user payload shape from the Graph "List users" reference. */
function user(id: string, displayName: string, mail: string) {
  return { id, displayName, mail, userPrincipalName: mail, jobTitle: 'Consultant' };
}

/** Real chat payload shape from the Graph "List chats" reference, $expand=members. */
function oneOnOneChat(id: string, memberUserIds: string[]) {
  return {
    id,
    topic: null,
    chatType: 'oneOnOne',
    members: memberUserIds.map((userId) => ({
      '@odata.type': '#microsoft.graph.aadUserConversationMember',
      id: 'opaque-membership-id',
      roles: [],
      displayName: 'Someone',
      userId,
      email: 'someone@example.com',
    })),
  };
}

describe('PeopleService.findUsers', () => {
  it('sends ConsistencyLevel: eventual AND $count=true - Graph rejects $search without both', async () => {
    const { service, requests } = createService(() => ({
      value: [user(THEIR_USER_ID, 'Peter Parker', 'pparker@example.com')],
    }));

    await service.findUsers('Peter');

    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe('/users');
    expect(requests[0].headers.ConsistencyLevel).toBe('eventual');
    expect(requests[0].count).toBe(true);
  });

  it('searches display name, mail and UPN so an email or a name both resolve', async () => {
    const { service, requests } = createService(() => ({ value: [] }));

    await service.findUsers('pparker@example.com');

    expect(requests[0].search).toContain('displayName:pparker@example.com');
    expect(requests[0].search).toContain('mail:pparker@example.com');
    expect(requests[0].search).toContain('userPrincipalName:pparker@example.com');
  });

  it('strips quotes and backslashes, which would break out of the quoted clause', async () => {
    const { service, requests } = createService(() => ({ value: [] }));

    await service.findUsers('Pe"ter\\');

    expect(requests[0].search).not.toContain('Pe"ter');
    expect(requests[0].search).toContain('displayName:Peter');
  });

  it('rejects a term that is empty once sanitized, rather than searching for nothing', async () => {
    const { service } = createService(() => ({ value: [] }));

    await expect(service.findUsers('""')).rejects.toThrow(/empty/i);
  });

  it('clamps top to the maximum', async () => {
    const { service, requests } = createService(() => ({ value: [] }));

    await service.findUsers('Peter', { top: 500 });

    expect(requests[0].top).toBe(25);
  });

  it('maps the Graph response onto reader-facing fields', async () => {
    const { service } = createService(() => ({
      value: [user(THEIR_USER_ID, 'Peter Parker', 'pparker@example.com')],
    }));

    const users = await service.findUsers('Peter');

    expect(users).toEqual([
      {
        id: THEIR_USER_ID,
        displayName: 'Peter Parker',
        userPrincipalName: 'pparker@example.com',
        mail: 'pparker@example.com',
        jobTitle: 'Consultant',
      },
    ]);
  });
});

describe('PeopleService.resolveUser', () => {
  it('resolves when exactly one user matches', async () => {
    const { service } = createService(() => ({
      value: [user(THEIR_USER_ID, 'Peter Parker', 'pparker@example.com')],
    }));

    const resolved = await service.resolveUser('Peter');

    expect(resolved.id).toBe(THEIR_USER_ID);
  });

  it('refuses to guess between several matches, and names the candidates', async () => {
    const { service } = createService(() => ({
      value: [
        user('id-1', 'Peter Parker', 'pparker@example.com'),
        user('id-2', 'Peter Quill', 'pquill@example.com'),
      ],
    }));

    await expect(service.resolveUser('Peter')).rejects.toThrow(/matches 2 users/);
    await expect(service.resolveUser('Peter')).rejects.toThrow(/pparker@example.com/);
  });

  it('an exact email match wins over partial hits', async () => {
    const { service } = createService(() => ({
      value: [
        user('id-1', 'Peter Parker', 'pparker@example.com'),
        user('id-2', 'Peter Quill', 'pquill@example.com'),
      ],
    }));

    const resolved = await service.resolveUser('pquill@example.com');

    expect(resolved.id).toBe('id-2');
  });

  it('explains the miss rather than returning nothing', async () => {
    const { service } = createService(() => ({ value: [] }));

    await expect(service.resolveUser('Nobody')).rejects.toThrow(/No user found/);
  });
});

describe('PeopleService.findOneOnOneChat', () => {
  it('filters to one-on-one chats and expands members - the ids are only in the expansion', async () => {
    const { service, requests } = createService(() => ({ value: [] }));

    await service.findOneOnOneChat(THEIR_USER_ID);

    expect(requests[0].path).toBe('/me/chats');
    expect(requests[0].filter).toBe("chatType eq 'oneOnOne'");
    expect(requests[0].expand).toBe('members');
  });

  it('matches on member userId', async () => {
    const { service } = createService(() => ({
      value: [
        oneOnOneChat('19:someone-else@unq.gbl.spaces', ['other-id', MY_USER_ID]),
        oneOnOneChat(ONE_ON_ONE_CHAT_ID, [THEIR_USER_ID, MY_USER_ID]),
      ],
    }));

    expect(await service.findOneOnOneChat(THEIR_USER_ID)).toBe(ONE_ON_ONE_CHAT_ID);
  });

  it('follows nextLink when the match is not on the first page', async () => {
    const { service } = createService((req) =>
      req.path === '/me/chats'
        ? {
            value: [oneOnOneChat('19:page-one@unq.gbl.spaces', ['other-id', MY_USER_ID])],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/chats?$skiptoken=abc',
          }
        : { value: [oneOnOneChat(ONE_ON_ONE_CHAT_ID, [THEIR_USER_ID, MY_USER_ID])] }
    );

    expect(await service.findOneOnOneChat(THEIR_USER_ID)).toBe(ONE_ON_ONE_CHAT_ID);
  });

  it('returns null rather than throwing when there is no existing chat', async () => {
    const { service } = createService(() => ({ value: [] }));

    expect(await service.findOneOnOneChat(THEIR_USER_ID)).toBeNull();
  });
});

describe('PeopleService.sendDirectMessage', () => {
  const RESOLVED = { value: [user(THEIR_USER_ID, 'Peter Parker', 'pparker@example.com')] };

  it('reuses an existing one-on-one chat and does NOT create a second one', async () => {
    const { service, requests } = createService((req) => {
      if (req.path === '/users') return RESOLVED;
      if (req.path === '/me/chats') {
        return { value: [oneOnOneChat(ONE_ON_ONE_CHAT_ID, [THEIR_USER_ID, MY_USER_ID])] };
      }
      return { id: '1616965872395', webUrl: 'https://teams.microsoft.com/l/message/x' };
    });

    const result = await service.sendDirectMessage('Peter', 'Hello');

    // The whole point of the lookup: no chat creation on this path.
    expect(requests.some((r) => r.path === '/chats' && r.method === 'post')).toBe(false);
    expect(result.chatExisted).toBe(true);
    expect(result.chatId).toBe(ONE_ON_ONE_CHAT_ID);
    expect(result.messageId).toBe('1616965872395');
  });

  it('creates a one-on-one chat only when none exists, binding both members', async () => {
    const { service, requests } = createService((req) => {
      if (req.path === '/users') return RESOLVED;
      if (req.path === '/me/chats') return { value: [] };
      if (req.path === '/chats') return { id: ONE_ON_ONE_CHAT_ID };
      return { id: '1616965872395' };
    });

    const result = await service.sendDirectMessage('Peter', 'Hello');

    const create = requests.find((r) => r.path === '/chats' && r.method === 'post');
    expect(create).toBeDefined();
    expect(create!.body.chatType).toBe('oneOnOne');
    expect(create!.body.members).toHaveLength(2);
    expect(create!.body.members[0]['user@odata.bind']).toContain(MY_USER_ID);
    expect(create!.body.members[1]['user@odata.bind']).toContain(THEIR_USER_ID);
    expect(result.chatExisted).toBe(false);
  });

  it('posts into the resolved chat, routing markdown through the sanitizer', async () => {
    const { service, requests } = createService((req) => {
      if (req.path === '/users') return RESOLVED;
      if (req.path === '/me/chats') {
        return { value: [oneOnOneChat(ONE_ON_ONE_CHAT_ID, [THEIR_USER_ID, MY_USER_ID])] };
      }
      return { id: '1616965872395' };
    });

    await service.sendDirectMessage('Peter', '**bold**');

    const post = requests.find((r) => r.path === `/chats/${ONE_ON_ONE_CHAT_ID}/messages`);
    expect(post).toBeDefined();
    expect(post!.body.body.contentType).toBe('html');
    expect(post!.body.body.content).toContain('<strong>bold</strong>');
  });

  it('sends plain text unconverted when format is text', async () => {
    const { service, requests } = createService((req) => {
      if (req.path === '/users') return RESOLVED;
      if (req.path === '/me/chats') {
        return { value: [oneOnOneChat(ONE_ON_ONE_CHAT_ID, [THEIR_USER_ID, MY_USER_ID])] };
      }
      return { id: '1616965872395' };
    });

    await service.sendDirectMessage('Peter', '**bold**', { format: 'text' });

    const post = requests.find((r) => r.path === `/chats/${ONE_ON_ONE_CHAT_ID}/messages`);
    expect(post!.body.body).toEqual({ contentType: 'text', content: '**bold**' });
  });

  it('does not send anything when the recipient is ambiguous', async () => {
    const { service, requests } = createService(() => ({
      value: [
        user('id-1', 'Peter Parker', 'pparker@example.com'),
        user('id-2', 'Peter Quill', 'pquill@example.com'),
      ],
    }));

    await expect(service.sendDirectMessage('Peter', 'Hello')).rejects.toThrow(/matches 2 users/);

    expect(requests.every((r) => r.method !== 'post')).toBe(true);
  });
});
