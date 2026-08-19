import { describe, it, expect, vi } from 'vitest';
import {
  queryResourceGraph,
  MAX_RESOURCE_GRAPH_PAGES,
  RESOURCE_GRAPH_PAGE_SIZE,
} from '../resource-graph.js';
import type { DefenderClient } from '../../defender-client.js';

const fakeClient = (post: unknown) =>
  ({
    getSubscriptionId: () => 'SUB',
    post,
  }) as unknown as DefenderClient;

describe('queryResourceGraph', () => {
  it('sends one request with no paging options by default', async () => {
    const post = vi.fn().mockResolvedValue({ data: [{ id: 'a' }] });

    const result = await queryResourceGraph(fakeClient(post), 'securityresources');

    expect(post).toHaveBeenCalledTimes(1);
    expect((post.mock.calls[0][1] as any).options).toEqual({ resultFormat: 'objectArray' });
    expect(result.rows).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it('follows $skipToken and returns every page, not just the first', async () => {
    // A single page holds 1000 rows. A subscription with more assessments than that
    // would otherwise return a first page that looks like the whole answer.
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'a' }], $skipToken: 'token-1' })
      .mockResolvedValueOnce({ data: [{ id: 'b' }], $skipToken: 'token-2' })
      .mockResolvedValueOnce({ data: [{ id: 'c' }] });

    const result = await queryResourceGraph(fakeClient(post), 'securityresources', {
      pageAll: true,
    });

    expect(result.rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(result.truncated).toBe(false);
    expect((post.mock.calls[0][1] as any).options.$top).toBe(RESOURCE_GRAPH_PAGE_SIZE);
    expect((post.mock.calls[0][1] as any).options.$skipToken).toBeUndefined();
    expect((post.mock.calls[1][1] as any).options.$skipToken).toBe('token-1');
    expect((post.mock.calls[2][1] as any).options.$skipToken).toBe('token-2');
  });

  it('stops at the page ceiling and says so, rather than returning a short list as complete', async () => {
    // Every page offers another token, so only the ceiling ends the loop.
    const post = vi.fn().mockResolvedValue({ data: [{ id: 'a' }], $skipToken: 'always-more' });

    const result = await queryResourceGraph(fakeClient(post), 'securityresources', {
      pageAll: true,
    });

    expect(post).toHaveBeenCalledTimes(MAX_RESOURCE_GRAPH_PAGES);
    expect(result.rows).toHaveLength(MAX_RESOURCE_GRAPH_PAGES);
    expect(result.truncated).toBe(true);
  });

  it("treats Resource Graph's string 'true' resultTruncated as truncation", async () => {
    const post = vi.fn().mockResolvedValue({ data: [{ id: 'a' }], resultTruncated: 'true' });

    const result = await queryResourceGraph(fakeClient(post), 'securityresources');

    expect(result.truncated).toBe(true);
  });
});
