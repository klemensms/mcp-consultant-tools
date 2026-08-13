#!/usr/bin/env node

/**
 * @mcp-consultant-tools/sharepoint
 *
 * MCP server for SharePoint Online integration.
 * Entry point: MCP server startup + backward-compatible registerSharePointTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { SharePointService } from './services/sharepoint-service.js';
import type { SharePointConfig } from './services/sharepoint-service.js';
import { ListService } from './services/list-service.js';
import { FileOperationsService } from './services/file-operations-service.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
  let service: SharePointService | null = null;
  let listService: ListService | null = null;
  let fileOps: FileOperationsService | null = null;

  function getSharePointService(): SharePointService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.SHAREPOINT_SITES) {
        try {
          resources = JSON.parse(process.env.SHAREPOINT_SITES);
        } catch (error) {
          throw new Error("Failed to parse SHAREPOINT_SITES JSON");
        }
      } else if (process.env.SHAREPOINT_SITE_URL) {
        resources = [{
          id: 'default',
          name: 'Default SharePoint Site',
          siteUrl: process.env.SHAREPOINT_SITE_URL,
          active: true,
        }];
      } else {
        missingConfig.push("SHAREPOINT_SITES or SHAREPOINT_SITE_URL");
      }

      if (!process.env.SHAREPOINT_TENANT_ID) missingConfig.push("SHAREPOINT_TENANT_ID");
      if (!process.env.SHAREPOINT_CLIENT_ID) missingConfig.push("SHAREPOINT_CLIENT_ID");
      if (!process.env.SHAREPOINT_CLIENT_SECRET) missingConfig.push("SHAREPOINT_CLIENT_SECRET");

      if (missingConfig.length > 0) {
        throw new Error(`Missing SharePoint configuration: ${missingConfig.join(", ")}`);
      }

      const config: SharePointConfig = {
        sites: resources,
        authMethod: 'entra-id',
        tenantId: process.env.SHAREPOINT_TENANT_ID!,
        clientId: process.env.SHAREPOINT_CLIENT_ID!,
        clientSecret: process.env.SHAREPOINT_CLIENT_SECRET!,
      };

      service = new SharePointService(config);
      console.error("SharePoint service initialized");
    }
    return service;
  }

  function getListService(): ListService {
    if (!listService) {
      listService = new ListService(getSharePointService());
      console.error("ListService initialized");
    }
    return listService;
  }

  function getFileOperationsService(): FileOperationsService {
    if (!fileOps) {
      fileOps = new FileOperationsService(getSharePointService(), {
        maxDownloadSizeMB: parseInt(process.env.SHAREPOINT_MAX_DOWNLOAD_SIZE_MB || '50', 10),
        maxUploadSizeMB: parseInt(process.env.SHAREPOINT_MAX_UPLOAD_SIZE_MB || '100', 10),
      });
      console.error("FileOperationsService initialized");
    }
    return fileOps;
  }

  function getPowerPlatformService(): any {
    throw new Error(
      'PowerPlatform integration not available in standalone SharePoint package. ' +
      'Use the complete @mcp-consultant-tools package for cross-service validation.'
    );
  }

  function checkWriteEnabled(): void {
    if (process.env.SHAREPOINT_ENABLE_WRITE !== 'true') {
      throw new Error('Write operations are disabled. Set SHAREPOINT_ENABLE_WRITE=true to enable.');
    }
  }

  function checkDeleteEnabled(): void {
    if (process.env.SHAREPOINT_ENABLE_DELETE !== 'true') {
      throw new Error('Delete operations are disabled. Set SHAREPOINT_ENABLE_DELETE=true to enable.');
    }
  }

  return {
    get sharepoint() { return getSharePointService(); },
    get lists() { return getListService(); },
    get files() { return getFileOperationsService(); },
    getPowerPlatformService,
    checkWriteEnabled,
    checkDeleteEnabled,
  };
}

/**
 * Register SharePoint tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerSharePointTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);

  const writeEnabled = process.env.SHAREPOINT_ENABLE_WRITE === 'true';
  const deleteEnabled = process.env.SHAREPOINT_ENABLE_DELETE === 'true';
  const writeToolCount = writeEnabled ? 5 : 0;
  const deleteToolCount = deleteEnabled ? 1 : 0;
  const totalTools = 16 + writeToolCount + deleteToolCount;
  console.error(`SharePoint tools registered: ${totalTools} tools (${writeToolCount + deleteToolCount} write), 10 prompts`);
}

// Backward-compatible exports
export { SharePointService } from './services/sharepoint-service.js';
export type { SharePointConfig } from './services/sharepoint-service.js';
export { ListService } from './services/list-service.js';
export { FileOperationsService } from './services/file-operations-service.js';
export type { ServiceContext } from './types.js';

/**
 * Standalone CLI server (when run directly)
 * Uses realpathSync to resolve symlinks created by npx
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: "mcp-sharepoint",
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} },
  });

  registerSharePointTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start SharePoint MCP server:", error);
    process.exit(1);
  });

  console.error("SharePoint MCP server running");
}
