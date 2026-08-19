import type { ServiceContext } from '../types.js';
import { runTool, READ_ONLY, SECURITY_READER } from './tool-helpers.js';

export function registerPricingTools(server: any, ctx: ServiceContext): void {
  server.tool(
    'defender-list-plans',
    `Which Microsoft Defender for Cloud plans are enabled on the subscription (Microsoft.Security/pricings). Standard is the paid tier; Free means the plan is off. Read this BEFORE concluding anything from an empty Defender result: summary.cspmEnabled and summary.note say whether the Defender CSPM plan was on, and attack paths and assessment risk objects are CSPM-only artefacts, so with CSPM off an empty result from either is explained by the configuration rather than being evidence of a clean estate. cspmEnabled is deliberately three-state - true, false, or null when the CloudPosture plan was absent from the response entirely, which means UNKNOWN and not off. summary.standardPlans names the paid plans and summary.subPlans the sub-plan each carries, because two Standard plans are not necessarily the same plan. ${SECURITY_READER}`,
    {},
    READ_ONLY,
    async () => runTool('listing Defender plans', () => ctx.pricing.listPricings())
  );
}
