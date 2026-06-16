/**
 * Read-only tools for powerplatform-data (7 tools)
 * No permission flags required - always enabled.
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
  ODATA_FILTER_EXAMPLES,
  SELECT_FIELD_EXAMPLES,
  ENTITY_NAME_EXAMPLES,
  ENTITY_NAME_SINGULAR_EXAMPLES,
  COUNT_ENTITY_BATCH_EXAMPLES,
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

export function registerReadTools(server: any, ctx: ServiceContext): void {

  server.tool(
    "query-records",
    "Query Dataverse records with OData filter syntax. Returns JSON array of matching records. Use $select to limit fields and reduce response size. Default limit: 50 records.",
    {
      entityNamePlural: z
        .string()
        .describe(descWithExamples(
          "The plural entity set name (API name) of the entity to query",
          ENTITY_NAME_EXAMPLES
        )),
      filter: z
        .string()
        .describe(descWithExamples(
          "OData $filter expression to match records",
          ODATA_FILTER_EXAMPLES
        )),
      select: z
        .array(z.string())
        .optional()
        .describe(descWithExamples(
          "List of column logical names to return. Omit to return all columns (not recommended for large entities)",
          SELECT_FIELD_EXAMPLES
        )),
      maxRecords: z
        .number()
        .optional()
        .describe("Maximum number of records to retrieve (default: 50, max: 5000)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityNamePlural, filter, select, maxRecords }: any) => {
      try {
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.queryRecords(entityNamePlural, filter, maxRecords || 50, select);

        const inputObj = { entityNamePlural, filter, select, maxRecords };
        const redacted = audit
          ? redactInput(ctx, entityNamePlural, inputObj)
          : { data: inputObj, report: null };

        const result = audit
          ? await auditEmit(audit, {
              tool: 'query-records',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: (r: any) => ({
                recordCount: r?.returnedCount,
                outputRedaction: r?.piiReport,
              }),
            }, operation)
          : await operation();

        const { piiReport, ...visibleResult } = result;
        const recordsStr = JSON.stringify(visibleResult, null, 2);

        let message = `📋 Retrieved ${result.returnedCount} records from '${entityNamePlural}' with filter '${filter}'`;
        if (result.hasMore) {
          message += `\n⚠️ More records available - increase maxRecords (currently ${result.requestedMax}) to retrieve more`;
        }
        if (select && select.length > 0) {
          message += `\nColumns: ${select.join(', ')}`;
        }

        const footer = piiReport ? `\n\n${formatSummaryFooter(piiReport)}` : '';

        return {
          content: [
            {
              type: "text",
              text: `${message}:\n\n\`\`\`json\n${recordsStr}\n\`\`\`${footer}`,
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
    "count-records",
    "Count Dataverse records matching an optional OData filter. Returns a single integer count instead of record data. " +
    "Much faster and lighter than query-records when you only need the count. " +
    "Supports batch mode: pass an array of entities to count multiple tables in one call (executed in parallel chunks of 10).",
    {
      entityNamePlural: z
        .string()
        .optional()
        .describe(descWithExamples(
          "The plural entity set name to count. Required for single-entity count. Omit when using 'entities' for batch mode",
          ENTITY_NAME_EXAMPLES
        )),
      filter: z
        .string()
        .optional()
        .describe(descWithExamples(
          "OData $filter expression to count only matching records. Optional — omit to count all records",
          ODATA_FILTER_EXAMPLES
        )),
      entities: z
        .array(
          z.object({
            entityNamePlural: z.string().describe("Plural entity set name"),
            filter: z.string().optional().describe("Optional OData $filter for this entity"),
          })
        )
        .optional()
        .describe(descWithExamples(
          "Batch mode: array of entities to count in parallel. When provided, entityNamePlural and filter params are ignored",
          COUNT_ENTITY_BATCH_EXAMPLES
        )),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityNamePlural, filter, entities }: any) => {
      try {
        // Validate input before accessing service (which triggers config validation)
        if ((!entities || entities.length === 0) && !entityNamePlural) {
          return {
            content: [{
              type: "text",
              text: "❌ Either 'entityNamePlural' (single mode) or 'entities' (batch mode) must be provided.",
            }],
            isError: true,
          };
        }

        const service = ctx.pp;
        const audit = ctx.audit;

        // Batch mode
        if (entities && entities.length > 0) {
          const batchOperation = async () => service.countRecordsBatch(entities);
          const batchInput = { entities };
          const batchRedacted = audit
            ? redactInput(ctx, '_input', batchInput)
            : { data: batchInput, report: null };
          const results = audit
            ? await auditEmit(audit, {
                tool: 'count-records',
                params: batchRedacted.data,
                payloadInput: batchRedacted.data,
                inputRedaction: batchRedacted.report,
                resultExtractor: (r: any) => ({
                  recordCount: Array.isArray(r)
                    ? r.filter((x: any) => !x.error).reduce((sum: number, x: any) => sum + (x.count ?? 0), 0)
                    : undefined,
                  outputRedaction: null,
                }),
              }, batchOperation)
            : await batchOperation();

          const successful = results.filter(r => !r.error);
          const failed = results.filter(r => r.error);
          const totalCount = successful.reduce((sum, r) => sum + r.count, 0);

          let message = `📊 Batch count: ${successful.length}/${results.length} entities counted successfully (total: ${totalCount.toLocaleString()} records)`;
          if (failed.length > 0) {
            message += `\n⚠️ ${failed.length} entities failed`;
          }

          const resultStr = JSON.stringify(results, null, 2);
          return {
            content: [{
              type: "text",
              text: `${message}\n\n\`\`\`json\n${resultStr}\n\`\`\``,
            }],
          };
        }

        // Single entity mode
        const singleOperation = async () => service.countRecords(entityNamePlural, filter);
        const singleInput = { entityNamePlural, filter };
        const singleRedacted = audit
          ? redactInput(ctx, entityNamePlural ?? '_input', singleInput)
          : { data: singleInput, report: null };
        const count = audit
          ? await auditEmit(audit, {
              tool: 'count-records',
              params: singleRedacted.data,
              payloadInput: singleRedacted.data,
              inputRedaction: singleRedacted.report,
              resultExtractor: (r: any) => ({
                recordCount: typeof r === 'number' ? r : undefined,
                outputRedaction: null,
              }),
            }, singleOperation)
          : await singleOperation();

        let message = `📊 Count of '${entityNamePlural}'`;
        if (filter) {
          message += ` where ${filter}`;
        }
        message += `: **${count.toLocaleString()}** records`;

        return {
          content: [{
            type: "text",
            text: message,
          }],
        };
      } catch (error: any) {
        console.error("Error counting records:", error);
        return {
          content: [{
            type: "text",
            text: `❌ Failed to count records: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-record",
    "Get a single Dataverse record by GUID. Returns all columns by default. Use select parameter to limit returned fields.",
    {
      entityNamePlural: z
        .string()
        .describe(descWithExamples(
          "The plural entity set name (API name) of the entity",
          ENTITY_NAME_EXAMPLES
        )),
      recordId: z
        .string()
        .describe("The GUID of the record to retrieve"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityNamePlural, recordId }: any) => {
      try {
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.getRecord(entityNamePlural, recordId);

        const inputObj = { entityNamePlural, recordId };
        const redacted = audit
          ? redactInput(ctx, entityNamePlural, inputObj)
          : { data: inputObj, report: null };

        const record = audit
          ? await auditEmit(audit, {
              tool: 'get-record',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: (r: any) => ({
                recordCount: 1,
                outputRedaction: r?.piiReport,
              }),
            }, operation)
          : await operation();

        const { piiReport, ...visibleRecord } = record as any;
        const recordStr = JSON.stringify(visibleRecord, null, 2);
        const footer = piiReport ? `\n\n${formatSummaryFooter(piiReport)}` : '';

        return {
          content: [
            {
              type: "text",
              text: `📋 Record from '${entityNamePlural}' with ID '${recordId}':\n\n\`\`\`json\n${recordStr}\n\`\`\`${footer}`,
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

  server.tool(
    "get-entity-metadata",
    "Get metadata about a Dataverse entity including EntitySetName (plural name for API), PrimaryIdAttribute, PrimaryNameAttribute, and other key properties. Essential for discovering the correct EntitySetName to use in CRUD operations. No permission flag required (read-only).",
    {
      entityLogicalName: z
        .string()
        .describe(descWithExamples(
          "The singular logical name of the entity",
          ENTITY_NAME_SINGULAR_EXAMPLES
        )),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityLogicalName }: any) => {
      try {
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.getEntityMetadata(entityLogicalName);

        const inputObj = { entityLogicalName };
        const redacted = audit
          ? redactInput(ctx, entityLogicalName, inputObj)
          : { data: inputObj, report: null };

        const metadata = (audit
          ? await auditEmit(audit, {
              tool: 'get-entity-metadata',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: () => ({
                recordCount: undefined,
                outputRedaction: null,
              }),
            }, operation)
          : await operation()) as any;

        // Extract the most useful properties for CRUD operations
        const summary = {
          LogicalName: metadata.LogicalName,
          EntitySetName: metadata.EntitySetName,
          PrimaryIdAttribute: metadata.PrimaryIdAttribute,
          PrimaryNameAttribute: metadata.PrimaryNameAttribute,
          DisplayName: metadata.DisplayName?.UserLocalizedLabel?.Label,
          DisplayCollectionName: metadata.DisplayCollectionName?.UserLocalizedLabel?.Label,
          SchemaName: metadata.SchemaName,
          LogicalCollectionName: metadata.LogicalCollectionName,
          IsCustomEntity: metadata.IsCustomEntity,
          MetadataId: metadata.MetadataId
        };

        return {
          content: [
            {
              type: "text",
              text: `📋 Entity Metadata for '${entityLogicalName}':\n\n` +
                `**EntitySetName (for API):** \`${summary.EntitySetName}\`\n` +
                `**Primary ID Attribute:** \`${summary.PrimaryIdAttribute}\`\n` +
                `**Primary Name Attribute:** \`${summary.PrimaryNameAttribute}\`\n\n` +
                `**Full Details:**\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\n` +
                `**Usage:** Use \`${summary.EntitySetName}\` as the entityNamePlural parameter for query-records, create-record, update-record, delete-record tools.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity metadata:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get entity metadata: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-lookup-target",
    "Get the target entity information for a lookup field. Returns the navigation property name to use with @odata.bind plus the EntitySetName for setting lookup values in create/update operations. No permission flag required (read-only).",
    {
      entityLogicalName: z
        .string()
        .describe(descWithExamples(
          "The singular logical name of the entity containing the lookup",
          ENTITY_NAME_SINGULAR_EXAMPLES
        )),
      lookupAttributeName: z
        .string()
        .describe("The logical name of the lookup attribute (e.g., 'ste_categoryid', 'parentaccountid')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityLogicalName, lookupAttributeName }: any) => {
      try {
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.getEntityAttribute(entityLogicalName, lookupAttributeName);

        const inputObj = { entityLogicalName, lookupAttributeName };
        const redacted = audit
          ? redactInput(ctx, entityLogicalName, inputObj)
          : { data: inputObj, report: null };

        const attribute = (audit
          ? await auditEmit(audit, {
              tool: 'get-lookup-target',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: () => ({
                recordCount: undefined,
                outputRedaction: null,
              }),
            }, operation)
          : await operation()) as any;

        if (!attribute.Targets || attribute.Targets.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Attribute '${lookupAttributeName}' on entity '${entityLogicalName}' is not a lookup field or has no targets.`,
              },
            ],
            isError: true,
          };
        }

        const lookupSchemaName = attribute.SchemaName;
        const isPolymorphic = attribute.Targets.length > 1;

        const targetResults = await Promise.all(
          attribute.Targets.map(async (targetEntity: string) => {
            const navPromise = service.lookupNavigationProperty(
              entityLogicalName,
              lookupAttributeName.toLowerCase(),
              isPolymorphic ? targetEntity : undefined
            );
            try {
              const [targetMetadata, navProperty] = await Promise.all([
                service.getEntityMetadata(targetEntity) as any,
                navPromise,
              ]);
              return {
                LogicalName: targetEntity,
                EntitySetName: targetMetadata.EntitySetName,
                PrimaryIdAttribute: targetMetadata.PrimaryIdAttribute,
                DisplayName: targetMetadata.DisplayName?.UserLocalizedLabel?.Label,
                BindingPropertyName: navProperty ?? lookupAttributeName.toLowerCase(),
              };
            } catch (err) {
              const navProperty = await navPromise.catch(() => null);
              return {
                LogicalName: targetEntity,
                EntitySetName: `${targetEntity}s`,
                BindingPropertyName: navProperty ?? lookupAttributeName.toLowerCase(),
                error: 'Could not fetch metadata',
              };
            }
          })
        );

        const primaryTarget = targetResults[0];

        let responseText = `📋 Lookup Target for '${lookupAttributeName}' on '${entityLogicalName}':\n\n`;
        responseText += `## Lookup Attribute\n`;
        responseText += `| Property | Value |\n`;
        responseText += `|----------|-------|\n`;
        responseText += `| **SchemaName** | \`${lookupSchemaName}\` |\n`;
        responseText += `| **LogicalName** | \`${lookupAttributeName}\` |\n`;
        responseText += `| **Polymorphic** | ${isPolymorphic ? 'Yes' : 'No'} |\n\n`;

        responseText += `## Target Entity\n`;
        responseText += `| Property | Value |\n`;
        responseText += `|----------|-------|\n`;
        responseText += `| **Entity** | \`${primaryTarget.LogicalName}\` |\n`;
        responseText += `| **EntitySetName** | \`${primaryTarget.EntitySetName}\` |\n`;
        responseText += `| **Primary ID** | \`${primaryTarget.PrimaryIdAttribute}\` |\n`;
        responseText += `| **NavigationProperty** | \`${primaryTarget.BindingPropertyName}\` |\n\n`;

        responseText += `## Usage\n\n`;
        responseText += `**To set this lookup, use:**\n`;
        responseText += `\`\`\`json\n{\n  "${primaryTarget.BindingPropertyName}@odata.bind": "/${primaryTarget.EntitySetName}(<record-guid>)"\n}\n\`\`\`\n\n`;

        responseText += `⚠️ **Important:** The \`@odata.bind\` key is the **referencing-entity navigation property name** (\`${primaryTarget.BindingPropertyName}\`) — for most attributes this is the lowercase logical name, NOT the attribute SchemaName. The runtime resolves this from the \`ReferencingEntityNavigationPropertyName\` field in ManyToOneRelationships metadata.\n\n`;

        if (isPolymorphic) {
          responseText += `## Polymorphic Lookup Targets\n\n`;
          responseText += `This lookup can reference ${targetResults.length} different entity types. Use the appropriate navigation property for each:\n\n`;
          responseText += `| Target Entity | Navigation Property | EntitySetName |\n`;
          responseText += `|---------------|---------------------|---------------|\n`;
          for (const target of targetResults) {
            responseText += `| \`${target.LogicalName}\` | \`${target.BindingPropertyName}@odata.bind\` | \`${target.EntitySetName}\` |\n`;
          }
          responseText += `\n**Example for each target:**\n`;
          for (const target of targetResults) {
            responseText += `\`\`\`json\n// To set ${target.LogicalName}:\n{"${target.BindingPropertyName}@odata.bind": "/${target.EntitySetName}(<guid>)"}\n\`\`\`\n`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting lookup target:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to get lookup target: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get-flow-runs",
    "Get the run history for a specific Power Automate flow using the Management API. " +
    "Returns run status, timestamps, trigger info, and error details for failed runs. " +
    "Use this to investigate flow failures during incident triage. No permission flag required (read-only).",
    {
      flowId: z.string().describe("GUID of the flow (workflowid)"),
      status: z.string().optional().describe("Filter by status: Succeeded, Failed, Running, Waiting, Cancelled"),
      startedAfter: z.string().optional().describe("Only return runs started after this date (ISO 8601 format, e.g., '2026-01-21T00:00:00Z')"),
      startedBefore: z.string().optional().describe("Only return runs started before this date (ISO 8601 format)"),
      maxRecords: z.number().optional().describe("Maximum number of runs to return (default: 50, max: 250)")
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ flowId, status, startedAfter, startedBefore, maxRecords }: any) => {
      try {
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.getFlowRuns(flowId, {
          status,
          startedAfter,
          startedBefore,
          maxRecords: maxRecords || 50,
        });

        const inputObj = { flowId, status, startedAfter, startedBefore, maxRecords };
        const redacted = audit
          ? redactInput(ctx, '_input', inputObj)
          : { data: inputObj, report: null };

        const result = audit
          ? await auditEmit(audit, {
              tool: 'get-flow-runs',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: (r: any) => ({
                recordCount: r?.runs?.length,
                outputRedaction: null,
              }),
            }, operation)
          : await operation();

        // Calculate success/failure stats
        const stats = (result.runs || []).reduce((acc: any, run: any) => {
          if (run.status === 'Succeeded') acc.succeeded++;
          else if (run.status === 'Failed' || run.status === 'Faulted' || run.status === 'TimedOut') acc.failed++;
          else if (run.status === 'Running' || run.status === 'Waiting') acc.inProgress++;
          else if (run.status === 'Cancelled') acc.cancelled++;
          else acc.other++;
          return acc;
        }, { succeeded: 0, failed: 0, inProgress: 0, cancelled: 0, other: 0 });

        // Build summary for failed runs
        const failedRuns = result.runs.filter((r: any) => r.status === 'Failed' || r.error);
        const failedSummary = failedRuns.length > 0
          ? `\n\nFailed Runs (${failedRuns.length}):\n` + failedRuns.map((r: any) =>
              `  - ${r.runId}: ${r.error?.message || 'Unknown error'} (${r.startTime})`
            ).join('\n')
          : '';

        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [{
            type: "text",
            text: `Found ${result.totalCount} flow runs for flow ${flowId}${result.hasMore ? ' (more available)' : ''}:\n\nStats:\n- Succeeded: ${stats.succeeded}\n- Failed: ${stats.failed}\n- In Progress: ${stats.inProgress}\n- Cancelled: ${stats.cancelled}\n- Other: ${stats.other}${failedSummary}\n\nFilters Applied: ${JSON.stringify(result.filterApplied)}\n\n${resultStr}`
          }]
        };
      } catch (error: any) {
        console.error("Error getting flow runs:", error);
        return {
          content: [{
            type: "text",
            text: `❌ Failed to get flow runs: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-flow-run-details",
    "Get detailed information about a specific flow run, including action-level outputs and error messages. " +
    "Use this after get-flow-runs to investigate why a specific run failed. " +
    "Returns trigger details, action statuses, and detailed error messages for each action. " +
    "NOTE: Requires Environment Maker role or flow co-owner permissions (uses Management API).",
    {
      flowId: z.string().describe("GUID of the flow (workflowid)"),
      runId: z.string().describe("GUID of the flow run (from get-flow-runs results)")
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ flowId, runId }: any) => {
      try {
        const service = ctx.pp;
        const audit = ctx.audit;

        const operation = async () => service.getFlowRunDetails(flowId, runId);

        const inputObj = { flowId, runId };
        const redacted = audit
          ? redactInput(ctx, '_input', inputObj)
          : { data: inputObj, report: null };

        const result = (audit
          ? await auditEmit(audit, {
              tool: 'get-flow-run-details',
              params: redacted.data,
              payloadInput: redacted.data,
              inputRedaction: redacted.report,
              resultExtractor: () => ({
                recordCount: 1,
                outputRedaction: null,
              }),
            }, operation)
          : await operation()) as any;

        // Build action summary
        const actions = result.actions || {};
        const actionList = Object.entries(actions).map(([name, action]: [string, any]) => {
          const status = action.status || 'unknown';
          const error = action.error ? ` - Error: ${JSON.stringify(action.error)}` : '';
          return `  - ${name}: ${status}${error}`;
        }).join('\n');

        const summary = result.actionsSummary || {};
        const statusText = `Status: ${result.status}\nStart: ${result.startTime}\nEnd: ${result.endTime || 'N/A'}`;
        const triggerText = result.trigger ? `\n\nTrigger: ${result.trigger.name} (${result.trigger.status})` : '';
        const actionsText = actionList ? `\n\nActions (${summary.total || 0} total, ${summary.failed || 0} failed):\n${actionList}` : '';

        const resultStr = JSON.stringify(result, null, 2);

        return {
          content: [{
            type: "text",
            text: `Flow Run Details for ${flowId} / ${runId}:\n\n${statusText}${triggerText}${actionsText}\n\nFull Details:\n${resultStr}`
          }]
        };
      } catch (error: any) {
        console.error("Error getting flow run details:", error);
        const envDebug = `[DEBUG: POWERPLATFORM_ENVIRONMENT_ID=${process.env.POWERPLATFORM_ENVIRONMENT_ID || 'NOT SET'}]`;
        return {
          content: [{
            type: "text",
            text: `❌ Failed to get flow run details: ${error.message}\n\n${envDebug}`
          }],
          isError: true
        };
      }
    }
  );
}
