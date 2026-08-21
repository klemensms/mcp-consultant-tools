import { describe, it, expect, vi } from 'vitest';
import {
  AssessmentService,
  normalizeArmResourceId,
  summariseAssessments,
  summariseAssessmentMetadata,
  mapAssessmentGraphRow,
  countFieldPopulation,
  metadataFieldVerdict,
  groupFailuresByReason,
  type MetadataFieldProbe,
} from '../assessment-service.js';
import type { DefenderClient } from '../../defender-client.js';
import type { SecurityAssessment, AssessmentMetadata } from '../../models/defender-types.js';

const assessment = (code: string, name = 'a'): SecurityAssessment =>
  ({
    id: `/id/${name}`,
    name,
    type: 'Microsoft.Security/assessments',
    properties: { status: { code }, resourceDetails: { source: 'Azure' } },
  }) as SecurityAssessment;

const metadata = (severity: string, categories?: string[]): AssessmentMetadata =>
  ({
    id: 'id',
    name: 'n',
    type: 't',
    properties: { displayName: 'd', severity, categories, assessmentType: 'BuiltIn' },
  }) as AssessmentMetadata;

const fakeClient = (parts: Partial<Record<'paginate' | 'get' | 'post', unknown>>) =>
  ({
    subscriptionPath: (p = '') => `/subscriptions/SUB${p}`,
    getSubscriptionId: () => 'SUB',
    // Resource Graph is the second assessment source, so a fake without `post`
    // records a fan-out failure rather than returning rows.
    post: vi.fn().mockResolvedValue({ data: [] }),
    ...parts,
  }) as unknown as DefenderClient;

describe('normalizeArmResourceId', () => {
  it('accepts a full ARM resource ID', () => {
    const id =
      '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm';
    expect(normalizeArmResourceId(id)).toBe(id);
  });

  it('strips trailing slashes so the provider segment is not double-slashed', () => {
    expect(normalizeArmResourceId('/subscriptions/x/resourceGroups/rg//')).toBe(
      '/subscriptions/x/resourceGroups/rg'
    );
  });

  it('rejects a bare resource name', () => {
    expect(() => normalizeArmResourceId('my-vm')).toThrow(/must be a full ARM resource ID/);
  });

  it('rejects a full URL, which would otherwise retarget the request host', () => {
    expect(() => normalizeArmResourceId('https://evil.example/subscriptions/x')).toThrow(
      /must be a full ARM resource ID/
    );
  });
});

describe('summariseAssessments', () => {
  it('counts by status code', () => {
    const summary = summariseAssessments([
      assessment('Healthy'),
      assessment('Unhealthy'),
      assessment('Unhealthy'),
    ]);
    expect(summary).toEqual({ total: 3, byStatus: { Healthy: 1, Unhealthy: 2 } });
  });

  it('buckets a missing status as Unknown rather than crashing', () => {
    const summary = summariseAssessments([{ properties: {} } as unknown as SecurityAssessment]);
    expect(summary.byStatus).toEqual({ Unknown: 1 });
  });
});

describe('summariseAssessmentMetadata', () => {
  it('counts severities, and each category an assessment belongs to', () => {
    const summary = summariseAssessmentMetadata([
      metadata('Critical', ['Compute', 'Data']),
      metadata('Low', ['Compute']),
    ]);
    expect(summary.total).toBe(2);
    expect(summary.bySeverity).toEqual({ Critical: 1, Low: 1 });
    // Categories sum to more than total — one assessment can carry several.
    expect(summary.byCategory).toEqual({ Compute: 2, Data: 1 });
  });
});

