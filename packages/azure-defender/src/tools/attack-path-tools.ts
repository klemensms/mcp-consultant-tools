import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY } from './tool-helpers.js';
import { DEFAULT_ATTACK_PATH_RESULTS, MAX_ATTACK_PATH_RESULTS } from '../services/attack-path-service.js';

const SHAPE_NOTE =
  "Two row shapes exist and a tenant returns one of them: the legacy Defender CSPM shape (potentialImpact, riskCategories, entryPointEntityInternalID, targetEntityInternalID) or the Microsoft Security Exposure Management shape (riskLevel, riskFactors, entryPoint, target, attackPathSteps, mITRETacticsAndTechniques, attackStory, isPartialAttackPath). Microsoft's published field table still documents only the legacy set. Both are mapped, so read riskLevel OR potentialImpact and riskFactors OR riskCategories - never one alone, or a High-risk path reads as having no risk.";

const CSPM_NOTE =
  'Attack paths exist only when the Defender CSPM plan is enabled on the subscription (plus agentless VM scanning or the Defender for Servers vulnerability assessment). An empty result almost always means CSPM is off, not that the subscription has no attack paths - check the plan before reporting "no risk".';

export function registerAttackPathTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'defender-list-attack-paths',
    `Attack paths identified by Defender for Cloud, read via Azure Resource Graph (there is no Microsoft.Security/attackPaths ARM endpoint). ${SHAPE_NOTE} Both filters are case-insensitive substring matches and each one searches both spellings of its field, so a filter works whichever shape the tenant returns; run once with no filter to see which values this subscription actually uses, since Microsoft publishes the allowed values of none of these fields. summary.byRiskLevel counts paths by their effective risk level and summary.byRiskFactor counts each factor on each path, so byRiskFactor sums to more than summary.total. summary.riskLevelNotReported counts paths whose payload named no risk level at all: those are bucketed as 'NotReported' and a summary.note appears - a missing risk level is a gap in the payload, never evidence of low risk. When truncated is true, more paths matched than were returned. ${CSPM_NOTE}`,
    {
      riskCategory: z
        .string()
        .optional()
        .describe(
          "Case-insensitive substring match against the path's risk factors, searching both riskFactors and riskCategories."
        ),
      riskLevel: z
        .string()
        .optional()
        .describe(
          "Case-insensitive substring match against the path's risk level, searching both riskLevel and potentialImpact (e.g. 'High')."
        ),
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
    async (args: {
      riskCategory?: string;
      riskLevel?: string;
      displayNameContains?: string;
      maxResults?: number;
    }) =>
      runTool('listing attack paths', () => ctx.attackPath.listAttackPaths(args))
  );

  server.tool(
    'defender-get-attack-path',
    `One attack path in full: description, attackPathType, manualRemediationSteps, the per-entity assessments map, the graphComponent, and the whole risk payload under whichever names the row carries. ${SHAPE_NOTE} Anything Microsoft adds that this server does not yet name arrives under properties.unmappedProperties rather than being dropped, so read that too before concluding a field is absent. graphComponent holds insights, entities and connections - it does NOT hold nodes/edges. Returns null when no path with that name exists. Take attackPathName from defender-list-attack-paths (the row's name, matched case-insensitively). ${CSPM_NOTE}`,
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
