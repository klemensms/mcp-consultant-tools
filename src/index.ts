#!/usr/bin/env node
/**
 * MCP Consultant Tools - Main Entry Point
 *
 * This is the main MCP server that includes all integrations.
 * For individual packages, use @mcp-consultant-tools/{package-name}.
 *
 * Integrations:
 * - PowerPlatform (metadata, plugins, workflows, business rules, CRUD)
 * - Azure DevOps (wikis, work items)
 * - Figma (design data extraction)
 * - Application Insights (telemetry, exceptions, performance)
 * - Log Analytics (logs, Azure Functions troubleshooting)
 * - Azure SQL Database (schema, queries)
 * - Service Bus (queue monitoring, dead letter analysis)
 * - SharePoint Online (sites, document libraries, PowerPlatform validation)
 * - GitHub Enterprise (repositories, commits, PRs, code search)
 *
 * Total: 172 tools + 47 prompts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config as dotenvConfig } from "dotenv";

// Import register functions from packages (relative paths during development)
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

// Load environment variables
// Suppress stdout during dotenv to prevent MCP protocol corruption
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (() => true) as any;
dotenvConfig({ debug: false });
process.stdout.write = originalStdoutWrite;

/**
 * Create and configure the MCP server
 */
const server = new Server(
  {
    name: "mcp-consultant-tools",
    version: "15.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// Register all tools from each integration
console.error("Registering MCP Consultant Tools...");

try {
  registerPowerPlatformTools(server);
  console.error("✅ PowerPlatform tools registered (read-only)");
} catch (error) {
  console.error("⚠️  PowerPlatform registration skipped:", (error as Error).message);
}

// PowerPlatform Customization (optional - schema changes)
try {
  registerPowerplatformCustomizationTools(server);
  console.error("✅ PowerPlatform Customization tools registered");
} catch (error) {
  console.error("⚠️  PowerPlatform Customization registration skipped:", (error as Error).message);
}

// PowerPlatform Data (optional - CRUD operations)
try {
  registerPowerplatformDataTools(server);
  console.error("✅ PowerPlatform Data tools registered");
} catch (error) {
  console.error("⚠️  PowerPlatform Data registration skipped:", (error as Error).message);
}
} catch (error) {
  console.error("⚠️  PowerPlatform registration skipped:", (error as Error).message);
}

try {
  registerAzureDevOpsTools(server);
  console.error("✅ Azure DevOps tools registered");
} catch (error) {
  console.error("⚠️  Azure DevOps registration skipped:", (error as Error).message);
}

try {
  registerFigmaTools(server);
  console.error("✅ Figma tools registered");
} catch (error) {
  console.error("⚠️  Figma registration skipped:", (error as Error).message);
}

try {
  registerApplicationInsightsTools(server);
  console.error("✅ Application Insights tools registered");
} catch (error) {
  console.error("⚠️  Application Insights registration skipped:", (error as Error).message);
}

try {
  registerLogAnalyticsTools(server);
  console.error("✅ Log Analytics tools registered");
} catch (error) {
  console.error("⚠️  Log Analytics registration skipped:", (error as Error).message);
}

try {
  registerAzureSqlTools(server);
  console.error("✅ Azure SQL tools registered");
} catch (error) {
  console.error("⚠️  Azure SQL registration skipped:", (error as Error).message);
}

try {
  registerServiceBusTools(server);
  console.error("✅ Service Bus tools registered");
} catch (error) {
  console.error("⚠️  Service Bus registration skipped:", (error as Error).message);
}

try {
  registerSharePointTools(server);
  console.error("✅ SharePoint tools registered");
} catch (error) {
  console.error("⚠️  SharePoint registration skipped:", (error as Error).message);
}

try {
  registerGitHubEnterpriseTools(server);
  console.error("✅ GitHub Enterprise tools registered");
} catch (error) {
  console.error("⚠️  GitHub Enterprise registration skipped:", (error as Error).message);
}

console.error("All integrations loaded!");
console.error("MCP Consultant Tools: 10 services | 172 tools | 47 prompts");

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Consultant Tools server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
