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
 */

import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../search-service.js';
import type { TeamsService } from '../teams-service.js';

const TEAM_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CHANNEL_ID = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';
const CHAT_ID = '19:561082c0f3f847a58069deb8eb300807@thread.v2';

function createService(response: any) {
  const calls = {
    path: '' as string,
    headers: {} as Record<string, string>,
    body: undefined as any,
  };

  const chain: any = {
    header: (k: string, v: string) => { calls.headers[k] = v; return chain; },
    post: async (body: any) => { calls.body = body; return response; },
  };

  const client = { api: (path: string) => { calls.path = path; return chain; } };

  const teams = {
    getGraphClient: vi.fn().mockResolvedValue(client),
  } as unknown as TeamsService;

  return { service: new SearchService(teams), calls };
}

/** Hit shape as Graph actually returns it for entityTypes: ["chatMessage"]. */
function channelHit() {
  return {
    hitId: '1616965872395',
    rank: 1,
    summary: 'We should discuss the <c0>budget</c0> next week',
    resource: {
      id: '1616965872395',
      createdDateTime: '2021-03-28T21:11:12.395Z',
      webUrl: 'https://teams.microsoft.com/l/message/19%3Aabc/1616965872395',
      from: { emailAddress: { name: 'Robin Kline', address: 'rkline@example.com' } },
      body: { contentType: 'html', content: '<div>We should discuss the budget next week</div>' },
      channelIdentity: { teamId: TEAM_ID, channelId: CHANNEL_ID },
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

  it('clamps size and floors from', async () => {
    const { service, calls } = createService(searchResponse([]));

    await service.searchMessages('budget', { size: 5000, from: -10 });

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
