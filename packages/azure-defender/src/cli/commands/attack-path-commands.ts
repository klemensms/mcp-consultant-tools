/**
 * Attack path CLI commands — 2 commands mapping to the attack-path MCP tools.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { parsePositiveInt, truncationNote } from './helpers.js';
import {
  effectiveRiskFactors,
  effectiveRiskLevel,
  labelOf,
} from '../../services/attack-path-service.js';

const CSPM_HINT =
  '  ℹ️ No attack paths found. This usually means the Defender CSPM plan is not enabled on this subscription, rather than that no attack paths exist.';

export function registerAttackPathCommands(program: Command, ctx: ServiceContext): void {
  const attackPath = program
    .command('attack-path')
    .description('Defender CSPM attack paths (via Azure Resource Graph)');

  attackPath
    .command('list-attack-paths')
    .description('Attack paths identified by Defender for Cloud')
    .option(
      '-r, --risk-category <category>',
      'Case-insensitive substring match on riskFactors or riskCategories'
    )
    .option(
      '-l, --risk-level <level>',
      'Case-insensitive substring match on riskLevel or potentialImpact, e.g. High'
    )
    .option('-n, --name-contains <text>', 'Case-insensitive substring match on displayName')
    .option('-m, --max-results <count>', 'Maximum paths to return (default 100, max 500)')
    .action(
      async (opts: {
        riskCategory?: string;
        riskLevel?: string;
        nameContains?: string;
        maxResults?: string;
      }) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, '--max-results');
        const result = await ctx.attackPath.listAttackPaths({
          riskCategory: opts.riskCategory,
          riskLevel: opts.riskLevel,
          displayNameContains: opts.nameContains,
          maxResults,
        });

        outputResult(
          {
            fileName: 'defender-attack-paths',
            data: result,
            summary: [
              `Found ${result.summary.total} attack path(s)`,
              ...Object.entries(result.summary.byRiskLevel).map(
                ([level, count]) => `  risk level ${level}: ${count}`
              ),
              ...Object.entries(result.summary.byRiskFactor).map(
                ([factor, count]) => `  risk factor ${factor}: ${count}`
              ),
              result.summary.note ? `  ⚠️ ${result.summary.note}` : '',
              truncationNote(result.truncated),
              result.summary.total === 0 ? CSPM_HINT : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list attack paths');
      }
      }
    );

  attackPath
    .command('get-attack-path')
    .description('One attack path in full, including its graph components')
    .argument('<attackPathName>', "Attack path name from list-attack-paths (the row's `name`)")
    .action(async (attackPathName: string) => {
      try {
        const result = await ctx.attackPath.getAttackPath({ attackPathName });

        if (!result) {
          outputResult(
            {
              fileName: `defender-attack-path-${attackPathName}`,
              data: { attackPath: null },
              summary: `Attack path '${attackPathName}' not found.`,
            },
            getGlobalFlags(program)
          );
          return;
        }

        const props = result.properties;
        const graph = props.graphComponent;
        const level = effectiveRiskLevel(result);
        const factors = effectiveRiskFactors(result);
        const entryPoint = labelOf(props.entryPoint) ?? props.entryPointEntityInternalID;
        const target = labelOf(props.target) ?? props.targetEntityInternalID;
        outputResult(
          {
            fileName: `defender-attack-path-${attackPathName}`,
            data: result,
            summary: [
              `Attack path: ${props.displayName}`,
              // "not reported by the API" rather than "Unknown": the payload named no
              // risk level, which is a gap in the data and not a finding of low risk.
              `  Risk level: ${level ?? 'not reported by the API'}`,
              `  Risk factors: ${factors.join(', ') || 'not reported by the API'}`,
              `  Type: ${props.attackPathType ?? 'N/A'}`,
              entryPoint ? `  Entry point: ${entryPoint}` : '',
              target ? `  Target: ${target}` : '',
              props.attackPathSteps ? `  Steps: ${props.attackPathSteps.length}` : '',
              props.isPartialAttackPath
                ? '  ⚠️ isPartialAttackPath: this path is incomplete, so its steps are a lower bound.'
                : '',
              props.description ? `  Description: ${props.description}` : '',
              props.attackStory ? `  Attack story: ${props.attackStory}` : '',
              graph
                ? `  Graph: ${graph.entities?.length ?? 0} entities, ${graph.connections?.length ?? 0} connections, ${graph.insights?.length ?? 0} insights`
                : '',
              props.unmappedProperties
                ? `  Fields not named by this server (see the JSON): ${Object.keys(props.unmappedProperties).join(', ')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get attack path');
      }
    });
}
