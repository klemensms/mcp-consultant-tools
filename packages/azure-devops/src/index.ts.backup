#!/usr/bin/env node

/**
 * @mcp-consultant-tools/azure-devops
 *
 * MCP server for Azure DevOps integration.
 * Provides wikis, work items, and project management capabilities.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { AzureDevOpsService } from "./AzureDevOpsService.js";
import type { AzureDevOpsConfig } from "./AzureDevOpsService.js";

/**
 * Register Azure DevOps tools and prompts to an MCP server
 * @param server - The MCP server instance
 * @param azureDevOpsService - Optional pre-configured AzureDevOpsService (for testing or custom configs)
 */
export function registerAzureDevOpsTools(server: any, azureDevOpsService?: AzureDevOpsService) {
  let service: AzureDevOpsService | null = azureDevOpsService || null;

  function getAzureDevOpsService(): AzureDevOpsService {
    if (!service) {
      const missingConfig: string[] = [];
      if (!process.env.AZUREDEVOPS_ORGANIZATION) missingConfig.push("AZUREDEVOPS_ORGANIZATION");
      if (!process.env.AZUREDEVOPS_PAT) missingConfig.push("AZUREDEVOPS_PAT");
      if (!process.env.AZUREDEVOPS_PROJECTS) missingConfig.push("AZUREDEVOPS_PROJECTS");

      if (missingConfig.length > 0) {
        throw new Error(
          `Missing required Azure DevOps configuration: ${missingConfig.join(", ")}. ` +
          `Set environment variables for organization, PAT, and allowed projects.`
        );
      }

      const config: AzureDevOpsConfig = {
        organization: process.env.AZUREDEVOPS_ORGANIZATION!,
        pat: process.env.AZUREDEVOPS_PAT!,
        projects: process.env.AZUREDEVOPS_PROJECTS!.split(",").map(p => p.trim()),
        apiVersion: process.env.AZUREDEVOPS_API_VERSION || "7.1",
        enableWorkItemWrite: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE === "true",
        enableWorkItemDelete: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE === "true",
        enableWikiWrite: process.env.AZUREDEVOPS_ENABLE_WIKI_WRITE === "true",
      };

      service = new AzureDevOpsService(config);
      console.error("Azure DevOps service initialized");
    }

    return service;
  }

  // TODO: Extract and register all Azure DevOps tools here
  // Tools include: wikis, work items, and search
  // This will be filled during meta-package creation phase

  console.error("Azure DevOps tools registered (tool extraction pending)");
}

/**
 * Export service class for direct usage
 */
export { AzureDevOpsService } from "./AzureDevOpsService.js";
export type { AzureDevOpsConfig } from "./AzureDevOpsService.js";

/**
 * Standalone CLI server (when run directly)
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: "@mcp-consultant-tools/azure-devops",
    version: "1.0.0",
    capabilities: {
      tools: {},
    },
  });

  registerAzureDevOpsTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Azure DevOps MCP server:", error);
    process.exit(1);
  });

  console.error("@mcp-consultant-tools/azure-devops server running on stdio");
}
