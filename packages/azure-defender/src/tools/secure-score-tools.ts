import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, SECURITY_READER } from './tool-helpers.js';

export function registerSecureScoreTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'defender-get-secure-score',
    `The subscription's overall Microsoft Defender for Cloud secure score: current points, maximum points, and the percentage. Defaults to 'ascScore', the well-known name of the ASC Default initiative — omit scoreName unless you know a custom initiative's score name. ${SECURITY_READER}`,
    {
      scoreName: z
        .string()
        .optional()
        .describe("⚠️ OMIT unless you have a custom initiative. Defaults to 'ascScore'."),
    },
    READ_ONLY,
    async ({ scoreName }: { scoreName?: string }) =>
      runTool('getting secure score', () => ctx.secureScore.getSecureScore(scoreName))
  );

  server.tool(
    'defender-list-secure-scores',
    `Every secure score entity in the subscription — one per initiative. Most subscriptions have only the ASC Default initiative, so this usually returns a single row; use defender-get-secure-score for that one directly. ${SECURITY_READER}`,
    {},
    READ_ONLY,
    async () => runTool('listing secure scores', () => ctx.secureScore.listSecureScores())
  );

  server.tool(
    'defender-list-score-controls',
    `Secure score controls with their healthy/unhealthy resource counts and per-control score. Use this to find which control areas drag the score down. summary.averageScorePercentage is an UNWEIGHTED mean across controls — controls carry a weight, so it is a rough health indicator, not the subscription's secure score (use defender-get-secure-score for that). When truncated is true, maxResults cut the list and every count in summary covers only the returned controls; omit maxResults for subscription-wide totals. ${SECURITY_READER}`,
    {
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum controls to return. Omit for all (a subscription typically has under 100).'),
    },
    READ_ONLY,
    async ({ maxResults }: { maxResults?: number }) =>
      runTool('listing score controls', () => ctx.secureScore.listScoreControls({ maxResults }))
  );
}
