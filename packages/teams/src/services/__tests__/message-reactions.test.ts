/**
 * Reactions on message reads
 *
 * The fixture is the shape Graph v1.0 returned live on 2026-10-08 for a thumbs-up
 * on a chat message, with the ids replaced: the emoji itself in reactionType, the
 * friendly name in displayName, and the reacting user's displayName null. That
 * null is why names are resolved afterwards.
 */

import { describe, it, expect, vi } from 'vitest';
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
