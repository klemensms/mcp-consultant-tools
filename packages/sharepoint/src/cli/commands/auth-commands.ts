/**
 * SharePoint sign-in CLI commands (device-code mode).
 *
 * Maps spo-authenticate, spo-auth-status and spo-logout. The CLI and the MCP
 * server share one encrypted token cache, so `auth login` here signs in the
 * MCP server too.
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { handleCliError } from '../output.js';

const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;

export function registerAuthCommands(program: Command, ctx: ServiceContext): void {
  const auth = program.command('auth').description('Sign in to SharePoint as yourself (device-code mode)');

  // spo-authenticate
  auth
    .command('login')
    .description('Sign in with a device code and wait (up to 15 minutes) until sign-in completes')
    .action(async () => {
      try {
        const start = await ctx.sharepoint.startSignIn();
        if (start.state !== 'pending') {
          console.log(start.message);
          return;
        }
        console.log(`Open: ${start.verificationUri}`);
        console.log(`Enter code: ${start.userCode}`);
        console.log(`Waiting for sign-in (the code expires in ${Math.round((start.expiresInSeconds ?? 900) / 60)} minutes)...`);

        const status = await ctx.sharepoint.waitForSignIn(LOGIN_TIMEOUT_MS);
        console.log(JSON.stringify(status, null, 2));
        process.exit(status.state === 'authenticated' ? 0 : 1);
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-auth-status
  auth
    .command('status')
    .description('Show sign-in state, account and granted delegated permissions')
    .action(async () => {
      try {
        console.log(JSON.stringify(await ctx.sharepoint.getAuthStatus(), null, 2));
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-logout
  auth
    .command('logout')
    .description('Sign out and delete the cached sign-in')
    .action(async () => {
      try {
        console.log((await ctx.sharepoint.logout()).message);
      } catch (error) {
        handleCliError(error);
      }
    });
}