describe('AssessmentService.listAssessments', () => {
  it('scans every assessment before trimming when a status filter is set', async () => {
    // The ported source passed maxResults to the API *and* filtered client-side,
    // so matches beyond the cut were silently invisible. Here all 3 rows are
    // fetched, the 2 Unhealthy ones survive the filter, and maxResults trims to 1.
    const paginate = vi.fn().mockResolvedValue({
      items: [assessment('Healthy', 'h'), assessment('Unhealthy', 'u1'), assessment('Unhealthy', 'u2')],
      truncated: false,
    });
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.listAssessments({ statusFilter: 'Unhealthy', maxResults: 1 });

    // No maxResults handed to the client — a full scan is required to filter.
    expect(paginate.mock.calls[0][3]).toBeUndefined();
    expect(result.assessments.map((a) => a.name)).toEqual(['u1']);
    expect(result.truncated).toBe(true);
    expect(result.summary.byStatus).toEqual({ Unhealthy: 1 });
  });

  it('does not flag truncation when the filtered set fits inside maxResults', async () => {
    const paginate = vi
      .fn()
      .mockResolvedValue({ items: [assessment('Unhealthy', 'u1')], truncated: false });
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.listAssessments({ statusFilter: 'Unhealthy', maxResults: 5 });

    expect(result.truncated).toBe(false);
    expect(result.assessments).toHaveLength(1);
  });

  it('scans the ARM list in full even without a status filter, then trims', async () => {
    // maxResults is never handed to the ARM list: the cut would fall on ARM's rows
    // and take out the assessments only the second source can see. Both sources are
    // read in full, unioned, and trimmed afterwards.
    const paginate = vi.fn().mockResolvedValue({
      items: [assessment('Healthy', 'h1'), assessment('Healthy', 'h2')],
      truncated: false,
    });
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.listAssessments({ maxResults: 1 });

    expect(paginate.mock.calls[0][3]).toBeUndefined();
    expect(result.assessments.map((a) => a.name)).toEqual(['h1']);
    expect(result.truncated).toBe(true);
  });
});

