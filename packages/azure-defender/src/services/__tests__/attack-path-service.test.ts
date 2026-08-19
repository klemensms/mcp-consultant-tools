import { describe, it, expect, vi } from 'vitest';
import {
  AttackPathService,
  buildAttackPathListQuery,
  buildAttackPathGetQuery,
  mapAttackPathRow,
  summariseAttackPaths,
  effectiveRiskLevel,
  effectiveRiskFactors,
  RISK_LEVEL_NOT_REPORTED,
  DEFAULT_ATTACK_PATH_RESULTS,
  MAX_ATTACK_PATH_RESULTS,
} from '../attack-path-service.js';
import type { DefenderClient } from '../../defender-client.js';

const fakeClient = (post: unknown) =>
  ({
    getSubscriptionId: () => 'SUB',
    post,
  }) as unknown as DefenderClient;

/**
 * Two fixtures, because two row shapes reach the mapper in practice.
 *
 * A `properties` override MERGES into the defaults — `...overrides` is spread before
 * `properties` is built, so passing one key does not silently blank the rest. Getting
 * that backwards makes a test pass on a row that carries nothing but the key it asserts.
 */
const LEGACY_PROPERTIES = {
  displayName: 'Internet exposed VM with high severity vulnerabilities',
  potentialImpact: 'DataExposure',
  riskCategories: ['DataExposure', 'CredentialAccess'],
  attackPathType: 'InternetExposed',
  entryPointEntityInternalID: 'e1',
  targetEntityInternalID: 't1',
  graphComponent: { insights: [1], entities: [1, 2], connections: [1] },
};

/**
 * The Exposure Management shape, measured on live rows and absent from Microsoft's
 * published field table. A fixture copied from that table cannot catch a mapper that
 * drops this payload, which is exactly how it shipped.
 */
const LIVE_PROPERTIES = {
  displayName: 'Internet exposed VM with high severity vulnerabilities',
  attackPathType: 'InternetExposed',
  riskLevel: 'High',
  riskFactors: ['Internet exposure', 'Weak authorization'],
  entryPoint: { name: 'vm-entry', type: 'microsoft.compute/virtualmachines' },
  target: { name: 'kv-target', type: 'microsoft.keyvault/vaults' },
  attackPathSteps: [{ stepId: 1 }, { stepId: 2 }],
  mITRETacticsAndTechniques: ['InitialAccess', 'CredentialAccess'],
  attackStory: 'An internet exposed VM lets an attacker reach a key vault.',
  isPartialAttackPath: false,
};

const makeRow =
  (name: string, defaults: Record<string, unknown>) =>
  (overrides: Record<string, unknown> = {}) => ({
    id: `/subscriptions/SUB/providers/Microsoft.Security/attackPaths/${name}`,
    name,
    type: 'microsoft.security/attackpaths',
    tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    subscriptionId: 'SUB',
    ...overrides,
    properties: { ...defaults, ...(overrides.properties as object | undefined) },
  });

/** A row shaped like Microsoft's documented (legacy Defender CSPM) response. */
const row = makeRow('p1', LEGACY_PROPERTIES);

