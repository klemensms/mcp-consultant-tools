/**
 * Auth CLI Commands - 3 commands mapping to authentication MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult } from '../output.js';

export function registerAuthCommands(program: Command, ctx: ServiceContext): void {
  const auth = program.command('auth').description('Authentication operations');

  auth
    .command('login')
    .description('Authenticate to Microsoft Teams (device-code or client-credentials)')
    .action(async () => {
      try {
        const result = await ctx.teams.startAuthentication();
        outputResult(
          { fileName: 'auth-login', data: result, summary: `Authentication status: ${result.status}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'authenticate'); }
    });

  auth
    .command('status')
    .description('Check current Teams authentication status')
    .action(async () => {
      try {
        const status = await ctx.teams.getAuthStatus();
        outputResult(
          { fileName: 'auth-status', data: status, summary: `Auth status: ${status.status} (${status.authMode}) - ${status.message}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'check auth status'); }
    });

  auth
    .command('logout')
    .description('Clear cached Teams authentication tokens')
    .action(async () => {
      try {
        await ctx.teams.logout();
        outputResult(
          { fileName: 'auth-logout', data: { status: 'logged_out' }, summary: 'Teams authentication cleared.' },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'logout'); }
    });
}
