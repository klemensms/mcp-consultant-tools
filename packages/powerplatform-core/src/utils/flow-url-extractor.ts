/**
 * Flow URL Extractor & Secret Detector
 *
 * Extracts URL references from Power Automate flow definitions and
 * detects hardcoded secrets that should use environment variables
 * or secure inputs instead.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface FlowUrlReference {
  actionName: string;
  url: string;
  environmentVariable?: string;
  environmentVariableValue?: string;
  source: 'http-action' | 'openapi-connection' | 'trigger' | 'parameter';
}

export interface SecretWarning {
  actionName: string;
  fieldPath: string;
  warningType: 'hardcoded-secret';
  message: string;
}

// ---------------------------------------------------------------------------
// Regex for secret-like input keys
// ---------------------------------------------------------------------------

const SECRET_KEY_PATTERN =
  /client_secret|clientSecret|password|api_key|apiKey|secret|authorization/i;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to extract an environment variable name from a Power Automate
 * parameter expression such as:
 *   @parameters('new_MyEnvVar')
 *   @{parameters('new_MyEnvVar')}
 */
function extractEnvVarName(expression: string): string | undefined {
  const match = expression.match(
    /@\{?parameters\(\s*'([^']+)'\s*\)\}?/
  );
  return match ? match[1] : undefined;
}

/**
 * Resolve a URL that may be a parameter expression.
 * Returns the original URL plus optional environment variable metadata.
 */
function resolveUrl(
  url: string,
  envVarMap?: Map<string, string>
): Pick<FlowUrlReference, 'url' | 'environmentVariable' | 'environmentVariableValue'> {
  if (!url.startsWith('@parameters(') && !url.startsWith('@{parameters(')) {
    return { url };
  }

  const envVarName = extractEnvVarName(url);
  if (!envVarName) {
    return { url };
  }

  const resolved = envVarMap?.get(envVarName);
  return {
    url: resolved ?? url,
    environmentVariable: envVarName,
    environmentVariableValue: resolved,
  };
}

/**
 * Safely read a nested property from an unknown record.
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

/**
 * Extract all URL references from a Power Automate flow definition.
 *
 * Traverses the definition recursively, following the same nesting pattern
 * as `complexity-calculator.ts` (scope, foreach, if/else, switch/default).
 */
export function extractUrlsFromFlowDefinition(
  flowDefinition: Record<string, unknown>,
  envVarMap?: Map<string, string>
): FlowUrlReference[] {
  const urls: FlowUrlReference[] = [];

  try {
    const properties = asRecord(flowDefinition.properties);
    const definition = asRecord(properties?.definition);
    if (!definition) return urls;

    // --- Triggers -----------------------------------------------------------
    const triggers = asRecord(definition.triggers);
    if (triggers) {
      for (const triggerName of Object.keys(triggers)) {
        const trigger = asRecord(triggers[triggerName]);
        if (!trigger) continue;

        const inputs = asRecord(trigger.inputs);
        if (inputs && typeof inputs.uri === 'string') {
          const resolved = resolveUrl(inputs.uri, envVarMap);
          urls.push({
            actionName: triggerName,
            source: 'trigger',
            ...resolved,
          });
        }
      }
    }

    // --- Parameters (environment variables) ---------------------------------
    const parameters = asRecord(definition.parameters);
    if (parameters) {
      for (const paramName of Object.keys(parameters)) {
        const param = asRecord(parameters[paramName]);
        if (!param) continue;

        const metadata = asRecord(param.metadata);
        const schemaId = metadata?.schemaId;
        if (
          typeof schemaId === 'string' &&
          schemaId.toLowerCase().includes('environmentvariable')
        ) {
          const defaultValue =
            typeof param.defaultValue === 'string'
              ? param.defaultValue
              : undefined;
          const resolvedValue = envVarMap?.get(paramName);
          const url = resolvedValue ?? defaultValue;

          if (url) {
            urls.push({
              actionName: paramName,
              url,
              environmentVariable: paramName,
              environmentVariableValue: resolvedValue,
              source: 'parameter',
            });
          }
        }
      }
    }

    // --- Actions (recursive) ------------------------------------------------
    const actions = asRecord(definition.actions);
    if (actions) {
      processActions(actions, urls, envVarMap);
    }
  } catch {
    // Return partial results on parse errors
  }

  return urls;
}

/**
 * Recursively traverse actions, extracting URL references.
 */
