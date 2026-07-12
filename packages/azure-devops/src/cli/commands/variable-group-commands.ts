/**
 * Variable Group CLI Commands - 5 commands
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

/**
 * Parse a positive integer, throwing on anything else.
 *
 * Call this BEFORE reaching into `ctx`: the service getters construct a client
 * and throw on missing config, so a parse evaluated inside the service-call
 * argument list never runs, and a typo surfaces as a credentials error.
 */
function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer, got '${value}'`);
  }
  return parsed;
}

export function registerVariableGroupCommands(program: Command, ctx: ServiceContext): void {
  const vg = program.command('variable-group').alias('vg').description('Variable group operations');

  vg
    .command('list')
    .description('List all variable groups in a project')
    .argument('<project>', 'Project name')
    .action(async (project: string) => {
      try {
        const result = await ctx.variableGroup.getVariableGroups(project);
        outputResult(
          { fileName: `variable-groups-${project}`, data: result, summary: `Variable groups in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list variable groups'); }
    });

  vg
    .command('get')
    .description('Get a specific variable group by ID')
    .argument('<project>', 'Project name')
    .argument('<groupId>', 'Variable group ID')
    .action(async (project: string, groupId: string) => {
      try {
        const result = await ctx.variableGroup.getVariableGroup(project, parseInt(groupId));
        outputResult(
          { fileName: `variable-group-${groupId}`, data: result, summary: `Variable group #${groupId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get variable group'); }
    });

  vg
    .command('compare')
    .description('Compare two variable groups (secret values are never read or shown)')
    .argument('<project>', 'Project name')
    .argument('<groupIdA>', 'First variable group ID')
    .argument('<groupIdB>', 'Second variable group ID')
    .action(async (project: string, groupIdA: string, groupIdB: string) => {
      try {
        const idA = parsePositiveInt(groupIdA, 'groupIdA')!;
        const idB = parsePositiveInt(groupIdB, 'groupIdB')!;
        const result = await ctx.variableGroup.compareVariableGroups(project, idA, idB);
        outputResult(
          {
            fileName: `compare-variable-groups-${idA}-${idB}`,
            data: result,
            summary: `${result.valueDifferences.length} value difference(s), ${result.onlyInA.length} only in A, ${result.onlyInB.length} only in B, ${result.secretsSkipped.length} secret(s) skipped`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'compare variable groups'); }
    });

  vg
    .command('compare-environments')
    .description("Diff '<base>-<env>' variable-group families across environments")
    .argument('<project>', 'Project name')
    .option('-n, --name-contains <text>', 'Case-insensitive substring filter on group name')
    .option('--suffixes <list>', "Comma-separated environment suffixes (default '-dev,-development,-qa,-uat,-staging,-stage,-test,-prod,-production')")
    .action(async (project: string, opts: any) => {
      try {
        const environmentSuffixes = opts.suffixes
          ? String(opts.suffixes).split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined;
        const result = await ctx.variableGroup.compareEnvironments(project, {
          nameContains: opts.nameContains,
          environmentSuffixes,
        });
        outputResult(
          {
            fileName: `compare-environments-${project}`,
            data: result,
            summary: `${result.environmentSetCount} environment set(s), ${result.incompleteSets.length} incomplete, ${result.unmatchedGroups.length} unmatched group(s)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'compare environments'); }
    });

  vg
    .command('summary')
    .description('Variable groups with variable/secret counts (never secret values)')
    .argument('<project>', 'Project name')
    .option('-n, --name-contains <text>', 'Case-insensitive substring filter on group name')
    .option('--max-results <n>', 'Maximum groups to return (default 100)')
    .action(async (project: string, opts: any) => {
      try {
        const maxResults = parsePositiveInt(opts.maxResults, '--max-results');
        const result = await ctx.variableGroup.getVariableGroupSummaries(project, {
          nameContains: opts.nameContains,
          maxResults,
        });
        outputResult(
          {
            fileName: `variable-group-summary-${project}`,
            data: result,
            summary: `${result.groupCount} group(s), ${result.totals.variableCount} variable(s), ${result.totals.secretCount} secret(s)${result.truncated ? ' (truncated)' : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'summarise variable groups'); }
    });
}
