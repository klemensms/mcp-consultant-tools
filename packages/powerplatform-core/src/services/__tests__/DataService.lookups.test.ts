import { describe, it, expect } from 'vitest';
import { DataService } from '../DataService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

/** A many-to-many relationship whose intersect columns differ from Entity1's primary key. */
const RELATIONSHIP = {
  IntersectEntityName: 'new_account_account',
  Entity1LogicalName: 'account',
  Entity1IntersectAttribute: 'accountidone',
  Entity2IntersectAttribute: 'accountidtwo',
};

interface Options {
  /** Thrown by the named request kind until `failures` runs out. */
  failOn?: 'entityDefinitions' | 'relationships' | 'navProperty';
  failures?: number;
  navProperty?: string | null;
}

function stubClient(options: Options = {}) {
  const urls: string[] = [];
  let failures = options.failures ?? Infinity;
  const fail = (kind: Options['failOn']) => {
    if (options.failOn === kind && failures > 0) {
      failures--;
      throw new Error('Request failed with status code 503');
    }
  };
  const client = {
    getOrganizationUrl: () => 'https://yourorg.crm.dynamics.com',
    async makeRequest<T>(endpoint: string): Promise<T> {
      urls.push(endpoint);
      if (endpoint.startsWith('api/data/v9.2/EntityDefinitions?$filter=EntitySetName')) {
        fail('entityDefinitions');
        return { value: [] } as T; // not a standard table
      }
      if (endpoint.includes('ManyToManyRelationshipMetadata')) {
        fail('relationships');
        return { value: [RELATIONSHIP] } as T;
      }
      if (endpoint.includes('/ManyToOneRelationships')) {
        fail('navProperty');
        const nav = options.navProperty === undefined ? 'parentcustomerid_account' : options.navProperty;
        return { value: nav ? [{ ReferencingEntityNavigationPropertyName: nav, ReferencedEntity: 'account' }] : [] } as T;
      }
      if (endpoint.startsWith("api/data/v9.2/EntityDefinitions(LogicalName='account')")) {
        return { EntitySetName: 'accounts', PrimaryIdAttribute: 'accountid' } as T;
      }
      if (endpoint.startsWith('api/data/v9.2/accounts?fetchXml=')) {
        return { value: [{ count: 7 }] } as T;
      }
      throw new Error(`unexpected request ${endpoint}`);
    },
  };
  return { client: client as unknown as PowerPlatformClient, urls };
}

const fetchXmlOf = (urls: string[]) =>
  decodeURIComponent(urls.find((u) => u.includes('fetchXml='))!.split('fetchXml=')[1]);

describe('DataService many-to-many counts', () => {
  it("joins the intersect table on Entity1's primary key", async () => {
    const { client, urls } = stubClient();
    expect(await new DataService(client).countRecords('new_account_account')).toBe(7);
    expect(fetchXmlOf(urls)).toContain('from="accountidone" to="accountid"');
  });
});

describe('DataService lookup failures', () => {
  it('reports a failed table lookup as itself, not as "not found"', async () => {
    const { client } = stubClient({ failOn: 'entityDefinitions' });
    await expect(new DataService(client).countRecords('accounts')).rejects.toThrow('status code 503');
  });

  it('reports a failed relationship lookup as itself and does not cache it', async () => {
    const { client, urls } = stubClient({ failOn: 'relationships', failures: 1 });
    const service = new DataService(client);
    await expect(service.countRecords('new_account_account')).rejects.toThrow('status code 503');
    // The failure was not remembered: the next call looks again and succeeds.
    expect(await service.countRecords('new_account_account')).toBe(7);
    expect(urls.filter((u) => u.includes('ManyToManyRelationshipMetadata')).length).toBeGreaterThan(1);
  });

  it('reports a failed relationship lookup against its own entry in a batch count', async () => {
    const { client } = stubClient({ failOn: 'relationships' });
    const [result] = await new DataService(client).countRecordsBatch([{ entityNamePlural: 'new_account_account' }]);
    expect(result.error).toContain('status code 503');
  });

  it('still says "not found" when the table genuinely does not exist', async () => {
    const { client } = stubClient();
    const service = new DataService(client);
    (client as any).makeRequest = async (endpoint: string) => ({ value: [] });
    await expect(service.countRecords('nosuchtables')).rejects.toThrow(/not found/);
  });

  it('reports a failed navigation property lookup as itself and does not cache it', async () => {
    const { client, urls } = stubClient({ failOn: 'navProperty', failures: 1 });
    const service = new DataService(client);
    await expect(service.lookupNavigationProperty('contact', 'parentcustomerid', 'account')).rejects.toThrow('status code 503');
    expect(await service.lookupNavigationProperty('contact', 'parentcustomerid', 'account')).toBe('parentcustomerid_account');
    expect(urls.filter((u) => u.includes('/ManyToOneRelationships'))).toHaveLength(2);
  });

  it('caches a navigation property lookup that genuinely finds nothing', async () => {
    const { client, urls } = stubClient({ navProperty: null });
    const service = new DataService(client);
    expect(await service.lookupNavigationProperty('contact', 'parentcustomerid')).toBeNull();
    expect(await service.lookupNavigationProperty('contact', 'parentcustomerid')).toBeNull();
    expect(urls.filter((u) => u.includes('/ManyToOneRelationships'))).toHaveLength(1);
  });
});
