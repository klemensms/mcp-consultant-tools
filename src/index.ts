#!/usr/bin/env node
import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PowerPlatformService, PowerPlatformConfig } from "./PowerPlatformService.js";
import { AzureDevOpsService, AzureDevOpsConfig } from "./AzureDevOpsService.js";
import { FigmaService, type FigmaConfig } from "./FigmaService.js";
import { ApplicationInsightsService, ApplicationInsightsConfig, ApplicationInsightsResourceConfig } from "./ApplicationInsightsService.js";
import { LogAnalyticsService, LogAnalyticsConfig, LogAnalyticsResourceConfig } from "./LogAnalyticsService.js";
import { AzureSqlService, type AzureSqlConfig } from "./AzureSqlService.js";
import { GitHubEnterpriseService, type GitHubEnterpriseConfig, type GitHubRepoConfig } from "./GitHubEnterpriseService.js";
import { ServiceBusService, type ServiceBusConfig } from "./ServiceBusService.js";
import type { ServiceBusReceivedMessage } from "@azure/service-bus";
import { SharePointService, type SharePointConfig, type SharePointSiteConfig } from "./SharePointService.js";
import { formatTableAsMarkdown, analyzeExceptions, analyzePerformance, analyzeDependencies } from "./utils/appinsights-formatters.js";
import {
  formatTableAsMarkdown as formatLATableAsMarkdown,
  analyzeLogs,
  analyzeFunctionLogs,
  analyzeFunctionErrors,
  analyzeFunctionStats,
  generateRecommendations,
} from "./utils/loganalytics-formatters.js";
import * as spoFormatters from './utils/sharepoint-formatters.js';
import {
  formatSqlResultsAsMarkdown,
  formatTableList,
  formatViewList,
  formatProcedureList,
  formatTriggerList,
  formatFunctionList,
  formatTableSchemaAsMarkdown,
  formatDatabaseOverview,
} from "./utils/sql-formatters.js";
import {
  formatBranchListAsMarkdown,
  formatCommitHistoryAsMarkdown,
  formatCodeSearchResultsAsMarkdown,
  formatPullRequestsAsMarkdown,
  formatFileTreeAsMarkdown,
  formatDirectoryContentsAsMarkdown,
  analyzeBranchComparison,
  generateDeploymentChecklist,
  formatCommitDetailsAsMarkdown,
  formatPullRequestDetailsAsMarkdown,
  formatRepositoryOverviewAsMarkdown,
} from "./utils/ghe-formatters.js";
import {
  formatQueueListAsMarkdown,
  formatMessagesAsMarkdown,
  formatMessageBody,
  formatMessageInspectionAsMarkdown,
  analyzeDeadLetterMessages,
  formatDeadLetterAnalysisAsMarkdown,
  formatNamespaceOverviewAsMarkdown,
  getQueueHealthStatus,
  detectMessageFormat,
  generateServiceBusTroubleshootingGuide,
  generateCrossServiceReport,
} from "./utils/servicebus-formatters.js";

// Load environment variables from .env file (silent mode to not interfere with MCP)
// Temporarily suppress stdout to prevent dotenv from corrupting the JSON protocol
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (() => true) as any;
config({ debug: false });
process.stdout.write = originalStdoutWrite;

// Environment configuration
// These values can be set in environment variables or loaded from a configuration file
const POWERPLATFORM_CONFIG: PowerPlatformConfig = {
  organizationUrl: process.env.POWERPLATFORM_URL || "",
  clientId: process.env.POWERPLATFORM_CLIENT_ID || "",
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET || "",
  tenantId: process.env.POWERPLATFORM_TENANT_ID || "",
};

// PowerPlatform Customization Feature Flags (metadata operations)
const POWERPLATFORM_CUSTOMIZATION_ENABLED = process.env.POWERPLATFORM_ENABLE_CUSTOMIZATION === "true";
const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

// PowerPlatform Data CRUD Feature Flags (data operations)
// CRITICAL SECURITY: These MUST default to false if not explicitly set to "true"
// This prevents accidental data modifications in production environments
// Only explicit "true" string enables the operation - all other values (undefined, "false", "1", etc.) = disabled
const POWERPLATFORM_CREATE_ENABLED = process.env.POWERPLATFORM_ENABLE_CREATE === "true";
const POWERPLATFORM_UPDATE_ENABLED = process.env.POWERPLATFORM_ENABLE_UPDATE === "true";
const POWERPLATFORM_DELETE_ENABLED = process.env.POWERPLATFORM_ENABLE_DELETE === "true";

// Log CRUD permission state on startup (helps prevent accidental production modifications)
console.error('PowerPlatform CRUD Permissions:', {
  create: POWERPLATFORM_CREATE_ENABLED,
  update: POWERPLATFORM_UPDATE_ENABLED,
  delete: POWERPLATFORM_DELETE_ENABLED,
  warning: (!POWERPLATFORM_CREATE_ENABLED && !POWERPLATFORM_UPDATE_ENABLED && !POWERPLATFORM_DELETE_ENABLED)
    ? 'All CRUD operations disabled (safe mode)'
    : '⚠️  CRUD operations enabled - ensure this is intended for this environment'
});

// Azure DevOps configuration
const AZUREDEVOPS_CONFIG: AzureDevOpsConfig = {
  organization: process.env.AZUREDEVOPS_ORGANIZATION || "",
  pat: process.env.AZUREDEVOPS_PAT || "",
  projects: (process.env.AZUREDEVOPS_PROJECTS || "").split(",").map(p => p.trim()).filter(p => p),
  apiVersion: process.env.AZUREDEVOPS_API_VERSION || "7.1",
  enableWorkItemWrite: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE === "true",
  enableWorkItemDelete: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE === "true",
  enableWikiWrite: process.env.AZUREDEVOPS_ENABLE_WIKI_WRITE === "true",
};

// Figma configuration
const FIGMA_CONFIG: FigmaConfig = {
  apiKey: process.env.FIGMA_API_KEY || "",
  oauthToken: process.env.FIGMA_OAUTH_TOKEN || "",
  useOAuth: process.env.FIGMA_USE_OAUTH === "true",
};

// Application Insights configuration
const APPINSIGHTS_CONFIG: ApplicationInsightsConfig = {
  resources: [],
  authMethod: (process.env.APPINSIGHTS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
  tenantId: process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.APPINSIGHTS_CLIENT_SECRET || '',
};

// Parse resources configuration
if (process.env.APPINSIGHTS_RESOURCES) {
  try {
    APPINSIGHTS_CONFIG.resources = JSON.parse(process.env.APPINSIGHTS_RESOURCES);
  } catch (error) {
    console.error('Failed to parse APPINSIGHTS_RESOURCES:', error);
  }
} else if (process.env.APPINSIGHTS_APP_ID) {
  // Fallback: single resource configuration
  APPINSIGHTS_CONFIG.resources = [
    {
      id: 'default',
      name: 'Default Application Insights',
      appId: process.env.APPINSIGHTS_APP_ID,
      active: true,
      apiKey: process.env.APPINSIGHTS_API_KEY || '',
      description: 'Default Application Insights resource',
    },
  ];
}

// Azure SQL Database configuration
const AZURE_SQL_CONFIG: AzureSqlConfig = {
  server: process.env.AZURE_SQL_SERVER || "",
  database: process.env.AZURE_SQL_DATABASE || "",
  port: parseInt(process.env.AZURE_SQL_PORT || "1433"),

  username: process.env.AZURE_SQL_USERNAME || "",
  password: process.env.AZURE_SQL_PASSWORD || "",

  useAzureAd: process.env.AZURE_SQL_USE_AZURE_AD === "true",
  clientId: process.env.AZURE_SQL_CLIENT_ID || "",
  clientSecret: process.env.AZURE_SQL_CLIENT_SECRET || "",
  tenantId: process.env.AZURE_SQL_TENANT_ID || "",

  queryTimeout: parseInt(process.env.AZURE_SQL_QUERY_TIMEOUT || "30000"),
  maxResultRows: parseInt(process.env.AZURE_SQL_MAX_RESULT_ROWS || "1000"),
  connectionTimeout: parseInt(process.env.AZURE_SQL_CONNECTION_TIMEOUT || "15000"),

  poolMin: parseInt(process.env.AZURE_SQL_POOL_MIN || "0"),
  poolMax: parseInt(process.env.AZURE_SQL_POOL_MAX || "10"),
};

// Log Analytics configuration
const LOGANALYTICS_CONFIG: LogAnalyticsConfig = {
  resources: [],
  authMethod: (process.env.LOGANALYTICS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
  tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
};

// Parse Log Analytics resources configuration
if (process.env.LOGANALYTICS_RESOURCES) {
  try {
    LOGANALYTICS_CONFIG.resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
  } catch (error) {
    console.error('Failed to parse LOGANALYTICS_RESOURCES:', error);
  }
} else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
  // Fallback: single workspace configuration
  LOGANALYTICS_CONFIG.resources = [
    {
      id: 'default',
      name: 'Default Log Analytics Workspace',
      workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
      active: true,
      apiKey: process.env.LOGANALYTICS_API_KEY || '',
      description: 'Default Log Analytics workspace',
    },
  ];
}

// GitHub Enterprise configuration
const GHE_CONFIG: GitHubEnterpriseConfig = {
  baseUrl: process.env.GHE_URL || '',
  apiVersion: process.env.GHE_API_VERSION || '2022-11-28',
  authMethod: (process.env.GHE_AUTH_METHOD || 'pat') as 'pat' | 'github-app',
  pat: process.env.GHE_PAT || '',
  appId: process.env.GHE_APP_ID || '',
  appPrivateKey: process.env.GHE_APP_PRIVATE_KEY || '',
  appInstallationId: process.env.GHE_APP_INSTALLATION_ID || '',
  repos: [],
  enableWrite: process.env.GHE_ENABLE_WRITE === 'true',
  enableCreate: process.env.GHE_ENABLE_CREATE === 'true',
  enableCache: process.env.GHE_ENABLE_CACHE === 'true',
  cacheTtl: parseInt(process.env.GHE_CACHE_TTL || '300'),
  maxFileSize: parseInt(process.env.GHE_MAX_FILE_SIZE || '1048576'),
  maxSearchResults: parseInt(process.env.GHE_MAX_SEARCH_RESULTS || '100'),
};

// Parse GitHub Enterprise repos configuration
if (process.env.GHE_REPOS) {
  try {
    GHE_CONFIG.repos = JSON.parse(process.env.GHE_REPOS);
  } catch (error) {
    console.error('Failed to parse GHE_REPOS:', error);
  }
}

// Azure Service Bus configuration
const SERVICEBUS_CONFIG: ServiceBusConfig = {
  resources: [],
  authMethod: (process.env.SERVICEBUS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'connection-string',
  tenantId: process.env.SERVICEBUS_TENANT_ID || '',
  clientId: process.env.SERVICEBUS_CLIENT_ID || '',
  clientSecret: process.env.SERVICEBUS_CLIENT_SECRET || '',
  sanitizeMessages: process.env.SERVICEBUS_SANITIZE_MESSAGES === 'true',
  maxPeekMessages: parseInt(process.env.SERVICEBUS_MAX_PEEK_MESSAGES || '100'),
  maxSearchMessages: parseInt(process.env.SERVICEBUS_MAX_SEARCH_MESSAGES || '500'),
  peekTimeout: parseInt(process.env.SERVICEBUS_PEEK_TIMEOUT || '30000'),
  retryMaxAttempts: parseInt(process.env.SERVICEBUS_RETRY_MAX_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.SERVICEBUS_RETRY_DELAY || '1000'),
  cacheQueueListTTL: parseInt(process.env.SERVICEBUS_CACHE_QUEUE_LIST_TTL || '300'),
};

// Parse Service Bus resources configuration
if (process.env.SERVICEBUS_RESOURCES) {
  try {
    SERVICEBUS_CONFIG.resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
  } catch (error) {
    console.error('Failed to parse SERVICEBUS_RESOURCES:', error);
  }
} else if (process.env.SERVICEBUS_NAMESPACE) {
  // Fallback: single namespace configuration
  SERVICEBUS_CONFIG.resources = [
    {
      id: 'default',
      name: 'Default Service Bus',
      namespace: process.env.SERVICEBUS_NAMESPACE,
      active: true,
      connectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
      description: 'Default Service Bus namespace',
    },
  ];
}

// SharePoint Online configuration
const SHAREPOINT_CONFIG: SharePointConfig = {
  sites: [],
  authMethod: 'entra-id',  // Graph API only supports Entra ID
  tenantId: process.env.SHAREPOINT_TENANT_ID || '',
  clientId: process.env.SHAREPOINT_CLIENT_ID || '',
  clientSecret: process.env.SHAREPOINT_CLIENT_SECRET || '',
  cacheTTL: parseInt(process.env.SHAREPOINT_CACHE_TTL || '300'),
  maxSearchResults: parseInt(process.env.SHAREPOINT_MAX_SEARCH_RESULTS || '100'),
};

// Parse SharePoint sites configuration
if (process.env.SHAREPOINT_SITES) {
  try {
    SHAREPOINT_CONFIG.sites = JSON.parse(process.env.SHAREPOINT_SITES);
  } catch (error) {
    console.error('Failed to parse SHAREPOINT_SITES:', error);
  }
} else if (process.env.SHAREPOINT_SITE_URL) {
  // Fallback: single site configuration
  SHAREPOINT_CONFIG.sites = [
    {
      id: 'default',
      name: 'Default SharePoint Site',
      siteUrl: process.env.SHAREPOINT_SITE_URL,
      active: true,
      description: 'Default SharePoint site',
    },
  ];
}

// Create server instance
const server = new McpServer({
  name: "mcp-consultant-tools",
  version: "1.0.0",
});

let powerPlatformService: PowerPlatformService | null = null;

// Function to initialize PowerPlatformService on demand
function getPowerPlatformService(): PowerPlatformService {
  if (!powerPlatformService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];
    if (!POWERPLATFORM_CONFIG.organizationUrl) missingConfig.push("organizationUrl");
    if (!POWERPLATFORM_CONFIG.clientId) missingConfig.push("clientId");
    if (!POWERPLATFORM_CONFIG.clientSecret) missingConfig.push("clientSecret");
    if (!POWERPLATFORM_CONFIG.tenantId) missingConfig.push("tenantId");

    if (missingConfig.length > 0) {
      throw new Error(`Missing PowerPlatform configuration: ${missingConfig.join(", ")}. Set these in environment variables.`);
    }

    // Initialize service
    powerPlatformService = new PowerPlatformService(POWERPLATFORM_CONFIG);
    console.error("PowerPlatform service initialized");
  }

  return powerPlatformService;
}

let azureDevOpsService: AzureDevOpsService | null = null;

// Function to initialize AzureDevOpsService on demand
function getAzureDevOpsService(): AzureDevOpsService {
  if (!azureDevOpsService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];
    if (!AZUREDEVOPS_CONFIG.organization) missingConfig.push("organization");
    if (!AZUREDEVOPS_CONFIG.pat) missingConfig.push("pat");
    if (!AZUREDEVOPS_CONFIG.projects || AZUREDEVOPS_CONFIG.projects.length === 0) {
      missingConfig.push("projects");
    }

    if (missingConfig.length > 0) {
      throw new Error(`Missing Azure DevOps configuration: ${missingConfig.join(", ")}. Set these in environment variables (AZUREDEVOPS_*).`);
    }

    // Initialize service
    azureDevOpsService = new AzureDevOpsService(AZUREDEVOPS_CONFIG);
    console.error("Azure DevOps service initialized");
  }

  return azureDevOpsService;
}

let figmaService: FigmaService | null = null;

// Function to initialize FigmaService on demand
function getFigmaService(): FigmaService {
  if (!figmaService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];

    if (!FIGMA_CONFIG.apiKey && !FIGMA_CONFIG.oauthToken) {
      missingConfig.push("FIGMA_API_KEY or FIGMA_OAUTH_TOKEN");
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing required Figma configuration: ${missingConfig.join(", ")}. ` +
        `Please set these in your .env file or environment variables.`
      );
    }

    // Initialize service
    figmaService = new FigmaService(FIGMA_CONFIG);
    console.error("Figma service initialized");
  }

  return figmaService;
}

let applicationInsightsService: ApplicationInsightsService | null = null;

// Function to initialize ApplicationInsightsService on demand
function getApplicationInsightsService(): ApplicationInsightsService {
  if (!applicationInsightsService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];

    if (!APPINSIGHTS_CONFIG.resources || APPINSIGHTS_CONFIG.resources.length === 0) {
      missingConfig.push('APPINSIGHTS_RESOURCES or APPINSIGHTS_APP_ID');
    }

    if (APPINSIGHTS_CONFIG.authMethod === 'entra-id') {
      if (!APPINSIGHTS_CONFIG.tenantId) missingConfig.push('APPINSIGHTS_TENANT_ID');
      if (!APPINSIGHTS_CONFIG.clientId) missingConfig.push('APPINSIGHTS_CLIENT_ID');
      if (!APPINSIGHTS_CONFIG.clientSecret) missingConfig.push('APPINSIGHTS_CLIENT_SECRET');
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing Application Insights configuration: ${missingConfig.join(', ')}. ` +
        `Set these in environment variables (APPINSIGHTS_*).`
      );
    }

    // Initialize service
    applicationInsightsService = new ApplicationInsightsService(APPINSIGHTS_CONFIG);
    console.error('Application Insights service initialized');
  }

  return applicationInsightsService;
}

let logAnalyticsService: LogAnalyticsService | null = null;

// Function to initialize LogAnalyticsService on demand
function getLogAnalyticsService(): LogAnalyticsService {
  if (!logAnalyticsService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];

    if (!LOGANALYTICS_CONFIG.resources || LOGANALYTICS_CONFIG.resources.length === 0) {
      missingConfig.push('LOGANALYTICS_RESOURCES or LOGANALYTICS_WORKSPACE_ID');
    }

    if (LOGANALYTICS_CONFIG.authMethod === 'entra-id') {
      if (!LOGANALYTICS_CONFIG.tenantId) missingConfig.push('LOGANALYTICS_TENANT_ID or APPINSIGHTS_TENANT_ID');
      if (!LOGANALYTICS_CONFIG.clientId) missingConfig.push('LOGANALYTICS_CLIENT_ID or APPINSIGHTS_CLIENT_ID');
      if (!LOGANALYTICS_CONFIG.clientSecret) missingConfig.push('LOGANALYTICS_CLIENT_SECRET or APPINSIGHTS_CLIENT_SECRET');
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing Log Analytics configuration: ${missingConfig.join(', ')}. ` +
        `Set these in environment variables (LOGANALYTICS_* or reuse APPINSIGHTS_* credentials).`
      );
    }

    // Initialize service
    logAnalyticsService = new LogAnalyticsService(LOGANALYTICS_CONFIG);
    console.error('Log Analytics service initialized');
  }

  return logAnalyticsService;
}

let azureSqlService: AzureSqlService | null = null;

// Function to initialize AzureSqlService on demand
function getAzureSqlService(): AzureSqlService {
  if (!azureSqlService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];
    if (!AZURE_SQL_CONFIG.server) missingConfig.push("server");
    if (!AZURE_SQL_CONFIG.database) missingConfig.push("database");

    if (!AZURE_SQL_CONFIG.useAzureAd) {
      // SQL Authentication requires username and password
      if (!AZURE_SQL_CONFIG.username) missingConfig.push("username");
      if (!AZURE_SQL_CONFIG.password) missingConfig.push("password");
    } else {
      // Azure AD requires service principal credentials
      if (!AZURE_SQL_CONFIG.clientId) missingConfig.push("clientId");
      if (!AZURE_SQL_CONFIG.clientSecret) missingConfig.push("clientSecret");
      if (!AZURE_SQL_CONFIG.tenantId) missingConfig.push("tenantId");
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing Azure SQL Database configuration: ${missingConfig.join(", ")}. ` +
        `Set these in environment variables (AZURE_SQL_*).`
      );
    }

    // Initialize service
    azureSqlService = new AzureSqlService(AZURE_SQL_CONFIG);
    console.error("Azure SQL Database service initialized");
  }

  return azureSqlService;
}

let githubEnterpriseService: GitHubEnterpriseService | null = null;

// Function to initialize GitHubEnterpriseService on demand
function getGitHubEnterpriseService(): GitHubEnterpriseService {
  if (!githubEnterpriseService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];

    if (!GHE_CONFIG.baseUrl) missingConfig.push('GHE_URL');

    if (GHE_CONFIG.authMethod === 'pat') {
      if (!GHE_CONFIG.pat) missingConfig.push('GHE_PAT');
    } else if (GHE_CONFIG.authMethod === 'github-app') {
      if (!GHE_CONFIG.appId) missingConfig.push('GHE_APP_ID');
      if (!GHE_CONFIG.appPrivateKey) missingConfig.push('GHE_APP_PRIVATE_KEY');
      if (!GHE_CONFIG.appInstallationId) missingConfig.push('GHE_APP_INSTALLATION_ID');
    }

    if (!GHE_CONFIG.repos || GHE_CONFIG.repos.length === 0) {
      missingConfig.push('GHE_REPOS');
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing GitHub Enterprise configuration: ${missingConfig.join(', ')}. ` +
        `Set these in environment variables (GHE_*).`
      );
    }

    // Initialize service
    githubEnterpriseService = new GitHubEnterpriseService(GHE_CONFIG);
    console.error('GitHub Enterprise service initialized');
  }

  return githubEnterpriseService;
}

let serviceBusService: ServiceBusService | null = null;

// Function to initialize ServiceBusService on demand
function getServiceBusService(): ServiceBusService {
  if (!serviceBusService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];

    if (!SERVICEBUS_CONFIG.resources || SERVICEBUS_CONFIG.resources.length === 0) {
      missingConfig.push('SERVICEBUS_RESOURCES or SERVICEBUS_NAMESPACE');
    }

    if (SERVICEBUS_CONFIG.authMethod === 'entra-id') {
      if (!SERVICEBUS_CONFIG.tenantId) missingConfig.push('SERVICEBUS_TENANT_ID');
      if (!SERVICEBUS_CONFIG.clientId) missingConfig.push('SERVICEBUS_CLIENT_ID');
      if (!SERVICEBUS_CONFIG.clientSecret) missingConfig.push('SERVICEBUS_CLIENT_SECRET');
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing Service Bus configuration: ${missingConfig.join(', ')}. ` +
        `Set these in environment variables (SERVICEBUS_*).`
      );
    }

    // Initialize service
    serviceBusService = new ServiceBusService(SERVICEBUS_CONFIG);
    console.error('Service Bus service initialized');
  }

  return serviceBusService;
}

let sharePointService: SharePointService | null = null;

// Function to initialize SharePointService on demand
function getSharePointService(): SharePointService {
  if (!sharePointService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];

    if (!SHAREPOINT_CONFIG.sites || SHAREPOINT_CONFIG.sites.length === 0) {
      missingConfig.push('SHAREPOINT_SITES or SHAREPOINT_SITE_URL');
    }

    if (!SHAREPOINT_CONFIG.tenantId) missingConfig.push('SHAREPOINT_TENANT_ID');
    if (!SHAREPOINT_CONFIG.clientId) missingConfig.push('SHAREPOINT_CLIENT_ID');
    if (!SHAREPOINT_CONFIG.clientSecret) missingConfig.push('SHAREPOINT_CLIENT_SECRET');

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing SharePoint configuration: ${missingConfig.join(', ')}. ` +
        `Set these in environment variables (SHAREPOINT_*).`
      );
    }

    // Initialize service
    sharePointService = new SharePointService(SHAREPOINT_CONFIG);
    console.error('SharePoint service initialized');
  }

  return sharePointService;
}

// Pre-defined PowerPlatform Prompts
const powerPlatformPrompts = {
  // Entity exploration prompts
  ENTITY_OVERVIEW: (entityName: string) => 
    `## Power Platform Entity: ${entityName}\n\n` +
    `This is an overview of the '${entityName}' entity in Microsoft Power Platform/Dataverse:\n\n` +
    `### Entity Details\n{{entity_details}}\n\n` +
    `### Attributes\n{{key_attributes}}\n\n` +
    `### Relationships\n{{relationships}}\n\n` +
    `You can query this entity using OData filters against the plural name.`,

  ATTRIBUTE_DETAILS: (entityName: string, attributeName: string) =>
    `## Attribute: ${attributeName}\n\n` +
    `Details for the '${attributeName}' attribute of the '${entityName}' entity:\n\n` +
    `{{attribute_details}}\n\n` +
    `### Usage Notes\n` +
    `- Data Type: {{data_type}}\n` +
    `- Required: {{required}}\n` +
    `- Max Length: {{max_length}}`,

  // Query builder prompts
  QUERY_TEMPLATE: (entityNamePlural: string) =>
    `## OData Query Template for ${entityNamePlural}\n\n` +
    `Use this template to build queries against the ${entityNamePlural} entity:\n\n` +
    `\`\`\`\n${entityNamePlural}?$select={{selected_fields}}&$filter={{filter_conditions}}&$orderby={{order_by}}&$top={{max_records}}\n\`\`\`\n\n` +
    `### Common Filter Examples\n` +
    `- Equals: \`name eq 'Contoso'\`\n` +
    `- Contains: \`contains(name, 'Contoso')\`\n` +
    `- Greater than date: \`createdon gt 2023-01-01T00:00:00Z\`\n` +
    `- Multiple conditions: \`name eq 'Contoso' and statecode eq 0\``,

  // Relationship exploration prompts
  RELATIONSHIP_MAP: (entityName: string) =>
    `## Relationship Map for ${entityName}\n\n` +
    `This shows all relationships for the '${entityName}' entity:\n\n` +
    `### One-to-Many Relationships (${entityName} as Primary)\n{{one_to_many_primary}}\n\n` +
    `### One-to-Many Relationships (${entityName} as Related)\n{{one_to_many_related}}\n\n` +
    `### Many-to-Many Relationships\n{{many_to_many}}\n\n`
};

