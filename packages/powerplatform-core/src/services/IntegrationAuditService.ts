/**
 * IntegrationAuditService
 *
 * Read-only service for auditing PowerPlatform integrations.
 * Provides tools for:
 * - Service endpoint discovery (webhooks, Azure, REST)
 * - Webhook registration analysis
 * - Flow complexity scoring
 * - Combined integration audit reports
 */

import type { TruncationInfo } from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import {
  calculateFlowComplexity,
  type FlowComplexityResult,
  type RiskLevel,
} from '../utils/complexity-calculator.js';
import {
  extractUrlsFromFlowDefinition,
  detectHardcodedSecrets,
  type FlowUrlReference,
  type SecretWarning,
} from '../utils/flow-url-extractor.js';
import { generateAuditMarkdownReport } from '../utils/audit-report-formatter.js';
import {
  filterOotb,
  isOotbWebhook,
  isOotbEnvVar,
  isOotbServiceEndpoint,
} from '../utils/ootb-filters.js';
import { FlowService } from './FlowService.js';
import { PluginService } from './PluginService.js';

// ============================================================================
// Service Endpoint Types
// ============================================================================

export interface ServiceEndpoint {
  id: string;
  name: string;
  url: string;
  namespaceAddress: string | null;
  path: string | null;
  contractType: 'OneWay' | 'TwoWay' | 'Queue' | 'Topic' | 'REST' | 'Queue (Persistent)' | 'EventHub' | 'Webhook' | 'EventGrid' | 'Unknown';
  authType: string;
  connectionMode: string;
  description: string | null;
  messageStepCount: number;
  isManaged: boolean;
  createdOn: string;
  modifiedOn: string;
  sasKeyName: string | null;
  isSasKeySet: boolean;
  solutionNamespace: string | null;
  urlMismatch: boolean;
  sasKeyWarning: boolean;
}

export interface ServiceEndpointsResult {
  endpoints: ServiceEndpoint[];
  summary: {
    total: number;
    byType: Record<string, number>;
    byAuthType: Record<string, number>;
    ootbExcluded?: number;
  };
}

// ============================================================================
// Webhook Registration Types
// ============================================================================

export interface WebhookRegistration {
  id: string;
  name: string;
  endpointUrl: string | null;
  triggerEntity: string;
  triggerMessage: string;
  filteringAttributes: string[];
  asyncMode: boolean;
  stage: 'PreValidation' | 'PreOperation' | 'PostOperation';
  serviceEndpointId: string | null;
  serviceEndpointName: string | null;
  isManaged: boolean;
  statusCode: number;
  enabled: boolean;
}

export interface WebhookRegistrationsResult {
  webhooks: WebhookRegistration[];
  summary: {
    total: number;
    byEntity: Record<string, number>;
    byMessage: Record<string, number>;
    enabledCount: number;
    disabledCount: number;
    ootbExcluded?: number;
  };
}

// ============================================================================
// Flow Complexity Types
// ============================================================================

export interface FlowComplexityAnalysis {
  id: string;
  name: string;
  complexity: FlowComplexityResult;
  connectors: string[];
  triggerType: string;
  state: string;
  urls?: FlowUrlReference[];
  secretWarnings?: SecretWarning[];
  environmentVariables?: string[];
}

export interface FlowComplexityResult_Full {
  flows: FlowComplexityAnalysis[];
  summary: {
    total: number;
    byRiskLevel: Record<RiskLevel, number>;
    averageComplexity: number;
    highRiskFlows: string[];
    flowsWithSecretWarnings?: number;
    totalUrlsFound?: number;
    totalSecretWarnings?: number;
    uniqueEnvironmentVariables?: string[];
    ootbExcluded?: number;
  };
}

// ============================================================================
// Integration Audit Report Types
// ============================================================================

/**
 * What this report's counts are known to cover.
 *
 * Deliberately scoped, and it names its own limits. `pluginAssemblies` is verified
 * against the source because `getPluginAssemblies` pages and reports truncation.
 * `unverified` lists the collections that do not yet, so a reader who sees a
 * completeness block does not assume it covers the whole report - a partial guarantee
 * read as a total one is worse than none.
 */
export interface AuditCompleteness {
  /** The row cap the report asked every collection for. 0 means uncapped. */
  requestedMax: number;
  /** The plugin-assembly inventory, verified against the source. */
  pluginAssemblies: TruncationInfo;
  /**
   * Collections this report caps but cannot yet say anything about, because the
   * methods behind them fetch with `$top` and report no truncation. Recorded in
   * `docs/KNOWN_ISSUES.md`.
   */
  unverified: string[];
}

