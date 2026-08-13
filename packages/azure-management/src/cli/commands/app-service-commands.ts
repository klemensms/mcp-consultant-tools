/**
 * App Service CLI Commands - 8 commands mapping to app service MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerAppServiceCommands(program: Command, ctx: ServiceContext): void {
  const appService = program.command('app-service').description('Azure App Service operations');

  // ============================================
  // Read Operations
  // ============================================

  appService
    .command('list')
    .description('List all App Services (web apps) in the subscription or resource group')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .option('--include-configuration', 'Include app settings')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.appServices.listAppServices({
          resourceGroup: opts.resourceGroup,
          includeConfiguration: opts.includeConfiguration,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'app-services-list', data: result, summary: `Found ${count} App Service(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list app services'); }
    });

  appService
    .command('get')
    .description('Get detailed information about an App Service')
    .argument('<name>', 'App Service name')
    .option('-g, --resource-group <name>', 'Resource group')
    .option('--include-configuration', 'Include app settings (default: true)')
    .option('--include-deployments', 'Include recent deployments')
    .option('--show-values', 'Show unredacted config values')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.management.appServices.getAppService({
          name,
          resourceGroup: opts.resourceGroup,
          includeConfiguration: opts.includeConfiguration,
          includeDeployments: opts.includeDeployments,
          showValues: opts.showValues,
        });
        outputResult(
          { fileName: `app-service-${name}`, data: result, summary: `App Service '${name}' details` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get app service'); }
    });

  appService
    .command('plans')
    .description('List all App Service Plans (hosting plans)')
    .option('-g, --resource-group <name>', 'Filter by resource group')
    .action(async (opts: any) => {
      try {
        const result = await ctx.management.appServices.listAppServicePlans({
          resourceGroup: opts.resourceGroup,
        });
        const count = result.summary?.total ?? '?';
        outputResult(
          { fileName: 'app-service-plans', data: result, summary: `Found ${count} App Service Plan(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list app service plans'); }
    });

  appService
    .command('logs')
    .description('Fetch recent application logs from an App Service via Kudu SCM API')
    .argument('<name>', 'App Service name')
    .option('-g, --resource-group <name>', 'Resource group')
    .option('--log-type <type>', 'Log type: docker, stdout, eventlog, all (default: all)')
    .option('--max-lines <n>', 'Max lines per log source (default: 200)', parseInt)
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.management.appServices.getAppServiceLogs({
          name,
          resourceGroup: opts.resourceGroup,
          logType: opts.logType,
          maxLines: opts.maxLines,
        });
        const logCount = result.logs?.length ?? 0;
        outputResult(
          { fileName: `app-service-logs-${name}`, data: result, summary: `Fetched ${logCount} log source(s) for '${name}' (${result.operatingSystem})` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get app service logs'); }
    });

  // ============================================
  // Write Operations (require AZURE_MGMT_ENABLE_WRITE=true)
  // ============================================

  appService
    .command('restart')
    .description('Restart an App Service (requires AZURE_MGMT_ENABLE_WRITE=true)')
    .argument('<name>', 'App Service name')
    .option('-g, --resource-group <name>', 'Resource group')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.management.appServices.restartAppService({
          name,
          resourceGroup: opts.resourceGroup,
        });
        outputResult(
          { persist: false, fileName: `app-service-restart-${name}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'restart app service'); }
    });

  appService
    .command('stop')
    .description('Stop a running App Service (requires AZURE_MGMT_ENABLE_WRITE=true)')
    .argument('<name>', 'App Service name')
    .option('-g, --resource-group <name>', 'Resource group')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.management.appServices.stopAppService({
          name,
          resourceGroup: opts.resourceGroup,
        });
        outputResult(
          { persist: false, fileName: `app-service-stop-${name}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'stop app service'); }
    });

  appService
    .command('start')
    .description('Start a stopped App Service (requires AZURE_MGMT_ENABLE_WRITE=true)')
    .argument('<name>', 'App Service name')
    .option('-g, --resource-group <name>', 'Resource group')
    .action(async (name: string, opts: any) => {
      try {
        const result = await ctx.management.appServices.startAppService({
          name,
          resourceGroup: opts.resourceGroup,
        });
        outputResult(
          { persist: false, fileName: `app-service-start-${name}`, data: result, summary: result.message },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'start app service'); }
    });

  appService
    .command('set-config')
    .description('Update app settings or connection strings (requires AZURE_MGMT_ENABLE_WRITE=true)')
    .argument('<name>', 'App Service name')
    .option('-g, --resource-group <name>', 'Resource group')
    .option('--app-settings <json>', 'JSON object of app settings to add/update')
    .option('--connection-strings <json>', 'JSON object of connection strings to add/update')
    .option('--remove-settings <keys>', 'Comma-separated list of app setting keys to remove')
    .action(async (name: string, opts: any) => {
      try {
        const appSettings = opts.appSettings ? JSON.parse(opts.appSettings) : undefined;
        const connectionStrings = opts.connectionStrings ? JSON.parse(opts.connectionStrings) : undefined;
        const removeSettings = opts.removeSettings ? opts.removeSettings.split(',').map((s: string) => s.trim()) : undefined;

        const result = await ctx.management.appServices.setAppServiceConfig({
          name,
          resourceGroup: opts.resourceGroup,
          appSettings,
          connectionStrings,
          removeSettings,
        });

        const changes = [
          ...(result.updatedSettings?.length ? [`updated: ${result.updatedSettings.join(', ')}`] : []),
          ...(result.removedSettings?.length ? [`removed: ${result.removedSettings.join(', ')}`] : []),
          ...(result.updatedConnectionStrings?.length ? [`conn strings: ${result.updatedConnectionStrings.join(', ')}`] : []),
        ];

        outputResult(
          { persist: false, fileName: `app-service-config-${name}`, data: result, summary: `Config updated for '${name}': ${changes.join('; ') || 'no changes'}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'set app service config'); }
    });
}
