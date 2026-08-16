/**
 * The paginator's job is to make a truncated fetch impossible to mistake for a
 * complete one, so every test here asserts the failure case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paginateDataverse } from '../paginate.js';
import { PAGINATION_SAFETY_CEILING, UNCAPPED } from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';
const makeRequest = vi.fn();
const client = {
  makeRequest,
  getOrganizationUrl: () => BASE,
} as unknown as PowerPlatformClient;

interface Row {
  id: number;
  managed: boolean;
}

const row = (id: number, managed = false): Row => ({ id, managed });

/** Serve `total` rows in pages of `pageSize`, with a nextLink while more remain. */
const serve = (total: number, pageSize: number) => {
  let served = 0;
  makeRequest.mockImplementation(async () => {
    const value = Array.from(
      { length: Math.min(pageSize, total - served) },
      (_, i) => row(served + i)
    );
    served += value.length;
    const body: Record<string, unknown> = { value };
    if (served < total) {
      body['@odata.nextLink'] = `${BASE}/api/data/v9.2/things?$skiptoken=${served}`;
    }
    return body;
  });
};

describe('paginateDataverse', () => {
  beforeEach(() => {
    makeRequest.mockReset();
  });

  it('reports hasMore when a cap stops the fetch short', async () => {
    serve(136, 25);

    const result = await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things',
      maxRecords: 25,
    });

    expect(result.rows).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(result.truncationReason).toBe('requestedMax');
  });

  it('reports the same row count with hasMore false when that is genuinely all of them', async () => {
    serve(25, 25);

    const result = await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things',
      maxRecords: 25,
    });

    expect(result.rows).toHaveLength(25);
    expect(result.hasMore).toBe(false);
    expect(result.truncationReason).toBeNull();
  });

  it('does not call a short page complete when a continuation token remains', async () => {
    // A page shorter than the cap is not proof of exhaustion.
    makeRequest
      .mockResolvedValueOnce({
        value: [row(1), row(2)],
        '@odata.nextLink': `${BASE}/api/data/v9.2/things?$skiptoken=2`,
      })
      .mockResolvedValueOnce({ value: [row(3)] });

    const result = await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things',
      maxRecords: UNCAPPED,
    });

    expect(result.rows).toHaveLength(3);
    expect(result.hasMore).toBe(false);
  });

  it('follows nextLink across pages when uncapped', async () => {
    serve(136, 50);

    const result = await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things',
      maxRecords: UNCAPPED,
    });

    expect(result.rows).toHaveLength(136);
    expect(result.hasMore).toBe(false);
    expect(makeRequest).toHaveBeenCalledTimes(3);
  });

  it('the D1 shape: client-side filtering must not turn truncation into completeness', async () => {
    // 200 source rows, half of them dropped client-side, cap of 25. The old code
    // fetched one page, filtered it below the cap, and reported hasMore false.
    serve(200, 50);

    const result = await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things',
      maxRecords: 25,
      keep: (r) => r.id % 2 === 0,
    });

    expect(result.rows).toHaveLength(25);
    expect(result.hasMore).toBe(true);
  });

  it('keeps paging until the cap is filled with rows that survive the filter', async () => {
    // Everything on page one is dropped; the paginator must not stop there.
    makeRequest
      .mockResolvedValueOnce({
        value: [row(1, true), row(2, true)],
        '@odata.nextLink': `${BASE}/api/data/v9.2/things?$skiptoken=2`,
      })
      .mockResolvedValueOnce({ value: [row(3), row(4)] });

    const result = await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things',
      maxRecords: 10,
      keep: (r) => !r.managed,
    });

    expect(result.rows.map((r) => r.id)).toEqual([3, 4]);
    expect(result.hasMore).toBe(false);
  });

  it('stops at the safety ceiling and says so rather than reporting a complete set', async () => {
    serve(PAGINATION_SAFETY_CEILING + 1000, 5000);

    const result = await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things',
      maxRecords: UNCAPPED,
    });

    expect(result.rows).toHaveLength(PAGINATION_SAFETY_CEILING);
    expect(result.hasMore).toBe(true);
    expect(result.truncationReason).toBe('safetyCeiling');
  });

  it('rejects a malformed cap rather than quietly fetching everything', async () => {
    // `parseInt('abc')` on the CLI is the realistic source of this.
    await expect(
      paginateDataverse<Row>(client, {
        endpoint: 'api/data/v9.2/things',
        maxRecords: Number.NaN,
      })
    ).rejects.toThrow('maxRecords must be a non-negative integer');

    await expect(
      paginateDataverse<Row>(client, {
        endpoint: 'api/data/v9.2/things',
        maxRecords: -5,
      })
    ).rejects.toThrow('maxRecords must be a non-negative integer');

    expect(makeRequest).not.toHaveBeenCalled();
  });

  it('sets the page size via Prefer, not $top', async () => {
    serve(10, 10);

    await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things?$select=id',
      maxRecords: 25,
    });

    const [endpoint, method, body, headers] = makeRequest.mock.calls[0];
    expect(endpoint).not.toContain('$top');
    expect(method).toBe('GET');
    expect(body).toBeUndefined();
    expect(headers).toEqual({ Prefer: 'odata.maxpagesize=25' });
  });

  it('never asks for a page larger than Dataverse will serve', async () => {
    serve(10, 10);

    await paginateDataverse<Row>(client, {
      endpoint: 'api/data/v9.2/things',
      maxRecords: UNCAPPED,
    });

    expect(makeRequest.mock.calls[0][3]).toEqual({
      Prefer: 'odata.maxpagesize=5000',
    });
  });
});
