import { describe, it, expect, vi } from 'vitest';
import {
  AssessmentService,
  normalizeArmResourceId,
  summariseAssessments,
  summariseAssessmentMetadata,
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

const fakeClient = (parts: Partial<Record<'paginate' | 'get', unknown>>) =>
  ({
    subscriptionPath: (p = '') => `/subscriptions/SUB${p}`,
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

  it('delegates the limit to the client when there is no status filter', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [assessment('Healthy')], truncated: true });
    const service = new AssessmentService(fakeClient({ paginate }));

    const result = await service.listAssessments({ maxResults: 1 });

    expect(paginate.mock.calls[0][3]).toBe(1);
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