function processActions(
  actions: Record<string, unknown>,
  urls: FlowUrlReference[],
  envVarMap?: Map<string, string>
): void {
  for (const actionName of Object.keys(actions)) {
    const action = asRecord(actions[actionName]);
    if (!action) continue;

    const actionType = (action.type as string) || '';

    // HTTP actions: inputs.uri
    if (actionType === 'Http') {
      const inputs = asRecord(action.inputs);
      if (inputs && typeof inputs.uri === 'string') {
        const resolved = resolveUrl(inputs.uri, envVarMap);
        urls.push({
          actionName,
          source: 'http-action',
          ...resolved,
        });
      }
    }

    // OpenApiConnection actions: inputs.parameters.uri or .url
    if (
      actionType === 'OpenApiConnection' ||
      actionType === 'ApiConnection'
    ) {
      const inputs = asRecord(action.inputs);
      const params = asRecord(inputs?.parameters);
      const rawUrl =
        typeof params?.uri === 'string'
          ? params.uri
          : typeof params?.url === 'string'
            ? params.url
            : undefined;

      if (rawUrl) {
        const resolved = resolveUrl(rawUrl, envVarMap);
        urls.push({
          actionName,
          source: 'openapi-connection',
          ...resolved,
        });
      }
    }

    // --- Recurse into nested structures ------------------------------------
    const nested = asRecord(action.actions);
    if (nested) {
      processActions(nested, urls, envVarMap);
    }

    const thenBranch = asRecord(action.then);
    if (thenBranch) {
      processActions(thenBranch, urls, envVarMap);
    }

    const elseBranch = asRecord(action.else);
    if (elseBranch) {
      processActions(elseBranch, urls, envVarMap);
    }

    const cases = asRecord(action.cases);
    if (cases) {
      for (const caseName of Object.keys(cases)) {
        const caseData = asRecord(cases[caseName]);
        const caseActions = asRecord(caseData?.actions);
        if (caseActions) {
          processActions(caseActions, urls, envVarMap);
        }
      }
    }

    const defaultBranch = asRecord(action.default);
    if (defaultBranch) {
      const defaultActions = asRecord(defaultBranch.actions);
      if (defaultActions) {
        processActions(defaultActions, urls, envVarMap);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hardcoded secret detection
// ---------------------------------------------------------------------------

/**
 * Scan a flow definition for hardcoded secrets in action inputs.
 *
 * Flags literal string values (not expressions starting with `@`) whose
 * key names match common secret patterns such as `client_secret`,
 * `password`, `api_key`, `authorization`, etc.
 */
export function detectHardcodedSecrets(
  flowDefinition: Record<string, unknown>
): SecretWarning[] {
  const warnings: SecretWarning[] = [];

  try {
    const properties = asRecord(flowDefinition.properties);
    const definition = asRecord(properties?.definition);
    const actions = asRecord(definition?.actions);

    if (actions) {
      scanActionsForSecrets(actions, warnings);
    }
  } catch {
    // Return partial results on parse errors
  }

  return warnings;
}

/**
 * Recursively scan actions for hardcoded secrets.
 */
function scanActionsForSecrets(
  actions: Record<string, unknown>,
  warnings: SecretWarning[]
): void {
  for (const actionName of Object.keys(actions)) {
    const action = asRecord(actions[actionName]);
    if (!action) continue;

    // Scan inputs for secret-like keys with literal values
    const inputs = asRecord(action.inputs);
    if (inputs) {
      scanObjectForSecrets(inputs, actionName, 'inputs', warnings);
    }

    // --- Recurse into nested structures ------------------------------------
    const nested = asRecord(action.actions);
    if (nested) scanActionsForSecrets(nested, warnings);

    const thenBranch = asRecord(action.then);
    if (thenBranch) scanActionsForSecrets(thenBranch, warnings);

    const elseBranch = asRecord(action.else);
    if (elseBranch) scanActionsForSecrets(elseBranch, warnings);

    const cases = asRecord(action.cases);
    if (cases) {
      for (const caseName of Object.keys(cases)) {
        const caseData = asRecord(cases[caseName]);
        const caseActions = asRecord(caseData?.actions);
        if (caseActions) scanActionsForSecrets(caseActions, warnings);
      }
    }

    const defaultBranch = asRecord(action.default);
    if (defaultBranch) {
      const defaultActions = asRecord(defaultBranch.actions);
      if (defaultActions) scanActionsForSecrets(defaultActions, warnings);
    }
  }
}

/**
 * Recursively scan an object's keys and values for hardcoded secrets.
 */
function scanObjectForSecrets(
  obj: Record<string, unknown>,
  actionName: string,
  currentPath: string,
  warnings: SecretWarning[]
): void {
  for (const key of Object.keys(obj)) {
    const fieldPath = `${currentPath}.${key}`;
    const value = obj[key];

    if (SECRET_KEY_PATTERN.test(key) && typeof value === 'string' && !value.startsWith('@')) {
      warnings.push({
        actionName,
        fieldPath,
        warningType: 'hardcoded-secret',
        message: `Hardcoded value found for '${key}' in action '${actionName}'. ` +
          'Consider using a secure input parameter or environment variable instead.',
      });
    }

    // Recurse into nested objects
    const nested = asRecord(value);
    if (nested) {
      scanObjectForSecrets(nested, actionName, fieldPath, warnings);
    }
  }
}
