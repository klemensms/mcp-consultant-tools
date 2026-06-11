import { ArmClient } from '../client/ArmClient.js';
import type { WebSite, AppServicePlan, SiteConfig } from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';
import type { ScmClient } from '../utils/scm-client.js';

/**
 * Processed App Service summary.
 */
export interface AppServiceSummary {
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
  httpsOnly?: boolean;
  clientAffinityEnabled?: boolean;
  clientCertEnabled?: boolean;
  configuration?: {
    appSettings: Array<{ name: string; value: string }>;
    connectionStrings: Array<{ name: string; type: string; value: string }>;
    generalSettings: {
      alwaysOn?: boolean;
      http20Enabled?: boolean;
      minTlsVersion?: string;
      ftpsState?: string;
    };
  };
  identity?: {
    type: string;
    principalId?: string;
    tenantId?: string;
  };
}

/**
 * Processed App Service Plan summary.
 */
export interface AppServicePlanSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  sku: {
    name: string;
    tier?: string;
    capacity?: number;
  };
  kind?: string;
  workerCount?: number;
  numberOfSites?: number;
  reserved?: boolean;
  zoneRedundant?: boolean;
}

/**
 * Service for Azure App Service operations.
 */
export class AppServiceService {
  private redactSecrets: boolean;
  private enableWrite: boolean;
  private scmClient?: ScmClient;

  constructor(
    private client: ArmClient,
    options: { redactSecrets?: boolean; enableWrite?: boolean; scmClient?: ScmClient } = {}
  ) {
    this.redactSecrets = options.redactSecrets ?? true;
    this.enableWrite = options.enableWrite ?? false;
    this.scmClient = options.scmClient;
  }

  private checkWriteEnabled(): void {
    if (!this.enableWrite) {
      throw new Error('Write operations are disabled. Set AZURE_MGMT_ENABLE_WRITE=true to enable.');
    }
  }

  // ============================================
  // Read Operations
  // ============================================

  /**
   * List all App Services (web apps) in the subscription or resource group.
   */
  async listAppServices(options: {
    resourceGroup?: string;
    includeConfiguration?: boolean;
  } = {}): Promise<{
    appServices: AppServiceSummary[];
    summary: {
      total: number;
      byState: Record<string, number>;
      byRuntime: Record<string, number>;
    };
  }> {
    const { resourceGroup, includeConfiguration = false } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Web/sites')
      : this.client.subscriptionPath('/providers/Microsoft.Web/sites');

    const sites = await this.client.paginate<WebSite>(path, getApiVersion('Microsoft.Web/sites'));

    // Filter to web apps only (exclude function apps)
    const webApps = sites.filter(
      (site) => !site.kind || !site.kind.toLowerCase().includes('functionapp')
    );

    const results: AppServiceSummary[] = [];
    const summary = {
      total: webApps.length,
      byState: {} as Record<string, number>,
      byRuntime: {} as Record<string, number>,
    };

    for (const app of webApps) {
      const processed = this.processWebSite(app);

      if (includeConfiguration) {
        try {
          processed.configuration = await this.getAppConfiguration(app.id);
        } catch (error) {
          console.error(`Failed to get configuration for ${app.name}:`, error);
        }
      }

      results.push(processed);

      const state = processed.state || 'Unknown';
      summary.byState[state] = (summary.byState[state] || 0) + 1;

      if (processed.runtime) {
        summary.byRuntime[processed.runtime] = (summary.byRuntime[processed.runtime] || 0) + 1;
      }
    }

    return { appServices: results, summary };
  }

  /**
   * Get detailed information about an App Service.
   */
  async getAppService(options: {
    name: string;
    resourceGroup?: string;
    includeConfiguration?: boolean;
    includeDeployments?: boolean;
    showValues?: boolean;
  }): Promise<{
    appService: AppServiceSummary;
    deployments?: Array<{
      id: string;
      status?: string;
      startTime?: string;
      endTime?: string;
      author?: string;
      message?: string;
    }>;
  }> {
    const { name, resourceGroup, includeConfiguration = true, includeDeployments = false, showValues = false } = options;

    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) {
      throw new Error('Resource group is required');
    }

    const path = this.client.resourceGroupPath(rg, `/providers/Microsoft.Web/sites/${name}`);
    const site = await this.client.get<WebSite>(path, getApiVersion('Microsoft.Web/sites'));

    const appService = this.processWebSite(site);

