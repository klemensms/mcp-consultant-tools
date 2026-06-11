/**
 * Namespace CLI Commands - 3 commands for namespace operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerNamespaceCommands(program: Command, ctx: ServiceContext): void {
  const ns = program.command('namespace').description('Service Bus namespace operations');

  ns
    .command('list')
    .description('List all configured Service Bus namespaces (active and inactive)')
    .action(async () => {
      try {
        const resources = ctx.serviceBus.getAllResources();
        outputResult(
          { fileName: 'sb-namespaces', data: resources, summary: `Found ${resources.length} configured namespace(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list namespaces'); }
    });

  ns
    .command('test')
    .description('Test connectivity to a Service Bus namespace and verify permissions')
    .argument('<resourceId>', 'Service Bus resource ID')
    .action(async (resourceId: string) => {
      try {
        const result = await ctx.serviceBus.testConnection(resourceId);
        const status = (result as any).connected ? 'connected' : 'failed';
        outputResult(
          { fileName: `sb-test-${resourceId}`, data: result, summary: `Connection test for '${resourceId}': ${status}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'test connection'); }
    });

  ns
    .command('props')
    .description('Get namespace-level properties and quotas (tier, max message size)')
    .argument('<resourceId>', 'Service Bus resource ID')
    .action(async (resourceId: string) => {
      try {
        const result = await ctx.serviceBus.getNamespaceProperties(resourceId);
        outputResult(
          { fileName: `sb-ns-props-${resourceId}`, data: result, summary: `Namespace '${resourceId}': tier=${(result as any).tier}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get namespace properties'); }
    });
}
