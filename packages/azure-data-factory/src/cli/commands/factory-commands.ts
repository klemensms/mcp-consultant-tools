/**
 * Factory CLI Commands
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerFactoryCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('list-factories')
    .description('List all configured Azure Data Factory instances')
    .action(async () => {
      try {
        const svc = ctx.adf;
        const factories = svc.getAllFactories();
        const data = {
          factories: factories.map((f: any) => ({
            id: f.id,
            name: f.name,
            factoryName: f.factoryName,
            resourceGroup: f.resourceGroup,
            active: f.active,
          })),
          writeEnabled: svc.isWriteEnabled(),
          triggerControlEnabled: svc.isTriggerControlEnabled(),
        };
        outputResult(
          { fileName: 'factories', data, summary: `${factories.length} factories configured (write=${svc.isWriteEnabled()}, triggerControl=${svc.isTriggerControlEnabled()})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list factories'); }
    });
}
