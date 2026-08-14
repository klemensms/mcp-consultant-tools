/**
 * SearchService tests
 *
 * The failure modes pinned here:
 *   - chatMessage is not in the v1.0 entityType enum, so the request needs the
 *     Prefer: include-unknown-enum-members header or Graph rejects it outright.
 *   - Search hits carry the sender as from.emailAddress, NOT the from.user shape
 *     the message endpoints return. Mapping one through the message mapper renders
 *     every hit as an unattributed "Unknown", which looks like a permission problem
 *     rather than a mapping bug.
 *   - A hit names its deep link `webLink`, not the `webUrl` every other message
 *     endpoint uses. Reading the wrong property is silent: the field is simply
 *     absent, so every hit comes back linkless with nothing to say why. Live
 *     verification on 2026-08-13 found exactly that, against a fixture here that
 *     had been copied from the Graph reference and said `webUrl`.
 *   - channelIdentity.teamId is not always the group id the read endpoints accept.
 *     A private-channel hit carries that channel's own backing group, and
 *     GET /teams/{that} answers "Group ID ... is not found" - an error that reads
 *     like a permission problem rather than a wrong argument.
 *   - EVERY hit carries both chatId and channelIdentity, whichever kind it is:
 *     a chat hit repeats its chat id in channelIdentity.channelId, and a channel
 *     hit repeats its channel id in chatId. Only channelIdentity.teamId tells the
 *     two apart. Treating "has a channelId" as "is a channel hit" therefore runs
 *     every chat hit through channel placement, where it cannot be found, so it
 *     renders as a channel whose team is unidentifiable while its chat id was
 *     usable all along. Fixtures below carry both fields for that reason: the
 *     shapes here are what a live tenant returned on 2026-08-14, not what the
 *     Graph reference documents.
 */

import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../search-service.js';
import type { TeamsService } from '../teams-service.js';

const TEAM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER_TEAM_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
/** What a private channel's hit reports as its "team": the channel's own group. */
const HIDDEN_GROUP_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
const CHANNEL_ID = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';
const PRIVATE_CHANNEL_ID = '19:8f4d2b1c9a7e4f3b8c6d5e2a1b0c9d8e@thread.tacv2';
const CHAT_ID = '19:561082c0f3f847a58069deb8eb300807@thread.v2';

/**
 * `channels` maps a team id to the channels it holds, and doubles as the list of
 * teams the signed-in user is in - which is what settles a hit's team id.
 */
function createService(
  response: any,
  channels: Record<string, string[]> = { [TEAM_ID]: [CHANNEL_ID] }
) {
  const calls = {
    path: '' as string,
    headers: {} as Record<string, string>,
    body: undefined as any,
    listedChannelsFor: [] as string[],
  };

  const chain: any = {
    header: (k: string, v: string) => { calls.headers[k] = v; return chain; },
    post: async (body: any) => { calls.body = body; return response; },
  };

  const client = { api: (path: string) => { calls.path = path; return chain; } };

  const teams = {
    getGraphClient: vi.fn().mockResolvedValue(client),
    listTeams: vi.fn().mockImplementation(async () =>
      Object.keys(channels).map((id) => ({ id, displayName: `Team ${id.slice(0, 4)}` }))
    ),
    listChannels: vi.fn().mockImplementation(async (teamId: string) => {
      calls.listedChannelsFor.push(teamId);
      return (channels[teamId] ?? []).map((id) => ({ id, displayName: 'Channel' }));
    }),
  } as unknown as TeamsService;

  return { service: new SearchService(teams), calls, teams };
}

/** Hit shape as Graph actually returns it for entityTypes: ["chatMessage"]. */
function channelHit(channelIdentity: { teamId: string; channelId: string } = { teamId: TEAM_ID, channelId: CHANNEL_ID }) {
  return {
    hitId: '1616965872395',
    rank: 1,
    summary: 'We should discuss the <c0>budget</c0> next week',
    resource: {
      id: '1616965872395',
      createdDateTime: '2021-03-28T21:11:12.395Z',
      webLink: 'https://teams.microsoft.com/l/message/19%3Aabc/1616965872395',
      from: { emailAddress: { name: 'Robin Kline', address: 'rkline@example.com' } },
      body: { contentType: 'html', content: '<div>We should discuss the budget next week</div>' },
      channelIdentity,
      // A channel hit repeats its channel id here. Live shape, not documented.
      chatId: channelIdentity.channelId,
    },
  };
}

