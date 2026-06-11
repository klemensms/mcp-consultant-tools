/**
 * Data CRUD CLI Commands - 8 commands mapping to data MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerDataCommands(program: Command, ctx: ServiceContext): void {
  const record = program.command('record').description('Dataverse record CRUD operations');

  record
    .command('query')
    .description('Query records using an OData filter expression')
    .argument('<entityNamePlural>', 'Plural entity name (e.g., accounts, contacts)')
    .argument('<filter>', 'OData filter expression')
    .option('-s, --select <columns...>', 'Columns to return')
    .option('-m, --max-records <n>', 'Maximum records to retrieve', '50')
    .action(async (entityNamePlural: string, filter: string, opts: any) => {
      try {
        const select = opts.select || undefined;
        const maxRecords = parseInt(opts.maxRecords, 10);
        const result = await ctx.pp.queryRecords(entityNamePlural, filter, maxRecords, select);
        outputResult(
          {
            fileName: `query-${entityNamePlural}`,
            data: result,
            summary: `Retrieved ${(result as any).returnedCount} records from '${entityNamePlural}'${(result as any).hasMore ? ' (more available)' : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'query records');
      }
    });

  record
    .command('count')
    .description('Count records matching an optional OData filter')
    .argument('<entityNamePlural>', 'Plural entity name (e.g., accounts, contacts). Use comma-separated for batch mode (e.g., "accounts,contacts")')
    .option('-f, --filter <expression>', 'OData filter expression (applies to all entities in batch mode)')
    .action(async (entityNamePlural: string, opts: any) => {
      try {
        const entities = entityNamePlural.split(',').map(e => e.trim()).filter(Boolean);

        if (entities.length > 1) {
          // Batch mode
          const batch = entities.map(e => ({ entityNamePlural: e, filter: opts.filter }));
          const results = await ctx.pp.countRecordsBatch(batch);
          const successful = results.filter(r => !r.error);
          const totalCount = successful.reduce((sum, r) => sum + r.count, 0);
          outputResult(
            {
              fileName: `count-batch`,
              data: results,
              summary: `Counted ${successful.length}/${results.length} entities (total: ${totalCount} records)`,
            },
            getGlobalFlags(program)
          );
        } else {
          // Single mode
          const count = await ctx.pp.countRecords(entityNamePlural, opts.filter);
          outputResult(
            {
              fileName: `count-${entityNamePlural}`,
              data: { entityNamePlural, filter: opts.filter || null, count },
              summary: `${entityNamePlural}: ${count} records${opts.filter ? ` (filter: ${opts.filter})` : ''}`,
            },
            getGlobalFlags(program)
          );
        }
      } catch (error) {
        handleCliError(error, 'count records');
      }
    });

  record
    .command('get')
    .description('Get a specific record by entity name and ID')
    .argument('<entityNamePlural>', 'Plural entity name (e.g., accounts, contacts)')
    .argument('<recordId>', 'Record GUID')
    .action(async (entityNamePlural: string, recordId: string) => {
      try {
        const result = await ctx.pp.getRecord(entityNamePlural, recordId);
        outputResult(
          {
            fileName: `record-${entityNamePlural}-${recordId}`,
            data: result,
            summary: `Record from '${entityNamePlural}' with ID '${recordId}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'get record');
      }
    });

  record
    .command('create')
    .description('Create a new record (requires POWERPLATFORM_ENABLE_CREATE=true)')
    .argument('<entityNamePlural>', 'Plural entity name (e.g., accounts, contacts)')
    .argument('<data>', 'Record data as JSON string')
    .action(async (entityNamePlural: string, dataJson: string) => {
      try {
        ctx.checkCreateEnabled();
        const data = JSON.parse(dataJson);
        const result = await ctx.pp.createRecord(entityNamePlural, data);
        outputResult(
          {
            fileName: `created-${entityNamePlural}`,
            data: result,
            summary: `Record created successfully in '${entityNamePlural}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'create record');
      }
    });

  record
    .command('update')
    .description('Update an existing record (requires POWERPLATFORM_ENABLE_UPDATE=true)')
    .argument('<entityNamePlural>', 'Plural entity name (e.g., accounts, contacts)')
    .argument('<recordId>', 'Record GUID')
    .argument('<data>', 'Partial record data as JSON string')
    .action(async (entityNamePlural: string, recordId: string, dataJson: string) => {
      try {
        ctx.checkUpdateEnabled();
        const data = JSON.parse(dataJson);
        const result = await ctx.pp.updateRecord(entityNamePlural, recordId, data);
        outputResult(
          {
            fileName: `updated-${entityNamePlural}-${recordId}`,
            data: result,
            summary: `Record '${recordId}' updated successfully in '${entityNamePlural}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'update record');
      }
    });

  record
    .command('delete')
    .description('Delete a record (requires POWERPLATFORM_ENABLE_DELETE=true)')
    .argument('<entityNamePlural>', 'Plural entity name (e.g., accounts, contacts)')
    .argument('<recordId>', 'Record GUID')
    .option('--confirm', 'Confirm deletion (required)', false)
    .action(async (entityNamePlural: string, recordId: string, opts: any) => {
      try {
        ctx.checkDeleteEnabled();
        if (!opts.confirm) {
          process.stderr.write(
            `Delete operation requires --confirm flag.\n` +
            `You are about to delete record '${recordId}' from '${entityNamePlural}'.\n` +
            `This operation is permanent and cannot be undone.\n` +
            `To proceed, run again with --confirm.\n`
          );
          process.exit(1);
        }
        await ctx.pp.deleteRecord(entityNamePlural, recordId);
        outputResult(
          {
            fileName: `deleted-${entityNamePlural}-${recordId}`,
            data: { entity: entityNamePlural, recordId, deleted: true },
            summary: `Record '${recordId}' deleted from '${entityNamePlural}'`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'delete record');
      }
    });

  record
    .command('associate')
    .description('Associate two records via a navigation property (requires POWERPLATFORM_ENABLE_CREATE=true)')
    .argument('<entityNamePlural>', 'Source entity plural name (e.g., accounts)')
    .argument('<recordId>', 'Source record GUID')
    .argument('<navigationProperty>', 'Navigation property name for the relationship')
    .argument('<targetEntityNamePlural>', 'Target entity plural name (e.g., contacts)')
    .argument('<targetRecordId>', 'Target record GUID')
    .action(async (entityNamePlural: string, recordId: string, navigationProperty: string, targetEntityNamePlural: string, targetRecordId: string) => {
      try {
        ctx.checkCreateEnabled();
        await ctx.pp.associateRecords(entityNamePlural, recordId, navigationProperty, targetEntityNamePlural, targetRecordId);
        outputResult(
          {
            fileName: `associate-${entityNamePlural}-${recordId}`,
            data: { source: `${entityNamePlural}(${recordId})`, target: `${targetEntityNamePlural}(${targetRecordId})`, navigationProperty, associated: true },
            summary: `Records associated: ${entityNamePlural}(${recordId}) -> ${targetEntityNamePlural}(${targetRecordId}) via ${navigationProperty}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'associate records');
      }
    });

  record
    .command('disassociate')
    .description('Remove association between two records (requires POWERPLATFORM_ENABLE_DELETE=true)')
    .argument('<entityNamePlural>', 'Source entity plural name (e.g., accounts)')
    .argument('<recordId>', 'Source record GUID')
    .argument('<navigationProperty>', 'Navigation property name for the relationship')
    .argument('<targetRecordId>', 'Target record GUID')
    .action(async (entityNamePlural: string, recordId: string, navigationProperty: string, targetRecordId: string) => {
      try {
        ctx.checkDeleteEnabled();
        await ctx.pp.disassociateRecords(entityNamePlural, recordId, navigationProperty, targetRecordId);
        outputResult(
          {
            fileName: `disassociate-${entityNamePlural}-${recordId}`,
            data: { source: `${entityNamePlural}(${recordId})`, targetRecordId, navigationProperty, disassociated: true },
            summary: `Records disassociated: ${entityNamePlural}(${recordId}) -> ${targetRecordId} via ${navigationProperty}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'disassociate records');
      }
    });

  record
    .command('execute-action')
    .description('Execute a Custom API or Action (requires POWERPLATFORM_ENABLE_ACTIONS=true)')
    .argument('<actionName>', 'Action unique name (e.g., WhoAmI, new_MyCustomAction)')
    .option('-p, --parameters <json>', 'Input parameters as JSON string')
    .option('--bound-entity <entityNamePlural>', 'Bound entity plural name')
    .option('--bound-record <recordId>', 'Bound record GUID')
    .action(async (actionName: string, opts: any) => {
      try {
        ctx.checkActionsEnabled();
        const parameters = opts.parameters ? JSON.parse(opts.parameters) : undefined;
        const boundTo =
          opts.boundEntity && opts.boundRecord
            ? { entityNamePlural: opts.boundEntity, recordId: opts.boundRecord }
            : undefined;
        const result = await ctx.pp.executeAction(actionName, parameters, boundTo);
        outputResult(
          {
            fileName: `action-${actionName}`,
            data: result,
            summary: `Action '${actionName}' executed successfully${boundTo ? ` (bound to ${boundTo.entityNamePlural}/${boundTo.recordId})` : ' (unbound)'}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) {
        handleCliError(error, 'execute action');
      }
    });
}
