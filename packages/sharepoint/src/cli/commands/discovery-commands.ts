/**
 * SharePoint cross-site discovery CLI commands (device-code mode).
 *
 * Maps spo-search-files, spo-resolve-link and spo-find-sites.
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerDiscoveryCommands(program: Command, ctx: ServiceContext): void {

  // spo-search-files
  program
    .command('search-files')
    .description('Search every SharePoint site, OneDrive and Teams file you can open (sign-in mode)')
    .requiredOption('--query <query>', 'Search text or KQL query')
    .option('--top <n>', 'Results per page (default 25, max 100)', (v) => parseInt(v, 10))
    .option('--from <n>', 'Offset for paging (default 0)', (v) => parseInt(v, 10))
    .action(async (opts: any) => {
      try {
        const result = await ctx.discovery.searchFiles(opts.query, { top: opts.top, from: opts.from });
        outputResult({
          fileName: `search-files-${opts.query}`,
          data: result,
          summary:
            `${result.hits.length} of ${result.total} hit(s)${result.moreResultsAvailable ? ' (more available)' : ''}:\n` +
            result.hits.map((h) => `  - ${h.name}  (${h.location})`).join('\n'),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-resolve-link
  program
    .command('resolve-link')
    .description('Resolve a SharePoint or OneDrive URL or sharing link to a drive item (sign-in mode)')
    .requiredOption('--url <url>', 'Full https:// URL or sharing link')
    .action(async (opts: any) => {
      try {
        const item = await ctx.discovery.resolveLink(opts.url);
        outputResult({
          fileName: `resolve-link-${item.itemId}`,
          data: item,
          summary: `${item.isFolder ? 'Folder' : 'File'}: ${item.name}\nDrive: ${item.driveId}\nItem: ${item.itemId}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-find-sites
  program
    .command('find-sites')
    .description('Find sites by keyword, or resolve one site from its URL (sign-in mode)')
    .requiredOption('--query <query>', 'Keyword or site URL')
    .action(async (opts: any) => {
      try {
        const sites = await ctx.discovery.findSites(opts.query);
        outputResult({
          fileName: `find-sites-${opts.query}`,
          data: sites,
          summary: `Found ${sites.length} site(s):\n` + sites.map((s) => `  - ${s.displayName ?? s.name}: ${s.webUrl}`).join('\n'),
        });
      } catch (error) {
        handleCliError(error);
      }
    });
}
