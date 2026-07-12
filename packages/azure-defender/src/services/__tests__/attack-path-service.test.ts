import { describe, it, expect, vi } from 'vitest';
import {
  AttackPathService,
  buildAttackPathListQuery,
  buildAttackPathGetQuery,
  mapAttackPathRow,
  summariseAttackPaths,
  DEFAULT_ATTACK_PATH_RESULTS,
  MAX_ATTACK_PATH_RESULTS,
} from '../attack-path-service.js';
import type { DefenderClient } from '../../defender-client.js';

const fakeClient = (post: unknown) =>
  ({
    getSubscriptionId: () => 'SUB',
    post,
  }) as unknown as DefenderClient;

/** A row shaped like Microsoft's documented attack-path response. */
const row = (overrides: Record<string, unknown> = {}) => ({
  id: '/subscriptions/SUB/providers/Microsoft.Security/attackPaths/p1',
  name: 'p1',
  type: 'microsoft.security/attackpaths',
  tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  subscriptionId: 'SUB',
  properties: {
    displayName: 'Internet exposed VM with high severity vulnerabilities',
    potentialImpact: 'DataExposure',
    riskCategories: ['DataExposure', 'CredentialAccess'],
    attackPathType: 'InternetExposed',
    entryPointEntityInternalID: 'e1',
    targetEntityInternalID: 't1',
    graphComponent: { insights: [1], entities: [1, 2], connections: [1] },
    ...(overrides.properties as object | undefined),
  },
  ...overrides,
});

describe('buildAttackPathListQuery', () => {
  it('queries securityresources for the attack-path type', () => {
    const query = buildAttackPathListQuery({ limit: 10 });
    expect(query).toContain('securityresources');
    expect(query).toContain("| where type == 'microsoft.security/attackpaths'");
    expect(query).toContain('| limit 10');
  });

  it('omits both filter clauses when neither is supplied', () => {
    const query = buildAttackPathListQuery({ limit: 5 });
    expect(query).not.toContain('contains');
  });

  it('does NOT filter on riskLevel — attack paths have no such field', () => {
    const query = buildAttackPathListQuery({ riskCategory: 'DataExposure', limit: 5 });
    expect(query).not.toContain('riskLevel');
    expect(query).toContain("tostring(properties['riskCategories']) contains 'DataExposure'");
  });

  it('filters the display name with a case-insensitive substring match', () => {
    const query = buildAttackPathListQuery({ displayNameContains: 'Internet', limit: 5 });
    expect(query).toContain("tostring(properties['displayName']) contains 'Internet'");
  });

  it('escapes a quote in a filter value instead of breaking the literal', () => {
    const query = buildAttackPathListQuery({ displayNameContains: "o'brien", limit: 5 });
    expect(query).toContain("contains 'o\\'brien'");
  });

  it('neutralises a KQL injection attempt via a trailing backslash', () => {
    const query = buildAttackPathListQuery({ riskCategory: "x\\' | project 1 //", limit: 5 });
    // The payload stays inside the literal: the backslash is doubled, so the
    // following quote is escaped rather than terminating the string.
    expect(query).toContain("contains 'x\\\\\\' | project 1 //'");
    expect(query.trim().endsWith('| limit 5')).toBe(true);
  });

  it('rejects a non-integer limit', () => {
    expect(() => buildAttackPathListQuery({ limit: 1.5 })).toThrow(/positive integer/);
    expect(() => buildAttackPathListQuery({ limit: 0 })).toThrow(/positive integer/);
  });
});

describe('buildAttackPathGetQuery', () => {
  it('matches the row name case-insensitively and limits to one', () => {
    const query = buildAttackPathGetQuery('p1');
    expect(query).toContain("| where name =~ 'p1'");
    expect(query).toContain('| limit 1');
  });

  it('escapes the name', () => {
    expect(buildAttackPathGetQuery("a'b")).toContain("=~ 'a\\'b'");
  });
});

describe('mapAttackPathRow', () => {
  it("maps Microsoft's documented field names", () => {
    const mapped = mapAttackPathRow(row());
    expect(mapped.name).toBe('p1');
    expect(mapped.properties.potentialImpact).toBe('DataExposure');
    expect(mapped.properties.riskCategories).toEqual(['DataExposure', 'CredentialAccess']);
    expect(mapped.properties.entryPointEntityInternalID).toBe('e1');
    expect(mapped.properties.targetEntityInternalID).toBe('t1');
    expect(mapped.properties.graphComponent?.entities).toHaveLength(2);
    expect(mapped.properties.graphComponent?.connections).toHaveLength(1);
    expect(mapped.properties.graphComponent?.insights).toHaveLength(1);
  });

  it('defaults displayName and survives a row with no properties', () => {
    const mapped = mapAttackPathRow({ id: 'i', name: 'n', type: 't' });
    expect(mapped.properties.displayName).toBe('');
    expect(mapped.properties.riskCategories).toBeUndefined();
  });
});