// Register prompts with the server using the correct method signature
// Entity Overview Prompt
server.prompt(
  "entity-overview", 
  "Get an overview of a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity")
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get entity metadata and key attributes
      const [metadata, attributes] = await Promise.all([
        service.getEntityMetadata(entityName),
        service.getEntityAttributes(entityName)
      ]);
      
      // Format entity details
      const entityDetails = `- Display Name: ${metadata.DisplayName?.UserLocalizedLabel?.Label || entityName}\n` +
        `- Schema Name: ${metadata.SchemaName}\n` +
        `- Description: ${metadata.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
        `- Primary Key: ${metadata.PrimaryIdAttribute}\n` +
        `- Primary Name: ${metadata.PrimaryNameAttribute}`;
        
      // Get key attributes
      const keyAttributes = attributes.value
        .map((attr: any) => {
          const attrType = attr["@odata.type"] || attr.odata?.type || "Unknown type";
          return `- ${attr.LogicalName}: ${attrType}`;
        })
        .join('\n');
        
      // Get relationships summary
      const relationships = await service.getEntityRelationships(entityName);
      const oneToManyCount = relationships.oneToMany.value.length;
      const manyToManyCount = relationships.manyToMany.value.length;
      
      const relationshipsSummary = `- One-to-Many Relationships: ${oneToManyCount}\n` +
                                  `- Many-to-Many Relationships: ${manyToManyCount}`;
      
      let promptContent = powerPlatformPrompts.ENTITY_OVERVIEW(entityName);
      promptContent = promptContent
        .replace('{{entity_details}}', entityDetails)
        .replace('{{key_attributes}}', keyAttributes)
        .replace('{{relationships}}', relationshipsSummary);
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling entity-overview prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Attribute Details Prompt
server.prompt(
  "attribute-details",
  "Get detailed information about a specific entity attribute/field",
  {
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().describe("The logical name of the attribute"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const { entityName, attributeName } = args;
      
      // Get attribute details
      const attribute = await service.getEntityAttribute(entityName, attributeName);
      
      // Format attribute details
      const attrDetails = `- Display Name: ${attribute.DisplayName?.UserLocalizedLabel?.Label || attributeName}\n` +
        `- Description: ${attribute.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
        `- Type: ${attribute.AttributeType}\n` +
        `- Format: ${attribute.Format || 'N/A'}\n` +
        `- Is Required: ${attribute.RequiredLevel?.Value || 'No'}\n` +
        `- Is Searchable: ${attribute.IsValidForAdvancedFind || false}`;
        
      let promptContent = powerPlatformPrompts.ATTRIBUTE_DETAILS(entityName, attributeName);
      promptContent = promptContent
        .replace('{{attribute_details}}', attrDetails)
        .replace('{{data_type}}', attribute.AttributeType)
        .replace('{{required}}', attribute.RequiredLevel?.Value || 'No')
        .replace('{{max_length}}', attribute.MaxLength || 'N/A');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling attribute-details prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Query Template Prompt
server.prompt(
  "query-template",
  "Get a template for querying a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get entity metadata to determine plural name
      const metadata = await service.getEntityMetadata(entityName);
      const entityNamePlural = metadata.EntitySetName;
      
      // Get a few important fields for the select example
      const attributes = await service.getEntityAttributes(entityName);
      const selectFields = attributes.value
        .filter((attr: any) => attr.IsValidForRead === true && !attr.AttributeOf)
        .slice(0, 5) // Just take first 5 for example
        .map((attr: any) => attr.LogicalName)
        .join(',');
        
      let promptContent = powerPlatformPrompts.QUERY_TEMPLATE(entityNamePlural);
      promptContent = promptContent
        .replace('{{selected_fields}}', selectFields)
        .replace('{{filter_conditions}}', `${metadata.PrimaryNameAttribute} eq 'Example'`)
        .replace('{{order_by}}', `${metadata.PrimaryNameAttribute} asc`)
        .replace('{{max_records}}', '50');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling query-template prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Relationship Map Prompt
server.prompt(
  "relationship-map",
  "Get a list of relationships for a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get relationships
      const relationships = await service.getEntityRelationships(entityName);
      
      // Format one-to-many relationships where this entity is primary
      const oneToManyPrimary = relationships.oneToMany.value
        .filter((rel: any) => rel.ReferencingEntity !== entityName)
        .map((rel: any) => `- ${rel.SchemaName}: ${entityName} (1) → ${rel.ReferencingEntity} (N)`)
        .join('\n');
        
      // Format one-to-many relationships where this entity is related
      const oneToManyRelated = relationships.oneToMany.value
        .filter((rel: any) => rel.ReferencingEntity === entityName)
        .map((rel: any) => `- ${rel.SchemaName}: ${rel.ReferencedEntity} (1) → ${entityName} (N)`)
        .join('\n');
        
      // Format many-to-many relationships
      const manyToMany = relationships.manyToMany.value
        .map((rel: any) => {
          const otherEntity = rel.Entity1LogicalName === entityName ? rel.Entity2LogicalName : rel.Entity1LogicalName;
          return `- ${rel.SchemaName}: ${entityName} (N) ↔ ${otherEntity} (N)`;
        })
        .join('\n');
      
      let promptContent = powerPlatformPrompts.RELATIONSHIP_MAP(entityName);
      promptContent = promptContent
        .replace('{{one_to_many_primary}}', oneToManyPrimary || 'None found')
        .replace('{{one_to_many_related}}', oneToManyRelated || 'None found')
        .replace('{{many_to_many}}', manyToMany || 'None found');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling relationship-map prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Plugin Deployment Report Prompt
server.prompt(
  "plugin-deployment-report",
  "Generate a comprehensive deployment report for a plugin assembly",
  {
    assemblyName: z.string().describe("The name of the plugin assembly"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPluginAssemblyComplete(args.assemblyName, false);

      // Build markdown report
      let report = `# Plugin Deployment Report: ${result.assembly.name}\n\n`;

      report += `## Assembly Information\n`;
      report += `- **Version**: ${result.assembly.version}\n`;
      report += `- **Isolation Mode**: ${result.assembly.isolationmode === 2 ? 'Sandbox' : 'None'}\n`;
      report += `- **Source**: ${result.assembly.sourcetype === 0 ? 'Database' : result.assembly.sourcetype === 1 ? 'Disk' : 'GAC'}\n`;
      report += `- **Last Modified**: ${result.assembly.modifiedon} by ${result.assembly.modifiedby?.fullname || 'Unknown'}\n`;
      report += `- **Managed**: ${result.assembly.ismanaged ? 'Yes' : 'No'}\n\n`;

      report += `## Plugin Types (${result.pluginTypes.length} total)\n`;
      result.pluginTypes.forEach((type: any, idx: number) => {
        report += `${idx + 1}. ${type.typename}\n`;
      });
      report += `\n`;

      report += `## Registered Steps (${result.steps.length} total)\n\n`;
      result.steps.forEach((step: any) => {
        const stageName = step.stage === 10 ? 'PreValidation' : step.stage === 20 ? 'PreOperation' : 'PostOperation';
        const modeName = step.mode === 0 ? 'Sync' : 'Async';
        const status = step.statuscode === 1 ? '✓ Enabled' : '✗ Disabled';

        report += `### ${step.sdkmessageid?.name || 'Unknown'} - ${step.sdkmessagefilterid?.primaryobjecttypecode || 'None'} (${stageName}, ${modeName}, Rank ${step.rank})\n`;
        report += `- **Plugin**: ${step.plugintypeid?.typename || 'Unknown'}\n`;
        report += `- **Status**: ${status}\n`;
        report += `- **Filtering Attributes**: ${step.filteringattributes || '(none - runs on all changes)'}\n`;
        report += `- **Deployment**: ${step.supporteddeployment === 0 ? 'Server Only' : step.supporteddeployment === 1 ? 'Offline Only' : 'Both'}\n`;

        if (step.images.length > 0) {
          report += `- **Images**:\n`;
          step.images.forEach((img: any) => {
            const imageType = img.imagetype === 0 ? 'PreImage' : img.imagetype === 1 ? 'PostImage' : 'Both';
            report += `  - ${img.name} (${imageType}) → Attributes: ${img.attributes || '(all)'}\n`;
          });
        } else {
          report += `- **Images**: None\n`;
        }
        report += `\n`;
      });

      report += `## Validation Results\n\n`;
      if (result.validation.hasDisabledSteps) {
        report += `⚠ Some steps are disabled\n`;
      } else {
        report += `✓ All steps are enabled\n`;
      }

      if (result.validation.stepsWithoutFilteringAttributes.length > 0) {
        report += `⚠ Warning: ${result.validation.stepsWithoutFilteringAttributes.length} Update/Delete steps without filtering attributes:\n`;
        result.validation.stepsWithoutFilteringAttributes.forEach((name: string) => {
          report += `  - ${name}\n`;
        });
      } else {
        report += `✓ All Update/Delete steps have filtering attributes\n`;
      }

      if (result.validation.stepsWithoutImages.length > 0) {
        report += `⚠ Warning: ${result.validation.stepsWithoutImages.length} Update/Delete steps without images:\n`;
        result.validation.stepsWithoutImages.forEach((name: string) => {
          report += `  - ${name}\n`;
        });
      }

      if (result.validation.potentialIssues.length > 0) {
        report += `\n### Potential Issues\n`;
        result.validation.potentialIssues.forEach((issue: string) => {
          report += `- ${issue}\n`;
        });
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating plugin deployment report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Entity Plugin Pipeline Report Prompt
server.prompt(
  "entity-plugin-pipeline-report",
  "Generate a visual execution pipeline showing all plugins for an entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
    messageFilter: z.string().optional().describe("Optional filter by message name"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getEntityPluginPipeline(args.entityName, args.messageFilter, false);

      // Build markdown report
      let report = `# Plugin Pipeline: ${result.entity} Entity\n\n`;

      if (result.steps.length === 0) {
        report += `No plugins registered for this entity.\n`;
      } else {
        // Group by message
        result.messages.forEach((msg: any) => {
          report += `## ${msg.messageName} Message\n\n`;

          // PreValidation stage
          if (msg.stages.preValidation.length > 0) {
            report += `### Stage 1: PreValidation (Synchronous)\n`;
            msg.stages.preValidation.forEach((step: any, idx: number) => {
              report += `${idx + 1}. **[Rank ${step.rank}]** ${step.pluginType}\n`;
              report += `   - Assembly: ${step.assemblyName} v${step.assemblyVersion}\n`;
              report += `   - Filtering: ${step.filteringAttributes.join(', ') || '(all columns)'}\n`;
              if (step.hasPreImage || step.hasPostImage) {
                const images = [];
                if (step.hasPreImage) images.push('PreImage');
                if (step.hasPostImage) images.push('PostImage');
                report += `   - Images: ${images.join(', ')}\n`;
              }
              report += `\n`;
            });
          }

          // PreOperation stage
          if (msg.stages.preOperation.length > 0) {
            report += `### Stage 2: PreOperation (Synchronous)\n`;
            msg.stages.preOperation.forEach((step: any, idx: number) => {
              report += `${idx + 1}. **[Rank ${step.rank}]** ${step.pluginType}\n`;
              report += `   - Assembly: ${step.assemblyName} v${step.assemblyVersion}\n`;
              report += `   - Filtering: ${step.filteringAttributes.join(', ') || '(all columns)'}\n`;
              if (step.hasPreImage || step.hasPostImage) {
                const images = [];
                if (step.hasPreImage) images.push('PreImage');
                if (step.hasPostImage) images.push('PostImage');
                report += `   - Images: ${images.join(', ')}\n`;
              }
              report += `\n`;
            });
          }

          // PostOperation stage
          if (msg.stages.postOperation.length > 0) {
            report += `### Stage 3: PostOperation\n`;
            msg.stages.postOperation.forEach((step: any, idx: number) => {
              const mode = step.modeName === 'Asynchronous' ? ' (Async)' : ' (Sync)';
              report += `${idx + 1}. **[Rank ${step.rank}]** ${step.pluginType}${mode}\n`;
              report += `   - Assembly: ${step.assemblyName} v${step.assemblyVersion}\n`;
              report += `   - Filtering: ${step.filteringAttributes.join(', ') || '(all columns)'}\n`;
              if (step.hasPreImage || step.hasPostImage) {
                const images = [];
                if (step.hasPreImage) images.push('PreImage');
                if (step.hasPostImage) images.push('PostImage');
                report += `   - Images: ${images.join(', ')}\n`;
              }
              report += `\n`;
            });
          }

          report += `---\n\n`;
        });

        report += `## Execution Order\n\n`;
        report += `Plugins execute in this order:\n`;
        result.executionOrder.forEach((name: string, idx: number) => {
          report += `${idx + 1}. ${name}\n`;
        });
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating entity plugin pipeline report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Power Automate Flows Report Prompt
server.prompt(
  "flows-report",
  "Generate a comprehensive report of all Power Automate flows in the environment",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated flows (default: false)"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getFlows(args.activeOnly === 'true', 100);

      // Build markdown report
      let report = `# Power Automate Flows Report\n\n`;
      report += `**Total Flows**: ${result.totalCount}\n\n`;

      if (result.flows.length === 0) {
        report += `No flows found in this environment.\n`;
      } else {
        // Group by state
        const activeFlows = result.flows.filter((f: any) => f.state === 'Activated');
        const draftFlows = result.flows.filter((f: any) => f.state === 'Draft');
        const suspendedFlows = result.flows.filter((f: any) => f.state === 'Suspended');

        if (activeFlows.length > 0) {
          report += `## Active Flows (${activeFlows.length})\n\n`;
          activeFlows.forEach((flow: any) => {
            report += `### ${flow.name}\n`;
            report += `- **ID**: ${flow.workflowid}\n`;
            report += `- **Description**: ${flow.description || 'No description'}\n`;
            report += `- **Primary Entity**: ${flow.primaryEntity || 'None'}\n`;
            report += `- **Owner**: ${flow.owner}\n`;
            report += `- **Modified**: ${flow.modifiedOn} by ${flow.modifiedBy}\n`;
            report += `- **Managed**: ${flow.isManaged ? 'Yes' : 'No'}\n\n`;
          });
        }

        if (draftFlows.length > 0) {
          report += `## Draft Flows (${draftFlows.length})\n\n`;
          draftFlows.forEach((flow: any) => {
            report += `- **${flow.name}** (${flow.workflowid})\n`;
            report += `  - Owner: ${flow.owner}, Modified: ${flow.modifiedOn}\n`;
          });
          report += `\n`;
        }

        if (suspendedFlows.length > 0) {
          report += `## Suspended Flows (${suspendedFlows.length})\n\n`;
          suspendedFlows.forEach((flow: any) => {
            report += `- **${flow.name}** (${flow.workflowid})\n`;
            report += `  - Owner: ${flow.owner}, Modified: ${flow.modifiedOn}\n`;
          });
          report += `\n`;
        }
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating flows report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Classic Workflows Report Prompt
server.prompt(
  "workflows-report",
  "Generate a comprehensive report of all classic Dynamics workflows in the environment",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated workflows (default: false)"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWorkflows(args.activeOnly === 'true', 100);

      // Build markdown report
      let report = `# Classic Dynamics Workflows Report\n\n`;
      report += `**Total Workflows**: ${result.totalCount}\n\n`;

      if (result.workflows.length === 0) {
        report += `No classic workflows found in this environment.\n`;
      } else {
        // Group by state
        const activeWorkflows = result.workflows.filter((w: any) => w.state === 'Activated');
        const draftWorkflows = result.workflows.filter((w: any) => w.state === 'Draft');
        const suspendedWorkflows = result.workflows.filter((w: any) => w.state === 'Suspended');

        if (activeWorkflows.length > 0) {
          report += `## Active Workflows (${activeWorkflows.length})\n\n`;
          activeWorkflows.forEach((workflow: any) => {
            report += `### ${workflow.name}\n`;
            report += `- **ID**: ${workflow.workflowid}\n`;
            report += `- **Description**: ${workflow.description || 'No description'}\n`;
            report += `- **Primary Entity**: ${workflow.primaryEntity || 'None'}\n`;
            report += `- **Mode**: ${workflow.mode}\n`;
            report += `- **Triggers**:\n`;
            if (workflow.triggerOnCreate) report += `  - Create\n`;
            if (workflow.triggerOnDelete) report += `  - Delete\n`;
            if (workflow.isOnDemand) report += `  - On Demand\n`;
            report += `- **Owner**: ${workflow.owner}\n`;
            report += `- **Modified**: ${workflow.modifiedOn} by ${workflow.modifiedBy}\n`;
            report += `- **Managed**: ${workflow.isManaged ? 'Yes' : 'No'}\n\n`;
          });
        }

        if (draftWorkflows.length > 0) {
          report += `## Draft Workflows (${draftWorkflows.length})\n\n`;
          draftWorkflows.forEach((workflow: any) => {
            report += `- **${workflow.name}** (${workflow.workflowid})\n`;
            report += `  - Entity: ${workflow.primaryEntity}, Owner: ${workflow.owner}\n`;
          });
          report += `\n`;
        }

        if (suspendedWorkflows.length > 0) {
          report += `## Suspended Workflows (${suspendedWorkflows.length})\n\n`;
          suspendedWorkflows.forEach((workflow: any) => {
            report += `- **${workflow.name}** (${workflow.workflowid})\n`;
            report += `  - Entity: ${workflow.primaryEntity}, Owner: ${workflow.owner}\n`;
          });
          report += `\n`;
        }
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating workflows report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Business Rules Report Prompt
server.prompt(
  "business-rules-report",
  "Generate a comprehensive report of all business rules in the environment (read-only for troubleshooting)",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated business rules (default: false)"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getBusinessRules(args.activeOnly === 'true', 100);

      // Build markdown report
      let report = `# Business Rules Report\n\n`;
      report += `**Total Business Rules**: ${result.totalCount}\n\n`;

      if (result.businessRules.length === 0) {
        report += `No business rules found in this environment.\n`;
      } else {
        // Group by state
        const activeRules = result.businessRules.filter((r: any) => r.state === 'Activated');
        const draftRules = result.businessRules.filter((r: any) => r.state === 'Draft');
        const suspendedRules = result.businessRules.filter((r: any) => r.state === 'Suspended');

        if (activeRules.length > 0) {
          report += `## Active Business Rules (${activeRules.length})\n\n`;
          activeRules.forEach((rule: any) => {
            report += `### ${rule.name}\n`;
            report += `- **ID**: ${rule.workflowid}\n`;
            report += `- **Description**: ${rule.description || 'No description'}\n`;
            report += `- **Primary Entity**: ${rule.primaryEntity || 'None'}\n`;
            report += `- **Owner**: ${rule.owner}\n`;
            report += `- **Modified**: ${rule.modifiedOn} by ${rule.modifiedBy}\n`;
            report += `- **Managed**: ${rule.isManaged ? 'Yes' : 'No'}\n\n`;
          });
        }

        if (draftRules.length > 0) {
          report += `## Draft Business Rules (${draftRules.length})\n\n`;
          draftRules.forEach((rule: any) => {
            report += `- **${rule.name}** (${rule.workflowid})\n`;
            report += `  - Entity: ${rule.primaryEntity}, Owner: ${rule.owner}\n`;
          });
          report += `\n`;
        }

        if (suspendedRules.length > 0) {
          report += `## Suspended Business Rules (${suspendedRules.length})\n\n`;
          suspendedRules.forEach((rule: any) => {
            report += `- **${rule.name}** (${rule.workflowid})\n`;
            report += `  - Entity: ${rule.primaryEntity}, Owner: ${rule.owner}\n`;
          });
          report += `\n`;
        }
      }

      report += `\n---\n\n`;
      report += `*Note: Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.*\n`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating business rules report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// ==================== MODEL-DRIVEN APP PROMPTS ====================

// App Overview Prompt
server.prompt(
  "app-overview",
  "Generate a comprehensive overview report for a model-driven app including components and configuration",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();

      // Get app details, components, and sitemap
      const app = await service.getApp(args.appId);
      const components = await service.getAppComponents(args.appId);
      const sitemap = await service.getAppSitemap(args.appId);

      // Build markdown report
      let report = `# Model-Driven App Overview: ${app.name}\n\n`;

      // Basic Information
      report += `## Basic Information\n`;
      report += `- **App ID**: ${app.appmoduleid}\n`;
      report += `- **Unique Name**: ${app.uniquename}\n`;
      report += `- **Description**: ${app.description || 'No description'}\n`;
      report += `- **State**: ${app.state}\n`;
      report += `- **Navigation Type**: ${app.navigationtype}\n`;
      report += `- **Featured**: ${app.isfeatured ? 'Yes' : 'No'}\n`;
      report += `- **Default App**: ${app.isdefault ? 'Yes' : 'No'}\n`;
      report += `- **Published On**: ${app.publishedon || 'Not published'}\n`;
      report += `- **Created**: ${app.createdon} by ${app.createdBy || 'Unknown'}\n`;
      report += `- **Modified**: ${app.modifiedon} by ${app.modifiedBy || 'Unknown'}\n\n`;

      // Publisher Information
      if (app.publisher) {
        report += `## Publisher\n`;
        report += `- **Name**: ${app.publisher.friendlyname}\n`;
        report += `- **Unique Name**: ${app.publisher.uniquename}\n`;
        report += `- **Prefix**: ${app.publisher.customizationprefix}\n\n`;
      }

      // Components Summary
      report += `## Components Summary\n`;
      report += `**Total Components**: ${components.totalCount}\n\n`;

      if (components.totalCount > 0) {
        // Group by type
        Object.keys(components.groupedByType).forEach((typeName: string) => {
          const typeComponents = components.groupedByType[typeName];
          report += `- **${typeName}**: ${typeComponents.length}\n`;
        });
        report += `\n`;

        // Detailed component list by type
        report += `## Detailed Components\n\n`;
        Object.keys(components.groupedByType).forEach((typeName: string) => {
          const typeComponents = components.groupedByType[typeName];
          report += `### ${typeName} (${typeComponents.length})\n`;
          typeComponents.forEach((comp: any, idx: number) => {
            report += `${idx + 1}. ID: ${comp.objectid}\n`;
          });
          report += `\n`;
        });
      }

      // Sitemap Information
      if (sitemap.hasSitemap) {
        report += `## Navigation (Sitemap)\n`;
        report += `- **Sitemap Name**: ${sitemap.sitemapname}\n`;
        report += `- **App Aware**: ${sitemap.isappaware ? 'Yes' : 'No'}\n`;
        report += `- **Collapsible Groups**: ${sitemap.enablecollapsiblegroups ? 'Yes' : 'No'}\n`;
        report += `- **Show Home**: ${sitemap.showhome ? 'Yes' : 'No'}\n`;
        report += `- **Show Pinned**: ${sitemap.showpinned ? 'Yes' : 'No'}\n`;
        report += `- **Show Recents**: ${sitemap.showrecents ? 'Yes' : 'No'}\n`;
        report += `- **Managed**: ${sitemap.ismanaged ? 'Yes' : 'No'}\n\n`;
      } else {
        report += `## Navigation (Sitemap)\n`;
        report += `⚠ No sitemap configured for this app\n\n`;
      }

      // Next Steps
      report += `## Available Actions\n`;
      report += `- Add entities: Use \`add-entities-to-app\` tool\n`;
      report += `- Validate app: Use \`validate-app\` tool\n`;
      report += `- Publish app: Use \`publish-app\` tool\n`;
      report += `- View sitemap XML: Use \`get-app-sitemap\` tool\n\n`;

      report += `---\n\n`;
      report += `*Generated by MCP Consultant Tools*\n`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating app overview:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// ==================== AZURE DEVOPS PROMPTS ====================

// Wiki Search Results Prompt
server.prompt(
  "wiki-search-results",
  "Search Azure DevOps wiki pages and get formatted results with content snippets",
  {
    searchText: z.string().describe("The text to search for"),
    project: z.string().optional().describe("Optional project filter"),
    maxResults: z.string().optional().describe("Maximum number of results (default: 25)"),
  },
  async (args) => {
    try {
      const service = getAzureDevOpsService();
      const { searchText, project, maxResults } = args;
      const maxResultsNum = maxResults ? parseInt(maxResults, 10) : undefined;
      const result = await service.searchWikiPages(searchText, project, maxResultsNum);

      let report = `# Wiki Search Results: "${searchText}"\n\n`;
      report += `**Project:** ${project || 'All allowed projects'}\n`;
      report += `**Total Results:** ${result.totalCount}\n\n`;

      if (result.results && result.results.length > 0) {
        report += `## Results\n\n`;
        result.results.forEach((item: any, index: number) => {
          report += `### ${index + 1}. ${item.fileName}\n`;
          report += `- **Path:** ${item.path}\n`;
          report += `- **Wiki:** ${item.wikiName}\n`;
          report += `- **Project:** ${item.project}\n`;
          if (item.highlights && item.highlights.length > 0) {
            report += `- **Highlights:**\n`;
            item.highlights.forEach((highlight: string) => {
              // Remove HTML tags for cleaner display
              const cleanHighlight = highlight.replace(/<[^>]*>/g, '');
              report += `  - ${cleanHighlight}\n`;
            });
          }
          report += `\n`;
        });
      } else {
        report += `No results found for "${searchText}".\n`;
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating wiki search results:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Wiki Page Content Prompt
server.prompt(
  "wiki-page-content",
  "Get a formatted wiki page with navigation context from Azure DevOps",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier"),
    pagePath: z.string().describe("The path to the page"),
  },
  async (args) => {
    try {
      const service = getAzureDevOpsService();
      const { project, wikiId, pagePath } = args;
      const result = await service.getWikiPage(project, wikiId, pagePath, true);

      let report = `# Wiki Page: ${pagePath}\n\n`;
      report += `**Project:** ${project}\n`;
      report += `**Wiki:** ${wikiId}\n`;
      report += `**Git Path:** ${result.gitItemPath || 'N/A'}\n\n`;

      if (result.subPages && result.subPages.length > 0) {
        report += `## Sub-pages\n`;
        result.subPages.forEach((subPage: any) => {
          report += `- ${subPage.path}\n`;
        });
        report += `\n`;
      }

      report += `## Content\n\n`;
      report += result.content || '*No content available*';

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating wiki page content:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Work Item Summary Prompt
server.prompt(
  "work-item-summary",
  "Get a comprehensive summary of a work item with comments from Azure DevOps",
  {
    project: z.string().describe("The project name"),
    workItemId: z.string().describe("The work item ID"),
  },
  async (args) => {
    try {
      const service = getAzureDevOpsService();
      const { project, workItemId } = args;
      const workItemIdNum = parseInt(workItemId, 10);

      // Get work item and comments in parallel
      const [workItem, comments] = await Promise.all([
        service.getWorkItem(project, workItemIdNum),
        service.getWorkItemComments(project, workItemIdNum)
      ]);

      const fields = workItem.fields || {};

      let report = `# Work Item #${workItemId}: ${fields['System.Title'] || 'Untitled'}\n\n`;

      report += `## Details\n`;
      report += `- **Type:** ${fields['System.WorkItemType'] || 'N/A'}\n`;
      report += `- **State:** ${fields['System.State'] || 'N/A'}\n`;
      report += `- **Assigned To:** ${fields['System.AssignedTo']?.displayName || 'Unassigned'}\n`;
      report += `- **Created By:** ${fields['System.CreatedBy']?.displayName || 'N/A'}\n`;
      report += `- **Created Date:** ${fields['System.CreatedDate'] || 'N/A'}\n`;
      report += `- **Changed Date:** ${fields['System.ChangedDate'] || 'N/A'}\n`;
      report += `- **Area Path:** ${fields['System.AreaPath'] || 'N/A'}\n`;
      report += `- **Iteration Path:** ${fields['System.IterationPath'] || 'N/A'}\n`;
      if (fields['System.Tags']) {
        report += `- **Tags:** ${fields['System.Tags']}\n`;
      }
      report += `\n`;

      if (fields['System.Description']) {
        report += `## Description\n${fields['System.Description']}\n\n`;
      }

      if (fields['Microsoft.VSTS.TCM.ReproSteps']) {
        report += `## Repro Steps\n${fields['Microsoft.VSTS.TCM.ReproSteps']}\n\n`;
      }

      if (workItem.relations && workItem.relations.length > 0) {
        report += `## Related Items\n`;
        workItem.relations.forEach((relation: any) => {
          report += `- ${relation.rel}: ${relation.url}\n`;
        });
        report += `\n`;
      }

      if (comments.comments && comments.comments.length > 0) {
        report += `## Comments (${comments.totalCount})\n\n`;
        comments.comments.forEach((comment: any) => {
          report += `### ${comment.createdBy} - ${new Date(comment.createdDate).toLocaleString()}\n`;
          report += `${comment.text}\n\n`;
        });
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating work item summary:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Work Items Query Report Prompt
server.prompt(
  "work-items-query-report",
  "Execute a WIQL query and get formatted results grouped by state/type",
  {
    project: z.string().describe("The project name"),
    wiql: z.string().describe("The WIQL query string"),
    maxResults: z.string().optional().describe("Maximum number of results (default: 200)"),
  },
  async (args) => {
    try {
      const service = getAzureDevOpsService();
      const { project, wiql, maxResults } = args;
      const maxResultsNum = maxResults ? parseInt(maxResults, 10) : undefined;
      const result = await service.queryWorkItems(project, wiql, maxResultsNum);

      let report = `# Work Items Query Results\n\n`;
      report += `**Project:** ${project}\n`;
      report += `**Total Results:** ${result.totalCount}\n\n`;

      if (result.workItems && result.workItems.length > 0) {
        // Group by state
        const groupedByState = new Map<string, any[]>();
        result.workItems.forEach((item: any) => {
          const state = item.fields['System.State'] || 'Unknown';
          if (!groupedByState.has(state)) {
            groupedByState.set(state, []);
          }
          groupedByState.get(state)!.push(item);
        });

        // Sort states: Active, Resolved, Closed, others
        const stateOrder = ['Active', 'New', 'Resolved', 'Closed'];
        const sortedStates = Array.from(groupedByState.keys()).sort((a, b) => {
          const aIndex = stateOrder.indexOf(a);
          const bIndex = stateOrder.indexOf(b);
          if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });

        sortedStates.forEach(state => {
          const items = groupedByState.get(state)!;
          report += `## ${state} (${items.length})\n\n`;
          items.forEach((item: any) => {
            const fields = item.fields;
            report += `- **#${item.id}**: ${fields['System.Title'] || 'Untitled'}\n`;
            report += `  - Type: ${fields['System.WorkItemType'] || 'N/A'}`;
            report += `, Assigned: ${fields['System.AssignedTo']?.displayName || 'Unassigned'}\n`;
          });
          report += `\n`;
        });
      } else {
        report += `No work items found matching the query.\n`;
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating work items query report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

/**
 * Prompt: appinsights-exception-summary
 * Generate an exception summary report for troubleshooting
 */
server.prompt(
  "appinsights-exception-summary",
  "Generate a comprehensive exception summary report from Application Insights",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getApplicationInsightsService();
      const timespanValue = timespan || 'PT1H';

      // Get recent exceptions
      const exceptionsResult = await service.getRecentExceptions(resourceId, timespanValue, 50);

      // Get exception type frequency
      const exceptionTypesResult = await service.executeQuery(
        resourceId,
        `
          exceptions
          | where timestamp > ago(${timespanValue.replace(/^P(T)?/, '')})
          | summarize Count=count() by type
          | order by Count desc
        `.trim(),
        timespanValue
      );

      // Format results
      const exceptionsList = formatTableAsMarkdown(exceptionsResult.tables[0]);
      const exceptionTypes = formatTableAsMarkdown(exceptionTypesResult.tables[0]);
      const insights = analyzeExceptions(exceptionsResult.tables[0]);

      const report = `# Application Insights Exception Summary Report\n\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n\n` +
        `## Key Insights\n\n${insights}\n\n` +
        `## Recent Exceptions\n\n${exceptionsList}\n\n` +
        `## Exception Types (Frequency)\n\n${exceptionTypes}\n\n` +
        `## Recommendations\n\n` +
        `- Review the most frequent exception types to identify systemic issues\n` +
        `- Investigate exceptions in critical operations first\n` +
        `- Check for patterns in timestamps (e.g., deployment times, peak traffic)\n` +
        `- Use operation_Id to correlate exceptions with requests and dependencies`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating exception summary:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate exception summary: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * Prompt: appinsights-performance-report
 * Generate a comprehensive performance analysis report
 */
server.prompt(
  "appinsights-performance-report",
  "Generate a comprehensive performance analysis report from Application Insights",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getApplicationInsightsService();
      const timespanValue = timespan || 'PT1H';

      // Get operation performance
      const performanceResult = await service.getOperationPerformance(resourceId, timespanValue);

      // Get slow requests
      const slowRequestsResult = await service.getSlowRequests(resourceId, 5000, timespanValue, 20);

      // Format results
      const performanceTable = formatTableAsMarkdown(performanceResult.tables[0]);
      const slowRequestsTable = formatTableAsMarkdown(slowRequestsResult.tables[0]);
      const insights = analyzePerformance(performanceResult.tables[0]);

      const report = `# Application Insights Performance Report\n\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n\n` +
        `## Key Insights\n\n${insights}\n\n` +
        `## Operation Performance Summary\n\n${performanceTable}\n\n` +
        `## Slowest Requests (>5s)\n\n${slowRequestsTable}\n\n` +
        `## Performance Recommendations\n\n` +
        `- Focus optimization efforts on operations with high P95/P99 duration\n` +
        `- Investigate operations with high failure counts\n` +
        `- Monitor operations with high request counts for scalability issues\n` +
        `- Use operation_Id to trace slow requests through dependencies`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating performance report:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate performance report: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * Prompt: appinsights-dependency-health
 * Generate a dependency health report
 */
server.prompt(
  "appinsights-dependency-health",
  "Generate a dependency health report showing external service issues",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getApplicationInsightsService();
      const timespanValue = timespan || 'PT1H';

      // Get failed dependencies
      const failedDepsResult = await service.getFailedDependencies(resourceId, timespanValue, 50);

      // Get dependency success rates
      const successRatesResult = await service.executeQuery(
        resourceId,
        `
          dependencies
          | where timestamp > ago(${timespanValue.replace(/^P(T)?/, '')})
          | summarize Total=count(), Failed=countif(success == false), AvgDuration=avg(duration) by target, type
          | extend SuccessRate=round(100.0 * (Total - Failed) / Total, 2)
          | order by SuccessRate asc
        `.trim(),
        timespanValue
      );

      // Format results
      const failedDepsTable = formatTableAsMarkdown(failedDepsResult.tables[0]);
      const successRatesTable = formatTableAsMarkdown(successRatesResult.tables[0]);
      const insights = analyzeDependencies(failedDepsResult.tables[0]);

      const report = `# Application Insights Dependency Health Report\n\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n\n` +
        `## Key Insights\n\n${insights}\n\n` +
        `## Failed Dependencies\n\n${failedDepsTable}\n\n` +
        `## Dependency Success Rates\n\n${successRatesTable}\n\n` +
        `## Recommendations\n\n` +
        `- Investigate dependencies with success rates below 99%\n` +
        `- Check if external service degradation matches known incidents\n` +
        `- Review timeout configurations for slow dependencies\n` +
        `- Consider implementing circuit breakers for unreliable dependencies`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating dependency health report:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate dependency health report: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * Prompt: appinsights-availability-report
 * Generate an availability and uptime report
 */
server.prompt(
  "appinsights-availability-report",
  "Generate an availability and uptime report from Application Insights",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT24H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getApplicationInsightsService();
      const timespanValue = timespan || 'PT24H';

      // Get availability results
      const availabilityResult = await service.getAvailabilityResults(resourceId, timespanValue);

      // Format results
      const availabilityTable = formatTableAsMarkdown(availabilityResult.tables[0]);

      const report = `# Application Insights Availability Report\n\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n\n` +
        `## Availability Test Results\n\n${availabilityTable}\n\n` +
        `## Recommendations\n\n` +
        `- Investigate any tests with success rates below 99.9%\n` +
        `- Review failed tests for patterns (geographic, time-based)\n` +
        `- Consider adding availability tests for critical endpoints if missing\n` +
        `- Set up alerts for availability degradation`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating availability report:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate availability report: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * Prompt: appinsights-troubleshooting-guide
 * Generate a comprehensive troubleshooting guide
 */
server.prompt(
  "appinsights-troubleshooting-guide",
  "Generate a comprehensive troubleshooting guide combining exceptions, performance, and dependencies",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getApplicationInsightsService();
      const timespanValue = timespan || 'PT1H';

      // Get data from multiple sources
      const exceptionsResult = await service.getRecentExceptions(resourceId, timespanValue, 20);
      const slowRequestsResult = await service.getSlowRequests(resourceId, 5000, timespanValue, 20);
      const failedDepsResult = await service.getFailedDependencies(resourceId, timespanValue, 20);
      const tracesResult = await service.getTracesBySeverity(resourceId, 3, timespanValue, 30); // Error level

      // Format results
      const exceptionsTable = formatTableAsMarkdown(exceptionsResult.tables[0]);
      const slowRequestsTable = formatTableAsMarkdown(slowRequestsResult.tables[0]);
      const failedDepsTable = formatTableAsMarkdown(failedDepsResult.tables[0]);
      const tracesTable = formatTableAsMarkdown(tracesResult.tables[0]);

      const report = `# Application Insights Troubleshooting Guide\n\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n` +
        `**Generated**: ${new Date().toISOString()}\n\n` +
        `## 1. Recent Errors and Exceptions\n\n${exceptionsTable}\n\n` +
        `## 2. Performance Issues\n\n${slowRequestsTable}\n\n` +
        `## 3. Dependency Failures\n\n${failedDepsTable}\n\n` +
        `## 4. Diagnostic Logs (Errors)\n\n${tracesTable}\n\n` +
        `## 5. Investigation Steps\n\n` +
        `1. **Identify the pattern**: Check if errors are isolated or widespread\n` +
        `2. **Correlate events**: Use operation_Id to trace requests across services\n` +
        `3. **Check timeline**: Look for correlation with deployments or external events\n` +
        `4. **Review dependencies**: Verify external service health\n` +
        `5. **Analyze traces**: Review detailed logs for error context\n\n` +
        `## 6. Common Patterns and Root Causes\n\n` +
        `- **High exception rate + dependency failures**: External service degradation\n` +
        `- **Slow requests + high dependency duration**: Network or external API latency\n` +
        `- **Exceptions in specific operations**: Code defect or invalid input\n` +
        `- **Timeouts**: Insufficient resources or inefficient queries`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating troubleshooting guide:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate troubleshooting guide: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * ===========================================
 * LOG ANALYTICS WORKSPACE PROMPTS (5 PROMPTS)
 * ===========================================
 */

/**
 * Prompt: loganalytics-workspace-summary
 * Generate a workspace health summary
 */
server.prompt(
  "loganalytics-workspace-summary",
  "Generate a comprehensive health summary for a Log Analytics workspace",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getLogAnalyticsService();
      const timespanValue = timespan || 'PT1H';

      // Get recent errors from FunctionAppLogs
      const errorsResult = await service.getFunctionErrors(resourceId, undefined, timespanValue, 50);
      const statsResult = await service.getFunctionStats(resourceId, undefined, timespanValue);

      // Format results
      const errorsTable = errorsResult.tables[0] ? formatLATableAsMarkdown(errorsResult.tables[0]) : '*No errors*';
      const statsTable = statsResult.tables[0] ? formatLATableAsMarkdown(statsResult.tables[0]) : '*No statistics*';

      // Analyze
      const errorsAnalysis = analyzeFunctionErrors(errorsResult.tables[0]);
      const statsAnalysis = analyzeFunctionStats(statsResult.tables[0]);

      const report = `# Log Analytics Workspace Health Summary\n\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n` +
        `**Generated**: ${new Date().toISOString()}\n\n` +
        `## Function Statistics\n\n${statsTable}\n\n` +
        `### Key Insights\n${statsAnalysis}\n\n` +
        `## Recent Errors\n\n${errorsTable}\n\n` +
        `### Error Analysis\n${errorsAnalysis}\n\n` +
        `## Recommendations\n\n` +
        generateRecommendations({
          errorCount: errorsResult.tables[0]?.rows.length || 0,
        }).join('\n');

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating workspace summary:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate workspace summary: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * Prompt: loganalytics-function-troubleshooting
 * Generate Azure Function troubleshooting guide
 */
server.prompt(
  "loganalytics-function-troubleshooting",
  "Generate a comprehensive troubleshooting guide for an Azure Function",
  {
    resourceId: z.string().describe("Resource ID"),
    functionName: z.string().describe("Function name to analyze"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, functionName, timespan }) => {
    try {
      const service = getLogAnalyticsService();
      const timespanValue = timespan || 'PT1H';

      // Get comprehensive data
      const logsResult = await service.getFunctionLogs(resourceId, functionName, timespanValue, undefined, 100);
      const errorsResult = await service.getFunctionErrors(resourceId, functionName, timespanValue, 50);
      const statsResult = await service.getFunctionStats(resourceId, functionName, timespanValue);
      const invocationsResult = await service.getFunctionInvocations(resourceId, functionName, timespanValue, 50);

      // Format results
      const logsTable = logsResult.tables[0] ? formatLATableAsMarkdown(logsResult.tables[0]) : '*No logs*';
      const errorsTable = errorsResult.tables[0] ? formatLATableAsMarkdown(errorsResult.tables[0]) : '*No errors*';
      const statsTable = statsResult.tables[0] ? formatLATableAsMarkdown(statsResult.tables[0]) : '*No statistics*';
      const invocationsTable = invocationsResult.tables[0] ? formatLATableAsMarkdown(invocationsResult.tables[0]) : '*No invocations*';

      // Analyze
      const logsAnalysis = analyzeFunctionLogs(logsResult.tables[0]);
      const errorsAnalysis = analyzeFunctionErrors(errorsResult.tables[0]);
      const statsAnalysis = analyzeFunctionStats(statsResult.tables[0]);

      const report = `# Azure Function Troubleshooting Guide\n\n` +
        `**Function**: ${functionName}\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n` +
        `**Generated**: ${new Date().toISOString()}\n\n` +
        `## Executive Summary\n\n${statsTable}\n\n` +
        `### Statistics Insights\n${statsAnalysis}\n\n` +
        `## Error Analysis\n\n${errorsTable}\n\n` +
        `### Error Insights\n${errorsAnalysis}\n\n` +
        `## Recent Logs\n\n${logsTable}\n\n` +
        `### Log Insights\n${logsAnalysis}\n\n` +
        `## Recent Invocations\n\n${invocationsTable}\n\n` +
        `## Recommendations\n\n` +
        generateRecommendations({
          errorCount: errorsResult.tables[0]?.rows.length || 0,
        }).join('\n');

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating function troubleshooting guide:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate troubleshooting guide: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * Prompt: loganalytics-function-performance-report
 * Generate function performance analysis report
 */
server.prompt(
  "loganalytics-function-performance-report",
  "Generate a performance analysis report for Azure Functions",
  {
    resourceId: z.string().describe("Resource ID"),
    functionName: z.string().optional().describe("Function name (optional, analyzes all if not specified)"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, functionName, timespan }) => {
    try {
      const service = getLogAnalyticsService();
      const timespanValue = timespan || 'PT1H';

      // Get performance data
      const statsResult = await service.getFunctionStats(resourceId, functionName, timespanValue);
      const invocationsResult = await service.getFunctionInvocations(resourceId, functionName, timespanValue, 100);

      // Format results
      const statsTable = statsResult.tables[0] ? formatLATableAsMarkdown(statsResult.tables[0]) : '*No statistics*';
      const invocationsTable = invocationsResult.tables[0] ? formatLATableAsMarkdown(invocationsResult.tables[0]) : '*No invocations*';

      // Analyze
      const statsAnalysis = analyzeFunctionStats(statsResult.tables[0]);

      const report = `# Azure Function Performance Report\n\n` +
        `**Function**: ${functionName || 'All Functions'}\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n` +
        `**Generated**: ${new Date().toISOString()}\n\n` +
        `## Execution Statistics\n\n${statsTable}\n\n` +
        `### Performance Insights\n${statsAnalysis}\n\n` +
        `## Recent Invocations\n\n${invocationsTable}\n\n` +
        `## Recommendations\n\n` +
        `- Monitor success rates and investigate functions below 95%\n` +
        `- Review invocation patterns for optimization opportunities\n` +
        `- Consider implementing retry logic for transient failures\n`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating performance report:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate performance report: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * Prompt: loganalytics-security-analysis
 * Generate security event analysis
 */
server.prompt(
  "loganalytics-security-analysis",
  "Generate a security event analysis report from Log Analytics",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getLogAnalyticsService();
      const timespanValue = timespan || 'PT1H';

      // Try to get security events or fall back to general logs
      let securityResult;
      try {
        securityResult = await service.getRecentEvents(resourceId, 'SecurityEvent', timespanValue, 100);
      } catch {
        // If SecurityEvent table doesn't exist, try traces with high severity
        securityResult = await service.getRecentEvents(resourceId, 'traces', timespanValue, 100);
      }

      // Format results
      const securityTable = securityResult.tables[0] ? formatLATableAsMarkdown(securityResult.tables[0]) : '*No security events*';

      // Analyze
      const analysis = analyzeLogs(securityResult.tables[0], 'SecurityEvent');

      const report = `# Security Event Analysis Report\n\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n` +
        `**Generated**: ${new Date().toISOString()}\n\n` +
        `## Security Events\n\n${securityTable}\n\n` +
        `### Analysis\n${analysis}\n\n` +
        `## Recommendations\n\n` +
        `- Review security events for unusual patterns\n` +
        `- Investigate any critical or error-level security events\n` +
        `- Consider implementing additional monitoring for suspicious activity\n` +
        `- Ensure security policies are up to date\n`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating security analysis:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate security analysis: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

/**
 * Prompt: loganalytics-logs-report
 * Generate formatted logs report
 */
server.prompt(
  "loganalytics-logs-report",
  "Generate a formatted logs report with insights and analysis",
  {
    resourceId: z.string().describe("Resource ID"),
    tableName: z.string().describe("Table name to query"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.string().optional().describe("Maximum number of logs (default: 100)"),
  },
  async ({ resourceId, tableName, timespan, limit }) => {
    try {
      const service = getLogAnalyticsService();
      const timespanValue = timespan || 'PT1H';
      const limitValue = limit ? parseInt(limit, 10) : 100;

      // Get logs
      const logsResult = await service.getRecentEvents(resourceId, tableName, timespanValue, limitValue);

      // Format results
      const logsTable = logsResult.tables[0] ? formatLATableAsMarkdown(logsResult.tables[0]) : '*No logs*';

      // Analyze
      const analysis = analyzeLogs(logsResult.tables[0], tableName);

      const report = `# Log Analytics Report\n\n` +
        `**Table**: ${tableName}\n` +
        `**Resource**: ${resourceId}\n` +
        `**Time Range**: ${timespanValue}\n` +
        `**Limit**: ${limitValue}\n` +
        `**Generated**: ${new Date().toISOString()}\n\n` +
        `## Log Entries\n\n${logsTable}\n\n` +
        `### Analysis\n${analysis}\n\n` +
        `## Recommendations\n\n` +
        `- Review log patterns for anomalies\n` +
        `- Investigate any error or warning entries\n` +
        `- Consider adjusting log retention policies\n`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report,
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating logs report:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Failed to generate logs report: ${error.message}`,
            },
          },
        ],
      };
    }
  }
);

// PowerPlatform entity metadata
server.tool(
  "get-entity-metadata",
  "Get metadata about a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const metadata = await service.getEntityMetadata(entityName);
      
      // Format the metadata as a string for text display
      const metadataStr = JSON.stringify(metadata, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Entity metadata for '${entityName}':\n\n${metadataStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity metadata:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity metadata: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform entity attributes
server.tool(
  "get-entity-attributes",
  "Get attributes/fields of a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const attributes = await service.getEntityAttributes(entityName);
      
      // Format the attributes as a string for text display
      const attributesStr = JSON.stringify(attributes, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Attributes for entity '${entityName}':\n\n${attributesStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity attributes:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity attributes: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform specific entity attribute
server.tool(
  "get-entity-attribute",
  "Get a specific attribute/field of a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().describe("The logical name of the attribute")
  },
  async ({ entityName, attributeName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const attribute = await service.getEntityAttribute(entityName, attributeName);
      
      // Format the attribute as a string for text display
      const attributeStr = JSON.stringify(attribute, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Attribute '${attributeName}' for entity '${entityName}':\n\n${attributeStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity attribute:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity attribute: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform entity relationships
server.tool(
  "get-entity-relationships",
  "Get relationships (one-to-many and many-to-many) for a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const relationships = await service.getEntityRelationships(entityName);
      
      // Format the relationships as a string for text display
      const relationshipsStr = JSON.stringify(relationships, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Relationships for entity '${entityName}':\n\n${relationshipsStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity relationships:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity relationships: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform global option set
server.tool(
  "get-global-option-set",
  "Get a global option set definition by name",
  {
    optionSetName: z.string().describe("The name of the global option set"),
  },
  async ({ optionSetName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const optionSet = await service.getGlobalOptionSet(optionSetName);
      
      // Format the option set as a string for text display
      const optionSetStr = JSON.stringify(optionSet, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Global option set '${optionSetName}':\n\n${optionSetStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting global option set:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get global option set: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform record by ID
server.tool(
  "get-record",
  "Get a specific record by entity name (plural) and ID",
  {
    entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
    recordId: z.string().describe("The GUID of the record"),
  },
  async ({ entityNamePlural, recordId }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const record = await service.getRecord(entityNamePlural, recordId);
      
      // Format the record as a string for text display
      const recordStr = JSON.stringify(record, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Record from '${entityNamePlural}' with ID '${recordId}':\n\n${recordStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting record:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get record: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform query records with filter
server.tool(
  "query-records",
  "Query records using an OData filter expression",
  {
    entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
    filter: z.string().describe("OData filter expression (e.g., \"name eq 'test'\" or \"createdon gt 2023-01-01\")"),
    maxRecords: z.number().optional().describe("Maximum number of records to retrieve (default: 50)"),
  },
  async ({ entityNamePlural, filter, maxRecords }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const records = await service.queryRecords(entityNamePlural, filter, maxRecords || 50);
      
      // Format the records as a string for text display
      const recordsStr = JSON.stringify(records, null, 2);
      const recordCount = records.value?.length || 0;
      
      return {
        content: [
          {
            type: "text",
            text: `Retrieved ${recordCount} records from '${entityNamePlural}' with filter '${filter}':\n\n${recordsStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error querying records:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to query records: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform create record
server.tool(
  "create-record",
  "Create a new record in Dataverse. Requires POWERPLATFORM_ENABLE_CREATE=true.",
  {
    entityNamePlural: z
      .string()
      .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
    data: z
      .record(z.any())
      .describe(
        "Record data as JSON object. Field names must match logical names (e.g., {'name': 'Acme Corp', 'telephone1': '555-1234'}). " +
        "For lookup fields, use '@odata.bind' syntax: {'parentaccountid@odata.bind': '/accounts(guid)'}. " +
        "For option sets, use integer values."
      ),
  },
  async ({ entityNamePlural, data }) => {
    try {
      checkCreateEnabled();
      const service = getPowerPlatformService();
      const result = await service.createRecord(entityNamePlural, data);

      return {
        content: [
          {
            type: "text",
            text: `✅ Record created successfully in ${entityNamePlural}\n\n` +
              `**Record ID:** ${result.id || result[Object.keys(result).find(k => k.endsWith('id')) || ''] || 'N/A'}\n\n` +
              `**Created Record:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error creating record:", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to create record: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// PowerPlatform update record
server.tool(
  "update-record",
  "Update an existing record in Dataverse. Requires POWERPLATFORM_ENABLE_UPDATE=true.",
  {
    entityNamePlural: z
      .string()
      .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
    recordId: z
      .string()
      .describe("The GUID of the record to update"),
    data: z
      .record(z.any())
      .describe(
        "Partial record data to update (only fields being changed). " +
        "Field names must match logical names. " +
        "Use '@odata.bind' syntax for lookups, integer values for option sets."
      ),
  },
  async ({ entityNamePlural, recordId, data }) => {
    try {
      checkUpdateEnabled();
      const service = getPowerPlatformService();
      const result = await service.updateRecord(entityNamePlural, recordId, data);

      return {
        content: [
          {
            type: "text",
            text: `✅ Record updated successfully in ${entityNamePlural}\n\n` +
              `**Record ID:** ${recordId}\n\n` +
              `**Updated Record:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error updating record:", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to update record: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// PowerPlatform delete record
server.tool(
  "delete-record",
  "Delete a record from Dataverse. Requires POWERPLATFORM_ENABLE_DELETE=true. WARNING: This operation is permanent and cannot be undone.",
  {
    entityNamePlural: z
      .string()
      .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
    recordId: z
      .string()
      .describe("The GUID of the record to delete"),
    confirm: z
      .boolean()
      .optional()
      .describe("Confirmation flag - must be true to proceed with deletion (safety check)"),
  },
  async ({ entityNamePlural, recordId, confirm }) => {
    try {
      checkDeleteEnabled();

      // Require explicit confirmation for deletion
      if (confirm !== true) {
        return {
          content: [
            {
              type: "text",
              text: `⚠️  Delete operation requires explicit confirmation.\n\n` +
                `You are about to delete record **${recordId}** from **${entityNamePlural}**.\n\n` +
                `This operation is **permanent** and **cannot be undone**.\n\n` +
                `To proceed, call this tool again with \`confirm: true\`.`,
            },
          ],
        };
      }

      const service = getPowerPlatformService();
      await service.deleteRecord(entityNamePlural, recordId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Record deleted successfully\n\n` +
              `**Entity:** ${entityNamePlural}\n` +
              `**Record ID:** ${recordId}\n\n` +
              `⚠️  This operation is permanent.`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error deleting record:", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to delete record: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Plugin Assemblies List Tool
server.tool(
  "get-plugin-assemblies",
  "Get a list of all plugin assemblies in the environment",
  {
    includeManaged: z.boolean().optional().describe("Include managed assemblies (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of assemblies to return (default: 100)"),
  },
  async ({ includeManaged, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPluginAssemblies(includeManaged || false, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} plugin assemblies:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting plugin assemblies:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get plugin assemblies: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Plugin Assembly Tool
server.tool(
  "get-plugin-assembly-complete",
  "Get comprehensive information about a plugin assembly including all types, steps, images, and validation",
  {
    assemblyName: z.string().describe("The name of the plugin assembly"),
    includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
  },
  async ({ assemblyName, includeDisabled }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPluginAssemblyComplete(assemblyName, includeDisabled || false);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Plugin assembly '${assemblyName}' complete information:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting plugin assembly:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get plugin assembly: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Entity Plugin Pipeline Tool
server.tool(
  "get-entity-plugin-pipeline",
  "Get all plugins that execute on a specific entity, organized by message and execution order",
  {
    entityName: z.string().describe("The logical name of the entity"),
    messageFilter: z.string().optional().describe("Filter by message name (e.g., 'Create', 'Update', 'Delete')"),
    includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
  },
  async ({ entityName, messageFilter, includeDisabled }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getEntityPluginPipeline(entityName, messageFilter, includeDisabled || false);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Plugin pipeline for entity '${entityName}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity plugin pipeline:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity plugin pipeline: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Plugin Trace Logs Tool
server.tool(
  "get-plugin-trace-logs",
  "Query plugin trace logs with filtering and exception parsing",
  {
    entityName: z.string().optional().describe("Filter by entity logical name"),
    messageName: z.string().optional().describe("Filter by message name (e.g., 'Update')"),
    correlationId: z.string().optional().describe("Filter by correlation ID"),
    pluginStepId: z.string().optional().describe("Filter by specific step ID"),
    exceptionOnly: z.boolean().optional().describe("Only return logs with exceptions (default: false)"),
    hoursBack: z.number().optional().describe("How many hours back to search (default: 24)"),
    maxRecords: z.number().optional().describe("Maximum number of logs to return (default: 50)"),
  },
  async ({ entityName, messageName, correlationId, pluginStepId, exceptionOnly, hoursBack, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPluginTraceLogs({
        entityName,
        messageName,
        correlationId,
        pluginStepId,
        exceptionOnly: exceptionOnly || false,
        hoursBack: hoursBack || 24,
        maxRecords: maxRecords || 50
      });

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Plugin trace logs (found ${result.totalCount}):\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting plugin trace logs:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get plugin trace logs: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Power Automate Flows Tool
server.tool(
  "get-flows",
  "Get a list of all Power Automate cloud flows in the environment",
  {
    activeOnly: z.boolean().optional().describe("Only return activated flows (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of flows to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getFlows(activeOnly || false, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} Power Automate flows:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting flows:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get flows: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Flow Definition Tool
server.tool(
  "get-flow-definition",
  "Get the complete definition of a specific Power Automate flow including its logic",
  {
    flowId: z.string().describe("The GUID of the flow (workflowid)"),
  },
  async ({ flowId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getFlowDefinition(flowId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Flow definition for '${result.name}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting flow definition:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get flow definition: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Flow Runs Tool
server.tool(
  "get-flow-runs",
  "Get the run history for a specific Power Automate flow with success/failure status",
  {
    flowId: z.string().describe("The GUID of the flow (workflowid)"),
    maxRecords: z.number().optional().describe("Maximum number of runs to return (default: 100)"),
  },
  async ({ flowId, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getFlowRuns(flowId, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      // Calculate success/failure stats
      const stats = result.runs.reduce((acc: any, run: any) => {
        if (run.status === 'Succeeded') acc.succeeded++;
        else if (run.status === 'Failed' || run.status === 'Faulted' || run.status === 'TimedOut') acc.failed++;
        else if (run.status === 'Running' || run.status === 'Waiting') acc.inProgress++;
        else acc.other++;
        return acc;
      }, { succeeded: 0, failed: 0, inProgress: 0, other: 0 });

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} flow runs for flow ${flowId}:\n\nStats:\n- Succeeded: ${stats.succeeded}\n- Failed: ${stats.failed}\n- In Progress: ${stats.inProgress}\n- Other: ${stats.other}\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting flow runs:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get flow runs: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Classic Dynamics Workflows Tool
server.tool(
  "get-workflows",
  "Get a list of all classic Dynamics workflows in the environment",
  {
    activeOnly: z.boolean().optional().describe("Only return activated workflows (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of workflows to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWorkflows(activeOnly || false, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} classic Dynamics workflows:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting workflows:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get workflows: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Workflow Definition Tool
server.tool(
  "get-workflow-definition",
  "Get the complete definition of a specific classic Dynamics workflow including its XAML",
  {
    workflowId: z.string().describe("The GUID of the workflow (workflowid)"),
  },
  async ({ workflowId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWorkflowDefinition(workflowId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Workflow definition for '${result.name}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting workflow definition:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get workflow definition: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Business Rules Tool
server.tool(
  "get-business-rules",
  "Get a list of all business rules in the environment (read-only for troubleshooting)",
  {
    activeOnly: z.boolean().optional().describe("Only return activated business rules (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of business rules to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getBusinessRules(activeOnly || false, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} business rules:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting business rules:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get business rules: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Business Rule Definition Tool
server.tool(
  "get-business-rule",
  "Get the complete definition of a specific business rule including its XAML (read-only for troubleshooting)",
  {
    workflowId: z.string().describe("The GUID of the business rule (workflowid)"),
  },
  async ({ workflowId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getBusinessRule(workflowId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Business rule definition for '${result.name}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting business rule:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get business rule: ${error.message}`,
          },
        ],
      };
    }
  }
);

// ==================== MODEL-DRIVEN APP TOOLS ====================

// Get Apps Tool
server.tool(
  "get-apps",
  "Get all model-driven apps in the PowerPlatform environment",
  {
    activeOnly: z.boolean().optional().describe("Only return active apps (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of apps to return (default: 100)"),
    includeUnpublished: z.boolean().optional().describe("Include unpublished/draft apps (default: true)"),
    solutionUniqueName: z.string().optional().describe("Filter apps by solution unique name (e.g., 'MCPTestCore')"),
  },
  async ({ activeOnly, maxRecords, includeUnpublished, solutionUniqueName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getApps(
        activeOnly || false,
        maxRecords || 100,
        includeUnpublished !== undefined ? includeUnpublished : true,
        solutionUniqueName
      );

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Model-Driven Apps (found ${result.totalCount}):\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting apps:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get apps: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Get App Tool
server.tool(
  "get-app",
  "Get detailed information about a specific model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getApp(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Model-Driven App '${result.name}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting app:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get app: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Get App Components Tool
server.tool(
  "get-app-components",
  "Get all components (entities, forms, views, sitemaps) in a model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getAppComponents(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `App Components (found ${result.totalCount}):\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting app components:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get app components: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Get App Sitemap Tool
server.tool(
  "get-app-sitemap",
  "Get the sitemap (navigation) configuration for a model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getAppSitemap(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `App Sitemap:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting app sitemap:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get app sitemap: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Create App Tool - REMOVED DUE TO DATAVERSE API BUG
// See CREATE_APP_API_BUG_REPORT.md for details
// The API consistently creates orphaned solution components without creating the actual appmodule record
// Workaround: Create apps manually via Power Apps maker portal

// Add Entities to App Tool
server.tool(
  "add-entities-to-app",
  "Add entities to a model-driven app (automatically adds them to navigation)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
    entityNames: z.array(z.string()).describe("Array of entity logical names to add (e.g., ['account', 'contact'])"),
  },
  async ({ appId, entityNames }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.addEntitiesToApp(appId, entityNames);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Entities added successfully:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error adding entities to app:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to add entities to app: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Validate App Tool
server.tool(
  "validate-app",
  "Validate a model-driven app before publishing (checks for missing components and configuration issues)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.validateApp(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `App validation result:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error validating app:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to validate app: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Publish App Tool
server.tool(
  "publish-app",
  "Publish a model-driven app to make it available to users (automatically validates first)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.publishApp(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `App published successfully:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error publishing app:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to publish app: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// ==================== AZURE DEVOPS WIKI TOOLS ====================

// Get Wikis Tool
server.tool(
  "get-wikis",
  "Get all wikis in an Azure DevOps project",
  {
    project: z.string().describe("The project name"),
  },
  async ({ project }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.getWikis(project);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Wikis in project '${project}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting wikis:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get wikis: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Search Wiki Pages Tool
server.tool(
  "search-wiki-pages",
  "Search wiki pages across Azure DevOps projects",
  {
    searchText: z.string().describe("The text to search for"),
    project: z.string().optional().describe("Optional project filter"),
    maxResults: z.number().optional().describe("Maximum number of results (default: 25)"),
  },
  async ({ searchText, project, maxResults }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.searchWikiPages(searchText, project, maxResults);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Wiki search results for '${searchText}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error searching wiki pages:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search wiki pages: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Get Wiki Page Tool
server.tool(
  "get-wiki-page",
  "Get a specific wiki page with content from Azure DevOps",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier (ID or name)"),
    pagePath: z.string().describe("The path to the page (e.g., '/Setup/Authentication')"),
    includeContent: z.boolean().optional().describe("Include page content (default: true)"),
  },
  async ({ project, wikiId, pagePath, includeContent }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.getWikiPage(project, wikiId, pagePath, includeContent ?? true);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Wiki page '${pagePath}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting wiki page:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get wiki page: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Create Wiki Page Tool
server.tool(
  "create-wiki-page",
  "Create a new wiki page in Azure DevOps (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier"),
    pagePath: z.string().describe("The path for the new page (e.g., '/Setup/NewGuide')"),
    content: z.string().describe("The markdown content for the page"),
  },
  async ({ project, wikiId, pagePath, content }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.createWikiPage(project, wikiId, pagePath, content);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Created wiki page '${pagePath}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error creating wiki page:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create wiki page: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Update Wiki Page Tool
server.tool(
  "update-wiki-page",
  "Update an existing wiki page in Azure DevOps (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier"),
    pagePath: z.string().describe("The path to the page"),
    content: z.string().describe("The updated markdown content"),
    version: z.string().optional().describe("The ETag/version for optimistic concurrency"),
  },
  async ({ project, wikiId, pagePath, content, version }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.updateWikiPage(project, wikiId, pagePath, content, version);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Updated wiki page '${pagePath}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error updating wiki page:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to update wiki page: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// String Replace Wiki Page Tool
server.tool(
  "azuredevops-str-replace-wiki-page",
  "Replace a specific string in an Azure DevOps wiki page without rewriting entire content. More efficient than update-wiki-page for small changes. (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier (ID or name)"),
    pagePath: z.string().describe("The path to the wiki page (e.g., '/SharePoint-Online/04-DEV-Configuration')"),
    old_str: z.string().describe("The exact string to replace (must be unique unless replace_all is true)"),
    new_str: z.string().describe("The replacement string"),
    replace_all: z.boolean().optional().describe("If true, replace all occurrences. If false (default), old_str must be unique in the page."),
    description: z.string().optional().describe("Optional description of the change (for audit logging)")
  },
  async ({ project, wikiId, pagePath, old_str, new_str, replace_all, description }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.strReplaceWikiPage(
        project,
        wikiId,
        pagePath,
        old_str,
        new_str,
        replace_all ?? false,
        description
      );

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Successfully replaced "${old_str}" with "${new_str}" in wiki page '${pagePath}' (${result.occurrences} occurrence(s)):\n\n${resultStr}\n\nDiff:\n${result.diff}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error replacing text in wiki page:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to replace text in wiki page: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ==================== AZURE DEVOPS WORK ITEM TOOLS ====================

// Get Work Item Tool
server.tool(
  "get-work-item",
  "Get a work item by ID with full details from Azure DevOps",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
  },
  async ({ project, workItemId }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.getWorkItem(project, workItemId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting work item:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get work item: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Query Work Items Tool
server.tool(
  "query-work-items",
  "Query work items using WIQL (Work Item Query Language) in Azure DevOps",
  {
    project: z.string().describe("The project name"),
    wiql: z.string().describe("The WIQL query string (e.g., \"SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.State] = 'Active'\")"),
    maxResults: z.number().optional().describe("Maximum number of results (default: 200)"),
  },
  async ({ project, wiql, maxResults }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.queryWorkItems(project, wiql, maxResults);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Work items query results:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error querying work items:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to query work items: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Get Work Item Comments Tool
server.tool(
  "get-work-item-comments",
  "Get comments/discussion for a work item in Azure DevOps",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
  },
  async ({ project, workItemId }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.getWorkItemComments(project, workItemId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Comments for work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting work item comments:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get work item comments: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Add Work Item Comment Tool
server.tool(
  "add-work-item-comment",
  "Add a comment to a work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
    commentText: z.string().describe("The comment text (supports markdown)"),
  },
  async ({ project, workItemId, commentText }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.addWorkItemComment(project, workItemId, commentText);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Added comment to work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error adding work item comment:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to add work item comment: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Update Work Item Tool
server.tool(
  "update-work-item",
  "Update a work item in Azure DevOps using JSON Patch operations (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
    patchOperations: z.array(z.object({
      op: z.string().describe("The operation type (e.g., 'add', 'replace', 'remove')"),
      path: z.string().describe("The field path (e.g., '/fields/System.State')"),
      value: z.any().optional().describe("The value to set (not required for 'remove' operation)")
    })).describe("Array of JSON Patch operations"),
  },
  async ({ project, workItemId, patchOperations }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.updateWorkItem(project, workItemId, patchOperations);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Updated work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error updating work item:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to update work item: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Create Work Item Tool
server.tool(
  "create-work-item",
  "Create a new work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    workItemType: z.string().describe("The work item type (e.g., 'Bug', 'Task', 'User Story')"),
    fields: z.record(z.any()).describe("Object with field values (e.g., {\"System.Title\": \"Bug title\", \"System.Description\": \"Details\"})"),
  },
  async ({ project, workItemType, fields }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.createWorkItem(project, workItemType, fields);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Created work item:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error creating work item:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create work item: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Delete Work Item Tool
server.tool(
  "delete-work-item",
  "Delete a work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true)",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
  },
  async ({ project, workItemId }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.deleteWorkItem(project, workItemId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Deleted work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error deleting work item:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to delete work item: ${error.message}`,
          },
        ],
      };
    }
  }
);

// ==================== FIGMA TOOLS ====================

/**
 * Tool: get-figma-data
 * Fetches and simplifies Figma file or node data for AI consumption
 */
server.tool(
  "get-figma-data",
  "Get comprehensive Figma design data including layout, text, styles, and components. " +
  "Fetches from Figma API and transforms into simplified, AI-friendly format. " +
  "Can fetch entire files or specific nodes. Automatically deduplicates styles.",
  {
    fileKey: z.string().describe(
      "Figma file key (alphanumeric string from URL). " +
      "Example: From 'https://figma.com/file/ABC123/MyFile', use 'ABC123'"
    ),
    nodeId: z.string().optional().describe(
      "Optional specific node ID(s) to fetch. Format: '1234:5678' or multiple '1:10;2:20'. " +
      "If omitted, fetches entire file."
    ),
    depth: z.number().optional().describe(
      "Optional tree traversal depth limit. Useful for large files. " +
      "Example: depth=3 stops after 3 levels of children."
    ),
  },
  async ({ fileKey, nodeId, depth }) => {
    try {
      const service = getFigmaService();
      const result = await service.getFigmaData(fileKey, nodeId, depth);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }],
        isError: false,
      };
    } catch (error: any) {
      console.error("Error fetching Figma data:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to fetch Figma data: ${error.message}\n\n` +
                `Troubleshooting:\n` +
                `1. Verify FIGMA_API_KEY or FIGMA_OAUTH_TOKEN is set\n` +
                `2. Check file key is correct (from Figma URL)\n` +
                `3. Ensure you have access to the file in Figma\n` +
                `4. For OAuth, check token hasn't expired`
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: download-figma-images (v2 Feature)
 * Placeholder for future image download functionality
 */
server.tool(
  "download-figma-images",
  "Download and process images from Figma designs (Coming in v2)",
  {
    fileKey: z.string().describe("Figma file key"),
    localPath: z.string().describe("Local path to save images"),
  },
  async ({ fileKey, localPath }) => {
    return {
      content: [{
        type: "text",
        text: "Image download functionality is planned for v2. " +
              "This will include:\n" +
              "- Download PNG/SVG exports\n" +
              "- Crop images with Figma transforms\n" +
              "- Generate CSS dimension variables\n" +
              "- Support for image fills and rendered nodes\n\n" +
              "For now, use get-figma-data to retrieve design metadata."
      }],
      isError: false,
    };
  }
);

// ==================== POWERPLATFORM CUSTOMIZATION TOOLS ====================

// Helper function to check if customization is enabled
function checkCustomizationEnabled(): void {
  if (!POWERPLATFORM_CUSTOMIZATION_ENABLED) {
    throw new Error(
      "PowerPlatform customization features are disabled. " +
      "Set POWERPLATFORM_ENABLE_CUSTOMIZATION=true in your environment to enable these tools."
    );
  }
}

/**
 * Helper: Check if record creation is enabled
 */
function checkCreateEnabled(): void {
  if (!POWERPLATFORM_CREATE_ENABLED) {
    throw new Error(
      "PowerPlatform record creation is disabled. " +
      "Set POWERPLATFORM_ENABLE_CREATE=true in your environment to enable record creation. " +
      "⚠️  WARNING: This allows AI agents to create data in your Dataverse environment. " +
      "Only enable in development/sandbox environments."
    );
  }
}

/**
 * Helper: Check if record updates are enabled
 */
function checkUpdateEnabled(): void {
  if (!POWERPLATFORM_UPDATE_ENABLED) {
    throw new Error(
      "PowerPlatform record updates are disabled. " +
      "Set POWERPLATFORM_ENABLE_UPDATE=true in your environment to enable record updates. " +
      "⚠️  WARNING: This allows AI agents to modify data in your Dataverse environment. " +
      "Only enable in development/sandbox environments."
    );
  }
}

/**
 * Helper: Check if record deletion is enabled
 */
function checkDeleteEnabled(): void {
  if (!POWERPLATFORM_DELETE_ENABLED) {
    throw new Error(
      "PowerPlatform record deletion is disabled. " +
      "Set POWERPLATFORM_ENABLE_DELETE=true in your environment to enable record deletion. " +
      "⚠️  DANGER: This allows AI agents to permanently delete data from your Dataverse environment. " +
      "Only enable in development/sandbox environments with proper backups."
    );
  }
}

/**
 * Tool: create-entity
 * Create a new custom entity (table) in Dynamics 365
 */
server.tool(
  "create-entity",
  "Create a new custom entity (table) in Dynamics 365 / PowerPlatform. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    schemaName: z.string().describe("The schema name of the entity (e.g., 'sic_application')"),
    displayName: z.string().describe("The display name of the entity (e.g., 'Application')"),
    pluralDisplayName: z.string().describe("The plural display name (e.g., 'Applications')"),
    description: z.string().describe("Description of the entity"),
    ownershipType: z.enum(["UserOwned", "TeamOwned", "OrganizationOwned"]).describe("Ownership type (default: UserOwned)"),
    hasActivities: z.boolean().optional().describe("Enable activities (default: false)"),
    hasNotes: z.boolean().optional().describe("Enable notes (default: false)"),
    isActivityParty: z.boolean().optional().describe("Can be a party in activities (default: false)"),
    primaryAttributeSchemaName: z.string().optional().describe("Schema name for primary attribute (default: 'name')"),
    primaryAttributeDisplayName: z.string().optional().describe("Display name for primary attribute (default: 'Name')"),
    primaryAttributeMaxLength: z.number().optional().describe("Max length for primary attribute (default: 850)"),
    solutionUniqueName: z.string().optional().describe("Solution to add entity to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not specified)")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Construct entity definition
      const entityDefinition = {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        SchemaName: params.schemaName,
        DisplayName: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.displayName,
              LanguageCode: 1033
            }
          ]
        },
        DisplayCollectionName: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.pluralDisplayName,
              LanguageCode: 1033
            }
          ]
        },
        Description: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.description,
              LanguageCode: 1033
            }
          ]
        },
        OwnershipType: params.ownershipType,
        IsActivity: false,
        HasActivities: params.hasActivities || false,
        HasNotes: params.hasNotes || false,
        IsActivityParty: params.isActivityParty || false,
        IsDuplicateDetectionEnabled: { Value: false, CanBeChanged: true },
        IsMailMergeEnabled: { Value: false, CanBeChanged: true },
        Attributes: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            SchemaName: params.primaryAttributeSchemaName || "name",
            IsPrimaryName: true,
            RequiredLevel: {
              Value: "None",
              CanBeChanged: true
            },
            MaxLength: params.primaryAttributeMaxLength || 850,
            FormatName: {
              Value: "Text"
            },
            DisplayName: {
              "@odata.type": "Microsoft.Dynamics.CRM.Label",
              LocalizedLabels: [
                {
                  "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                  Label: params.primaryAttributeDisplayName || "Name",
                  LanguageCode: 1033
                }
              ]
            },
            Description: {
              "@odata.type": "Microsoft.Dynamics.CRM.Label",
              LocalizedLabels: [
                {
                  "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                  Label: "The primary attribute for the entity",
                  LanguageCode: 1033
                }
              ]
            }
          }
        ],
        HasFeedback: false
      };

      const solutionName = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION || undefined;
      const result = await service.createEntity(entityDefinition, solutionName);

      return {
        content: [
          {
            type: "text",
            text: `Successfully created entity '${params.schemaName}'.\n\n` +
                  `Details:\n${JSON.stringify(result, null, 2)}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating entity:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create entity: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: update-entity
 * Update an existing entity
 */
server.tool(
  "update-entity",
  "Update an existing custom entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("The MetadataId of the entity (GUID)"),
    displayName: z.string().optional().describe("New display name"),
    pluralDisplayName: z.string().optional().describe("New plural display name"),
    description: z.string().optional().describe("New description"),
    hasActivities: z.boolean().optional().describe("Enable/disable activities"),
    hasNotes: z.boolean().optional().describe("Enable/disable notes"),
    solutionUniqueName: z.string().optional().describe("Solution context")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};

      if (params.displayName) {
        updates.DisplayName = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.displayName, LanguageCode: 1033 }]
        };
      }

      if (params.pluralDisplayName) {
        updates.DisplayCollectionName = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.pluralDisplayName, LanguageCode: 1033 }]
        };
      }

      if (params.description) {
        updates.Description = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.description, LanguageCode: 1033 }]
        };
      }

      if (params.hasActivities !== undefined) updates.HasActivities = params.hasActivities;
      if (params.hasNotes !== undefined) updates.HasNotes = params.hasNotes;

      await service.updateEntity(params.metadataId, updates, params.solutionUniqueName);

      return {
        content: [{ type: "text", text: `✅ Successfully updated entity (${params.metadataId})\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error updating entity:", error);
      return { content: [{ type: "text", text: `Failed to update entity: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: update-entity-icon
 * Update entity icon using Fluent UI System Icons
 */
server.tool(
  "update-entity-icon",
  "Update entity icon using Fluent UI System Icons from Microsoft's official icon library. Creates a web resource and sets it as the entity icon. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("The logical name of the entity (e.g., 'sic_strikeaction')"),
    iconFileName: z.string().describe("Fluent UI icon file name (e.g., 'people_community_24_filled.svg'). Browse icons at: https://github.com/microsoft/fluentui-system-icons"),
    solutionUniqueName: z.string().optional().describe("Solution to add the web resource to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not specified)")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const result = await service.updateEntityIcon(
        params.entityLogicalName,
        params.iconFileName,
        params.solutionUniqueName
      );

      const message = `✅ Successfully updated entity icon

**Entity:** ${result.entityLogicalName} (${result.entitySchemaName})
**Icon:** ${result.iconFileName}
**Web Resource:** ${result.webResourceName}
**Web Resource ID:** ${result.webResourceId}
**Icon Vector Name:** ${result.iconVectorName}

✨ **Published:** The icon has been automatically published and should now be visible in the UI.

💡 TIP: Browse available Fluent UI icons at https://github.com/microsoft/fluentui-system-icons`;

      return {
        content: [{ type: "text", text: message }]
      };
    } catch (error: any) {
      console.error("Error updating entity icon:", error);
      return {
        content: [{
          type: "text",
          text: `❌ Failed to update entity icon: ${error.message}\n\n💡 Make sure the icon file name is valid (e.g., 'people_community_24_filled.svg'). Browse available icons at https://github.com/microsoft/fluentui-system-icons`
        }],
        isError: true
      };
    }
  }
);

/**
 * Tool: delete-entity
 * Delete a custom entity
 */
server.tool(
  "delete-entity",
  "Delete a custom entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("The MetadataId of the entity to delete (GUID)")
  },
  async ({ metadataId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteEntity(metadataId);

      return {
        content: [{ type: "text", text: `✅ Successfully deleted entity (${metadataId})\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting entity:", error);
      return { content: [{ type: "text", text: `Failed to delete entity: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: create-attribute
 * Create a new attribute (column) on an entity
 */
server.tool(
  "create-attribute",
  "Create a new attribute (column) on a Dynamics 365 entity. Supports most attribute types. CRITICAL LIMITATIONS: (1) Local option sets are NOT SUPPORTED - all Picklist/MultiSelectPicklist attributes MUST use global option sets. Provide 'optionSetOptions' to auto-create a new global option set, or 'globalOptionSetName' to reference existing. (2) Customer-type attributes (polymorphic lookups) CANNOT be created via SDK - use a standard Lookup to Account or Contact instead, or create manually via Power Apps maker portal. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("The logical name of the entity"),
    attributeType: z.enum([
      "String", "Memo", "Integer", "Decimal", "Money", "DateTime",
      "Boolean", "Picklist", "Lookup", "Customer", "MultiSelectPicklist", "AutoNumber"
    ]).describe("The type of attribute to create"),
    schemaName: z.string().describe("The schema name of the attribute (e.g., 'sic_description')"),
    displayName: z.string().describe("The display name of the attribute"),
    description: z.string().optional().describe("Description of the attribute"),
    isRequired: z.boolean().optional().describe("Whether the attribute is required (default: false)"),
    // String-specific
    maxLength: z.number().optional().describe("Max length (for String/Memo attributes)"),
    // AutoNumber-specific
    autoNumberFormat: z.string().optional().describe(
      "Auto-number format string (for AutoNumber type). " +
      "Use placeholders: {SEQNUM:n} for sequential number (min length n), " +
      "{RANDSTRING:n} for random alphanumeric (length 1-6 only), " +
      "{DATETIMEUTC:format} for UTC timestamp (.NET format). " +
      "Example: 'AUTO-{SEQNUM:5}-{RANDSTRING:4}' produces AUTO-00001-A7K2, AUTO-00002-B9M4, etc."
    ),
    // Decimal/Money-specific
    precision: z.number().optional().describe("Precision (for Decimal/Money attributes)"),
    minValue: z.number().optional().describe("Minimum value (for Integer/Decimal/Money attributes)"),
    maxValue: z.number().optional().describe("Maximum value (for Integer/Decimal/Money attributes)"),
    // DateTime-specific
    dateTimeBehavior: z.enum(["UserLocal", "DateOnly", "TimeZoneIndependent"]).optional().describe("DateTime behavior"),
    // Picklist-specific
    globalOptionSetName: z.string().optional().describe("Name of existing global option set to use (for Picklist/MultiSelectPicklist). If not provided and optionSetOptions is given, a new global option set will be created automatically."),
    optionSetOptions: z.union([
      z.array(z.string()),
      z.array(z.object({
        value: z.number(),
        label: z.string()
      }))
    ]).optional().describe("Options for new global option set. Can be either: 1) Array of strings (values auto-numbered 0,1,2...) RECOMMENDED, or 2) Array of {value, label} objects for custom values. A global option set will be created automatically with the name matching the attribute SchemaName."),
    // Lookup-specific
    referencedEntity: z.string().optional().describe("Referenced entity logical name (for Lookup attributes)"),
    relationshipSchemaName: z.string().optional().describe("Schema name for the relationship (for Lookup attributes)"),
    solutionUniqueName: z.string().optional().describe("Solution to add attribute to")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Validate Customer attribute type early with helpful error
      if (params.attributeType === "Customer") {
        throw new Error(
          "Customer-type attributes cannot be created via the PowerPlatform SDK.\n\n" +
          "🔴 MICROSOFT LIMITATION: The Dataverse Web API does not support programmatic creation of Customer (polymorphic lookup) attributes.\n\n" +
          "✅ WORKAROUNDS:\n" +
          "1. Create manually via Power Apps maker portal (make.powerapps.com)\n" +
          "2. Use a standard Lookup to a specific entity:\n" +
          "   - For Account: Set attributeType='Lookup' and referencedEntity='account'\n" +
          "   - For Contact: Set attributeType='Lookup' and referencedEntity='contact'\n" +
          "3. Create separate lookup fields:\n" +
          "   - " + params.schemaName + "_account (Lookup to Account)\n" +
          "   - " + params.schemaName + "_contact (Lookup to Contact)\n" +
          "   - Use business logic to ensure only one is populated\n\n" +
          "For more information, see Microsoft's documentation on Customer attributes."
        );
      }

      // Build base attribute definition
      const baseDefinition: any = {
        SchemaName: params.schemaName,
        RequiredLevel: {
          Value: params.isRequired ? "ApplicationRequired" : "None",
          CanBeChanged: true
        },
        DisplayName: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.displayName,
              LanguageCode: 1033
            }
          ]
        },
        Description: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.description || "",
              LanguageCode: 1033
            }
          ]
        }
      };

      let attributeDefinition: any;

      // Build type-specific definition
      switch (params.attributeType) {
        case "String":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            MaxLength: params.maxLength || 100,
            FormatName: { Value: "Text" }
          };
          break;

        case "AutoNumber":
          if (!params.autoNumberFormat) {
            throw new Error(
              "AutoNumber attributes require an 'autoNumberFormat' parameter.\n\n" +
              "Format placeholders:\n" +
              "  {SEQNUM:n}         - Sequential number (min length n, grows as needed)\n" +
              "  {RANDSTRING:n}     - Random alphanumeric string (length 1-6 ONLY)\n" +
              "  {DATETIMEUTC:fmt}  - UTC timestamp with .NET format\n\n" +
              "Examples:\n" +
              "  'AUTO-{SEQNUM:5}'                              → AUTO-00001, AUTO-00002...\n" +
              "  'CASE-{SEQNUM:4}-{DATETIMEUTC:yyyyMMdd}'      → CASE-0001-20250115\n" +
              "  'WID-{SEQNUM:3}-{RANDSTRING:6}'               → WID-001-A7K2M9\n\n" +
              "Note: RANDSTRING length must be 1-6 (API limitation)"
            );
          }

          // Validate RANDSTRING lengths (common error - API rejects length > 6)
          const randstringMatches = params.autoNumberFormat.match(/\{RANDSTRING:(\d+)\}/gi);
          if (randstringMatches) {
            for (const match of randstringMatches) {
              const lengthMatch = match.match(/\{RANDSTRING:(\d+)\}/i);
              if (lengthMatch) {
                const length = parseInt(lengthMatch[1]);
                if (length < 1 || length > 6) {
                  throw new Error(
                    `Invalid RANDSTRING length: ${length}\n\n` +
                    "RANDSTRING must be between 1-6 characters (Dataverse API limitation).\n" +
                    `Found in format: ${params.autoNumberFormat}\n\n` +
                    `Please change {RANDSTRING:${length}} to {RANDSTRING:6} or less.`
                  );
                }
              }
            }
          }

          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            AutoNumberFormat: params.autoNumberFormat,
            MaxLength: params.maxLength || 100,  // Default to 100, user can override
            FormatName: { Value: "Text" }  // MUST be Text for auto-number
          };
          break;

        case "Memo":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
            MaxLength: params.maxLength || 2000,
            Format: "TextArea"
          };
          break;

        case "Integer":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
            Format: "None",
            MinValue: params.minValue ?? -2147483648,
            MaxValue: params.maxValue ?? 2147483647
          };
          break;

        case "Decimal":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
            Precision: params.precision || 2,
            MinValue: params.minValue ?? -100000000000,
            MaxValue: params.maxValue ?? 100000000000
          };
          break;

        case "Money":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
            Precision: params.precision || 2,
            MinValue: params.minValue ?? -922337203685477,
            MaxValue: params.maxValue ?? 922337203685477,
            PrecisionSource: 2
          };
          break;

        case "DateTime":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
            Format: params.dateTimeBehavior === "DateOnly" ? "DateOnly" : "DateAndTime",
            DateTimeBehavior: {
              Value: params.dateTimeBehavior || "UserLocal"
            }
          };
          break;

        case "Boolean":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
            DefaultValue: false,
            OptionSet: {
              "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
              TrueOption: {
                Value: 1,
                Label: {
                  "@odata.type": "Microsoft.Dynamics.CRM.Label",
                  LocalizedLabels: [
                    {
                      "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                      Label: "Yes",
                      LanguageCode: 1033
                    }
                  ]
                }
              },
              FalseOption: {
                Value: 0,
                Label: {
                  "@odata.type": "Microsoft.Dynamics.CRM.Label",
                  LocalizedLabels: [
                    {
                      "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                      Label: "No",
                      LanguageCode: 1033
                    }
                  ]
                }
              }
            }
          };
          break;

        case "Picklist":
          // ALWAYS use global option sets
          if (params.globalOptionSetName) {
            // Using existing global option set - need to look up its MetadataId first
            const globalOptionSet = await service.getGlobalOptionSet(params.globalOptionSetName);
            const metadataId = globalOptionSet.MetadataId;

            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
              "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${metadataId})`
            };
          } else if (params.optionSetOptions && params.optionSetOptions.length > 0) {
            // Create NEW global option set in TWO steps:
            // Step 1: Create the global option set separately
            // Step 2: Create the attribute that references it

            const optionSetName = params.schemaName;

            // Normalize options: support both string[] (auto-numbered) and {value, label}[] formats
            const normalizedOptions = params.optionSetOptions.map((opt, index) => {
              if (typeof opt === 'string') {
                // Auto-number from 0
                return {
                  Value: index,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [
                      {
                        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                        Label: opt,
                        LanguageCode: 1033
                      }
                    ]
                  }
                };
              } else {
                // User provided explicit value
                return {
                  Value: opt.value,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [
                      {
                        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                        Label: opt.label,
                        LanguageCode: 1033
                      }
                    ]
                  }
                };
              }
            });

            // Step 1: Create the global option set first
            const globalOptionSetDefinition = {
              "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
              Name: optionSetName,
              DisplayName: baseDefinition.DisplayName,
              Description: baseDefinition.Description,
              IsGlobal: true,
              OptionSetType: "Picklist",
              Options: normalizedOptions
            };

            // Store this for later - we'll create it before the attribute
            (baseDefinition as any)._createGlobalOptionSetFirst = globalOptionSetDefinition;
            (baseDefinition as any)._globalOptionSetNameToLookup = optionSetName;

            // Step 2: Create attribute definition that REFERENCES the global option set
            // The MetadataId binding will be set after creating the global option set
            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
            };
          } else {
            throw new Error(
              "For Picklist attributes, you must provide either:\n" +
              "1. 'globalOptionSetName' to reference an existing global option set, OR\n" +
              "2. 'optionSetOptions' to create a new global option set automatically\n\n" +
              "Note: Local option sets are not supported - all option sets are created as global for consistency and reusability."
            );
          }
          break;

        case "Lookup":
          if (!params.referencedEntity) {
            throw new Error("referencedEntity is required for Lookup attributes");
          }
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            Targets: [params.referencedEntity]
          };

          // For lookups, we also need relationship information
          if (params.relationshipSchemaName) {
            (attributeDefinition as any).RelationshipSchemaName = params.relationshipSchemaName;
          }
          break;


        case "MultiSelectPicklist":
          // ALWAYS use global option sets
          if (params.globalOptionSetName) {
            // Using existing global option set - need to look up its MetadataId first
            const globalOptionSet = await service.getGlobalOptionSet(params.globalOptionSetName);
            const metadataId = globalOptionSet.MetadataId;

            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata",
              "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${metadataId})`
            };
          } else if (params.optionSetOptions && params.optionSetOptions.length > 0) {
            // Create NEW global option set in TWO steps:
            // Step 1: Create the global option set separately
            // Step 2: Create the attribute that references it

            const optionSetName = params.schemaName;

            // Normalize options: support both string[] (auto-numbered) and {value, label}[] formats
            const normalizedOptions = params.optionSetOptions.map((opt, index) => {
              if (typeof opt === 'string') {
                // Auto-number from 0
                return {
                  Value: index,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [
                      {
                        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                        Label: opt,
                        LanguageCode: 1033
                      }
                    ]
                  }
                };
              } else {
                // User provided explicit value
                return {
                  Value: opt.value,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [
                      {
                        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                        Label: opt.label,
                        LanguageCode: 1033
                      }
                    ]
                  }
                };
              }
            });

            // Step 1: Create the global option set first
            const globalOptionSetDefinition = {
              "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
              Name: optionSetName,
              DisplayName: baseDefinition.DisplayName,
              Description: baseDefinition.Description,
              IsGlobal: true,
              OptionSetType: "Picklist",
              Options: normalizedOptions
            };

            // Store this for later - we'll create it before the attribute
            (baseDefinition as any)._createGlobalOptionSetFirst = globalOptionSetDefinition;
            (baseDefinition as any)._globalOptionSetNameToLookup = optionSetName;

            // Step 2: Create attribute definition that REFERENCES the global option set
            // The MetadataId binding will be set after creating the global option set
            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata"
            };
          } else {
            throw new Error(
              "For MultiSelectPicklist attributes, you must provide either:\n" +
              "1. 'globalOptionSetName' to reference an existing global option set, OR\n" +
              "2. 'optionSetOptions' to create a new global option set automatically\n\n" +
              "Note: Local option sets are not supported - all option sets are created as global for consistency and reusability."
            );
          }
          break;

        default:
          throw new Error(`Attribute type '${params.attributeType}' is not yet fully implemented. Contact support.`);
      }

      const solutionName = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION || undefined;

      // Check if we need to create a global option set first (two-step process)
      if ((attributeDefinition as any)._createGlobalOptionSetFirst) {
        const globalOptionSetDef = (attributeDefinition as any)._createGlobalOptionSetFirst;
        const optionSetNameToLookup = (attributeDefinition as any)._globalOptionSetNameToLookup;
        delete (attributeDefinition as any)._createGlobalOptionSetFirst; // Clean up marker
        delete (attributeDefinition as any)._globalOptionSetNameToLookup;

        // Step 1: Create the global option set
        await service.createGlobalOptionSet(globalOptionSetDef, solutionName);

        // Step 1.5: Look up the created global option set to get its MetadataId
        const createdGlobalOptionSet = await service.getGlobalOptionSet(optionSetNameToLookup);
        const metadataId = createdGlobalOptionSet.MetadataId;

        // Add the binding to the attribute definition
        (attributeDefinition as any)["GlobalOptionSet@odata.bind"] = `/GlobalOptionSetDefinitions(${metadataId})`;
      }

      // Step 2: Create the attribute (which now references the global option set)
      const result = await service.createAttribute(
        params.entityLogicalName,
        attributeDefinition,
        solutionName
      );

      return {
        content: [
          {
            type: "text",
            text: `Successfully created ${params.attributeType} attribute '${params.schemaName}' on entity '${params.entityLogicalName}'.\n\n` +
                  (params.attributeType === "AutoNumber" && params.autoNumberFormat ? `Auto-number format: ${params.autoNumberFormat}\n\n` : "") +
                  `Details:\n${JSON.stringify(result, null, 2)}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating attribute:", error);

      // Provide helpful guidance for common errors
      let errorMessage = error.message;
      let helpfulGuidance = "";

      // Detect global option set errors
      if (errorMessage.includes("IsGlobal") || errorMessage.includes("0x80048403")) {
        helpfulGuidance = "\n\n🔴 ERROR EXPLANATION: An error occurred while creating the global option set.\n\n" +
          "✅ SOLUTION: This tool creates global option sets in a two-step process:\n" +
          "1. First, it creates the global option set\n" +
          "2. Then, it creates the attribute that references it\n\n" +
          "This error may mean:\n" +
          "- A global option set with name '" + params.schemaName + "' already exists\n" +
          "- There was an issue with the option set definition\n\n" +
          "Try using a different schema name or reference the existing global option set:\n" +
          "{\n" +
          "  entityLogicalName: \"" + params.entityLogicalName + "\",\n" +
          "  attributeType: \"" + params.attributeType + "\",\n" +
          "  schemaName: \"" + params.schemaName + "\",\n" +
          "  displayName: \"" + params.displayName + "\",\n" +
          "  globalOptionSetName: \"existing_option_set_name\"\n" +
          "}";
      }

      return {
        content: [
          {
            type: "text",
            text: `Failed to create attribute: ${errorMessage}${helpfulGuidance}`
          }
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: update-attribute
 * Update an existing attribute
 */
server.tool(
  "update-attribute",
  "Update an existing attribute on an entity. Supports converting String attributes to AutoNumber by setting autoNumberFormat. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name"),
    attributeLogicalName: z.string().describe("Attribute logical name"),
    displayName: z.string().optional().describe("New display name"),
    description: z.string().optional().describe("New description"),
    requiredLevel: z.enum(["None", "Recommended", "ApplicationRequired"]).optional().describe("Required level"),
    autoNumberFormat: z.string().optional().describe(
      "Auto-number format string to convert String attribute to AutoNumber. " +
      "Use placeholders: {SEQNUM:n} for sequential number (min length n), " +
      "{RANDSTRING:n} for random alphanumeric (length 1-6 only), " +
      "{DATETIMEUTC:format} for UTC timestamp (.NET format). " +
      "Example: 'AUTO-{SEQNUM:5}-{RANDSTRING:4}' produces AUTO-00001-A7K2, AUTO-00002-B9M4, etc."
    ),
    solutionUniqueName: z.string().optional().describe("Solution context")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};

      if (params.displayName) {
        updates.DisplayName = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.displayName, LanguageCode: 1033 }]
        };
      }

      if (params.description) {
        updates.Description = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.description, LanguageCode: 1033 }]
        };
      }

      if (params.requiredLevel) {
        updates.RequiredLevel = { Value: params.requiredLevel, CanBeChanged: true };
      }

      // Handle AutoNumber format conversion
      if (params.autoNumberFormat) {
        // Validate RANDSTRING lengths (common error - API rejects length > 6)
        const randstringMatches = params.autoNumberFormat.match(/\{RANDSTRING:(\d+)\}/gi);
        if (randstringMatches) {
          for (const match of randstringMatches) {
            const lengthMatch = match.match(/\{RANDSTRING:(\d+)\}/i);
            if (lengthMatch) {
              const length = parseInt(lengthMatch[1]);
              if (length < 1 || length > 6) {
                throw new Error(
                  `Invalid RANDSTRING length: ${length}\n\n` +
                  "RANDSTRING must be between 1-6 characters (Dataverse API limitation).\n" +
                  `Found in format: ${params.autoNumberFormat}\n\n` +
                  `Please change {RANDSTRING:${length}} to {RANDSTRING:6} or less.`
                );
              }
            }
          }
        }

        updates.AutoNumberFormat = params.autoNumberFormat;
      }

      await service.updateAttribute(params.entityLogicalName, params.attributeLogicalName, updates, params.solutionUniqueName);

      let successMessage = `✅ Successfully updated attribute '${params.attributeLogicalName}' on entity '${params.entityLogicalName}'`;

      if (params.autoNumberFormat) {
        successMessage += `\n\n📋 Auto-number format set to: ${params.autoNumberFormat}`;
        successMessage += `\n\n⚠️ NOTE: Converting to AutoNumber is irreversible. The attribute will now auto-generate values based on the format.`;
      }

      successMessage += `\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`;

      return {
        content: [{ type: "text", text: successMessage }]
      };
    } catch (error: any) {
      console.error("Error updating attribute:", error);
      return { content: [{ type: "text", text: `Failed to update attribute: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: delete-attribute
 * Delete an attribute from an entity
 */
server.tool(
  "delete-attribute",
  "Delete an attribute from an entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name"),
    attributeMetadataId: z.string().describe("Attribute MetadataId (GUID)")
  },
  async ({ entityLogicalName, attributeMetadataId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteAttribute(entityLogicalName, attributeMetadataId);

      return {
        content: [{ type: "text", text: `✅ Successfully deleted attribute (${attributeMetadataId}) from entity '${entityLogicalName}'\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting attribute:", error);
      return { content: [{ type: "text", text: `Failed to delete attribute: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: create-one-to-many-relationship
 * Create a one-to-many relationship between entities
 */
server.tool(
  "create-one-to-many-relationship",
  "Create a one-to-many relationship between two entities. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    referencedEntity: z.string().describe("The 'one' side entity (parent)"),
    referencingEntity: z.string().describe("The 'many' side entity (child)"),
    schemaName: z.string().describe("Relationship schema name (e.g., 'sic_account_application')"),
    lookupAttributeSchemaName: z.string().describe("Lookup attribute schema name (e.g., 'sic_accountid')"),
    lookupAttributeDisplayName: z.string().describe("Lookup attribute display name"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const relationshipDefinition = {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        SchemaName: params.schemaName,
        ReferencedEntity: params.referencedEntity,
        ReferencingEntity: params.referencingEntity,
        Lookup: {
          "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
          SchemaName: params.lookupAttributeSchemaName,
          DisplayName: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.lookupAttributeDisplayName, LanguageCode: 1033 }]
          }
        }
      };

      const solution = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.createOneToManyRelationship(relationshipDefinition, solution);

      return {
        content: [{ type: "text", text: `✅ Successfully created 1:N relationship '${params.schemaName}'\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating relationship:", error);
      return { content: [{ type: "text", text: `Failed to create relationship: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: create-many-to-many-relationship
 * Create a many-to-many relationship between entities
 */
server.tool(
  "create-many-to-many-relationship",
  "Create a many-to-many relationship between two entities. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entity1: z.string().describe("First entity logical name"),
    entity2: z.string().describe("Second entity logical name"),
    schemaName: z.string().describe("Relationship schema name (e.g., 'sic_account_contact')"),
    intersectEntityName: z.string().describe("Intersect entity name (e.g., 'sic_account_contact')"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const relationshipDefinition = {
        "@odata.type": "Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata",
        SchemaName: params.schemaName,
        Entity1LogicalName: params.entity1,
        Entity2LogicalName: params.entity2,
        IntersectEntityName: params.intersectEntityName
      };

      const solution = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.createManyToManyRelationship(relationshipDefinition, solution);

      return {
        content: [{ type: "text", text: `✅ Successfully created N:N relationship '${params.schemaName}'\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating relationship:", error);
      return { content: [{ type: "text", text: `Failed to create relationship: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: delete-relationship
 * Delete a relationship
 */
server.tool(
  "delete-relationship",
  "Delete a relationship. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)")
  },
  async ({ metadataId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteRelationship(metadataId);

      return {
        content: [{ type: "text", text: `✅ Successfully deleted relationship (${metadataId})\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting relationship:", error);
      return { content: [{ type: "text", text: `Failed to delete relationship: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: update-relationship
 * Update a relationship (labels only)
 */
server.tool(
  "update-relationship",
  "Update relationship labels. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)"),
    referencedEntityNavigationPropertyName: z.string().optional().describe("Navigation property name"),
    referencingEntityNavigationPropertyName: z.string().optional().describe("Navigation property name")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};
      if (params.referencedEntityNavigationPropertyName) updates.ReferencedEntityNavigationPropertyName = params.referencedEntityNavigationPropertyName;
      if (params.referencingEntityNavigationPropertyName) updates.ReferencingEntityNavigationPropertyName = params.referencingEntityNavigationPropertyName;

      await service.updateRelationship(params.metadataId, updates);

      return {
        content: [{ type: "text", text: `✅ Successfully updated relationship (${params.metadataId})\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error updating relationship:", error);
      return { content: [{ type: "text", text: `Failed to update relationship: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: get-relationship-details
 * Get detailed information about a relationship
 */
server.tool(
  "get-relationship-details",
  "Get detailed metadata about a relationship",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)")
  },
  async ({ metadataId }) => {
    try {
      const service = getPowerPlatformService();
      const relationship = await service.getRelationshipDetails(metadataId);

      return {
        content: [{ type: "text", text: `Relationship Details:\n${JSON.stringify(relationship, null, 2)}` }]
      };
    } catch (error: any) {
      console.error("Error getting relationship details:", error);
      return { content: [{ type: "text", text: `Failed to get relationship details: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: create-global-optionset-attribute
 * Create an attribute using a global option set
 */
server.tool(
  "create-global-optionset-attribute",
  "Create a picklist attribute using an existing global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name"),
    schemaName: z.string().describe("Attribute schema name"),
    displayName: z.string().describe("Attribute display name"),
    globalOptionSetName: z.string().describe("Global option set name to use"),
    description: z.string().optional().describe("Attribute description"),
    requiredLevel: z.enum(["None", "Recommended", "ApplicationRequired"]).optional().describe("Required level (default: None)"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async (params) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Look up the global option set to get its MetadataId
      const globalOptionSet = await service.getGlobalOptionSet(params.globalOptionSetName);
      const metadataId = globalOptionSet.MetadataId;

      const attributeDefinition = {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        SchemaName: params.schemaName,
        DisplayName: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.displayName, LanguageCode: 1033 }]
        },
        Description: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.description || "", LanguageCode: 1033 }]
        },
        RequiredLevel: { Value: params.requiredLevel || "None", CanBeChanged: true },
        "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${metadataId})`
      };

      const solution = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createGlobalOptionSetAttribute(params.entityLogicalName, attributeDefinition, solution);

      return {
        content: [{ type: "text", text: `✅ Successfully created global option set attribute '${params.schemaName}' using '${params.globalOptionSetName}'\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating global option set attribute:", error);
      return { content: [{ type: "text", text: `Failed to create global option set attribute: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: get-webresource-dependencies
 * Get dependencies for a web resource
 */
server.tool(
  "get-webresource-dependencies",
  "Get all dependencies for a web resource",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }) => {
    try {
      const service = getPowerPlatformService();
      const dependencies = await service.getWebResourceDependencies(webResourceId);

      return {
        content: [{ type: "text", text: `Web Resource Dependencies:\n${JSON.stringify(dependencies, null, 2)}` }]
      };
    } catch (error: any) {
      console.error("Error getting web resource dependencies:", error);
      return { content: [{ type: "text", text: `Failed to get web resource dependencies: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: preview-unpublished-changes
 * Preview all unpublished customizations
 */
server.tool(
  "preview-unpublished-changes",
  "Preview all components with unpublished customizations",
  {},
  async () => {
    try {
      const service = getPowerPlatformService();
      const unpublished = await service.previewUnpublishedChanges();

      return {
        content: [{ type: "text", text: `Unpublished Changes:\n${JSON.stringify(unpublished, null, 2)}` }]
      };
    } catch (error: any) {
      console.error("Error previewing unpublished changes:", error);
      return { content: [{ type: "text", text: `Failed to preview unpublished changes: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: validate-solution-integrity
 * Validate solution integrity and check for missing dependencies
 */
server.tool(
  "validate-solution-integrity",
  "Validate a solution's integrity and check for missing dependencies",
  {
    solutionUniqueName: z.string().describe("Solution unique name")
  },
  async ({ solutionUniqueName }) => {
    try {
      const service = getPowerPlatformService();
      const validation = await service.validateSolutionIntegrity(solutionUniqueName);

      return {
        content: [{
          type: "text",
          text: `Solution Integrity Validation:\n\n` +
                `Valid: ${validation.isValid ? '✅ Yes' : '❌ No'}\n` +
                `Issues: ${validation.issues.length}\n` +
                `Warnings: ${validation.warnings.length}\n\n` +
                (validation.issues.length > 0 ? `Issues:\n${JSON.stringify(validation.issues, null, 2)}\n\n` : '') +
                (validation.warnings.length > 0 ? `Warnings:\n${JSON.stringify(validation.warnings, null, 2)}` : '')
        }]
      };
    } catch (error: any) {
      console.error("Error validating solution integrity:", error);
      return { content: [{ type: "text", text: `Failed to validate solution integrity: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: publish-customizations
 * Publish all pending customizations
 */
server.tool(
  "publish-customizations",
  "Publish all pending customizations in Dynamics 365. This makes all unpublished changes active. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {},
  async () => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.publishAllCustomizations();

      return {
        content: [
          {
            type: "text",
            text: "Successfully published all customizations. All pending changes are now active."
          }
        ]
      };
    } catch (error: any) {
      console.error("Error publishing customizations:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to publish customizations: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// ===== PHASE 2: Global Option Set Management =====

/**
 * Tool: update-global-optionset
 * Update a global option set
 */
server.tool(
  "update-global-optionset",
  "Update a global option set in Dynamics 365. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("The MetadataId of the option set"),
    displayName: z.string().optional().describe("New display name"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not provided)")
  },
  async ({ metadataId, displayName, description, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata' };

      if (displayName) {
        updates.DisplayName = {
          LocalizedLabels: [{ Label: displayName, LanguageCode: 1033 }]
        };
      }

      if (description) {
        updates.Description = {
          LocalizedLabels: [{ Label: description, LanguageCode: 1033 }]
        };
      }

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateGlobalOptionSet(metadataId, updates, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated global option set (${metadataId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating global option set:", error);
      return {
        content: [{ type: "text", text: `Failed to update global option set: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: add-optionset-value
 * Add a value to a global option set
 */
server.tool(
  "add-optionset-value",
  "Add a new value to a global option set in Dynamics 365. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value (should start with publisher prefix, e.g., 15743xxxx)"),
    label: z.string().describe("The display label for the value"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, value, label, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.addOptionSetValue(optionSetName, value, label, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully added value to option set '${optionSetName}'\n` +
                  `Value: ${value}\n` +
                  `Label: ${label}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error adding option set value:", error);
      return {
        content: [{ type: "text", text: `Failed to add option set value: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: update-optionset-value
 * Update an existing option set value
 */
server.tool(
  "update-optionset-value",
  "Update an existing value in a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value to update"),
    label: z.string().describe("The new display label"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, value, label, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateOptionSetValue(optionSetName, value, label, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated value in option set '${optionSetName}'\n` +
                  `Value: ${value}\n` +
                  `New Label: ${label}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating option set value:", error);
      return {
        content: [{ type: "text", text: `Failed to update option set value: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: delete-optionset-value
 * Delete a value from a global option set
 */
server.tool(
  "delete-optionset-value",
  "Delete a value from a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value to delete")
  },
  async ({ optionSetName, value }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteOptionSetValue(optionSetName, value);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deleted value ${value} from option set '${optionSetName}'\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deleting option set value:", error);
      return {
        content: [{ type: "text", text: `Failed to delete option set value: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: reorder-optionset-values
 * Reorder values in a global option set
 */
server.tool(
  "reorder-optionset-values",
  "Reorder the values in a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    values: z.array(z.number()).describe("Array of values in the desired order"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, values, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.reorderOptionSetValues(optionSetName, values, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully reordered ${values.length} values in option set '${optionSetName}'\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error reordering option set values:", error);
      return {
        content: [{ type: "text", text: `Failed to reorder option set values: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ===== PHASE 2: Form Management =====

/**
 * Tool: create-form
 * Create a new form
 */
server.tool(
  "create-form",
  "Create a new form (Main, QuickCreate, QuickView, Card) for an entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    name: z.string().describe("Form name"),
    entityLogicalName: z.string().describe("Entity logical name"),
    formType: z.enum(["Main", "QuickCreate", "QuickView", "Card"]).describe("Form type"),
    formXml: z.string().describe("Form XML definition"),
    description: z.string().optional().describe("Form description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ name, entityLogicalName, formType, formXml, description, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const typeMap = { Main: 2, QuickCreate: 7, QuickView: 8, Card: 10 };
      const form = {
        name,
        objecttypecode: entityLogicalName,
        type: typeMap[formType],
        formxml: formXml,
        description: description || ""
      };

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createForm(form, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created ${formType} form '${name}' for entity '${entityLogicalName}'\n` +
                  `Form ID: ${result.formid}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating form:", error);
      return {
        content: [{ type: "text", text: `Failed to create form: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: update-form
 * Update an existing form
 */
server.tool(
  "update-form",
  "Update an existing form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)"),
    name: z.string().optional().describe("New form name"),
    formXml: z.string().optional().describe("New form XML definition"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ formId, name, formXml, description, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};
      if (name) updates.name = name;
      if (formXml) updates.formxml = formXml;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateForm(formId, updates, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated form (${formId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating form:", error);
      return {
        content: [{ type: "text", text: `Failed to update form: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: delete-form
 * Delete a form
 */
server.tool(
  "delete-form",
  "Delete a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteForm(formId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deleted form (${formId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deleting form:", error);
      return {
        content: [{ type: "text", text: `Failed to delete form: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: activate-form
 * Activate a form
 */
server.tool(
  "activate-form",
  "Activate a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.activateForm(formId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully activated form (${formId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error activating form:", error);
      return {
        content: [{ type: "text", text: `Failed to activate form: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: deactivate-form
 * Deactivate a form
 */
server.tool(
  "deactivate-form",
  "Deactivate a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deactivateForm(formId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deactivated form (${formId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deactivating form:", error);
      return {
        content: [{ type: "text", text: `Failed to deactivate form: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-forms
 * Get all forms for an entity
 */
server.tool(
  "get-forms",
  "Get all forms for an entity",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getForms(entityLogicalName);

      const forms = result.value || [];
      const typeNames: { [key: number]: string } = { 2: "Main", 7: "QuickCreate", 8: "QuickView", 10: "Card" };

      return {
        content: [
          {
            type: "text",
            text: `Found ${forms.length} form(s) for entity '${entityLogicalName}':\n\n` +
                  forms.map((f: any) =>
                    `- ${f.name} (${typeNames[f.type] || f.type})\n  ID: ${f.formid}`
                  ).join('\n')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting forms:", error);
      return {
        content: [{ type: "text", text: `Failed to get forms: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ===== PHASE 2: View Management =====

/**
 * Tool: create-view
 * Create a new view
 */
server.tool(
  "create-view",
  "Create a new view for an entity using FetchXML. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    name: z.string().describe("View name"),
    entityLogicalName: z.string().describe("Entity logical name"),
    fetchXml: z.string().describe("FetchXML query"),
    layoutXml: z.string().describe("Layout XML (column definitions)"),
    queryType: z.number().optional().describe("Query type (default: 0 for public view)"),
    isDefault: z.boolean().optional().describe("Set as default view"),
    description: z.string().optional().describe("View description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ name, entityLogicalName, fetchXml, layoutXml, queryType, isDefault, description, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const view = {
        name,
        returnedtypecode: entityLogicalName,
        fetchxml: fetchXml,
        layoutxml: layoutXml,
        querytype: queryType || 0,
        isdefault: isDefault || false,
        description: description || ""
      };

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createView(view, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created view '${name}' for entity '${entityLogicalName}'\n` +
                  `View ID: ${result.savedqueryid}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating view:", error);
      return {
        content: [{ type: "text", text: `Failed to create view: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: update-view
 * Update an existing view
 */
server.tool(
  "update-view",
  "Update an existing view. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    viewId: z.string().describe("View ID (GUID)"),
    name: z.string().optional().describe("New view name"),
    fetchXml: z.string().optional().describe("New FetchXML query"),
    layoutXml: z.string().optional().describe("New layout XML"),
    isDefault: z.boolean().optional().describe("Set as default view"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ viewId, name, fetchXml, layoutXml, isDefault, description, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};
      if (name) updates.name = name;
      if (fetchXml) updates.fetchxml = fetchXml;
      if (layoutXml) updates.layoutxml = layoutXml;
      if (isDefault !== undefined) updates.isdefault = isDefault;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateView(viewId, updates, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated view (${viewId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating view:", error);
      return {
        content: [{ type: "text", text: `Failed to update view: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: delete-view
 * Delete a view
 */
server.tool(
  "delete-view",
  "Delete a view. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteView(viewId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deleted view (${viewId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deleting view:", error);
      return {
        content: [{ type: "text", text: `Failed to delete view: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-views
 * Get all views for an entity
 */
server.tool(
  "get-views",
  "Get all views for an entity",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getViews(entityLogicalName);

      const views = result.value || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${views.length} view(s) for entity '${entityLogicalName}':\n\n` +
                  views.map((v: any) =>
                    `- ${v.name}${v.isdefault ? ' [DEFAULT]' : ''}\n  ID: ${v.savedqueryid}\n  Query Type: ${v.querytype}`
                  ).join('\n')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting views:", error);
      return {
        content: [{ type: "text", text: `Failed to get views: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: set-default-view
 * Set a view as the default view for its entity
 */
server.tool(
  "set-default-view",
  "Set a view as the default view for its entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.setDefaultView(viewId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully set view (${viewId}) as default\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error setting default view:", error);
      return {
        content: [{ type: "text", text: `Failed to set default view: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-view-fetchxml
 * Get the FetchXML from a view
 */
server.tool(
  "get-view-fetchxml",
  "Get the FetchXML query from a view",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }) => {
    try {
      const service = getPowerPlatformService();
      const view = await service.getViewFetchXml(viewId);

      return {
        content: [
          {
            type: "text",
            text: `View: ${view.name}\nEntity: ${view.returnedtypecode}\nQuery Type: ${view.querytype}\n\nFetchXML:\n${view.fetchxml}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting view FetchXML:", error);
      return {
        content: [{ type: "text", text: `Failed to get view FetchXML: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ===== PHASE 3: Web Resource Management =====

/**
 * Tool: create-web-resource
 * Create a new web resource
 */
server.tool(
  "create-web-resource",
  "Create a new web resource (JavaScript, CSS, HTML, Image, etc.). Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    name: z.string().describe("Web resource name (must include prefix, e.g., 'prefix_/scripts/file.js')"),
    displayName: z.string().describe("Display name"),
    webResourceType: z.number().describe("Web resource type: 1=HTML, 2=CSS, 3=JavaScript, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=XAP, 9=XSL, 10=ICO"),
    content: z.string().describe("Base64-encoded content"),
    description: z.string().optional().describe("Description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ name, displayName, webResourceType, content, description, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const webResource = {
        name,
        displayname: displayName,
        webresourcetype: webResourceType,
        content,
        description: description || ""
      };

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createWebResource(webResource, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created web resource '${name}'\n` +
                  `Web Resource ID: ${result.webresourceid}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating web resource:", error);
      return {
        content: [{ type: "text", text: `Failed to create web resource: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: update-web-resource
 * Update an existing web resource
 */
server.tool(
  "update-web-resource",
  "Update an existing web resource. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)"),
    displayName: z.string().optional().describe("Display name"),
    content: z.string().optional().describe("Base64-encoded content"),
    description: z.string().optional().describe("Description"),
    solutionUniqueName: z.string().optional().describe("Solution context")
  },
  async ({ webResourceId, displayName, content, description, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};
      if (displayName) updates.displayname = displayName;
      if (content) updates.content = content;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateWebResource(webResourceId, updates, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated web resource '${webResourceId}'\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating web resource:", error);
      return {
        content: [{ type: "text", text: `Failed to update web resource: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: delete-web-resource
 * Delete a web resource
 */
server.tool(
  "delete-web-resource",
  "Delete a web resource. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteWebResource(webResourceId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deleted web resource '${webResourceId}'\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deleting web resource:", error);
      return {
        content: [{ type: "text", text: `Failed to delete web resource: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-web-resource
 * Get a web resource by ID
 */
server.tool(
  "get-web-resource",
  "Get a web resource by ID",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWebResource(webResourceId);

      return {
        content: [
          {
            type: "text",
            text: `Web Resource: ${result.name}\n` +
                  `Display Name: ${result.displayname}\n` +
                  `Type: ${result.webresourcetype}\n` +
                  `Description: ${result.description || 'N/A'}\n` +
                  `Modified: ${result.modifiedon}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting web resource:", error);
      return {
        content: [{ type: "text", text: `Failed to get web resource: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-web-resources
 * Get web resources by name pattern
 */
server.tool(
  "get-web-resources",
  "Get web resources by name pattern (optional)",
  {
    nameFilter: z.string().optional().describe("Name filter (contains)")
  },
  async ({ nameFilter }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWebResources(nameFilter);

      const webResources = result.value || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${webResources.length} web resource(s):\n\n` +
                  webResources.map((wr: any) =>
                    `- ${wr.name}\n  Type: ${wr.webresourcetype}\n  ID: ${wr.webresourceid}`
                  ).join('\n')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting web resources:", error);
      return {
        content: [{ type: "text", text: `Failed to get web resources: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ===== PHASE 4: Solution Management =====

/**
 * Tool: create-publisher
 * Create a new publisher
 */
server.tool(
  "create-publisher",
  "Create a new solution publisher. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    uniqueName: z.string().describe("Publisher unique name"),
    friendlyName: z.string().describe("Publisher display name"),
    customizationPrefix: z.string().describe("Customization prefix (e.g., 'new')"),
    customizationOptionValuePrefix: z.number().describe("Option value prefix (e.g., 10000)"),
    description: z.string().optional().describe("Publisher description")
  },
  async ({ uniqueName, friendlyName, customizationPrefix, customizationOptionValuePrefix, description }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const publisher = {
        uniquename: uniqueName,
        friendlyname: friendlyName,
        customizationprefix: customizationPrefix,
        customizationoptionvalueprefix: customizationOptionValuePrefix,
        description: description || ""
      };

      const result = await service.createPublisher(publisher);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created publisher '${friendlyName}'\n` +
                  `Unique Name: ${uniqueName}\n` +
                  `Prefix: ${customizationPrefix}\n` +
                  `Option Value Prefix: ${customizationOptionValuePrefix}\n` +
                  `Publisher ID: ${result.publisherid}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating publisher:", error);
      return {
        content: [{ type: "text", text: `Failed to create publisher: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-publishers
 * Get all publishers
 */
server.tool(
  "get-publishers",
  "Get all solution publishers (excluding system publishers)",
  {},
  async () => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPublishers();

      const publishers = result.value || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${publishers.length} publisher(s):\n\n` +
                  publishers.map((p: any) =>
                    `- ${p.friendlyname} (${p.uniquename})\n  Prefix: ${p.customizationprefix}\n  ID: ${p.publisherid}`
                  ).join('\n')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting publishers:", error);
      return {
        content: [{ type: "text", text: `Failed to get publishers: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: create-solution
 * Create a new solution
 */
server.tool(
  "create-solution",
  "Create a new solution. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    uniqueName: z.string().describe("Solution unique name"),
    friendlyName: z.string().describe("Solution display name"),
    version: z.string().describe("Solution version (e.g., '1.0.0.0')"),
    publisherId: z.string().describe("Publisher ID (GUID)"),
    description: z.string().optional().describe("Solution description")
  },
  async ({ uniqueName, friendlyName, version, publisherId, description }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const solution = {
        uniquename: uniqueName,
        friendlyname: friendlyName,
        version,
        "publisherid@odata.bind": `/publishers(${publisherId})`,
        description: description || ""
      };

      const result = await service.createSolution(solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created solution '${friendlyName}'\n` +
                  `Unique Name: ${uniqueName}\n` +
                  `Version: ${version}\n` +
                  `Solution ID: ${result.solutionid}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating solution:", error);
      return {
        content: [{ type: "text", text: `Failed to create solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-solutions
 * Get all solutions
 */
server.tool(
  "get-solutions",
  "Get all visible solutions in the environment",
  {},
  async () => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getSolutions();

      const solutions = result.value || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${solutions.length} solution(s):\n\n` +
                  solutions.map((s: any) =>
                    `- ${s.friendlyname} (${s.uniquename})\n  Version: ${s.version}\n  ID: ${s.solutionid}`
                  ).join('\n')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting solutions:", error);
      return {
        content: [{ type: "text", text: `Failed to get solutions: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: add-solution-component
 * Add a component to a solution
 */
server.tool(
  "add-solution-component",
  "Add a component to a solution. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    solutionUniqueName: z.string().describe("Solution unique name"),
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource"),
    addRequiredComponents: z.boolean().optional().describe("Add required components (default: true)"),
    includedComponentSettingsValues: z.string().optional().describe("Component settings values")
  },
  async ({ solutionUniqueName, componentId, componentType, addRequiredComponents, includedComponentSettingsValues }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.addComponentToSolution(
        solutionUniqueName,
        componentId,
        componentType,
        addRequiredComponents ?? true,
        includedComponentSettingsValues
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully added component '${componentId}' (type: ${componentType}) to solution '${solutionUniqueName}'`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error adding component to solution:", error);
      return {
        content: [{ type: "text", text: `Failed to add component to solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: remove-solution-component
 * Remove a component from a solution
 */
server.tool(
  "remove-solution-component",
  "Remove a component from a solution. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    solutionUniqueName: z.string().describe("Solution unique name"),
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ solutionUniqueName, componentId, componentType }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.removeComponentFromSolution(solutionUniqueName, componentId, componentType);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully removed component '${componentId}' (type: ${componentType}) from solution '${solutionUniqueName}'`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error removing component from solution:", error);
      return {
        content: [{ type: "text", text: `Failed to remove component from solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: export-solution
 * Export a solution
 */
server.tool(
  "export-solution",
  "Export a solution as a zip file. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    solutionName: z.string().describe("Solution unique name"),
    managed: z.boolean().optional().describe("Export as managed solution (default: false)")
  },
  async ({ solutionName, managed }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const result = await service.exportSolution(solutionName, managed ?? false);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully exported solution '${solutionName}' as ${managed ? 'managed' : 'unmanaged'}\n\n` +
                  `Export File (Base64): ${result.ExportSolutionFile.substring(0, 100)}...`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error exporting solution:", error);
      return {
        content: [{ type: "text", text: `Failed to export solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: import-solution
 * Import a solution
 */
server.tool(
  "import-solution",
  "Import a solution from a base64-encoded zip file. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    customizationFile: z.string().describe("Base64-encoded solution zip file"),
    publishWorkflows: z.boolean().optional().describe("Publish workflows after import (default: true)"),
    overwriteUnmanagedCustomizations: z.boolean().optional().describe("Overwrite unmanaged customizations (default: false)")
  },
  async ({ customizationFile, publishWorkflows, overwriteUnmanagedCustomizations }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const result = await service.importSolution(
        customizationFile,
        publishWorkflows ?? true,
        overwriteUnmanagedCustomizations ?? false
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully initiated solution import\n` +
                  `Import Job ID: ${result.ImportJobId}\n\n` +
                  `⚠️ NOTE: Solution import is asynchronous. Monitor the import job for completion status.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error importing solution:", error);
      return {
        content: [{ type: "text", text: `Failed to import solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ===== PHASE 5: Publishing & Validation =====

/**
 * Tool: publish-entity
 * Publish a specific entity
 */
server.tool(
  "publish-entity",
  "Publish all customizations for a specific entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name to publish")
  },
  async ({ entityLogicalName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.publishEntity(entityLogicalName);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully published entity '${entityLogicalName}'\n\n` +
                  `All customizations for this entity are now active in the environment.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error publishing entity:", error);
      return {
        content: [{ type: "text", text: `Failed to publish entity: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: check-dependencies
 * Check component dependencies
 */
server.tool(
  "check-dependencies",
  "Check dependencies before deleting a component",
  {
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ componentId, componentType }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.checkDependencies(componentId, componentType);

      const dependencies = result.EntityCollection?.Entities || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${dependencies.length} dependenc${dependencies.length === 1 ? 'y' : 'ies'} for component '${componentId}':\n\n` +
                  (dependencies.length > 0
                    ? dependencies.map((d: any) =>
                        `- ${d.Attributes?.dependentcomponentobjectid || 'Unknown'}\n  Type: ${d.Attributes?.dependentcomponenttype || 'Unknown'}`
                      ).join('\n')
                    : 'No dependencies found - component can be safely deleted')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error checking dependencies:", error);
      return {
        content: [{ type: "text", text: `Failed to check dependencies: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: check-entity-dependencies
 * Check entity dependencies
 */
server.tool(
  "check-entity-dependencies",
  "Check dependencies for a specific entity before deletion",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.checkEntityDependencies(entityLogicalName);

      const dependencies = result.EntityCollection?.Entities || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${dependencies.length} dependenc${dependencies.length === 1 ? 'y' : 'ies'} for entity '${entityLogicalName}':\n\n` +
                  (dependencies.length > 0
                    ? dependencies.map((d: any) =>
                        `- ${d.Attributes?.dependentcomponentobjectid || 'Unknown'}\n  Type: ${d.Attributes?.dependentcomponenttype || 'Unknown'}`
                      ).join('\n')
                    : 'No dependencies found - entity can be safely deleted')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error checking entity dependencies:", error);
      return {
        content: [{ type: "text", text: `Failed to check entity dependencies: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-entity-customization-info
 * Get entity customization information
 */
server.tool(
  "get-entity-customization-info",
  "Get entity customization information (customizable, managed, custom)",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getEntityCustomizationInfo(entityLogicalName);

      return {
        content: [
          {
            type: "text",
            text: `Entity Customization Info for '${entityLogicalName}':\n\n` +
                  `Is Customizable: ${result.IsCustomizable?.Value ?? result.IsCustomizable}\n` +
                  `Is Managed: ${result.IsManaged}\n` +
                  `Is Custom Entity: ${result.IsCustomEntity}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting entity customization info:", error);
      return {
        content: [{ type: "text", text: `Failed to get entity customization info: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: validate-schema-name
 * Validate a schema name against naming rules
 */
server.tool(
  "validate-schema-name",
  "Validate a schema name against PowerPlatform naming rules",
  {
    schemaName: z.string().describe("Schema name to validate"),
    prefix: z.string().describe("Required customization prefix")
  },
  async ({ schemaName, prefix }) => {
    try {
      const service = getPowerPlatformService();
      const result = service.validateSchemaName(schemaName, prefix);

      return {
        content: [
          {
            type: "text",
            text: `Schema Name Validation for '${schemaName}':\n\n` +
                  `Valid: ${result.valid ? '✅' : '❌'}\n\n` +
                  (result.errors.length > 0
                    ? `Errors:\n${result.errors.map(e => `- ${e}`).join('\n')}`
                    : 'No validation errors')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error validating schema name:", error);
      return {
        content: [{ type: "text", text: `Failed to validate schema name: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: check-delete-eligibility
 * Check if a component can be deleted
 */
server.tool(
  "check-delete-eligibility",
  "Check if a component can be safely deleted",
  {
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ componentId, componentType }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.checkDeleteEligibility(componentId, componentType);

      return {
        content: [
          {
            type: "text",
            text: `Delete Eligibility for component '${componentId}':\n\n` +
                  `Can Delete: ${result.canDelete ? '✅ Yes' : '❌ No'}\n` +
                  `Dependencies: ${result.dependencies.length}\n\n` +
                  (result.dependencies.length > 0
                    ? `Blocking Dependencies:\n${result.dependencies.map((d: any) =>
                        `- ${d.Attributes?.dependentcomponentobjectid || 'Unknown'}`
                      ).join('\n')}`
                    : 'No blocking dependencies - component can be safely deleted')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error checking delete eligibility:", error);
      return {
        content: [{ type: "text", text: `Failed to check delete eligibility: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-list-resources
 * List all configured Application Insights resources
 */
server.tool(
  "appinsights-list-resources",
  "List all configured Application Insights resources (active and inactive)",
  {},
  async () => {
    try {
      const service = getApplicationInsightsService();
      const resources = service.getAllResources();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resources, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error listing Application Insights resources:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to list Application Insights resources: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-get-metadata
 * Get schema metadata for an Application Insights resource
 */
server.tool(
  "appinsights-get-metadata",
  "Get schema metadata (tables and columns) for an Application Insights resource",
  {
    resourceId: z.string().describe("Resource ID (use appinsights-list-resources to find IDs)"),
  },
  async ({ resourceId }) => {
    try {
      const service = getApplicationInsightsService();
      const metadata = await service.getMetadata(resourceId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(metadata, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting Application Insights metadata:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get metadata: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-execute-query
 * Execute a custom KQL query against an Application Insights resource
 */
server.tool(
  "appinsights-execute-query",
  "Execute a KQL (Kusto Query Language) query against Application Insights",
  {
    resourceId: z.string().describe("Resource ID"),
    query: z.string().describe("KQL query string"),
    timespan: z.string().optional().describe("Time range (e.g., 'PT1H' for 1 hour, 'P1D' for 1 day, 'PT12H' for 12 hours)"),
  },
  async ({ resourceId, query, timespan }) => {
    try {
      const service = getApplicationInsightsService();
      const result = await service.executeQuery(resourceId, query, timespan);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error executing Application Insights query:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to execute query: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-get-exceptions
 * Get recent exceptions from Application Insights
 */
server.tool(
  "appinsights-get-exceptions",
  "Get recent exceptions from Application Insights with timestamps, types, and messages",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 50)"),
  },
  async ({ resourceId, timespan, limit }) => {
    try {
      const service = getApplicationInsightsService();
      const result = await service.getRecentExceptions(
        resourceId,
        timespan || 'PT1H',
        limit || 50
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting Application Insights exceptions:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get exceptions: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-get-slow-requests
 * Get slow HTTP requests from Application Insights
 */
server.tool(
  "appinsights-get-slow-requests",
  "Get slow HTTP requests (above duration threshold) from Application Insights",
  {
    resourceId: z.string().describe("Resource ID"),
    durationThresholdMs: z.number().optional().describe("Duration threshold in milliseconds (default: 5000)"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 50)"),
  },
  async ({ resourceId, durationThresholdMs, timespan, limit }) => {
    try {
      const service = getApplicationInsightsService();
      const result = await service.getSlowRequests(
        resourceId,
        durationThresholdMs || 5000,
        timespan || 'PT1H',
        limit || 50
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting slow requests:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get slow requests: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-get-operation-performance
 * Get operation performance summary from Application Insights
 */
server.tool(
  "appinsights-get-operation-performance",
  "Get performance summary by operation (request count, avg duration, percentiles)",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getApplicationInsightsService();
      const result = await service.getOperationPerformance(
        resourceId,
        timespan || 'PT1H'
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting operation performance:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get operation performance: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-get-failed-dependencies
 * Get failed dependency calls from Application Insights
 */
server.tool(
  "appinsights-get-failed-dependencies",
  "Get failed dependency calls (external APIs, databases, etc.) from Application Insights",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 50)"),
  },
  async ({ resourceId, timespan, limit }) => {
    try {
      const service = getApplicationInsightsService();
      const result = await service.getFailedDependencies(
        resourceId,
        timespan || 'PT1H',
        limit || 50
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting failed dependencies:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get failed dependencies: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-get-traces
 * Get diagnostic traces from Application Insights filtered by severity
 */
server.tool(
  "appinsights-get-traces",
  "Get diagnostic traces/logs from Application Insights filtered by severity level",
  {
    resourceId: z.string().describe("Resource ID"),
    severityLevel: z.number().optional().describe("Minimum severity level (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical) (default: 2)"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 100)"),
  },
  async ({ resourceId, severityLevel, timespan, limit }) => {
    try {
      const service = getApplicationInsightsService();
      const result = await service.getTracesBySeverity(
        resourceId,
        severityLevel ?? 2,
        timespan || 'PT1H',
        limit || 100
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting traces:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get traces: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-get-availability
 * Get availability test results from Application Insights
 */
server.tool(
  "appinsights-get-availability",
  "Get availability test results and uptime statistics from Application Insights",
  {
    resourceId: z.string().describe("Resource ID"),
    timespan: z.string().optional().describe("Time range (default: PT24H)"),
  },
  async ({ resourceId, timespan }) => {
    try {
      const service = getApplicationInsightsService();
      const result = await service.getAvailabilityResults(
        resourceId,
        timespan || 'PT24H'
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting availability results:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get availability results: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: appinsights-get-custom-events
 * Get custom application events from Application Insights
 */
server.tool(
  "appinsights-get-custom-events",
  "Get custom application events from Application Insights",
  {
    resourceId: z.string().describe("Resource ID"),
    eventName: z.string().optional().describe("Filter by specific event name"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 100)"),
  },
  async ({ resourceId, eventName, timespan, limit }) => {
    try {
      const service = getApplicationInsightsService();
      const result = await service.getCustomEvents(
        resourceId,
        eventName,
        timespan || 'PT1H',
        limit || 100
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting custom events:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get custom events: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * ===========================================
 * LOG ANALYTICS WORKSPACE TOOLS (10 TOOLS)
 * ===========================================
 */

/**
 * Tool: loganalytics-list-workspaces
 * List all configured Log Analytics workspaces
 */
server.tool(
  "loganalytics-list-workspaces",
  "List all configured Log Analytics workspaces (active and inactive)",
  {},
  async () => {
    try {
      const service = getLogAnalyticsService();
      const resources = service.getAllResources();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resources, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error listing Log Analytics workspaces:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to list workspaces: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-get-metadata
 * Get schema metadata for a Log Analytics workspace
 */
server.tool(
  "loganalytics-get-metadata",
  "Get schema metadata (tables and columns) for a Log Analytics workspace",
  {
    resourceId: z.string().describe("Resource ID (use loganalytics-list-workspaces to find IDs)"),
  },
  async ({ resourceId }) => {
    try {
      const service = getLogAnalyticsService();
      const metadata = await service.getMetadata(resourceId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(metadata, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting Log Analytics metadata:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get metadata: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-execute-query
 * Execute a custom KQL query against Log Analytics
 */
server.tool(
  "loganalytics-execute-query",
  "Execute a custom KQL query against Log Analytics workspace",
  {
    resourceId: z.string().describe("Resource ID"),
    query: z.string().describe("KQL query string"),
    timespan: z.string().optional().describe("Time range (e.g., 'PT1H', 'P1D')"),
  },
  async ({ resourceId, query, timespan }) => {
    try {
      const service = getLogAnalyticsService();
      const result = await service.executeQuery(resourceId, query, timespan);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error executing Log Analytics query:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to execute query: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-test-workspace-access
 * Test workspace access and permissions
 */
server.tool(
  "loganalytics-test-workspace-access",
  "Test access to a Log Analytics workspace by executing a simple query",
  {
    resourceId: z.string().describe("Resource ID"),
  },
  async ({ resourceId }) => {
    try {
      const service = getLogAnalyticsService();
      const result = await service.testWorkspaceAccess(resourceId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error testing workspace access:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to test workspace access: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-get-recent-events
 * Get recent events from any table
 */
server.tool(
  "loganalytics-get-recent-events",
  "Get recent events from a specific Log Analytics table",
  {
    resourceId: z.string().describe("Resource ID"),
    tableName: z.string().describe("Table name (e.g., 'FunctionAppLogs', 'traces', 'requests')"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 100)"),
  },
  async ({ resourceId, tableName, timespan, limit }) => {
    try {
      const service = getLogAnalyticsService();
      const result = await service.getRecentEvents(
        resourceId,
        tableName,
        timespan || 'PT1H',
        limit || 100
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting recent events:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get recent events: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-search-logs
 * Search logs by text content
 */
server.tool(
  "loganalytics-search-logs",
  "Search logs by text content across tables or a specific table",
  {
    resourceId: z.string().describe("Resource ID"),
    searchText: z.string().describe("Text to search for"),
    tableName: z.string().optional().describe("Table name to search in (optional, searches all if not specified)"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 100)"),
  },
  async ({ resourceId, searchText, tableName, timespan, limit }) => {
    try {
      const service = getLogAnalyticsService();
      const result = await service.searchLogs(
        resourceId,
        searchText,
        tableName,
        timespan || 'PT1H',
        limit || 100
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error searching logs:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search logs: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-get-function-logs
 * Get Azure Function logs
 */
server.tool(
  "loganalytics-get-function-logs",
  "Get Azure Function logs from FunctionAppLogs table with optional filtering",
  {
    resourceId: z.string().describe("Resource ID"),
    functionName: z.string().optional().describe("Function name to filter by (optional)"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    severityLevel: z.number().optional().describe("Minimum severity level (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical)"),
    limit: z.number().optional().describe("Maximum number of results (default: 100)"),
  },
  async ({ resourceId, functionName, timespan, severityLevel, limit }) => {
    try {
      const service = getLogAnalyticsService();
      const result = await service.getFunctionLogs(
        resourceId,
        functionName,
        timespan || 'PT1H',
        severityLevel,
        limit || 100
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting function logs:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get function logs: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-get-function-errors
 * Get Azure Function errors
 */
server.tool(
  "loganalytics-get-function-errors",
  "Get Azure Function error logs with exception details",
  {
    resourceId: z.string().describe("Resource ID"),
    functionName: z.string().optional().describe("Function name to filter by (optional)"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 100)"),
  },
  async ({ resourceId, functionName, timespan, limit }) => {
    try {
      const service = getLogAnalyticsService();
      const result = await service.getFunctionErrors(
        resourceId,
        functionName,
        timespan || 'PT1H',
        limit || 100
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting function errors:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get function errors: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-get-function-stats
 * Get Azure Function execution statistics
 */
server.tool(
  "loganalytics-get-function-stats",
  "Get execution statistics for Azure Functions (count, success rate, errors)",
  {
    resourceId: z.string().describe("Resource ID"),
    functionName: z.string().optional().describe("Function name (optional, returns stats for all functions if not specified)"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
  },
  async ({ resourceId, functionName, timespan }) => {
    try {
      const service = getLogAnalyticsService();
      const result = await service.getFunctionStats(
        resourceId,
        functionName,
        timespan || 'PT1H'
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting function stats:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get function stats: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * Tool: loganalytics-get-function-invocations
 * Get Azure Function invocation history
 */
server.tool(
  "loganalytics-get-function-invocations",
  "Get Azure Function invocation history from requests/traces tables",
  {
    resourceId: z.string().describe("Resource ID"),
    functionName: z.string().optional().describe("Function name to filter by (optional)"),
    timespan: z.string().optional().describe("Time range (default: PT1H)"),
    limit: z.number().optional().describe("Maximum number of results (default: 100)"),
  },
  async ({ resourceId, functionName, timespan, limit }) => {
    try {
      const service = getLogAnalyticsService();
      const result = await service.getFunctionInvocations(
        resourceId,
        functionName,
        timespan || 'PT1H',
        limit || 100
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting function invocations:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get function invocations: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

/**
 * ===========================================
 * AZURE SQL DATABASE TOOLS (9 TOOLS)
 * ===========================================
 */

/**
 * Tool: sql-test-connection
 * Test database connectivity
 */
server.tool(
  "sql-test-connection",
  "Test Azure SQL Database connectivity and return connection information",
  {},
  async () => {
    try {
      const sqlService = getAzureSqlService();
      const result = await sqlService.testConnection();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error testing connection: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: sql-list-tables
 * List all user tables in the database
 */
server.tool(
  "sql-list-tables",
  "List all user tables in the Azure SQL Database with row counts and sizes",
  {},
  async () => {
    try {
      const sqlService = getAzureSqlService();
      const tables = await sqlService.listTables();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tables, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing tables: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: sql-list-views
 * List all views in the database
 */
server.tool(
  "sql-list-views",
  "List all views in the Azure SQL Database",
  {},
  async () => {
    try {
      const sqlService = getAzureSqlService();
      const views = await sqlService.listViews();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(views, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing views: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: sql-list-stored-procedures
 * List all stored procedures
 */
server.tool(
  "sql-list-stored-procedures",
  "List all stored procedures in the Azure SQL Database",
  {},
  async () => {
    try {
      const sqlService = getAzureSqlService();
      const procedures = await sqlService.listStoredProcedures();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(procedures, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing stored procedures: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: sql-list-triggers
 * List all database triggers
 */
server.tool(
  "sql-list-triggers",
  "List all database triggers in the Azure SQL Database",
  {},
  async () => {
    try {
      const sqlService = getAzureSqlService();
      const triggers = await sqlService.listTriggers();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(triggers, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing triggers: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: sql-list-functions
 * List all user-defined functions
 */
server.tool(
  "sql-list-functions",
  "List all user-defined functions in the Azure SQL Database",
  {},
  async () => {
    try {
      const sqlService = getAzureSqlService();
      const functions = await sqlService.listFunctions();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(functions, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing functions: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: sql-get-table-schema
 * Get detailed schema information for a table
 */
server.tool(
  "sql-get-table-schema",
  "Get detailed schema information for a table including columns, indexes, and foreign keys",
  {
    schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
    tableName: z.string().describe("Table name (e.g., 'Users')"),
  },
  async ({ schemaName, tableName }) => {
    try {
      const sqlService = getAzureSqlService();
      const schema = await sqlService.getTableSchema(schemaName, tableName);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting table schema: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: sql-get-object-definition
 * Get SQL definition for a database object
 */
server.tool(
  "sql-get-object-definition",
  "Get the SQL definition for a view, stored procedure, function, or trigger",
  {
    schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
    objectName: z.string().describe("Object name"),
    objectType: z.enum(['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER']).describe("Object type"),
  },
  async ({ schemaName, objectName, objectType }) => {
    try {
      const sqlService = getAzureSqlService();
      const definition = await sqlService.getObjectDefinition(schemaName, objectName, objectType);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(definition, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting object definition: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: sql-execute-query
 * Execute a SELECT query with safety validation
 */
server.tool(
  "sql-execute-query",
  "Execute a SELECT query against the Azure SQL Database (read-only, with result limits)",
  {
    query: z.string().describe("SELECT query to execute (e.g., 'SELECT TOP 10 * FROM dbo.Users WHERE IsActive = 1')"),
  },
  async ({ query }) => {
    try {
      const sqlService = getAzureSqlService();
      const result = await sqlService.executeSelectQuery(query);

      let text = JSON.stringify(result, null, 2);

      if (result.truncated) {
        text += `\n\n⚠️ WARNING: Results truncated to ${result.rowCount} rows. Add WHERE clause to filter results.`;
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing query: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * ===========================================
 * AZURE SQL DATABASE PROMPTS (3 PROMPTS)
 * ===========================================
 */

/**
 * Prompt: sql-database-overview
 * Get a comprehensive overview of the database
 */
server.prompt(
  "sql-database-overview",
  "Get a comprehensive overview of the Azure SQL Database schema",
  {},
  async () => {
    const sqlService = getAzureSqlService();

    const [tables, views, procedures, triggers, functions] = await Promise.all([
      sqlService.listTables(),
      sqlService.listViews(),
      sqlService.listStoredProcedures(),
      sqlService.listTriggers(),
      sqlService.listFunctions(),
    ]);

    const formattedOverview = formatDatabaseOverview(tables, views, procedures, triggers, functions);

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: formattedOverview,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: sql-table-details
 * Get detailed information about a specific table
 */
server.prompt(
  "sql-table-details",
  "Get detailed report for a specific table with columns, indexes, and relationships",
  {
    schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
    tableName: z.string().describe("Table name"),
  },
  async ({ schemaName, tableName }) => {
    const sqlService = getAzureSqlService();
    const schema = await sqlService.getTableSchema(schemaName, tableName);

    let template = formatTableSchemaAsMarkdown(schema);
    template += `\n\n### Sample Query\n\n\`\`\`sql\nSELECT TOP 100 * FROM ${schemaName}.${tableName}\n\`\`\``;

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: template,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: sql-query-results
 * Execute a query and return formatted results
 */
server.prompt(
  "sql-query-results",
  "Execute a query and return formatted results with column headers",
  {
    query: z.string().describe("SELECT query to execute"),
  },
  async ({ query }) => {
    const sqlService = getAzureSqlService();
    const result = await sqlService.executeSelectQuery(query);

    let template = `## Query Results\n\n`;
    template += `**Query:**\n\`\`\`sql\n${query}\n\`\`\`\n\n`;
    template += `**Results:**\n${formatSqlResultsAsMarkdown(result)}\n\n`;
    template += `**Row Count:** ${result.rowCount}`;

    if (result.truncated) {
      template += ` (truncated)`;
    }

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: template,
          },
        },
      ],
    };
  }
);

/**
 * ===========================================
 * GITHUB ENTERPRISE TOOLS
 * ===========================================
 */

/**
 * Tool: ghe-list-repos
 * List all configured GitHub Enterprise repositories
 */
server.tool(
  "ghe-list-repos",
  "List all configured GitHub Enterprise repositories (active and inactive)",
  {},
  async () => {
    try {
      const service = getGitHubEnterpriseService();
      const repos = service.getAllRepos();

      const reposWithUrls = repos.map(r => ({
        ...r,
        url: `${GHE_CONFIG.baseUrl}/${r.owner}/${r.repo}`
      }));

      return {
        content: [{
          type: "text",
          text: `# Configured GitHub Enterprise Repositories\n\n` +
            `**Total:** ${repos.length} repositories\n` +
            `**Active:** ${repos.filter(r => r.active).length}\n\n` +
            JSON.stringify(reposWithUrls, null, 2)
        }]
      };
    } catch (error: any) {
      console.error("Error listing GitHub Enterprise repositories:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list repositories: ${error.message}\n\n` +
            `Troubleshooting:\n` +
            `1. Verify GHE_URL is set correctly\n` +
            `2. Verify GHE_PAT or GitHub App credentials are set\n` +
            `3. Verify GHE_REPOS is configured as JSON array\n` +
            `4. Check repository access permissions`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-list-branches
 * List all branches for a repository
 */
server.tool(
  "ghe-list-branches",
  "List all branches for a GitHub Enterprise repository",
  {
    repoId: z.string().describe("Repository ID from configuration (e.g., 'plugin-core')"),
    protectedOnly: z.boolean().optional().describe("Filter by protection status (true for protected branches only)"),
  },
  async ({ repoId, protectedOnly }) => {
    try {
      const service = getGitHubEnterpriseService();
      const branches = await service.listBranches(repoId, protectedOnly);

      return {
        content: [{
          type: "text",
          text: `# Branches for Repository: ${repoId}\n\n` +
            `**Total:** ${branches.length} branches\n\n` +
            formatBranchListAsMarkdown(branches)
        }]
      };
    } catch (error: any) {
      console.error("Error listing branches:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list branches: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-default-branch
 * Auto-detect the default branch for a repository
 */
server.tool(
  "ghe-get-default-branch",
  "Auto-detect the default branch for a repository (handles typos, provides alternatives)",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    userSpecified: z.string().optional().describe("User-specified branch name (overrides auto-detection)"),
  },
  async ({ repoId, userSpecified }) => {
    try {
      const service = getGitHubEnterpriseService();
      const result = await service.getDefaultBranch(repoId, userSpecified);

      let output = `# Default Branch for Repository: ${repoId}\n\n`;
      output += `**Selected Branch:** \`${result.branch}\`  \n`;
      output += `**Reason:** ${result.reason}  \n`;
      output += `**Confidence:** ${result.confidence}  \n\n`;

      if (result.alternatives && result.alternatives.length > 0) {
        output += `**Alternative Branches:**\n`;
        result.alternatives.slice(0, 5).forEach(alt => {
          output += `- \`${alt}\`\n`;
        });
        if (result.alternatives.length > 5) {
          output += `- ... and ${result.alternatives.length - 5} more\n`;
        }
      }

      if (result.message) {
        output += `\n**Note:** ${result.message}\n`;
      }

      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    } catch (error: any) {
      console.error("Error getting default branch:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get default branch: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-file
 * Get file content from a repository
 */
server.tool(
  "ghe-get-file",
  "Get file content from a GitHub Enterprise repository",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    path: z.string().describe("File path (e.g., 'src/Plugins/ContactPlugin.cs')"),
    branch: z.string().optional().describe("Branch name (default: auto-detected)"),
  },
  async ({ repoId, path, branch }) => {
    try {
      const service = getGitHubEnterpriseService();
      const file = await service.getFile(repoId, path, branch);

      return {
        content: [{
          type: "text",
          text: `# File: ${path}\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**Branch:** \`${file.branch}\`  \n` +
            `**Size:** ${file.size} bytes  \n` +
            `**SHA:** \`${file.sha}\`  \n\n` +
            `## Content\n\n\`\`\`\n${file.decodedContent}\n\`\`\``
        }]
      };
    } catch (error: any) {
      console.error("Error getting file:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get file: ${error.message}\n\n` +
            `Troubleshooting:\n` +
            `1. Verify file path is correct\n` +
            `2. Verify branch exists (or let auto-detection find it)\n` +
            `3. Check if file size exceeds GHE_MAX_FILE_SIZE (default: 1MB)`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-search-code
 * Search code across repositories
 */
server.tool(
  "ghe-search-code",
  "Search code across GitHub Enterprise repositories",
  {
    query: z.string().describe("Search query (e.g., 'class ContactPlugin')"),
    repoId: z.string().optional().describe("Limit to specific repository"),
    path: z.string().optional().describe("Filter by file path pattern"),
    extension: z.string().optional().describe("Filter by file extension (e.g., 'cs', 'js')"),
  },
  async ({ query, repoId, path, extension }) => {
    try {
      const service = getGitHubEnterpriseService();
      const results = await service.searchCode(query, repoId, path, extension);

      return {
        content: [{
          type: "text",
          text: formatCodeSearchResultsAsMarkdown(results)
        }]
      };
    } catch (error: any) {
      console.error("Error searching code:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to search code: ${error.message}\n\n` +
            `Troubleshooting:\n` +
            `1. Simplify search query if too complex\n` +
            `2. Check rate limits if search fails\n` +
            `3. Verify repository access permissions`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-list-files
 * List files in a directory
 */
server.tool(
  "ghe-list-files",
  "List files in a directory of a GitHub Enterprise repository",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    path: z.string().optional().describe("Directory path (default: root)"),
    branch: z.string().optional().describe("Branch name (default: auto-detected)"),
  },
  async ({ repoId, path, branch }) => {
    try {
      const service = getGitHubEnterpriseService();
      const result = await service.listFiles(repoId, path, branch);

      return {
        content: [{
          type: "text",
          text: `# Directory: ${path || '/'}\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**Branch:** \`${result.branch}\`  \n\n` +
            formatDirectoryContentsAsMarkdown(result.contents)
        }]
      };
    } catch (error: any) {
      console.error("Error listing files:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list files: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-clear-cache
 * Clear cached GitHub API responses
 */
server.tool(
  "ghe-clear-cache",
  "Clear cached GitHub Enterprise API responses (useful after pushing code updates)",
  {
    pattern: z.string().optional().describe("Clear only cache entries matching this pattern (e.g., 'ContactPlugin.cs')"),
    repoId: z.string().optional().describe("Clear cache for specific repository only"),
  },
  async ({ pattern, repoId }) => {
    try {
      const service = getGitHubEnterpriseService();
      const cleared = service.clearCache(pattern, repoId);

      return {
        content: [{
          type: "text",
          text: `✅ Cleared ${cleared} cache entries` +
            (pattern ? ` matching pattern '${pattern}'` : '') +
            (repoId ? ` for repository '${repoId}'` : '')
        }]
      };
    } catch (error: any) {
      console.error("Error clearing cache:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to clear cache: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-commits
 * Get commit history for a branch
 */
server.tool(
  "ghe-get-commits",
  "Get commit history for a branch in a GitHub Enterprise repository",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    branch: z.string().optional().describe("Branch name (default: auto-detected)"),
    since: z.string().optional().describe("ISO 8601 date (e.g., '2025-01-01T00:00:00Z')"),
    until: z.string().optional().describe("ISO 8601 date"),
    author: z.string().optional().describe("Filter by author"),
    path: z.string().optional().describe("Filter by file path"),
    limit: z.number().optional().describe("Max commits (default: 50)"),
  },
  async ({ repoId, branch, since, until, author, path, limit }) => {
    try {
      const service = getGitHubEnterpriseService();
      const commits = await service.getCommits(repoId, branch, since, until, author, path, limit || 50);

      return {
        content: [{
          type: "text",
          text: `# Commit History\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**Count:** ${commits.length}\n\n` +
            formatCommitHistoryAsMarkdown(commits)
        }]
      };
    } catch (error: any) {
      console.error("Error getting commits:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get commits: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-commit-details
 * Get detailed information about a commit
 */
server.tool(
  "ghe-get-commit-details",
  "Get detailed information about a specific commit in a GitHub Enterprise repository",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    sha: z.string().describe("Commit SHA"),
  },
  async ({ repoId, sha }) => {
    try {
      const service = getGitHubEnterpriseService();
      const commit = await service.getCommitDetails(repoId, sha);

      return {
        content: [{
          type: "text",
          text: formatCommitDetailsAsMarkdown(commit)
        }]
      };
    } catch (error: any) {
      console.error("Error getting commit details:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get commit details: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-search-commits
 * Search commits by message
 */
server.tool(
  "ghe-search-commits",
  "Search commits by message or hash (supports work item references like '#1234')",
  {
    query: z.string().describe("Search query (e.g., '#1234', 'fix bug')"),
    repoId: z.string().optional().describe("Limit to specific repository"),
    author: z.string().optional().describe("Filter by author"),
    since: z.string().optional().describe("ISO 8601 date"),
    until: z.string().optional().describe("ISO 8601 date"),
  },
  async ({ query, repoId, author, since, until }) => {
    try {
      const service = getGitHubEnterpriseService();
      const results = await service.searchCommits(query, repoId, author, since, until);

      return {
        content: [{
          type: "text",
          text: `# Commit Search Results\n\n` +
            `**Query:** ${query}  \n` +
            `**Total Results:** ${results.total_count}  \n` +
            `**Showing:** ${results.items.length}\n\n` +
            formatCommitHistoryAsMarkdown(results.items)
        }]
      };
    } catch (error: any) {
      console.error("Error searching commits:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to search commits: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-commit-diff
 * Get diff for a commit
 */
server.tool(
  "ghe-get-commit-diff",
  "Get detailed diff for a commit in unified format",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    sha: z.string().describe("Commit SHA"),
    format: z.enum(['diff', 'patch']).optional().describe("Format: 'diff' or 'patch' (default: 'diff')"),
  },
  async ({ repoId, sha, format }) => {
    try {
      const service = getGitHubEnterpriseService();
      const diff = await service.getCommitDiff(repoId, sha, format || 'diff');

      return {
        content: [{
          type: "text",
          text: `# Commit Diff: ${sha}\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**Format:** ${format || 'diff'}  \n\n` +
            `\`\`\`diff\n${diff}\n\`\`\``
        }]
      };
    } catch (error: any) {
      console.error("Error getting commit diff:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get commit diff: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-compare-branches
 * Compare two branches
 */
server.tool(
  "ghe-compare-branches",
  "Compare two branches and show differences",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    base: z.string().describe("Base branch name"),
    head: z.string().describe("Head branch name"),
  },
  async ({ repoId, base, head }) => {
    try {
      const service = getGitHubEnterpriseService();
      const comparison = await service.compareBranches(repoId, base, head);

      const insights = analyzeBranchComparison(comparison);

      return {
        content: [{
          type: "text",
          text: `# Branch Comparison: ${base} ← ${head}\n\n` +
            `**Repository:** ${repoId}  \n\n` +
            `## Summary\n\n` +
            insights.join('\n') + '\n\n' +
            `## Commits (${comparison.commits.length})\n\n` +
            formatCommitHistoryAsMarkdown(comparison.commits.slice(0, 10))
        }]
      };
    } catch (error: any) {
      console.error("Error comparing branches:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to compare branches: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-branch-details
 * Get branch details
 */
server.tool(
  "ghe-get-branch-details",
  "Get detailed information about a specific branch",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    branch: z.string().describe("Branch name"),
  },
  async ({ repoId, branch }) => {
    try {
      const service = getGitHubEnterpriseService();
      const branchInfo = await service.getBranchDetails(repoId, branch);

      return {
        content: [{
          type: "text",
          text: `# Branch Details: ${branch}\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**Protected:** ${branchInfo.protected ? '🔒 Yes' : 'No'}  \n` +
            `**Last Commit:** \`${branchInfo.commit.sha.substring(0, 7)}\`  \n` +
            `**Commit Message:** ${branchInfo.commit.commit.message.split('\n')[0]}  \n` +
            `**Author:** ${branchInfo.commit.commit.author.name}  \n` +
            `**Date:** ${new Date(branchInfo.commit.commit.author.date).toLocaleString()}  \n\n` +
            JSON.stringify(branchInfo, null, 2)
        }]
      };
    } catch (error: any) {
      console.error("Error getting branch details:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get branch details: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-list-pull-requests
 * List pull requests
 */
server.tool(
  "ghe-list-pull-requests",
  "List pull requests for a GitHub Enterprise repository",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    state: z.enum(['open', 'closed', 'all']).optional().describe("PR state (default: 'open')"),
    base: z.string().optional().describe("Filter by base branch"),
    head: z.string().optional().describe("Filter by head branch"),
    sort: z.enum(['created', 'updated', 'popularity']).optional().describe("Sort order (default: 'created')"),
    limit: z.number().optional().describe("Max results (default: 30)"),
  },
  async ({ repoId, state, base, head, sort, limit }) => {
    try {
      const service = getGitHubEnterpriseService();
      const prs = await service.listPullRequests(repoId, state || 'open', base, head, sort || 'created', limit || 30);

      return {
        content: [{
          type: "text",
          text: `# Pull Requests\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**State:** ${state || 'open'}  \n` +
            `**Count:** ${prs.length}\n\n` +
            formatPullRequestsAsMarkdown(prs)
        }]
      };
    } catch (error: any) {
      console.error("Error listing pull requests:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list pull requests: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-pull-request
 * Get pull request details
 */
server.tool(
  "ghe-get-pull-request",
  "Get detailed information about a specific pull request",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    prNumber: z.number().describe("Pull request number"),
  },
  async ({ repoId, prNumber }) => {
    try {
      const service = getGitHubEnterpriseService();
      const pr = await service.getPullRequest(repoId, prNumber);

      return {
        content: [{
          type: "text",
          text: formatPullRequestDetailsAsMarkdown(pr)
        }]
      };
    } catch (error: any) {
      console.error("Error getting pull request:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get pull request: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-pr-files
 * Get pull request files
 */
server.tool(
  "ghe-get-pr-files",
  "Get files changed in a pull request",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    prNumber: z.number().describe("Pull request number"),
  },
  async ({ repoId, prNumber }) => {
    try {
      const service = getGitHubEnterpriseService();
      const files = await service.getPullRequestFiles(repoId, prNumber);

      const header = '| File | Status | +/- | Changes |';
      const separator = '|------|--------|-----|---------|';

      const rows = files.map(f => {
        const status = f.status === 'added' ? '🆕 Added' :
                       f.status === 'modified' ? '📝 Modified' :
                       f.status === 'removed' ? '🗑️ Removed' :
                       f.status === 'renamed' ? '📋 Renamed' : f.status;

        return `| \`${f.filename}\` | ${status} | +${f.additions}/-${f.deletions} | ${f.changes} |`;
      });

      return {
        content: [{
          type: "text",
          text: `# Pull Request #${prNumber} - Files Changed\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**Total Files:** ${files.length}\n\n` +
            [header, separator, ...rows].join('\n')
        }]
      };
    } catch (error: any) {
      console.error("Error getting PR files:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get PR files: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-directory-structure
 * Get recursive directory tree
 */
server.tool(
  "ghe-get-directory-structure",
  "Get recursive directory tree structure",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    path: z.string().optional().describe("Directory path (default: root)"),
    branch: z.string().optional().describe("Branch name (default: auto-detected)"),
    depth: z.number().optional().describe("Recursion depth limit (default: 3)"),
  },
  async ({ repoId, path, branch, depth }) => {
    try {
      const service = getGitHubEnterpriseService();
      const result = await service.getDirectoryStructure(repoId, path, branch, depth || 3);

      return {
        content: [{
          type: "text",
          text: `# Directory Structure: ${path || '/'}\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**Branch:** \`${result.branch}\`  \n` +
            `**Max Depth:** ${depth || 3}\n\n` +
            '```\n' + formatFileTreeAsMarkdown(result.tree) + '\n```'
        }]
      };
    } catch (error: any) {
      console.error("Error getting directory structure:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get directory structure: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-get-file-history
 * Get file commit history
 */
server.tool(
  "ghe-get-file-history",
  "Get commit history for a specific file",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    path: z.string().describe("File path"),
    branch: z.string().optional().describe("Branch name (default: auto-detected)"),
    limit: z.number().optional().describe("Max commits (default: 50)"),
  },
  async ({ repoId, path, branch, limit }) => {
    try {
      const service = getGitHubEnterpriseService();
      const commits = await service.getFileHistory(repoId, path, branch, limit || 50);

      return {
        content: [{
          type: "text",
          text: `# File History: ${path}\n\n` +
            `**Repository:** ${repoId}  \n` +
            `**Commits:** ${commits.length}\n\n` +
            formatCommitHistoryAsMarkdown(commits)
        }]
      };
    } catch (error: any) {
      console.error("Error getting file history:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get file history: ${error.message}`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-create-branch
 * Create a new branch (WRITE - requires GHE_ENABLE_CREATE=true)
 */
server.tool(
  "ghe-create-branch",
  "Create a new branch (requires GHE_ENABLE_CREATE=true)",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    branchName: z.string().describe("New branch name"),
    fromBranch: z.string().optional().describe("Source branch (default: auto-detected)"),
  },
  async ({ repoId, branchName, fromBranch }) => {
    try {
      const service = getGitHubEnterpriseService();
      const result = await service.createBranch(repoId, branchName, fromBranch);

      return {
        content: [{
          type: "text",
          text: `✅ Branch '${branchName}' created successfully\n\n` +
            JSON.stringify(result, null, 2)
        }]
      };
    } catch (error: any) {
      console.error("Error creating branch:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to create branch: ${error.message}\n\n` +
            `Note: Branch creation requires GHE_ENABLE_CREATE=true`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-update-file
 * Update file content (WRITE - requires GHE_ENABLE_WRITE=true)
 */
server.tool(
  "ghe-update-file",
  "Update file content (requires GHE_ENABLE_WRITE=true)",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    path: z.string().describe("File path"),
    content: z.string().describe("New file content"),
    message: z.string().describe("Commit message"),
    branch: z.string().describe("Branch name"),
    sha: z.string().describe("Current file SHA (for conflict detection)"),
  },
  async ({ repoId, path, content, message, branch, sha }) => {
    try {
      const service = getGitHubEnterpriseService();
      const result = await service.updateFile(repoId, path, content, message, branch, sha);

      return {
        content: [{
          type: "text",
          text: `✅ File '${path}' updated successfully\n\n` +
            `**Commit SHA:** \`${result.commit.sha}\`  \n` +
            `**Branch:** \`${branch}\`  \n` +
            `**Message:** ${message}`
        }]
      };
    } catch (error: any) {
      console.error("Error updating file:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to update file: ${error.message}\n\n` +
            `Note: File updates require GHE_ENABLE_WRITE=true`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-create-file
 * Create a new file (WRITE - requires GHE_ENABLE_CREATE=true)
 */
server.tool(
  "ghe-create-file",
  "Create a new file (requires GHE_ENABLE_CREATE=true)",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    path: z.string().describe("File path"),
    content: z.string().describe("File content"),
    message: z.string().describe("Commit message"),
    branch: z.string().describe("Branch name"),
  },
  async ({ repoId, path, content, message, branch }) => {
    try {
      const service = getGitHubEnterpriseService();
      const result = await service.createFile(repoId, path, content, message, branch);

      return {
        content: [{
          type: "text",
          text: `✅ File '${path}' created successfully\n\n` +
            `**Commit SHA:** \`${result.commit.sha}\`  \n` +
            `**Branch:** \`${branch}\`  \n` +
            `**Message:** ${message}`
        }]
      };
    } catch (error: any) {
      console.error("Error creating file:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to create file: ${error.message}\n\n` +
            `Note: File creation requires GHE_ENABLE_CREATE=true`
        }]
      };
    }
  }
);

/**
 * Tool: ghe-search-repos
 * Search repositories
 */
server.tool(
  "ghe-search-repos",
  "Search repositories by name or description across GitHub Enterprise",
  {
    query: z.string().describe("Search query"),
    owner: z.string().optional().describe("Filter by organization/owner"),
  },
  async ({ query, owner }) => {
    try {
      const service = getGitHubEnterpriseService();
      const results = await service.searchRepositories(query, owner);

      return {
        content: [{
          type: "text",
          text: `# Repository Search Results\n\n` +
            `**Query:** ${query}  \n` +
            `**Total Results:** ${results.total_count}  \n` +
            `**Showing:** ${results.items.length}\n\n` +
            JSON.stringify(results.items, null, 2)
        }]
      };
    } catch (error: any) {
      console.error("Error searching repositories:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to search repositories: ${error.message}`
        }]
      };
    }
  }
);

/**
 * ===========================================
 * AZURE SERVICE BUS TOOLS (8 total)
 * ===========================================
 */

/**
 * Tool: servicebus-list-namespaces
 * List all configured Service Bus namespaces
 */
server.tool(
  "servicebus-list-namespaces",
  "List all configured Service Bus namespaces (active and inactive)",
  {},
  async () => {
    try {
      const service = getServiceBusService();
      const resources = service.getAllResources();

      return {
        content: [{
          type: "text",
          text: JSON.stringify(resources, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error listing Service Bus namespaces:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list namespaces: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: servicebus-test-connection
 * Test connectivity to Service Bus namespace
 */
server.tool(
  "servicebus-test-connection",
  "Test connectivity to a Service Bus namespace and verify permissions (Data Receiver + Reader roles)",
  {
    resourceId: z.string().describe("Service Bus resource ID (use servicebus-list-namespaces to find IDs)"),
  },
  async ({ resourceId }) => {
    try {
      const service = getServiceBusService();
      const result = await service.testConnection(resourceId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error testing Service Bus connection:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to test connection: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: servicebus-list-queues
 * List all queues in a namespace
 */
server.tool(
  "servicebus-list-queues",
  "List all queues in a Service Bus namespace with message counts and session info (cached for 5 minutes)",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
  },
  async ({ resourceId }) => {
    try {
      const service = getServiceBusService();
      const queues = await service.listQueues(resourceId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(queues, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error listing Service Bus queues:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list queues: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: servicebus-peek-messages
 * Peek messages in a queue (read-only, non-destructive)
 */
server.tool(
  "servicebus-peek-messages",
  "Peek messages in a queue without removing them (read-only, max 100 messages)",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
    queueName: z.string().describe("Queue name"),
    maxMessages: z.number().optional().describe("Maximum messages to peek (default: 10, max: 100)"),
    sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
  },
  async ({ resourceId, queueName, maxMessages, sessionId }) => {
    try {
      const service = getServiceBusService();
      const messages = await service.peekMessages(resourceId, queueName, maxMessages || 10, sessionId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(messages, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error peeking messages:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to peek messages: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: servicebus-peek-deadletter
 * Peek dead letter queue messages
 */
server.tool(
  "servicebus-peek-deadletter",
  "Peek dead letter queue messages with failure reasons (read-only, max 100 messages)",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
    queueName: z.string().describe("Queue name"),
    maxMessages: z.number().optional().describe("Maximum messages to peek (default: 10, max: 100)"),
    sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
  },
  async ({ resourceId, queueName, maxMessages, sessionId }) => {
    try {
      const service = getServiceBusService();
      const messages = await service.peekDeadLetterMessages(resourceId, queueName, maxMessages || 10, sessionId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(messages, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error peeking dead letter messages:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to peek dead letter messages: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: servicebus-get-queue-properties
 * Get queue properties and metrics
 */
server.tool(
  "servicebus-get-queue-properties",
  "Get detailed queue properties, metrics, and configuration including session info",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
    queueName: z.string().describe("Queue name"),
  },
  async ({ resourceId, queueName }) => {
    try {
      const service = getServiceBusService();
      const properties = await service.getQueueProperties(resourceId, queueName);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(properties, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting queue properties:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get queue properties: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: servicebus-search-messages
 * Search messages by content or properties
 */
server.tool(
  "servicebus-search-messages",
  "Search messages by content or properties (loads into memory, max 500 messages)",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
    queueName: z.string().describe("Queue name"),
    bodyContains: z.string().optional().describe("Search for text in message body (case-insensitive)"),
    correlationId: z.string().optional().describe("Filter by correlation ID"),
    messageId: z.string().optional().describe("Filter by message ID"),
    propertyKey: z.string().optional().describe("Application property key to filter by"),
    propertyValue: z.any().optional().describe("Application property value to match"),
    sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
    maxMessages: z.number().optional().describe("Maximum messages to search (default: 50, max: 500)"),
  },
  async ({ resourceId, queueName, bodyContains, correlationId, messageId, propertyKey, propertyValue, sessionId, maxMessages }) => {
    try {
      const service = getServiceBusService();
      const result = await service.searchMessages(
        resourceId,
        queueName,
        { bodyContains, correlationId, messageId, propertyKey, propertyValue, sessionId },
        maxMessages || 50
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error searching messages:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to search messages: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: servicebus-get-namespace-properties
 * Get namespace properties
 */
server.tool(
  "servicebus-get-namespace-properties",
  "Get namespace-level properties and quotas (tier, max message size)",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
  },
  async ({ resourceId }) => {
    try {
      const service = getServiceBusService();
      const properties = await service.getNamespaceProperties(resourceId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(properties, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting namespace properties:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get namespace properties: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * ===========================================
 * GITHUB ENTERPRISE PROMPTS (5 total)
 * ===========================================
 */

/**
 * Prompt: ghe-repo-overview
 * Comprehensive repository overview with branch analysis
 */
server.prompt(
  "ghe-repo-overview",
  "Get a comprehensive repository overview with branch analysis and recent commits",
  {
    repoId: z.string().describe("Repository ID from configuration"),
  },
  async ({ repoId }) => {
    const service = getGitHubEnterpriseService();

    const repo = service.getRepoById(repoId);
    const [branches, defaultBranchInfo] = await Promise.all([
      service.listBranches(repoId),
      service.getDefaultBranch(repoId),
    ]);

    const recentCommits = await service.getCommits(repoId, defaultBranchInfo.branch, undefined, undefined, undefined, undefined, 10);

    const output = formatRepositoryOverviewAsMarkdown(
      {
        owner: repo.owner,
        repo: repo.repo,
        url: `${service['config'].baseUrl}/${repo.owner}/${repo.repo}`,
        defaultBranch: defaultBranchInfo.branch,
        description: repo.description,
        active: repo.active,
      },
      branches,
      recentCommits
    );

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: ghe-code-search-report
 * Formatted code search results with context
 */
server.prompt(
  "ghe-code-search-report",
  "Search code across repositories and get formatted results with analysis",
  {
    query: z.string().describe("Search query"),
    repoId: z.string().optional().describe("Limit to specific repository ID"),
    extension: z.string().optional().describe("Filter by file extension (e.g., 'cs', 'js')"),
  },
  async ({ query, repoId, extension }) => {
    const service = getGitHubEnterpriseService();
    const results = await service.searchCode(query, repoId, undefined, extension);

    const output = formatCodeSearchResultsAsMarkdown(results);

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: ghe-branch-comparison-report
 * Branch comparison with deployment-ready summary
 */
server.prompt(
  "ghe-branch-comparison-report",
  "Compare branches and generate deployment-ready summary with checklist",
  {
    repoId: z.string().describe("Repository ID from configuration"),
    base: z.string().describe("Base branch (e.g., 'main')"),
    head: z.string().describe("Head branch to compare (e.g., 'release/9.0')"),
  },
  async ({ repoId, base, head }) => {
    const service = getGitHubEnterpriseService();
    const repo = service.getRepoById(repoId);

    const comparison = await service.compareBranches(repoId, base, head);
    const insights = analyzeBranchComparison(comparison);
    const checklist = generateDeploymentChecklist(comparison);

    let output = `# Branch Comparison: ${base} ← ${head}\n\n`;
    output += `**Repository:** ${repo.owner}/${repo.repo}\n`;
    output += `**Comparing:** \`${base}\` (base) ← \`${head}\` (head)\n\n`;

    output += `## Summary\n\n`;
    output += insights.join('\n') + '\n\n';

    if (comparison.commits && comparison.commits.length > 0) {
      output += `## Commits to Deploy\n\n`;
      output += formatCommitHistoryAsMarkdown(comparison.commits) + '\n\n';
    }

    if (comparison.files && comparison.files.length > 0) {
      output += `## Files Changed (${comparison.files.length})\n\n`;
      const header = '| File | Status | +/- | Changes |';
      const separator = '|------|--------|-----|---------|';
      const rows = comparison.files.slice(0, 20).map((f: any) => {
        const status = f.status === 'added' ? '🆕 Added' :
                       f.status === 'modified' ? '📝 Modified' :
                       f.status === 'removed' ? '🗑️ Removed' :
                       f.status === 'renamed' ? '📋 Renamed' : f.status;
        return `| \`${f.filename}\` | ${status} | +${f.additions}/-${f.deletions} | ${f.changes} |`;
      });
      output += [header, separator, ...rows].join('\n');

      if (comparison.files.length > 20) {
        output += `\n\n*Showing 20 of ${comparison.files.length} files*`;
      }
      output += '\n\n';
    }

    output += `## Deployment Checklist\n\n`;
    output += checklist.join('\n');

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: ghe-troubleshooting-guide
 * Comprehensive bug troubleshooting with cross-service context
 */
server.prompt(
  "ghe-troubleshooting-guide",
  "Generate comprehensive bug troubleshooting report with source code analysis",
  {
    repoId: z.string().describe("Repository ID to investigate"),
    searchQuery: z.string().describe("Search query (e.g., plugin name, entity name, or code pattern)"),
    branch: z.string().optional().describe("Branch to search (default: auto-detected)"),
  },
  async ({ repoId, searchQuery, branch }) => {
    const service = getGitHubEnterpriseService();
    const repo = service.getRepoById(repoId);

    // Search for code
    const codeResults = await service.searchCode(searchQuery, repoId);

    // Search commits for references
    const commitResults = await service.searchCommits(repoId, searchQuery);

    let output = `# Bug Troubleshooting Report\n\n`;
    output += `**Repository:** ${repo.owner}/${repo.repo}\n`;
    output += `**Search Query:** \`${searchQuery}\`\n\n`;

    output += `## Source Code Analysis\n\n`;

    if (codeResults.total_count > 0) {
      output += `Found **${codeResults.total_count} code matches** across ${codeResults.items.length} files:\n\n`;
      output += formatCodeSearchResultsAsMarkdown(codeResults) + '\n\n';
    } else {
      output += `*No code matches found for query: "${searchQuery}"*\n\n`;
    }

    output += `## Related Commits\n\n`;

    if (commitResults.length > 0) {
      output += `Found **${commitResults.length} commits** referencing "${searchQuery}":\n\n`;
      output += formatCommitHistoryAsMarkdown(commitResults.slice(0, 10)) + '\n\n';

      if (commitResults.length > 10) {
        output += `*Showing 10 of ${commitResults.length} commits*\n\n`;
      }
    } else {
      output += `*No commits found referencing "${searchQuery}"*\n\n`;
    }

    output += `## Recommendations\n\n`;
    output += `1. **Review Code Matches**: Check the code search results above for relevant implementations\n`;
    output += `2. **Analyze Recent Changes**: Review commit history for recent modifications\n`;
    output += `3. **Check Branch**: Current search is on branch \`${branch || 'auto-detected'}\`\n`;
    output += `4. **Cross-Reference**: Use ADO work items or PowerPlatform plugin names to correlate issues\n`;

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: ghe-deployment-report
 * Deployment-ready report with testing checklist and rollback plan
 */
server.prompt(
  "ghe-deployment-report",
  "Generate deployment-ready report with code changes, testing checklist, and rollback plan",
  {
    repoId: z.string().describe("Repository ID"),
    fromBranch: z.string().optional().describe("Source branch (default: main)"),
    toBranch: z.string().optional().describe("Target branch (default: auto-detected)"),
  },
  async ({ repoId, fromBranch = "main", toBranch }) => {
    const service = getGitHubEnterpriseService();
    const repo = service.getRepoById(repoId);

    // Auto-detect target branch if not specified
    const targetBranch = toBranch || (await service.getDefaultBranch(repoId)).branch;

    // Get branch comparison
    const comparison = await service.compareBranches(repoId, fromBranch, targetBranch);
    const insights = analyzeBranchComparison(comparison);
    const checklist = generateDeploymentChecklist(comparison);

    let output = `# Deployment Report: ${targetBranch} → ${fromBranch}\n\n`;
    output += `**Repository:** ${repo.owner}/${repo.repo}\n`;
    output += `**Source:** \`${targetBranch}\`\n`;
    output += `**Target:** \`${fromBranch}\` (Production)\n`;
    output += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;

    output += `## Executive Summary\n\n`;
    output += insights.join('\n') + '\n\n';

    output += `## Changes by Component\n\n`;

    if (comparison.files && comparison.files.length > 0) {
      // Group files by directory/component
      const filesByDir: Record<string, any[]> = {};
      comparison.files.forEach((f: any) => {
        const dir = f.filename.split('/')[0] || 'root';
        if (!filesByDir[dir]) filesByDir[dir] = [];
        filesByDir[dir].push(f);
      });

      Object.entries(filesByDir).forEach(([dir, files]) => {
        output += `### ${dir}/ (${files.length} files)\n\n`;
        const rows = files.slice(0, 10).map((f: any) =>
          `- \`${f.filename}\` (+${f.additions}, -${f.deletions})`
        );
        output += rows.join('\n') + '\n\n';

        if (files.length > 10) {
          output += `*...and ${files.length - 10} more files*\n\n`;
        }
      });
    }

    output += `## Deployment Steps\n\n`;
    output += `### 1. Pre-Deployment Verification\n`;
    output += `\`\`\`bash\n# Review changes\ngit diff ${fromBranch}...${targetBranch}\n\n# Run tests\nnpm test  # or: dotnet test\n\`\`\`\n\n`;

    output += `### 2. Merge to Production\n`;
    output += `\`\`\`bash\ngit checkout ${fromBranch}\ngit merge ${targetBranch} --no-ff\ngit push origin ${fromBranch}\n\`\`\`\n\n`;

    output += `### 3. Post-Deployment Verification\n`;
    output += `- [ ] Smoke tests passing\n`;
    output += `- [ ] No errors in logs (first 15 minutes)\n`;
    output += `- [ ] Verify key functionality works\n\n`;

    output += `## Rollback Plan\n\n`;
    output += `If issues occur after deployment:\n\n`;
    output += `\`\`\`bash\n# Option 1: Revert merge commit\ngit revert -m 1 HEAD\ngit push origin ${fromBranch}\n\n`;
    output += `# Option 2: Reset to previous commit (if not pushed)\ngit reset --hard HEAD~1\n\`\`\`\n\n`;

    output += `## Testing Checklist\n\n`;
    output += checklist.join('\n');

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * ===========================================
 * AZURE SERVICE BUS PROMPTS (5 total)
 * ===========================================
 */

/**
 * Prompt: servicebus-namespace-overview
 * Comprehensive overview of all queues with health metrics
 */
server.prompt(
  "servicebus-namespace-overview",
  "Generate comprehensive overview of Service Bus namespace with all queues and health metrics",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
  },
  async ({ resourceId }) => {
    const service = getServiceBusService();
    const resource = service.getResourceById(resourceId);

    // Get namespace properties
    const namespaceProps = await service.getNamespaceProperties(resourceId);

    // Get all queues
    const queues = await service.listQueues(resourceId);

    // Format as markdown
    const output = formatNamespaceOverviewAsMarkdown({
      namespace: resource.namespace,
      tier: namespaceProps.tier,
      queues,
    });

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: servicebus-queue-health
 * Detailed health report for specific queue with recommendations
 */
server.prompt(
  "servicebus-queue-health",
  "Generate detailed health report for a specific queue with recommendations",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
    queueName: z.string().describe("Queue name"),
  },
  async ({ resourceId, queueName }) => {
    const service = getServiceBusService();
    const resource = service.getResourceById(resourceId);

    // Get queue info (runtime metrics)
    const queueInfo = await service.getQueueProperties(resourceId, queueName);

    // Get queue config (configuration properties)
    const queueConfig = await service.getQueueConfigProperties(resourceId, queueName);

    // Get health status
    const health = getQueueHealthStatus(queueInfo);

    // Peek recent messages
    const messages = await service.peekMessages(resourceId, queueName, 10);

    // Peek dead letter messages
    const deadLetterMessages = await service.peekDeadLetterMessages(resourceId, queueName, 10);

    let output = `# Queue Health Report: ${queueName}\n\n`;
    output += `**Namespace:** ${resource.namespace}\n`;
    output += `**Date:** ${new Date().toISOString()}\n\n`;

    output += `## Health Status\n\n`;
    output += `${health.icon} **${health.status.toUpperCase()}**\n\n`;
    output += `**Reason:** ${health.reason}\n\n`;

    output += `## Queue Metrics\n\n`;
    output += `| Metric | Value |\n`;
    output += `|--------|-------|\n`;
    output += `| Active Messages | ${queueInfo.activeMessageCount || 0} |\n`;
    output += `| Dead Letter Messages | ${queueInfo.deadLetterMessageCount || 0} |\n`;
    output += `| Scheduled Messages | ${queueInfo.scheduledMessageCount || 0} |\n`;
    output += `| Size (bytes) | ${queueInfo.sizeInBytes?.toLocaleString() || 0} |\n`;
    output += `| Max Size (MB) | ${queueConfig.maxSizeInMegabytes || 0} |\n\n`;

    output += `## Configuration\n\n`;
    output += `| Setting | Value |\n`;
    output += `|---------|-------|\n`;
    output += `| Lock Duration | ${queueConfig.lockDuration || 'N/A'} |\n`;
    output += `| Max Delivery Count | ${queueConfig.maxDeliveryCount || 0} |\n`;
    output += `| Duplicate Detection | ${queueConfig.requiresDuplicateDetection ? 'Yes' : 'No'} |\n`;
    output += `| Sessions Enabled | ${queueInfo.requiresSession ? 'Yes' : 'No'} |\n`;
    output += `| Partitioning Enabled | ${queueConfig.enablePartitioning ? 'Yes' : 'No'} |\n\n`;

    output += `## Recommendations\n\n`;
    if (health.status === 'critical') {
      output += `⚠️ **CRITICAL**: Immediate action required\n`;
      output += `- Investigate dead letter messages immediately\n`;
      output += `- Check consumer health and processing capacity\n`;
      output += `- Consider scaling out consumers\n\n`;
    } else if (health.status === 'warning') {
      output += `⚠️ **WARNING**: Monitor closely\n`;
      output += `- Review message processing times\n`;
      output += `- Check for processing bottlenecks\n`;
      output += `- Monitor dead letter queue growth\n\n`;
    } else {
      output += `✅ Queue is healthy\n`;
      output += `- Continue regular monitoring\n`;
      output += `- Maintain current processing capacity\n\n`;
    }

    if (messages.length > 0) {
      output += `## Recent Messages (${messages.length})\n\n`;
      output += formatMessagesAsMarkdown(messages, false);
    }

    if (deadLetterMessages.length > 0) {
      output += `\n## Dead Letter Messages (${deadLetterMessages.length})\n\n`;
      output += formatMessagesAsMarkdown(deadLetterMessages, false);
    }

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: servicebus-deadletter-analysis
 * DLQ investigation with pattern detection and recommendations
 */
server.prompt(
  "servicebus-deadletter-analysis",
  "Analyze dead letter queue with pattern detection and actionable recommendations",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
    queueName: z.string().describe("Queue name"),
    maxMessages: z.string().optional().describe("Maximum messages to analyze (default: 50)"),
  },
  async ({ resourceId, queueName, maxMessages }) => {
    const service = getServiceBusService();
    const resource = service.getResourceById(resourceId);

    // Parse maxMessages to number
    const maxMsgs = maxMessages ? parseInt(maxMessages, 10) : 50;

    // Peek dead letter messages
    const deadLetterMessages = await service.peekDeadLetterMessages(
      resourceId,
      queueName,
      maxMsgs
    );

    if (deadLetterMessages.length === 0) {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Dead Letter Queue Analysis: ${queueName}\n\n✅ **No dead letter messages found**\n\nThe dead letter queue is empty. This indicates healthy message processing.`,
            },
          },
        ],
      };
    }

    // Analyze dead letter messages
    const { markdown } = formatDeadLetterAnalysisAsMarkdown(deadLetterMessages);

    let output = `# Dead Letter Queue Analysis: ${queueName}\n\n`;
    output += `**Namespace:** ${resource.namespace}\n`;
    output += `**Date:** ${new Date().toISOString()}\n`;
    output += `**Messages Analyzed:** ${deadLetterMessages.length}\n\n`;
    output += markdown;

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: servicebus-message-inspection
 * Detailed inspection of a single message with cross-service recommendations
 */
server.prompt(
  "servicebus-message-inspection",
  "Inspect a single message in detail with cross-service troubleshooting recommendations",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
    queueName: z.string().describe("Queue name"),
    messageId: z.string().optional().describe("Message ID to inspect (if not provided, inspects first message)"),
    isDeadLetter: z.string().optional().describe("Inspect dead letter queue (default: false)"),
  },
  async ({ resourceId, queueName, messageId, isDeadLetter }) => {
    const service = getServiceBusService();
    const resource = service.getResourceById(resourceId);

    // Parse isDeadLetter to boolean
    const isDLQ = isDeadLetter === 'true';

    // Peek messages
    const messages = isDLQ
      ? await service.peekDeadLetterMessages(resourceId, queueName, 100)
      : await service.peekMessages(resourceId, queueName, 100);

    if (messages.length === 0) {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Message Inspection: ${queueName}\n\n**No messages found** in ${isDLQ ? 'dead letter queue' : 'queue'}.`,
            },
          },
        ],
      };
    }

    // Find specific message or use first
    const message = messageId
      ? messages.find((m) => m.messageId === messageId)
      : messages[0];

    if (!message) {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Message Inspection: ${queueName}\n\n**Message not found** with ID: ${messageId}\n\nAvailable message IDs:\n${messages.slice(0, 10).map((m) => `- ${m.messageId}`).join('\n')}`,
            },
          },
        ],
      };
    }

    // Format message inspection
    const output = formatMessageInspectionAsMarkdown(message, isDLQ);

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `# Message Inspection: ${queueName}\n\n**Namespace:** ${resource.namespace}\n**Queue:** ${queueName}\n**Date:** ${new Date().toISOString()}\n\n${output}`,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: servicebus-cross-service-troubleshooting
 * Multi-service correlation report combining Service Bus, Application Insights, and Log Analytics
 */
server.prompt(
  "servicebus-cross-service-troubleshooting",
  "Generate comprehensive troubleshooting report correlating Service Bus with Application Insights and Log Analytics",
  {
    resourceId: z.string().describe("Service Bus resource ID"),
    queueName: z.string().describe("Queue name"),
    correlationId: z.string().optional().describe("Correlation ID to trace across services"),
    timespan: z.string().optional().describe("Time range (ISO 8601 duration, e.g., 'PT1H', 'P1D')"),
  },
  async ({ resourceId, queueName, correlationId, timespan }) => {
    const service = getServiceBusService();
    const resource = service.getResourceById(resourceId);

    // Get queue properties
    const queueProps = await service.getQueueProperties(resourceId, queueName);

    // Peek messages (recent)
    const messages = await service.peekMessages(resourceId, queueName, 50);

    // Peek dead letter messages
    const deadLetterMessages = await service.peekDeadLetterMessages(resourceId, queueName, 50);

    // Search by correlation ID if provided
    let correlatedMessages: ServiceBusReceivedMessage[] = [];
    if (correlationId) {
      const searchResult = await service.searchMessages(resourceId, queueName, { correlationId }, 100);
      correlatedMessages = searchResult.messages;
    }

    // Try to get Application Insights data (if available)
    let appInsightsExceptions = null;
    let appInsightsTraces = null;
    try {
      if (applicationInsightsService && correlationId) {
        // This would require Application Insights integration
        // For now, we'll include a placeholder
      }
    } catch {
      // Application Insights not configured or not available
    }

    // Generate cross-service report
    const output = generateCrossServiceReport({
      serviceBus: {
        namespace: resource.namespace,
        queue: queueName,
        deadLetterMessages,
      },
      timespan: timespan || 'PT1H',
    });

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: output,
          },
        },
      ],
    };
  }
);

/**
 * ===========================================
 * SHAREPOINT ONLINE TOOLS (15 total)
 * ===========================================
 */

/**
 * Tool: spo-list-sites
 * List all configured SharePoint sites
 */
server.tool(
  "spo-list-sites",
  "List all configured SharePoint sites (active and inactive)",
  {},
  async () => {
    try {
      const service = getSharePointService();
      const sites = service.getAllSites();

      return {
        content: [{
          type: "text",
          text: JSON.stringify(sites, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error listing SharePoint sites:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list sites: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-get-site-info
 * Get detailed information about a SharePoint site
 */
server.tool(
  "spo-get-site-info",
  "Get detailed site information including metadata, created/modified dates, and owner info",
  {
    siteId: z.string().describe("Site ID from configuration (use spo-list-sites to find IDs)"),
  },
  async ({ siteId }) => {
    try {
      const service = getSharePointService();
      const siteInfo = await service.getSiteInfo(siteId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(siteInfo, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting SharePoint site info:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get site info: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-test-connection
 * Test connectivity to a SharePoint site
 */
server.tool(
  "spo-test-connection",
  "Test connectivity to a SharePoint site and verify permissions (Sites.Read.All and Files.Read.All required)",
  {
    siteId: z.string().describe("Site ID from configuration"),
  },
  async ({ siteId }) => {
    try {
      const service = getSharePointService();
      const result = await service.testConnection(siteId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error testing SharePoint connection:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to test connection: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-list-drives
 * List all document libraries in a site
 */
server.tool(
  "spo-list-drives",
  "List all document libraries (drives) in a SharePoint site with metadata",
  {
    siteId: z.string().describe("Site ID from configuration"),
  },
  async ({ siteId }) => {
    try {
      const service = getSharePointService();
      const drives = await service.listDrives(siteId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(drives, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error listing SharePoint drives:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list drives: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-get-drive-info
 * Get detailed information about a document library
 */
server.tool(
  "spo-get-drive-info",
  "Get detailed document library information including quota, owner, and created/modified dates",
  {
    siteId: z.string().describe("Site ID from configuration"),
    driveId: z.string().describe("Drive ID (use spo-list-drives to find IDs)"),
  },
  async ({ siteId, driveId }) => {
    try {
      const service = getSharePointService();
      const driveInfo = await service.getDriveInfo(siteId, driveId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(driveInfo, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting SharePoint drive info:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get drive info: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-clear-cache
 * Clear cached SharePoint responses
 */
server.tool(
  "spo-clear-cache",
  "Clear cached SharePoint responses (useful after site changes or for troubleshooting)",
  {
    siteId: z.string().optional().describe("Clear cache for specific site only (optional)"),
    pattern: z.string().optional().describe("Clear only cache entries matching this pattern (optional)"),
  },
  async ({ siteId, pattern }) => {
    try {
      const service = getSharePointService();
      const clearedCount = service.clearCache(pattern, siteId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ clearedCount, message: `Cleared ${clearedCount} cache entries` }, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error clearing SharePoint cache:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to clear cache: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-list-items
 * List files and folders in a drive or folder
 */
server.tool(
  "spo-list-items",
  "List all files and folders in a document library or folder",
  {
    siteId: z.string().describe("Site ID from configuration"),
    driveId: z.string().describe("Drive ID"),
    folderId: z.string().optional().describe("Folder ID (optional, defaults to root)"),
  },
  async ({ siteId, driveId, folderId }) => {
    try {
      const service = getSharePointService();
      const items = await service.listItems(siteId, driveId, folderId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(items, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error listing SharePoint items:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to list items: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-get-item
 * Get file or folder metadata by ID
 */
server.tool(
  "spo-get-item",
  "Get detailed file or folder metadata by ID",
  {
    siteId: z.string().describe("Site ID from configuration"),
    driveId: z.string().describe("Drive ID"),
    itemId: z.string().describe("Item ID"),
  },
  async ({ siteId, driveId, itemId }) => {
    try {
      const service = getSharePointService();
      const item = await service.getItem(siteId, driveId, itemId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(item, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting SharePoint item:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get item: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-get-item-by-path
 * Get file or folder metadata by path
 */
server.tool(
  "spo-get-item-by-path",
  "Get file or folder metadata by path (relative to drive root)",
  {
    siteId: z.string().describe("Site ID from configuration"),
    driveId: z.string().describe("Drive ID"),
    path: z.string().describe("Item path (e.g., '/folder/file.docx' or 'folder/subfolder')"),
  },
  async ({ siteId, driveId, path }) => {
    try {
      const service = getSharePointService();
      const item = await service.getItemByPath(siteId, driveId, path);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(item, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting SharePoint item by path:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get item by path: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-search-items
 * Search for files by filename or metadata
 */
server.tool(
  "spo-search-items",
  "Search for files by filename or metadata (filename and metadata search only, not full-text)",
  {
    siteId: z.string().describe("Site ID from configuration"),
    query: z.string().describe("Search query"),
    driveId: z.string().optional().describe("Limit search to specific drive (optional)"),
    limit: z.number().optional().describe("Maximum results (default: 100, max configured in SHAREPOINT_MAX_SEARCH_RESULTS)"),
  },
  async ({ siteId, query, driveId, limit }) => {
    try {
      const service = getSharePointService();
      const result = await service.searchItems(siteId, query, driveId, limit);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error searching SharePoint items:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to search items: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-get-recent-items
 * Get recently modified items in a drive
 */
server.tool(
  "spo-get-recent-items",
  "Get recently modified items in a document library",
  {
    siteId: z.string().describe("Site ID from configuration"),
    driveId: z.string().describe("Drive ID"),
    limit: z.number().optional().describe("Maximum results (default: 20, max: 100)"),
    days: z.number().optional().describe("Days back to search (default: 30)"),
  },
  async ({ siteId, driveId, limit, days }) => {
    try {
      const service = getSharePointService();
      const items = await service.getRecentItems(siteId, driveId, limit, days);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(items, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting recent SharePoint items:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get recent items: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-get-folder-structure
 * Get recursive folder tree structure
 */
server.tool(
  "spo-get-folder-structure",
  "Get recursive folder tree structure (useful for understanding site organization)",
  {
    siteId: z.string().describe("Site ID from configuration"),
    driveId: z.string().describe("Drive ID"),
    folderId: z.string().optional().describe("Root folder ID (optional, defaults to drive root)"),
    depth: z.number().optional().describe("Recursion depth (default: 3, max: 10)"),
  },
  async ({ siteId, driveId, folderId, depth }) => {
    try {
      const service = getSharePointService();
      const tree = await service.getFolderStructure(siteId, driveId, folderId, depth);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(tree, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting SharePoint folder structure:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get folder structure: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * ===========================================
 * SHAREPOINT POWERPLATFORM VALIDATION TOOLS (3 total)
 * ===========================================
 * These tools integrate SharePoint with PowerPlatform for document location validation
 */

/**
 * Tool: spo-get-crm-document-locations
 * Get SharePoint document locations from PowerPlatform Dataverse
 */
server.tool(
  "spo-get-crm-document-locations",
  "Get SharePoint document locations configured in PowerPlatform Dataverse (sharepointdocumentlocation entity)",
  {
    entityName: z.string().optional().describe("Filter by entity logical name (e.g., 'account', 'contact')"),
    recordId: z.string().optional().describe("Filter by specific record ID (GUID)"),
  },
  async ({ entityName, recordId }) => {
    try {
      const spoService = getSharePointService();
      const ppService = getPowerPlatformService();

      const locations = await spoService.getCrmDocumentLocations(ppService, entityName, recordId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(locations, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error getting CRM document locations:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to get CRM document locations: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-validate-document-location
 * Validate a PowerPlatform document location against actual SharePoint structure
 */
server.tool(
  "spo-validate-document-location",
  "Validate that a PowerPlatform document location configuration matches the actual SharePoint site structure. Checks site accessibility, folder existence, and file counts. Returns validation status (valid/warning/error) with issues and recommendations.",
  {
    documentLocationId: z.string().describe("GUID of the sharepointdocumentlocation record in PowerPlatform"),
  },
  async ({ documentLocationId }) => {
    try {
      const spoService = getSharePointService();
      const ppService = getPowerPlatformService();

      const result = await spoService.validateDocumentLocation(ppService, documentLocationId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error validating document location:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to validate document location: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: spo-verify-document-migration
 * Verify document migration between two SharePoint folders
 */
server.tool(
  "spo-verify-document-migration",
  "Verify that documents were successfully migrated from source to target SharePoint folder. Compares file counts, sizes, names, and modified dates. Returns migration status (complete/incomplete/failed) with success rate and detailed comparison.",
  {
    sourceSiteId: z.string().describe("Source SharePoint site ID"),
    sourcePath: z.string().describe("Source folder path (e.g., '/Documents/Archive')"),
    targetSiteId: z.string().describe("Target SharePoint site ID"),
    targetPath: z.string().describe("Target folder path (e.g., '/NewLibrary/Archive')"),
  },
  async ({ sourceSiteId, sourcePath, targetSiteId, targetPath }) => {
    try {
      const spoService = getSharePointService();
      const ppService = getPowerPlatformService();

      const result = await spoService.verifyDocumentMigration(
        ppService,
        sourceSiteId,
        sourcePath,
        targetSiteId,
        targetPath
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: any) {
      console.error("Error verifying document migration:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to verify document migration: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

/**
 * ===========================================
 * SHAREPOINT ONLINE PROMPTS (10 total)
 * ===========================================
 * Formatted, context-rich SharePoint reports with PowerPlatform integration validation
 */

/**
 * Prompt: spo-site-overview
 * Comprehensive site overview with drives and recent activity
 */
server.prompt(
  "spo-site-overview",
  {
    siteId: z.string().describe("Site ID from configuration"),
  },
  async ({ siteId }) => {
    try {
      const service = getSharePointService();

      // Get site info
      const site = await service.getSiteInfo(siteId);

      // Get drives (document libraries)
      const drives = await service.listDrives(siteId);

      // Build report
      const sections: string[] = [];

      sections.push(spoFormatters.formatSiteOverviewAsMarkdown(site));
      sections.push('');
      sections.push('## Document Libraries');
      sections.push(spoFormatters.formatDrivesAsMarkdown(drives));

      return {
        description: `SharePoint site overview: ${site.displayName}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Show overview of SharePoint site ${siteId}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: sections.join('\n'),
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating site overview:", error);
      throw error;
    }
  }
);

/**
 * Prompt: spo-library-details
 * Detailed document library report with quota and recent items
 */
server.prompt(
  "spo-library-details",
  {
    siteId: z.string().describe("Site ID"),
    driveId: z.string().describe("Drive (library) ID"),
  },
  async ({ siteId, driveId }) => {
    try {
      const service = getSharePointService();

      // Get drive info
      const drive = await service.getDriveInfo(siteId, driveId);

      // Get recent items
      const recentItems = await service.getRecentItems(siteId, driveId, 10, 30);

      // Build report
      const sections: string[] = [];

      sections.push(spoFormatters.formatDriveDetailsAsMarkdown(drive));
      sections.push('');
      sections.push('## Recent Activity (Last 30 days)');
      sections.push(spoFormatters.formatItemsAsMarkdown(recentItems));

      return {
        description: `Document library details: ${drive.name}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Show details for document library ${driveId} in site ${siteId}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: sections.join('\n'),
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating library details:", error);
      throw error;
    }
  }
);

/**
 * Prompt: spo-document-search
 * Search results with formatted file listing
 */
server.prompt(
  "spo-document-search",
  {
    siteId: z.string().describe("Site ID"),
    driveId: z.string().describe("Drive ID"),
    query: z.string().describe("Search query (filename or keywords)"),
  },
  async ({ siteId, driveId, query }) => {
    try {
      const service = getSharePointService();

      // Search items
      const searchResults = await service.searchItems(siteId, driveId, query);

      // Build report
      const sections: string[] = [];

      sections.push(`# 🔍 Search Results: "${query}"`);
      sections.push('');
      sections.push(`Found ${searchResults.items.length} result(s)`);
      sections.push('');
      sections.push(spoFormatters.formatItemsAsMarkdown(searchResults.items));

      return {
        description: `Search results for "${query}"`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Search for "${query}" in drive ${driveId} of site ${siteId}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: sections.join('\n'),
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating search results:", error);
      throw error;
    }
  }
);

/**
 * Prompt: spo-recent-activity
 * Recent document activity report
 */
server.prompt(
  "spo-recent-activity",
  {
    siteId: z.string().describe("Site ID"),
    driveId: z.string().describe("Drive ID"),
    days: z.string().optional().describe("Number of days to look back (default: 7)"),
  },
  async ({ siteId, driveId, days }) => {
    try {
      const service = getSharePointService();

      const daysBack = days ? parseInt(days) : 7;
      const recentItems = await service.getRecentItems(siteId, driveId, 50, daysBack);

      // Build report
      const sections: string[] = [];

      sections.push(`# 📅 Recent Activity (Last ${daysBack} days)`);
      sections.push('');
      sections.push(`**Document Library:** ${driveId}`);
      sections.push(`**Total Changes:** ${recentItems.length}`);
      sections.push('');
      sections.push(spoFormatters.formatItemsAsMarkdown(recentItems));

      return {
        description: `Recent activity for last ${daysBack} days`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Show recent activity in drive ${driveId} for last ${daysBack} days`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: sections.join('\n'),
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating recent activity report:", error);
      throw error;
    }
  }
);

/**
 * Prompt: spo-validate-crm-integration
 * Validate PowerPlatform document location configuration
 */
server.prompt(
  "spo-validate-crm-integration",
  {
    documentLocationId: z.string().describe("Document location ID from PowerPlatform"),
  },
  async ({ documentLocationId }) => {
    try {
      const spoService = getSharePointService();
      const ppService = getPowerPlatformService();

      // Validate document location
      const result = await spoService.validateDocumentLocation(ppService, documentLocationId);

      // Generate analysis
      const sections: string[] = [];

      sections.push(spoFormatters.formatValidationResultAsMarkdown(result));

      return {
        description: `Validation result for document location ${documentLocationId}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Validate PowerPlatform document location ${documentLocationId}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: sections.join('\n'),
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error validating CRM integration:", error);
      throw error;
    }
  }
);

/**
 * Prompt: spo-document-location-audit
 * Audit all document locations for an entity or record
 */
server.prompt(
  "spo-document-location-audit",
  {
    entityName: z.string().optional().describe("Entity logical name (e.g., 'account')"),
    recordId: z.string().optional().describe("Record ID (GUID)"),
  },
  async ({ entityName, recordId }) => {
    try {
      const spoService = getSharePointService();
      const ppService = getPowerPlatformService();

      // Get document locations
      const locations = await spoService.getCrmDocumentLocations(ppService, entityName, recordId);

      // Analyze
      const analysis = spoFormatters.analyzeCrmDocumentLocations(locations);

      // Build report
      const sections: string[] = [];

      sections.push('# 📋 Document Location Audit');
      sections.push('');

      if (entityName) {
        sections.push(`**Entity:** ${entityName}`);
      }

      if (recordId) {
        sections.push(`**Record ID:** ${recordId}`);
      }

      sections.push('');
      sections.push('## Insights');
      analysis.insights.forEach(insight => {
        sections.push(insight);
      });

      sections.push('');
      sections.push('## Document Locations');
      sections.push(spoFormatters.formatCrmDocumentLocationsAsMarkdown(locations));

      if (analysis.recommendations.length > 0) {
        sections.push('');
        sections.push('## Recommendations');
        analysis.recommendations.forEach(rec => {
          sections.push(`- ${rec}`);
        });
      }

      return {
        description: `Document location audit${entityName ? ` for ${entityName}` : ''}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Audit document locations${entityName ? ` for entity ${entityName}` : ''}${recordId ? ` record ${recordId}` : ''}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: sections.join('\n'),
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating document location audit:", error);
      throw error;
    }
  }
);

/**
 * Prompt: spo-migration-verification-report
 * Comprehensive migration verification report
 */
server.prompt(
  "spo-migration-verification-report",
  {
    sourceSiteId: z.string().describe("Source site ID"),
    sourcePath: z.string().describe("Source folder path"),
    targetSiteId: z.string().describe("Target site ID"),
    targetPath: z.string().describe("Target folder path"),
  },
  async ({ sourceSiteId, sourcePath, targetSiteId, targetPath }) => {
    try {
      const spoService = getSharePointService();
      const ppService = getPowerPlatformService();

      // Verify migration
      const result = await spoService.verifyDocumentMigration(
        ppService,
        sourceSiteId,
        sourcePath,
        targetSiteId,
        targetPath
      );

      // Analyze
      const analysis = spoFormatters.analyzeMigrationVerification(result);

      // Build report
      const sections: string[] = [];

      sections.push(spoFormatters.formatMigrationReportAsMarkdown(result));
      sections.push('');
      sections.push('## Analysis');
      analysis.insights.forEach(insight => {
        sections.push(`- ${insight}`);
      });

      sections.push('');
      sections.push('## Recommendations');
      analysis.recommendations.forEach(rec => {
        sections.push(`- ${rec}`);
      });

      return {
        description: `Migration verification: ${result.status} (${result.successRate}% success)`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Verify document migration from ${sourcePath} to ${targetPath}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: sections.join('\n'),
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error generating migration verification report:", error);
      throw error;
    }
  }
);

/**
 * Prompt: spo-setup-validation-guide
 * Guide for validating SharePoint integration setup
 */
server.prompt(
  "spo-setup-validation-guide",
  {},
  async () => {
    const guide = `# SharePoint Integration Setup Validation Guide

## Prerequisites Checklist

### 1. Azure AD App Registration
- ✅ App registered in Azure Active Directory
- ✅ Client ID and Client Secret generated
- ✅ Tenant ID noted

### 2. API Permissions
Required Microsoft Graph API permissions (Application permissions):
- ✅ Sites.Read.All or Sites.ReadWrite.All
- ✅ Files.Read.All or Files.ReadWrite.All
- ✅ Admin consent granted

### 3. SharePoint Site Access
- ✅ Service principal added to site(s) as Site Collection Admin
- ✅ Site URLs accessible and correct

### 4. Configuration
Environment variables configured:
- ✅ SHAREPOINT_TENANT_ID
- ✅ SHAREPOINT_CLIENT_ID
- ✅ SHAREPOINT_CLIENT_SECRET
- ✅ SHAREPOINT_SITES (JSON array) or SHAREPOINT_SITE_URL

## Testing Steps

### Step 1: Test Connection
\`\`\`
Use tool: spo-test-connection
Parameters: { siteId: "your-site-id" }
Expected: Site information returned with no errors
\`\`\`

### Step 2: List Document Libraries
\`\`\`
Use tool: spo-list-drives
Parameters: { siteId: "your-site-id" }
Expected: List of document libraries with quota info
\`\`\`

### Step 3: List Files
\`\`\`
Use tool: spo-list-items
Parameters: { siteId: "your-site-id", driveId: "library-id" }
Expected: List of files and folders
\`\`\`

### Step 4: Test PowerPlatform Integration (Optional)
\`\`\`
Use tool: spo-get-crm-document-locations
Expected: List of document locations from Dataverse
\`\`\`

## Common Issues

### Issue: "Access denied" error
**Solution:**
1. Verify API permissions are granted
2. Ensure admin consent is granted
3. Check service principal is Site Collection Admin

### Issue: "Site not found"
**Solution:**
1. Verify site URL is correct (use full URL)
2. Check site exists and is accessible
3. Ensure site is in SHAREPOINT_SITES configuration

### Issue: "Authentication failed"
**Solution:**
1. Verify tenant ID, client ID, and client secret
2. Check client secret hasn't expired
3. Ensure app registration is active

## Next Steps

Once setup is validated:
1. Configure additional sites in SHAREPOINT_SITES
2. Set up PowerPlatform integration for document location validation
3. Use validation tools to audit document locations
4. Set up migration verification workflows

For more help, refer to SETUP.md documentation.
`;

    return {
      description: "SharePoint integration setup validation guide",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Show SharePoint integration setup validation guide",
          },
        },
        {
          role: "assistant",
          content: {
            type: "text",
            text: guide,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: spo-troubleshooting-guide
 * Troubleshooting guide for common SharePoint issues
 */
server.prompt(
  "spo-troubleshooting-guide",
  {
    errorType: z.string().optional().describe("Type of error (e.g., 'access-denied', 'site-not-found')"),
  },
  async ({ errorType }) => {
    const guide = `# SharePoint Integration Troubleshooting Guide

## Common Error Scenarios

### 1. Access Denied (403 Forbidden)

**Symptoms:**
- "Access denied" errors when accessing sites or files
- "Insufficient permissions" messages

**Causes:**
- Missing API permissions
- Admin consent not granted
- Service principal not added to site

**Solutions:**
1. Verify Microsoft Graph API permissions:
   - Sites.Read.All (or Sites.ReadWrite.All)
   - Files.Read.All (or Files.ReadWrite.All)
2. Grant admin consent in Azure AD
3. Add service principal as Site Collection Admin:
   - Go to site settings → Site permissions
   - Add app with client ID
   - Grant Full Control or Read permissions

### 2. Site Not Found (404 Not Found)

**Symptoms:**
- "Site not found" errors
- "Resource does not exist" messages

**Causes:**
- Incorrect site URL
- Site not in SHAREPOINT_SITES configuration
- Site deleted or moved

**Solutions:**
1. Verify site URL format: https://tenant.sharepoint.com/sites/sitename
2. Check site exists by visiting in browser
3. Add site to SHAREPOINT_SITES configuration
4. Ensure site is not archived or deleted

### 3. Authentication Failed (401 Unauthorized)

**Symptoms:**
- "Authentication failed" errors
- "Invalid credentials" messages

**Causes:**
- Incorrect tenant ID, client ID, or client secret
- Client secret expired
- App registration disabled

**Solutions:**
1. Verify credentials in environment variables
2. Check client secret expiration in Azure AD
3. Generate new client secret if expired
4. Ensure app registration is active

### 4. Token Acquisition Failed

**Symptoms:**
- "Failed to acquire access token" errors
- MSAL errors

**Causes:**
- Network connectivity issues
- Firewall blocking Azure AD
- Incorrect tenant ID

**Solutions:**
1. Verify network connectivity to login.microsoftonline.com
2. Check firewall rules
3. Verify tenant ID is correct
4. Test authentication manually

### 5. Folder Not Found

**Symptoms:**
- "Folder not accessible" in validation results
- "Item not found" errors

**Causes:**
- Incorrect folder path
- Folder deleted or moved
- Permissions issue

**Solutions:**
1. Verify folder path format: /LibraryName/Folder1/Folder2
2. Check folder exists in SharePoint
3. Ensure service principal has access
4. Use spo-list-items to browse folder structure

### 6. Document Location Validation Fails

**Symptoms:**
- Validation status: "error" or "warning"
- Missing or inaccessible folders

**Causes:**
- CRM absolute URL incorrect
- Site not configured
- Folder path mismatch

**Solutions:**
1. Verify absolute URL in PowerPlatform
2. Add site to SHAREPOINT_SITES configuration
3. Check folder path matches SharePoint structure
4. Use spo-validate-document-location tool

## Diagnostic Tools

### Test Connection
\`\`\`
Use: spo-test-connection
Purpose: Verify site accessibility and permissions
\`\`\`

### List Sites
\`\`\`
Use: spo-list-sites
Purpose: Verify configured sites and status
\`\`\`

### Validate Document Location
\`\`\`
Use: spo-validate-document-location
Purpose: Check PowerPlatform integration
\`\`\`

## Getting Help

If issues persist:
1. Check application logs for detailed error messages
2. Review audit logs in Azure AD
3. Test permissions using Microsoft Graph Explorer
4. Refer to SETUP.md for detailed configuration steps

For API-specific errors, refer to Microsoft Graph API documentation.
`;

    return {
      description: `SharePoint troubleshooting guide${errorType ? ` for ${errorType}` : ''}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Show SharePoint troubleshooting guide${errorType ? ` for ${errorType}` : ''}`,
          },
        },
        {
          role: "assistant",
          content: {
            type: "text",
            text: guide,
          },
        },
      ],
    };
  }
);

/**
 * Prompt: spo-powerplatform-integration-health
 * Health check for PowerPlatform-SharePoint integration
 */
server.prompt(
  "spo-powerplatform-integration-health",
  {
    entityName: z.string().optional().describe("Entity to check (e.g., 'account')"),
  },
  async ({ entityName }) => {
    try {
      const spoService = getSharePointService();
      const ppService = getPowerPlatformService();

      // Get all document locations for entity
      const locations = await spoService.getCrmDocumentLocations(ppService, entityName);

      // Analyze
      const analysis = spoFormatters.analyzeCrmDocumentLocations(locations);

      // Build health report
      const sections: string[] = [];

      sections.push('# 🏥 PowerPlatform-SharePoint Integration Health Check');
      sections.push('');

      if (entityName) {
        sections.push(`**Entity:** ${entityName}`);
        sections.push('');
      }

      sections.push('## Health Summary');
      sections.push('');
      analysis.insights.forEach(insight => {
        sections.push(insight);
      });

      sections.push('');
      sections.push('## Configured Document Locations');
      sections.push(spoFormatters.formatCrmDocumentLocationsAsMarkdown(locations));

      if (analysis.recommendations.length > 0) {
        sections.push('');
        sections.push('## Recommendations');
        analysis.recommendations.forEach(rec => {
          sections.push(`- 💡 ${rec}`);
        });
      }

      sections.push('');
      sections.push('## Next Steps');
      sections.push('');
      sections.push('1. Use `spo-validate-document-location` to validate individual locations');
      sections.push('2. Check for missing or inaccessible folders');
      sections.push('3. Verify service principal has access to all sites');
      sections.push('4. Review empty folders and upload documents');

      return {
        description: `Integration health check${entityName ? ` for ${entityName}` : ''}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Check PowerPlatform-SharePoint integration health${entityName ? ` for ${entityName}` : ''}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: sections.join('\n'),
            },
          },
        ],
      };
    } catch (error: any) {
      console.error("Error checking integration health:", error);
      throw error;
    }
  }
);

/**
 * ===========================================
 * CLEANUP HANDLERS
 * ===========================================
 */

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.error('Shutting down gracefully (SIGINT)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  if (serviceBusService) {
    await serviceBusService.close();
  }
  if (sharePointService) {
    await sharePointService.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down gracefully (SIGTERM)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  if (serviceBusService) {
    await serviceBusService.close();
  }
  if (sharePointService) {
    await sharePointService.close();
  }
  process.exit(0);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Initializing PowerPlatform MCP Server...");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});