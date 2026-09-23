/**
 * Outlook sign-in tools (device code).
 */

import type { ServiceContext } from '../types.js';
import { describeMailAccess } from '../permissions.js';

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (what: string, error: any) => {
  console.error(`Error: ${what}:`, error);
  return { content: [{ type: 'text', text: `Failed to ${what}: ${error.message}` }], isError: true };
};

/** Sign-in status plus, per tool group, whether the token carries the permission and the switch is on. */
export async function mailAuthStatus(ctx: ServiceContext) {
  const status = await ctx.auth.getStatus();
  return {
    ...status,
    access: status.state === 'authenticated' ? describeMailAccess(status.grantedScopes ?? []) : undefined,
  };
}

export function registerAuthTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'mail-authenticate',
    'Sign in to Outlook as yourself (device code). Returns a URL and a code; open the URL, enter the code and sign in. ' +
      'Sign-in completes in the background and is shared with the CLI.',
    {},
    { readOnlyHint: false, openWorldHint: true },
    async () => {
      try {
        const start = await ctx.auth.startDeviceCode();
        if (start.state === 'pending') {
          return {
            content: [{
              type: 'text',
              text:
                `Open: ${start.verificationUri}\nEnter code: ${start.userCode}\n\n` +
                `${start.message}\n\nThen call mail-auth-status to confirm.`,
            }],
          };
        }
        return { content: [{ type: 'text', text: start.message }] };
      } catch (error: any) {
        return fail('start sign-in', error);
      }
    }
  );

  server.tool(
    'mail-auth-status',
    'Show the Outlook sign-in state, the signed-in account, the delegated permissions the sign-in carries, ' +
      'and for each tool group (read, write, send, delete) whether the permission is there and whether its switch is on.',
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        return json(await mailAuthStatus(ctx));
      } catch (error: any) {
        return fail('read sign-in status', error);
      }
    }
  );

  server.tool(
    'mail-logout',
    'Sign out of Outlook and delete the cached sign-in. The CLI is signed out too.',
    {},
    { readOnlyHint: false, destructiveHint: false },
    async () => {
      try {
        await ctx.auth.logout();
        return { content: [{ type: 'text', text: 'Signed out of Outlook; the cached sign-in was deleted.' }] };
      } catch (error: any) {
        return fail('sign out', error);
      }
    }
  );
}
