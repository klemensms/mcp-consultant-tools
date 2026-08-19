/**
 * Security alert CLI commands - 1 command mapping to the alert MCP tool.
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';
import { parsePositiveInt, parseEnum, ALERT_STATUSES, ALERT_SEVERITIES } from './helpers.js';

export function registerAlertCommands(program: Command, ctx: ServiceContext): void {
  const alert = program.command('alert').description('Defender for Cloud security alerts');

  alert
    .command('list-alerts')
    .description('Security alerts across the subscription, with status and severity breakdowns')
    .option('-s, --status <status>', `Filter by status (${ALERT_STATUSES.join('|')})`)
    .option('-v, --severity <severity>', `Filter by severity (${ALERT_SEVERITIES.join('|')})`)
    .option('-m, --max-results <count>', 'Maximum alerts to fetch before filtering')
    .action(async (opts: { status?: string; severity?: string; maxResults?: string }) => {
      try {
        const result = await ctx.alert.listAlerts({
          status: parseEnum(opts.status, ALERT_STATUSES, '--status'),
          severity: parseEnum(opts.severity, ALERT_SEVERITIES, '--severity'),
          maxResults: parsePositiveInt(opts.maxResults, '--max-results'),
        });

        const { total, matchedOf, byStatus, bySeverity, topEntities, note } = result.summary;
        const breakdown = (counts: Record<string, number>) =>
          Object.entries(counts)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ') || 'none';

        outputResult(
          {
            fileName: 'defender-alerts',
            data: result,
            summary: [
              total === matchedOf
                ? `Found ${total} alert(s)`
                : `Found ${total} matching alert(s) of ${matchedOf} returned`,
              `  Status: ${breakdown(byStatus)}`,
              `  Severity: ${breakdown(bySeverity)}`,
              topEntities.length > 0
                ? `  Clustered on: ${topEntities.map((e) => `${e.entity} (${e.alerts})`).join(', ')}`
                : '',
              note ? `  ⚠️ ${note}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'list security alerts');
      }
    });
}
