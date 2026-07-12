import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY } from './tool-helpers.js';
import { DEFAULT_ATTACK_PATH_RESULTS, MAX_ATTACK_PATH_RESULTS } from '../services/attack-path-service.js';

const CSPM_NOTE =
  'Attack paths exist only when the Defender CSPM plan is enabled on the subscription (plus agentless VM scanning or the Defender for Servers vulnerability assessment). An empty result almost always means CSPM is off, not that the subscription has no attack paths — check the plan before reporting "no risk".';

export function registerAttackPathTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'defender-list-attack-paths',
    `Attack paths identified by Defender for Cloud, read via Azure Resource Graph (there is no Microsoft.Security/attackPaths ARM endpoint). Each path reports potentialImpact and riskCategories. Note there is NO 'riskLevel' or 'riskFactors' field on an attack path — those belong to the unrelated risk object on a security assessment. Filters are case-insensitive substring matches; run once with no filter to see which potentialImpact and riskCategories values this subscription actually uses, since Microsoft does not publish the allowed values. summary.byRiskCategory counts each category on each path, so it sums to more than summary.total. When truncated is true, more paths matched than were returned. ${CSPM_NOTE}`,
    {
      riskCategory: z
        .string()
        .optional()
        .describe('Case-insensitive substring match against the path\'s riskCategories list.'),
      displayNameContains: z
        .string()
        .optional()
        .describe('Case-insensitive substring match against the path display name.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(MAX_ATTACK_PATH_RESULTS)
        .optional()
        .describe(`Maximum paths to return (default ${DEFAULT_ATTACK_PATH_RESULTS}, max ${MAX_ATTACK_PATH_RESULTS}).`),
    },
    READ_ONLY,
    async (args: { riskCategory?: string; displayNameContains?: string; maxResults?: number }) =>
      runTool('listing attack paths', () => ctx.attackPath.listAttackPaths(args))
  );

  server.tool(
    'defender-get-attack-path',
    `One attack path in full: description, attackPathType, manualRemediationSteps, potentialImpact, riskCategories, the entry-point and target entity internal IDs, the per-entity assessments map, and the graphComponent. graphComponent holds insights, entities and connections — it does NOT hold nodes/edges. Returns null when no path with that name exists. Take attackPathName from defender-list-attack-paths (the row's name, matched case-insensitively). ${CSPM_NOTE}`,
    {
      attackPathName: z
        .string()
        .describe("Attack path name from defender-list-attack-paths (the row's `name`, not its displayName)."),
    },
    READ_ONLY,
    async ({ attackPathName }: { attackPathName: string }) =>
      runTool('getting attack path', async () => {
        const result = await ctx.attackPath.getAttackPath({ attackPathName });
        return result ?? { attackPath: null, message: `Attack path '${attackPathName}' not found.` };
      })
  );
}
