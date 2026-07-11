/**
 * FlowService
 *
 * Read-only service for Power Automate cloud flows.
 */

import axios from 'axios';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type {
  ApiCollectionResponse,
  FlowFilterOptions,
  FlowListResult,
  FlowSummary,
} from '../client/types.js';
import {
  aggregateFlowHealth,
  erroredFlowEntry,
  mapInventoryRow,
  nextRelativeUrl,
  summariseFlowRuns,
  type FlowHealthEntry,
  type FlowHealthSummary,
  type FlowInventoryEntry,
  type FlowRef,
} from './flow-health.js';

export interface CancelFlowRunResult {
  success: boolean;
  flowId: string;
  runId: string;
  previousStatus: string;
}

export interface ResubmitFlowRunResult {
  success: boolean;
  flowId: string;
  originalRunId: string;
  newRunId: string;
  triggerName: string;
}

export interface FlowRunFilterOptions {
  /** Filter by status: Succeeded, Failed, Running, Waiting, Cancelled */
  status?: string;
  /** Only return runs started after this date (ISO 8601) */
  startedAfter?: string;
  /** Only return runs started before this date (ISO 8601) */
  startedBefore?: string;
  /** Maximum number of runs to return (default: 50, max: 250) */
  maxRecords?: number;
}

export interface FlowRunSummary {
  runId: string;
  flowId: string;
  status: string;
  startTime: string;
  endTime: string | null;
  trigger: {
    name: string;
    status: string;
    startTime: string;
    endTime: string | null;
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface FlowRunsResult {
  flowId: string;
  environmentId: string;
  totalCount: number;
  hasMore: boolean;
  filterApplied: {
    status?: string;
    startedAfter?: string;
    startedBefore?: string;
    maxRecords: number;
  };
  runs: FlowRunSummary[];
}

export interface FlowHealthScanOptions {
  /** Days of run history to analyse (default: 7) */
  daysBack?: number;
  /** Max runs sampled per flow, newest first (default: 100) */
  maxRunsPerFlow?: number;
  /** Max flows to scan (default: 500) */
  maxFlows?: number;
  /** Only scan activated flows (default: true) */
  activeOnly?: boolean;
  /** Concurrent per-flow run fetches (default: 5) */
  concurrency?: number;
}

export interface FlowHealthScanResult {
  scanTime: string;
  daysAnalyzed: number;
  /** The per-flow run cap used; success rates for truncated flows are over this sample. */
  runsSampledPerFlow: number;
  activeOnly: boolean;
  /** True when there were more cloud flows than maxFlows (list itself was capped). */
  flowListTruncated: boolean;
  summary: FlowHealthSummary;
  topFailingFlows: FlowHealthEntry[];
  allFlows: FlowHealthEntry[];
}

export interface FlowInventoryResult {
  totalCount: number;
  hasMore: boolean;
  requestedMax: number;
  flows: FlowInventoryEntry[];
}

/** Run an async mapper over items with a bounded number of concurrent workers, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length || 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Copilot for Sales flow names - hardcoded list versioned with releases.
 */
const COPILOT_SALES_FLOW_NAMES = new Set([
  'Account Research Summary Flow',
  'AccountResearchTriggerFlow',
  'Chain Of Thoughts Flow',
  'Competitor Research Flow',
  'Competitor Web Research Flow',
  'CustomizationAgentTriggerFlow',
  'Deal Health Flow',
  'Deal Importance Flow',
  'Deal Insights Flow',
  'Deal Needs And Pain Points Flow',
  'Deal Overview Flow',
  'Deal Risk Flow',
  'Email Classification - Leads',
  'Email Insights cleanup Job',
  'Email Validation Flow - Leads',
  'Execute Engage And Readiness Agent',
  'Execute Handover Microagent',
  'Execute Outreach Agent',
  'Lead Qualifcation Agent',
  'Opportunity Competitor Research Flow',
  'Opportunity Stakeholder Research flow',
  'OpportunityAccountResearchTriggerFlow',
  'RCS Insights flow v2',
  'RCS flow',
  'Sales Agents Initiate Opportunity Research Orchestration flow',
  'Sales Agents Refresh Opportunity Research Orchestration flow',
  'Sales Close Agent - Engage - Execute Engage Agent',
  'Sales Close Agent - Engage - Execute Orchestrator',
  'Sales Close Agent - Engage - Execute Outreach Agent',
  'Sales Close Agent - Engage - Orchestrate Engage Activities',
  'Sales Close Agent - Engage - Test Agent',
  'Sales Company Resolver Flow',
  'Sales Micro Agent Orchestration Flow',
  'Sales Outreach Flow',
  'Summary Synthesizer Flow',
  'Tcp and Bant prefill Flow',
]);

export class FlowService {
  private environmentId: string | null = null;

  constructor(private client: PowerPlatformClient) {}

  /**
   * Get Power Automate cloud flows with smart filtering
   */
  async getFlows(options: FlowFilterOptions = {}): Promise<FlowListResult> {
    const {
      activeOnly = false,
      maxRecords = 25,
      excludeCustomerInsights = true,
      excludeSystem = true,
      excludeCopilotSales = true,
      nameContains,
    } = options;

    const filterConditions: string[] = ['category eq 5'];

    if (activeOnly) {
      filterConditions.push('statecode eq 1');
    }

    if (excludeCustomerInsights) {
      filterConditions.push("not startswith(name,'CXP_')");
    }

    if (nameContains) {
      const escapedName = nameContains.replace(/'/g, "''");
      filterConditions.push(`contains(name,'${escapedName}')`);
    }

    const filterString = filterConditions.join(' and ');

    const clientFilterFactor = excludeSystem || excludeCopilotSales ? 1.5 : 1;
    const requestLimit = Math.ceil(maxRecords * clientFilterFactor) + 1;

    const flows = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/workflows?$filter=${filterString}&$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,ismanaged,iscrmuiworkflow,primaryentity,_ownerid_value&$expand=modifiedby($select=fullname)&$orderby=modifiedon desc&$top=${requestLimit}`
    );

    const excludedCounts = {
      customerInsights: 0,
      system: 0,
      copilotSales: 0,
    };

    let filteredFlows = flows.value;

    if (excludeSystem) {
      const beforeCount = filteredFlows.length;
      filteredFlows = filteredFlows.filter((flow) => {
        const modifiedBy = (flow.modifiedby as { fullname?: string })?.fullname;
        return modifiedBy !== 'SYSTEM';
      });
      excludedCounts.system = beforeCount - filteredFlows.length;
    }

    if (excludeCopilotSales) {
      const beforeCount = filteredFlows.length;
      filteredFlows = filteredFlows.filter(
        (flow) => !COPILOT_SALES_FLOW_NAMES.has(flow.name as string)
      );
      excludedCounts.copilotSales = beforeCount - filteredFlows.length;
    }

    const hasMore = filteredFlows.length > maxRecords;
    const trimmedFlows = hasMore
      ? filteredFlows.slice(0, maxRecords)
      : filteredFlows;

    const formattedFlows: FlowSummary[] = trimmedFlows.map((flow) => ({
      workflowid: flow.workflowid as string,
      name: flow.name as string,
      description: flow.description as string | null,
      state:
        flow.statecode === 0
          ? 'Draft'
          : flow.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: flow.statecode as number,
      statuscode: flow.statuscode as number,
      type:
        flow.type === 1
          ? 'Definition'
          : flow.type === 2
            ? 'Activation'
            : 'Template',
      primaryEntity: flow.primaryentity as string | null,
      isManaged: flow.ismanaged as boolean,
      ownerId: flow._ownerid_value as string,
      modifiedOn: flow.modifiedon as string,
      modifiedBy: (flow.modifiedby as { fullname?: string })?.fullname || null,
      createdOn: flow.createdon as string,
    }));

    return {
      totalCount: formattedFlows.length,
      hasMore,
      requestedMax: maxRecords,
      excluded: {
        customerInsights: excludedCounts.customerInsights,
        system: excludedCounts.system,
        copilotSales: excludedCounts.copilotSales,
        total: excludedCounts.system + excludedCounts.copilotSales,
      },
      filterApplied: {
        excludeCustomerInsights,
        excludeSystem,
        excludeCopilotSales,
        nameContains,
      },
      flows: formattedFlows,
    };
  }

  /**
   * Search workflows (both classic workflows and Power Automate flows)
   */
  async searchWorkflows(
    options: {
      name?: string;
      primaryEntity?: string;
      description?: string;
      category?: number;
      statecode?: number;
      includeDescription?: boolean;
      maxResults?: number;
    } = {}
  ): Promise<{
    totalCount: number;
    hasMore: boolean;
    requestedMax: number;
    workflows: unknown[];
  }> {
    const {
      name,
      primaryEntity,
      description,
      category,
      statecode,
      includeDescription = true,
      maxResults = 50,
    } = options;

    const filterConditions: string[] = [];

    if (name) {
      const escapedName = name.replace(/'/g, "''");
      filterConditions.push(`contains(name,'${escapedName}')`);
    }

    if (primaryEntity) {
      filterConditions.push(`primaryentity eq '${primaryEntity}'`);
    }

    if (description) {
      const escapedDescription = description.replace(/'/g, "''");
      filterConditions.push(`contains(description,'${escapedDescription}')`);
    }

    if (category !== undefined) {
      filterConditions.push(`category eq ${category}`);
    }

    if (statecode !== undefined) {
      filterConditions.push(`statecode eq ${statecode}`);
    }

    const filterString =
      filterConditions.length > 0 ? filterConditions.join(' and ') : '';
    const requestLimit = maxResults + 1;

    const selectFields = includeDescription
      ? 'workflowid,name,description,statecode,statuscode,category,type,primaryentity,ismanaged,createdon,modifiedon,_ownerid_value'
      : 'workflowid,name,statecode,statuscode,category,type,primaryentity,ismanaged,createdon,modifiedon,_ownerid_value';

    const endpoint = filterString
      ? `api/data/v9.2/workflows?$filter=${filterString}&$select=${selectFields}&$expand=modifiedby($select=fullname),createdby($select=fullname)&$orderby=modifiedon desc&$top=${requestLimit}`
      : `api/data/v9.2/workflows?$select=${selectFields}&$expand=modifiedby($select=fullname),createdby($select=fullname)&$orderby=modifiedon desc&$top=${requestLimit}`;

    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(endpoint);

    const hasMore = response.value.length > maxResults;
    const workflows = hasMore
      ? response.value.slice(0, maxResults)
      : response.value;

    const formattedWorkflows = workflows.map((workflow) => ({
      workflowid: workflow.workflowid,
      name: workflow.name,
      description: includeDescription ? workflow.description : undefined,
      state:
        workflow.statecode === 0
          ? 'Draft'
          : workflow.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: workflow.statecode,
      statuscode: workflow.statuscode,
      category:
        workflow.category === 0
          ? 'Classic Workflow'
          : workflow.category === 5
            ? 'Power Automate Flow'
            : `Other (${workflow.category})`,
      categoryCode: workflow.category,
      type:
        workflow.type === 1
          ? 'Definition'
          : workflow.type === 2
            ? 'Activation'
            : 'Template',
      typeCode: workflow.type,
      primaryEntity: workflow.primaryentity,
      isManaged: workflow.ismanaged,
      ownerId: workflow._ownerid_value,
      createdOn: workflow.createdon,
      createdBy: (workflow.createdby as { fullname?: string })?.fullname,
      modifiedOn: workflow.modifiedon,
      modifiedBy: (workflow.modifiedby as { fullname?: string })?.fullname,
    }));

    return {
      totalCount: formattedWorkflows.length,
      hasMore,
      requestedMax: maxResults,
      workflows: formattedWorkflows,
    };
  }

  /**
   * Get a specific Power Automate flow with its complete definition
   */
  async getFlowDefinition(
    flowId: string,
    summary: boolean = false
  ): Promise<unknown> {
    const flow = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/workflows(${flowId})?$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,category,ismanaged,iscrmuiworkflow,primaryentity,clientdata&$expand=modifiedby($select=fullname),createdby($select=fullname)`
    );

    let flowDefinition = null;
    let flowSummary = null;

    if (flow.clientdata) {
      try {
        flowDefinition = JSON.parse(flow.clientdata as string);

        if (summary && flowDefinition) {
          flowSummary = this.parseFlowSummary(flowDefinition);
        }
      } catch {
        flowDefinition = {
          parseError: 'Failed to parse flow definition',
          raw: (flow.clientdata as string)?.substring(0, 500) + '...',
        };
      }
    }

    const baseResult = {
      workflowid: flow.workflowid,
      name: flow.name,
      description: flow.description,
      state:
        flow.statecode === 0
          ? 'Draft'
          : flow.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: flow.statecode,
      statuscode: flow.statuscode,
      type:
        flow.type === 1
          ? 'Definition'
          : flow.type === 2
            ? 'Activation'
            : 'Template',
      category: flow.category,
      primaryEntity: flow.primaryentity,
      isManaged: flow.ismanaged,
      createdOn: flow.createdon,
      createdBy: (flow.createdby as { fullname?: string })?.fullname,
      modifiedOn: flow.modifiedon,
      modifiedBy: (flow.modifiedby as { fullname?: string })?.fullname,
    };

    if (summary) {
      return {
        ...baseResult,
        summary: flowSummary,
        note: 'Use summary=false to get the full flow definition',
      };
    }

    return {
      ...baseResult,
      flowDefinition,
    };
  }

  /**
   * Parse a flow definition to extract a summary
   */
  parseFlowSummary(flowDef: Record<string, unknown>): Record<string, unknown> {
    const summary: Record<string, unknown> = {
      trigger: null,
      actions: [],
      connectors: new Set<string>(),
      actionCount: 0,
      hasConditions: false,
      hasLoops: false,
      hasErrorHandling: false,
      tablesModified: new Set<string>(),
      triggerInfo: 'manual',
      triggerFields: [] as string[],
      customApisCalled: new Set<string>(),
    };

    try {
      const properties = flowDef.properties as Record<string, unknown>;
      const definition = properties?.definition as Record<string, unknown>;

      // Extract trigger information
      if (definition?.triggers) {
        const triggers = definition.triggers as Record<string, unknown>;
        const triggerNames = Object.keys(triggers);
        if (triggerNames.length > 0) {
          const triggerName = triggerNames[0];
          const trigger = triggers[triggerName] as Record<string, unknown>;
          summary.trigger = {
            name: triggerName,
            type: trigger.type,
            kind: trigger.kind,
            recurrence: trigger.recurrence,
          };

          // Extract trigger type and fields
          if (
            trigger.type === 'OpenApiConnectionWebhook' ||
            trigger.type === 'OpenApiConnection'
          ) {
            const inputs = trigger.inputs as Record<string, unknown>;
            const parameters = inputs?.parameters as Record<string, unknown>;
            const entityName = parameters?.entityName as string;
            const host = inputs?.host as Record<string, unknown>;
            const operationId = (host?.operationId as string) || '';

            if (entityName) {
              if (
                operationId.includes('Create') ||
                operationId.includes('OnNew')
              ) {
                summary.triggerInfo = `${entityName} create`;
              } else if (
                operationId.includes('Update') ||
                operationId.includes('OnModified') ||
                operationId.includes('OnUpdated')
              ) {
                const filterExpression = parameters?.filterExpression as string;
                if (filterExpression && typeof filterExpression === 'string') {
                  const fieldMatches = filterExpression.matchAll(
                    /([a-z_]+)\s*(?:eq|ne|gt|lt|ge|le)/gi
                  );
                  for (const match of fieldMatches) {
                    (summary.triggerFields as string[]).push(match[1]);
                  }
                  summary.triggerInfo = `${entityName} update (${filterExpression})`;
                } else {
                  summary.triggerInfo = `${entityName} update`;
                }
              } else if (
                operationId.includes('Delete') ||
                operationId.includes('OnDeleted')
              ) {
                summary.triggerInfo = `${entityName} delete`;
              } else {
                summary.triggerInfo = `${entityName} ${operationId}`;
              }
            } else {
              const apiId = host?.apiId as string;
              if (apiId && apiId.includes('/')) {
                const apiName = apiId.split('/').pop();
                summary.triggerInfo = `${apiName} trigger`;
              } else {
                summary.triggerInfo = `${trigger.type} trigger`;
              }
            }
          } else if (trigger.type === 'Recurrence') {
            summary.triggerInfo = 'scheduled';
          } else if (trigger.type === 'Request' || trigger.type === 'manual') {
            summary.triggerInfo = 'manual';
          } else {
            summary.triggerInfo = (trigger.type as string) || 'unknown';
          }
        }
      }

      // Process actions recursively
      const processActions = (
        actions: Record<string, unknown>,
        path: string = ''
      ) => {
        for (const [actionName, actionData] of Object.entries(actions)) {
          const action = actionData as Record<string, unknown>;
          const actionType = ((action.type as string) || '').toLowerCase();
          const fullPath = path ? `${path}/${actionName}` : actionName;

          if (actionType === 'if' || actionType === 'switch') {
            summary.hasConditions = true;
          }
          if (actionType === 'foreach' || actionType === 'until') {
            summary.hasLoops = true;
          }

          const runAfter = action.runAfter as Record<string, unknown[]>;
          if (
            actionType === 'scope' &&
            runAfter &&
            Object.values(runAfter).some((r) => r.includes('Failed'))
          ) {
            summary.hasErrorHandling = true;
          }

          // Extract connector and table info
          if (
            action.type === 'OpenApiConnection' ||
            action.type === 'ApiConnection'
          ) {
            const inputs = action.inputs as Record<string, unknown>;
            const host = inputs?.host as Record<string, unknown>;
            const connectorId =
              (host?.connectionName as string) ||
              (host?.apiId as string) ||
              ((action.metadata as Record<string, unknown>)
                ?.operationMetadataId as string);
            if (connectorId) {
              (summary.connectors as Set<string>).add(
                connectorId.split('/').pop() || connectorId
              );
            }

            const operationId = host?.operationId as string;
            if (
              operationId &&
              [
                'CreateRecord',
                'UpdateRecord',
                'DeleteRecord',
                'UpsertRecord',
                'AssociateRecords',
              ].includes(operationId)
            ) {
              const parameters = inputs?.parameters as Record<string, unknown>;
              const entityName = parameters?.entityName as string;
              if (entityName && typeof entityName === 'string') {
                (summary.tablesModified as Set<string>).add(
                  entityName.toLowerCase()
                );
              }
            }

            // Detect Custom API calls
            if (
              operationId &&
              ![
                'CreateRecord',
                'UpdateRecord',
                'DeleteRecord',
                'UpsertRecord',
                'AssociateRecords',
                'GetRecord',
                'ListRecords',
                'GetItem',
                'ListItems',
              ].includes(operationId)
            ) {
              const apiId = (host?.apiId as string) || '';
              const connectionName = (host?.connectionName as string) || '';
              const isDataverseConnector =
                apiId.includes('commondataservice') ||
                connectionName.includes('commondataservice') ||
                connectorId?.toLowerCase().includes('commondataservice');

              if (isDataverseConnector) {
                (summary.customApisCalled as Set<string>).add(operationId);
              }
            }
          }

          // Add action summary
          (summary.actions as unknown[]).push({
            name: fullPath,
            type: action.type,
            runAfter: runAfter ? Object.keys(runAfter) : [],
          });

          // Recurse into nested actions
          if (action.actions) {
            processActions(action.actions as Record<string, unknown>, fullPath);
          }
          if (action.then) {
            processActions(
              action.then as Record<string, unknown>,
              `${fullPath}/then`
            );
          }
          if (action.else) {
            processActions(
              action.else as Record<string, unknown>,
              `${fullPath}/else`
            );
          }
          if (action.cases) {
            for (const [caseName, caseActions] of Object.entries(
              action.cases as Record<string, unknown>
            )) {
              const caseData = caseActions as Record<string, unknown>;
              if (caseData.actions) {
                processActions(
                  caseData.actions as Record<string, unknown>,
                  `${fullPath}/case:${caseName}`
                );
              }
            }
          }
          if (action.default) {
            processActions(
              action.default as Record<string, unknown>,
              `${fullPath}/default`
            );
          }
        }
      };

      if (definition?.actions) {
        const actions = definition.actions as Record<string, unknown>;
        summary.actionCount = Object.keys(actions).length;
        processActions(actions);
      }

      // Convert Sets to arrays
      summary.connectors = Array.from(summary.connectors as Set<string>);
      summary.tablesModified = Array.from(
        summary.tablesModified as Set<string>
      );
      summary.customApisCalled = Array.from(
        summary.customApisCalled as Set<string>
      );

      // Add connection references
      if (properties?.connectionReferences) {
        const refs = properties.connectionReferences as Record<string, unknown>;
        summary.connectionReferences = Object.keys(refs).map((key) => ({
          name: key,
          type:
            ((refs[key] as Record<string, unknown>)?.api as { name?: string })
              ?.name || 'unknown',
        }));
      }
    } catch {
      summary.parseError = 'Partial parse - some information may be missing';
    }

    return summary;
  }

  /**
   * Get flow run history for a specific Power Automate flow using the Dataverse flowruns table.
   * Uses the Elastic table approach which works with standard Dataverse permissions.
   */
  async getFlowRuns(
    flowId: string,
    options: FlowRunFilterOptions = {}
  ): Promise<FlowRunsResult> {
    const {
      status,
      startedAfter,
      startedBefore,
      maxRecords = 50,
    } = options;

    // Enforce max limit
    const limit = Math.min(maxRecords, 250);

    try {
      // Build OData filter conditions for the flowruns Elastic table
      const filterConditions: string[] = [`_workflow_value eq '${flowId}'`];

      if (status) {
        // Map common status names to flowruns table status values
        filterConditions.push(`status eq '${status}'`);
      }

      if (startedAfter) {
        filterConditions.push(`starttime ge ${startedAfter}`);
      }

      if (startedBefore) {
        filterConditions.push(`starttime le ${startedBefore}`);
      }

      const filterString = filterConditions.join(' and ');

      // Query the flowruns Elastic table via Dataverse API
      const response = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/flowruns?$filter=${filterString}&$select=flowrunid,status,starttime,endtime,errorcode,errormessage,duration,triggertype&$orderby=starttime desc&$top=${limit + 1}`
      );

      const runsData = response.value || [];
      const hasMore = runsData.length > limit;
      const trimmedRuns = hasMore ? runsData.slice(0, limit) : runsData;

      const formattedRuns: FlowRunSummary[] = trimmedRuns.map((run: Record<string, unknown>) => {
        const errorCode = run.errorcode as string | null;
        const errorMessage = run.errormessage as string | null;
        const triggerType = run.triggertype as string | null;

        return {
          runId: run.flowrunid as string,
          flowId,
          status: run.status as string,
          startTime: run.starttime as string,
          endTime: (run.endtime as string) || null,
          trigger: triggerType ? {
            name: triggerType,
            status: run.status as string,
            startTime: run.starttime as string,
            endTime: (run.endtime as string) || null,
          } : null,
          error: (errorCode || errorMessage) ? {
            code: errorCode || 'Unknown',
            message: errorMessage || 'Unknown error',
          } : null,
        };
      });

      // Get environment ID for response (informational only)
      const environmentId = await this.getEnvironmentId();

      return {
        flowId,
        environmentId,
        totalCount: formattedRuns.length,
        hasMore,
        filterApplied: {
          status,
          startedAfter,
          startedBefore,
          maxRecords: limit,
        },
        runs: formattedRuns,
      };
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: { code?: string; message?: string } };
        };
        message?: string;
      };

      // Provide helpful error messages for common issues
      const apiError = err.response?.data?.error;
      if (err.response?.status === 404) {
        throw new Error(`Flow runs not found for flow: ${flowId}. Verify the flow ID is correct.`);
      }
      if (err.response?.status === 403) {
        throw new Error(`Access denied to flowruns table. Ensure the service principal has read access to the flowruns Elastic table.`);
      }

      const errorDetails = apiError || err.response?.data || err.message;
      throw new Error(
        `Failed to get flow runs: ${err.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Get detailed flow run information including action-level outputs and errors.
   * Uses the Flow API (api.flow.microsoft.com) with $expand to get action details.
   * For failed actions, fetches the outputsLink to get the detailed error message.
   *
   * Note: The runId can be either:
   * - The Flow API run name (e.g., "08584325684145343572674129072CU28")
   * - The Dataverse flowrunid GUID (will be converted via clienttrackingid lookup)
   */
  async getFlowRunDetails(flowId: string, runId: string): Promise<unknown> {
    try {
      const environmentId = await this.getEnvironmentId();
      const token = await this.client.getManagementToken();

      // If runId looks like a GUID, try to get the name from Dataverse flowruns table
      let flowApiRunId = runId;
      if (runId.includes('-') && runId.length === 36) {
        // This is a flowrunid GUID from flowruns table, need to get the name field
        // Note: flowruns is an Elastic table (Cosmos-backed), so we use $filter instead of key-based retrieval
        try {
          const response = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
            `api/data/v9.2/flowruns?$filter=flowrunid eq ${runId}&$select=name`
          );
          if (response.value && response.value.length > 0) {
            flowApiRunId = (response.value[0].name as string) || runId;
          }
        } catch {
          // If lookup fails, try the original ID
          flowApiRunId = runId;
        }
      }

      // Use Flow API with $expand to get action details in one call
      const url = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${environmentId}/flows/${flowId}/runs/${flowApiRunId}?$expand=properties/actions&api-version=2016-11-01`;

      const response = await axios({
        method: 'GET',
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const runData = response.data;
      const properties = runData.properties || {};

      const result: Record<string, unknown> = {
        flowId,
        runId: flowApiRunId,
        originalRunId: runId,
        name: runData.name,
        status: properties.status,
        code: properties.code,
        error: properties.error,
        startTime: properties.startTime,
        endTime: properties.endTime,
        trigger: {
          name: properties.trigger?.name,
          status: properties.trigger?.status,
          startTime: properties.trigger?.startTime,
          endTime: properties.trigger?.endTime,
        },
        actions: {},
        actionsSummary: {
          total: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          other: 0,
        },
        failedActionErrors: [] as { action: string; code: string; message: string }[],
      };

      const actions = result.actions as Record<string, unknown>;
      const summary = result.actionsSummary as {
        total: number;
        succeeded: number;
        failed: number;
        skipped: number;
        other: number;
      };
      const failedErrors = result.failedActionErrors as { action: string; code: string; message: string }[];

      // Process actions from the expanded response
      if (properties.actions) {
        for (const [actionName, actionData] of Object.entries(properties.actions)) {
          const action = actionData as Record<string, unknown>;
          const status = ((action.status as string) || '').toLowerCase();
          const outputsLink = (action.outputsLink as { uri?: string })?.uri;

          const actionResult: Record<string, unknown> = {
            status: action.status,
            code: action.code,
            startTime: action.startTime,
            endTime: action.endTime,
            error: null,
          };

          // For failed actions, fetch the outputsLink to get detailed error
          if (status === 'failed' && outputsLink) {
            try {
              // outputsLink has SAS token, no auth needed
              const outputResponse = await axios.get(outputsLink);
              const outputData = outputResponse.data;
              if (outputData?.body?.error) {
                actionResult.error = outputData.body.error;
                failedErrors.push({
                  action: actionName,
                  code: outputData.body.error.code || action.code || 'Unknown',
                  message: outputData.body.error.message || 'Unknown error',
                });
              }
            } catch {
              // If fetch fails, use what we have
              actionResult.error = { code: action.code, message: 'Could not fetch detailed error' };
            }
          }

          actions[actionName] = actionResult;

          summary.total++;
          if (status === 'succeeded') {
            summary.succeeded++;
          } else if (status === 'failed') {
            summary.failed++;
          } else if (status === 'skipped') {
            summary.skipped++;
          } else {
            summary.other++;
          }
        }
      }

      return result;
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
        };
        message?: string;
      };
      const errorDetails =
        err.response?.data?.error || err.response?.data || err.message;
      throw new Error(
        `Failed to get flow run details: ${err.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Cancel a running or waiting flow run
   * Cannot cancel flows that are already in a terminal state (Succeeded, Failed, Cancelled)
   */
  async cancelFlowRun(flowId: string, runId: string): Promise<CancelFlowRunResult> {
    try {
      const environmentId = await this.getEnvironmentId();
      const token = await this.client.getManagementToken();

      // Get current run status first
      const runDetails = await this.getFlowRunDetails(flowId, runId) as Record<string, unknown>;
      const status = (runDetails.status as string) || '';

      // Check if already in terminal state
      const terminalStates = ['Succeeded', 'Failed', 'Cancelled'];
      if (terminalStates.includes(status)) {
        throw new Error(`Cannot cancel flow run - already in terminal state: ${status}`);
      }

      const url = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${environmentId}/flows/${flowId}/runs/${runId}/cancel?api-version=2016-11-01`;

      await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      return {
        success: true,
        flowId,
        runId,
        previousStatus: status,
      };
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
        };
        message?: string;
      };
      const errorDetails = err.response?.data?.error || err.response?.data || err.message;
      throw new Error(
        `Failed to cancel flow run: ${err.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Resubmit/retry a failed flow run using the original trigger inputs
   */
  async resubmitFlowRun(flowId: string, runId: string): Promise<ResubmitFlowRunResult> {
    try {
      const environmentId = await this.getEnvironmentId();
      const token = await this.client.getManagementToken();

      // Get trigger name from flow definition
      const flowDef = await this.getFlowDefinition(flowId, false) as Record<string, unknown>;
      const flowDefinition = flowDef.flowDefinition as Record<string, unknown> | null;
      const properties = flowDefinition?.properties as Record<string, unknown> | undefined;
      const definition = properties?.definition as Record<string, unknown> | undefined;
      const triggers = definition?.triggers as Record<string, unknown> | undefined;
      const triggerName = triggers ? Object.keys(triggers)[0] : 'manual';

      const url = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${environmentId}/flows/${flowId}/triggers/${triggerName}/histories/${runId}/resubmit?api-version=2016-11-01`;

      const response = await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      return {
        success: true,
        flowId,
        originalRunId: runId,
        newRunId: (response.data as Record<string, unknown>)?.name as string || 'pending',
        triggerName,
      };
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
        };
        message?: string;
      };
      const errorDetails = err.response?.data?.error || err.response?.data || err.message;
      throw new Error(
        `Failed to resubmit flow run: ${err.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Scan cloud flows for run-health metrics (success rate, failures) over the last N days.
   *
   * App-only friendly: builds the flow list from the Dataverse `workflow` table and reads
   * run history from the `flowrun` elastic table via `getFlowRuns` — no dependency on the
   * Power Automate management API. Because `flowrun` is an elastic table (500-row page cap)
   * and per-flow runs are sampled newest-first, each flow reports `sampleTruncated` when more
   * runs existed in the window than were analysed, so success rates are never presented as a
   * full-population figure when they are actually over a sample.
   *
   * Requires the Dataverse Application User's security role to grant Organization-scope Read
   * on FlowRun (records are user-owned); otherwise a flow reports `scanError`, kept distinct
   * from a genuinely idle (no-runs) flow.
   */
  async scanFlowHealth(options: FlowHealthScanOptions = {}): Promise<FlowHealthScanResult> {
    const {
      daysBack = 7,
      maxRunsPerFlow = 100,
      maxFlows = 500,
      activeOnly = true,
      concurrency = 5,
    } = options;

    const startedAfter = new Date(
      Date.now() - daysBack * 24 * 60 * 60 * 1000
    ).toISOString();

    const { rows, truncated: flowListTruncated } = await this.paginateCloudFlows(
      'workflowid,name,statecode',
      undefined,
      activeOnly ? 'statecode eq 1' : undefined,
      'name',
      maxFlows
    );

    const flowRefs: FlowRef[] = rows.map((r) => {
      const statecode = r.statecode as number;
      return {
        workflowid: r.workflowid as string,
        name: r.name as string,
        statecode,
        state: statecode === 0 ? 'Draft' : statecode === 1 ? 'Activated' : 'Suspended',
      };
    });

    const allFlows: FlowHealthEntry[] = await mapWithConcurrency(
      flowRefs,
      concurrency,
      async (flow) => {
        try {
          const runsResult = await this.getFlowRuns(flow.workflowid, {
            startedAfter,
            maxRecords: maxRunsPerFlow,
          });
          return summariseFlowRuns(flow, runsResult.runs, runsResult.hasMore);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return erroredFlowEntry(flow, message);
        }
      }
    );

    const { summary, topFailingFlows } = aggregateFlowHealth(allFlows, 20);

    return {
      scanTime: new Date().toISOString(),
      daysAnalyzed: daysBack,
      runsSampledPerFlow: maxRunsPerFlow,
      activeOnly,
      flowListTruncated,
      summary,
      topFailingFlows,
      allFlows,
    };
  }

  /**
   * Complete inventory of cloud (Modern) flows with deployment metadata but no run history.
   *
   * Unlike `getFlows` (a single filtered page), this follows `@odata.nextLink` to enumerate
   * every cloud flow up to `maxRecords`, so an audit gets a guaranteed-complete list. Sets
   * `hasMore` when the cap was hit and more flows remained.
   */
  async getFlowInventory(options: { maxRecords?: number } = {}): Promise<FlowInventoryResult> {
    const { maxRecords = 500 } = options;

    const { rows, truncated } = await this.paginateCloudFlows(
      'workflowid,name,statecode,statuscode,ismanaged,modifiedon',
      'modifiedby($select=fullname)',
      undefined,
      'name',
      maxRecords
    );

    return {
      totalCount: rows.length,
      hasMore: truncated,
      requestedMax: maxRecords,
      flows: rows.map((r) => mapInventoryRow(r)),
    };
  }

  /**
   * Page through cloud flows (`workflow` table, `category eq 5`) following `@odata.nextLink`
   * up to `maxRecords`. Returns the accumulated rows and whether more remained beyond the cap.
   */
  private async paginateCloudFlows(
    select: string,
    expand: string | undefined,
    extraFilter: string | undefined,
    orderby: string,
    maxRecords: number
  ): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
    const filter = ['category eq 5', ...(extraFilter ? [extraFilter] : [])].join(' and ');
    // ceiling: 500-row page cap (elastic-table limit); enough per page, we follow nextLink for the rest.
    const pageSize = Math.min(Math.max(maxRecords, 1), 500);
    const expandClause = expand ? `&$expand=${expand}` : '';
    let endpoint: string | null =
      `api/data/v9.2/workflows?$filter=${filter}&$select=${select}${expandClause}&$orderby=${orderby}&$top=${pageSize}`;

    const rows: Record<string, unknown>[] = [];
    let truncated = false;

    while (endpoint) {
      const page: ApiCollectionResponse<Record<string, unknown>> =
        await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(endpoint);
      rows.push(...page.value);
      const next: string | undefined = page['@odata.nextLink'];
      if (rows.length >= maxRecords) {
        truncated = Boolean(next);
        break;
      }
      endpoint = next ? nextRelativeUrl(next, this.client.getOrganizationUrl()) : null;
    }

    return { rows: rows.slice(0, maxRecords), truncated };
  }

  private async getEnvironmentId(): Promise<string> {
    // ALWAYS check env var first - it takes precedence over cached/fallback values
    const envId = process.env.POWERPLATFORM_ENVIRONMENT_ID;
    if (envId) {
      this.environmentId = envId;
      return this.environmentId;
    }

    // Return cached value if we have one and no env var override
    if (this.environmentId) {
      return this.environmentId;
    }

    // Fall back to Dataverse organization ID (may not work for all Flow API operations)
    const orgResponse = await this.client.makeRequest<
      ApiCollectionResponse<{ organizationid: string }>
    >('api/data/v9.2/organizations?$select=organizationid');

    if (!orgResponse.value || orgResponse.value.length === 0) {
      throw new Error('Could not retrieve organization ID');
    }

    this.environmentId = orgResponse.value[0].organizationid;
    return this.environmentId;
  }
}
