/**
 * Service Connection CLI Commands - list, get, types, CRUD, share
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerServiceConnectionCommands(program: Command, ctx: ServiceContext): void {
  const svcConn = program.command('svc-conn').alias('sc').description('Service connection operations');

  svcConn
    .command('list')
    .description('List all service connections in a project')
    .argument('<project>', 'Project name')
    .action(async (project: string) => {
      try {
        const result = await ctx.serviceConnections.listServiceConnections(project);
        outputResult(
          { fileName: `svc-conns-${project}`, data: result, summary: `Service connections in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list service connections'); }
    });

  svcConn
    .command('get')
    .description('Get detailed service connection information')
    .argument('<project>', 'Project name')
    .argument('<connectionId>', 'Service connection ID (GUID)')
    .action(async (project: string, connectionId: string) => {
      try {
        const result = await ctx.serviceConnections.getServiceConnection(project, connectionId);
        outputResult(
          { fileName: `svc-conn-${connectionId}`, data: result, summary: `Service connection '${connectionId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get service connection'); }
    });

  svcConn
    .command('types')
    .description('List available service connection types')
    .action(async () => {
      try {
        const result = await ctx.serviceConnections.getServiceConnectionTypes();
        outputResult(
          { fileName: 'svc-conn-types', data: result, summary: `Service connection types` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get service connection types'); }
    });

  svcConn
    .command('create')
    .description('Create a new service connection')
    .argument('<project>', 'Project name')
    .argument('<name>', 'Connection name')
    .argument('<type>', 'Connection type (e.g., AzureRM, GitHub, Docker)')
    .option('-u, --url <url>', 'Service URL')
    .option('-d, --description <text>', 'Connection description')
    .option('--auth <json>', 'Authorization config as JSON (e.g., {"scheme":"Token","parameters":{"apitoken":"..."}})')
    .option('--data <json>', 'Additional data as JSON')
    .action(async (project: string, name: string, type: string, opts: any) => {
      try {
        const config: any = {};
        if (opts.url) config.url = opts.url;
        if (opts.description) config.description = opts.description;
        if (opts.auth) config.authorization = JSON.parse(opts.auth);
        if (opts.data) config.data = JSON.parse(opts.data);
        const result = await ctx.serviceConnections.createServiceConnection(project, name, type, config);
        outputResult(
          { fileName: `svc-conn-created-${name}`, data: result, summary: `Created service connection '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create service connection'); }
    });

  svcConn
    .command('update')
    .description('Update a service connection')
    .argument('<project>', 'Project name')
    .argument('<connectionId>', 'Service connection ID (GUID)')
    .option('-n, --name <name>', 'New connection name')
    .option('-d, --description <text>', 'New description')
    .option('-u, --url <url>', 'New service URL')
    .option('--data <json>', 'Updated data as JSON')
    .action(async (project: string, connectionId: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        if (opts.description) updates.description = opts.description;
        if (opts.url) updates.url = opts.url;
        if (opts.data) updates.data = JSON.parse(opts.data);
        const result = await ctx.serviceConnections.updateServiceConnection(project, connectionId, updates);
        outputResult(
          { fileName: `svc-conn-updated-${connectionId}`, data: result, summary: `Updated service connection '${connectionId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update service connection'); }
    });

  svcConn
    .command('share')
    .description('Share a service connection with other projects')
    .argument('<connectionId>', 'Service connection ID (GUID)')
    .argument('<projectIds...>', 'Project IDs to share with')
    .action(async (connectionId: string, projectIds: string[]) => {
      try {
        const result = await ctx.serviceConnections.shareServiceConnection(connectionId, projectIds);
        outputResult(
          { fileName: `svc-conn-shared-${connectionId}`, data: result, summary: `Shared connection '${connectionId}' with ${projectIds.length} project(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'share service connection'); }
    });

  svcConn
    .command('delete')
    .description('Delete a service connection (DESTRUCTIVE)')
    .argument('<project>', 'Project name')
    .argument('<connectionId>', 'Service connection ID (GUID)')
    .action(async (project: string, connectionId: string) => {
      try {
        const result = await ctx.serviceConnections.deleteServiceConnection(project, connectionId);
        outputResult(
          { fileName: `svc-conn-deleted-${connectionId}`, data: result, summary: `Deleted service connection '${connectionId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete service connection'); }
    });
}
