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

/**
 * Regulatory compliance is a paid-plan surface. On a subscription with no paid Defender
 * plan ARM refuses the call outright, and once that refusal reaches a batch caller it
 * looks exactly like a fault in the estate. A measured assurance run hit it on 8 of 16
 * subscriptions. The hint names the command that answers whether this subscription has
 * a plan, so nobody has to parse an error string to find out.
 *
 * Deliberately NOT turned into a `notApplicable: true` success payload. Nothing in this
 * repo records which ARM error code the refusal carries, so recognising it would mean
 * matching on a guessed string, and a wrong match turns a genuine failure into a clean
 * compliance report. It would also flip the exit code for every batch caller keyed on it.
 */
const PLAN_HINT =
  'Hint: if this subscription has no paid Defender for Cloud plan, regulatory compliance is ' +
  'unavailable and this failure is expected rather than a gap in the estate. Run ' +
  'defender-list-plans (CLI: plan list-plans) to check before recording a finding.';

export class ComplianceService {
  constructor(private client: DefenderClient) {}

  /**
   * Rethrow an ARM failure with `PLAN_HINT` appended, ARM's own code and message first.
   * Wraps the ARM calls only, never a whole public method, so an error this service
   * raises itself (an unknown standard name) does not collect a hint about plans.
   */
  private async withPlanHint<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}\n${PLAN_HINT}`, { cause: error });
    }
  }

  private standardsPath(): string {
    return this.client.subscriptionPath(
      '/providers/Microsoft.Security/regulatoryComplianceStandards'
    );
  }

  async listStandards(): Promise<StandardsResult> {
    const { items } = await this.withPlanHint(() =>
      this.client.paginate<RegulatoryComplianceStandard>(
        this.standardsPath(),
        DEFENDER_API_VERSIONS.regulatoryCompliance
      )
    );

    return { standards: items, summary: { total: items.length, byState: countByState(items) } };
  }

  async listControls(options: {
    standardName: string;
    stateFilter?: ComplianceState;
  }): Promise<ControlsResult> {
    const path = `${this.standardsPath()}/${encodeURIComponent(options.standardName)}/regulatoryComplianceControls`;
    const { items } = await this.withPlanHint(() =>
      this.client.paginate<RegulatoryComplianceControl>(
        path,
        DEFENDER_API_VERSIONS.regulatoryCompliance
      )
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

    const { items } = await this.withPlanHint(() =>
      this.client.paginate<RegulatoryComplianceAssessment>(
        path,
        DEFENDER_API_VERSIONS.regulatoryCompliance
      )
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