    if (includeConfiguration) {
      try {
        appService.configuration = await this.getAppConfiguration(site.id, showValues);
      } catch (error) {
        console.error(`Failed to get configuration:`, error);
      }
    }

    const result: {
      appService: AppServiceSummary;
      deployments?: Array<{
        id: string;
        status?: string;
        startTime?: string;
        endTime?: string;
        author?: string;
        message?: string;
      }>;
    } = { appService };

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
   * List all App Service Plans.
   */
  async listAppServicePlans(options: { resourceGroup?: string } = {}): Promise<{
    plans: AppServicePlanSummary[];
    summary: {
      total: number;
      byTier: Record<string, number>;
      byKind: Record<string, number>;
    };
  }> {
    const { resourceGroup } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Web/serverfarms')
      : this.client.subscriptionPath('/providers/Microsoft.Web/serverfarms');

    const plans = await this.client.paginate<AppServicePlan>(
      path,
      getApiVersion('Microsoft.Web/serverfarms')
    );

    const results: AppServicePlanSummary[] = [];
    const summary = {
      total: plans.length,
      byTier: {} as Record<string, number>,
      byKind: {} as Record<string, number>,
    };

    for (const plan of plans) {
      const processed = this.processAppServicePlan(plan);
      results.push(processed);

      const tier = processed.sku.tier || 'Unknown';
      summary.byTier[tier] = (summary.byTier[tier] || 0) + 1;

      if (processed.kind) {
        summary.byKind[processed.kind] = (summary.byKind[processed.kind] || 0) + 1;
      }
    }

    return { plans: results, summary };
  }