function chatHit() {
  return {
    hitId: '1616990032035',
    rank: 2,
    summary: 'the <c0>budget</c0> is signed off',
    resource: {
      id: '1616990032035',
      createdDateTime: '2021-03-29T09:00:00.000Z',
      chatId: CHAT_ID,
      from: { emailAddress: { name: 'Peter Parker', address: 'pparker@example.com' } },
      body: { contentType: 'text', content: 'the budget is signed off' },
      // A chat hit still carries channelIdentity, holding the chat id again and
      // no teamId. Its absence is the only thing marking this as a chat.
      channelIdentity: { channelId: CHAT_ID },
    },
  };
}

function searchResponse(hits: any[], extra: Record<string, any> = {}) {
  return {
    value: [{ hitsContainers: [{ hits, total: hits.length, moreResultsAvailable: false, ...extra }] }],
  };
}

describe('SearchService.searchMessages', () => {
  it('posts to /search/query with the forward-compatible enum header', async () => {
    const { service, calls } = createService(searchResponse([]));

    await service.searchMessages('budget');

    expect(calls.path).toBe('/search/query');
    expect(calls.headers.Prefer).toBe('include-unknown-enum-members');
  });

  it('requests the chatMessage entity type and nothing else', async () => {
    const { service, calls } = createService(searchResponse([]));

    await service.searchMessages('budget');

    expect(calls.body.requests).toHaveLength(1);
    expect(calls.body.requests[0].entityTypes).toEqual(['chatMessage']);
    expect(calls.body.requests[0].query).toEqual({ queryString: 'budget' });
  });

  it('clamps top and floors from, and sends them as Graph\'s size/from', async () => {
    const { service, calls } = createService(searchResponse([]));

    await service.searchMessages('budget', { top: 5000, from: -10 });

    // The tool parameter is `top` for consistency with every other read in the
    // package; the wire field stays `size`, which is what /search/query accepts.
    expect(calls.body.requests[0].size).toBe(50);
    expect(calls.body.requests[0].from).toBe(0);
  });

  it('rejects an empty query rather than searching for everything', async () => {
    const { service } = createService(searchResponse([]));

    await expect(service.searchMessages('   ')).rejects.toThrow(/empty/i);
  });

  it('maps the sender from from.emailAddress, not the from.user shape', async () => {
    const { service } = createService(searchResponse([channelHit()]));

    const result = await service.searchMessages('budget');

    expect(result.hits[0].authorName).toBe('Robin Kline');
    expect(result.hits[0].authorAddress).toBe('rkline@example.com');
  });

  it('carries the team and channel ids a channel hit needs for a follow-up read', async () => {
    const { service } = createService(searchResponse([channelHit()]));

    const result = await service.searchMessages('budget');

    expect(result.hits[0].teamId).toBe(TEAM_ID);
    expect(result.hits[0].channelId).toBe(CHANNEL_ID);
    expect(result.hits[0].chatId).toBeUndefined();
  });

  it('carries the chat id for a chat hit', async () => {
    const { service } = createService(searchResponse([chatHit()]));

    const result = await service.searchMessages('budget');

    expect(result.hits[0].chatId).toBe(CHAT_ID);
    expect(result.hits[0].teamId).toBeUndefined();
  });

  it('does not report a chat hit as a channel, even though it carries a channelId', async () => {
    const { service } = createService(searchResponse([chatHit()]));

    const result = await service.searchMessages('budget');

    // The chat id is repeated in channelIdentity.channelId. Passing it on would
    // tell the caller to read a channel that does not exist, when chatId works.
    expect(result.hits[0].channelId).toBeUndefined();
  });

  it('does not walk teams looking for a chat hit it will never find there', async () => {
    const { service, calls, teams } = createService(searchResponse([chatHit()]));

    await service.searchMessages('budget');

    // Placement is for channel hits. Running chat hits through it costs a
    // listChannels call per joined team on every search that returns one.
    expect(teams.listTeams).not.toHaveBeenCalled();
    expect(calls.listedChannelsFor).toEqual([]);
  });

  it('reads the deep link from webLink, which is what a hit actually carries', async () => {
    const { service } = createService(searchResponse([channelHit()]));

    const result = await service.searchMessages('budget');

    expect(result.hits[0].webUrl).toBe(
      'https://teams.microsoft.com/l/message/19%3Aabc/1616965872395'
    );
  });

  it('still reads webUrl if a hit ever carries one instead', async () => {
    const hit = channelHit();
    delete (hit.resource as any).webLink;
    (hit.resource as any).webUrl = 'https://teams.microsoft.com/l/message/19%3Aabc/999';

    const { service } = createService(searchResponse([hit]));

    const result = await service.searchMessages('budget');

    expect(result.hits[0].webUrl).toBe('https://teams.microsoft.com/l/message/19%3Aabc/999');
  });
});

