/**
 * Reactions on message reads
 *
 * The fixture is the shape Graph v1.0 returned live on 2026-10-08 for a thumbs-up
 * on a chat message, with the ids replaced: the emoji itself in reactionType, the
 * friendly name in displayName, and the reacting user's displayName null. That
 * null is why names are resolved afterwards.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
import { MessageService } from '../message-service.js';
import type { TeamsService } from '../teams-service.js';

const CHAT_ID = '19:561082c0f3f847a58069deb8eb300807@thread.v2';
const AUTHOR_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER_ID = '11111111-2222-3333-4444-555555555555';

function reaction(userId: string, emoji = '👍', name = 'Like') {
  return {
    reactionType: emoji,
    displayName: name,
    reactionContentUrl: null,
    createdDateTime: '2026-10-08T12:17:56.881Z',
    user: {
      application: null,
      device: null,
      user: {
        '@odata.type': '#microsoft.graph.teamworkUserIdentity',
        id: userId,
        displayName: null,
        userIdentityType: 'aadUser',
      },
    },
  };
}

function message(id: string, authorId: string, authorName: string, reactions: any[] = []) {
  return {
    id,
    createdDateTime: '2026-10-08T12:10:03.125Z',
    messageType: 'message',
    from: { user: { id: authorId, displayName: authorName } },
    body: { contentType: 'text', content: 'PR to approve pls' },
    reactions,
  };
}

/** A Graph stub that answers by path, so the message list and user lookups differ. */
function createService(routes: Record<string, any>) {
  const lookups: string[] = [];
  const client = {
    api: (path: string) => {
      const request: any = {
        top: () => request,
        select: () => request,
        orderby: () => request,
        filter: () => request,
        get: async () => {
          if (path.startsWith('/users/')) lookups.push(path);
          const result = routes[path];
          if (result instanceof Error) throw result;
          return result ?? { value: [] };
        },
      };
      return request;
    },
  };
  const teams = {
    getGraphClient: vi.fn().mockResolvedValue(client),
    getTeamId: (id?: string) => id ?? 'team',
    getChannelId: (id?: string) => id ?? 'channel',
  } as unknown as TeamsService;
  return { service: new MessageService(teams), lookups };
}

describe('reactions on chat messages', () => {
  it('maps the emoji, name and time, and names the reactor from an author in the same read', async () => {
    const { service, lookups } = createService({
      [`/chats/${CHAT_ID}/messages`]: {
        value: [
          message('1', OTHER_ID, 'Jane Doe', [reaction(AUTHOR_ID)]),
          message('2', AUTHOR_ID, 'Robin Kline'),
        ],
      },
    });

    const [first, second] = await service.getChatMessages(CHAT_ID);

    expect(first.reactions).toEqual([
      {
        emoji: '👍',
        name: 'Like',
        userId: AUTHOR_ID,
        userName: 'Robin Kline',
        createdDateTime: '2026-10-08T12:17:56.881Z',
      },
    ]);
    expect(second.reactions).toBeUndefined();
    expect(lookups).toEqual([]);
  });

  it('looks up a reactor who did not post in the read, once per user', async () => {
    const { service, lookups } = createService({
      [`/chats/${CHAT_ID}/messages`]: {
        value: [message('1', AUTHOR_ID, 'Robin Kline', [reaction(OTHER_ID), reaction(OTHER_ID, '❤️', 'Heart')])],
      },
      [`/users/${OTHER_ID}`]: { displayName: 'Jane Doe' },
    });

    const [first] = await service.getChatMessages(CHAT_ID);

    expect(first.reactions?.map((r) => r.userName)).toEqual(['Jane Doe', 'Jane Doe']);
    expect(lookups).toEqual([`/users/${OTHER_ID}`]);
  });

  it('keeps the reaction when the name lookup fails', async () => {
    const { service } = createService({
      [`/chats/${CHAT_ID}/messages`]: { value: [message('1', AUTHOR_ID, 'Robin Kline', [reaction(OTHER_ID)])] },
      [`/users/${OTHER_ID}`]: new Error('Request_ResourceNotFound'),
    });

    const [first] = await service.getChatMessages(CHAT_ID);

    expect(first.reactions?.[0]).toMatchObject({ emoji: '👍', userId: OTHER_ID, userName: undefined });
  });
});

describe('reactions on channel reads', () => {
  it('returns reactions on channel messages and on replies', async () => {
    const { service } = createService({
      '/teams/team/channels/channel/messages': { value: [message('1', AUTHOR_ID, 'Robin Kline', [reaction(AUTHOR_ID)])] },
      '/teams/team/channels/channel/messages/1/replies': {
        value: [message('2', OTHER_ID, 'Jane Doe', [reaction(AUTHOR_ID, '😆', 'Laugh')])],
      },
      [`/users/${AUTHOR_ID}`]: { displayName: 'Robin Kline' },
    });

    const [top] = await service.getChannelMessages();
    const [reply] = await service.getMessageReplies('1');

    expect(top.reactions?.[0]).toMatchObject({ emoji: '👍', userName: 'Robin Kline' });
    expect(reply.reactions?.[0]).toMatchObject({ emoji: '😆', name: 'Laugh', userName: 'Robin Kline' });
  });
});

