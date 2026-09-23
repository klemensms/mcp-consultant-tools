/**
 * SharePoint sign-in tools (device-code mode).
 *
 * In app-only mode (client secret configured) every tool reports that no
 * sign-in is needed rather than failing.
 */

import type { ServiceContext } from '../types.js';

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

export function registerAuthTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'spo-authenticate',
    'Sign in to SharePoint as yourself (device code). Returns a URL and a code; open the URL, enter the code and sign in. ' +
      'Sign-in completes in the background, and the sign-in is shared with the CLI. Only needed when no client secret is configured.',
    {},
    { readOnlyHint: false, openWorldHint: true },
    async () => {
      try {
        const start = await ctx.sharepoint.startSignIn();
        if (start.state === 'pending') {
          return {
            content: [{
              type: 'text',
              text:
                `Open: ${start.verificationUri}\nEnter code: ${start.userCode}\n\n` +
                `${start.message}\n\nThen call spo-auth-status to confirm.`,
            }],
          };
        }
        return { content: [{ type: 'text', text: start.message }] };
      } catch (error: any) {
        console.error('Error starting SharePoint sign-in:', error);
        return { content: [{ type: 'text', text: `Failed to start sign-in: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    'spo-auth-status',
    'Show the SharePoint sign-in state, the signed-in account, the delegated permissions the sign-in carries, ' +
      'and whether they cover reading and writing.',
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        return json(await ctx.sharepoint.getAuthStatus());
      } catch (error: any) {
        console.error('Error reading SharePoint sign-in status:', error);
        return { content: [{ type: 'text', text: `Failed to read sign-in status: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    'spo-logout',
    'Sign out of SharePoint and delete the cached sign-in (device-code mode). The CLI is signed out too.',
    {},
    { readOnlyHint: false, destructiveHint: false },
    async () => {
      try {
        const result = await ctx.sharepoint.logout();
        return { content: [{ type: 'text', text: result.message }] };
      } catch (error: any) {
        console.error('Error signing out of SharePoint:', error);
        return { content: [{ type: 'text', text: `Failed to sign out: ${error.message}` }], isError: true };
      }
    }
  );
}