export interface IntegrationAuditSummary {
  generatedAt: string;
  environment: string;
  /** Flows analysed. Not necessarily every flow in the environment - see `completeness`. */
  flowCount: number;
  /** Assemblies in this report. Read `completeness.pluginAssemblies.totalAvailable` for the population. */
  pluginCount: number;
  webhookCount: number;
  serviceEndpointCount: number;
  overallRiskLevel: RiskLevel;
  completeness: AuditCompleteness;
}

export interface OutboundIntegration {
  serviceEndpoints: ServiceEndpoint[];
  httpFlows: {
    flowId: string;
    flowName: string;
    connectors: string[];
    targetUrls: string[];
  }[];
  externalPlugins: {
    assemblyName: string;
    description: string | null;
    isolationMode: string;
  }[];
}

export interface InboundIntegration {
  webhooks: WebhookRegistration[];
  externalTriggerFlows: {
    flowId: string;
    flowName: string;
    triggerType: string;
  }[];
}

export interface IntegrationAuditReport {
  summary: IntegrationAuditSummary;
  outbound: OutboundIntegration;
  inbound: InboundIntegration;
  complexity: {
    summary: {
      byRiskLevel: Record<RiskLevel, number>;
      averageScore: number;
    };
    highRiskFlows: FlowComplexityAnalysis[];
    allFlows: FlowComplexityAnalysis[];
  };
  plugins: {
    assemblies: unknown[];
    truncation: TruncationInfo;
    byEntity: Record<string, number>;
  };
  riskAssessment: {
    overallRisk: RiskLevel;
    factors: {
      factor: string;
      severity: RiskLevel;
      details: string;
    }[];
    recommendations: string[];
  };
  markdownReport: string;
}

// ============================================================================
// Service Endpoint Validation Types
// ============================================================================

export interface ServiceEndpointSlim {
  id: string;
  name: string;
  url: string;
  namespaceAddress: string | null;
  contractType: string;
  createdOn: string;
  modifiedOn: string;
}

export interface ServiceEndpointValidation {
  endpoint: ServiceEndpointSlim;
  urlIssue: string;
}

export interface ServiceEndpointsValidatedResult {
  flaggedEndpoints: ServiceEndpointValidation[];
  allEndpoints: ServiceEndpointSlim[];
  summary: {
    total: number;
    flagged: number;
    requiredUrlStrings: string[];
  };
}

// ============================================================================
// Environment Variable Types
// ============================================================================

export interface EnvironmentVariable {
  id: string;
  schemaName: string;
  displayName: string;
  type: string;
  currentValue?: string;
  defaultValue?: string;
  effectiveValue?: string;
  description?: string;
  isManaged: boolean;
  isSensitive: boolean;
  maskedValue?: string;
}

export interface DivergingVariable {
  variable: EnvironmentVariable;
  reason: string;
}

export interface EnvironmentVariablesResult {
  divergingVariables: DivergingVariable[];
  allVariables: EnvironmentVariable[];
  summary: {
    total: number;
    diverging: number;
    byType: Record<string, number>;
    ootbExcluded?: number;
  };
}

// ============================================================================
// Contract Type Mappings
// ============================================================================

const CONTRACT_TYPES: Record<number, string> = {
  1: 'OneWay',
  2: 'Queue',
  3: 'REST',
  4: 'TwoWay',
  5: 'Topic',
  6: 'Queue (Persistent)',
  7: 'EventHub',
  8: 'Webhook',
  9: 'EventGrid',
};

const AUTH_TYPES: Record<number, string> = {
  1: 'Anonymous',
  2: 'HttpHeader',
  3: 'HttpQueryString',
  4: 'WebKey',
  5: 'SASKey',
  6: 'AzureKey',
  7: 'Certificate',
};

const CONNECTION_MODES: Record<number, string> = {
  1: 'Normal',
  2: 'FederatedServiceAccount',
};

const STAGE_NAMES: Record<number, string> = {
  10: 'PreValidation',
  20: 'PreOperation',
  40: 'PostOperation',
};

const SENSITIVE_NAME_PATTERNS = /secret|password|apikey|api_?key|token|connection_?string|saskey|sas_?key|credential|function_?key|functions_?key|functionapp_?key/i;
const SENSITIVE_VALUE_PATTERNS = /SharedAccessKey=|AccountKey=|[?&]code=[A-Za-z0-9+/=_-]{20,}|sig=[A-Za-z0-9%+/=]{20,}/i;

