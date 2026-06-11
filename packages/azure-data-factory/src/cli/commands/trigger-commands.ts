/**
 * Trigger CLI Commands - 5 commands for trigger operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerTriggerCommands(program: Command, ctx: ServiceContext): void {
  const trigger = program.command('trigger').description('Trigger operations');

  trigger
    .command('list')
    .description('List all triggers in an Azure Data Factory')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const triggers = await svc.listTriggers(opts.factoryId);
        const factory = svc.resolveFactory(opts.factoryId);
        const summary = triggers.map((t: any) => ({
          name: t.name,
          type: t.properties.type,
          runtimeState: t.properties.runtimeState,
          description: t.properties.description,
        }));
        outputResult(
          { fileName: 'triggers', data: { factory: factory.name, count: triggers.length, triggers: summary }, summary: `${triggers.length} triggers in ${factory.name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list triggers'); }
    });

  trigger
    .command('get')
    .description('Get details of a specific trigger including schedule and configuration')
    .argument('<name>', 'Trigger name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.adf.getTrigger(name, opts.factoryId);
        outputResult(
          { fileName: `trigger-${name}`, data: result, summary: `Trigger: ${name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get trigger'); }
    });

  trigger
    .command('start')
    .description('Start (activate) a trigger (requires ENABLE_TRIGGER_CONTROL=true)')
    .argument('<name>', 'Trigger name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        await ctx.adf.startTrigger(name, opts.factoryId);
        const data = { message: `Trigger '${name}' start initiated`, note: 'The trigger may take a moment to fully start' };
        outputResult(
          { fileName: `trigger-start-${name}`, data, summary: `Trigger '${name}' start initiated` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'start trigger'); }
    });

  trigger
    .command('stop')
    .description('Stop (deactivate) a trigger (requires ENABLE_TRIGGER_CONTROL=true)')
    .argument('<name>', 'Trigger name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        await ctx.adf.stopTrigger(name, opts.factoryId);
        const data = { message: `Trigger '${name}' stop initiated`, note: 'The trigger may take a moment to fully stop' };
        outputResult(
          { fileName: `trigger-stop-${name}`, data, summary: `Trigger '${name}' stop initiated` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'stop trigger'); }
    });

  trigger
    .command('query-runs')
    .description('Query trigger execution history')
    .option('-d, --last-days <n>', 'Number of days to look back', '7')
    .option('-n, --trigger-name <name>', 'Filter by trigger name')
    .option('-s, --status <status>', 'Filter by status (Succeeded|Failed|Inprogress)')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const now = new Date();
        const days = parseInt(opts.lastDays) || 7;

        const request = {
          lastUpdatedAfter: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
          lastUpdatedBefore: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          filters: [] as any[],
          orderBy: [{ orderBy: 'TriggerRunTimestamp' as const, order: 'DESC' as const }],
        };

        if (opts.triggerName) {
          request.filters.push({ operand: 'TriggerName', operator: 'Equals', values: [opts.triggerName] });
        }
        if (opts.status) {
          request.filters.push({ operand: 'Status', operator: 'Equals', values: [opts.status] });
        }

        const result = await svc.queryTriggerRuns(request, opts.factoryId);
        const runs = result.value.map((tr: any) => ({
          triggerRunId: tr.triggerRunId,
          triggerName: tr.triggerName,
          triggerType: tr.triggerType,
          status: tr.status,
          timestamp: tr.triggerRunTimestamp,
          message: tr.message,
        }));
        outputResult(
          { fileName: 'trigger-runs', data: { count: runs.length, triggerRuns: runs }, summary: `${runs.length} trigger runs found (last ${days} days)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'query trigger runs'); }
    });
}