describe('AssessmentService.getAssessment', () => {
  it('builds the provider path and url-encodes the assessment name', async () => {
    const get = vi.fn().mockResolvedValue(assessment('Healthy'));
    const service = new AssessmentService(fakeClient({ get }));

    await service.getAssessment({
      resourceId: '/subscriptions/x/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm',
      assessmentName: 'a b/c',
    });

    expect(get.mock.calls[0][0]).toBe(
      '/subscriptions/x/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm/providers/Microsoft.Security/assessments/a%20b%2Fc'
    );
  });

  it('rejects a malformed resourceId before making a request', async () => {
    const get = vi.fn();
    const service = new AssessmentService(fakeClient({ get }));

    await expect(
      service.getAssessment({ resourceId: 'vm', assessmentName: 'a' })
    ).rejects.toThrow(/full ARM resource ID/);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('AssessmentService.listAssessmentMetadata', () => {
  it('filters severity case-insensitively', async () => {
    const paginate = vi
      .fn()
      .mockResolvedValue({ items: [metadata('Critical'), metadata('Low')], truncated: false });
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.listAssessmentMetadata({ severityFilter: 'Critical' as any });

    expect(result.metadata).toHaveLength(1);
    expect(result.summary.bySeverity).toEqual({ Critical: 1 });
  });
});

// ─── T10 / D14: scope coverage ───

const SUB = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * A resource-group-scoped assessment: the only kind the ARM subscription list
 * returns, because it enumerates assessments on resources *inside* the subscription.
 */
const armScoped = (name = '11111111-1111-1111-1111-111111111111'): SecurityAssessment =>
  ({
    id: `/subscriptions/${SUB}/resourceGroups/my-rg/providers/Microsoft.Compute/virtualMachines/my-vm/providers/Microsoft.Security/assessments/${name}`,
    name,
    type: 'Microsoft.Security/assessments',
    properties: {
      displayName: 'Machines should have vulnerability findings resolved',
      status: { code: 'Unhealthy' },
      resourceDetails: {
        source: 'Azure',
        id: `/subscriptions/${SUB}/resourceGroups/my-rg/providers/Microsoft.Compute/virtualMachines/my-vm`,
      },
    },
  }) as SecurityAssessment;

/**
 * Resource Graph rows are shaped differently from ARM's: the `id` is lower-cased,
 * `resourceDetails` uses `Id`/`Source` rather than `id`/`source`, and extra columns
 * ride alongside. A fixture tidied into the ARM shape would hide both differences.
 */
const graphRow = (
  id: string,
  resourceId: string,
  displayName: string,
  code = 'Unhealthy'
): Record<string, unknown> => ({
  id: id.toLowerCase(),
  name: id.split('/').pop(),
  type: 'microsoft.security/assessments',
  tenantId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  subscriptionId: SUB,
  properties: {
    displayName,
    status: { code, cause: '', description: 'Remediate this' },
    resourceDetails: { Source: 'Azure', Id: resourceId },
    additionalData: { assessedResourceType: 'Identity' },
  },
});

/**
 * Neither of these is a resource under a resource group, which is what the ARM
 * subscription list enumerates: one is scoped to the subscription itself, one to an
 * identity object. The exact id shape of an identity-scoped assessment is not
 * asserted anywhere: the union keys on the id it is given, whatever that is.
 */
const SUBSCRIPTION_SCOPED = graphRow(
  `/subscriptions/${SUB}/providers/Microsoft.Security/assessments/22222222-2222-2222-2222-222222222222`,
  `/subscriptions/${SUB}`,
  'Subscriptions should have a contact email address for security issues'
);

const IDENTITY_SCOPED = graphRow(
  `/subscriptions/${SUB}/providers/Microsoft.Security/assessments/33333333-3333-3333-3333-333333333333`,
  '33333333-4444-5555-6666-777777777777',
  'Accounts with owner permissions on Azure resources should be MFA enabled'
);

describe('AssessmentService.listAssessments, scope coverage', () => {
  it('returns identity- and subscription-scoped assessments the ARM list cannot see', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [armScoped()], truncated: false });
    const post = vi
      .fn()
      .mockResolvedValue({ data: [SUBSCRIPTION_SCOPED, IDENTITY_SCOPED] });
    const service = new AssessmentService(fakeClient({ paginate, post }));

    const result = await service.listAssessments({ statusFilter: 'Unhealthy' });

    expect(result.summary.total).toBe(3);
    expect(result.assessments.map((a) => a.properties.displayName)).toEqual(
      expect.arrayContaining([
        'Subscriptions should have a contact email address for security issues',
        'Accounts with owner permissions on Azure resources should be MFA enabled',
      ])
    );
    expect(result.summary.sources.resourceGraph.unique).toBe(2);
  });

  it('does not double-count an assessment both sources return, despite the case difference in the id', async () => {
    const arm = armScoped();
    const paginate = vi.fn().mockResolvedValue({ items: [arm], truncated: false });
    // Resource Graph lower-cases every id, so a case-sensitive key would count this twice.
    const post = vi.fn().mockResolvedValue({
      data: [
        graphRow(arm.id, arm.properties.resourceDetails.id!, 'Machines should have vulnerability findings resolved'),
      ],
    });
    const service = new AssessmentService(fakeClient({ paginate, post }));

    const result = await service.listAssessments();

    expect(result.summary.total).toBe(1);
    expect(result.summary.sources.resourceGraph.unique).toBe(0);
    // The ARM row wins: it is the typed, documented shape.
    expect(result.assessments[0].properties.resourceDetails.source).toBe('Azure');
  });

  it('declares the gap when Resource Graph cannot be queried, rather than returning the ARM-only set as complete', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [armScoped()], truncated: false });
    const post = vi.fn().mockRejectedValue(
      Object.assign(new Error('AuthorizationFailed: does not have authorization to perform action'), {
        response: { status: 403 },
      })
    );
    const service = new AssessmentService(fakeClient({ paginate, post }));

    const result = await service.listAssessments();

    expect(result.assessments).toHaveLength(1);
    expect(result.summary.sources.resourceGraph.available).toBe(false);
    expect(result.summary.note).toMatch(/identity- and subscription-scoped/);
    expect(result.fanOut.failed).toBe(1);
    expect(result.fanOut.failures[0].statusCode).toBe(403);
  });

  it('counts what only the ARM list had, which is the reverse blind spot on a subscription with no paid plan', async () => {
    // Resource Graph returns nothing for a subscription with no paid Defender plan,
    // where the ARM list still returns data. Neither source is complete alone.
    const paginate = vi.fn().mockResolvedValue({ items: [armScoped()], truncated: false });
    const post = vi.fn().mockResolvedValue({ data: [] });
    const service = new AssessmentService(fakeClient({ paginate, post }));

    const result = await service.listAssessments();

    expect(result.summary.total).toBe(1);
    expect(result.summary.sources.arm.unique).toBe(1);
    expect(result.summary.sources.resourceGraph.returned).toBe(0);
    expect(result.summary.sources.resourceGraph.available).toBe(true);
  });

  it('applies the status filter to the union, not to the ARM list alone', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [armScoped()], truncated: false });
    const post = vi.fn().mockResolvedValue({
      data: [
        SUBSCRIPTION_SCOPED,
        graphRow(
          `/subscriptions/${SUB}/providers/Microsoft.Security/assessments/44444444-4444-4444-4444-444444444444`,
          `/subscriptions/${SUB}`,
          'Healthy one',
          'Healthy'
        ),
      ],
    });
    const service = new AssessmentService(fakeClient({ paginate, post }));

    const result = await service.listAssessments({ statusFilter: 'Unhealthy' });

    expect(result.summary.total).toBe(2);
    expect(result.summary.byStatus).toEqual({ Unhealthy: 2 });
  });
});

