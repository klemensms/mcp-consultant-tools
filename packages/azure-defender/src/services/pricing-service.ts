import type { DefenderClient } from '../defender-client.js';
import { DEFENDER_API_VERSIONS } from '../utils/defender-api-versions.js';
import type { SecurityPricing } from '../models/defender-types.js';

/**
 * The Defender CSPM plan's name in `Microsoft.Security/pricings`. It is the plan that
 * produces attack paths and assessment risk objects, so it is the one that explains an
 * empty result from either.
 */
export const CSPM_PLAN_NAME = 'CloudPosture';

export interface PricingSummary {
  total: number;
  standard: number;
  free: number;
  /** Names of the plans on the paid tier, sorted, so two runs are comparable. */
  standardPlans: string[];
  /** Plan name to sub-plan, for the plans that carry one. Two Standard plans differ. */
  subPlans: Record<string, string>;
  /**
   * `true` / `false` when the CloudPosture plan was in the response, `null` when it was
   * not. Three states, not two: "the plan is off" and "this response never mentioned the
   * plan" lead to different conclusions and only one of them is evidence.
   */
  cspmEnabled: boolean | null;
  note?: string;
}

export interface PricingListResult {
  pricings: SecurityPricing[];
  summary: PricingSummary;
}

/** Aggregate the plans. Exported so it can be tested without a live API. */
export function summarisePricings(
  pricings: SecurityPricing[]
): Omit<PricingSummary, 'cspmEnabled' | 'note'> {
  const standardPlans: string[] = [];
  const subPlans: Record<string, string> = {};
  let free = 0;

  for (const p of pricings) {
    if (p.properties.pricingTier === 'Standard') {
      standardPlans.push(p.name);
      if (p.properties.subPlan) subPlans[p.name] = p.properties.subPlan;
    } else {
      free++;
    }
  }

  standardPlans.sort();

  return {
    total: pricings.length,
    standard: standardPlans.length,
    free,
    standardPlans,
    subPlans,
  };
}

/**
 * Decide what the CloudPosture plan says about an empty CSPM result, and say it in words
 * a report can quote.
 *
 * This exists because a measured run reported zero attack paths and zero assessment risk
 * objects across an estate, and nothing in this package could tell "Defender looked and
 * found none" from "the plan that produces them was never on". Both readings were
 * defensible and they lead to opposite recommendations.
 */
export function cspmVerdict(pricings: SecurityPricing[]): {
  cspmEnabled: boolean | null;
  note: string;
} {
  const cspm = pricings.find((p) => p.name.toLowerCase() === CSPM_PLAN_NAME.toLowerCase());

  if (!cspm) {
    return {
      cspmEnabled: null,
      note:
        `The ${CSPM_PLAN_NAME} (Defender CSPM) plan is not present in this response, so ` +
        `whether CSPM is enabled is UNKNOWN - not off. Treat an empty attack-path or ` +
        `assessment-risk result as unexplained rather than as evidence of a clean estate.`,
    };
  }

  if (cspm.properties.pricingTier !== 'Standard') {
    return {
      cspmEnabled: false,
      note:
        `The ${CSPM_PLAN_NAME} (Defender CSPM) plan is on the Free tier, so CSPM is OFF. ` +
        `Attack paths and assessment risk objects are CSPM-only artefacts: an empty ` +
        `result from either is explained by this and is not evidence of a clean estate.`,
    };
  }

  const coverage = cspm.properties.resourcesCoverageStatus;
  const trailing =
    coverage && coverage !== 'FullyCovered'
      ? ` Coverage is ${coverage}, so some resources under this subscription are not ` +
        `covered and their absence from a CSPM result is not evidence either.`
      : '';

  return {
    cspmEnabled: true,
    note:
      `The ${CSPM_PLAN_NAME} (Defender CSPM) plan is enabled (Standard tier)${
        cspm.properties.subPlan ? `, sub-plan ${cspm.properties.subPlan}` : ''
      }, so an empty attack-path or assessment-risk result is a finding about the estate ` +
      `rather than about the configuration.${trailing}`,
  };
}

export class PricingService {
  constructor(private client: DefenderClient) {}

  /**
   * List every Defender plan on the subscription.
   *
   * `Pricings_List` returns a plain `{ value: [] }` envelope with no `nextLink` - the
   * plan list is bounded by however many plans Microsoft offers, so there is nothing to
   * paginate and `get` is the honest call here.
   */
  async listPricings(): Promise<PricingListResult> {
    const path = this.client.subscriptionPath('/providers/Microsoft.Security/pricings');
    const response = await this.client.get<{ value?: SecurityPricing[] }>(
      path,
      DEFENDER_API_VERSIONS.pricings
    );
    const pricings = response.value ?? [];

    const verdict = cspmVerdict(pricings);

    return {
      pricings,
      summary: {
        ...summarisePricings(pricings),
        cspmEnabled: verdict.cspmEnabled,
        note: verdict.note,
      },
    };
  }
}
