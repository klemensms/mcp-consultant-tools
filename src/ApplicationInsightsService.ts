import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

export interface ApplicationInsightsResourceConfig {
  id: string;
  name: string;
  appId: string;
  active: boolean;
  apiKey?: string;
  description?: string;
}

export interface ApplicationInsightsConfig {
  resources: ApplicationInsightsResourceConfig[];
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  authMethod: 'entra-id' | 'api-key';
}

export interface QueryResult {
  tables: {
    name: string;
    columns: { name: string; type: string }[];
    rows: any[][];
  }[];
}

export interface MetadataResult {
  tables: {
    name: string;
    columns: { name: string; type: string; description?: string }[];
  }[];
}

export class ApplicationInsightsService {
  private config: ApplicationInsightsConfig;
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;
  private readonly baseUrl = 'https://api.applicationinsights.io/v1';

  constructor(config: ApplicationInsightsConfig) {
    this.config = config;

    // Initialize MSAL client if using Entra ID auth
    if (this.config.authMethod === 'entra-id') {
      if (!this.config.tenantId || !this.config.clientId || !this.config.clientSecret) {
        throw new Error('Entra ID authentication requires tenantId, clientId, and clientSecret');
      }

      this.msalClient = new ConfidentialClientApplication({
        auth: {
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
          authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
        }
      });
    }
  }

