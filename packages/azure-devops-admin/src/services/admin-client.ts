/**
 * Shared HTTP client for Azure DevOps Admin API.
 * Provides authenticated request methods, project/feed validation, and date formatting.
 */
import axios from 'axios';
import type { AzureDevOpsAdminConfig, AdoApiCollectionResponse } from '../types.js';
import { AdoAuthProvider, type AdoAuthConfig } from '../ado-auth-provider.js';

export class AdminClient {
  readonly config: AzureDevOpsAdminConfig;
  readonly baseUrl: string;
  readonly feedsUrl: string;
  readonly apiVersion: string;
  private readonly authProvider: AdoAuthProvider;

  constructor(config: AzureDevOpsAdminConfig, authConfig: AdoAuthConfig) {
    this.config = {
      ...config,
      apiVersion: config.apiVersion || '7.1',
      enablePipelineUpsert: config.enablePipelineUpsert ?? false,
      enablePipelineDelete: config.enablePipelineDelete ?? false,
      enableServiceConnUpsert: config.enableServiceConnUpsert ?? false,
      enableServiceConnDelete: config.enableServiceConnDelete ?? false,
      enableVariableGroupUpsert: config.enableVariableGroupUpsert ?? false,
      enableVariableGroupDelete: config.enableVariableGroupDelete ?? false,
      enableAgentPoolUpsert: config.enableAgentPoolUpsert ?? false,
      enableAgentPoolDisable: config.enableAgentPoolDisable ?? false,
      enableEnvironmentUpsert: config.enableEnvironmentUpsert ?? false,
      enableEnvironmentDelete: config.enableEnvironmentDelete ?? false,
      enableClassificationNodeUpsert: config.enableClassificationNodeUpsert ?? false,
      enableClassificationNodeDelete: config.enableClassificationNodeDelete ?? false,
      enableProjectUpsert: config.enableProjectUpsert ?? false,
      enableProjectDelete: config.enableProjectDelete ?? false,
    };

    this.baseUrl = `https://dev.azure.com/${this.config.organization}`;
    this.feedsUrl = `https://feeds.dev.azure.com/${this.config.organization}`;
    this.apiVersion = this.config.apiVersion!;
    this.authProvider = new AdoAuthProvider(authConfig);
  }

  validateProject(project: string): void {
    if (this.config.projects.includes('*')) return;
    if (!this.config.projects.includes(project)) {
      throw new Error(`Project '${project}' is not in the allowed projects list. Allowed projects: ${this.config.projects.join(', ')}`);
    }
  }

  validateFeed(feedName: string): void {
    if (this.config.feeds && this.config.feeds.length > 0
        && !this.config.feeds.includes(feedName)) {
      throw new Error(
        `Feed '${feedName}' is not in the allowed feeds list. ` +
        `Allowed feeds: ${this.config.feeds.join(', ')}`
      );
    }
  }

  /** Authentication mode (pat or entra-id) */
  get authMode(): string { return this.authProvider.mode; }

  /**
   * Converts a date string to ISO 8601 format with time component.
   * Azure DevOps Classification Nodes API requires full ISO 8601 format.
   * Input: "2026-02-16" -> Output: "2026-02-16T00:00:00Z"
   */
  formatDateForAdo(dateStr: string): string {
    if (dateStr.includes('T')) {
      return dateStr;
    }
    return `${dateStr}T00:00:00Z`;
  }

  async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
    data?: any,
    customHeaders?: Record<string, string>,
    contentType?: string,
    baseUrlOverride?: string
  ): Promise<T> {
    try {
      const authHeader = await this.authProvider.getAuthHeader();
      const url = `${baseUrlOverride || this.baseUrl}/${endpoint}`;

      const defaultContentType = method === 'PATCH' ? 'application/json-patch+json' : 'application/json';

      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': authHeader,
          'Content-Type': contentType || defaultContentType,
          'Accept': 'application/json',
          ...customHeaders
        },
        data,
        maxRedirects: 0,
      });

      return response.data as T;
    } catch (error: any) {
      const errorDetails = error.response?.data?.message || error.response?.data || error.message;
      console.error('Azure DevOps Admin API request failed:', {
        endpoint,
        method,
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: errorDetails
      });

      if (error.response?.status === 302) {
        throw new Error(
          'Azure DevOps authentication failed (302 redirect to sign-in). ' +
          'Your PAT may be expired, revoked, or not resolved (e.g. 1Password op:// reference). ' +
          'Restart the MCP server to re-authenticate.'
        );
      }
      if (error.response?.status === 401) {
        throw new Error('Azure DevOps authentication failed. Please check your PAT token or Entra ID credentials and permissions.');
      }
      if (error.response?.status === 403) {
        const detail = typeof errorDetails === 'string' ? errorDetails : '';
        throw new Error(`Azure DevOps access denied: ${detail || 'Please check your PAT scopes and project permissions.'}`);
      }
      if (error.response?.status === 404) {
        throw new Error(`Azure DevOps resource not found: ${endpoint}`);
      }

      throw new Error(`Azure DevOps Admin API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }
}
