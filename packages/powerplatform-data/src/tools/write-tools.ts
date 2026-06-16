/**
 * Write tools for powerplatform-data (6 tools)
 * Require permission flags: POWERPLATFORM_ENABLE_CREATE, _UPDATE, _DELETE, _ACTIONS.
 *
 * Tool inputs are run through the PII pipeline before being recorded by
 * auditEmit. See `redactInput()` below.
 */
import { z } from 'zod';
import { auditEmit, formatSummaryFooter } from '@mcp-consultant-tools/core';
import type { PipelineReport } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  ENTITY_NAME_EXAMPLES,
  RECORD_DATA_EXAMPLES,
  ODATA_BIND_EXAMPLES,
  NAVIGATION_PROPERTY_EXAMPLES,
} from '../tool-examples.js';

function redactInput(
  ctx: ServiceContext,
  entityKey: string,
  input: unknown
): { data: any; report: PipelineReport | null } {
  const pp = ctx.pp.piiPipeline;
  if (!pp || !pp.isEnabled) {
    return { data: input, report: null };
  }
  const result = pp.redactResponse(entityKey, input);
  return { data: result.data, report: result.report };
}

export function registerWriteTools(server: any, ctx: ServiceContext): void {

  server.tool(
    "create-record",
    "Create a new record in Dataverse. Use @odata.bind syntax for lookup fields. Requires POWERPLATFORM_ENABLE_CREATE=true.",
    {
      entityNamePlural: z
        .string()
        .describe(descWithExamples(
          "The plural entity set name (API name) of the entity",
          ENTITY_NAME_EXAMPLES
        )),
      data: z
        .record(z.any())
        .describe(descWithExamples(
          "Record data as JSON object. Field names must match logical names. " +
          "For lookup fields, use '@odata.bind' syntax: {'fieldSchemaName@odata.bind': '/entitysetname(guid)'}. " +
          "For polymorphic lookups, add entity suffix: {'customerid_contact@odata.bind': '/contacts(guid)'}. " +
          "For option sets, use integer values",
          [...RECORD_DATA_EXAMPLES, ...ODATA_BIND_EXAMPLES]
        )),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ entityNamePlural, data }: any) => {
      try {
        ctx.checkCreateEnabled();
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.createRecord(entityNamePlural, data) as any;

        const inputObj = { entityNamePlural, data };
        const redacted = audit
          ? redactInput(ctx, entityNamePlural, inputObj)
          : { data: inputObj, report: null };

        const result = audit
          ? await auditEmit(audit, {
              tool: 'create-record',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: (r: any) => ({
                recordCount: 1,
                outputRedaction: r?.piiReport ?? null,
              }),
            }, operation)
          : await operation();

        const { piiReport, ...visibleResult } = result;
        // Read the entity-specific primary key directly from the response body
        // (e.g. `contactid` from `contacts`). Dataverse suppresses the
        // `OData-EntityId` header when `Prefer: return=representation` is used
        // (the body itself is the representation), so the body is the
        // authoritative source. Singular form derived the same way as
        // `toEntityLogicalName` in DataService.
        const entityLogicalName = entityNamePlural.replace(/s$/, '');
        const recordIdValue = (visibleResult[`${entityLogicalName}id`] ?? 'N/A') as string;
        const footer = piiReport ? `\n\n${formatSummaryFooter(piiReport)}` : '';

        return {
          content: [
            {
              type: "text",
              text: `✅ Record created successfully in ${entityNamePlural}\n\n` +
                `**Record ID:** ${recordIdValue}\n\n` +
                `**Created Record:**\n\`\`\`json\n${JSON.stringify(visibleResult, null, 2)}\n\`\`\`${footer}`,
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
    "Update an existing record in Dataverse using PATCH (merge). Only include fields being changed; omitted fields are left unchanged. Requires POWERPLATFORM_ENABLE_UPDATE=true.",
    {
      entityNamePlural: z
        .string()
        .describe(descWithExamples(
          "The plural entity set name (API name) of the entity",
          ENTITY_NAME_EXAMPLES
        )),
      recordId: z
        .string()
        .describe("The GUID of the record to update"),
      data: z
        .record(z.any())
        .describe(descWithExamples(
          "Partial record data to update (only fields being changed). " +
          "Field names must match logical names. " +
          "For lookup fields, use '@odata.bind' syntax. " +
          "For option sets, use integer values",
          [...RECORD_DATA_EXAMPLES, ...ODATA_BIND_EXAMPLES]
        )),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ entityNamePlural, recordId, data }: any) => {
      try {
        ctx.checkUpdateEnabled();
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.updateRecord(entityNamePlural, recordId, data) as any;

        const inputObj = { entityNamePlural, recordId, data };
        const redacted = audit
          ? redactInput(ctx, entityNamePlural, inputObj)
          : { data: inputObj, report: null };

        const result = audit
          ? await auditEmit(audit, {
              tool: 'update-record',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: (r: any) => ({
                recordCount: 1,
                outputRedaction: r?.piiReport ?? null,
              }),
            }, operation)
          : await operation();

        const { piiReport, ...visibleResult } = result;
        const footer = piiReport ? `\n\n${formatSummaryFooter(piiReport)}` : '';

        return {
          content: [
            {
              type: "text",
              text: `✅ Record updated successfully in ${entityNamePlural}\n\n` +
                `**Record ID:** ${recordId}\n\n` +
                `**Updated Record:**\n\`\`\`json\n${JSON.stringify(visibleResult, null, 2)}\n\`\`\`${footer}`,
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
        .describe(descWithExamples(
          "The plural entity set name (API name) of the entity",
          ENTITY_NAME_EXAMPLES
        )),
      recordId: z
        .string()
        .describe("The GUID of the record to delete"),
      confirm: z
        .boolean()
        .optional()
        .describe("Confirmation flag - must be true to proceed with deletion (safety check)"),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ entityNamePlural, recordId, confirm }: any) => {
      try {
        ctx.checkDeleteEnabled();

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

        const service = ctx.pp;
        const audit = ctx.audit;

        // Synthetic return shape — Dataverse delete is a void HTTP 204; we
        // surface { success, recordId } so payloadOutput is non-undefined at
        // level=full. The synthesised fields don't reflect the API response.
        const operation = async () => {
          await service.deleteRecord(entityNamePlural, recordId);
          return { success: true, recordId };
        };

        if (audit) {
          const inputObj = { entityNamePlural, recordId, confirm };
          const redacted = redactInput(ctx, entityNamePlural, inputObj);
          await auditEmit(audit, {
            tool: 'delete-record',
            params: redacted.data,
            payloadInput: redacted.data,
            inputRedaction: redacted.report,
            resultExtractor: () => ({
              recordCount: 1,
              outputRedaction: null,
            }),
          }, operation);
        } else {
          await operation();
        }

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
          entityNamePlural: z.string().describe(descWithExamples(
            "The plural entity set name of the entity",
            ENTITY_NAME_EXAMPLES
          )),
          recordId: z.string().describe("The GUID of the record to bind the action to"),
        })
        .optional()
        .describe(
          "For bound actions only: specify the entity and record the action is bound to. " +
          "Leave empty for unbound actions. Example: { entityNamePlural: 'opportunities', recordId: '12345678-...' }"
        ),
    },
    // Generic: executes an arbitrary Custom API / Action that may mutate or delete data → treat as destructive.
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ actionName, parameters, boundTo }: any) => {
      try {
        ctx.checkActionsEnabled();
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.executeAction(actionName, parameters, boundTo) as any;

        const inputObj = { actionName, parameters, boundTo };
        const redacted = audit
          ? redactInput(ctx, '_input', inputObj)
          : { data: inputObj, report: null };

        const result = audit
          ? await auditEmit(audit, {
              tool: 'execute-action',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: (r: any) => ({
                recordCount: r?.recordCount ?? undefined,
                outputRedaction: r?.piiReport ?? null,
              }),
            }, operation)
          : await operation();

        const { piiReport, ...visibleResult } = result || {};

        const boundInfo = boundTo
          ? `\n**Bound To:** ${boundTo.entityNamePlural}(${boundTo.recordId})`
          : '\n**Type:** Unbound action';

        const paramsInfo = parameters && Object.keys(parameters).length > 0
          ? `\n**Input Parameters:**\n\`\`\`json\n${JSON.stringify(parameters, null, 2)}\n\`\`\``
          : '';

        const responseInfo = visibleResult && Object.keys(visibleResult).length > 0
          ? `\n**Response:**\n\`\`\`json\n${JSON.stringify(visibleResult, null, 2)}\n\`\`\``
          : '\n**Response:** (no output parameters)';

        const footer = piiReport ? `\n\n${formatSummaryFooter(piiReport)}` : '';

        return {
          content: [
            {
              type: "text",
              text: `✅ Action executed successfully\n\n` +
                `**Action:** ${actionName}` +
                boundInfo +
                paramsInfo +
                responseInfo +
                footer,
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

  server.tool(
    "associate-records",
    "Associate two records via a navigation property (N:N or 1:N relationship). " +
    "Use this for Many-to-Many relationships where intersect entities cannot be created directly. " +
    "Requires POWERPLATFORM_ENABLE_CREATE=true.",
    {
      entityNamePlural: z
        .string()
        .describe(descWithExamples(
          "The plural entity set name of the source entity",
          ENTITY_NAME_EXAMPLES
        )),
      recordId: z
        .string()
        .describe("The GUID of the source record"),
      navigationProperty: z
        .string()
        .describe(descWithExamples(
          "The navigation property name for the relationship. " +
          "Find this in the relationship metadata or via get-entity-relationships tool in the read-only package",
          NAVIGATION_PROPERTY_EXAMPLES
        )),
      targetEntityNamePlural: z
        .string()
        .describe(descWithExamples(
          "The plural entity set name of the target entity",
          ENTITY_NAME_EXAMPLES
        )),
      targetRecordId: z
        .string()
        .describe("The GUID of the target record to associate"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ entityNamePlural, recordId, navigationProperty, targetEntityNamePlural, targetRecordId }: any) => {
      try {
        ctx.checkCreateEnabled();
        const service = ctx.pp;
        const audit = ctx.audit;

        // Synthetic return shape — Dataverse Associate is a void HTTP 204;
        // we surface { success } so payloadOutput is non-undefined at
        // level=full. Does not reflect the API response.
        const operation = async () => {
          await service.associateRecords(entityNamePlural, recordId, navigationProperty, targetEntityNamePlural, targetRecordId);
          return { success: true };
        };

        if (audit) {
          const inputObj = { entityNamePlural, recordId, navigationProperty, targetEntityNamePlural, targetRecordId };
          const redacted = redactInput(ctx, entityNamePlural, inputObj);
          await auditEmit(audit, {
            tool: 'associate-records',
            params: redacted.data,
            payloadInput: redacted.data,
            inputRedaction: redacted.report,
            resultExtractor: () => ({
              recordCount: 1,
              outputRedaction: null,
            }),
          }, operation);
        } else {
          await operation();
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Records associated successfully\n\n` +
                `**Source:** ${entityNamePlural}(${recordId})\n` +
                `**Target:** ${targetEntityNamePlural}(${targetRecordId})\n` +
                `**Relationship:** ${navigationProperty}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error associating records:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to associate records: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "disassociate-records",
    "Remove the association between two records (N:N or 1:N relationship). " +
    "This removes the relationship link but does not delete either record. " +
    "Requires POWERPLATFORM_ENABLE_DELETE=true.",
    {
      entityNamePlural: z
        .string()
        .describe(descWithExamples(
          "The plural entity set name of the source entity",
          ENTITY_NAME_EXAMPLES
        )),
      recordId: z
        .string()
        .describe("The GUID of the source record"),
      navigationProperty: z
        .string()
        .describe(descWithExamples(
          "The navigation property name for the relationship",
          NAVIGATION_PROPERTY_EXAMPLES
        )),
      targetRecordId: z
        .string()
        .describe("The GUID of the target record to disassociate"),
    },
    // Removes a relationship link (does not delete records) but is not reversible by re-running → destructive.
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ entityNamePlural, recordId, navigationProperty, targetRecordId }: any) => {
      try {
        ctx.checkDeleteEnabled();
        const service = ctx.pp;
        const audit = ctx.audit;

        // Synthetic return shape — Dataverse Disassociate is a void HTTP 204;
        // we surface { success } so payloadOutput is non-undefined at
        // level=full. Does not reflect the API response.
        const operation = async () => {
          await service.disassociateRecords(entityNamePlural, recordId, navigationProperty, targetRecordId);
          return { success: true };
        };

        if (audit) {
          const inputObj = { entityNamePlural, recordId, navigationProperty, targetRecordId };
          const redacted = redactInput(ctx, entityNamePlural, inputObj);
          await auditEmit(audit, {
            tool: 'disassociate-records',
            params: redacted.data,
            payloadInput: redacted.data,
            inputRedaction: redacted.report,
            resultExtractor: () => ({
              recordCount: 1,
              outputRedaction: null,
            }),
          }, operation);
        } else {
          await operation();
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Records disassociated successfully\n\n` +
                `**Source:** ${entityNamePlural}(${recordId})\n` +
                `**Target Record:** ${targetRecordId}\n` +
                `**Relationship:** ${navigationProperty}\n\n` +
                `Note: Neither record was deleted - only the relationship link was removed.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error disassociating records:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to disassociate records: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
