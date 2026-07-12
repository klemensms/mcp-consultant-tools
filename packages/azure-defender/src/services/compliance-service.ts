import type { DefenderClient } from '../defender-client.js';
import { DEFENDER_API_VERSIONS } from '../utils/defender-api-versions.js';
import type {
  RegulatoryComplianceStandard,
  RegulatoryComplianceControl,
  RegulatoryComplianceAssessment,
  ComplianceState,
} from '../models/defender-types.js';

export interface StandardsResult {
  standards: RegulatoryComplianceStandard[];
  summary: { total: number; byState: Record<string, number> };
}

export interface ControlsResult {
  controls: RegulatoryComplianceControl[];
  summary: { total: number; byState: Record<string, number> };
}

export interface ControlAssessmentsResult {
  assessments: RegulatoryComplianceAssessment[];
  summary: {
    total: number;
    byState: Record<string, number>;
    totalFailedResources: number;
  };
}

export interface ComplianceSummaryResult {
  standards: Array<{
    name: string;
    state: string;
    passedControls: number;
    failedControls: number;
    totalControls: number;
    compliancePercentage: number;
  }>;
  overallSummary: {
    totalStandards: number;
    totalPassed: number;
    totalFailed: number;
    averageCompliance: number;
  };
}

function countByState(items: Array<{ properties?: { state?: string } }>): Record<string, number> {
  const byState: Record<string, number> = {};
  for (const item of items) {
    const state = item.properties?.state ?? 'Unknown';
    byState[state] = (byState[state] ?? 0) + 1;
  }
  return byState;
}

/**
 * Percentage of *assessed* controls that passed. Skipped and unsupported controls
 * are excluded from the denominator — they are not failures, and counting them as
 * such would understate compliance. This matches how the Azure portal reports it.
 * Exported for unit tests.
 */
export function compliancePercentage(passed: number, failed: number): number {
  const assessed = passed + failed;
  return assessed > 0 ? Math.round((passed / assessed) * 1000) / 10 : 0;
}

export class ComplianceService {
  constructor(private client: DefenderClient) {}

  private standardsPath(): string {
    return this.client.subscriptionPath(
      '/providers/Microsoft.Security/regulatoryComplianceStandards'
    );
  }

  async listStandards(): Promise<StandardsResult> {
    const { items } = await this.client.paginate<RegulatoryComplianceStandard>(
      this.standardsPath(),
      DEFENDER_API_VERSIONS.regulatoryCompliance
    );

    return { standards: items, summary: { total: items.length, byState: countByState(items) } };
  }

  async listControls(options: {
    standardName: string;
    stateFilter?: ComplianceState;
  }): Promise<ControlsResult> {
    const path = `${this.standardsPath()}/${encodeURIComponent(options.standardName)}/regulatoryComplianceControls`;
    const { items } = await this.client.paginate<RegulatoryComplianceControl>(
      path,
      DEFENDER_API_VERSIONS.regulatoryCompliance
    );

    const controls = options.stateFilter
      ? items.filter((c) => c.properties?.state === options.stateFilter)
      : items;

    return { controls, summary: { total: controls.length, byState: countByState(controls) } };
  }

  async listControlAssessments(options: {
    standardName: string;
    controlName: string;
    stateFilter?: ComplianceState;
  }): Promise<ControlAssessmentsResult> {
    const path =
      `${this.standardsPath()}/${encodeURIComponent(options.standardName)}` +
      `/regulatoryComplianceControls/${encodeURIComponent(options.controlName)}` +
      `/regulatoryComplianceAssessments`;

    const { items } = await this.client.paginate<RegulatoryComplianceAssessment>(
      path,
      DEFENDER_API_VERSIONS.regulatoryCompliance
    );

    const assessments = options.stateFilter
      ? items.filter((a) => a.properties?.state === options.stateFilter)
      : items;

    let totalFailedResources = 0;
    for (const assessment of assessments) {
      totalFailedResources += assessment.properties?.failedResources ?? 0;
    }

    return {
      assessments,
      summary: {
        total: assessments.length,
        byState: countByState(assessments),
        totalFailedResources,
      },
    };
  }

  /**
   * Aggregate compliance across standards. An unknown `standardName` throws rather
   * than returning an empty summary — a typo would otherwise read as "0% compliant".
   */
  async getComplianceSummary(options?: { standardName?: string }): Promise<ComplianceSummaryResult> {
    const { standards } = await this.listStandards();
    const wanted = options?.standardName;

    let selected = standards;
    if (wanted) {
      selected = standards.filter((s) => s.name === wanted);
      if (selected.length === 0) {
        const available = standards.map((s) => s.name).join(', ') || '(none configured)';
        throw new Error(
          `Compliance standard '${wanted}' not found in this subscription. Available: ${available}`
        );
      }
    }

    const summaryStandards = selected.map((s) => {
      const passed = s.properties?.passedControls ?? 0;
      const failed = s.properties?.failedControls ?? 0;
      const skipped = s.properties?.skippedControls ?? 0;
      const unsupported = s.properties?.unsupportedControls ?? 0;

      return {
        name: s.name,
        state: s.properties?.state ?? 'Unknown',
        passedControls: passed,
        failedControls: failed,
        totalControls: passed + failed + skipped + unsupported,
        compliancePercentage: compliancePercentage(passed, failed),
      };
    });

    const totalPassed = summaryStandards.reduce((sum, s) => sum + s.passedControls, 0);
    const totalFailed = summaryStandards.reduce((sum, s) => sum + s.failedControls, 0);
    const averageCompliance =
      summaryStandards.length > 0
        ? Math.round(
            (summaryStandards.reduce((sum, s) => sum + s.compliancePercentage, 0) /
              summaryStandards.length) *
              10
          ) / 10
        : 0;

    return {
      standards: summaryStandards,
      overallSummary: {
        totalStandards: summaryStandards.length,
        totalPassed,
        totalFailed,
        averageCompliance,
      },
    };
  }
}
