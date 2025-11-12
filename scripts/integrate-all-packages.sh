#!/bin/bash

# Master integration script for all remaining packages
# Integrates extracted tool registrations with proper imports and service initialization

set -e

echo "========================================="
echo "Integrating all package tools"
echo "========================================="

# Application Insights
echo "Integrating Application Insights tools..."
cat > packages/application-insights/src/index.new.ts << 'ENDOFFILE'
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { ApplicationInsightsService } from "./ApplicationInsightsService.js";
import type { ApplicationInsightsConfig } from "./ApplicationInsightsService.js";
import { z } from 'zod';
import { formatTableAsMarkdown, analyzeExceptions, analyzePerformance, analyzeDependencies } from './utils/appinsights-formatters.js';

export function registerApplicationInsightsTools(server: any, applicationinsightsService?: ApplicationInsightsService) {
  let service: ApplicationInsightsService | null = applicationinsightsService || null;

  function getApplicationInsightsService(): ApplicationInsightsService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.APPINSIGHTS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.APPINSIGHTS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse APPINSIGHTS_RESOURCES JSON");
        }
      } else if (process.env.APPINSIGHTS_APP_ID) {
        resources = [{
          id: 'default',
          name: 'Default Application Insights',
          appId: process.env.APPINSIGHTS_APP_ID,
          active: true,
        }];
      } else {
        missingConfig.push("APPINSIGHTS_RESOURCES or APPINSIGHTS_APP_ID");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Application Insights configuration: ${missingConfig.join(", ")}`);
      }

      const config: ApplicationInsightsConfig = {
        resources,
        authMethod: (process.env.APPINSIGHTS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
        tenantId: process.env.APPINSIGHTS_TENANT_ID || '',
        clientId: process.env.APPINSIGHTS_CLIENT_ID || '',
        clientSecret: process.env.APPINSIGHTS_CLIENT_SECRET || '',
      };

      service = new ApplicationInsightsService(config);
      console.error("Application Insights service initialized");
    }
    return service;
  }

ENDOFFILE

cat tmp/register-application-insights-tools-complete.ts >> packages/application-insights/src/index.new.ts

cat >> packages/application-insights/src/index.new.ts << 'ENDOFFILE'

  console.error("Application Insights tools registered: 10 tools, 5 prompts");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-application-insights",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerApplicationInsightsTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Application Insights MCP server:", error);
    process.exit(1);
  });
  console.error("Application Insights MCP server running");
}
ENDOFFILE

mv packages/application-insights/src/index.ts packages/application-insights/src/index.ts.old-integration
mv packages/application-insights/src/index.new.ts packages/application-insights/src/index.ts
echo "✅ Application Insights integrated"

# Log Analytics
echo "Integrating Log Analytics tools..."
cat > packages/log-analytics/src/index.new.ts << 'ENDOFFILE'
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { LogAnalyticsService } from "./LogAnalyticsService.js";
import type { LogAnalyticsConfig } from "./LogAnalyticsService.js";
import { z } from 'zod';
import { formatTableAsMarkdown, formatTableAsCSV, analyzeLogs, analyzeFunctionLogs, analyzeFunctionErrors, analyzeFunctionStats, generateRecommendations } from './utils/loganalytics-formatters.js';

export function registerLogAnalyticsTools(server: any, loganalyticsService?: LogAnalyticsService) {
  let service: LogAnalyticsService | null = loganalyticsService || null;

  function getLogAnalyticsService(): LogAnalyticsService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.LOGANALYTICS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse LOGANALYTICS_RESOURCES JSON");
        }
      } else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
        resources = [{
          id: 'default',
          name: 'Default Workspace',
          workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
          active: true,
        }];
      } else {
        missingConfig.push("LOGANALYTICS_RESOURCES or LOGANALYTICS_WORKSPACE_ID");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Log Analytics configuration: ${missingConfig.join(", ")}`);
      }

      const config: LogAnalyticsConfig = {
        resources,
        authMethod: (process.env.LOGANALYTICS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
        tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
        clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
        clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
      };

      service = new LogAnalyticsService(config);
      console.error("Log Analytics service initialized");
    }
    return service;
  }

ENDOFFILE

cat tmp/register-log-analytics-tools-complete.ts >> packages/log-analytics/src/index.new.ts

cat >> packages/log-analytics/src/index.new.ts << 'ENDOFFILE'

  console.error("Log Analytics tools registered: 10 tools, 4 prompts");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-log-analytics",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerLogAnalyticsTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Log Analytics MCP server:", error);
    process.exit(1);
  });
  console.error("Log Analytics MCP server running");
}
ENDOFFILE

mv packages/log-analytics/src/index.ts packages/log-analytics/src/index.ts.old-integration
mv packages/log-analytics/src/index.new.ts packages/log-analytics/src/index.ts
echo "✅ Log Analytics integrated"

