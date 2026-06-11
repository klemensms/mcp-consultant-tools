/**
 * Function App CLI Commands - 4 commands mapping to function app MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerFunctionAppCommands(program: Command, ctx: ServiceContext): void {
  const func = program.command('function-app').description('Azure Function App operations');

  func
    .command('list')
    .description('List all Azure Function Apps in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option('--include-configuration', 'Include app settings')
    .option('--include-slots', 'Include deployment slots')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.functionApps.listFunctionApps({
          resourceGroup: opts.resourceGroup,
          includeConfiguration: opts.includeConfiguration,
          includeSlots: opts.includeSlots,
        });
        const count = Array.isArray(result) ? result.length : (result as any)?.count ?? '?';
        outputResult(
          { fileName: 'function-apps-list', data: result, summary: `Found ${count} Function App(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list function apps'); }
    });

  func
    .command('get')
    .description('Get detailed information about a specific Function App')
    .argument('<name>', 'Function App name')
    .option('-g, --resource-group <name>', 'Resource group')
    .option('--include-configuration', 'Include app settings (default: true)')
    .option('--include-functions', 'List all functions (default: true)')
    .option('--include-deployments', 'Include recent deployments')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.management.functionApps.getFunctionApp({
          name,
          resourceGroup: opts.resourceGroup,
          includeConfiguration: opts.includeConfiguration,
          includeFunctions: opts.includeFunctions,
          includeDeployments: opts.includeDeployments,
        });
        outputResult(
          { fileName: `function-app-${name}`, data: result, summary: `Function App '${name}' details` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get function app'); }
    });

  func
    .command('functions')
    .description('List all functions within a Function App')
    .argument('<functionAppName>', 'Function App name')
    .option('-g, --resource-group <name>', 'Resource group')
    .action(async (functionAppName: string, opts: any) => {
      try {
        const result = await ctx.management.functionApps.listFunctions({
          functionAppName,
          resourceGroup: opts.resourceGroup,
        });
        const count = Array.isArray(result) ? result.length : (result as any)?.count ?? '?';
        outputResult(
          { fileName: `functions-${functionAppName}`, data: result, summary: `Found ${count} function(s) in '${functionAppName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list functions'); }
    });

  func
    .command('keys')
    .description('Get function and host keys for a Function App')
    .argument('<functionAppName>', 'Function App name')
    .option('-g, --resource-group <name>', 'Resource group')
    .option('-f, --function-name <name>', 'Specific function name (omit for host keys only)')
    .action(async (functionAppName: string, opts: any) => {
      try {
        const result = await ctx.management.functionApps.getFunctionKeys({
          functionAppName,
          resourceGroup: opts.resourceGroup,
          functionName: opts.functionName,
        });
        outputResult(
          { fileName: `function-keys-${functionAppName}`, data: result, summary: `Keys for Function App '${functionAppName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get function keys'); }
    });
}
