/**
 * Solution CLI Commands - 8 commands for solution management and validation
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerSolutionCommands(program: Command, ctx: ServiceContext): void {
  const solution = program.command('solution').description('Solution management and validation');

  solution
    .command('publishers')
    .description('List all solution publishers')
    .action(async () => {
      try {
        const result = await ctx.pp.getPublishers();
        const publishers = (result as any)?.value || [];
        outputResult(
          { fileName: 'publishers', data: result, summary: `Found ${publishers.length} publisher(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list publishers'); }
    });

  solution
    .command('list')
    .description('List all visible solutions in the environment')
    .action(async () => {
      try {
        const result = await ctx.pp.getSolutions();
        const solutions = (result as any)?.value || [];
        outputResult(
          { fileName: 'solutions', data: result, summary: `Found ${solutions.length} solution(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list solutions'); }
    });

  solution
    .command('components')
    .description('List all components in a solution')
    .argument('<solutionName>', 'Solution unique name')
    .action(async (solutionName: string) => {
      try {
        const result = await ctx.pp.getSolutionComponents(solutionName);
        const components = (result as any)?.value || [];
        outputResult(
          { fileName: `solution-components-${solutionName}`, data: result, summary: `Found ${components.length} component(s) in solution '${solutionName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list solution components'); }
    });

  solution
    .command('check-deps')
    .description('Check dependencies before deleting a component')
    .argument('<componentId>', 'Component ID (GUID or MetadataId)')
    .argument('<componentType>', 'Component type code (e.g., 1=Entity, 26=Role, 29=Workflow)')
    .action(async (componentId: string, componentType: string) => {
      try {
        const result = await ctx.pp.checkDependencies(componentId, parseInt(componentType));
        outputResult(
          { fileName: `deps-${componentId}`, data: result, summary: `Dependencies for component '${componentId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'check dependencies'); }
    });

  solution
    .command('validate-name')
    .description('Validate a schema name against PowerPlatform naming rules')
    .argument('<schemaName>', 'Schema name to validate')
    .argument('<prefix>', 'Required customization prefix')
    .action(async (schemaName: string, prefix: string) => {
      try {
        const result = ctx.pp.validateSchemaName(schemaName, prefix);
        outputResult(
          { fileName: `validate-${schemaName}`, data: result, summary: `Schema name '${schemaName}': ${result.valid ? 'VALID' : 'INVALID'}${result.errors.length > 0 ? ' - ' + result.errors.join(', ') : ''}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'validate schema name'); }
    });

  solution
    .command('check-delete')
    .description('Check if a component can be safely deleted')
    .argument('<componentId>', 'Component ID (GUID or MetadataId)')
    .argument('<componentType>', 'Component type code')
    .action(async (componentId: string, componentType: string) => {
      try {
        const result = await ctx.pp.checkDeleteEligibility(componentId, parseInt(componentType));
        outputResult(
          { fileName: `delete-check-${componentId}`, data: result, summary: `Delete eligibility for '${componentId}': ${result.canDelete ? 'CAN DELETE' : 'BLOCKED'} (${result.dependencies.length} dependencies)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'check delete eligibility'); }
    });

  solution
    .command('validate')
    .description('Validate Dataverse entities against best practices')
    .option('-s, --solution <name>', 'Solution unique name to validate')
    .option('-e, --entities <names...>', 'Explicit list of entity logical names')
    .requiredOption('-p, --prefix <prefix>', 'Publisher prefix to validate against (e.g., contoso_)')
    .option('--recent-days <n>', 'Only validate columns created in last N days (0=all)', '30')
    .option('--no-ref-data', 'Exclude RefData tables from validation')
    .option('--rules <rules...>', 'Specific rules to validate (prefix, lowercase, lookup, optionset, required-column, entity-icon)')
    .option('--max-entities <n>', 'Maximum entities to validate (0=unlimited)', '0')
    .option('--required-columns <cols...>', 'Required column schema names to check')
    .action(async (opts: any) => {
      try {
        if (!opts.solution && !opts.entities) {
          console.error('Error: Either --solution or --entities must be provided');
          process.exit(1);
        }
        if (opts.solution && opts.entities) {
          console.error('Error: --solution and --entities are mutually exclusive');
          process.exit(1);
        }

        const result = await ctx.pp.validateBestPractices(
          opts.solution,
          opts.entities,
          opts.prefix,
          parseInt(opts.recentDays),
          opts.refData !== false,
          opts.rules ?? ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'],
          parseInt(opts.maxEntities),
          opts.requiredColumns ?? ['{prefix}updatedbyprocess']
        );
        outputResult(
          { fileName: 'validation-result', data: result, summary: `Validation complete for ${opts.solution || opts.entities?.join(', ')}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'validate best practices'); }
    });

  solution
    .command('dbml')
    .description('Generate DBML schema from Dataverse entities')
    .option('-s, --solutions <names...>', 'Solution unique names to extract entities from')
    .option('-e, --entities <names...>', 'Explicit list of entity logical names')
    .option('--include-system-columns', 'Include system columns like createdon, modifiedon', false)
    .option('--include-state-status', 'Include statecode/statuscode columns', false)
    .option('-p, --prefix <prefix>', 'Only include columns matching this prefix')
    .option('-d, --depth <n>', 'Relationship traversal depth', '0')
    .option('--no-polymorphic', 'Exclude Customer/Owner/PartyList lookups')
    .action(async (opts: any) => {
      try {
        const result = await ctx.pp.generateDbmlSchema({
          solutions: opts.solutions,
          entities: opts.entities,
          includeSystemColumns: opts.includeSystemColumns,
          includeStateStatus: opts.includeStateStatus,
          prefix: opts.prefix,
          depth: parseInt(opts.depth),
          includePolymorphicLookups: opts.polymorphic !== false,
        });
        outputResult(
          { fileName: 'dbml-schema', data: result, summary: `DBML schema generated (${(result as any).tableCount || 0} tables)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'generate DBML schema'); }
    });
}