describe('SearchService channel team ids', () => {
  it('keeps the team id when it is one the signed-in user is actually in', async () => {
    const { service, calls } = createService(searchResponse([channelHit()]));

    const result = await service.searchMessages('budget');

    expect(result.hits[0].teamId).toBe(TEAM_ID);
    // Membership settles it. Walking channels is the expensive path and must not
    // run when the id Graph returned was already usable.
    expect(calls.listedChannelsFor).toEqual([]);
  });

  it('replaces a private channel\'s backing group with the team that holds it', async () => {
    const { service } = createService(
      searchResponse([channelHit({ teamId: HIDDEN_GROUP_ID, channelId: PRIVATE_CHANNEL_ID })]),
      { [TEAM_ID]: [CHANNEL_ID], [OTHER_TEAM_ID]: [PRIVATE_CHANNEL_ID] }
    );

    const result = await service.searchMessages('budget');

    expect(result.hits[0].teamId).toBe(OTHER_TEAM_ID);
  });

  it('stops walking teams once every unplaced channel has been found', async () => {
    const { service, calls } = createService(
      searchResponse([channelHit({ teamId: HIDDEN_GROUP_ID, channelId: CHANNEL_ID })]),
      { [TEAM_ID]: [CHANNEL_ID], [OTHER_TEAM_ID]: [PRIVATE_CHANNEL_ID] }
    );

    await service.searchMessages('budget');

    expect(calls.listedChannelsFor).toEqual([TEAM_ID]);
  });

  it('drops the team id rather than returning one no read will accept', async () => {
    const { service } = createService(
      searchResponse([channelHit({ teamId: HIDDEN_GROUP_ID, channelId: PRIVATE_CHANNEL_ID })]),
      { [TEAM_ID]: [CHANNEL_ID] }
    );

    const result = await service.searchMessages('budget');

    expect(result.hits[0].teamId).toBeUndefined();
    expect(result.hits[0].channelId).toBe(PRIVATE_CHANNEL_ID);
  });

  it('returns the hits, minus unconfirmed team ids, when the team lookup fails', async () => {
    const { service, teams } = createService(searchResponse([channelHit()]));
    (teams.listTeams as any).mockRejectedValue(new Error('Insufficient privileges'));

    const result = await service.searchMessages('budget');

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].teamId).toBeUndefined();
  });

  it('strips the <c0> hit-highlight markers from the summary', async () => {
    const { service } = createService(searchResponse([channelHit()]));

    const result = await service.searchMessages('budget');

    expect(result.hits[0].summary).not.toMatch(/<\/?c\d+>/);
    expect(result.hits[0].summary).toContain('budget');
  });

  it('flattens the body HTML to readable text', async () => {
    const { service } = createService(searchResponse([channelHit()]));

    const result = await service.searchMessages('budget');

    expect(result.hits[0].text).toBe('We should discuss the budget next week');
  });

  it('reports the total and the more-results flag', async () => {
    const { service } = createService(
      searchResponse([channelHit()], { total: 340, moreResultsAvailable: true })
    );

    const result = await service.searchMessages('budget');

    expect(result.totalMatches).toBe(340);
    expect(result.moreResultsAvailable).toBe(true);
  });

  it('survives an empty response without a hitsContainer', async () => {
    const { service } = createService({ value: [{}] });

    const result = await service.searchMessages('budget');

    expect(result.hits).toEqual([]);
    expect(result.moreResultsAvailable).toBe(false);
  });
});
