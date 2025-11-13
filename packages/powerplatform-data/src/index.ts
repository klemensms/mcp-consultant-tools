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

  // Tool registrations
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

  console.error(`✅ powerplatform-data tools registered (${3} tools)`);
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
