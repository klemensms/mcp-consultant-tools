#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader } from '@mcp-consultant-tools/core';
import { PowerPlatformService, PowerPlatformConfig } from './PowerPlatformService.js';
import { ENTITY_OVERVIEW, ATTRIBUTE_DETAILS, QUERY_TEMPLATE, RELATIONSHIP_MAP } from './utils/prompt-templates.js';
import { formatBestPracticesReport } from './utils/best-practices-formatters.js';

const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

/**
 * Register PowerPlatform read-only tools with an MCP server
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function registerPowerPlatformTools(server: any, service?: PowerPlatformService) {
  let ppService: PowerPlatformService | null = service || null;

  function getPowerPlatformService(): PowerPlatformService {
    if (!ppService) {
      const requiredVars = [
        'POWERPLATFORM_URL',
        'POWERPLATFORM_CLIENT_ID',
        'POWERPLATFORM_CLIENT_SECRET',
        'POWERPLATFORM_TENANT_ID'
      ];

      const missing = requiredVars.filter(v => !process.env[v]);
      if (missing.length > 0) {
        throw new Error(`Missing required PowerPlatform configuration: ${missing.join(', ')}`);
      }

      const config: PowerPlatformConfig = {
        organizationUrl: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET!,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      ppService = new PowerPlatformService(config);
    }
    return ppService;
  }

  // Read-only tool registrations (38 tools)
server.tool(
  "get-entity-metadata",
  "Get metadata about a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }: any) => {
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

server.tool(
  "get-entity-attributes",
  "Get attributes/fields of a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }: any) => {
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

server.tool(
  "get-entity-attribute",
  "Get a specific attribute/field of a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().describe("The logical name of the attribute")
  },
  async ({ entityName, attributeName }: any) => {
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

server.tool(
  "get-entity-relationships",
  "Get relationships (one-to-many and many-to-many) for a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }: any) => {
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

server.tool(
  "get-global-option-set",
  "Get a global option set definition by name",
  {
    optionSetName: z.string().describe("The name of the global option set"),
  },
  async ({ optionSetName }: any) => {
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

server.tool(
  "get-record",
  "Get a specific record by entity name (plural) and ID",
  {
    entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
    recordId: z.string().describe("The GUID of the record"),
  },
  async ({ entityNamePlural, recordId }: any) => {
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

server.tool(
  "query-records",
  "Query records using an OData filter expression",
  {
    entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
    filter: z.string().describe("OData filter expression (e.g., \"name eq 'test'\" or \"createdon gt 2023-01-01\")"),
    maxRecords: z.number().optional().describe("Maximum number of records to retrieve (default: 50)"),
  },
  async ({ entityNamePlural, filter, maxRecords }: any) => {
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

server.tool(
  "get-plugin-assemblies",
  "Get a list of all plugin assemblies in the environment",
  {
    includeManaged: z.boolean().optional().describe("Include managed assemblies (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of assemblies to return (default: 100)"),
  },
  async ({ includeManaged, maxRecords }: any) => {
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

server.tool(
  "get-plugin-assembly-complete",
  "Get comprehensive information about a plugin assembly including all types, steps, images, and validation",
  {
    assemblyName: z.string().describe("The name of the plugin assembly"),
    includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
  },
  async ({ assemblyName, includeDisabled }: any) => {
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

server.tool(
  "get-entity-plugin-pipeline",
  "Get all plugins that execute on a specific entity, organized by message and execution order",
  {
    entityName: z.string().describe("The logical name of the entity"),
    messageFilter: z.string().optional().describe("Filter by message name (e.g., 'Create', 'Update', 'Delete')"),
    includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
  },
  async ({ entityName, messageFilter, includeDisabled }: any) => {
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
  async ({ entityName, messageName, correlationId, pluginStepId, exceptionOnly, hoursBack, maxRecords }: any) => {
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

server.tool(
  "get-flows",
  "Get a list of all Power Automate cloud flows in the environment",
  {
    activeOnly: z.boolean().optional().describe("Only return activated flows (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of flows to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }: any) => {
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

server.tool(
  "get-flow-definition",
  "Get the complete definition of a specific Power Automate flow including its logic",
  {
    flowId: z.string().describe("The GUID of the flow (workflowid)"),
  },
  async ({ flowId }: any) => {
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

server.tool(
  "get-flow-runs",
  "Get the run history for a specific Power Automate flow with success/failure status",
  {
    flowId: z.string().describe("The GUID of the flow (workflowid)"),
    maxRecords: z.number().optional().describe("Maximum number of runs to return (default: 100)"),
  },
  async ({ flowId, maxRecords }: any) => {
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

server.tool(
  "get-workflows",
  "Get a list of all classic Dynamics workflows in the environment",
  {
    activeOnly: z.boolean().optional().describe("Only return activated workflows (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of workflows to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }: any) => {
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

server.tool(
  "get-workflow-definition",
  "Get the complete definition of a specific classic Dynamics workflow including its XAML",
  {
    workflowId: z.string().describe("The GUID of the workflow (workflowid)"),
  },
  async ({ workflowId }: any) => {
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

server.tool(
  "get-business-rules",
  "Get a list of all business rules in the environment (read-only for troubleshooting)",
  {
    activeOnly: z.boolean().optional().describe("Only return activated business rules (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of business rules to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }: any) => {
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

server.tool(
  "get-business-rule",
  "Get the complete definition of a specific business rule including its XAML (read-only for troubleshooting)",
  {
    workflowId: z.string().describe("The GUID of the business rule (workflowid)"),
  },
  async ({ workflowId }: any) => {
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

server.tool(
  "get-apps",
  "Get all model-driven apps in the PowerPlatform environment",
  {
    activeOnly: z.boolean().optional().describe("Only return active apps (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of apps to return (default: 100)"),
    includeUnpublished: z.boolean().optional().describe("Include unpublished/draft apps (default: true)"),
    solutionUniqueName: z.string().optional().describe("Filter apps by solution unique name (e.g., 'MCPTestCore')"),
  },
  async ({ activeOnly, maxRecords, includeUnpublished, solutionUniqueName }: any) => {
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

server.tool(
  "get-app",
  "Get detailed information about a specific model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }: any) => {
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

server.tool(
  "get-app-components",
  "Get all components (entities, forms, views, sitemaps) in a model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }: any) => {
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

server.tool(
  "get-app-sitemap",
  "Get the sitemap (navigation) configuration for a model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }: any) => {
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

server.tool(
  "get-relationship-details",
  "Get detailed metadata about a relationship",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)")
  },
  async ({ metadataId }: any) => {
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

server.tool(
  "get-webresource-dependencies",
  "Get all dependencies for a web resource",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }: any) => {
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

server.tool(
  "validate-solution-integrity",
  "Validate a solution's integrity and check for missing dependencies",
  {
    solutionUniqueName: z.string().describe("Solution unique name")
  },
  async ({ solutionUniqueName }: any) => {
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

server.tool(
  "get-forms",
  "Get all forms for an entity",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }: any) => {
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

server.tool(
  "get-views",
  "Get all views for an entity",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }: any) => {
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

server.tool(
  "get-view-fetchxml",
  "Get the FetchXML query from a view",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }: any) => {
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

server.tool(
  "get-web-resource",
  "Get a web resource by ID",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }: any) => {
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

server.tool(
  "get-web-resources",
  "Get web resources by name pattern (optional)",
  {
    nameFilter: z.string().optional().describe("Name filter (contains)")
  },
  async ({ nameFilter }: any) => {
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

server.tool(
  "check-dependencies",
  "Check dependencies before deleting a component",
  {
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ componentId, componentType }: any) => {
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

server.tool(
  "check-entity-dependencies",
  "Check dependencies for a specific entity before deletion",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }: any) => {
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

server.tool(
  "get-entity-customization-info",
  "Get entity customization information (customizable, managed, custom)",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }: any) => {
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

server.tool(
  "validate-schema-name",
  "Validate a schema name against PowerPlatform naming rules",
  {
    schemaName: z.string().describe("Schema name to validate"),
    prefix: z.string().describe("Required customization prefix")
  },
  async ({ schemaName, prefix }: any) => {
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

server.tool(
  "check-delete-eligibility",
  "Check if a component can be safely deleted",
  {
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ componentId, componentType }: any) => {
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

server.tool(
  "validate-dataverse-best-practices",
  "Validate Dataverse entities against internal best practices for column naming, prefixes, configuration, and entity icons. Checks schema name casing, lookup naming conventions, option set scope (all must be global), required columns, publisher prefix compliance, and entity icon assignment. Supports solution-based validation or explicit entity list with configurable time range filtering.",
  {
    solutionUniqueName: z.string().optional().describe("Solution unique name to validate (e.g., 'RTPICore', 'MCPTestCore'). Mutually exclusive with entityLogicalNames."),
    entityLogicalNames: z.array(z.string()).optional().describe("Explicit list of entity logical names to validate (e.g., ['sic_strikeaction', 'sic_application']). Mutually exclusive with solutionUniqueName."),
    publisherPrefix: z.string().describe("Publisher prefix to validate against (e.g., 'sic_'). Required."),
    recentDays: z.number().optional().describe("Only validate columns created in the last N days. Set to 0 to validate all columns regardless of age. Default: 30."),
    includeRefDataTables: z.boolean().optional().describe("Include RefData tables (schema starts with prefix + 'ref_') in validation. Default: true."),
    rules: z.array(z.string()).optional().describe("Specific rules to validate: 'prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'. Default: all rules."),
    maxEntities: z.number().optional().describe("Maximum number of entities to validate (safety limit). Default: 0 (unlimited).")
  },
  async ({ solutionUniqueName, entityLogicalNames, publisherPrefix, recentDays, includeRefDataTables, rules, maxEntities }: any) => {
    try {
      // Validate input
      if (!solutionUniqueName && !entityLogicalNames) {
        return {
          content: [{ type: "text", text: "Error: Either solutionUniqueName or entityLogicalNames must be provided" }],
          isError: true
        };
      }

      if (solutionUniqueName && entityLogicalNames) {
        return {
          content: [{ type: "text", text: "Error: solutionUniqueName and entityLogicalNames are mutually exclusive" }],
          isError: true
        };
      }

      const service = getPowerPlatformService();
      const result = await service.validateBestPractices(
        solutionUniqueName,
        entityLogicalNames,
        publisherPrefix,
        recentDays ?? 30,
        includeRefDataTables ?? true,
        rules ?? ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'],
        maxEntities ?? 0
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (error: any) {
      console.error("Error validating best practices:", error);
      return {
        content: [{ type: "text", text: `Failed to validate best practices: ${error.message}` }],
        isError: true
      };
    }
  }
);

  // Prompt registrations (10 prompts)
server.prompt(
  "entity-overview", 
  "Get an overview of a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity")
  },
  async (args: any) => {
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
      
      let promptContent = ENTITY_OVERVIEW(entityName);
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

server.prompt(
  "attribute-details",
  "Get detailed information about a specific entity attribute/field",
  {
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().describe("The logical name of the attribute"),
  },
  async (args: any) => {
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
        
      let promptContent = ATTRIBUTE_DETAILS(entityName, attributeName);
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

server.prompt(
  "query-template",
  "Get a template for querying a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async (args: any) => {
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
        
      let promptContent = QUERY_TEMPLATE(entityNamePlural);
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

server.prompt(
  "relationship-map",
  "Get a list of relationships for a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async (args: any) => {
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
      
      let promptContent = RELATIONSHIP_MAP(entityName);
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

server.prompt(
  "plugin-deployment-report",
  "Generate a comprehensive deployment report for a plugin assembly",
  {
    assemblyName: z.string().describe("The name of the plugin assembly"),
  },
  async (args: any) => {
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

server.prompt(
  "entity-plugin-pipeline-report",
  "Generate a visual execution pipeline showing all plugins for an entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
    messageFilter: z.string().optional().describe("Optional filter by message name"),
  },
  async (args: any) => {
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

server.prompt(
  "flows-report",
  "Generate a comprehensive report of all Power Automate flows in the environment",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated flows (default: false)"),
  },
  async (args: any) => {
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

server.prompt(
  "workflows-report",
  "Generate a comprehensive report of all classic Dynamics workflows in the environment",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated workflows (default: false)"),
  },
  async (args: any) => {
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

server.prompt(
  "business-rules-report",
  "Generate a comprehensive report of all business rules in the environment (read-only for troubleshooting)",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated business rules (default: false)"),
  },
  async (args: any) => {
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

server.prompt(
  "app-overview",
  "Generate a comprehensive overview report for a model-driven app including components and configuration",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async (args: any) => {
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

server.prompt(
  "dataverse-best-practices-report",
  "Generate formatted markdown report from Dataverse best practice validation results. Groups violations by severity, provides actionable recommendations, and highlights compliant entities.",
  {
    validationResult: z.string().describe("JSON result from validate-dataverse-best-practices tool")
  },
  async (args: any) => {
    try {
      // Parse the validation result JSON
      const result = JSON.parse(args.validationResult);

      // Format as markdown report
      const report = formatBestPracticesReport(result);

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
      console.error("Error generating best practices report:", error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error generating report: ${error.message}\n\nPlease ensure the validationResult is valid JSON from the validate-dataverse-best-practices tool.`
            }
          }
        ]
      };
    }
  }
);

  console.error(`✅ PowerPlatform read-only tools registered (${39} tools, ${11} prompts)`);
}

// CLI entry point (standalone execution)
// Uses realpathSync to resolve symlinks created by npx
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: '@mcp-consultant-tools/powerplatform',
    version: '1.0.0',
    capabilities: { tools: {}, prompts: {} }
  });

  registerPowerPlatformTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start PowerPlatform MCP server:', error);
    process.exit(1);
  });

  console.error('PowerPlatform MCP server running (read-only)');
}
