import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

export interface LogAnalyticsResourceConfig {
  id: string;
  name: string;
  workspaceId: string;
  active: boolean;
  apiKey?: string;
  description?: string;
}

export interface LogAnalyticsConfig {
  resources: LogAnalyticsResourceConfig[];
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

export class LogAnalyticsService {
  private config: LogAnalyticsConfig;
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;
  private readonly baseUrl = 'https://api.loganalytics.io/v1';

  constructor(config: LogAnalyticsConfig) {
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
        },
      });
    }
  }

  /**
   * Get access token for Log Analytics API using Microsoft Entra ID OAuth
   * Implements token caching with 5-minute buffer before expiry
   */
  private async getAccessToken(): Promise<string> {
    if (!this.msalClient) {
      throw new Error('MSAL client not initialized. Use Entra ID authentication method.');
    }

    // Return cached token if still valid (with 5-minute buffer)
    const currentTime = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    if (this.accessToken && this.tokenExpirationTime > currentTime + bufferTime) {
      return this.accessToken;
    }

    // Acquire new token
    try {
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://api.loganalytics.io/.default'],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;
      this.tokenExpirationTime = result.expiresOn ? result.expiresOn.getTime() : 0;

      return this.accessToken;
    } catch (error: any) {
      throw new Error(`Failed to acquire access token: ${error.message}`);
    }
  }

  /**
   * Get authorization headers based on authentication method
   */
  private async getAuthHeaders(resource: LogAnalyticsResourceConfig): Promise<Record<string, string>> {
    if (this.config.authMethod === 'entra-id') {
      const token = await this.getAccessToken();
      return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
    } else if (this.config.authMethod === 'api-key') {
      if (!resource.apiKey) {
        throw new Error(`API key not configured for resource: ${resource.id}`);
      }
      return {
        'X-Api-Key': resource.apiKey,
        'Content-Type': 'application/json',
      };
    } else {
      throw new Error(`Unsupported authentication method: ${this.config.authMethod}`);
    }
  }

  /**
   * Execute a KQL query against a Log Analytics workspace
   */
  async executeQuery(resourceId: string, query: string, timespan?: string): Promise<QueryResult> {
    const resource = this.getResourceById(resourceId);

    try {
      const headers = await this.getAuthHeaders(resource);
      const url = `${this.baseUrl}/workspaces/${resource.workspaceId}/query`;

      const requestBody: any = { query };
      if (timespan) {
        requestBody.timespan = timespan;
      }

      const response = await axios.post(url, requestBody, {
        headers,
        timeout: 30000, // 30-second timeout
      });

      return response.data;
    } catch (error: any) {
      // Enhanced error handling
      let errorMessage = 'Unknown error';
      let errorDetails: any = {};

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        switch (status) {
          case 401:
            errorMessage = 'Authentication failed. Check your credentials and ensure the app registration has proper permissions.';
            break;
          case 403:
            errorMessage = 'Access denied. Ensure the service principal has "Log Analytics Reader" role on the workspace.';
            break;
          case 429:
            errorMessage = 'Rate limit exceeded. Reduce query frequency or upgrade authentication method.';
            if (error.response.headers['retry-after']) {
              errorMessage += ` Retry after ${error.response.headers['retry-after']} seconds.`;
            }
            break;
          case 400:
            if (data && data.error) {
              if (data.error.code === 'SyntaxError') {
                errorMessage = `KQL syntax error: ${data.error.message}`;
              } else if (data.error.code === 'SemanticError') {
                errorMessage = `KQL semantic error: ${data.error.message}. Check table/column names.`;
              } else {
                errorMessage = `Bad request: ${data.error.message}`;
              }
            } else {
              errorMessage = 'Bad request. Check your query syntax.';
            }
            break;
          case 504:
            errorMessage = 'Query timeout. Try reducing the time range or simplifying the query.';
            break;
          default:
            errorMessage = `HTTP ${status}: ${data?.error?.message || error.message}`;
        }

        errorDetails = {
          status,
          code: data?.error?.code,
          message: data?.error?.message,
        };
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage = 'Network error: Unable to reach Log Analytics API. Check your internet connection.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Request timeout. The query took too long to execute.';
      } else {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Get workspace metadata (schema)
   */
  async getMetadata(resourceId: string): Promise<MetadataResult> {
    const resource = this.getResourceById(resourceId);

    try {
      const headers = await this.getAuthHeaders(resource);
      const url = `${this.baseUrl}/workspaces/${resource.workspaceId}/metadata`;

      const response = await axios.get(url, {
        headers,
        timeout: 15000,
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  /**
   * Test workspace access by executing a simple query
   */
  async testWorkspaceAccess(resourceId: string): Promise<{ success: boolean; message: string; details?: any }> {
    const resource = this.getResourceById(resourceId);

    try {
      // Execute a minimal query to test access
      const result = await this.executeQuery(resourceId, 'print test="success"');

      return {
        success: true,
        message: `Successfully connected to workspace: ${resource.name}`,
        details: {
          workspaceId: resource.workspaceId,
          authMethod: this.config.authMethod,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to access workspace: ${error.message}`,
        details: {
          workspaceId: resource.workspaceId,
          error: error.message,
        },
      };
    }
  }

  /**
   * Get recent events from any table
   */
  async getRecentEvents(
    resourceId: string,
    tableName: string,
    timespan: string = 'PT1H',
    limit: number = 100
  ): Promise<QueryResult> {
    const query = `
      ${tableName}
      | where TimeGenerated > ago(${this.convertTimespanToKQL(timespan)})
      | order by TimeGenerated desc
      | take ${limit}
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Search logs across tables or specific table
   */
  async searchLogs(
    resourceId: string,
    searchText: string,
    tableName?: string,
    timespan: string = 'PT1H',
    limit: number = 100
  ): Promise<QueryResult> {
    const tableFilter = tableName || '*';
    const query = `
      ${tableFilter}
      | where TimeGenerated > ago(${this.convertTimespanToKQL(timespan)})
      | where * contains "${searchText}"
      | order by TimeGenerated desc
      | take ${limit}
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Get Azure Function logs from FunctionAppLogs table
   */
  async getFunctionLogs(
    resourceId: string,
    functionName?: string,
    timespan: string = 'PT1H',
    severityLevel?: number,
    limit: number = 100
  ): Promise<QueryResult> {
    let query = `
      FunctionAppLogs
      | where TimeGenerated > ago(${this.convertTimespanToKQL(timespan)})
    `;

    if (functionName) {
      query += `\n      | where FunctionName == "${functionName}"`;
    }

    if (severityLevel !== undefined) {
      query += `\n      | where SeverityLevel >= ${severityLevel}`;
    }

    query += `
      | order by TimeGenerated desc
      | take ${limit}
      | project TimeGenerated, FunctionName, Message, SeverityLevel, ExceptionDetails, HostInstanceId
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Get Azure Function errors
   */
  async getFunctionErrors(
    resourceId: string,
    functionName?: string,
    timespan: string = 'PT1H',
    limit: number = 100
  ): Promise<QueryResult> {
    let query = `
      FunctionAppLogs
      | where TimeGenerated > ago(${this.convertTimespanToKQL(timespan)})
      | where ExceptionDetails != ""
    `;

    if (functionName) {
      query += `\n      | where FunctionName == "${functionName}"`;
    }

    query += `
      | order by TimeGenerated desc
      | take ${limit}
      | project TimeGenerated, FunctionName, Message, ExceptionDetails, SeverityLevel, HostInstanceId
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Get Azure Function execution statistics
   */
  async getFunctionStats(
    resourceId: string,
    functionName?: string,
    timespan: string = 'PT1H'
  ): Promise<QueryResult> {
    let query = `
      FunctionAppLogs
      | where TimeGenerated > ago(${this.convertTimespanToKQL(timespan)})
    `;

    if (functionName) {
      query += `\n      | where FunctionName == "${functionName}"`;
      query += `
      | summarize
          TotalExecutions = count(),
          ErrorCount = countif(ExceptionDetails != ""),
          SuccessCount = countif(ExceptionDetails == ""),
          UniqueHosts = dcount(HostInstanceId)
      | extend SuccessRate = round(100.0 * SuccessCount / TotalExecutions, 2)
      `.trim();
    } else {
      query += `
      | summarize
          TotalExecutions = count(),
          ErrorCount = countif(ExceptionDetails != ""),
          SuccessCount = countif(ExceptionDetails == ""),
          UniqueFunctions = dcount(FunctionName),
          UniqueHosts = dcount(HostInstanceId)
        by FunctionName
      | extend SuccessRate = round(100.0 * SuccessCount / TotalExecutions, 2)
      | order by TotalExecutions desc
      `.trim();
    }

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Get Azure Function invocations from traces or requests table
   */
  async getFunctionInvocations(
    resourceId: string,
    functionName?: string,
    timespan: string = 'PT1H',
    limit: number = 100
  ): Promise<QueryResult> {
    // Try requests table first (for HTTP-triggered functions)
    let query = `
      union isfuzzy=true requests, traces
      | where TimeGenerated > ago(${this.convertTimespanToKQL(timespan)})
    `;

    if (functionName) {
      query += `\n      | where operation_Name contains "${functionName}" or name contains "${functionName}"`;
    }

    query += `
      | order by TimeGenerated desc
      | take ${limit}
      | project TimeGenerated, operation_Name, name, success, resultCode, duration, timestamp
    `.trim();

    return this.executeQuery(resourceId, query, timespan);
  }

  /**
   * Get all configured resources
   */
  getAllResources(): LogAnalyticsResourceConfig[] {
    return this.config.resources;
  }

  /**
   * Get only active resources
   */
  getActiveResources(): LogAnalyticsResourceConfig[] {
    return this.config.resources.filter((r) => r.active);
  }

  /**
   * Get resource by ID and validate it's active
   */
  getResourceById(resourceId: string): LogAnalyticsResourceConfig {
    const resource = this.config.resources.find((r) => r.id === resourceId);

    if (!resource) {
      const availableIds = this.config.resources.map((r) => r.id).join(', ');
      throw new Error(
        `Resource '${resourceId}' not found. Available resources: ${availableIds || 'none'}`
      );
    }

    if (!resource.active) {
      throw new Error(
        `Resource '${resourceId}' is inactive. Set 'active: true' in configuration to enable it.`
      );
    }

    return resource;
  }

  /**
   * Convert ISO 8601 duration to KQL timespan format
   * PT1H -> 1h, P1D -> 1d, PT30M -> 30m, etc.
   */
  convertTimespanToKQL(iso8601Duration: string): string {
    // Handle common patterns
    const patterns: Record<string, string> = {
      'PT15M': '15m',
      'PT30M': '30m',
      'PT1H': '1h',
      'PT2H': '2h',
      'PT6H': '6h',
      'PT12H': '12h',
      'PT24H': '24h',
      'P1D': '1d',
      'P2D': '2d',
      'P7D': '7d',
      'P30D': '30d',
    };

    if (patterns[iso8601Duration]) {
      return patterns[iso8601Duration];
    }

    // Parse ISO 8601 duration
    const regex = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const match = iso8601Duration.match(regex);

    if (!match) {
      // If no match, return as-is (might be KQL format already)
      return iso8601Duration;
    }

    const [, days, hours, minutes, seconds] = match;

    // Convert to KQL format (use largest unit)
    if (days) return `${days}d`;
    if (hours) return `${hours}h`;
    if (minutes) return `${minutes}m`;
    if (seconds) return `${seconds}s`;

    return '1h'; // Default fallback
  }

  /**
   * Validate KQL query (basic check)
   */
  validateQuery(query: string): { valid: boolean; error?: string } {
    if (!query || query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' };
    }

    // Check for dangerous operations (optional - KQL is read-only by nature)
    const dangerousKeywords = ['invoke', 'execute', 'evaluate'];
    const lowerQuery = query.toLowerCase();

    for (const keyword of dangerousKeywords) {
      if (lowerQuery.includes(keyword)) {
        return {
          valid: false,
          error: `Query contains potentially dangerous keyword: ${keyword}`
        };
      }
    }

    return { valid: true };
  }
}
