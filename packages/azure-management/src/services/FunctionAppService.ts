import { ArmClient } from '../client/ArmClient.js';
import type { WebSite, FunctionEnvelope, FunctionKeys, SiteConfig } from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

/**
 * Processed Function App with extracted details.
 */
export interface FunctionAppSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  state?: string;
  defaultHostName?: string;
  appServicePlanId?: string;
  runtime?: string;
  runtimeVersion?: string;
  operatingSystem: string;
  sku?: string;
  httpsOnly?: boolean;
  functionsCount?: number;
  configuration?: {
    appSettings: Array<{ name: string; value: string; slotSetting?: boolean }>;
    connectionStrings: Array<{ name: string; type: string; value: string }>;
    generalSettings: {
      alwaysOn?: boolean;
      http20Enabled?: boolean;
      minTlsVersion?: string;
      ftpsState?: string;
    };
  };
  slots?: string[];
  identity?: {
    type: string;
    principalId?: string;
    tenantId?: string;
  };
  vnetIntegration?: {
    vnetName?: string;
    subnetName?: string;
  };
  cors?: {
    allowedOrigins?: string[];
  };
}

/**
 * Processed function details.
 */
export interface FunctionSummary {
  name: string;
  functionAppName: string;
  trigger?: {
    type: string;
    [key: string]: unknown;
  };
  bindings?: Array<{
    type: string;
    direction: string;
    name: string;
  }>;
  isDisabled?: boolean;
  scriptHref?: string;
  configHref?: string;
}

/**
 * Service for Azure Function App operations.
 */
export class FunctionAppService {
  private redactSecrets: boolean;

  constructor(
    private client: ArmClient,
    options: { redactSecrets?: boolean } = {}
  ) {
    this.redactSecrets = options.redactSecrets ?? true;
  }

  /**
   * List all Function Apps in the subscription or resource group.
   */
  async listFunctionApps(options: {
    resourceGroup?: string;
    includeConfiguration?: boolean;
    includeSlots?: boolean;
  } = {}): Promise<{
    functionApps: FunctionAppSummary[];
    summary: {
      total: number;
      byState: Record<string, number>;
      byRuntime: Record<string, number>;
      bySku: Record<string, number>;
    };
  }> {
    const { resourceGroup, includeConfiguration = false, includeSlots = false } = options;

    // List all sites
    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Web/sites')
      : this.client.subscriptionPath('/providers/Microsoft.Web/sites');

    const sites = await this.client.paginate<WebSite>(path, getApiVersion('Microsoft.Web/sites'));

    // Filter to function apps only (kind contains 'functionapp')
    const functionApps = sites.filter(
      (site) => site.kind && site.kind.toLowerCase().includes('functionapp')
    );

    // Transform to summary format
    const results: FunctionAppSummary[] = [];
    const summary = {
      total: functionApps.length,
      byState: {} as Record<string, number>,
      byRuntime: {} as Record<string, number>,
      bySku: {} as Record<string, number>,
    };

    for (const app of functionApps) {
      const processed = this.processWebSite(app);

      // Get additional details if requested
      if (includeConfiguration) {
        try {
          const config = await this.getAppConfiguration(app.id);
          processed.configuration = config;
        } catch (error) {
          console.error(`Failed to get configuration for ${app.name}:`, error);
        }
      }

      if (includeSlots) {
        try {
          const slots = await this.getDeploymentSlots(app.id);
          processed.slots = slots.map((s) => s.name);
        } catch (error) {
          console.error(`Failed to get slots for ${app.name}:`, error);
        }
      }

      results.push(processed);

      // Build summary
      const state = processed.state || 'Unknown';
      summary.byState[state] = (summary.byState[state] || 0) + 1;

      if (processed.runtime) {
        summary.byRuntime[processed.runtime] = (summary.byRuntime[processed.runtime] || 0) + 1;
      }

      if (processed.sku) {
        summary.bySku[processed.sku] = (summary.bySku[processed.sku] || 0) + 1;
      }
    }

    return { functionApps: results, summary };
  }