# Azure SQL
echo "Integrating Azure SQL tools..."
cat > packages/azure-sql/src/index.new.ts << 'ENDOFFILE'
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { AzureSqlService } from "./AzureSqlService.js";
import type { AzureSqlConfig } from "./AzureSqlService.js";
import { z } from 'zod';
import { formatSqlResultsAsMarkdown, formatTableList, formatViewList, formatProcedureList, formatTableSchemaAsMarkdown, formatDatabaseOverview } from './utils/sql-formatters.js';

export function registerAzureSqlTools(server: any, azuresqlService?: AzureSqlService) {
  let service: AzureSqlService | null = azuresqlService || null;

  function getAzureSqlService(): AzureSqlService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.AZURE_SQL_SERVERS) {
        try {
          resources = JSON.parse(process.env.AZURE_SQL_SERVERS);
        } catch (error) {
          throw new Error("Failed to parse AZURE_SQL_SERVERS JSON");
        }
      } else if (process.env.AZURE_SQL_SERVER && process.env.AZURE_SQL_DATABASE) {
        resources = [{
          id: 'default',
          name: 'Default SQL Server',
          server: process.env.AZURE_SQL_SERVER,
          port: parseInt(process.env.AZURE_SQL_PORT || "1433"),
          active: true,
          databases: [{
            name: process.env.AZURE_SQL_DATABASE,
            active: true,
          }],
          username: process.env.AZURE_SQL_USERNAME || '',
          password: process.env.AZURE_SQL_PASSWORD || '',
        }];
      } else {
        missingConfig.push("AZURE_SQL_SERVERS or AZURE_SQL_SERVER/AZURE_SQL_DATABASE");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure SQL configuration: ${missingConfig.join(", ")}`);
      }

      const config: AzureSqlConfig = {
        resources,
        queryTimeout: parseInt(process.env.AZURE_SQL_QUERY_TIMEOUT || "30000"),
        maxResultRows: parseInt(process.env.AZURE_SQL_MAX_RESULT_ROWS || "1000"),
      };

      service = new AzureSqlService(config);
      console.error("Azure SQL service initialized");
    }
    return service;
  }

ENDOFFILE

cat tmp/register-azure-sql-tools-complete.ts >> packages/azure-sql/src/index.new.ts

cat >> packages/azure-sql/src/index.new.ts << 'ENDOFFILE'

  console.error("Azure SQL tools registered: 11 tools, 3 prompts");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-azure-sql",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerAzureSqlTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Azure SQL MCP server:", error);
    process.exit(1);
  });
  console.error("Azure SQL MCP server running");
}
ENDOFFILE

mv packages/azure-sql/src/index.ts packages/azure-sql/src/index.ts.old-integration
mv packages/azure-sql/src/index.new.ts packages/azure-sql/src/index.ts
echo "✅ Azure SQL integrated"

# Service Bus
echo "Integrating Service Bus tools..."
cat > packages/service-bus/src/index.new.ts << 'ENDOFFILE'
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { ServiceBusService } from "./ServiceBusService.js";
import type { ServiceBusConfig } from "./ServiceBusService.js";
import { z } from 'zod';
import { formatQueueListAsMarkdown, formatMessagesAsMarkdown, analyzeDeadLetterMessages, formatDeadLetterAnalysisAsMarkdown, generateServiceBusTroubleshootingGuide } from './utils/servicebus-formatters.js';

export function registerServiceBusTools(server: any, servicebusService?: ServiceBusService) {
  let service: ServiceBusService | null = servicebusService || null;

  function getServiceBusService(): ServiceBusService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.SERVICEBUS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse SERVICEBUS_RESOURCES JSON");
        }
      } else if (process.env.SERVICEBUS_NAMESPACE) {
        resources = [{
          id: 'default',
          name: 'Default Service Bus',
          namespace: process.env.SERVICEBUS_NAMESPACE,
          active: true,
          connectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
        }];
      } else {
        missingConfig.push("SERVICEBUS_RESOURCES or SERVICEBUS_NAMESPACE");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Service Bus configuration: ${missingConfig.join(", ")}`);
      }

      const config: ServiceBusConfig = {
        resources,
        authMethod: (process.env.SERVICEBUS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'connection-string',
        tenantId: process.env.SERVICEBUS_TENANT_ID || '',
        clientId: process.env.SERVICEBUS_CLIENT_ID || '',
        clientSecret: process.env.SERVICEBUS_CLIENT_SECRET || '',
      };

      service = new ServiceBusService(config);
      console.error("Service Bus service initialized");
    }
    return service;
  }

ENDOFFILE

cat tmp/register-service-bus-tools-complete.ts >> packages/service-bus/src/index.new.ts

cat >> packages/service-bus/src/index.new.ts << 'ENDOFFILE'

  console.error("Service Bus tools registered: 8 tools, 4 prompts");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-service-bus",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerServiceBusTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Service Bus MCP server:", error);
    process.exit(1);
  });
  console.error("Service Bus MCP server running");
}
ENDOFFILE

mv packages/service-bus/src/index.ts packages/service-bus/src/index.ts.old-integration
mv packages/service-bus/src/index.new.ts packages/service-bus/src/index.ts
echo "✅ Service Bus integrated"

