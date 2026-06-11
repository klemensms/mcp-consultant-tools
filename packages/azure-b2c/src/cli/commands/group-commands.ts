/**
 * Group CLI Commands - 3 commands mapping to group-related MCP tools
 *
 * list-groups, get-user-groups, get-group-members
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerGroupCommands(program: Command, ctx: ServiceContext): void {
  const group = program.command('group').description('Group operations');

  group
    .command('list')
    .description('List all groups in the Azure AD B2C tenant')
    .option('-n, --top <n>', 'Maximum number of groups to return', '50')
    .action(async (opts: any) => {
      try {
        const groups = await ctx.groups.listGroups(parseInt(opts.top));
        outputResult(
          {
            fileName: 'b2c-groups',
            data: groups,
            summary: `Found ${groups.length} group(s)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list groups'); }
    });

  group
    .command('user-groups')
    .description('Get all groups that a user is a member of')
    .argument('<userId>', 'User ID (GUID) or email address')
    .action(async (userId: string) => {
      try {
        const groups = await ctx.groups.getUserGroups(userId);
        outputResult(
          {
            fileName: `b2c-user-groups-${userId}`,
            data: groups,
            summary: `User ${userId} is a member of ${groups.length} group(s)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get user groups'); }
    });

  group
    .command('members')
    .description('Get all members of a specific group')
    .argument('<groupId>', 'Group ID (GUID)')
    .option('-n, --top <n>', 'Maximum members to return', '50')
    .option('--all-fields', 'Return all fields including extension_* attributes', false)
    .action(async (groupId: string, opts: any) => {
      try {
        const members = await ctx.groups.getGroupMembers(groupId, parseInt(opts.top), opts.allFields);
        outputResult(
          {
            fileName: `b2c-group-members-${groupId}`,
            data: members,
            summary: `Found ${Array.isArray(members) ? members.length : 0} member(s) in group ${groupId}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get group members'); }
    });
}
