/**
 * @-mention coverage across every outbound path
 *
 * The failure this file exists to prevent is a MISSED PATH. There are four ways to
 * send a message from this package, they live on three different services, and
 * three of them were wired for mentions in one change - so the realistic bug is
 * not "mentions are broken" but "mentions work everywhere except reply-to-message".
 * A per-service test would not catch that; enumerating the paths in one table does.
 *
 * If a fifth send path is ever added, add it here.
 */

import { describe, it, expect, vi } from 'vitest';
import { TeamsService } from '../teams-service.js';
import { MessageService } from '../message-service.js';
import { PeopleService } from '../people-service.js';

const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEAM_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const CHANNEL_ID = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';
const CHAT_ID = '19:561082c0f3f847a58069deb8eb300807@thread.v2';
const MY_USER_ID = '99999999-8888-7777-6666-555555555555';
const JANE_ID = 'aaaaaaaa-1111-2222-3333-444444444444';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, default: actual, homedir: () => '/tmp/mcp-teams-mentions-test-home' };
});

vi.mock('../../auth/token-cache.js', () => ({
  TokenCache: class {
    createPlugin() { return {}; }
    exists() { return false; }
    clear() {}
    getCachePath() { return '/tmp/mcp-teams-mentions-test-home/cache.enc'; }
  },
}));

const JANE = {
  id: JANE_ID,
  displayName: 'Jane Doe',
  mail: 'jdoe@example.com',
  userPrincipalName: 'jdoe@example.com',
};

/**
 * Graph stub that answers the directory lookup, the one-on-one chat lookup, and
 * records every POST so the message payload can be inspected.
 */
function createStub() {
  const posts: Array<{ path: string; body: any }> = [];

  const client = {
    api: (path: string) => {
      let term = '';
      const chain: any = {
        header: () => chain,
        count: () => chain,
        select: () => chain,
        // Term-aware: only Jane exists. The directory must answer per-term rather
        // than always returning her, because send-direct-message resolves the
        // RECIPIENT before it resolves any mention in the body - a stub that says
        // yes to everything cannot tell those two lookups apart.
        search: (s: string) => { term = (/displayName:([^"]+)"/.exec(s)?.[1] ?? '').toLowerCase(); return chain; },
        top: () => chain,
        filter: () => chain,
        expand: () => chain,
        get: async () => {
          if (path === '/users') {
            return { value: term === 'jane doe' || term === 'jdoe@example.com' ? [JANE] : [] };
          }
          if (path === '/me/chats') {
            return {
              value: [
                {
                  id: CHAT_ID,
                  chatType: 'oneOnOne',
                  members: [{ userId: JANE_ID }, { userId: MY_USER_ID }],
                },
              ],
            };
          }
          return { value: [] };
        },
        post: async (body: any) => {
          posts.push({ path, body });
          return { id: '1616965872395', webUrl: 'https://teams.microsoft.com/l/message/x' };
        },
      };
      return chain;
    },
  };

  return { client, posts };
}

function createTeamsService(client: any): TeamsService {
  const service = new TeamsService({
    authMode: 'device-code',
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    defaultTeamId: TEAM_ID,
    defaultChannelId: CHANNEL_ID,
  });
  vi.spyOn(service, 'getGraphClient').mockResolvedValue(client);
  vi.spyOn(service, 'getMe').mockResolvedValue({
    id: MY_USER_ID,
    displayName: 'Me',
    userPrincipalName: 'me@example.com',
  });
  return service;
}

/** The four ways a message leaves this package. */
const OUTBOUND_PATHS: Array<{
  name: string;
  send: (teams: TeamsService, content: string) => Promise<unknown>;
}> = [
  {
    name: 'send-channel-message',
    send: (teams, content) => teams.sendChannelMessage(content, {}),
  },
  {
    name: 'reply-to-message',
    send: (teams, content) => new MessageService(teams).replyToMessage('1616965872395', content, {}),
  },
  {
    name: 'send-chat-message',
    send: (teams, content) => new MessageService(teams).sendChatMessage(CHAT_ID, content, {}),
  },
  {
    name: 'send-direct-message',
    send: (teams, content) => new PeopleService(teams).sendDirectMessage('Jane Doe', content, {}),
  },
];

describe.each(OUTBOUND_PATHS)('$name', ({ send }) => {
  it('sends the <at> element and the matching mentions entry together', async () => {
    const stub = createStub();
    const teams = createTeamsService(stub.client);

    await send(teams, '@[Jane Doe] please review');

    // The message POST is the last one - send-direct-message may POST a chat first.
    const message = stub.posts[stub.posts.length - 1];

    expect(message.body.body.contentType).toBe('html');
    expect(message.body.body.content).toContain('<at id="0">Jane Doe</at>');
    expect(message.body.mentions).toEqual([
      {
        id: 0,
        mentionText: 'Jane Doe',
        mentioned: { user: { displayName: 'Jane Doe', id: JANE_ID, userIdentityType: 'aadUser' } },
      },
    ]);
  });

  it('omits the mentions key entirely when nobody is mentioned', async () => {
    const stub = createStub();
    const teams = createTeamsService(stub.client);

    await send(teams, 'just a normal **message**');

    const message = stub.posts[stub.posts.length - 1];

    expect(message.body.body.content).toContain('<strong>message</strong>');
    expect(message.body).not.toHaveProperty('mentions');
  });

  it('names the unresolvable marker and posts no message at all', async () => {
    const stub = createStub();
    const teams = createTeamsService(stub.client);

    await expect(send(teams, '@[Ghost Person] hi')).rejects.toThrow(/@\[Ghost Person\]/);

    // A half-sent message is the worst outcome here: the body would carry a
    // literal marker, or an <at> pointing at nobody.
    expect(stub.posts.filter((p) => p.body?.body)).toEqual([]);
  });
});
