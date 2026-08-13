/**
 * SharePoint Read CLI Commands
 *
 * Maps all 16 read-only MCP tools to Commander CLI commands.
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerReadCommands(program: Command, ctx: ServiceContext): void {

  // spo-list-sites
  program
    .command('list-sites')
    .description('List all configured SharePoint sites (active and inactive)')
    .action(async () => {
      try {
        const sites = ctx.sharepoint.getAllSites();
        outputResult({
          fileName: 'list-sites',
          data: sites,
          summary: `Found ${sites.length} configured site(s):\n` +
            sites.map((s: any) => `  - ${s.id}: ${s.name} (${s.active ? 'active' : 'inactive'})`).join('\n'),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-get-site-info
  program
    .command('get-site-info')
    .description('Get detailed site information including metadata')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .action(async (opts: any) => {
      try {
        const siteInfo = await ctx.sharepoint.getSiteInfo(opts.siteId);
        outputResult({
          fileName: `site-info-${opts.siteId}`,
          data: siteInfo,
          summary: `Site: ${(siteInfo as any).displayName || opts.siteId}\nURL: ${(siteInfo as any).webUrl || 'N/A'}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-test-connection
  program
    .command('test-connection')
    .description('Test connectivity to a SharePoint site and verify permissions')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .action(async (opts: any) => {
      try {
        const result = await ctx.sharepoint.testConnection(opts.siteId);
        outputResult({
          fileName: `test-connection-${opts.siteId}`,
          data: result,
          summary: `Connection test: ${(result as any).success ? 'SUCCESS' : 'FAILED'}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-list-drives
  program
    .command('list-drives')
    .description('List all document libraries (drives) in a SharePoint site')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .action(async (opts: any) => {
      try {
        const drives = await ctx.sharepoint.listDrives(opts.siteId);
        outputResult({
          fileName: `drives-${opts.siteId}`,
          data: drives,
          summary: `Found ${drives.length} document library/libraries:\n` +
            drives.map((d: any) => `  - ${d.name} (${d.id})`).join('\n'),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-get-drive-info
  program
    .command('get-drive-info')
    .description('Get detailed document library information')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .action(async (opts: any) => {
      try {
        const driveInfo = await ctx.sharepoint.getDriveInfo(opts.siteId, opts.driveId);
        outputResult({
          fileName: `drive-info-${opts.driveId}`,
          data: driveInfo,
          summary: `Drive: ${(driveInfo as any).name || opts.driveId}\nType: ${(driveInfo as any).driveType || 'N/A'}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-clear-cache
  program
    .command('clear-cache')
    .description('Clear cached SharePoint responses')
    .option('--site-id <siteId>', 'Clear cache for specific site only')
    .option('--pattern <pattern>', 'Clear only entries matching this pattern')
    .action(async (opts: any) => {
      try {
        const clearedCount = ctx.sharepoint.clearCache(opts.pattern, opts.siteId);
        outputResult({ persist: false,
          fileName: 'clear-cache',
          data: { clearedCount },
          summary: `Cleared ${clearedCount} cache entries`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-list-items
  program
    .command('list-items')
    .description('List all files and folders in a document library or folder')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .option('--folder-id <folderId>', 'Folder ID (defaults to root)')
    .action(async (opts: any) => {
      try {
        const items = await ctx.lists.listItems(opts.siteId, opts.driveId, opts.folderId);
        outputResult({
          fileName: `items-${opts.driveId}`,
          data: items,
          summary: `Found ${items.length} item(s):\n` +
            items.slice(0, 20).map((i: any) => `  - ${i.folder ? '[folder]' : '[file]'} ${i.name}`).join('\n') +
            (items.length > 20 ? `\n  ... and ${items.length - 20} more` : ''),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-get-item
  program
    .command('get-item')
    .description('Get detailed file or folder metadata by ID')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .requiredOption('--item-id <itemId>', 'Item ID')
    .action(async (opts: any) => {
      try {
        const item = await ctx.lists.getItem(opts.siteId, opts.driveId, opts.itemId);
        outputResult({
          fileName: `item-${opts.itemId}`,
          data: item,
          summary: `Item: ${(item as any).name || opts.itemId}\nType: ${(item as any).folder ? 'Folder' : 'File'}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-get-item-by-path
  program
    .command('get-item-by-path')
    .description('Get file or folder metadata by path (relative to drive root)')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .requiredOption('--path <path>', 'Item path relative to drive root')
    .action(async (opts: any) => {
      try {
        const item = await ctx.lists.getItemByPath(opts.siteId, opts.driveId, opts.path);
        outputResult({
          fileName: `item-by-path`,
          data: item,
          summary: `Item: ${(item as any).name || opts.path}\nType: ${(item as any).folder ? 'Folder' : 'File'}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-search-items
  program
    .command('search-items')
    .description('Search for files by filename or metadata')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--query <query>', 'Search query')
    .option('--drive-id <driveId>', 'Limit search to specific drive')
    .option('--limit <limit>', 'Maximum results', parseInt)
    .action(async (opts: any) => {
      try {
        const result = await ctx.lists.searchItems(opts.siteId, opts.query, opts.driveId, opts.limit);
        const items = (result as any).items || [];
        outputResult({
          fileName: `search-${opts.query.replace(/[^a-zA-Z0-9]/g, '_')}`,
          data: result,
          summary: `Search "${opts.query}": ${items.length} result(s)\n` +
            items.slice(0, 10).map((i: any) => `  - ${i.name}`).join('\n') +
            (items.length > 10 ? `\n  ... and ${items.length - 10} more` : ''),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-get-recent-items
  program
    .command('get-recent-items')
    .description('Get recently modified items in a document library')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .option('--limit <limit>', 'Maximum results (default: 20)', parseInt)
    .option('--days <days>', 'Days back to search (default: 30)', parseInt)
    .action(async (opts: any) => {
      try {
        const items = await ctx.lists.getRecentItems(opts.siteId, opts.driveId, opts.limit, opts.days);
        outputResult({
          fileName: `recent-items-${opts.driveId}`,
          data: items,
          summary: `Found ${items.length} recently modified item(s):\n` +
            items.slice(0, 10).map((i: any) => `  - ${i.name} (${i.lastModifiedDateTime})`).join('\n') +
            (items.length > 10 ? `\n  ... and ${items.length - 10} more` : ''),
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-get-folder-structure
  program
    .command('get-folder-structure')
    .description('Get recursive folder tree structure')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .option('--folder-id <folderId>', 'Root folder ID (defaults to drive root)')
    .option('--depth <depth>', 'Recursion depth (default: 3, max: 10)', parseInt)
    .action(async (opts: any) => {
      try {
        const tree = await ctx.lists.getFolderStructure(opts.siteId, opts.driveId, opts.folderId, opts.depth);
        outputResult({
          fileName: `folder-structure-${opts.driveId}`,
          data: tree,
          summary: `Folder structure retrieved for drive ${opts.driveId} (depth: ${opts.depth || 3})`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-get-crm-doc-locs
  program
    .command('get-crm-doc-locs')
    .description('Get SharePoint document locations configured in PowerPlatform Dataverse')
    .option('--entity-name <entityName>', 'Filter by entity logical name')
    .option('--record-id <recordId>', 'Filter by specific record ID (GUID)')
    .action(async (opts: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const locations = await ctx.lists.getCrmDocumentLocations(ppService, opts.entityName, opts.recordId);
        outputResult({
          fileName: 'crm-doc-locs',
          data: locations,
          summary: `Found ${(locations as any[]).length} CRM document location(s)`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-validate-doc-loc
  program
    .command('validate-doc-loc')
    .description('Validate a PowerPlatform document location configuration')
    .requiredOption('--document-location-id <id>', 'GUID of the sharepointdocumentlocation record')
    .action(async (opts: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const result = await ctx.lists.validateDocumentLocation(ppService, opts.documentLocationId);
        outputResult({
          fileName: `validate-doc-loc-${opts.documentLocationId}`,
          data: result,
          summary: `Validation status: ${(result as any).status?.toUpperCase() || 'UNKNOWN'}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-verify-doc-mig
  program
    .command('verify-doc-mig')
    .description('Verify that documents were successfully migrated between SharePoint folders')
    .requiredOption('--source-site-id <sourceSiteId>', 'Source SharePoint site ID')
    .requiredOption('--source-path <sourcePath>', 'Source folder path')
    .requiredOption('--target-site-id <targetSiteId>', 'Target SharePoint site ID')
    .requiredOption('--target-path <targetPath>', 'Target folder path')
    .action(async (opts: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const result = await ctx.lists.verifyDocumentMigration(
          ppService, opts.sourceSiteId, opts.sourcePath, opts.targetSiteId, opts.targetPath
        );
        outputResult({
          fileName: 'verify-doc-mig',
          data: result,
          summary: `Migration verification: ${(result as any).status?.toUpperCase() || 'UNKNOWN'}\n` +
            `Success rate: ${(result as any).successRate || 0}%`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-download-file
  program
    .command('download-file')
    .description('Download file content from SharePoint')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .option('--item-id <itemId>', 'Item ID (use this OR --path)')
    .option('--path <path>', 'File path relative to drive root (use this OR --item-id)')
    .action(async (opts: any) => {
      try {
        if (!opts.itemId && !opts.path) {
          handleCliError(new Error("Provide either --item-id or --path to identify the file."));
          return;
        }

        const byPath = !opts.itemId;
        const identifier = opts.itemId || opts.path;
        const result = await ctx.files.downloadFile(opts.siteId, opts.driveId, identifier, byPath);

        outputResult({
          fileName: `download-${(result as any).fileName || 'file'}`,
          data: {
            fileName: (result as any).fileName,
            mimeType: (result as any).mimeType,
            encoding: (result as any).encoding,
            size: (result as any).size,
            itemId: (result as any).itemId,
            webUrl: (result as any).webUrl,
            content: (result as any).content,
          },
          summary: `Downloaded: ${(result as any).fileName}\nSize: ${(result as any).size} bytes\nEncoding: ${(result as any).encoding}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });
}
