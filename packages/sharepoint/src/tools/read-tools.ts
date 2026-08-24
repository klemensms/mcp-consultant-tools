/**
 * SharePoint Read Tools
 *
 * 15 existing read-only tools + 1 spo-download-file tool.
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, SITE_ID_EXAMPLES, DRIVE_ID_EXAMPLES, FILE_PATH_EXAMPLES } from '../utils/tool-examples.js';

/**
 * Register all read-only SharePoint tools with the MCP server
 */
export function registerReadTools(server: any, ctx: ServiceContext): void {

  server.tool(
    "spo-list-sites",
    "List all configured SharePoint sites (active and inactive)",
    {},
    // Reads from local configuration only - no network call.
    { readOnlyHint: true },
    async () => {
      try {
        const sites = ctx.sharepoint.getAllSites();
        return { content: [{ type: "text", text: JSON.stringify(sites, null, 2) }] };
      } catch (error: any) {
        console.error("Error listing SharePoint sites:", error);
        return { content: [{ type: "text", text: `Failed to list sites: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-get-site-info",
    "Get detailed site information including metadata, created/modified dates, and owner info",
    {
      siteId: z.string().describe(descWithExamples("Site ID from configuration (use spo-list-sites to find IDs)", SITE_ID_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId }: any) => {
      try {
        const siteInfo = await ctx.sharepoint.getSiteInfo(siteId);
        return { content: [{ type: "text", text: JSON.stringify(siteInfo, null, 2) }] };
      } catch (error: any) {
        console.error("Error getting SharePoint site info:", error);
        return { content: [{ type: "text", text: `Failed to get site info: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-test-connection",
    "Test connectivity to a SharePoint site and verify permissions (Sites.Read.All and Files.Read.All required)",
    {
      siteId: z.string().describe("Site ID from configuration"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId }: any) => {
      try {
        const result = await ctx.sharepoint.testConnection(siteId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error testing SharePoint connection:", error);
        return { content: [{ type: "text", text: `Failed to test connection: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-list-drives",
    "List all document libraries (drives) in a SharePoint site with metadata",
    {
      siteId: z.string().describe("Site ID from configuration"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId }: any) => {
      try {
        const drives = await ctx.sharepoint.listDrives(siteId);
        return { content: [{ type: "text", text: JSON.stringify(drives, null, 2) }] };
      } catch (error: any) {
        console.error("Error listing SharePoint drives:", error);
        return { content: [{ type: "text", text: `Failed to list drives: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-get-drive-info",
    "Get detailed document library information including quota, owner, and created/modified dates",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe(descWithExamples("Drive ID (use spo-list-drives to find IDs)", DRIVE_ID_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId, driveId }: any) => {
      try {
        const driveInfo = await ctx.sharepoint.getDriveInfo(siteId, driveId);
        return { content: [{ type: "text", text: JSON.stringify(driveInfo, null, 2) }] };
      } catch (error: any) {
        console.error("Error getting SharePoint drive info:", error);
        return { content: [{ type: "text", text: `Failed to get drive info: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-clear-cache",
    "Clear cached SharePoint responses (useful after site changes or for troubleshooting)",
    {
      siteId: z.string().optional().describe("Clear cache for specific site only (optional)"),
      pattern: z.string().optional().describe("Clear only cache entries matching this pattern (optional)"),
    },
    // Clears local response cache only - mutates local state, destroys no remote data; idempotent.
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async ({ siteId, pattern }: any) => {
      try {
        const clearedCount = ctx.sharepoint.clearCache(pattern, siteId);
        return { content: [{ type: "text", text: JSON.stringify({ clearedCount, message: `Cleared ${clearedCount} cache entries` }, null, 2) }] };
      } catch (error: any) {
        console.error("Error clearing SharePoint cache:", error);
        return { content: [{ type: "text", text: `Failed to clear cache: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-list-items",
    "List all files and folders in a document library or folder",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      folderId: z.string().optional().describe("Folder ID (optional, defaults to root)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId, driveId, folderId }: any) => {
      try {
        const items = await ctx.lists.listItems(siteId, driveId, folderId);
        return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
      } catch (error: any) {
        console.error("Error listing SharePoint items:", error);
        return { content: [{ type: "text", text: `Failed to list items: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-get-item",
    "Get detailed file or folder metadata by ID",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      itemId: z.string().describe("Item ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId, driveId, itemId }: any) => {
      try {
        const item = await ctx.lists.getItem(siteId, driveId, itemId);
        return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
      } catch (error: any) {
        console.error("Error getting SharePoint item:", error);
        return { content: [{ type: "text", text: `Failed to get item: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-get-item-by-path",
    "Get file or folder metadata by path (relative to drive root)",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      path: z.string().describe(descWithExamples("Item path relative to drive root", FILE_PATH_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId, driveId, path }: any) => {
      try {
        const item = await ctx.lists.getItemByPath(siteId, driveId, path);
        return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
      } catch (error: any) {
        console.error("Error getting SharePoint item by path:", error);
        return { content: [{ type: "text", text: `Failed to get item by path: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-search-items",
    "Search for files by filename or metadata (filename and metadata search only, not full-text)",
    {
      siteId: z.string().describe("Site ID from configuration"),
      query: z.string().describe("Search query"),
      driveId: z.string().optional().describe("Limit search to specific drive (optional)"),
      limit: z.number().optional().describe("Maximum results (default: 100, max configured in SHAREPOINT_MAX_SEARCH_RESULTS)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId, query, driveId, limit }: any) => {
      try {
        const result = await ctx.lists.searchItems(siteId, query, driveId, limit);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error searching SharePoint items:", error);
        return { content: [{ type: "text", text: `Failed to search items: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-get-recent-items",
    "Get recently modified items in a document library",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      limit: z.number().optional().describe("Maximum results (default: 20, max: 100)"),
      days: z.number().optional().describe("Days back to search (default: 30)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId, driveId, limit, days }: any) => {
      try {
        const items = await ctx.lists.getRecentItems(siteId, driveId, limit, days);
        return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
      } catch (error: any) {
        console.error("Error getting recent SharePoint items:", error);
        return { content: [{ type: "text", text: `Failed to get recent items: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-get-folder-structure",
    "Get recursive folder tree structure (useful for understanding site organization)",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      folderId: z.string().optional().describe("Root folder ID (optional, defaults to drive root)"),
      depth: z.number().optional().describe("Recursion depth (default: 3, max: 10)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId, driveId, folderId, depth }: any) => {
      try {
        const tree = await ctx.lists.getFolderStructure(siteId, driveId, folderId, depth);
        return { content: [{ type: "text", text: JSON.stringify(tree, null, 2) }] };
      } catch (error: any) {
        console.error("Error getting SharePoint folder structure:", error);
        return { content: [{ type: "text", text: `Failed to get folder structure: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-get-crm-doc-locs",
    "Get SharePoint document locations configured in PowerPlatform Dataverse (sharepointdocumentlocation entity)",
    {
      entityName: z.string().optional().describe("Filter by entity logical name (e.g., 'account', 'contact')"),
      recordId: z.string().optional().describe("Filter by specific record ID (GUID)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityName, recordId }: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const locations = await ctx.lists.getCrmDocumentLocations(ppService, entityName, recordId);
        return { content: [{ type: "text", text: JSON.stringify(locations, null, 2) }] };
      } catch (error: any) {
        console.error("Error getting CRM document locations:", error);
        return { content: [{ type: "text", text: `Failed to get CRM document locations: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-validate-doc-loc",
    "Validate that a PowerPlatform document location configuration matches the actual SharePoint site structure. Checks site accessibility, folder existence, and file counts. Returns validation status (valid/warning/error) with issues and recommendations.",
    {
      documentLocationId: z.string().describe("GUID of the sharepointdocumentlocation record in PowerPlatform"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ documentLocationId }: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const result = await ctx.lists.validateDocumentLocation(ppService, documentLocationId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error validating document location:", error);
        return { content: [{ type: "text", text: `Failed to validate document location: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-verify-doc-mig",
    "Verify that documents were successfully migrated from source to target SharePoint folder. Compares file counts, sizes, names, and modified dates. Returns migration status (complete/incomplete/failed) with success rate and detailed comparison.",
    {
      sourceSiteId: z.string().describe("Source SharePoint site ID"),
      sourcePath: z.string().describe("Source folder path (e.g., '/Documents/Archive')"),
      targetSiteId: z.string().describe("Target SharePoint site ID"),
      targetPath: z.string().describe("Target folder path (e.g., '/NewLibrary/Archive')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ sourceSiteId, sourcePath, targetSiteId, targetPath }: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const result = await ctx.lists.verifyDocumentMigration(ppService, sourceSiteId, sourcePath, targetSiteId, targetPath);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error verifying document migration:", error);
        return { content: [{ type: "text", text: `Failed to verify document migration: ${error.message}` }], isError: true };
      }
    }
  );

  // ========================================
  // Download file (read operation, no flag)
  // ========================================

  server.tool(
    "spo-download-file",
    "Download file content from SharePoint. Text files (json, csv, txt, xml, etc.) returned as UTF-8 string. Binary files (docx, pdf, xlsx, etc.) returned as base64-encoded string. Use itemId or path to identify the file.",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      itemId: z.string().optional().describe("Item ID (use this OR path, not both)"),
      path: z.string().optional().describe(
        descWithExamples("File path relative to drive root (use this OR itemId, not both)", FILE_PATH_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ siteId, driveId, itemId, path }: any) => {
      try {
        if (!itemId && !path) {
          return {
            content: [{ type: "text", text: "Error: Provide either 'itemId' or 'path' to identify the file." }],
            isError: true,
          };
        }

        const byPath = !itemId;
        const identifier = itemId || path;

        const result = await ctx.files.downloadFile(siteId, driveId, identifier, byPath);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              fileName: result.fileName,
              mimeType: result.mimeType,
              encoding: result.encoding,
              size: result.size,
              itemId: result.itemId,
              webUrl: result.webUrl,
              content: result.content,
            }, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error downloading file:", error);
        return { content: [{ type: "text", text: `Failed to download file: ${error.message}` }], isError: true };
      }
    }
  );
}
