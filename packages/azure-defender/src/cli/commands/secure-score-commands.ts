/**
 * Secure score CLI commands - 3 commands mapping to the secure-score MCP tools.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { parsePositiveInt, truncationNote } from './helpers.js';
import { toPercent } from '../../services/secure-score-service.js';

export function registerSecureScoreCommands(program: Command, ctx: ServiceContext): void {
  const score = program.command('score').description('Defender for Cloud secure score');

  score
    .command('get-secure-score')
    .description('The subscription overall secure score')
    .option('-n, --score-name <name>', "Score name (default: 'ascScore')")
    .action(async (opts: { scoreName?: string }) => {
      try {
        const result = await ctx.secureScore.getSecureScore(opts.scoreName);
        outputResult(
          {
            fileName: 'defender-secure-score',
            data: result,
            summary: [
              `Secure score: ${result.summary.currentScore}/${result.summary.maxScore} (${result.summary.percentage}%)`,
              `  Initiative: ${result.summary.displayName}`,
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get secure score');
      }
    });

  score
    .command('list-secure-scores')
    .description('All secure score entities in the subscription (one per initiative)')
    .action(async () => {
      try {
        const result = await ctx.secureScore.listSecureScores();
        outputResult(
          {
            fileName: 'defender-secure-scores',
            data: result,
            summary: [
              `Found ${result.summary.total} secure score(s)`,
              ...result.scores.map(
                (s) =>
                  `  ${s.properties.displayName}: ${s.properties.score.current}/${s.properties.score.max} (${toPercent(s.properties.score.percentage)}%)`
              ),
            ].join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list secure scores');
      }
    });

  score
    .command('list-score-controls')
    .description('Secure score controls with healthy/unhealthy resource counts')
    .option('-m, --max-results <count>', 'Maximum controls to return')
    .action(async (opts: { maxResults?: string }) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, '--max-results');
        const result = await ctx.secureScore.listScoreControls({ maxResults });
        outputResult(
          {
            fileName: 'defender-score-controls',
            data: result,
            summary: [
              `Found ${result.summary.total} control(s) | unweighted mean score: ${result.summary.averageScorePercentage}%`,
              `  Healthy resources: ${result.summary.totalHealthy} | Unhealthy: ${result.summary.totalUnhealthy}`,
              truncationNote(result.truncated),
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list score controls');
      }
    });
}