  /**
   * Get detailed information about a Function App.
   */
  async getFunctionApp(options: {
    name: string;
    resourceGroup?: string;
    includeConfiguration?: boolean;
    includeFunctions?: boolean;
    includeDeployments?: boolean;
  }): Promise<{
    functionApp: FunctionAppSummary;
    functions?: FunctionSummary[];
    deployments?: Array<{
      id: string;
      status?: string;
      startTime?: string;
      endTime?: string;
      author?: string;
      message?: string;
    }>;
  }> {
    const {
      name,
      resourceGroup,
      includeConfiguration = true,
      includeFunctions = true,
      includeDeployments = false,
    } = options;

    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) {
      throw new Error('Resource group is required');
    }

    // Get the Function App
    const path = this.client.resourceGroupPath(rg, `/providers/Microsoft.Web/sites/${name}`);
    const site = await this.client.get<WebSite>(path, getApiVersion('Microsoft.Web/sites'));

    const functionApp = this.processWebSite(site);

    // Get configuration
    if (includeConfiguration) {
      try {
        functionApp.configuration = await this.getAppConfiguration(site.id);
      } catch (error) {
        console.error(`Failed to get configuration:`, error);
      }
    }

    const result: {
      functionApp: FunctionAppSummary;
      functions?: FunctionSummary[];
      deployments?: Array<{
        id: string;
        status?: string;
        startTime?: string;
        endTime?: string;
        author?: string;
        message?: string;
      }>;
    } = { functionApp };

    // Get functions
    if (includeFunctions) {
      try {
        const functionsResult = await this.listFunctions({ functionAppName: name, resourceGroup: rg });
        result.functions = functionsResult.functions;
      } catch (error) {
        console.error(`Failed to get functions:`, error);
        result.functions = [];
      }
    }

    // Get deployments
    if (includeDeployments) {
      try {
        result.deployments = await this.getDeployments(site.id);
      } catch (error) {
        console.error(`Failed to get deployments:`, error);
        result.deployments = [];
      }
    }

