/**
 * Integration Runtime CLI Commands - 4 commands for IR operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerIntegrationRuntimeCommands(program: Command, ctx: ServiceContext): void {
  const ir = program.command('ir').description('Integration runtime operations');

  ir
    .command('list')
    .description('List all integration runtimes in an Azure Data Factory')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const runtimes = await svc.listIntegrationRuntimes(opts.factoryId);
        const factory = svc.resolveFactory(opts.factoryId);
        const summary = runtimes.map((r: any) => ({
          name: r.name,
          type: r.properties.type,
          state: r.properties.state,
          description: r.properties.description,
        }));
        outputResult(
          { fileName: 'integration-runtimes', data: { factory: factory.name, count: runtimes.length, integrationRuntimes: summary }, summary: `${runtimes.length} integration runtimes in ${factory.name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list integration runtimes'); }
    });

  ir
    .command('status')
    .description('Get detailed status of an integration runtime')
    .argument('<name>', 'Integration runtime name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.adf.getIntegrationRuntimeStatus(name, opts.factoryId);
        outputResult(
          { fileName: `ir-status-${name}`, data: result, summary: `Integration runtime status: ${name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get integration runtime status'); }
    });

  ir
    .command('start')
    .description('Start a managed integration runtime (requires ENABLE_WRITE=true)')
    .argument('<name>', 'Integration runtime name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        await ctx.adf.startIntegrationRuntime(name, opts.factoryId);
        const data = { message: `Integration runtime '${name}' start initiated`, note: 'Managed IR startup can take 2-5 minutes' };
        outputResult(
          { fileName: `ir-start-${name}`, data, summary: `Integration runtime '${name}' start initiated` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'start integration runtime'); }
    });

  ir
    .command('stop')
    .description('Stop a managed integration runtime (requires ENABLE_WRITE=true)')
    .argument('<name>', 'Integration runtime name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        await ctx.adf.stopIntegrationRuntime(name, opts.factoryId);
        const data = { message: `Integration runtime '${name}' stop initiated`, note: 'The IR may take a moment to fully stop' };
        outputResult(
          { fileName: `ir-stop-${name}`, data, summary: `Integration runtime '${name}' stop initiated` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'stop integration runtime'); }
    });
}