# SharePoint
echo "Integrating SharePoint tools..."
cat > packages/sharepoint/src/index.new.ts << 'ENDOFFILE'
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { SharePointService } from "./SharePointService.js";
import type { SharePointConfig } from "./SharePointService.js";
import { z } from 'zod';
import { formatSitesAsMarkdown, formatLibrariesAsMarkdown, formatSearchResultsAsMarkdown } from './utils/sharepoint-formatters.js';

export function registerSharePointTools(server: any, sharepointService?: SharePointService) {
  let service: SharePointService | null = sharepointService || null;

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
        resources,
        tenantId: process.env.SHAREPOINT_TENANT_ID!,
        clientId: process.env.SHAREPOINT_CLIENT_ID!,
        clientSecret: process.env.SHAREPOINT_CLIENT_SECRET!,
      };

      service = new SharePointService(config);
      console.error("SharePoint service initialized");
    }
    return service;
  }

ENDOFFILE

cat tmp/register-sharepoint-tools-complete.ts >> packages/sharepoint/src/index.new.ts

cat >> packages/sharepoint/src/index.new.ts << 'ENDOFFILE'

  console.error("SharePoint tools registered: 15 tools, 10 prompts");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-sharepoint",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerSharePointTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start SharePoint MCP server:", error);
    process.exit(1);
  });
  console.error("SharePoint MCP server running");
}
ENDOFFILE

mv packages/sharepoint/src/index.ts packages/sharepoint/src/index.ts.old-integration
mv packages/sharepoint/src/index.new.ts packages/sharepoint/src/index.ts
echo "✅ SharePoint integrated"

# GitHub Enterprise
echo "Integrating GitHub Enterprise tools..."
cat > packages/github-enterprise/src/index.new.ts << 'ENDOFFILE'
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { GitHubEnterpriseService } from "./GitHubEnterpriseService.js";
import type { GitHubEnterpriseConfig } from "./GitHubEnterpriseService.js";
import { z } from 'zod';
import { formatBranchListAsMarkdown, formatCommitHistoryAsMarkdown, formatCodeSearchResultsAsMarkdown } from './utils/ghe-formatters.js';

export function registerGitHubEnterpriseTools(server: any, githubenterpriseService?: GitHubEnterpriseService) {
  let service: GitHubEnterpriseService | null = githubenterpriseService || null;

  function getGitHubEnterpriseService(): GitHubEnterpriseService {
    if (!service) {
      const missingConfig: string[] = [];
      let repos: any[] = [];

      if (process.env.GHE_REPOS) {
        try {
          repos = JSON.parse(process.env.GHE_REPOS);
        } catch (error) {
          throw new Error("Failed to parse GHE_REPOS JSON");
        }
      } else {
        missingConfig.push("GHE_REPOS");
      }

      if (!process.env.GHE_TOKEN) missingConfig.push("GHE_TOKEN");

      if (missingConfig.length > 0) {
        throw new Error(`Missing GitHub Enterprise configuration: ${missingConfig.join(", ")}`);
      }

      const config: GitHubEnterpriseConfig = {
        repos,
        token: process.env.GHE_TOKEN!,
        enableCache: process.env.GHE_ENABLE_CACHE !== 'false',
        cacheTTL: parseInt(process.env.GHE_CACHE_TTL || '300'),
      };

      service = new GitHubEnterpriseService(config);
      console.error("GitHub Enterprise service initialized");
    }
    return service;
  }

ENDOFFILE

cat tmp/register-github-enterprise-tools-complete.ts >> packages/github-enterprise/src/index.new.ts

cat >> packages/github-enterprise/src/index.new.ts << 'ENDOFFILE'

  console.error("GitHub Enterprise tools registered: 22 tools, 5 prompts");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-github-enterprise",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerGitHubEnterpriseTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start GitHub Enterprise MCP server:", error);
    process.exit(1);
  });
  console.error("GitHub Enterprise MCP server running");
}
ENDOFFILE

mv packages/github-enterprise/src/index.ts packages/github-enterprise/src/index.ts.old-integration
mv packages/github-enterprise/src/index.new.ts packages/github-enterprise/src/index.ts
echo "✅ GitHub Enterprise integrated"

echo ""
echo "========================================="
echo "✅ All packages integrated successfully!"
echo "========================================="
echo "PowerPlatform: 81 tools, 10 prompts"
echo "Application Insights: 10 tools, 5 prompts"
echo "Log Analytics: 10 tools, 4 prompts"
echo "Azure SQL: 11 tools, 3 prompts"
echo "Service Bus: 8 tools, 4 prompts"
echo "SharePoint: 15 tools, 10 prompts"
echo "GitHub Enterprise: 22 tools, 5 prompts"
echo "========================================="
echo "Total: 157 tools, 41 prompts integrated"
echo "(Azure DevOps: 13 tools, 4 prompts already integrated)"
echo "(Figma: 2 tools, 0 prompts already complete)"
echo "Grand Total: 172 tools, 45 prompts"
echo "========================================="