/**
 * Collections `generateAuditReport` caps but cannot yet vouch for.
 *
 * `getServiceEndpoints`, `getWebhookRegistrations` and `getEnvironmentVariables` all fetch
 * with `$top=${maxRecords}` and return no truncation information, so the report has nothing
 * to read. Naming them is the honest alternative to a completeness block that quietly covers
 * one collection out of four. Recorded in `docs/KNOWN_ISSUES.md`.
 */
const UNVERIFIED_AUDIT_COLLECTIONS = [
  'serviceEndpoints',
  'webhooks',
  'environmentVariables',
  'flows',
];

// ============================================================================
// IntegrationAuditService
// ============================================================================

export class IntegrationAuditService {
  private flowService: FlowService;
  private pluginService: PluginService;

  constructor(private client: PowerPlatformClient) {
    this.flowService = new FlowService(client);
    this.pluginService = new PluginService(client);
  }

  /**
   * Get all service endpoints (webhook/Azure/REST) in the environment
   */
  async getServiceEndpoints(
    maxRecords: number = 100,
    excludeOotb: boolean = true
  ): Promise<ServiceEndpointsResult> {
    // Query the serviceendpoint table
    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/serviceendpoints?$select=serviceendpointid,name,url,namespaceaddress,path,contract,authtype,connectionmode,description,ismanaged,createdon,modifiedon,saskeyname,issaskeyset,solutionnamespace&$orderby=name&$top=${maxRecords}`
    );

    // Get SDK message step counts for each endpoint
    const stepCounts = new Map<string, number>();
    try {
      const stepsResponse = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/sdkmessageprocessingsteps?$filter=_eventhandler_value ne null&$select=_eventhandler_value&$top=5000`
      );

