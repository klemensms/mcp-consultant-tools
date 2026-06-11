/**
 * Data Flow CLI Commands - 2 commands for data flow operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerDataFlowCommands(program: Command, ctx: ServiceContext): void {
  const dataFlow = program.command('data-flow').description('Data flow operations');

  dataFlow
    .command('list')
    .description('List all data flows in an Azure Data Factory')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const dataFlows = await svc.listDataFlows(opts.factoryId);
        const factory = svc.resolveFactory(opts.factoryId);
        const summary = dataFlows.map((df: any) => ({
          name: df.name,
          type: df.properties.type,
          description: df.properties.description,
          folder: df.properties.folder?.name,
        }));
        outputResult(
          { fileName: 'data-flows', data: { factory: factory.name, count: dataFlows.length, dataFlows: summary }, summary: `${dataFlows.length} data flows in ${factory.name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list data flows'); }
    });

  dataFlow
    .command('get')
    .description('Get details of a specific data flow including transformations')
    .argument('<name>', 'Data flow name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.adf.getDataFlow(name, opts.factoryId);
        outputResult(
          { fileName: `data-flow-${name}`, data: result, summary: `Data flow: ${name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get data flow'); }
    });
}
