/**
 * SharePoint cross-site discovery tools (device-code mode).
 *
 * Search, link resolution and site finding act as the signed-in user, across
 * every site, OneDrive and Teams library they can open.
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';

const json = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (what: string, error: any) => {
  console.error(`Error: ${what}:`, error);
  return { content: [{ type: 'text', text: `Failed to ${what}: ${error.message}` }], isError: true };
};

export function registerDiscoveryTools(server: any, ctx: ServiceContext): void {

  server.tool(
    'spo-search-files',
    'Search every SharePoint site, OneDrive and Teams file you can open (Microsoft Search, sign-in mode). ' +
      'Returns name, location, web URL, last modified, drive and item ids (usable with spo-download-file) and the hit summary. ' +
      'Supports KQL, for example: budget filetype:xlsx, or "project plan" author:"Jane Doe".',
    {
      query: z.string().describe('Search text or KQL query'),
      top: z.number().int().min(1).max(100).optional().describe('Results per page (default 25, max 100)'),
      from: z.number().int().min(0).optional().describe('Offset for paging (default 0)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ query, top, from }: any) => {
      try {
        return json(await ctx.discovery.searchFiles(query, { top, from }));
      } catch (error: any) {
        return fail('search files', error);
      }
    }
  );

  server.tool(
    'spo-resolve-link',
    'Turn any SharePoint or OneDrive URL, including a sharing link, into a file or folder record with its drive and item ids, ' +
      'so the other tools can act on a pasted link (sign-in mode).',
    {
      url: z.string().describe('Full https:// SharePoint or OneDrive URL or sharing link'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ url }: any) => {
      try {
        return json(await ctx.discovery.resolveLink(url));
      } catch (error: any) {
        return fail('resolve link', error);
      }
    }
  );

  server.tool(
    'spo-find-sites',
    'Find SharePoint sites by keyword, or resolve one site from its URL (sign-in mode). The returned webUrl can be passed as siteId to the other tools.',
    {
      query: z.string().describe('Keyword, or a site URL such as https://contoso.sharepoint.com/sites/example'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ query }: any) => {
      try {
        return json(await ctx.discovery.findSites(query));
      } catch (error: any) {
        return fail('find sites', error);
      }
    }
  );
}
