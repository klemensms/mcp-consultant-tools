/**
 * Flow Complexity Calculator
 *
 * Calculates complexity scores for Power Automate flows based on:
 * - Action count (base complexity)
 * - Unique connectors (integration surface)
 * - HTTP/REST connectors (external dependency risk)
 * - Premium connectors (licensing/cost concern)
 * - Conditions and switches (logic complexity)
 * - Loops (iteration complexity)
 * - Parallel branches (execution complexity)
 * - Error handling scopes (sophistication indicator)
 */

export interface FlowComplexityBreakdown {
  actionCount: number;
  uniqueConnectors: number;
  httpConnectors: number;
  premiumConnectors: number;
  conditions: number;
  loops: number;
  parallelBranches: number;
  errorScopes: number;
}

export interface FlowComplexityFlags {
  usesHttp: boolean;
  usesPremium: boolean;
  hasErrorHandling: boolean;
  hasExternalTrigger: boolean;
  hasParallelExecution: boolean;
}

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface FlowComplexityResult {
  score: number;
  riskLevel: RiskLevel;
  breakdown: FlowComplexityBreakdown;
  flags: FlowComplexityFlags;
}

/**
 * Premium connector identifiers (partial list - common ones)
 */
const PREMIUM_CONNECTORS = new Set([
  'sql',
  'azuresql',
  'oracle',
  'salesforce',
  'servicenow',
  'sap',
  'dynamics365',
  'dynamics365bc',
  'commondataserviceforapps',
  'dataverse',
  'azureblob',
  'azuretables',
  'azurequeues',
  'azuread',
  'azureautomation',
  'azureeventgrid',
  'azuremaps',
  'cognitiveservices',
  'powerappsforadmins',
  'powerplatformforadmins',
  'http',
  'httpwebhook',
]);

/**
 * HTTP/REST connector identifiers
 */
const HTTP_CONNECTORS = new Set([
  'http',
  'httpwebhook',
  'httprequest',
  'custom',
]);

/**
 * External trigger types that indicate inbound integrations
 */
const EXTERNAL_TRIGGER_TYPES = new Set([
  'Request',
  'HttpTrigger',
  'OpenApiConnectionWebhook',
  'ApiConnectionWebhook',
  'Webhook',
]);

/**
 * Complexity scoring weights
 */
const WEIGHTS = {
  actionBase: 1,
  uniqueConnector: 2,
  httpConnector: 5,
  premiumConnector: 3,
  condition: 2,
  loop: 3,
  parallelBranch: 3,
  errorScope: 1,
};

/**
 * Risk level thresholds
 */
const RISK_THRESHOLDS = {
  low: 20,
  medium: 50,
  high: 100,
  // Anything above 100 is Critical
};

/**
 * Calculate risk level from complexity score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score <= RISK_THRESHOLDS.low) return 'Low';
  if (score <= RISK_THRESHOLDS.medium) return 'Medium';
  if (score <= RISK_THRESHOLDS.high) return 'High';
  return 'Critical';
}

/**
 * Extract complexity factors from a parsed flow definition
 */