describe('reaction name resolution edge cases', () => {
  it('looks up a reactor whose own message came with no author name', async () => {
    const nameless = { ...message('2', OTHER_ID, 'x'), from: { user: { id: OTHER_ID, displayName: null } } };
    const { service, lookups } = createService({
      [`/chats/${CHAT_ID}/messages`]: { value: [message('1', AUTHOR_ID, 'Robin Kline', [reaction(OTHER_ID)]), nameless] },
      [`/users/${OTHER_ID}`]: { displayName: 'Jane Doe' },
    });

    const [first] = await service.getChatMessages(CHAT_ID);

    expect(first.reactions?.[0].userName).toBe('Jane Doe');
    expect(lookups).toEqual([`/users/${OTHER_ID}`]);
  });

  it('keeps a reaction from an app, which has no user id, without a lookup', async () => {
    const appReaction = { ...reaction(AUTHOR_ID), user: { application: { id: 'app' }, device: null, user: null } };
    const { service, lookups } = createService({
      [`/chats/${CHAT_ID}/messages`]: { value: [message('1', AUTHOR_ID, 'Robin Kline', [appReaction])] },
    });

    const [first] = await service.getChatMessages(CHAT_ID);

    expect(first.reactions?.[0]).toMatchObject({ emoji: '👍', userId: undefined, userName: undefined });
    expect(lookups).toEqual([]);
  });

  it('caps name lookups at 50 per read', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    const routes: Record<string, any> = {
      [`/chats/${CHAT_ID}/messages`]: { value: [message('1', AUTHOR_ID, 'Robin Kline', ids.map((id) => reaction(id)))] },
    };
    for (const id of ids) routes[`/users/${id}`] = { displayName: `User ${id.slice(-2)}` };
    const { service, lookups } = createService(routes);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const [first] = await service.getChatMessages(CHAT_ID);

    expect(lookups).toHaveLength(50);
    expect(first.reactions?.filter((r) => r.userName)).toHaveLength(50);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('50 of 60'));
  });

  it('runs at most 5 lookups at once', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    let inFlight = 0;
    let peak = 0;
    const client = {
      api: (path: string) => {
        const request: any = {
          top: () => request,
          select: () => request,
          get: async () => {
            if (!path.startsWith('/users/')) {
              return { value: [message('1', AUTHOR_ID, 'Robin Kline', ids.map((id) => reaction(id)))] };
            }
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight--;
            return { displayName: 'Someone' };
          },
        };
        return request;
      },
    };
    const teams = { getGraphClient: vi.fn().mockResolvedValue(client) } as unknown as TeamsService;

    await new MessageService(teams).getChatMessages(CHAT_ID);

    expect(peak).toBe(5);
  });

  it('gives up on a lookup that never answers and still returns the read', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      api: (path: string) => {
        const request: any = {
          top: () => request,
          select: () => request,
          get: () =>
            path.startsWith('/users/')
              ? new Promise(() => {})
              : Promise.resolve({ value: [message('1', AUTHOR_ID, 'Robin Kline', [reaction(OTHER_ID)])] }),
        };
        return request;
      },
    };
    const teams = { getGraphClient: vi.fn().mockResolvedValue(client) } as unknown as TeamsService;

    const read = new MessageService(teams).getChatMessages(CHAT_ID);
    await vi.advanceTimersByTimeAsync(10_000);
    const [first] = await read;

    expect(first.reactions?.[0]).toMatchObject({ userId: OTHER_ID, userName: undefined });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });

  it('stops starting lookups once the overall budget is spent', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ids = Array.from({ length: 15 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    let calls = 0;
    const client = {
      api: (path: string) => {
        const request: any = {
          top: () => request,
          select: () => request,
          get: () => {
            if (!path.startsWith('/users/')) {
              return Promise.resolve({ value: [message('1', AUTHOR_ID, 'Robin Kline', ids.map((id) => reaction(id)))] });
            }
            calls++;
            return new Promise(() => {});
          },
        };
        return request;
      },
    };
    const teams = { getGraphClient: vi.fn().mockResolvedValue(client) } as unknown as TeamsService;

    const read = new MessageService(teams).getChatMessages(CHAT_ID);
    await vi.advanceTimersByTimeAsync(30_000);
    await read;

    // Batches start at 0 s and 10 s; the third would start at 20 s, past the 15 s budget.
    expect(calls).toBe(10);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('stopped name lookups after 10 of 15'));
  });
});

describe('reactions on channel delta reads', () => {
  it('maps and names reactions across the delta walk', async () => {
    const { service } = createService({
      '/teams/team/channels/channel/messages/delta': {
        value: [message('1', AUTHOR_ID, 'Robin Kline', [reaction(OTHER_ID)])],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/delta-link',
      },
      [`/users/${OTHER_ID}`]: { displayName: 'Jane Doe' },
    });

    const result = await service.getChannelMessagesDelta();

    expect(result.messages[0].reactions?.[0]).toMatchObject({ emoji: '👍', userName: 'Jane Doe' });
  });
});