  /**
   * Get an access token for the Application Insights API (Entra ID auth)
   */
  private async getAccessToken(): Promise<string> {
    if (this.config.authMethod !== 'entra-id' || !this.msalClient) {
      throw new Error('Entra ID authentication not configured');
    }

    const currentTime = Date.now();

    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://api.applicationinsights.io/.default'],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;

      // Set expiration time (subtract 5 minutes to refresh early)
      if (result.expiresOn) {
        this.tokenExpirationTime = result.expiresOn.getTime() - (5 * 60 * 1000);
      }

      return this.accessToken;
    } catch (error) {
      console.error('Error acquiring access token:', error);
      throw new Error('Application Insights authentication failed');
    }
  }

  /**
   * Get authentication headers based on configuration
   */
  private async getAuthHeaders(resourceId: string): Promise<Record<string, string>> {
    const resource = this.getResourceById(resourceId);

    if (this.config.authMethod === 'entra-id') {
      const token = await this.getAccessToken();
      return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      };
    } else {
      // API Key authentication
      if (!resource.apiKey) {
        throw new Error(`API key not configured for resource '${resourceId}'`);
      }
      return {
        'x-api-key': resource.apiKey,
        'Accept': 'application/json',
      };
    }
  }

  /**
   * Get active resources
   */
  getActiveResources(): ApplicationInsightsResourceConfig[] {
    return this.config.resources.filter(r => r.active);
  }

  /**
   * Get all resources (including inactive)
   */
  getAllResources(): ApplicationInsightsResourceConfig[] {
    return this.config.resources;
  }

  /**
   * Get resource by ID
   */
  getResourceById(resourceId: string): ApplicationInsightsResourceConfig {
    const resource = this.config.resources.find(r => r.id === resourceId);
    if (!resource) {
      throw new Error(`Application Insights resource '${resourceId}' not found`);
    }
    if (!resource.active) {
      throw new Error(`Application Insights resource '${resourceId}' is inactive`);
    }
    return resource;
  }

  /**
   * Execute a KQL query against an Application Insights resource
   */
  async executeQuery(
    resourceId: string,
    query: string,
    timespan?: string
  ): Promise<QueryResult> {
    try {
      const resource = this.getResourceById(resourceId);
      const headers = await this.getAuthHeaders(resourceId);

      const url = `${this.baseUrl}/apps/${resource.appId}/query`;
      const params: any = { query };
      if (timespan) {
        params.timespan = timespan;
      }

      const response = await axios.get<QueryResult>(url, {
        headers,
        params,
        timeout: 30000, // 30 second timeout
      });

      return response.data;
    } catch (error: any) {
      // Handle timeout
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error(
          'Application Insights query timed out after 30 seconds. ' +
          'Try reducing the time range or simplifying the query.'
        );
      }

      // Handle network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error(
          'Network error: Unable to connect to Application Insights API. ' +
          'Check your internet connection and firewall settings.'
        );
      }

      const errorDetails = error.response?.data?.error?.message || error.message;
      console.error('Application Insights query failed:', {
        resourceId,
        query: query.substring(0, 100) + '...',
        error: errorDetails,
      });

      // Provide user-friendly error messages
      if (error.response?.status === 401) {
        throw new Error('Application Insights authentication failed. Check credentials and permissions.');
      }
      if (error.response?.status === 403) {
        throw new Error('Application Insights access denied. Ensure you have Reader role on the resource.');
      }
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 60;
        throw new Error(
          `Application Insights rate limit exceeded. ` +
          `Please retry after ${retryAfter} seconds. ` +
          `Current limits: ${this.config.authMethod === 'entra-id' ? '60 requests/minute' : '15 requests/minute'}`
        );
      }

      // Handle KQL syntax errors
      if (error.response?.data?.error?.innererror?.code === 'SyntaxError') {
        const syntaxError = error.response.data.error.innererror.message;
        throw new Error(
          `KQL query syntax error: ${syntaxError}\n` +
          `Hint: Check table names, column names, and operator syntax`
        );
      }

      // Handle semantic errors
      if (error.response?.data?.error?.innererror?.code === 'SemanticError') {
        const semanticError = error.response.data.error.innererror.message;
        throw new Error(
          `KQL query semantic error: ${semanticError}\n` +
          `Hint: Use appinsights-get-metadata to see available tables and columns`
        );
      }

      throw new Error(`Application Insights query failed: ${errorDetails}`);
    }
  }

  /**
   * Get metadata (schema) for an Application Insights resource
   */
  async getMetadata(resourceId: string): Promise<MetadataResult> {
    try {
      const resource = this.getResourceById(resourceId);
      const headers = await this.getAuthHeaders(resourceId);

      const url = `${this.baseUrl}/apps/${resource.appId}/metadata`;

      const response = await axios.get<MetadataResult>(url, {
        headers,
        timeout: 30000,
      });

      return response.data;
    } catch (error: any) {
      const errorDetails = error.response?.data?.error?.message || error.message;
      console.error('Application Insights metadata request failed:', {
        resourceId,
        error: errorDetails,
      });

      throw new Error(`Application Insights metadata request failed: ${errorDetails}`);
    }
  }

  /**
   * Helper method: Get recent exceptions
   */
  async getRecentExceptions(
    resourceId: string,
    timespan: string = 'PT1H',
    limit: number = 50
  ): Promise<QueryResult> {
    const query = `
      exceptions
      | where timestamp > ago(${this.convertTimespanToKQL(timespan)})
      | order by timestamp desc
      | take ${limit}
      | project timestamp, type, outerMessage, innermostMessage, operation_Name, operation_Id, cloud_RoleName
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Helper method: Get slow requests
   */
  async getSlowRequests(
    resourceId: string,
    durationThresholdMs: number = 5000,
    timespan: string = 'PT1H',
    limit: number = 50
  ): Promise<QueryResult> {
    const query = `
      requests
      | where timestamp > ago(${this.convertTimespanToKQL(timespan)})
      | where duration > ${durationThresholdMs}
      | order by duration desc
      | take ${limit}
      | project timestamp, name, duration, resultCode, success, operation_Id, cloud_RoleName
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Helper method: Get failed dependencies
   */
  async getFailedDependencies(
    resourceId: string,
    timespan: string = 'PT1H',
    limit: number = 50
  ): Promise<QueryResult> {
    const query = `
      dependencies
      | where timestamp > ago(${this.convertTimespanToKQL(timespan)})
      | where success == false
      | order by timestamp desc
      | take ${limit}
      | project timestamp, name, target, type, duration, resultCode, operation_Id, cloud_RoleName
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Helper method: Get operation performance summary
   */
  async getOperationPerformance(
    resourceId: string,
    timespan: string = 'PT1H'
  ): Promise<QueryResult> {
    const query = `
      requests
      | where timestamp > ago(${this.convertTimespanToKQL(timespan)})
      | summarize
          RequestCount=count(),
          AvgDuration=avg(duration),
          P50Duration=percentile(duration, 50),
          P95Duration=percentile(duration, 95),
          P99Duration=percentile(duration, 99),
          FailureCount=countif(success == false)
        by operation_Name
      | order by RequestCount desc
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Helper method: Get traces by severity
   */
  async getTracesBySeverity(
    resourceId: string,
    severityLevel: number = 2, // 0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Critical
    timespan: string = 'PT1H',
    limit: number = 100
  ): Promise<QueryResult> {
    const query = `
      traces
      | where timestamp > ago(${this.convertTimespanToKQL(timespan)})
      | where severityLevel >= ${severityLevel}
      | order by timestamp desc
      | take ${limit}
      | project timestamp, message, severityLevel, operation_Name, operation_Id, cloud_RoleName
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Helper method: Get availability test results
   */
  async getAvailabilityResults(
    resourceId: string,
    timespan: string = 'PT24H'
  ): Promise<QueryResult> {
    const query = `
      availabilityResults
      | where timestamp > ago(${this.convertTimespanToKQL(timespan)})
      | summarize
          TotalTests=count(),
          SuccessCount=countif(success == true),
          FailureCount=countif(success == false),
          AvgDuration=avg(duration)
        by name
      | extend SuccessRate=round(100.0 * SuccessCount / TotalTests, 2)
      | order by FailureCount desc
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Helper method: Get custom events
   */
  async getCustomEvents(
    resourceId: string,
    eventName?: string,
    timespan: string = 'PT1H',
    limit: number = 100
  ): Promise<QueryResult> {
    let query = `
      customEvents
      | where timestamp > ago(${this.convertTimespanToKQL(timespan)})
    `;

    if (eventName) {
      query += `\n      | where name == "${eventName}"`;
    }

    query += `
      | order by timestamp desc
      | take ${limit}
      | project timestamp, name, customDimensions, operation_Id, cloud_RoleName
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Convert ISO 8601 duration to KQL format
   */
  private convertTimespanToKQL(timespan: string): string {
    // Convert ISO 8601 duration (PT1H, P1D) to KQL format (1h, 1d)
    const match = timespan.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) {
      return timespan; // Return as-is if not recognized
    }

    const [, days, hours, minutes, seconds] = match;
    const parts: string[] = [];

    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds) parts.push(`${seconds}s`);

    return parts.length > 0 ? parts.join('') : '1h';
  }
}
