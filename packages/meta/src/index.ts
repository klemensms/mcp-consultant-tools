#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { registerPowerPlatformTools } from "@mcp-consultant-tools/powerplatform";
import { registerPowerplatformCustomizationTools } from "@mcp-consultant-tools/powerplatform-customization";
import { registerPowerplatformDataTools } from "@mcp-consultant-tools/powerplatform-data";
import { registerAzureDevOpsTools } from "@mcp-consultant-tools/azure-devops";
import { registerFigmaTools } from "@mcp-consultant-tools/figma";
import { registerApplicationInsightsTools } from "@mcp-consultant-tools/application-insights";
import { registerLogAnalyticsTools } from "@mcp-consultant-tools/log-analytics";
import { registerAzureSqlTools } from "@mcp-consultant-tools/azure-sql";
import { registerServiceBusTools } from "@mcp-consultant-tools/service-bus";
import { registerSharePointTools } from "@mcp-consultant-tools/sharepoint";
import { registerGitHubEnterpriseTools } from "@mcp-consultant-tools/github-enterprise";

/**
 * Register all MCP Consultant Tools
 *
 * This meta-package combines all 11 service packages (13 total with PowerPlatform split):
 * - PowerPlatform (read-only: 38 tools, 10 prompts)
 * - PowerPlatform Customization (schema changes: 40 tools)
 * - PowerPlatform Data (CRUD: 3 tools)
 * - Azure DevOps (wikis, work items)
 * - Figma (design data extraction)
 * - Application Insights (telemetry, exceptions, performance)
 * - Log Analytics (logs, Azure Functions troubleshooting)
 * - Azure SQL (database schema, queries)
 * - Service Bus (queue monitoring, dead letter analysis)
 * - SharePoint (sites, document libraries, PowerPlatform validation)
 * - GitHub Enterprise (repositories, commits, PRs, code search)
 *
 * Total: 172 tools + 45 prompts
 */
export function registerAllTools(server: any) {
  console.error("Registering all MCP Consultant Tools...");

  // Register all service tools
  registerPowerPlatformTools(server);

  // PowerPlatform Customization (optional - requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true)
  try {
    registerPowerplatformCustomizationTools(server);
  } catch (error) {
    console.error("⚠️  PowerPlatform Customization skipped:", (error as Error).message);
  }

  // PowerPlatform Data (optional - requires POWERPLATFORM_ENABLE_CREATE/UPDATE/DELETE=true)
  try {
    registerPowerplatformDataTools(server);
  } catch (error) {
    console.error("⚠️  PowerPlatform Data skipped:", (error as Error).message);
  }

  registerAzureDevOpsTools(server);
  registerFigmaTools(server);
  registerApplicationInsightsTools(server);
  registerLogAnalyticsTools(server);
  registerAzureSqlTools(server);
  registerServiceBusTools(server);
  registerSharePointTools(server);
  registerGitHubEnterpriseTools(server);

  console.error("All tools registered successfully!");
  console.error("Total integrations: 11 services | 172 tools | 45 prompts");
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: "mcp-consultant-tools",
    version: "15.0.0",
    capabilities: { tools: {}, prompts: {} }
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start MCP Consultant Tools server:", error);
    process.exit(1);
  });

  console.error("MCP Consultant Tools server running (all integrations enabled)");
}
