/**
 * Variable Group CLI Commands - 2 commands
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

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
}
