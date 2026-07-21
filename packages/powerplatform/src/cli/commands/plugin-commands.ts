/**
 * Plugin CLI Commands - 5 commands for plugin inspection
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerPluginCommands(program: Command, ctx: ServiceContext): void {
  const plugin = program.command('plugin').description('Plugin assembly inspection');

  plugin
    .command('list')
    .description('List all plugin assemblies in the environment')
    .option('--include-managed', 'Include managed assemblies', false)
    .option('-m, --max <n>', 'Maximum number of assemblies to return', '100')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getPluginAssemblies(opts.includeManaged, parseInt(opts.max));
        outputResult(
          { fileName: 'plugin-assemblies', data: result, summary: `Found ${result.totalCount} plugin assemblies` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list plugin assemblies'); }
    });

  plugin
    .command('get')
    .description('Get comprehensive info about a plugin assembly')
    .argument('<assemblyName>', 'Plugin assembly name')
    .option('--include-disabled', 'Include disabled steps', false)
    .action(async (assemblyName: string, opts: any) => {
      try {
        const result = await ctx.pp.getPluginAssemblyComplete(assemblyName, opts.includeDisabled);
        outputResult(
          { fileName: `plugin-${assemblyName}`, data: result, summary: `Plugin assembly '${assemblyName}' - ${result.steps.length} steps, ${result.pluginTypes.length} types` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get plugin assembly'); }
    });

  plugin
    .command('entity')
    .description('Get all plugins registered on a specific entity')
    .argument('<entityName>', 'Entity logical name')
    .option('--message <msg>', 'Filter by SDK message (e.g., Create, Update, Delete)')
    .option('--include-disabled', 'Include disabled steps', false)
    .action(async (entityName: string, opts: any) => {
      try {
        const result = await ctx.pp.getEntityPluginPipeline(entityName, opts.message, opts.includeDisabled);
        outputResult(
          { fileName: `plugins-${entityName}`, data: result, summary: `Plugin pipeline for '${entityName}' - ${result.steps.length} steps` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get entity plugins'); }
    });

  plugin
    .command('steps')
    .description('List every plugin step in the environment, across all assemblies')
    .option('--no-include-disabled', 'Exclude disabled steps (they are included by default)')
    .option('-m, --max <n>', 'Maximum number of steps to return', '500')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getAllPluginSteps({
          includeDisabled: opts.includeDisabled,
          maxRecords: parseInt(opts.max),
        });
        const enabled = result.steps.filter((s) => s.enabled).length;
        outputResult(
          {
            fileName: 'all-plugin-steps',
            data: result,
            summary: `Found ${result.totalCount} plugin steps (${enabled} enabled, ${result.totalCount - enabled} disabled)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list all plugin steps'); }
    });

  plugin
    .command('trace-logs')
    .description('Query plugin trace logs')
    .option('-e, --entity <name>', 'Filter by entity logical name')
    .option('--message <name>', 'Filter by SDK message name')
    .option('--correlation-id <guid>', 'Filter by correlation ID')
    .option('--step-id <guid>', 'Filter by specific step ID')
    .option('--exception-only', 'Only return logs with exceptions', false)
    .option('--hours-back <n>', 'How many hours back to search', '24')
    .option('-m, --max <n>', 'Maximum number of logs to return', '50')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getPluginTraceLogs({
          entityName: opts.entity,
          messageName: opts.message,
          correlationId: opts.correlationId,
          pluginStepId: opts.stepId,
          exceptionOnly: opts.exceptionOnly,
          hoursBack: parseInt(opts.hoursBack),
          maxRecords: parseInt(opts.max),
        });
        outputResult(
          { fileName: 'plugin-trace-logs', data: result, summary: `Plugin trace logs (found ${result.totalCount})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get plugin trace logs'); }
    });
}