// ─── ⚑34 / T12: the Resource Graph mapper's allowlist ───

/**
 * A live Resource Graph row carrying risk data under keys the mapper's allowlist does
 * not name. `extra` is spread *inside* `properties`, so it merges with the mapped keys
 * rather than replacing them — a fixture that replaced them would pass for the wrong
 * reason, which is exactly how L5's first attack-path fixtures lied.
 */
const graphRowWithExtras = (extra: Record<string, unknown>): Record<string, unknown> => ({
  id: `/subscriptions/${SUB}/providers/microsoft.security/assessments/55555555-5555-5555-5555-555555555555`,
  name: '55555555-5555-5555-5555-555555555555',
  type: 'microsoft.security/assessments',
  subscriptionId: SUB,
  properties: {
    displayName: 'Machines should have vulnerability findings resolved',
    status: { code: 'Unhealthy' },
    resourceDetails: { Source: 'Azure', Id: `/subscriptions/${SUB}` },
    ...extra,
  },
});

describe('mapAssessmentGraphRow', () => {
  it('carries a properties key the allowlist does not name instead of discarding it', () => {
    // The exact T11 failure, in the sibling mapper: risk data under a name the
    // allowlist never heard of vanishes, and "no assessment carries risk" then reads
    // as a fact about Azure rather than an artefact of this mapper.
    const mapped = mapAssessmentGraphRow(
      graphRowWithExtras({ riskLevel: 'High', riskFactors: ['Internet exposure'] })
    );

    expect(mapped.properties.unmappedProperties).toEqual({
      riskLevel: 'High',
      riskFactors: ['Internet exposure'],
    });
  });

  it('still maps every named key, so the passthrough is additive', () => {
    const mapped = mapAssessmentGraphRow(
      graphRowWithExtras({ risk: { level: 'High' }, riskLevel: 'High' })
    );

    expect(mapped.properties.displayName).toBe(
      'Machines should have vulnerability findings resolved'
    );
    expect(mapped.properties.status.code).toBe('Unhealthy');
    expect(mapped.properties.resourceDetails.id).toBe(`/subscriptions/${SUB}`);
    expect(mapped.properties.risk).toEqual({ level: 'High' });
    // Only the unnamed key rides along; a named one is not duplicated into it.
    expect(mapped.properties.unmappedProperties).toEqual({ riskLevel: 'High' });
  });

  it('omits unmappedProperties entirely when the row carries nothing unnamed', () => {
    const mapped = mapAssessmentGraphRow(graphRowWithExtras({}));
    expect(mapped.properties.unmappedProperties).toBeUndefined();
  });
});

