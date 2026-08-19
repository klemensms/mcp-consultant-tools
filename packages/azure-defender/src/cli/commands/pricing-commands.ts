/**
 * Defender plan CLI commands - 1 command mapping to the pricing MCP tool.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerPricingCommands(program: Command, ctx: ServiceContext): void {
  const plan = program.command('plan').description('Defender for Cloud plan configuration');

  plan
    .command('list-plans')
    .description('Which Defender plans are enabled, and whether Defender CSPM is on')
    .action(async () => {
      try {
        const result = await ctx.pricing.listPricings();
        const { total, standard, free, standardPlans, subPlans, cspmEnabled, note } =
          result.summary;

        const cspmLine =
          cspmEnabled === true
            ? '  Defender CSPM: ENABLED'
            : cspmEnabled === false
              ? '  Defender CSPM: OFF'
              : '  Defender CSPM: UNKNOWN (plan absent from the response)';

        outputResult(
          {
            fileName: 'defender-plans',
            data: result,
            summary: [
              `Found ${total} Defender plan(s): ${standard} Standard, ${free} Free`,
              cspmLine,
              standardPlans.length > 0
                ? `  Paid plans: ${standardPlans
                    .map((p) => (subPlans[p] ? `${p} (${subPlans[p]})` : p))
                    .join(', ')}`
                : '',
              note ? `  ⚠️ ${note}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list Defender plans');
      }
    });
}
