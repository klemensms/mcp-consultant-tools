/**
 * Linked Service CLI Commands - 1 command for linked service operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerLinkedServiceCommands(program: Command, ctx: ServiceContext): void {
  const linkedService = program.command('linked-service').description('Linked service operations');

  linkedService
    .command('list')
    .description('List all linked services in an Azure Data Factory (credentials sanitized)')
    .option('-f, --factory-id <id>', 'Factory ID')
    .action(async (opts: any) => {
      try {
        const svc = ctx.adf;
        const linkedServices = await svc.listLinkedServices(opts.factoryId);
        const factory = svc.resolveFactory(opts.factoryId);
        const summary = linkedServices.map((ls: any) => ({
          name: ls.name,
          type: ls.properties.type,
          description: ls.properties.description,
          connectVia: ls.properties.connectVia?.referenceName,
        }));
        outputResult(
          {
            fileName: 'linked-services',
            data: { factory: factory.name, count: linkedServices.length, linkedServices: summary, note: 'Connection strings and credentials are redacted for security' },
            summary: `${linkedServices.length} linked services in ${factory.name}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list linked services'); }
    });
}
