#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader } from '@mcp-consultant-tools/core';
import { PowerPlatformService, PowerPlatformConfig } from './PowerPlatformService.js';

/**
 * Register powerplatform-data tools with an MCP server
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function registerPowerplatformDataTools(server: any, service?: PowerPlatformService) {

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

// Permission check functions
function checkCreateEnabled() {
  if (process.env.POWERPLATFORM_ENABLE_CREATE !== 'true') {
    throw new Error('Create operations are disabled. Set POWERPLATFORM_ENABLE_CREATE=true to enable.');
  }
}

function checkUpdateEnabled() {
  if (process.env.POWERPLATFORM_ENABLE_UPDATE !== 'true') {
    throw new Error('Update operations are disabled. Set POWERPLATFORM_ENABLE_UPDATE=true to enable.');
  }
}

function checkDeleteEnabled() {
  if (process.env.POWERPLATFORM_ENABLE_DELETE !== 'true') {
    throw new Error('Delete operations are disabled. Set POWERPLATFORM_ENABLE_DELETE=true to enable.');
  }
}

function checkActionsEnabled() {
  if (process.env.POWERPLATFORM_ENABLE_ACTIONS !== 'true') {
    throw new Error('Action execution is disabled. Set POWERPLATFORM_ENABLE_ACTIONS=true to enable.');
  }
}

  // Tool registrations

// Read-only query tools (no permission flags required)
server.tool(
  "query-records",
  "Query Dataverse records using an OData filter expression. Use the 'select' parameter to limit returned columns and reduce response size. No permission flag required (read-only).",
  {
    entityNamePlural: z
      .string()
      .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
    filter: z
      .string()
      .describe("OData filter expression (e.g., \"name eq 'Acme Corp'\", \"createdon gt 2024-01-01\", \"statecode eq 0\")"),
    select: z
      .array(z.string())
      .optional()
      .describe("List of column names to return (e.g., ['name', 'accountid', 'statuscode']). Omit to return all columns (not recommended for large entities)."),
    maxRecords: z
      .number()
      .optional()
      .describe("Maximum number of records to retrieve (default: 50, max: 5000)"),
  },
  async ({ entityNamePlural, filter, select, maxRecords }: any) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.queryRecords(entityNamePlural, filter, maxRecords || 50, select);

      const recordsStr = JSON.stringify(result, null, 2);

      let message = `📋 Retrieved ${result.returnedCount} records from '${entityNamePlural}' with filter '${filter}'`;
      if (result.hasMore) {
        message += `\n⚠️ More records available - increase maxRecords (currently ${result.requestedMax}) to retrieve more`;
      }
      if (select && select.length > 0) {
        message += `\nColumns: ${select.join(', ')}`;
      }

      return {
        content: [
          {
            type: "text",
            text: `${message}:\n\n\`\`\`json\n${recordsStr}\n\`\`\``,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error querying records:", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to query records: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get-record",
  "Get a specific Dataverse record by entity name and ID. Use this to retrieve a record before updating/deleting or to validate changes after operations. No permission flag required (read-only).",
  {
    entityNamePlural: z
      .string()
      .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
    recordId: z
      .string()
      .describe("The GUID of the record to retrieve"),
  },
  async ({ entityNamePlural, recordId }: any) => {
    try {
      const service = getPowerPlatformService();
      const record = await service.getRecord(entityNamePlural, recordId);

      const recordStr = JSON.stringify(record, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `📋 Record from '${entityNamePlural}' with ID '${recordId}':\n\n\`\`\`json\n${recordStr}\n\`\`\``,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting record:", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get record: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Data modification tools (require permission flags)
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
  async ({ entityNamePlural, data }: any) => {
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
  async ({ entityNamePlural, recordId, data }: any) => {
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
  async ({ entityNamePlural, recordId, confirm }: any) => {
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

server.tool(
  "execute-action",
  "Execute a Custom API or Action in Dataverse. Supports both unbound actions (not tied to any entity) and bound actions (tied to a specific record). Requires POWERPLATFORM_ENABLE_ACTIONS=true.",
  {
    actionName: z
      .string()
      .describe(
        "The unique name of the Custom API or Action to execute (e.g., 'new_MyCustomAction', 'WhoAmI', 'WinOpportunity'). " +
        "For bound actions, do NOT include the 'Microsoft.Dynamics.CRM.' prefix - it will be added automatically."
      ),
    parameters: z
      .record(z.any())
      .optional()
      .describe(
        "Input parameters for the action as JSON object. Parameter names and types must match the action definition. " +
        "Example: { 'Amount': 100, 'Description': 'Test' }. Leave empty for actions with no input parameters."
      ),
    boundTo: z
      .object({
        entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'opportunities', 'accounts')"),
        recordId: z.string().describe("The GUID of the record to bind the action to"),
      })
      .optional()
      .describe(
        "For bound actions only: specify the entity and record the action is bound to. " +
        "Leave empty for unbound actions. Example: { entityNamePlural: 'opportunities', recordId: '12345678-...' }"
      ),
  },
  async ({ actionName, parameters, boundTo }: any) => {
    try {
      checkActionsEnabled();
      const service = getPowerPlatformService();
      const result = await service.executeAction(actionName, parameters, boundTo);

      const boundInfo = boundTo
        ? `\n**Bound To:** ${boundTo.entityNamePlural}(${boundTo.recordId})`
        : '\n**Type:** Unbound action';

      const paramsInfo = parameters && Object.keys(parameters).length > 0
        ? `\n**Input Parameters:**\n\`\`\`json\n${JSON.stringify(parameters, null, 2)}\n\`\`\``
        : '';

      const responseInfo = result && Object.keys(result).length > 0
        ? `\n**Response:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
        : '\n**Response:** (no output parameters)';

      return {
        content: [
          {
            type: "text",
            text: `✅ Action executed successfully\n\n` +
              `**Action:** ${actionName}` +
              boundInfo +
              paramsInfo +
              responseInfo,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error executing action:", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to execute action: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

  console.error(`✅ powerplatform-data tools registered (${6} tools)`);
}

// CLI entry point (standalone execution)
// Uses realpathSync to resolve symlinks created by npx
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: '@mcp-consultant-tools/powerplatform-data',
    version: '1.0.0',
    capabilities: { tools: {}, prompts: {} }
  });

  registerPowerplatformDataTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start powerplatform-data MCP server:', error);
    process.exit(1);
  });

  console.error('powerplatform-data MCP server running');
}