    return result;
  }

  /**
   * List functions within a Function App.
   */
  async listFunctions(options: {
    functionAppName: string;
    resourceGroup?: string;
  }): Promise<{
    functions: FunctionSummary[];
    summary: {
      total: number;
      byTriggerType: Record<string, number>;
      disabled: number;
    };
  }> {
    const { functionAppName, resourceGroup } = options;

    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) {
      throw new Error('Resource group is required');
    }

    const path = this.client.resourceGroupPath(
      rg,
      `/providers/Microsoft.Web/sites/${functionAppName}/functions`
    );

    const functions = await this.client.paginate<FunctionEnvelope>(
      path,
      getApiVersion('Microsoft.Web/sites/functions')
    );

    const results: FunctionSummary[] = [];
    const summary = {
      total: functions.length,
      byTriggerType: {} as Record<string, number>,
      disabled: 0,
    };

    for (const fn of functions) {
      const processed = this.processFunctionEnvelope(fn, functionAppName);
      results.push(processed);

      // Build summary
      if (processed.trigger?.type) {
        const triggerType = processed.trigger.type;
        summary.byTriggerType[triggerType] = (summary.byTriggerType[triggerType] || 0) + 1;
      }

      if (processed.isDisabled) {
        summary.disabled++;
      }
    }

    return { functions: results, summary };
  }

  /**
   * Get function and host keys for a Function App.
   */
  async getFunctionKeys(options: {
    functionAppName: string;
    resourceGroup?: string;
    functionName?: string;
  }): Promise<{
    hostKeys: Array<{ name: string; value: string }>;
    functionKeys?: Array<{ name: string; value: string }>;
  }> {
    const { functionAppName, resourceGroup, functionName } = options;

    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) {
      throw new Error('Resource group is required');
    }

    // Get host keys
    const hostKeysPath = this.client.resourceGroupPath(
      rg,
      `/providers/Microsoft.Web/sites/${functionAppName}/host/default/listkeys`
    );

    const hostKeysResponse = await this.client.post<FunctionKeys>(
      hostKeysPath,
      {},
      getApiVersion('Microsoft.Web/sites/host/default/listkeys')
    );

    const result: {
      hostKeys: Array<{ name: string; value: string }>;
      functionKeys?: Array<{ name: string; value: string }>;
    } = {
      hostKeys: hostKeysResponse.functionKeys || [],
    };

    // Add master key if present
    if (hostKeysResponse.keys) {
      result.hostKeys = [...result.hostKeys, ...hostKeysResponse.keys];
    }

    // Get function-specific keys if requested
    if (functionName) {
      const functionKeysPath = this.client.resourceGroupPath(
        rg,
        `/providers/Microsoft.Web/sites/${functionAppName}/functions/${functionName}/listkeys`
      );

      try {
        const functionKeysResponse = await this.client.post<FunctionKeys>(
          functionKeysPath,
          {},
          getApiVersion('Microsoft.Web/sites/functions/listkeys')
        );
        result.functionKeys = functionKeysResponse.keys || [];
      } catch (error) {
        console.error(`Failed to get keys for function ${functionName}:`, error);
        result.functionKeys = [];
      }
    }

    return result;
  }

  /**
   * Get app configuration (settings, connection strings).
   */
  private async getAppConfiguration(siteId: string): Promise<FunctionAppSummary['configuration']> {
    // Get app settings
    const appSettingsPath = `${siteId}/config/appsettings/list`;
    const appSettingsResponse = await this.client.post<{ properties?: Record<string, string> }>(
      appSettingsPath,
      {},
      getApiVersion('Microsoft.Web/sites/config')
    );

    // Get connection strings
    const connStringsPath = `${siteId}/config/connectionstrings/list`;
    const connStringsResponse = await this.client.post<{
      properties?: Record<string, { value: string; type: string }>;
    }>(connStringsPath, {}, getApiVersion('Microsoft.Web/sites/config'));

    // Get general config
    const configPath = `${siteId}/config/web`;
    const configResponse = await this.client.get<{ properties?: SiteConfig }>(
      configPath,
      getApiVersion('Microsoft.Web/sites/config')
    );

    const appSettings = Object.entries(appSettingsResponse.properties || {}).map(
      ([name, value]) => ({
        name,
        value: this.redactValue(name, value),
      })
    );

    const connectionStrings = Object.entries(connStringsResponse.properties || {}).map(
      ([name, conn]) => ({
        name,
        type: conn.type,
        value: this.redactSecrets ? '***REDACTED***' : conn.value,
      })
    );

    const config = configResponse.properties;

    return {
      appSettings,
      connectionStrings,
      generalSettings: {
        alwaysOn: config?.alwaysOn,
        http20Enabled: config?.http20Enabled,
        minTlsVersion: config?.minTlsVersion,
        ftpsState: config?.ftpsState,
      },
    };
  }

  /**
   * Get deployment slots for a site.
   */
  private async getDeploymentSlots(siteId: string): Promise<Array<{ name: string }>> {
    const path = `${siteId}/slots`;
    const slots = await this.client.paginate<WebSite>(path, getApiVersion('Microsoft.Web/sites/slots'));
    return slots.map((s) => ({ name: s.name }));
  }

  /**
   * Get recent deployments for a site.
   */
  private async getDeployments(siteId: string): Promise<
    Array<{
      id: string;
      status?: string;
      startTime?: string;
      endTime?: string;
      author?: string;
      message?: string;
    }>
  > {
    const path = `${siteId}/deployments`;
    const deployments = await this.client.paginate<{
      id: string;
      properties?: {
        status?: number;
        start_time?: string;
        end_time?: string;
        author?: string;
        message?: string;
      };
    }>(path, getApiVersion('Microsoft.Web/sites/deployments'));

    return deployments.slice(0, 10).map((d) => ({
      id: d.id,
      status: d.properties?.status?.toString(),
      startTime: d.properties?.start_time,
      endTime: d.properties?.end_time,
      author: d.properties?.author,
      message: d.properties?.message,
    }));
  }

  /**
   * Process a WebSite into a FunctionAppSummary.
   */
  private processWebSite(site: WebSite): FunctionAppSummary {
    const props = site.properties || {};
    const config = props.siteConfig || {};

    // Extract resource group from ID
    const rgMatch = site.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    // Determine runtime
    let runtime: string | undefined;
    let runtimeVersion: string | undefined;

    if (config.linuxFxVersion) {
      const parts = config.linuxFxVersion.split('|');
      runtime = parts[0]?.toLowerCase();
      runtimeVersion = parts[1];
    } else if (config.netFrameworkVersion) {
      runtime = 'dotnet';
      runtimeVersion = config.netFrameworkVersion;
    } else if (config.nodeVersion) {
      runtime = 'node';
      runtimeVersion = config.nodeVersion;
    } else if (config.pythonVersion) {
      runtime = 'python';
      runtimeVersion = config.pythonVersion;
    } else if (config.javaVersion) {
      runtime = 'java';
      runtimeVersion = config.javaVersion;
    }

    // Determine OS
    const operatingSystem = props.reserved ? 'Linux' : 'Windows';

    // Extract SKU from plan
    let sku: string | undefined;
    if (props.serverFarmId) {
      // SKU is typically in the plan name or needs separate API call
      // For now, just indicate if it's consumption (dynamic) based on serverFarmId pattern
      if (props.serverFarmId.toLowerCase().includes('dynamic')) {
        sku = 'Dynamic';
      }
    }

    // Extract VNet integration
    let vnetIntegration: FunctionAppSummary['vnetIntegration'];
    if (props.virtualNetworkSubnetId) {
      const vnetMatch = props.virtualNetworkSubnetId.match(
        /\/virtualNetworks\/([^/]+)\/subnets\/([^/]+)/i
      );
      if (vnetMatch) {
        vnetIntegration = {
          vnetName: vnetMatch[1],
          subnetName: vnetMatch[2],
        };
      }
    }

    return {
      id: site.id,
      name: site.name,
      resourceGroup,
      location: site.location,
      state: props.state,
      defaultHostName: props.defaultHostName,
      appServicePlanId: props.serverFarmId,
      runtime,
      runtimeVersion,
      operatingSystem,
      sku: site.sku?.name || sku,
      httpsOnly: props.httpsOnly,
      identity: site.identity
        ? {
            type: site.identity.type,
            principalId: site.identity.principalId,
            tenantId: site.identity.tenantId,
          }
        : undefined,
      vnetIntegration,
      cors: config.cors
        ? {
            allowedOrigins: config.cors.allowedOrigins,
          }
        : undefined,
    };
  }

  /**
   * Process a FunctionEnvelope into a FunctionSummary.
   */
  private processFunctionEnvelope(fn: FunctionEnvelope, functionAppName: string): FunctionSummary {
    const props = fn.properties || {};
    const config = props.config || {};

    // Find the trigger binding
    const triggerBinding = config.bindings?.find((b) =>
      b.type?.toLowerCase().includes('trigger')
    );

    // Get all bindings
    const bindings = config.bindings?.map((b) => ({
      type: b.type,
      direction: b.direction,
      name: b.name,
    }));

    return {
      name: fn.name.split('/').pop() || fn.name,
      functionAppName,
      trigger: triggerBinding
        ? {
            type: triggerBinding.type,
            ...Object.fromEntries(
              Object.entries(triggerBinding).filter(
                ([k]) => !['type', 'direction', 'name'].includes(k)
              )
            ),
          }
        : undefined,
      bindings,
      isDisabled: config.disabled || props.isDisabled,
      scriptHref: props.script_href,
      configHref: props.config_href,
    };
  }

  /**
   * Redact sensitive values in app settings.
   */
  private redactValue(name: string, value: string): string {
    if (!this.redactSecrets) {
      return value;
    }

    const sensitivePatterns = [
      /secret/i,
      /password/i,
      /key/i,
      /token/i,
      /connection/i,
      /credential/i,
      /apikey/i,
      /api_key/i,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(name)) {
        return '***REDACTED***';
      }
    }

    return value;
  }
}
