/**
 * Monitoring CLI Commands - 4 commands mapping to monitoring MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerMonitoringCommands(program: Command, ctx: ServiceContext): void {
  const monitoring = program.command('monitoring').description('Azure monitoring operations');

  monitoring
    .command('alerts')
    .description('List all metric alert rules in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option('--target-resource-id <id>', 'Filter alerts for a specific resource ID')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.monitoring.listAlertRules({
          resourceGroup: opts.resourceGroup,
          targetResourceId: opts.targetResourceId,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'alert-rules', data: result, summary: `Found ${count} alert rule(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list alert rules'); }
    });

  monitoring
    .command('action-groups')
    .description('List all action groups (notification targets)')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.monitoring.listActionGroups({
          resourceGroup: opts.resourceGroup,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'action-groups', data: result, summary: `Found ${count} action group(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list action groups'); }
    });

  monitoring
    .command('smart-alerts')
    .description('List all smart detector (AI-based) alert rules')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.monitoring.listSmartDetectorAlerts({
          resourceGroup: opts.resourceGroup,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'smart-detector-alerts', data: result, summary: `Found ${count} smart detector alert(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list smart detector alerts'); }
    });

  monitoring
    .command('log-alerts')
    .description('List log-search alert rules (a different surface from metric alerts)')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.monitoring.listScheduledQueryRules({
          resourceGroup: opts.resourceGroup,
        });
        const { total, alerting, note } = result.summary;
        outputResult(
          {
            fileName: 'scheduled-query-rules',
            data: result,
            summary: `Found ${total} log-search alert rule(s), ${alerting} able to raise an alert\n${note}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list scheduled query rules'); }
    });
}