/** A row shaped like the ones live Resource Graph returns via Exposure Management. */
const liveRow = makeRow('p9', LIVE_PROPERTIES);

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

  it('matches a risk category against both field spellings, so the live one is reachable', () => {
    const query = buildAttackPathListQuery({ riskCategory: 'Internet exposure', limit: 5 });
    // A clause on `riskCategories` alone matches nothing on an Exposure Management
    // row, and an empty filtered list reads as "no paths in that category".
    expect(query).toContain("tostring(properties['riskCategories']) contains 'Internet exposure'");
    expect(query).toContain("tostring(properties['riskFactors']) contains 'Internet exposure'");
  });

  it('filters the risk level against both field spellings', () => {
    const query = buildAttackPathListQuery({ riskLevel: 'High', limit: 5 });
    expect(query).toContain("tostring(properties['riskLevel']) contains 'High'");
    expect(query).toContain("tostring(properties['potentialImpact']) contains 'High'");
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
  it("maps Microsoft's documented legacy field names", () => {
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

  it('keeps the whole risk payload on a live Exposure Management row', () => {
    const mapped = mapAttackPathRow(liveRow());

    expect(mapped.properties.riskLevel).toBe('High');
    expect(mapped.properties.riskFactors).toEqual(['Internet exposure', 'Weak authorization']);
    expect(mapped.properties.entryPoint).toEqual({
      name: 'vm-entry',
      type: 'microsoft.compute/virtualmachines',
    });
    expect(mapped.properties.target).toEqual({ name: 'kv-target', type: 'microsoft.keyvault/vaults' });
    expect(mapped.properties.attackPathSteps).toHaveLength(2);
    expect(mapped.properties.mITRETacticsAndTechniques).toEqual(['InitialAccess', 'CredentialAccess']);
    expect(mapped.properties.attackStory).toContain('key vault');
    expect(mapped.properties.isPartialAttackPath).toBe(false);
  });

  it('carries a properties key it does not name instead of dropping it', () => {
    const mapped = mapAttackPathRow(
      liveRow({ properties: { somethingMicrosoftAddedLater: 'keep me' } })
    );

    expect(mapped.properties.unmappedProperties?.somethingMicrosoftAddedLater).toBe('keep me');
    // Named fields are not duplicated into the bag.
    expect(mapped.properties.unmappedProperties?.riskLevel).toBeUndefined();
  });

  it('omits unmappedProperties when every key was named', () => {
    expect(mapAttackPathRow(liveRow()).properties.unmappedProperties).toBeUndefined();
  });

  it('defaults displayName and survives a row with no properties', () => {
    const mapped = mapAttackPathRow({ id: 'i', name: 'n', type: 't' });
    expect(mapped.properties.displayName).toBe('');
    expect(mapped.properties.riskCategories).toBeUndefined();
    expect(mapped.properties.riskLevel).toBeUndefined();
  });
});

describe('effectiveRiskLevel / effectiveRiskFactors', () => {
  it('reads the risk level from whichever field the row carries', () => {
    expect(effectiveRiskLevel(mapAttackPathRow(liveRow()))).toBe('High');
    expect(effectiveRiskLevel(mapAttackPathRow(row()))).toBe('DataExposure');
  });

  it('returns undefined when neither field is present, rather than a value', () => {
    expect(effectiveRiskLevel(mapAttackPathRow({ id: 'i', name: 'n', type: 't' }))).toBeUndefined();
  });

  it('unions the risk factors and risk categories of a row carrying both', () => {
    const mixed = mapAttackPathRow(
      liveRow({ properties: { riskCategories: ['DataExposure'] } })
    );
    expect(effectiveRiskFactors(mixed)).toEqual([
      'Internet exposure',
      'Weak authorization',
      'DataExposure',
    ]);
  });

  it('labels an object risk factor rather than collapsing it to [object Object]', () => {
    const objectFactors = mapAttackPathRow(
      liveRow({ properties: { riskFactors: [{ name: 'Internet exposure' }, { displayName: 'Weak authorization' }] } })
    );
    expect(effectiveRiskFactors(objectFactors)).toEqual(['Internet exposure', 'Weak authorization']);
  });
});

describe('summariseAttackPaths', () => {
  it('counts by risk level, and by each risk factor', () => {
    const paths = [
      mapAttackPathRow(row()),
      mapAttackPathRow(
        row({ name: 'p2', properties: { potentialImpact: 'DataExposure', riskCategories: ['DataExposure'] } })
      ),
    ];

    const summary = summariseAttackPaths(paths);

    expect(summary.total).toBe(2);
    expect(summary.byRiskLevel).toEqual({ DataExposure: 2 });
    // Factors sum to more than total: p1 carries two of them.
    expect(summary.byRiskFactor).toEqual({ DataExposure: 2, CredentialAccess: 1 });
    expect(summary.riskLevelNotReported).toBe(0);
    expect(summary.note).toBeUndefined();
  });

  it('buckets a live row by its real risk level instead of as Unknown', () => {
    const summary = summariseAttackPaths([mapAttackPathRow(liveRow())]);

    expect(summary.byRiskLevel).toEqual({ High: 1 });
    expect(summary.byRiskFactor).toEqual({ 'Internet exposure': 1, 'Weak authorization': 1 });
    expect(summary.riskLevelNotReported).toBe(0);
  });

  it('counts both shapes into one breakdown', () => {
    const summary = summariseAttackPaths([mapAttackPathRow(row()), mapAttackPathRow(liveRow())]);

    expect(summary.total).toBe(2);
    expect(summary.byRiskLevel).toEqual({ DataExposure: 1, High: 1 });
    expect(summary.riskLevelNotReported).toBe(0);
  });

  it('says a missing risk level was not reported rather than calling it Unknown', () => {
    const summary = summariseAttackPaths([mapAttackPathRow({ id: 'i', name: 'n', type: 't' })]);

    expect(summary.byRiskLevel).toEqual({ [RISK_LEVEL_NOT_REPORTED]: 1 });
    expect(summary.riskLevelNotReported).toBe(1);
    // An absent field must not read as "checked, and no risk".
    expect(summary.note).toMatch(/did not report a risk level/i);
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

  it('reports a live row\'s real risk level through the whole list path', async () => {
    const post = vi.fn().mockResolvedValue({ data: [liveRow()] });
    const service = new AttackPathService(fakeClient(post));

    const result = await service.listAttackPaths();

    // The defect this closes: the payload reached the caller as seven fields, and the
    // summary called a High-risk path Unknown with no risk categories.
    expect(result.summary.byRiskLevel).toEqual({ High: 1 });
    expect(result.attackPaths[0].properties.riskLevel).toBe('High');
    expect(result.attackPaths[0].properties.attackStory).toBeDefined();
    expect(result.summary.riskLevelNotReported).toBe(0);
    expect(result.summary.note).toBeUndefined();
  });

  it('passes both risk filters into the query', async () => {
    const post = vi.fn().mockResolvedValue({ data: [] });
    const service = new AttackPathService(fakeClient(post));

    await service.listAttackPaths({ riskCategory: 'Internet exposure', riskLevel: 'High' });

    const query = (post.mock.calls[0][1] as any).query as string;
    expect(query).toContain("properties['riskFactors']");
    expect(query).toContain("properties['riskLevel']");
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

  it('keeps the risk payload on a live row', async () => {
    const post = vi.fn().mockResolvedValue({ data: [liveRow()] });
    const service = new AttackPathService(fakeClient(post));

    const result = await service.getAttackPath({ attackPathName: 'p9' });

    expect(result?.properties.riskLevel).toBe('High');
    expect(result?.properties.riskFactors).toEqual(['Internet exposure', 'Weak authorization']);
    expect(result?.properties.target).toBeDefined();
  });

  it('maps the single matching row', async () => {
    const post = vi.fn().mockResolvedValue({ data: [row()] });
    const service = new AttackPathService(fakeClient(post));

    const result = await service.getAttackPath({ attackPathName: 'p1' });
    expect(result?.name).toBe('p1');
    expect(result?.properties.attackPathType).toBe('InternetExposed');
  });
});