describe('AssessmentService.listAssessments, unmapped payload', () => {
  it('names the unmapped keys in the summary, so an unread field is visible without reading 4,886 rows', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [], truncated: false });
    const post = vi.fn().mockResolvedValue({
      data: [
        graphRowWithExtras({ riskLevel: 'High' }),
        { ...graphRowWithExtras({ riskFactors: ['Internet exposure'] }), id: '/other', name: 'other' },
      ],
    });
    const service = new AssessmentService(fakeClient({ paginate, post }));

    const result = await service.listAssessments();

    // Distinct key names across every graph row, aggregated before maxResults trims
    // and before the ARM row wins a shared id — either of which could otherwise hide
    // the only row that carried the field.
    expect(result.summary.unmappedPropertyKeys).toEqual(['riskLevel', 'riskFactors']);
    expect(result.summary.note).toMatch(/unmappedProperties/);
  });

  it('aggregates the keys across all rows even when maxResults trims the row that carried them', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [armScoped()], truncated: false });
    const post = vi.fn().mockResolvedValue({ data: [graphRowWithExtras({ riskLevel: 'High' })] });
    const service = new AssessmentService(fakeClient({ paginate, post }));

    const result = await service.listAssessments({ maxResults: 1 });

    expect(result.assessments).toHaveLength(1);
    expect(result.assessments[0].properties.unmappedProperties).toBeUndefined();
    expect(result.summary.unmappedPropertyKeys).toEqual(['riskLevel']);
  });

  it('says nothing when every key was named, so the note stays a signal', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [], truncated: false });
    const post = vi.fn().mockResolvedValue({ data: [graphRowWithExtras({})] });
    const service = new AssessmentService(fakeClient({ paginate, post }));

    const result = await service.listAssessments();

    expect(result.summary.unmappedPropertyKeys).toBeUndefined();
    expect(result.summary.note).toBeUndefined();
  });
});

// ─── D16: the assessment-metadata field diagnostic ───

const CURRENT_VERSION = '2025-05-04';
const LEGACY_VERSION = '2020-01-01';
const TENANT_PATH = '/providers/Microsoft.Security/assessmentMetadata';
const SUB_PATH = `/subscriptions/SUB${TENANT_PATH}`;

/** A definition carrying whatever the caller wants of the two ranking fields. */
const definition = (
  name: string,
  properties: Record<string, unknown>
): AssessmentMetadata =>
  ({
    id: `/id/${name}`,
    name,
    type: 'Microsoft.Security/assessmentMetadata',
    properties: { displayName: `Definition ${name}`, severity: 'High', assessmentType: 'BuiltIn', ...properties },
  }) as AssessmentMetadata;

describe('countFieldPopulation', () => {
  it('separates a value from an emptied field from a field that was never sent', () => {
    const population = countFieldPopulation(
      [
        definition('a', { implementationEffort: 'Low' }),
        definition('b', { implementationEffort: null }),
        definition('c', { implementationEffort: '' }),
        definition('d', {}),
      ],
      'implementationEffort'
    );

    expect(population).toEqual({
      populated: 1,
      presentButEmpty: 2,
      absent: 1,
      example: { name: 'a', displayName: 'Definition a', value: 'Low' },
    });
  });

  it('does not report an absent field as an emptied one, because the causes differ', () => {
    const absent = countFieldPopulation([definition('a', {}), definition('b', {})], 'userImpact');
    const emptied = countFieldPopulation(
      [definition('a', { userImpact: null }), definition('b', { userImpact: null })],
      'userImpact'
    );

    expect(absent).not.toEqual(emptied);
    expect(absent.absent).toBe(2);
    expect(absent.presentButEmpty).toBe(0);
    expect(emptied.presentButEmpty).toBe(2);
    expect(emptied.absent).toBe(0);
  });

  it('keeps the first example found rather than the last', () => {
    const population = countFieldPopulation(
      [definition('a', { userImpact: 'High' }), definition('b', { userImpact: 'Low' })],
      'userImpact'
    );

    expect(population.example).toEqual({
      name: 'a',
      displayName: 'Definition a',
      value: 'High',
    });
  });
});