      for (const step of stepsResponse.value) {
        const endpointId = step._eventhandler_value as string;
        if (endpointId) {
          stepCounts.set(endpointId, (stepCounts.get(endpointId) || 0) + 1);
        }
      }
    } catch {
      // Continue without step counts if query fails
    }

    const endpoints: ServiceEndpoint[] = response.value.map((ep) => {
      const contractNum = ep.contract as number;
      const authNum = ep.authtype as number;
      const connModeNum = ep.connectionmode as number;
      const contractLabel = (CONTRACT_TYPES[contractNum] || 'Unknown') as ServiceEndpoint['contractType'];
      const namespaceAddr = (ep.namespaceaddress as string) || null;
      const url = (ep.url as string) || '';

      // Detect url vs namespaceaddress mismatch for SB contracts
      const isSbContract = ['Queue', 'Queue (Persistent)', 'Topic', 'EventHub'].includes(contractLabel);
      const urlMismatch = isSbContract && !!namespaceAddr && !!url && namespaceAddr !== url;

      // Detect SAS key not set when authType is SASKey
      const isSasKeySet = ep.issaskeyset as boolean ?? false;
      const sasKeyWarning = authNum === 5 && !isSasKeySet; // 5 = SASKey

      return {
        id: ep.serviceendpointid as string,
        name: ep.name as string,
        url,
        namespaceAddress: namespaceAddr,
        path: (ep.path as string) || null,
        contractType: contractLabel,
        authType: AUTH_TYPES[authNum] || `Unknown (${authNum})`,
        connectionMode: CONNECTION_MODES[connModeNum] || `Unknown (${connModeNum})`,
        description: (ep.description as string) || null,
        messageStepCount: stepCounts.get(ep.serviceendpointid as string) || 0,
        isManaged: ep.ismanaged as boolean,
        createdOn: ep.createdon as string,
        modifiedOn: ep.modifiedon as string,
        sasKeyName: (ep.saskeyname as string) || null,
        isSasKeySet,
        solutionNamespace: (ep.solutionnamespace as string) || null,
        urlMismatch,
        sasKeyWarning,
      };
    });

    // Apply OOTB exclusion
    let finalEndpoints = endpoints;
    let ootbExcluded = 0;
    if (excludeOotb) {
      const result = filterOotb(endpoints, isOotbServiceEndpoint);
      finalEndpoints = result.filtered;
      ootbExcluded = result.excludedCount;
    }

    // Build summary from filtered list
    const byType: Record<string, number> = {};
    const byAuthType: Record<string, number> = {};

    for (const ep of finalEndpoints) {
      byType[ep.contractType] = (byType[ep.contractType] || 0) + 1;
      byAuthType[ep.authType] = (byAuthType[ep.authType] || 0) + 1;
    }

    return {
      endpoints: finalEndpoints,
      summary: {
        total: finalEndpoints.length,
        byType,
        byAuthType,
        ...(ootbExcluded > 0 ? { ootbExcluded } : {}),
      },
    };
  }

  /**
   * Get service endpoints with URL validation against required patterns
   */
  async getServiceEndpointsValidated(
    maxRecords: number = 100,
    requiredUrlStrings?: string[],
    excludeOotb: boolean = true
  ): Promise<ServiceEndpointsValidatedResult> {
    const result = await this.getServiceEndpoints(maxRecords, excludeOotb);

    const allEndpoints: ServiceEndpointSlim[] = result.endpoints.map((ep) => ({
      id: ep.id,
      name: ep.name,
      url: ep.url,
      namespaceAddress: ep.namespaceAddress,
      contractType: ep.contractType,
      createdOn: ep.createdOn,
      modifiedOn: ep.modifiedOn,
    }));

    const flaggedEndpoints: ServiceEndpointValidation[] = [];

    if (requiredUrlStrings && requiredUrlStrings.length > 0) {
      const SB_CONTRACTS = ['Queue', 'Queue (Persistent)', 'Topic', 'EventHub'];
      for (const ep of allEndpoints) {
        // For SB contracts, validate namespaceAddress (runtime-authoritative)
        // For other contracts, validate url
        const isSb = SB_CONTRACTS.includes(ep.contractType);
        const urlToValidate = isSb ? (ep.namespaceAddress || ep.url) : ep.url;
        if (!urlToValidate) continue;
        const matches = requiredUrlStrings.some((pattern) =>
          urlToValidate.toLowerCase().includes(pattern.toLowerCase())
        );
        if (!matches) {
          flaggedEndpoints.push({
            endpoint: ep,
            urlIssue: isSb
              ? `Namespace address does not match any required pattern: ${requiredUrlStrings.join(', ')}`
              : `URL does not match any required pattern: ${requiredUrlStrings.join(', ')}`,
          });
        }
      }
    }

    return {
      flaggedEndpoints,
      allEndpoints,
      summary: {
        total: allEndpoints.length,
        flagged: flaggedEndpoints.length,
        requiredUrlStrings: requiredUrlStrings || [],
      },
    };
  }

  /**
   * Query environment variable definitions from the environment
   */
  async getEnvironmentVariables(
    maxRecords: number = 500,
    requiredUrlStrings?: string[],
    excludeOotb: boolean = true
  ): Promise<EnvironmentVariablesResult> {
    const ENV_VAR_TYPES: Record<number, string> = {
      100000000: 'String',
      100000001: 'Number',
      100000002: 'Boolean',
      100000003: 'JSON',
      100000004: 'Data Source',
      100000005: 'Secret',
    };

    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/environmentvariabledefinitions?$select=environmentvariabledefinitionid,schemaname,displayname,type,defaultvalue,description,ismanaged&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)&$orderby=schemaname&$top=${maxRecords}`
    );

    const allVariables: EnvironmentVariable[] = response.value.map((ev) => {
      const typeNum = ev.type as number;
      const schemaName = ev.schemaname as string;
      // Determine if sensitive: type 100000005 = Secret type
      const isSecretType = typeNum === 100000005;
      const isNameSensitive = SENSITIVE_NAME_PATTERNS.test(schemaName);

      const values = ev.environmentvariabledefinition_environmentvariablevalue as Record<string, unknown>[] | null;
      const currentValue = values && values.length > 0
        ? (values[0].value as string)
        : undefined;
      const defaultValue = (ev.defaultvalue as string) || undefined;
      const effectiveValue = currentValue ?? defaultValue;

      // Value-based detection: catch secrets embedded in values (e.g. SharedAccessKey, Azure Function keys)
      const isValueSensitive = !!effectiveValue && SENSITIVE_VALUE_PATTERNS.test(effectiveValue);
      const isSensitive = isSecretType || isNameSensitive || isValueSensitive;

      return {
        id: ev.environmentvariabledefinitionid as string,
        schemaName,
        displayName: (ev.displayname as string) || schemaName,
        type: ENV_VAR_TYPES[typeNum] || `Unknown (${typeNum})`,
        currentValue,
        defaultValue,
        effectiveValue,
        description: (ev.description as string) || undefined,
        isManaged: ev.ismanaged as boolean,
        isSensitive,
        maskedValue: isSensitive ? '***' : undefined,
      };
    });

    // Apply OOTB exclusion
    let finalVariables = allVariables;
    let ootbExcluded = 0;
    if (excludeOotb) {
      const result = filterOotb(allVariables, isOotbEnvVar);
      finalVariables = result.filtered;
      ootbExcluded = result.excludedCount;
    }

    // Check for diverging variables (URL values not matching required patterns)
    const divergingVariables: DivergingVariable[] = [];
    if (requiredUrlStrings && requiredUrlStrings.length > 0) {
      for (const v of finalVariables) {
        if (!v.effectiveValue) continue;
        // Only check string-type variables that look like URLs
        if (v.type !== 'String' || !v.effectiveValue.includes('://')) continue;
        const matches = requiredUrlStrings.some((pattern) =>
          v.effectiveValue!.toLowerCase().includes(pattern.toLowerCase())
        );
        if (!matches) {
          divergingVariables.push({
            variable: v,
            reason: `Value does not match any required pattern: ${requiredUrlStrings.join(', ')}`,
          });
        }
      }
    }

    const byType: Record<string, number> = {};
    for (const v of finalVariables) {
      byType[v.type] = (byType[v.type] || 0) + 1;
    }

    return {
      divergingVariables,
      allVariables: finalVariables,
      summary: {
        total: finalVariables.length,
        diverging: divergingVariables.length,
        byType,
        ...(ootbExcluded > 0 ? { ootbExcluded } : {}),
      },
    };
  }

  /**
   * Query environment variables and return as a Map for flow URL resolution
   */
  async queryEnvironmentVariables(): Promise<Map<string, string>> {
    const result = await this.getEnvironmentVariables(500);
    const map = new Map<string, string>();
    for (const v of result.allVariables) {
      if (v.effectiveValue) {
        map.set(v.schemaName, v.effectiveValue);
      }
    }
    return map;
  }

  /**
   * Get all webhook-type SDK message processing steps
   */
  async getWebhookRegistrations(
    maxRecords: number = 100,
    excludeOotb: boolean = true
  ): Promise<WebhookRegistrationsResult> {
    // Query SDK message processing steps that have an event handler (service endpoint)
    // or are specifically configured as webhooks
    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/sdkmessageprocessingsteps?$filter=_eventhandler_value ne null&$select=sdkmessageprocessingstepid,name,stage,mode,statuscode,filteringattributes,_eventhandler_value,ismanaged&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode),eventhandler_serviceendpoint($select=name,url)&$orderby=name&$top=${maxRecords}`
    );

    const webhooks: WebhookRegistration[] = response.value.map((step) => {
      const stageNum = step.stage as number;
      const serviceEndpoint = step.eventhandler_serviceendpoint as Record<string, unknown> | null;

      return {
        id: step.sdkmessageprocessingstepid as string,
        name: step.name as string,
        endpointUrl: serviceEndpoint?.url as string | null,
        triggerEntity: (step.sdkmessagefilterid as { primaryobjecttypecode?: string })?.primaryobjecttypecode || 'none',
        triggerMessage: (step.sdkmessageid as { name?: string })?.name || 'Unknown',
        filteringAttributes: step.filteringattributes
          ? (step.filteringattributes as string).split(',')
          : [],
        asyncMode: (step.mode as number) === 1,
        stage: (STAGE_NAMES[stageNum] || 'Unknown') as WebhookRegistration['stage'],
        serviceEndpointId: step._eventhandler_value as string | null,
        serviceEndpointName: serviceEndpoint?.name as string | null,
        isManaged: step.ismanaged as boolean,
        statusCode: step.statuscode as number,
        enabled: (step.statuscode as number) === 1,
      };
    });

    // Apply OOTB exclusion
    let finalWebhooks = webhooks;
    let ootbExcluded = 0;
    if (excludeOotb) {
      const result = filterOotb(webhooks, isOotbWebhook);
      finalWebhooks = result.filtered;
      ootbExcluded = result.excludedCount;
    }

    // Build summary from filtered list
    const byEntity: Record<string, number> = {};
    const byMessage: Record<string, number> = {};
    let enabledCount = 0;
    let disabledCount = 0;

    for (const wh of finalWebhooks) {
      byEntity[wh.triggerEntity] = (byEntity[wh.triggerEntity] || 0) + 1;
      byMessage[wh.triggerMessage] = (byMessage[wh.triggerMessage] || 0) + 1;
      if (wh.enabled) {
        enabledCount++;
      } else {
        disabledCount++;
      }
    }

    return {
      webhooks: finalWebhooks,
      summary: {
        total: finalWebhooks.length,
        byEntity,
        byMessage,
        enabledCount,
        disabledCount,
        ...(ootbExcluded > 0 ? { ootbExcluded } : {}),
      },
    };
  }

  /**
   * Analyze flow complexity for one or all flows
   */
  async analyzeFlowComplexity(
    flowId?: string,
    maxFlows: number = 0,
    excludeOotb: boolean = true
  ): Promise<FlowComplexityResult_Full> {
    const analyses: FlowComplexityAnalysis[] = [];
    let ootbExcluded = 0;

    // Query env vars once for URL resolution
    let envVarMap: Map<string, string> | undefined;
    try {
      envVarMap = await this.queryEnvironmentVariables();
    } catch {
      // Continue without env var resolution
    }

    if (flowId) {
      // Analyze single flow
      const flowDef = await this.flowService.getFlowDefinition(flowId, false) as Record<string, unknown>;
      const flowDefinition = flowDef.flowDefinition as Record<string, unknown>;

      if (flowDefinition) {
        const complexity = calculateFlowComplexity(flowDefinition);
        const summary = this.flowService.parseFlowSummary(flowDefinition);
        const urls = extractUrlsFromFlowDefinition(flowDefinition, envVarMap);
        const secretWarnings = detectHardcodedSecrets(flowDefinition);
        const envVars = urls
          .filter((u) => u.environmentVariable)
          .map((u) => u.environmentVariable!);

        analyses.push({
          id: flowId,
          name: flowDef.name as string,
          complexity,
          connectors: summary.connectors as string[],
          triggerType: summary.triggerInfo as string,
          state: flowDef.state as string,
          urls,
          secretWarnings: secretWarnings.length > 0 ? secretWarnings : undefined,
          environmentVariables: envVars.length > 0 ? [...new Set(envVars)] : undefined,
        });
      }
    } else {
      // Analyze all flows; maxFlows=0 means unlimited (use 5000 as safe upper bound)
      const effectiveMax = maxFlows === 0 ? 5000 : maxFlows;
      const flowsResult = await this.flowService.getFlows({
        maxRecords: effectiveMax,
        excludeCustomerInsights: true,
        excludeSystem: true,
        excludeCopilotSales: true,
      });

      for (const flow of flowsResult.flows) {
        // Skip managed (OOTB) flows when excludeOotb is enabled
        if (excludeOotb && flow.isManaged) {
          ootbExcluded++;
          continue;
        }

        try {
          const flowDef = await this.flowService.getFlowDefinition(
            flow.workflowid,
            false
          ) as Record<string, unknown>;
          const flowDefinition = flowDef.flowDefinition as Record<string, unknown>;

          if (flowDefinition) {
            const complexity = calculateFlowComplexity(flowDefinition);
            const summary = this.flowService.parseFlowSummary(flowDefinition);
            const urls = extractUrlsFromFlowDefinition(flowDefinition, envVarMap);
            const secretWarnings = detectHardcodedSecrets(flowDefinition);
            const envVars = urls
              .filter((u) => u.environmentVariable)
              .map((u) => u.environmentVariable!);

            analyses.push({
              id: flow.workflowid,
              name: flow.name,
              complexity,
              connectors: summary.connectors as string[],
              triggerType: summary.triggerInfo as string,
              state: flow.state,
              urls,
              secretWarnings: secretWarnings.length > 0 ? secretWarnings : undefined,
              environmentVariables: envVars.length > 0 ? [...new Set(envVars)] : undefined,
            });
          }
        } catch {
          // Skip flows that fail to parse
        }
      }
    }

    // Calculate summary
    const byRiskLevel: Record<RiskLevel, number> = {
      Low: 0,
      Medium: 0,
      High: 0,
      Critical: 0,
    };

    let totalScore = 0;
    const highRiskFlows: string[] = [];
    let flowsWithSecretWarnings = 0;
    let totalUrlsFound = 0;
    let totalSecretWarnings = 0;
    const allEnvVars = new Set<string>();

    for (const analysis of analyses) {
      byRiskLevel[analysis.complexity.riskLevel]++;
      totalScore += analysis.complexity.score;

      if (
        analysis.complexity.riskLevel === 'High' ||
        analysis.complexity.riskLevel === 'Critical'
      ) {
        highRiskFlows.push(analysis.name);
      }

      if (analysis.urls) {
        totalUrlsFound += analysis.urls.length;
      }
      if (analysis.secretWarnings && analysis.secretWarnings.length > 0) {
        flowsWithSecretWarnings++;
        totalSecretWarnings += analysis.secretWarnings.length;
      }
      if (analysis.environmentVariables) {
        for (const ev of analysis.environmentVariables) {
          allEnvVars.add(ev);
        }
      }
    }

    return {
      flows: analyses,
      summary: {
        total: analyses.length,
        byRiskLevel,
        averageComplexity:
          analyses.length > 0 ? Math.round(totalScore / analyses.length) : 0,
        highRiskFlows,
        flowsWithSecretWarnings,
        totalUrlsFound,
        totalSecretWarnings,
        uniqueEnvironmentVariables: [...allEnvVars],
        ...(ootbExcluded > 0 ? { ootbExcluded } : {}),
      },
    };
  }

  /**
   * Generate a comprehensive integration audit report
   */
  async generateAuditReport(
    maxFlows: number = 0,
    requiredUrlStrings?: string[],
    outputFormat?: 'summary' | 'full',
    excludeOotb: boolean = true,
    maxRecords: number = 100
  ): Promise<IntegrationAuditReport> {
    // Gather all data in parallel where possible
    const [
      endpointsResult,
      webhooksResult,
      complexityResult,
      pluginAssemblies,
      envVarsResult,
    ] = await Promise.all([
      this.getServiceEndpoints(maxRecords, excludeOotb),
      this.getWebhookRegistrations(maxRecords, excludeOotb),
      this.analyzeFlowComplexity(undefined, maxFlows, excludeOotb),
      this.pluginService.getPluginAssemblies(false, maxRecords),
      this.getEnvironmentVariables(500, requiredUrlStrings, excludeOotb).catch(() => undefined),
    ]);

    // Identify HTTP flows - populate targetUrls from URL extraction
    const httpFlows = complexityResult.flows
      .filter((f) => f.complexity.flags.usesHttp)
      .map((f) => ({
        flowId: f.id,
        flowName: f.name,
        connectors: f.connectors,
        targetUrls: (f.urls || [])
          .filter((u) => u.source === 'http-action')
          .map((u) => u.url),
      }));

    // Identify external trigger flows
    const externalTriggerFlows = complexityResult.flows
      .filter((f) => f.complexity.flags.hasExternalTrigger)
      .map((f) => ({
        flowId: f.id,
        flowName: f.name,
        triggerType: f.triggerType,
      }));

    // External plugins (sandbox/external isolation mode). Typed rather than cast to
    // `Record<string, unknown>`: the cast is what let `description` be read off a shape
    // that never carried it, so every assembly reported a null description.
    const externalPlugins = pluginAssemblies.assemblies
      .filter((p) => p.isolationMode === 'Sandbox' || p.isolationMode === 'External')
      .map((p) => ({
        assemblyName: p.name as string,
        description: (p.description as string) || null,
        isolationMode: p.isolationMode,
      }));

    // Plugin by entity (simplified - would need more queries for full data)
    const pluginByEntity: Record<string, number> = {};

    // Risk assessment
    const riskFactors: { factor: string; severity: RiskLevel; details: string }[] = [];
    const recommendations: string[] = [];

    // Assess risks
    if (endpointsResult.summary.total > 0) {
      riskFactors.push({
        factor: 'Service Endpoints',
        severity: 'Medium',
        details: `${endpointsResult.summary.total} external service endpoint(s) configured`,
      });
    }

    if (webhooksResult.summary.total > 0) {
      riskFactors.push({
        factor: 'Webhooks',
        severity: 'Medium',
        details: `${webhooksResult.summary.total} webhook registration(s) found`,
      });
    }

    if (httpFlows.length > 0) {
      riskFactors.push({
        factor: 'HTTP Flows',
        severity: 'High',
        details: `${httpFlows.length} flow(s) making HTTP/REST calls to external systems`,
      });
      recommendations.push('Review HTTP flows for proper error handling and retry logic');
    }

    const criticalFlows = complexityResult.summary.byRiskLevel['Critical'] || 0;
    const highRiskFlowCount = complexityResult.summary.byRiskLevel['High'] || 0;

    if (criticalFlows > 0) {
      riskFactors.push({
        factor: 'Critical Complexity Flows',
        severity: 'Critical',
        details: `${criticalFlows} flow(s) with critical complexity score (>100)`,
      });
      recommendations.push('Consider refactoring critical complexity flows into smaller, modular flows');
    }

    if (highRiskFlowCount > 0) {
      riskFactors.push({
        factor: 'High Complexity Flows',
        severity: 'High',
        details: `${highRiskFlowCount} flow(s) with high complexity score (51-100)`,
      });
    }

    if ((complexityResult.summary.totalSecretWarnings ?? 0) > 0) {
      riskFactors.push({
        factor: 'Hardcoded Secrets',
        severity: 'Critical',
        details: `${complexityResult.summary.totalSecretWarnings} hardcoded secret(s) found in ${complexityResult.summary.flowsWithSecretWarnings} flow(s)`,
      });
      recommendations.push('Replace hardcoded secrets with environment variables or secure input parameters');
    }

    const sensitiveEnvVarCount = envVarsResult?.allVariables.filter(v => v.isSensitive).length ?? 0;
    if (sensitiveEnvVarCount > 0) {
      riskFactors.push({
        factor: 'Sensitive Environment Variables',
        severity: 'Medium',
        details: `${sensitiveEnvVarCount} environment variable(s) contain sensitive values (secrets, keys, tokens). Values are masked in this report.`,
      });
      recommendations.push('Consider using Dataverse Secret-type environment variables instead of String-type for sensitive values');
    }

    // Determine overall risk level
    let overallRisk: RiskLevel = 'Low';
    if (riskFactors.some((f) => f.severity === 'Critical')) {
      overallRisk = 'Critical';
    } else if (riskFactors.some((f) => f.severity === 'High')) {
      overallRisk = 'High';
    } else if (riskFactors.some((f) => f.severity === 'Medium')) {
      overallRisk = 'Medium';
    }

    // Validate endpoints against required URL patterns
    let divergingEndpoints: ServiceEndpointValidation[] | undefined;
    if (requiredUrlStrings && requiredUrlStrings.length > 0) {
      const validated = await this.getServiceEndpointsValidated(100, requiredUrlStrings, excludeOotb);
      divergingEndpoints = validated.flaggedEndpoints;
    }

    // Collect flow secret warnings and URLs for the report
    const flowSecretWarnings = complexityResult.flows
      .filter((f) => f.secretWarnings && f.secretWarnings.length > 0)
      .map((f) => ({ flowName: f.name, warnings: f.secretWarnings! }));

    const flowUrls = complexityResult.flows
      .filter((f) => f.urls && f.urls.length > 0)
      .map((f) => ({ flowName: f.name, urls: f.urls! }));

    const completeness: AuditCompleteness = {
      requestedMax: maxRecords,
      pluginAssemblies: pluginAssemblies.truncation,
      unverified: UNVERIFIED_AUDIT_COLLECTIONS,
    };

    // Generate markdown report using extracted formatter
    const markdownReport = generateAuditMarkdownReport({
      completeness,
      environment: this.client.getOrganizationUrl(),
      endpointsResult,
      webhooksResult,
      complexityResult,
      httpFlows,
      externalTriggerFlows,
      externalPlugins,
      pluginAssemblies,
      riskFactors,
      recommendations,
      overallRisk,
      requiredUrlStrings,
      environmentVariables: envVarsResult?.allVariables,
      divergingEnvVars: envVarsResult?.divergingVariables,
      divergingEndpoints,
      flowSecretWarnings: flowSecretWarnings.length > 0 ? flowSecretWarnings : undefined,
      flowUrls: flowUrls.length > 0 ? flowUrls : undefined,
      outputFormat,
      ootbExclusion: excludeOotb ? {
        endpointsExcluded: endpointsResult.summary.ootbExcluded ?? 0,
        webhooksExcluded: webhooksResult.summary.ootbExcluded ?? 0,
        envVarsExcluded: envVarsResult?.summary.ootbExcluded ?? 0,
        flowsExcluded: complexityResult.summary.ootbExcluded ?? 0,
      } : undefined,
    });

    return {
      summary: {
        generatedAt: new Date().toISOString(),
        environment: this.client.getOrganizationUrl(),
        flowCount: complexityResult.summary.total,
        pluginCount: pluginAssemblies.totalCount,
        webhookCount: webhooksResult.summary.total,
        serviceEndpointCount: endpointsResult.summary.total,
        overallRiskLevel: overallRisk,
        completeness,
      },
      outbound: {
        serviceEndpoints: endpointsResult.endpoints,
        httpFlows,
        externalPlugins,
      },
      inbound: {
        webhooks: webhooksResult.webhooks,
        externalTriggerFlows,
      },
      complexity: {
        summary: {
          byRiskLevel: complexityResult.summary.byRiskLevel,
          averageScore: complexityResult.summary.averageComplexity,
        },
        highRiskFlows: complexityResult.flows.filter(
          (f) =>
            f.complexity.riskLevel === 'High' ||
            f.complexity.riskLevel === 'Critical'
        ),
        allFlows: complexityResult.flows,
      },
      plugins: {
        assemblies: pluginAssemblies.assemblies,
        truncation: pluginAssemblies.truncation,
        byEntity: pluginByEntity,
      },
      riskAssessment: {
        overallRisk,
        factors: riskFactors,
        recommendations,
      },
      markdownReport,
    };
  }
}