describe('summariseAttackPaths', () => {
  it('counts by potentialImpact, and by each risk category', () => {
    const paths = [
      mapAttackPathRow(row()),
      mapAttackPathRow(
        row({ name: 'p2', properties: { potentialImpact: 'DataExposure', riskCategories: ['DataExposure'] } })
      ),
    ];

    const summary = summariseAttackPaths(paths);

    expect(summary.total).toBe(2);
    expect(summary.byPotentialImpact).toEqual({ DataExposure: 2 });
    // Categories sum to more than total: p1 carries two of them.
    expect(summary.byRiskCategory).toEqual({ DataExposure: 2, CredentialAccess: 1 });
  });

  it('buckets a missing potentialImpact as Unknown', () => {
    const path = mapAttackPathRow({ id: 'i', name: 'n', type: 't' });
    expect(summariseAttackPaths([path]).byPotentialImpact).toEqual({ Unknown: 1 });
  });
});

describe('AttackPathService.listAttackPaths', () => {
  it('scopes the query via the request body, not a KQL subscriptionId clause', async () => {
    const post = vi.fn().mockResolvedValue({ data: [] });
    const service = new AttackPathService(fakeClient(post));

    await service.listAttackPaths();

    const [path, body] = post.mock.calls[0];
    expect(path).toBe('/providers/Microsoft.ResourceGraph/resources');
    expect((body as any).subscriptions).toEqual(['SUB']);
    expect((body as any).options.resultFormat).toBe('objectArray');
    expect((body as any).query).not.toContain('subscriptionId');
  });

  it('requests one row beyond maxResults so truncation can be detected', async () => {
    const post = vi.fn().mockResolvedValue({ data: [] });
    const service = new AttackPathService(fakeClient(post));

    await service.listAttackPaths({ maxResults: 3 });

    expect((post.mock.calls[0][1] as any).query).toContain('| limit 4');
  });

  it('trims the extra row and reports truncated=true', async () => {
    const post = vi.fn().mockResolvedValue({ data: [row(), row({ name: 'p2' }), row({ name: 'p3' })] });
    const service = new AttackPathService(fakeClient(post));

    const result = await service.listAttackPaths({ maxResults: 2 });

    expect(result.attackPaths.map((p) => p.name)).toEqual(['p1', 'p2']);
    expect(result.truncated).toBe(true);
    expect(result.summary.total).toBe(2);
  });

  it('reports truncated=false when the rows fit', async () => {
    const post = vi.fn().mockResolvedValue({ data: [row()] });
    const service = new AttackPathService(fakeClient(post));

    const result = await service.listAttackPaths({ maxResults: 5 });

    expect(result.truncated).toBe(false);
    expect(result.attackPaths).toHaveLength(1);
  });

  it("honours the server's resultTruncated flag even when rows fit", async () => {
    const post = vi.fn().mockResolvedValue({ data: [row()], resultTruncated: 'true' });
    const service = new AttackPathService(fakeClient(post));

    expect((await service.listAttackPaths({ maxResults: 5 })).truncated).toBe(true);
  });

  it('defaults maxResults and rejects one above the page ceiling', async () => {
    const post = vi.fn().mockResolvedValue({ data: [] });
    const service = new AttackPathService(fakeClient(post));

    await service.listAttackPaths();
    expect((post.mock.calls[0][1] as any).query).toContain(`| limit ${DEFAULT_ATTACK_PATH_RESULTS + 1}`);

    await expect(
      service.listAttackPaths({ maxResults: MAX_ATTACK_PATH_RESULTS + 1 })
    ).rejects.toThrow(/between 1 and 500/);
  });

  it('tolerates a Resource Graph response with no data array', async () => {
    const post = vi.fn().mockResolvedValue({});
    const service = new AttackPathService(fakeClient(post));

    const result = await service.listAttackPaths();
    expect(result.attackPaths).toEqual([]);
    expect(result.summary.total).toBe(0);
  });
});

describe('AttackPathService.getAttackPath', () => {
  it('returns null when no path matches', async () => {
    const post = vi.fn().mockResolvedValue({ data: [] });
    const service = new AttackPathService(fakeClient(post));

    expect(await service.getAttackPath({ attackPathName: 'nope' })).toBeNull();
  });

  it('maps the single matching row', async () => {
    const post = vi.fn().mockResolvedValue({ data: [row()] });
    const service = new AttackPathService(fakeClient(post));

    const result = await service.getAttackPath({ attackPathName: 'p1' });
    expect(result?.name).toBe('p1');
    expect(result?.properties.attackPathType).toBe('InternetExposed');
  });
});
