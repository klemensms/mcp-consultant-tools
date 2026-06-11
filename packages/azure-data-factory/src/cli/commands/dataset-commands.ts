/**
 * Dataset CLI Commands - 2 commands for dataset operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerDatasetCommands(program: Command, ctx: ServiceContext): void {
  const dataset = program.command('dataset').description('Dataset operations');

  dataset
    .command('list')
    .description('List all datasets in an Azure Data Factory')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const datasets = await svc.listDatasets(opts.factoryId);
        const factory = svc.resolveFactory(opts.factoryId);
        const summary = datasets.map((d: any) => ({
          name: d.name,
          type: d.properties.type,
          linkedService: d.properties.linkedServiceName?.referenceName,
          folder: d.properties.folder?.name,
        }));
        outputResult(
          { fileName: 'datasets', data: { factory: factory.name, count: datasets.length, datasets: summary }, summary: `${datasets.length} datasets in ${factory.name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list datasets'); }
    });

  dataset
    .command('get')
    .description('Get details of a specific dataset including schema and linked service')
    .argument('<name>', 'Dataset name')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.adf.getDataset(name, opts.factoryId);
        outputResult(
          { fileName: `dataset-${name}`, data: result, summary: `Dataset: ${name}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get dataset'); }
    });
}
