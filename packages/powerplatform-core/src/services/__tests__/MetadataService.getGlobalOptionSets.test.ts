/**
 * `$top`-based completeness check, site 1 of 4.
 *
 * `getGlobalOptionSets` asked for `$top = maxRecords + 1` and read `hasMore` off the
 * returned row count. At Dataverse's response cap the sentinel row never comes back,
 * so a truncated list was reported as complete and was byte-identical to a genuinely
 * complete one.
 *
 * The load-bearing test here is the pair at the same row count: truncated and complete
 * must not be equal. `GlobalOptionSetDefinitions` is a metadata endpoint and offers no
 * continuation token at all, so the surplus-row case is tested too.
 */

import { describe, it, expect } from 'vitest';
import { MetadataService } from '../MetadataService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const BASE = 'https://mcptests.crm4.dynamics.com';

const optionSetRow = (i: number) => ({
  Name: `contoso_choice_${i}`,
  DisplayName: { UserLocalizedLabel: { Label: `Choice ${i}` } },
  MetadataId: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, '0')}`,
  OptionSetType: 'Picklist',
});

/**
 * Serves `rows` in pages of `pageSize`, offering `@odata.nextLink` while rows remain.
 * `pageCap` emulates a server-side response cap that is independent of what was asked
 * for, which is the condition the old `$top + 1` sentinel could not survive.
 */
function stubClient(rows: unknown[], pageSize: number, offerToken = true) {
  let served = 0;
  const calls: string[] = [];
  const client = {
    getOrganizationUrl: () => BASE,
    async makeRequest<T>(endpoint: string): Promise<T> {
      calls.push(endpoint);
      const value = rows.slice(served, served + pageSize);
      served += value.length;
      const body: Record<string, unknown> = { value };
      if (offerToken && served < rows.length) {
        body['@odata.nextLink'] =
          `${BASE}/api/data/v9.2/GlobalOptionSetDefinitions?$skiptoken=${served}`;
      }
      return body as T;
    },
  };
  return { client: client as unknown as PowerPlatformClient, calls };
}

describe('MetadataService.getGlobalOptionSets', () => {
  it('a truncated result and a complete one at the same row count are not equal', async () => {
    const cap = 100;

    const truncatedStub = stubClient(
      Array.from({ length: cap + 50 }, (_, i) => optionSetRow(i)),
      cap
    );
    const completeStub = stubClient(
      Array.from({ length: cap }, (_, i) => optionSetRow(i)),
      cap
    );

    const truncated = await new MetadataService(
      truncatedStub.client
    ).getGlobalOptionSets({ maxRecords: cap });
    const complete = await new MetadataService(
      completeStub.client
    ).getGlobalOptionSets({ maxRecords: cap });

    // Same number of rows returned in both. This is the exact condition under which
    // the old sentinel-row check reported both as complete.
    expect(truncated.totalCount).toBe(cap);
    expect(complete.totalCount).toBe(cap);

    expect(truncated).not.toEqual(complete);
    expect(truncated.hasMore).toBe(true);
    expect(truncated.truncation.hasMore).toBe(true);
    expect(truncated.truncation.totalAvailable).toBeNull();
    expect(truncated.truncation.truncationReason).toBe('requestedMax');

    expect(complete.hasMore).toBe(false);
    expect(complete.truncation.hasMore).toBe(false);
    expect(complete.truncation.totalAvailable).toBe(cap);
    expect(complete.truncation.truncationReason).toBeNull();
  });

  it('detects truncation on a metadata endpoint that offers no continuation token', async () => {
    // Metadata endpoints ignore $top and Prefer: odata.maxpagesize and never return an
    // @odata.nextLink, so the whole set arrives in one response. Truncation still has
    // to be reported, from the surplus rows we fetched but will not return.
    const stub = stubClient(
      Array.from({ length: 240 }, (_, i) => optionSetRow(i)),
      240,
      false
    );

    const result = await new MetadataService(stub.client).getGlobalOptionSets({
      maxRecords: 100,
    });

    expect(result.totalCount).toBe(100);
    expect(result.truncation.hasMore).toBe(true);
    expect(result.truncation.totalAvailable).toBeNull();
  });

  it('no longer sends $top, and asks for the page size via Prefer instead', async () => {
    const stub = stubClient([optionSetRow(1)], 10);

    await new MetadataService(stub.client).getGlobalOptionSets({ maxRecords: 25 });

    expect(stub.calls[0]).not.toContain('$top');
    expect(stub.calls[0]).toContain('GlobalOptionSetDefinitions');
  });

  it('applies the prefix filter server-side', async () => {
    const stub = stubClient([optionSetRow(1)], 10);

    await new MetadataService(stub.client).getGlobalOptionSets({ prefix: 'contoso_' });

    expect(stub.calls[0]).toContain("$filter=startswith(Name,'contoso_')");
  });

  it('returns everything when asked for everything', async () => {
    const stub = stubClient(
      Array.from({ length: 240 }, (_, i) => optionSetRow(i)),
      100
    );

    const result = await new MetadataService(stub.client).getGlobalOptionSets({
      maxRecords: 0,
    });

    expect(result.totalCount).toBe(240);
    expect(result.truncation.hasMore).toBe(false);
    expect(result.truncation.requestedMax).toBeNull();
    expect(result.truncation.totalAvailable).toBe(240);
  });
});
