#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";
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
import { registerAzureB2CTools } from "@mcp-consultant-tools/azure-b2c";
import { registerAzureDataFactoryTools } from "@mcp-consultant-tools/azure-data-factory";
import { registerAzureManagementTools } from "@mcp-consultant-tools/azure-management";
import { registerTeamsTools } from "@mcp-consultant-tools/teams";
import { registerAzureDevOpsAdminTools } from "@mcp-consultant-tools/azure-devops-admin";
import { registerAzureStorageTools } from "@mcp-consultant-tools/azure-storage";
import { registerOnePasswordTools } from "@mcp-consultant-tools/1password";
import { registerRestApiTools } from "@mcp-consultant-tools/rest-api";
import { registerFabricTools } from "@mcp-consultant-tools/fabric";

/**
 * Register all MCP Consultant Tools
 *
 * This meta-package combines all 18 service packages:
 * - PowerPlatform (read-only: 46 tools, 12 prompts)
 * - PowerPlatform Customization (schema changes: 70 tools)
 * - PowerPlatform Data (data CRUD: 10 tools)
 * - Azure DevOps (wikis, work items, PRs, builds)
 * - Azure DevOps Admin (pipelines, environments, service connections)
 * - Figma (design data extraction)
 * - Application Insights (telemetry, exceptions, performance)
 * - Log Analytics (logs, Azure Functions troubleshooting)
 * - Azure SQL (database schema, queries)
 * - Service Bus (queue monitoring, dead letter analysis)
 * - SharePoint (sites, document libraries, PowerPlatform validation)
 * - GitHub Enterprise (repositories, commits, PRs, code search)
 * - Azure AD B2C (user management, password reset, groups)
 * - Azure Data Factory (pipeline execution, monitoring, error debugging)
 * - Azure Management (ARM API - Function Apps, App Services, Key Vaults, Storage, SQL, Monitoring)
 * - Azure Storage (blobs, queues, tables, file shares)
 * - REST API (generic HTTP requests with auth)
 * - Teams (channel messages, adaptive cards for release announcements)
 */
export function registerAllTools(server: any) {
  console.error("Registering all MCP Consultant Tools...");

  // Register all service tools
  registerPowerPlatformTools(server);

  // PowerPlatform Customization (optional - install @mcp-consultant-tools/powerplatform-customization separately if needed)
  try {
    registerPowerplatformCustomizationTools(server);
  } catch (error) {
    console.error("⚠️  PowerPlatform Customization skipped:", (error as Error).message);
  }

  // PowerPlatform Data (optional - install @mcp-consultant-tools/powerplatform-data separately if needed)
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
  registerAzureB2CTools(server);

  // Azure Data Factory (optional - for pipeline execution and monitoring)
  try {
    registerAzureDataFactoryTools(server);
  } catch (error) {
    console.error("⚠️  Azure Data Factory skipped:", (error as Error).message);
  }

  // Azure Management (optional - for ARM API resource discovery)
  try {
    registerAzureManagementTools(server);
  } catch (error) {
    console.error("⚠️  Azure Management skipped:", (error as Error).message);
  }

  // Teams (optional - for release announcements)
  try {
    registerTeamsTools(server);
  } catch (error) {
    console.error("⚠️  Teams skipped:", (error as Error).message);
  }

  // Azure DevOps Admin (optional - pipeline management, environments, service connections)
  try {
    registerAzureDevOpsAdminTools(server);
  } catch (error) {
    console.error("⚠️  Azure DevOps Admin skipped:", (error as Error).message);
  }

  // Azure Storage (optional - blobs, queues, tables, file shares)
  try {
    registerAzureStorageTools(server);
  } catch (error) {
    console.error("⚠️  Azure Storage skipped:", (error as Error).message);
  }

  // REST API (optional - generic HTTP requests with auth)
  try {
    registerRestApiTools(server);
  } catch (error) {
    console.error("⚠️  REST API skipped:", (error as Error).message);
  }

  // 1Password (optional - vault and item management)
  try {
    registerOnePasswordTools(server);
  } catch (error) {
    console.error("⚠️  1Password skipped:", (error as Error).message);
  }

  // Microsoft Fabric (optional - workspaces, capacities, items, shortcuts, domains)
  try {
    registerFabricTools(server);
  } catch (error) {
    console.error("⚠️  Microsoft Fabric skipped:", (error as Error).message);
  }

  console.error("All tools registered successfully!");
  console.error("Total integrations: 18 services");
}

// CLI entry point (standalone execution)
// Uses realpathSync to resolve symlinks created by npx
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

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
