import { describe, it, expect, vi } from 'vitest';
import { ComplianceService, compliancePercentage } from '../compliance-service.js';
import type { DefenderClient } from '../../defender-client.js';
import type { RegulatoryComplianceStandard } from '../../models/defender-types.js';

const standard = (
  name: string,
  passed: number,
  failed: number,
  skipped = 0,
  unsupported = 0
): RegulatoryComplianceStandard =>
  ({
    id: `/id/${name}`,
    name,
    type: 'Microsoft.Security/regulatoryComplianceStandards',
    properties: {
      state: failed > 0 ? 'Failed' : 'Passed',
      passedControls: passed,
      failedControls: failed,
      skippedControls: skipped,
      unsupportedControls: unsupported,
    },
  }) as RegulatoryComplianceStandard;

const fakeClient = (paginate: unknown) =>
  ({
    subscriptionPath: (p = '') => `/subscriptions/SUB${p}`,
    paginate,
  }) as unknown as DefenderClient;

describe('compliancePercentage', () => {
  it('divides by assessed controls only, excluding skipped and unsupported', () => {
    expect(compliancePercentage(3, 1)).toBe(75);
  });

  it('returns 0 rather than NaN when nothing was assessed', () => {
    expect(compliancePercentage(0, 0)).toBe(0);
  });

  it('rounds to one decimal', () => {
    expect(compliancePercentage(1, 2)).toBe(33.3);
  });
});

describe('ComplianceService.listControls', () => {
  it('url-encodes the standard name into the path', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [], truncated: false });
    const service = new ComplianceService(fakeClient(paginate));

    await service.listControls({ standardName: 'Azure CIS/1.1' });

    expect(paginate.mock.calls[0][0]).toBe(
      '/subscriptions/SUB/providers/Microsoft.Security/regulatoryComplianceStandards/Azure%20CIS%2F1.1/regulatoryComplianceControls'
    );
  });
});

describe('ComplianceService.listControlAssessments', () => {
  it('url-encodes both the standard and the control name', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [], truncated: false });
    const service = new ComplianceService(fakeClient(paginate));

    await service.listControlAssessments({ standardName: 'S 1', controlName: 'C/2' });

    expect(paginate.mock.calls[0][0]).toContain('/regulatoryComplianceStandards/S%201/');
    expect(paginate.mock.calls[0][0]).toContain('/regulatoryComplianceControls/C%2F2/');
  });
});

describe('ComplianceService.getComplianceSummary', () => {
  it('rolls up every standard when no name is given', async () => {
    const paginate = vi.fn().mockResolvedValue({
      items: [standard('CIS', 3, 1), standard('PCI', 1, 1)],
      truncated: false,
    });
    const service = new ComplianceService(fakeClient(paginate));

    const result = await service.getComplianceSummary();

    expect(result.overallSummary.totalStandards).toBe(2);
    expect(result.overallSummary.totalPassed).toBe(4);
    expect(result.overallSummary.totalFailed).toBe(2);
    expect(result.standards[0].compliancePercentage).toBe(75);
    expect(result.standards[1].compliancePercentage).toBe(50);
    // mean of 75 and 50
    expect(result.overallSummary.averageCompliance).toBe(62.5);
  });

  it('counts skipped and unsupported in totalControls but not in the percentage', async () => {
    const paginate = vi
      .fn()
      .mockResolvedValue({ items: [standard('CIS', 1, 1, 5, 3)], truncated: false });
    const service = new ComplianceService(fakeClient(paginate));

    const result = await service.getComplianceSummary();

    expect(result.standards[0].totalControls).toBe(10);
    expect(result.standards[0].compliancePercentage).toBe(50);
  });

  it('throws for an unknown standard rather than reporting 0% compliance', async () => {
    // A typo would otherwise produce an empty summary with averageCompliance: 0,
    // which reads as "totally non-compliant" instead of "no such standard".
    const paginate = vi
      .fn()
      .mockResolvedValue({ items: [standard('CIS', 1, 0)], truncated: false });
    const service = new ComplianceService(fakeClient(paginate));

    await expect(service.getComplianceSummary({ standardName: 'Azure-CIS-1.1.0' })).rejects.toThrow(
      /not found in this subscription\. Available: CIS/
    );
  });

  it('reports "(none configured)" when the subscription has no standards at all', async () => {
    const paginate = vi.fn().mockResolvedValue({ items: [], truncated: false });
    const service = new ComplianceService(fakeClient(paginate));

    await expect(service.getComplianceSummary({ standardName: 'CIS' })).rejects.toThrow(
      /\(none configured\)/
    );
  });
});

describe('ComplianceService failure hint', () => {
  // Measured: the regulatory-compliance commands hard-failed on 8 of 16 subscriptions in
  // an assurance run, and every one of those failures is indistinguishable from a real
  // fault once it reaches a batch caller. The compliance surface needs a paid Defender
  // plan; the hint names the command that answers whether this subscription has one.
  const armRefusal = () =>
    vi.fn().mockRejectedValue(new Error('BadRequest: The subscription is not onboarded'));

  it("keeps ARM's own code and message ahead of the hint", async () => {
    const service = new ComplianceService(fakeClient(armRefusal()));

    await expect(service.listStandards()).rejects.toThrow(
      /^BadRequest: The subscription is not onboarded\n/
    );
  });

  it('names defender-list-plans so a caller does not have to parse the error string', async () => {
    const service = new ComplianceService(fakeClient(armRefusal()));

    await expect(service.listStandards()).rejects.toThrow(/defender-list-plans/);
  });

  it('hints on a control-assessments failure too, not only on the standards list', async () => {
    const service = new ComplianceService(fakeClient(armRefusal()));

    await expect(
      service.listControlAssessments({ standardName: 'CIS', controlName: '1.1' })
    ).rejects.toThrow(/defender-list-plans/);
  });

  it('attaches the hint exactly once when the summary fails through listStandards', async () => {
    const service = new ComplianceService(fakeClient(armRefusal()));

    const error = await service.getComplianceSummary().catch((e: Error) => e);

    expect(error.message.match(/defender-list-plans/g)).toHaveLength(1);
  });

  it('leaves an unknown-standard error alone, because that is a typo and not a missing plan', async () => {
    const paginate = vi
      .fn()
      .mockResolvedValue({ items: [standard('CIS', 1, 0)], truncated: false });
    const service = new ComplianceService(fakeClient(paginate));

    const error = await service
      .getComplianceSummary({ standardName: 'Azure-CIS-1.1.0' })
      .catch((e: Error) => e);

    expect(error.message).not.toMatch(/defender-list-plans/);
  });
});