  /**
   * Fetch recent logs from an App Service via Kudu SCM API.
   */
  async getAppServiceLogs(options: {
    name: string;
    resourceGroup?: string;
    logType?: 'docker' | 'stdout' | 'eventlog' | 'all';
    maxLines?: number;
  }): Promise<{
    appName: string;
    operatingSystem: string;
    logs: Array<{ type: string; content: string; source: string }>;
    errors?: string[];
  }> {
    if (!this.scmClient) {
      throw new Error('SCM client not available. Ensure the service is properly initialized.');
    }

    const { name, resourceGroup, logType = 'all', maxLines = 200 } = options;

    // Get app details to determine OS
    const { appService } = await this.getAppService({
      name,
      resourceGroup,
      includeConfiguration: false,
      includeDeployments: false,
    });

    const scmHost = `${name}.scm.azurewebsites.net`;
    const isLinux = appService.operatingSystem === 'Linux';
    const logs: Array<{ type: string; content: string; source: string }> = [];
    const errors: string[] = [];

    // Docker logs (Linux/container apps)
    if (isLinux && (logType === 'docker' || logType === 'all')) {
      try {
        const dockerLogEntries = await this.scmClient.get<Array<{
          href: string;
          name: string;
          size: number;
          time: string;
        }>>(scmHost, '/api/logs/docker');

        // Fetch the most recent log files (up to 3)
        const recentLogs = dockerLogEntries
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
          .slice(0, 3);

        for (const entry of recentLogs) {
          try {
            const content = await this.scmClient.getText(scmHost, `/api/vfs/LogFiles/${entry.name}`);
            const truncated = this.truncateLines(content, maxLines);
            logs.push({ type: 'docker', content: truncated, source: entry.name });
          } catch (err) {
            errors.push(`Failed to fetch docker log ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        errors.push(`Failed to list docker logs: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Event log (Windows apps)
    if (!isLinux && (logType === 'eventlog' || logType === 'all')) {
      try {
        const content = await this.scmClient.getText(scmHost, '/api/vfs/LogFiles/eventlog.xml');
        const truncated = this.truncateLines(content, maxLines);
        logs.push({ type: 'eventlog', content: truncated, source: 'eventlog.xml' });
      } catch (err) {
        errors.push(`Failed to fetch event log: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Stdout logs (both OS types)
    if (logType === 'stdout' || logType === 'all') {
      try {
        const dirEntries = await this.scmClient.get<Array<{
          name: string;
          size: number;
          mtime: string;
          mime: string;
          href: string;
        }>>(scmHost, '/api/vfs/LogFiles/Application/');

        const logFiles = dirEntries
          .filter((e) => e.mime !== 'inode/directory' && e.size > 0)
          .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
          .slice(0, 3);

        for (const entry of logFiles) {
          try {
            const content = await this.scmClient.getText(scmHost, `/api/vfs/LogFiles/Application/${entry.name}`);
            const truncated = this.truncateLines(content, maxLines);
            logs.push({ type: 'stdout', content: truncated, source: entry.name });
          } catch (err) {
            errors.push(`Failed to fetch stdout log ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        // Application directory may not exist — not an error for all apps
        if (logType === 'stdout') {
          errors.push(`Failed to list stdout logs: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return {
      appName: name,
      operatingSystem: appService.operatingSystem,
      logs,
      ...(errors.length > 0 ? { errors } : {}),
    };
  }

  // ============================================
  // Write Operations (require AZURE_MGMT_ENABLE_WRITE=true)
  // ============================================

  /**
   * Restart an App Service.
   */
  async restartAppService(options: {
    name: string;
    resourceGroup?: string;
  }): Promise<{ success: boolean; appName: string; message: string }> {
    this.checkWriteEnabled();

    const { name, resourceGroup } = options;
    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) throw new Error('Resource group is required');

    const path = this.client.resourceGroupPath(rg, `/providers/Microsoft.Web/sites/${name}/restart`);
    await this.client.post<void>(path, {}, getApiVersion('Microsoft.Web/sites'));

    return { success: true, appName: name, message: `App Service '${name}' restart initiated` };
  }

  /**
   * Stop a running App Service.
   */
  async stopAppService(options: {
    name: string;
    resourceGroup?: string;
  }): Promise<{ success: boolean; appName: string; previousState?: string; message: string }> {
    this.checkWriteEnabled();

    const { name, resourceGroup } = options;
    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) throw new Error('Resource group is required');

    // Get current state
    let previousState: string | undefined;
    try {
      const { appService } = await this.getAppService({ name, resourceGroup: rg, includeConfiguration: false });
      previousState = appService.state;
    } catch { /* continue even if state check fails */ }

    const path = this.client.resourceGroupPath(rg, `/providers/Microsoft.Web/sites/${name}/stop`);
    await this.client.post<void>(path, {}, getApiVersion('Microsoft.Web/sites'));

    return { success: true, appName: name, previousState, message: `App Service '${name}' stop initiated` };
  }

  /**
   * Start a stopped App Service.
   */
  async startAppService(options: {
    name: string;
    resourceGroup?: string;
  }): Promise<{ success: boolean; appName: string; previousState?: string; message: string }> {
    this.checkWriteEnabled();

    const { name, resourceGroup } = options;
    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) throw new Error('Resource group is required');

    // Get current state
    let previousState: string | undefined;
    try {
      const { appService } = await this.getAppService({ name, resourceGroup: rg, includeConfiguration: false });
      previousState = appService.state;
    } catch { /* continue even if state check fails */ }

    const path = this.client.resourceGroupPath(rg, `/providers/Microsoft.Web/sites/${name}/start`);
    await this.client.post<void>(path, {}, getApiVersion('Microsoft.Web/sites'));

    return { success: true, appName: name, previousState, message: `App Service '${name}' start initiated` };
  }

  /**
   * Update app settings or connection strings on an App Service.
   * Merges with existing settings — does not replace the full set.
   */
  async setAppServiceConfig(options: {
    name: string;
    resourceGroup?: string;
    appSettings?: Record<string, string>;
    connectionStrings?: Record<string, { value: string; type: string }>;
    removeSettings?: string[];
  }): Promise<{
    success: boolean;
    appName: string;
    updatedSettings: string[];
    removedSettings: string[];
    updatedConnectionStrings: string[];
  }> {
    this.checkWriteEnabled();

    const { name, resourceGroup, appSettings, connectionStrings, removeSettings } = options;
    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) throw new Error('Resource group is required');

    if (!appSettings && !connectionStrings && !removeSettings) {
      throw new Error('At least one of appSettings, connectionStrings, or removeSettings must be provided');
    }

    const sitePath = this.client.resourceGroupPath(rg, `/providers/Microsoft.Web/sites/${name}`);
    const apiVersion = getApiVersion('Microsoft.Web/sites/config');
    const updatedSettings: string[] = [];
    const removedSettings: string[] = [];
    const updatedConnectionStrings: string[] = [];

    // Update app settings (merge pattern)
    if (appSettings || removeSettings) {
      const existingPath = `${sitePath}/config/appsettings/list`;
      const existing = await this.client.post<{ properties?: Record<string, string> }>(
        existingPath, {}, apiVersion
      );

      const merged = { ...(existing.properties || {}) };

      // Apply updates
      if (appSettings) {
        for (const [key, value] of Object.entries(appSettings)) {
          merged[key] = value;
          updatedSettings.push(key);
        }
      }

      // Apply removals
      if (removeSettings) {
        for (const key of removeSettings) {
          if (key in merged) {
            delete merged[key];
            removedSettings.push(key);
          }
        }
      }

      const putPath = `${sitePath}/config/appsettings`;
      await this.client.put<unknown>(putPath, { properties: merged }, apiVersion);
    }

    // Update connection strings (merge pattern)
    if (connectionStrings) {
      const existingPath = `${sitePath}/config/connectionstrings/list`;
      const existing = await this.client.post<{
        properties?: Record<string, { value: string; type: string }>;
      }>(existingPath, {}, apiVersion);

      const merged = { ...(existing.properties || {}) };

      for (const [key, value] of Object.entries(connectionStrings)) {
        merged[key] = value;
        updatedConnectionStrings.push(key);
      }

      const putPath = `${sitePath}/config/connectionstrings`;
      await this.client.put<unknown>(putPath, { properties: merged }, apiVersion);
    }

    return { success: true, appName: name, updatedSettings, removedSettings, updatedConnectionStrings };
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Get app configuration (settings, connection strings).
   */
  private async getAppConfiguration(siteId: string, showValues = false): Promise<AppServiceSummary['configuration']> {
    const shouldRedact = showValues ? false : this.redactSecrets;

    const appSettingsPath = `${siteId}/config/appsettings/list`;
    const appSettingsResponse = await this.client.post<{ properties?: Record<string, string> }>(
      appSettingsPath,
      {},
      getApiVersion('Microsoft.Web/sites/config')
    );

    const connStringsPath = `${siteId}/config/connectionstrings/list`;
    const connStringsResponse = await this.client.post<{
      properties?: Record<string, { value: string; type: string }>;
    }>(connStringsPath, {}, getApiVersion('Microsoft.Web/sites/config'));

    const configPath = `${siteId}/config/web`;
    const configResponse = await this.client.get<{ properties?: SiteConfig }>(
      configPath,
      getApiVersion('Microsoft.Web/sites/config')
    );

    const appSettings = Object.entries(appSettingsResponse.properties || {}).map(
      ([name, value]) => ({
        name,
        value: shouldRedact ? this.redactValue(name, value) : value,
      })
    );

    const connectionStrings = Object.entries(connStringsResponse.properties || {}).map(
      ([name, conn]) => ({
        name,
        type: conn.type,
        value: shouldRedact ? '***REDACTED***' : conn.value,
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
   * Get recent deployments.
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
   * Process a WebSite into an AppServiceSummary.
   */
  private processWebSite(site: WebSite): AppServiceSummary {
    const props = site.properties || {};
    const config = props.siteConfig || {};

    const rgMatch = site.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

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

    const operatingSystem = props.reserved ? 'Linux' : 'Windows';

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
      httpsOnly: props.httpsOnly,
      clientAffinityEnabled: props.clientAffinityEnabled,
      clientCertEnabled: props.clientCertEnabled,
      identity: site.identity
        ? {
            type: site.identity.type,
            principalId: site.identity.principalId,
            tenantId: site.identity.tenantId,
          }
        : undefined,
    };
  }

  /**
   * Process an AppServicePlan.
   */
  private processAppServicePlan(plan: AppServicePlan): AppServicePlanSummary {
    const props = plan.properties || {};

    const rgMatch = plan.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    return {
      id: plan.id,
      name: plan.name,
      resourceGroup,
      location: plan.location,
      sku: {
        name: plan.sku?.name || 'Unknown',
        tier: plan.sku?.tier,
        capacity: plan.sku?.capacity,
      },
      kind: plan.kind,
      workerCount: props.targetWorkerCount,
      numberOfSites: props.numberOfSites,
      reserved: props.reserved,
      zoneRedundant: props.zoneRedundant,
    };
  }

  /**
   * Redact sensitive values.
   */
  private redactValue(name: string, value: string): string {
    const sensitivePatterns = [
      /secret/i,
      /password/i,
      /key/i,
      /token/i,
      /connection/i,
      /credential/i,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(name)) {
        return '***REDACTED***';
      }
    }

    return value;
  }

  /**
   * Truncate text to a maximum number of lines.
   */
  private truncateLines(text: string, maxLines: number): string {
    const lines = text.split('\n');
    if (lines.length <= maxLines) return text;
    return lines.slice(-maxLines).join('\n') + `\n... (truncated, showing last ${maxLines} of ${lines.length} lines)`;
  }
}