export function extractComplexityFactors(
  flowDefinition: Record<string, unknown>
): FlowComplexityBreakdown {
  const breakdown: FlowComplexityBreakdown = {
    actionCount: 0,
    uniqueConnectors: 0,
    httpConnectors: 0,
    premiumConnectors: 0,
    conditions: 0,
    loops: 0,
    parallelBranches: 0,
    errorScopes: 0,
  };

  const connectors = new Set<string>();
  const httpConnectorsFound = new Set<string>();
  const premiumConnectorsFound = new Set<string>();

  try {
    const properties = flowDefinition.properties as Record<string, unknown>;
    const definition = properties?.definition as Record<string, unknown>;

    if (!definition?.actions) {
      return breakdown;
    }

    // Recursive function to process actions
    const processActions = (
      actions: Record<string, unknown>,
      inParallel: boolean = false
    ) => {
      const actionKeys = Object.keys(actions);

      // Check for parallel branches (multiple actions without runAfter dependencies)
      const topLevelActions = actionKeys.filter((key) => {
        const action = actions[key] as Record<string, unknown>;
        const runAfter = action.runAfter as Record<string, unknown[]> | undefined;
        return !runAfter || Object.keys(runAfter).length === 0;
      });
      if (topLevelActions.length > 1) {
        breakdown.parallelBranches += topLevelActions.length - 1;
      }

      for (const actionName of actionKeys) {
        const action = actions[actionName] as Record<string, unknown>;
        const actionType = ((action.type as string) || '').toLowerCase();

        breakdown.actionCount++;

        // Check for conditions
        if (actionType === 'if' || actionType === 'switch') {
          breakdown.conditions++;
        }

        // Check for loops
        if (actionType === 'foreach' || actionType === 'until') {
          breakdown.loops++;
        }

        // Check for error handling scopes
        const runAfter = action.runAfter as Record<string, unknown[]>;
        if (
          actionType === 'scope' &&
          runAfter &&
          Object.values(runAfter).some((r) => r.includes('Failed'))
        ) {
          breakdown.errorScopes++;
        }

        // Extract connector information
        if (
          action.type === 'OpenApiConnection' ||
          action.type === 'ApiConnection' ||
          action.type === 'Http'
        ) {
          const inputs = action.inputs as Record<string, unknown>;
          const host = inputs?.host as Record<string, unknown>;
          const connectorId =
            (host?.connectionName as string) ||
            (host?.apiId as string) ||
            ((action.metadata as Record<string, unknown>)
              ?.operationMetadataId as string);

          if (connectorId) {
            const connectorName = connectorId.split('/').pop()?.toLowerCase() || connectorId.toLowerCase();
            connectors.add(connectorName);

            if (HTTP_CONNECTORS.has(connectorName)) {
              httpConnectorsFound.add(connectorName);
            }
            if (PREMIUM_CONNECTORS.has(connectorName)) {
              premiumConnectorsFound.add(connectorName);
            }
          }
        }

        // Handle HTTP action type directly
        if (actionType === 'http') {
          httpConnectorsFound.add('http');
          connectors.add('http');
        }

        // Recurse into nested actions
        if (action.actions) {
          processActions(action.actions as Record<string, unknown>);
        }
        if (action.then) {
          processActions(action.then as Record<string, unknown>);
        }
        if (action.else) {
          processActions(action.else as Record<string, unknown>);
        }
        if (action.cases) {
          for (const [, caseActions] of Object.entries(
            action.cases as Record<string, unknown>
          )) {
            const caseData = caseActions as Record<string, unknown>;
            if (caseData.actions) {
              processActions(caseData.actions as Record<string, unknown>);
            }
          }
        }
        if (action.default) {
          const defaultData = action.default as Record<string, unknown>;
          if (defaultData.actions) {
            processActions(defaultData.actions as Record<string, unknown>);
          }
        }
      }
    };

    processActions(definition.actions as Record<string, unknown>);

    breakdown.uniqueConnectors = connectors.size;
    breakdown.httpConnectors = httpConnectorsFound.size;
    breakdown.premiumConnectors = premiumConnectorsFound.size;
  } catch {
    // Return partial breakdown on parse errors
  }

  return breakdown;
}

/**
 * Extract complexity flags from a parsed flow definition
 */
export function extractComplexityFlags(
  flowDefinition: Record<string, unknown>,
  breakdown: FlowComplexityBreakdown
): FlowComplexityFlags {
  const flags: FlowComplexityFlags = {
    usesHttp: breakdown.httpConnectors > 0,
    usesPremium: breakdown.premiumConnectors > 0,
    hasErrorHandling: breakdown.errorScopes > 0,
    hasExternalTrigger: false,
    hasParallelExecution: breakdown.parallelBranches > 0,
  };

  try {
    const properties = flowDefinition.properties as Record<string, unknown>;
    const definition = properties?.definition as Record<string, unknown>;

    if (definition?.triggers) {
      const triggers = definition.triggers as Record<string, unknown>;
      const triggerNames = Object.keys(triggers);
      if (triggerNames.length > 0) {
        const trigger = triggers[triggerNames[0]] as Record<string, unknown>;
        const triggerType = (trigger.type as string) || '';
        flags.hasExternalTrigger = EXTERNAL_TRIGGER_TYPES.has(triggerType);
      }
    }
  } catch {
    // Return partial flags on parse errors
  }

  return flags;
}

/**
 * Calculate complexity score from breakdown
 */
export function calculateComplexityScore(
  breakdown: FlowComplexityBreakdown
): number {
  return (
    breakdown.actionCount * WEIGHTS.actionBase +
    breakdown.uniqueConnectors * WEIGHTS.uniqueConnector +
    breakdown.httpConnectors * WEIGHTS.httpConnector +
    breakdown.premiumConnectors * WEIGHTS.premiumConnector +
    breakdown.conditions * WEIGHTS.condition +
    breakdown.loops * WEIGHTS.loop +
    breakdown.parallelBranches * WEIGHTS.parallelBranch +
    breakdown.errorScopes * WEIGHTS.errorScope
  );
}

/**
 * Calculate full flow complexity from a parsed flow definition
 */
export function calculateFlowComplexity(
  flowDefinition: Record<string, unknown>
): FlowComplexityResult {
  const breakdown = extractComplexityFactors(flowDefinition);
  const score = calculateComplexityScore(breakdown);
  const riskLevel = getRiskLevel(score);
  const flags = extractComplexityFlags(flowDefinition, breakdown);

  return {
    score,
    riskLevel,
    breakdown,
    flags,
  };
}
