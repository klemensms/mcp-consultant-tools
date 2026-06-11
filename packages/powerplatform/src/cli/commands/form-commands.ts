/**
 * Form/View CLI Commands - 7 commands for forms, views, and web resources
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerFormCommands(program: Command, ctx: ServiceContext): void {
  const form = program.command('form').description('Forms, views, and web resource operations');

  form
    .command('list')
    .description('Get all forms for a Dataverse entity')
    .argument('<entityName>', 'Entity logical name')
    .action(async (entityName: string) => {
      try {
        const result = await ctx.pp.getForms(entityName);
        const forms = (result as any)?.value || [];
        outputResult(
          { fileName: `forms-${entityName}`, data: result, summary: `Found ${forms.length} form(s) for '${entityName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list forms'); }
    });

  form
    .command('views')
    .description('Get all saved views for a Dataverse entity')
    .argument('<entityName>', 'Entity logical name')
    .action(async (entityName: string) => {
      try {
        const result = await ctx.pp.getViews(entityName);
        const views = (result as any)?.value || [];
        outputResult(
          { fileName: `views-${entityName}`, data: result, summary: `Found ${views.length} view(s) for '${entityName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list views'); }
    });

  form
    .command('view-fetchxml')
    .description('Get the FetchXML query from a view')
    .argument('<viewId>', 'View ID (GUID)')
    .action(async (viewId: string) => {
      try {
        const result = await ctx.pp.getViewFetchXml(viewId);
        const name = (result as any)?.name || viewId;
        outputResult(
          { fileName: `view-fetchxml-${viewId}`, data: result, summary: `FetchXML for view '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get view FetchXML'); }
    });

  form
    .command('web-resource')
    .description('Get a web resource by ID')
    .argument('<webResourceId>', 'Web resource ID (GUID)')
    .action(async (webResourceId: string) => {
      try {
        const result = await ctx.pp.getWebResource(webResourceId);
        const name = (result as any)?.name || webResourceId;
        outputResult(
          { fileName: `webresource-${webResourceId}`, data: result, summary: `Web resource '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get web resource'); }
    });

  form
    .command('web-resources')
    .description('Get web resources by name pattern')
    .option('-n, --name <filter>', 'Name filter (contains)')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.getWebResources(opts.name);
        const webResources = (result as any)?.value || [];
        outputResult(
          { fileName: 'web-resources', data: result, summary: `Found ${webResources.length} web resource(s)${opts.name ? ` matching '${opts.name}'` : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list web resources'); }
    });

  form
    .command('web-resource-deps')
    .description('Get all dependencies for a web resource')
    .argument('<webResourceId>', 'Web resource ID (GUID)')
    .action(async (webResourceId: string) => {
      try {
        const result = await ctx.pp.getWebResourceDependencies(webResourceId);
        outputResult(
          { fileName: `webresource-deps-${webResourceId}`, data: result, summary: `Dependencies for web resource '${webResourceId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get web resource dependencies'); }
    });

  form
    .command('unpublished')
    .description('Preview all components with unpublished customizations')
    .action(async () => {
      try {
        const result = await ctx.pp.previewUnpublishedChanges();
        outputResult(
          { fileName: 'unpublished-changes', data: result, summary: 'Unpublished customization changes' },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'preview unpublished changes'); }
    });
}
