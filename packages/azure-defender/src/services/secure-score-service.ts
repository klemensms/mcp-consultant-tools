import type { DefenderClient } from '../defender-client.js';
import { DEFENDER_API_VERSIONS } from '../utils/defender-api-versions.js';
import type { SecureScore, SecureScoreControl } from '../models/defender-types.js';

/**
 * ARM reports `score.percentage` as a fraction in [0, 1]. Render it as a percent
 * with one decimal place.
 */
export function toPercent(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

export interface SecureScoreResult {
  score: SecureScore;
  summary: {
    displayName: string;
    currentScore: number;
    maxScore: number;
    percentage: number;
  };
}

export interface ScoreControlsResult {
  controls: SecureScoreControl[];
  truncated: boolean;
  summary: {
    total: number;
    totalHealthy: number;
    totalUnhealthy: number;
    averageScorePercentage: number;
  };
}

/** Aggregate the returned controls. Exported so it can be tested without a live API. */
export function summariseScoreControls(controls: SecureScoreControl[]): ScoreControlsResult['summary'] {
  let totalHealthy = 0;
  let totalUnhealthy = 0;
  let scoreSum = 0;

  for (const control of controls) {
    totalHealthy += control.properties.healthyResourceCount ?? 0;
    totalUnhealthy += control.properties.unhealthyResourceCount ?? 0;
    scoreSum += control.properties.score?.percentage ?? 0;
  }

  return {
    total: controls.length,
    totalHealthy,
    totalUnhealthy,
    // Unweighted mean across controls. Controls carry a `weight`, so this is NOT
    // the subscription's secure score - it is a rough "how are controls doing" figure.
    averageScorePercentage: controls.length > 0 ? toPercent(scoreSum / controls.length) : 0,
  };
}

export class SecureScoreService {
  constructor(private client: DefenderClient) {}

  /** `ascScore` is the well-known name of the ASC Default initiative's score. */
  async getSecureScore(scoreName: string = 'ascScore'): Promise<SecureScoreResult> {
    const path = this.client.subscriptionPath(
      `/providers/Microsoft.Security/secureScores/${encodeURIComponent(scoreName)}`
    );
    const score = await this.client.get<SecureScore>(path, DEFENDER_API_VERSIONS.secureScores);

    return {
      score,
      summary: {
        displayName: score.properties.displayName,
        currentScore: score.properties.score.current,
        maxScore: score.properties.score.max,
        percentage: toPercent(score.properties.score.percentage),
      },
    };
  }

  async listSecureScores(): Promise<{ scores: SecureScore[]; summary: { total: number } }> {
    const path = this.client.subscriptionPath('/providers/Microsoft.Security/secureScores');
    const { items } = await this.client.paginate<SecureScore>(
      path,
      DEFENDER_API_VERSIONS.secureScores
    );

    return { scores: items, summary: { total: items.length } };
  }

  async listScoreControls(options?: { maxResults?: number }): Promise<ScoreControlsResult> {
    const path = this.client.subscriptionPath('/providers/Microsoft.Security/secureScoreControls');
    const { items, truncated } = await this.client.paginate<SecureScoreControl>(
      path,
      DEFENDER_API_VERSIONS.secureScoreControls,
      undefined,
      options?.maxResults
    );

    return { controls: items, truncated, summary: summariseScoreControls(items) };
  }
}