describe('AssessmentService.diagnoseMetadataFields', () => {
  it('probes both scopes at both api-versions, four combinations, none of them assumed', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [definition('a', {})], truncated: false });
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.diagnoseMetadataFields();

    expect(paginate.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [SUB_PATH, CURRENT_VERSION],
      [SUB_PATH, LEGACY_VERSION],
      [TENANT_PATH, CURRENT_VERSION],
      [TENANT_PATH, LEGACY_VERSION],
    ]);
    expect(result.summary.probesRun).toBe(4);
    expect(result.summary.probesSucceeded).toBe(4);
    expect(result.probes.map((probe) => probe.label)).toEqual([
      `subscription@${CURRENT_VERSION}`,
      `subscription@${LEGACY_VERSION}`,
      `tenant@${CURRENT_VERSION}`,
      `tenant@${LEGACY_VERSION}`,
    ]);
  });

  it('reports which combination populated the fields, and reads the others as unpopulated', async () => {
    const paginate = vi.fn().mockImplementation((path: string, apiVersion: string) =>
      Promise.resolve({
        items:
          path === TENANT_PATH && apiVersion === CURRENT_VERSION
            ? [definition('a', { implementationEffort: 'Low', userImpact: 'Moderate' })]
            : [definition('a', {})],
        truncated: false,
      })
    );
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.diagnoseMetadataFields();

    expect(result.summary.populatedBy).toEqual([`tenant@${CURRENT_VERSION}`]);
    const tenantProbe = result.probes.find((probe) => probe.label === `tenant@${CURRENT_VERSION}`);
    expect(tenantProbe?.ok && tenantProbe.implementationEffort.populated).toBe(1);
    expect(tenantProbe?.ok && tenantProbe.userImpact.example?.value).toBe('Moderate');
  });

  it('records one refused combination rather than abandoning the other three', async () => {
    const paginate = vi.fn().mockImplementation((path: string) =>
      path === TENANT_PATH
        ? Promise.reject(Object.assign(new Error('AuthorizationFailed'), { response: { status: 403 } }))
        : Promise.resolve({ items: [definition('a', {})], truncated: false })
    );
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.diagnoseMetadataFields();

    expect(result.summary.probesSucceeded).toBe(2);
    expect(result.fanOut.failed).toBe(2);
    expect(result.fanOut.failures.map((failure) => failure.statusCode)).toEqual([403, 403]);
    const refused = result.probes.filter((probe) => !probe.ok);
    expect(refused).toHaveLength(2);
    expect(refused[0].ok === false && refused[0].error).toBe('AuthorizationFailed');
  });

  it('names the unread combinations in the verdict, so unknown is not read as empty', async () => {
    const paginate = vi.fn().mockImplementation((path: string) =>
      path === TENANT_PATH
        ? Promise.reject(new Error('AuthorizationFailed'))
        : Promise.resolve({ items: [definition('a', {})], truncated: false })
    );
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.diagnoseMetadataFields();

    expect(result.summary.verdict).toContain(`tenant@${CURRENT_VERSION}`);
    expect(result.summary.verdict).toContain('unknown, not empty');
  });

  it('fails loudly when every combination fails, rather than returning an empty success', async () => {
    const paginate = vi.fn().mockRejectedValue(new Error('invalid_client'));
    const service = new AssessmentService(fakeClient({ paginate }));

    await expect(service.diagnoseMetadataFields()).rejects.toThrow(
      /All 4 assessment-metadata probes failed/
    );
    await expect(service.diagnoseMetadataFields()).rejects.toThrow(/invalid_client/);
  });

  it('records an unconfigured subscription as two probe failures, leaving tenant scope readable', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [definition('a', {})], truncated: false });
    const service = new AssessmentService({
      subscriptionPath: () => {
        throw new Error('AZURE_SUBSCRIPTION_ID is required for this operation but was not configured.');
      },
      getSubscriptionId: () => {
        throw new Error('AZURE_SUBSCRIPTION_ID is required for this operation but was not configured.');
      },
      paginate,
    } as unknown as DefenderClient);

    const result = await service.diagnoseMetadataFields();

    expect(result.summary.probesSucceeded).toBe(2);
    expect(result.probes.filter((probe) => probe.scope === 'subscription').every((probe) => !probe.ok)).toBe(true);
    expect(paginate.mock.calls.map((call) => call[0])).toEqual([TENANT_PATH, TENANT_PATH]);
  });
});

