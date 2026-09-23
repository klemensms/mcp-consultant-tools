/**
 * Outlook sign-in CLI commands.
 *
 * Maps mail-authenticate, mail-auth-status and mail-logout. The CLI and the MCP
 * server share one encrypted token cache, so `auth login` here signs in the
 * MCP server too.
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { mailAuthStatus } from '../../tools/auth-tools.js';
import { handleCliError } from '../output.js';

const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;

export function registerAuthCommands(program: Command, ctx: ServiceContext): void {
  const auth = program.command('auth').description('Sign in to Outlook as yourself (device code)');

  // mail-authenticate
  auth
    .command('login')
    .description('Sign in with a device code and wait (up to 15 minutes) until sign-in completes')
    .action(async () => {
      try {
        const start = await ctx.auth.startDeviceCode();
        if (start.state !== 'pending') {
          console.log(start.message);
          return;
        }
        console.log(`Open: ${start.verificationUri}`);
        console.log(`Enter code: ${start.userCode}`);
        console.log(`Waiting for sign-in (the code expires in ${Math.round((start.expiresInSeconds ?? 900) / 60)} minutes)...`);

        const status = await ctx.auth.waitForCompletion(LOGIN_TIMEOUT_MS);
        console.log(JSON.stringify(status, null, 2));
        process.exit(status.state === 'authenticated' ? 0 : 1);
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-auth-status
  auth
    .command('status')
    .description('Show sign-in state, account, granted permissions and what each tool group can do')
    .action(async () => {
      try {
        console.log(JSON.stringify(await mailAuthStatus(ctx), null, 2));
      } catch (error) {
        handleCliError(error);
      }
    });

  // mail-logout
  auth
    .command('logout')
    .description('Sign out and delete the cached sign-in')
    .action(async () => {
      try {
        await ctx.auth.logout();
        console.log('Signed out of Outlook; the cached sign-in was deleted.');
      } catch (error) {
        handleCliError(error);
      }
    });
}
