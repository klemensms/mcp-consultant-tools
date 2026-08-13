/**
 * Variable Group CLI Commands - list, get, CRUD, set/remove variables
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerVariableGroupCommands(program: Command, ctx: ServiceContext): void {
  const varGroup = program.command('var-group').alias('vg').description('Variable group operations');

  varGroup
    .command('list')
    .description('List all variable groups in a project')
    .argument('<project>', 'Project name')
    .action(async (project: string) => {
      try {
        const result = await ctx.variableGroups.getVariableGroups(project);
        outputResult(
          { fileName: `var-groups-${project}`, data: result, summary: `Variable groups in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list variable groups'); }
    });

  varGroup
    .command('get')
    .description('Get detailed variable group information')
    .argument('<project>', 'Project name')
    .argument('<groupId>', 'Variable group ID')
    .action(async (project: string, groupId: string) => {
      try {
        const result = await ctx.variableGroups.getVariableGroup(project, parseInt(groupId));
        outputResult(
          { fileName: `var-group-${groupId}`, data: result, summary: `Variable group #${groupId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get variable group'); }
    });

  varGroup
    .command('create')
    .description('Create a new variable group')
    .argument('<project>', 'Project name')
    .argument('<name>', 'Variable group name')
    .option('-d, --description <text>', 'Group description')
    .option('--variables <json>', 'Initial variables as JSON (e.g., {"VAR1":{"value":"val1"},"SECRET":{"value":"s","isSecret":true}})')
    .action(async (project: string, name: string, opts: any) => {
      try {
        const variables = opts.variables ? JSON.parse(opts.variables) : undefined;
        const result = await ctx.variableGroups.createVariableGroup(project, name, opts.description, variables);
        outputResult(
          { persist: false, fileName: `var-group-created-${name}`, data: result, summary: `Created variable group '${name}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create variable group'); }
    });

  varGroup
    .command('update')
    .description('Update variable group metadata')
    .argument('<project>', 'Project name')
    .argument('<groupId>', 'Variable group ID')
    .option('-n, --name <name>', 'New group name')
    .option('-d, --description <text>', 'New description')
    .action(async (project: string, groupId: string, opts: any) => {
      try {
        const updates: any = {};
        if (opts.name) updates.name = opts.name;
        if (opts.description) updates.description = opts.description;
        const result = await ctx.variableGroups.updateVariableGroupMetadata(project, parseInt(groupId), updates);
        outputResult(
          { persist: false, fileName: `var-group-updated-${groupId}`, data: result, summary: `Updated variable group #${groupId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update variable group'); }
    });

  varGroup
    .command('set-var')
    .description('Set a variable in a variable group')
    .argument('<project>', 'Project name')
    .argument('<groupId>', 'Variable group ID')
    .argument('<varName>', 'Variable name')
    .argument('<value>', 'Variable value')
    .option('-s, --secret', 'Mark variable as secret')
    .action(async (project: string, groupId: string, varName: string, value: string, opts: any) => {
      try {
        const result = await ctx.variableGroups.setVariable(project, parseInt(groupId), varName, value, opts.secret || false);
        outputResult(
          { persist: false, fileName: `var-set-${groupId}-${varName}`, data: result, summary: `Set variable '${varName}' in group #${groupId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'set variable'); }
    });

  varGroup
    .command('remove-var')
    .description('Remove a variable from a variable group')
    .argument('<project>', 'Project name')
    .argument('<groupId>', 'Variable group ID')
    .argument('<varName>', 'Variable name to remove')
    .action(async (project: string, groupId: string, varName: string) => {
      try {
        const result = await ctx.variableGroups.removeVariable(project, parseInt(groupId), varName);
        outputResult(
          { persist: false, fileName: `var-removed-${groupId}-${varName}`, data: result, summary: `Removed variable '${varName}' from group #${groupId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'remove variable'); }
    });

  varGroup
    .command('delete')
    .description('Delete a variable group (DESTRUCTIVE)')
    .argument('<project>', 'Project name')
    .argument('<groupId>', 'Variable group ID')
    .action(async (project: string, groupId: string) => {
      try {
        const result = await ctx.variableGroups.deleteVariableGroup(project, parseInt(groupId));
        outputResult(
          { persist: false, fileName: `var-group-deleted-${groupId}`, data: result, summary: `Deleted variable group #${groupId}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete variable group'); }
    });
}