describe('metadataFieldVerdict', () => {
  const okProbe = (label: string, populated: number): MetadataFieldProbe => ({
    label,
    scope: label.startsWith('tenant') ? 'tenant' : 'subscription',
    apiVersion: label.split('@')[1],
    path: TENANT_PATH,
    ok: true,
    total: 10,
    implementationEffort: { populated, presentButEmpty: 0, absent: 10 - populated, example: null },
    userImpact: { populated, presentButEmpty: 0, absent: 10 - populated, example: null },
  });

  const failedProbe = (label: string): MetadataFieldProbe => ({
    label,
    scope: label.startsWith('tenant') ? 'tenant' : 'subscription',
    apiVersion: label.split('@')[1],
    path: TENANT_PATH,
    ok: false,
    error: 'AuthorizationFailed',
  });

  it('puts the absence on the estate or the service when nothing populated the fields', () => {
    const verdict = metadataFieldVerdict([okProbe(`subscription@${CURRENT_VERSION}`, 0)], []);

    expect(verdict).toContain('cannot be computed');
    expect(verdict).toContain('rather than to this package');
  });

  it('sends the reader back to the subscription when the current call already populates them', () => {
    const label = `subscription@${CURRENT_VERSION}`;
    const verdict = metadataFieldVerdict([okProbe(label, 3)], [label]);

    expect(verdict).toContain('did not come from the request');
  });

  it('flags the severity trade-off when only the legacy api-version populates them', () => {
    const label = `subscription@${LEGACY_VERSION}`;
    const verdict = metadataFieldVerdict(
      [okProbe(`subscription@${CURRENT_VERSION}`, 0), okProbe(label, 5)],
      [label]
    );

    expect(verdict).toContain("no 'Critical' value");
    expect(verdict).toContain('trades one capability for the other');
  });

  it('does not raise the severity trade-off when a current-version combination also populates them', () => {
    const label = `tenant@${CURRENT_VERSION}`;
    const verdict = metadataFieldVerdict(
      [okProbe(`subscription@${CURRENT_VERSION}`, 0), okProbe(label, 5)],
      [label]
    );

    expect(verdict).not.toContain("no 'Critical' value");
  });

  it('appends the unread combinations whatever the finding, because a gap outranks a conclusion', () => {
    const populated = metadataFieldVerdict(
      [okProbe(`tenant@${CURRENT_VERSION}`, 5), failedProbe(`subscription@${LEGACY_VERSION}`)],
      [`tenant@${CURRENT_VERSION}`]
    );
    const empty = metadataFieldVerdict(
      [okProbe(`tenant@${CURRENT_VERSION}`, 0), failedProbe(`subscription@${LEGACY_VERSION}`)],
      []
    );

    expect(populated).toContain('Not settled for');
    expect(empty).toContain('Not settled for');
  });
});

describe('groupFailuresByReason', () => {
  const failure = (item: string, reason: string) => ({
    item,
    operation: 'assessmentMetadata',
    reason,
    statusCode: null,
  });

  it('collapses one identical reason across every probe that hit it', () => {
    const grouped = groupFailuresByReason([
      failure('subscription@a', 'tenant not found'),
      failure('subscription@b', 'tenant not found'),
      failure('tenant@a', 'tenant not found'),
    ]);

    expect(grouped).toBe('subscription@a, subscription@b, tenant@a: tenant not found');
  });

  it('keeps two different reasons apart, so a real difference is not collapsed away', () => {
    const grouped = groupFailuresByReason([
      failure('subscription@a', 'tenant not found'),
      failure('tenant@a', 'AuthorizationFailed'),
    ]);

    expect(grouped).toBe('subscription@a: tenant not found; tenant@a: AuthorizationFailed');
  });
});
