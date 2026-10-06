import { describe, it, expect } from 'vitest';
import { DataService } from '../DataService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

/** Entity set name → metadata, as EntityDefinitions would return it. */
const METADATA: Record<string, { LogicalName: string; PrimaryIdAttribute: string }> = {
  accounts: { LogicalName: 'account', PrimaryIdAttribute: 'accountid' },
  // Activity tables key on activityid, not <logicalname>id.
  emails: { LogicalName: 'email', PrimaryIdAttribute: 'activityid' },
};

interface Options {
  aggregateError?: string;
}

function stubClient(options: Options = {}): { client: PowerPlatformClient; urls: string[] } {
  const urls: string[] = [];
  const client = {
    getOrganizationUrl: () => 'https://yourorg.crm.dynamics.com',
    async makeRequest<T>(endpoint: string): Promise<T> {
      urls.push(endpoint);
      if (endpoint.startsWith('api/data/v9.2/EntityDefinitions')) {
        const set = endpoint.match(/EntitySetName eq '([^']+)'/)?.[1] ?? '';
        const meta = METADATA[set];
        return { value: meta ? [meta] : [] } as T;
      }
      if (endpoint.startsWith('api/data/v9.2/RetrieveTotalRecordCount')) {
        const names = [...endpoint.matchAll(/'([^']+)'/g)].map((m) => m[1]);
        return {
          EntityRecordCountCollection: { Keys: names, Values: names.map(() => 1234) },
        } as T;
      }
      if (endpoint.includes('$apply=')) {
        if (options.aggregateError) throw new Error(options.aggregateError);
        return { value: [{ count: 42 }] } as T;
      }
      throw new Error(`unexpected request ${endpoint}`);
    },
  };
  return { client: client as unknown as PowerPlatformClient, urls };
}

const FILTER = "statecode eq 0 and name eq 'Contoso'";

function applyOf(url: string): string {
  return decodeURIComponent(url.split('$apply=')[1] ?? '');
}

describe('DataService.countRecords', () => {
  it('applies the filter inside $apply, so Dataverse counts only matching rows', async () => {
    const { client, urls } = stubClient();
    const count = await new DataService(client).countRecords('accounts', FILTER);

    expect(count).toBe(42);
    const countUrl = urls.find((u) => u.includes('$apply='))!;
    expect(countUrl.startsWith('api/data/v9.2/accounts?$apply=')).toBe(true);
    expect(applyOf(countUrl)).toBe(
      `filter(${FILTER})/aggregate(accountid with countdistinct as count)`
    );
    expect(countUrl).not.toContain('$filter=');
    expect(countUrl).not.toContain('fetchXml=');
  });

  it('reads the primary key from metadata alongside the logical name', async () => {
    const { client, urls } = stubClient();
    await new DataService(client).countRecords('emails', FILTER);

    const metaUrl = urls.find((u) => u.startsWith('api/data/v9.2/EntityDefinitions'))!;
    expect(metaUrl).toContain('$select=LogicalName,PrimaryIdAttribute');
    expect(applyOf(urls.find((u) => u.includes('$apply='))!)).toContain(
      'aggregate(activityid with countdistinct as count)'
    );
  });

  it.each([
    'PowerPlatform API request failed: Request failed with status code 400 - {"code":"0x8004e023","message":"AggregateQueryRecordLimit exceeded. Cannot perform this operation."}',
    'PowerPlatform API request failed: Request failed with status code 400 - {"code":"0x8004e023","message":"The maximum record limit is exceeded. Reduce the number of records."}',
  ])('explains the 50,000 aggregate limit in plain words', async (message) => {
    const { client } = stubClient({ aggregateError: message });
    await expect(new DataService(client).countRecords('accounts', FILTER)).rejects.toThrow(
      /more than 50,000 .*accounts.* narrow the filter/i
    );
  });

  it('passes other aggregate errors through unchanged', async () => {
    const { client } = stubClient({ aggregateError: 'Could not find a property named foo' });
    await expect(new DataService(client).countRecords('accounts', 'foo eq 1')).rejects.toThrow(
      'Could not find a property named foo'
    );
  });

  it('marks an unfiltered count as a snapshot and a filtered one as live', async () => {
    const svc = new DataService(stubClient().client);
    await expect(svc.countRecordsWithSource('accounts')).resolves.toEqual({
      count: 1234,
      snapshot: true,
    });
    await expect(svc.countRecordsWithSource('accounts', FILTER)).resolves.toEqual({
      count: 42,
      snapshot: false,
    });
  });
});

describe('DataService.countRecordsBatch', () => {
  it('uses $apply with the metadata key for filtered entries and labels snapshot entries', async () => {
    const { client, urls } = stubClient();
    const results = await new DataService(client).countRecordsBatch([
      { entityNamePlural: 'accounts' },
      { entityNamePlural: 'emails', filter: FILTER },
    ]);

    expect(results).toEqual([
      { entityNamePlural: 'accounts', filter: undefined, count: 1234, snapshot: true },
      { entityNamePlural: 'emails', filter: FILTER, count: 42, snapshot: false },
    ]);
    const applyUrl = urls.find((u) => u.includes('$apply='))!;
    expect(applyUrl.startsWith('api/data/v9.2/emails?')).toBe(true);
    expect(applyOf(applyUrl)).toBe(
      `filter(${FILTER})/aggregate(activityid with countdistinct as count)`
    );
  });
});
