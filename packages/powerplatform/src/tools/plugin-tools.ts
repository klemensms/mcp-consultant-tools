/**
 * Plugin Tools - 4 tools for plugin inspection
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, MESSAGE_FILTER_EXAMPLES, HOURS_BACK_EXAMPLES } from '../tool-examples.js';

export function registerPluginTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-plugin-assemblies",
    "Get a list of all plugin assemblies in the environment",
    {
      includeManaged: z.boolean().optional().describe("Include managed assemblies (default: false)"),
      maxRecords: z.number().optional().describe("Maximum number of assemblies to return (default: 100)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ includeManaged, maxRecords }: any) => {
      try {
        const service = ctx.pp;
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
    "get-plugin-asm-full",
    "Get comprehensive information about a plugin assembly including all types, steps, images, and validation",
    {
      assemblyName: z.string().describe("The name of the plugin assembly"),
      includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ assemblyName, includeDisabled }: any) => {
      try {
        const service = ctx.pp;
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
    "get-entity-plugins",
    "Get all plugins that execute on a specific entity, organized by message and execution order",
    {
      entityName: z.string().describe(
        descWithExamples("The logical name of the entity", ENTITY_NAME_EXAMPLES)
      ),
      messageFilter: z.string().optional().describe(
        descWithExamples("Filter by SDK message name", MESSAGE_FILTER_EXAMPLES)
      ),
      includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityName, messageFilter, includeDisabled }: any) => {
      try {
        const service = ctx.pp;
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
    "Query plugin trace logs with filtering and exception parsing. Returns log entries with timestamps, execution duration, message block, and parsed exception details for failed executions.",
    {
      entityName: z.string().optional().describe(
        descWithExamples("Filter by entity logical name", ENTITY_NAME_EXAMPLES)
      ),
      messageName: z.string().optional().describe(
        descWithExamples("Filter by SDK message name", MESSAGE_FILTER_EXAMPLES)
      ),
      correlationId: z.string().optional().describe("Filter by correlation ID (GUID from a specific request)"),
      pluginStepId: z.string().optional().describe("Filter by specific step ID (GUID)"),
      exceptionOnly: z.boolean().optional().describe("Only return logs with exceptions (default: false)"),
      hoursBack: z.number().optional().describe(
        descWithExamples("How many hours back to search (default: 24)", HOURS_BACK_EXAMPLES)
      ),
      maxRecords: z.number().optional().describe("Maximum number of logs to return (default: 50)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityName, messageName, correlationId, pluginStepId, exceptionOnly, hoursBack, maxRecords }: any) => {
      try {
        const service = ctx.pp;
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
}
