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

        // startAuthentication resolves as soon as the device code is issued. The MCP
        // server can return there and pick the outcome up later via auth-status, but a
        // CLI that did the same would exit 0 whether or not sign-in ever completed.
        if (result.status === 'pending' && 'userCode' in result) {
          console.error('\nWaiting for sign-in to complete (the code above expires in ' +
            `${Math.floor(result.expiresInSeconds / 60)} minutes)...`);

          const final = await ctx.teams.waitForAuthentication(result.expiresInSeconds * 1000);
          outputResult(
            { fileName: 'auth-login', data: final, summary: `Authentication status: ${final.status} - ${final.message}` },
            getGlobalFlags(program)
          );
          // MSAL's device-code poll and the wait timeout both keep the event loop
          // alive well past the point the answer is known.
          process.exit(final.status === 'authenticated' ? 0 : 1);
        }

        outputResult(
          { fileName: 'auth-login', data: result, summary: `Authentication status: ${result.status} - ${result.message}` },
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
