#!/usr/bin/env node

/**
 * @mcp-consultant-tools/sharepoint
 *
 * MCP server for sharepoint integration.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { SharePointService } from "./SharePointService.js";
import type { SharePointConfig } from "./SharePointService.js";
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';
import { formatSiteListAsMarkdown, formatLibraryListAsMarkdown, formatFileListAsMarkdown, formatSiteOverviewAsMarkdown, formatValidationReportAsMarkdown, formatMigrationChecklistAsMarkdown } from './utils/sharepoint-formatters.js';

/**
 * Register sharepoint tools and prompts to an MCP server
 * @param server - The MCP server instance
 * @param sharepointService - Optional pre-configured SharePointService (for testing or custom configs)
 */
export function registerSharePointTools(server: any, sharepointService?: SharePointService) {
  let service: SharePointService | null = sharepointService || null;

  function getSharePointService(): SharePointService {
    if (!service) {
      // Configuration validation would go here
      // For now, just initialize from environment
      service = new SharePointService(/* config */);
      console.error("SharePointService initialized");
    }

    return service;
  }

  console.error("sharepoint tools registered: 0 tools, 0 prompts");

}

/**
 * Export service class for direct usage
 */
export { SharePointService } from "./SharePointService.js";
export type { SharePointConfig } from "./SharePointService.js";

/**
 * Standalone CLI server (when run directly)
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: "@mcp-consultant-tools/sharepoint",
    version: "1.0.0",
    capabilities: {
      tools: {},
      prompts: {},
    },
  });

  registerSharePointTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start @mcp-consultant-tools/sharepoint MCP server:", error);
    process.exit(1);
  });

  console.error("@mcp-consultant-tools/sharepoint server running on stdio");
}
