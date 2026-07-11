/**
 * Azure Data Factory Service
 * Provides authentication and API operations for ADF.
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import axios, { AxiosError } from 'axios';
import { paginateDebugRuns } from './debug-run-query.js';
import type {
  AdfConfig,
  AdfFactoryConfig,
  AdfListResponse,
  Pipeline,
  PipelineRun,
  CreateRunResponse,
  QueryPipelineRunsRequest,
  QueryPipelineRunsResponse,
  ActivityRun,
  QueryActivityRunsRequest,
  QueryActivityRunsResponse,
  Dataset,
  LinkedService,
  DataFlow,
  Trigger,
  QueryTriggerRunsRequest,
  QueryTriggerRunsResponse,
  IntegrationRuntime,
  IntegrationRuntimeStatus,
} from '../models/index.js';

const API_VERSION = '2018-06-01';

export class AdfService {
  private config: AdfConfig;
  private msalClient: ConfidentialClientApplication;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  constructor(config: AdfConfig) {
    this.config = config;

    // Initialize MSAL client
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });
  }

  // ========================================
  // Authentication
  // ========================================

  /**
   * Get an access token for Azure Management API
   */
  private async getAccessToken(): Promise<string> {
    const currentTime = Date.now();

    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://management.azure.com/.default'],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;

      // Set expiration time (subtract 5 minutes to refresh early)
      if (result.expiresOn) {
        this.tokenExpirationTime = result.expiresOn.getTime() - 5 * 60 * 1000;
      }

      return this.accessToken;
    } catch (error) {
      console.error('Error acquiring access token:', error);
      throw new Error('Azure Data Factory authentication failed');
    }
  }

  /**
   * Get authorization headers
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // ========================================
  // Factory Configuration
  // ========================================

  /**
   * Get all configured factories
   */
  getAllFactories(): AdfFactoryConfig[] {
    return this.config.factories;
  }

  /**
   * Get active factories
   */
  getActiveFactories(): AdfFactoryConfig[] {
    return this.config.factories.filter((f) => f.active);
  }

  /**
   * Get factory by ID
   */
  getFactoryById(factoryId: string): AdfFactoryConfig {
    const factory = this.config.factories.find((f) => f.id === factoryId);
    if (!factory) {
      throw new Error(`Data Factory '${factoryId}' not found in configuration`);
    }
    if (!factory.active) {
      throw new Error(`Data Factory '${factoryId}' is inactive`);
    }
    return factory;
  }

  /**
   * Get the default factory (first active factory)
   */
  getDefaultFactory(): AdfFactoryConfig {
    const active = this.getActiveFactories();
    if (active.length === 0) {
      throw new Error('No active Data Factory configured');
    }
    return active[0];
  }

  /**
   * Get factory by ID or default
   */
  resolveFactory(factoryId?: string): AdfFactoryConfig {
    if (factoryId) {
      return this.getFactoryById(factoryId);
    }
    return this.getDefaultFactory();
  }

  /**
   * Get base URL for a factory
   */
  private getBaseUrl(factory: AdfFactoryConfig): string {
    return `https://management.azure.com/subscriptions/${factory.subscriptionId}/resourceGroups/${factory.resourceGroup}/providers/Microsoft.DataFactory/factories/${factory.factoryName}`;
  }

  /**
   * Check if write operations are enabled
   */
  isWriteEnabled(): boolean {
    return this.config.enableWrite;
  }

  /**
   * Check if trigger control is enabled
   */
  isTriggerControlEnabled(): boolean {
    return this.config.enableTriggerControl;
  }

  // ========================================
  // HTTP Methods
  // ========================================

  private async get<T>(url: string): Promise<T> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get<T>(url, {
        headers,
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async post<T>(url: string, data?: any): Promise<T> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.post<T>(url, data, {
        headers,
        timeout: 60000, // Longer timeout for POST operations
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { code?: string; message?: string } }>;

      // Handle timeout
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        return new Error(
          'Azure Data Factory request timed out. ' +
            'Try again or check if the factory is accessible.'
        );
      }

      // Handle network errors
      if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
        return new Error(
          'Network error: Unable to connect to Azure Management API. ' +
            'Check your internet connection and firewall settings.'
        );
      }

      const status = axiosError.response?.status;
      const errorMessage =
        axiosError.response?.data?.error?.message || axiosError.message;

      if (status === 401) {
        return new Error(
          'Azure Data Factory authentication failed. Check credentials and permissions.'
        );
      }
      if (status === 403) {
        return new Error(
          'Azure Data Factory access denied. Ensure you have the required RBAC role.'
        );
      }
      if (status === 404) {
        return new Error(`Resource not found: ${errorMessage}`);
      }
      if (status === 429) {
        const retryAfter = axiosError.response?.headers['retry-after'] || 60;
        return new Error(
          `Azure Management API rate limit exceeded. Retry after ${retryAfter} seconds.`
        );
      }

      return new Error(`Azure Data Factory API error: ${errorMessage}`);
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error('Unknown error occurred');
  }

  // ========================================
  // Pipeline Operations
  // ========================================

  /**
   * List all pipelines in a factory
   */
  async listPipelines(factoryId?: string): Promise<Pipeline[]> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/pipelines?api-version=${API_VERSION}`;
    const response = await this.get<AdfListResponse<Pipeline>>(url);
    return response.value;
  }

  /**
   * Get a pipeline by name
   */
  async getPipeline(pipelineName: string, factoryId?: string): Promise<Pipeline> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/pipelines/${pipelineName}?api-version=${API_VERSION}`;
    return this.get<Pipeline>(url);
  }

  /**
   * Run a pipeline with optional parameters
   */
  async runPipeline(
    pipelineName: string,
    parameters?: Record<string, any>,
    factoryId?: string,
    options?: {
      referencePipelineRunId?: string;
      isRecovery?: boolean;
      startFromFailure?: boolean;
      startActivityName?: string;
    }
  ): Promise<CreateRunResponse> {
    if (!this.config.enableWrite) {
      throw new Error(
        'Write operations are disabled. Set AZURE_DATA_FACTORY_ENABLE_WRITE=true to enable.'
      );
    }

    const factory = this.resolveFactory(factoryId);

    // Build URL with query parameters for recovery mode
    let url = `${this.getBaseUrl(factory)}/pipelines/${pipelineName}/createRun?api-version=${API_VERSION}`;

    if (options?.referencePipelineRunId) {
      url += `&referencePipelineRunId=${options.referencePipelineRunId}`;
    }
    if (options?.isRecovery) {
      url += '&isRecovery=true';
    }
    if (options?.startFromFailure) {
      url += '&startFromFailure=true';
    }
    if (options?.startActivityName) {
      url += `&startActivityName=${encodeURIComponent(options.startActivityName)}`;
    }

    return this.post<CreateRunResponse>(url, parameters || {});
  }

  /**
   * Get a pipeline run by ID
   */
  async getPipelineRun(runId: string, factoryId?: string): Promise<PipelineRun> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/pipelineruns/${runId}?api-version=${API_VERSION}`;
    return this.get<PipelineRun>(url);
  }

  /**
   * Cancel a pipeline run
   */
  async cancelPipelineRun(runId: string, factoryId?: string): Promise<void> {
    if (!this.config.enableWrite) {
      throw new Error(
        'Write operations are disabled. Set AZURE_DATA_FACTORY_ENABLE_WRITE=true to enable.'
      );
    }

    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/pipelineruns/${runId}/cancel?api-version=${API_VERSION}`;
    await this.post<void>(url);
  }

  /**
   * Query pipeline runs with filters
   */
  async queryPipelineRuns(
    request: QueryPipelineRunsRequest,
    factoryId?: string
  ): Promise<QueryPipelineRunsResponse> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/queryPipelineRuns?api-version=${API_VERSION}`;
    return this.post<QueryPipelineRunsResponse>(url, request);
  }

  /**
   * Query DEBUG-mode pipeline runs (runs launched via the ADF Studio "Debug"
   * button). Uses the undocumented `queryDebugPipelineRuns` ARM action, which
   * mirrors the documented `queryPipelineRuns` request/response contract.
   * Pages through `continuationToken` up to `maxResults`; the response carries
   * no total-count field, so `truncated` signals when the cap hid further runs.
   * Debug-run history is retained server-side for only ~15 days.
   */
  async queryDebugPipelineRuns(
    request: QueryPipelineRunsRequest,
    factoryId?: string,
    maxResults = 100
  ): Promise<{ runs: PipelineRun[]; truncated: boolean }> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/queryDebugPipelineRuns?api-version=${API_VERSION}`;
    return paginateDebugRuns(
      (body) => this.post<QueryPipelineRunsResponse>(url, body),
      request,
      maxResults
    );
  }

  // ========================================
  // Activity Run Operations
  // ========================================

  /**
   * Query activity runs for a pipeline run
   */
  async queryActivityRuns(
    runId: string,
    request: QueryActivityRunsRequest,
    factoryId?: string
  ): Promise<QueryActivityRunsResponse> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/pipelineruns/${runId}/queryActivityruns?api-version=${API_VERSION}`;
    return this.post<QueryActivityRunsResponse>(url, request);
  }

  /**
   * Get activity runs for a pipeline run (simplified)
   */
  async getActivityRuns(
    runId: string,
    factoryId?: string,
    filters?: { status?: string; activityName?: string }
  ): Promise<ActivityRun[]> {
    // Use a wide time range to get all activities
    const now = new Date();
    const request: QueryActivityRunsRequest = {
      lastUpdatedAfter: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      lastUpdatedBefore: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      filters: [],
      orderBy: [{ orderBy: 'ActivityRunStart', order: 'ASC' }],
    };

    if (filters?.status) {
      request.filters!.push({
        operand: 'Status',
        operator: 'Equals',
        values: [filters.status],
      });
    }

    if (filters?.activityName) {
      request.filters!.push({
        operand: 'ActivityName',
        operator: 'Equals',
        values: [filters.activityName],
      });
    }

    const response = await this.queryActivityRuns(runId, request, factoryId);
    return response.value;
  }

  // ========================================
  // Dataset Operations
  // ========================================

  /**
   * List all datasets in a factory
   */
  async listDatasets(factoryId?: string): Promise<Dataset[]> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/datasets?api-version=${API_VERSION}`;
    const response = await this.get<AdfListResponse<Dataset>>(url);
    return response.value;
  }

  /**
   * Get a dataset by name
   */
  async getDataset(datasetName: string, factoryId?: string): Promise<Dataset> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/datasets/${datasetName}?api-version=${API_VERSION}`;
    return this.get<Dataset>(url);
  }

  // ========================================
  // Linked Service Operations
  // ========================================

  /**
   * List all linked services in a factory (credentials sanitized)
   */
  async listLinkedServices(factoryId?: string): Promise<LinkedService[]> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/linkedservices?api-version=${API_VERSION}`;
    const response = await this.get<AdfListResponse<LinkedService>>(url);

    // Sanitize credentials
    return response.value.map((ls) => this.sanitizeLinkedService(ls));
  }

  /**
   * Sanitize linked service to remove sensitive data
   */
  private sanitizeLinkedService(linkedService: LinkedService): LinkedService {
    const sanitized = { ...linkedService };
    if (sanitized.properties.typeProperties) {
      const props = { ...sanitized.properties.typeProperties };

      // Common sensitive fields to redact
      const sensitiveFields = [
        'connectionString',
        'password',
        'secretAccessKey',
        'accountKey',
        'servicePrincipalKey',
        'accessToken',
        'refreshToken',
        'encryptedCredential',
        'credential',
      ];

      for (const field of sensitiveFields) {
        if (props[field]) {
          props[field] = '[REDACTED]';
        }
      }

      sanitized.properties = {
        ...sanitized.properties,
        typeProperties: props,
      };
    }
    return sanitized;
  }

  // ========================================
  // Data Flow Operations
  // ========================================

  /**
   * List all data flows in a factory
   */
  async listDataFlows(factoryId?: string): Promise<DataFlow[]> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/dataflows?api-version=${API_VERSION}`;
    const response = await this.get<AdfListResponse<DataFlow>>(url);
    return response.value;
  }

  /**
   * Get a data flow by name
   */
  async getDataFlow(dataFlowName: string, factoryId?: string): Promise<DataFlow> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/dataflows/${dataFlowName}?api-version=${API_VERSION}`;
    return this.get<DataFlow>(url);
  }

  // ========================================
  // Trigger Operations
  // ========================================

  /**
   * List all triggers in a factory
   */
  async listTriggers(factoryId?: string): Promise<Trigger[]> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/triggers?api-version=${API_VERSION}`;
    const response = await this.get<AdfListResponse<Trigger>>(url);
    return response.value;
  }

  /**
   * Get a trigger by name
   */
  async getTrigger(triggerName: string, factoryId?: string): Promise<Trigger> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/triggers/${triggerName}?api-version=${API_VERSION}`;
    return this.get<Trigger>(url);
  }

  /**
   * Start a trigger
   */
  async startTrigger(triggerName: string, factoryId?: string): Promise<void> {
    if (!this.config.enableTriggerControl) {
      throw new Error(
        'Trigger control is disabled. Set AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=true to enable.'
      );
    }

    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/triggers/${triggerName}/start?api-version=${API_VERSION}`;
    await this.post<void>(url);
  }

  /**
   * Stop a trigger
   */
  async stopTrigger(triggerName: string, factoryId?: string): Promise<void> {
    if (!this.config.enableTriggerControl) {
      throw new Error(
        'Trigger control is disabled. Set AZURE_DATA_FACTORY_ENABLE_TRIGGER_CONTROL=true to enable.'
      );
    }

    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/triggers/${triggerName}/stop?api-version=${API_VERSION}`;
    await this.post<void>(url);
  }

  /**
   * Query trigger runs
   */
  async queryTriggerRuns(
    request: QueryTriggerRunsRequest,
    factoryId?: string
  ): Promise<QueryTriggerRunsResponse> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/queryTriggerRuns?api-version=${API_VERSION}`;
    return this.post<QueryTriggerRunsResponse>(url, request);
  }

  // ========================================
  // Integration Runtime Operations
  // ========================================

  /**
   * List all integration runtimes in a factory
   */
  async listIntegrationRuntimes(factoryId?: string): Promise<IntegrationRuntime[]> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/integrationRuntimes?api-version=${API_VERSION}`;
    const response = await this.get<AdfListResponse<IntegrationRuntime>>(url);
    return response.value;
  }

  /**
   * Get integration runtime status
   */
  async getIntegrationRuntimeStatus(
    irName: string,
    factoryId?: string
  ): Promise<IntegrationRuntimeStatus> {
    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/integrationRuntimes/${irName}/getStatus?api-version=${API_VERSION}`;
    return this.post<IntegrationRuntimeStatus>(url);
  }

  /**
   * Start an integration runtime (managed IR only)
   */
  async startIntegrationRuntime(irName: string, factoryId?: string): Promise<void> {
    if (!this.config.enableWrite) {
      throw new Error(
        'Write operations are disabled. Set AZURE_DATA_FACTORY_ENABLE_WRITE=true to enable.'
      );
    }

    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/integrationRuntimes/${irName}/start?api-version=${API_VERSION}`;
    await this.post<void>(url);
  }

  /**
   * Stop an integration runtime (managed IR only)
   */
  async stopIntegrationRuntime(irName: string, factoryId?: string): Promise<void> {
    if (!this.config.enableWrite) {
      throw new Error(
        'Write operations are disabled. Set AZURE_DATA_FACTORY_ENABLE_WRITE=true to enable.'
      );
    }

    const factory = this.resolveFactory(factoryId);
    const url = `${this.getBaseUrl(factory)}/integrationRuntimes/${irName}/stop?api-version=${API_VERSION}`;
    await this.post<void>(url);
  }
}
