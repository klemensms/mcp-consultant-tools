#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";
import { duplicateSafeServer, formatDuplicates, type SkippedRegistration } from "./duplicate-safe-server.js";
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
import { registerAzureDefenderTools } from "@mcp-consultant-tools/azure-defender";
import { registerEntraIdTools } from "@mcp-consultant-tools/entra-id";
import { registerMessageCenterTools } from "@mcp-consultant-tools/message-center";
import { registerTeamsTools } from "@mcp-consultant-tools/teams";
import { registerAzureDevOpsAdminTools } from "@mcp-consultant-tools/azure-devops-admin";
import { registerAzureStorageTools } from "@mcp-consultant-tools/azure-storage";
import { registerOnePasswordTools } from "@mcp-consultant-tools/1password";
import { registerRestApiTools } from "@mcp-consultant-tools/rest-api";
import { registerFabricTools } from "@mcp-consultant-tools/fabric";

/**
 * Register all MCP Consultant Tools
 *
 * This meta-package combines all 21 service packages:
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
 * - Azure Defender for Cloud (secure score, assessments, regulatory compliance, attack paths)
 * - Entra ID (app registration audit, client secret and certificate expiry)
 * - Message Center (M365 service health, issues, incident reports, Message Center posts)
 * - Azure Storage (blobs, queues, tables, file shares)
 * - REST API (generic HTTP requests with auth)
 * - Teams (channel messages, adaptive cards for release announcements)
 */
export function registerAllTools(server: any) {
  console.error("Registering all MCP Consultant Tools...");

  // Meta merges every package into one namespace, so two packages can claim the
  // same tool name. `safe()` makes a collision skip that one name instead of
  // aborting the rest of the package — first registration below wins the name.
  const duplicates: SkippedRegistration[] = [];
  const safe = (packageName: string) => duplicateSafeServer(server, packageName, duplicates);

  // Register all service tools
  registerPowerPlatformTools(safe("PowerPlatform"));

  // PowerPlatform Customization (optional - install @mcp-consultant-tools/powerplatform-customization separately if needed)
  try {
    registerPowerplatformCustomizationTools(safe("PowerPlatform Customization"));
  } catch (error) {
    console.error("⚠️  PowerPlatform Customization skipped:", (error as Error).message);
  }

  // PowerPlatform Data (optional - install @mcp-consultant-tools/powerplatform-data separately if needed)
  try {
    registerPowerplatformDataTools(safe("PowerPlatform Data"));
  } catch (error) {
    console.error("⚠️  PowerPlatform Data skipped:", (error as Error).message);
  }

  registerAzureDevOpsTools(safe("Azure DevOps"));
  registerFigmaTools(safe("Figma"));
  registerApplicationInsightsTools(safe("Application Insights"));
  registerLogAnalyticsTools(safe("Log Analytics"));
  registerAzureSqlTools(safe("Azure SQL"));
  registerServiceBusTools(safe("Service Bus"));
  registerSharePointTools(safe("SharePoint"));
  registerGitHubEnterpriseTools(safe("GitHub Enterprise"));
  registerAzureB2CTools(safe("Azure B2C"));

  // Azure Data Factory (optional - for pipeline execution and monitoring)
  try {
    registerAzureDataFactoryTools(safe("Azure Data Factory"));
  } catch (error) {
    console.error("⚠️  Azure Data Factory skipped:", (error as Error).message);
  }

  // Azure Management (optional - for ARM API resource discovery)
  try {
    registerAzureManagementTools(safe("Azure Management"));
  } catch (error) {
    console.error("⚠️  Azure Management skipped:", (error as Error).message);
  }

  // Azure Defender for Cloud (optional - secure score, assessments, compliance, attack paths)
  try {
    registerAzureDefenderTools(safe("Azure Defender"));
  } catch (error) {
    console.error("⚠️  Azure Defender skipped:", (error as Error).message);
  }

  // Entra ID (optional - app registration audit, secret and certificate expiry)
  try {
    registerEntraIdTools(safe("Entra ID"));
  } catch (error) {
    console.error("⚠️  Entra ID skipped:", (error as Error).message);
  }

  // Message Center (optional - M365 service health, issues, incident reports, Message Center posts)
  try {
    registerMessageCenterTools(safe("Message Center"));
  } catch (error) {
    console.error("⚠️  Message Center skipped:", (error as Error).message);
  }

  // Teams (optional - for release announcements)
  try {
    registerTeamsTools(safe("Teams"));
  } catch (error) {
    console.error("⚠️  Teams skipped:", (error as Error).message);
  }

  // Azure DevOps Admin (optional - pipeline management, environments, service connections)
  try {
    registerAzureDevOpsAdminTools(safe("Azure DevOps Admin"));
  } catch (error) {
    console.error("⚠️  Azure DevOps Admin skipped:", (error as Error).message);
  }

  // Azure Storage (optional - blobs, queues, tables, file shares)
  try {
    registerAzureStorageTools(safe("Azure Storage"));
  } catch (error) {
    console.error("⚠️  Azure Storage skipped:", (error as Error).message);
  }

  // REST API (optional - generic HTTP requests with auth)
  try {
    registerRestApiTools(safe("REST API"));
  } catch (error) {
    console.error("⚠️  REST API skipped:", (error as Error).message);
  }

  // 1Password (optional - vault and item management)
  try {
    registerOnePasswordTools(safe("1Password"));
  } catch (error) {
    console.error("⚠️  1Password skipped:", (error as Error).message);
  }

  // Microsoft Fabric (optional - workspaces, capacities, items, shortcuts, domains)
  try {
    registerFabricTools(safe("Microsoft Fabric"));
  } catch (error) {
    console.error("⚠️  Microsoft Fabric skipped:", (error as Error).message);
  }

  for (const line of formatDuplicates(duplicates)) console.error(line);

  console.error("All tools registered successfully!");
  console.error("Total integrations: 21 services");
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
