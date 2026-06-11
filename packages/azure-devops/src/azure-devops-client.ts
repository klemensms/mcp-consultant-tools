/**
 * Azure DevOps HTTP Client
 *
 * Handles authentication, base URL construction, and API requests.
 * Extracted from AzureDevOpsService constructor + makeRequest().
 */
import axios, { type AxiosResponse } from 'axios';
import type { AzureDevOpsConfig, AdoApiCollectionResponse } from './models/index.js';
import { AdoAuthProvider, type AdoAuthConfig } from './ado-auth-provider.js';

export class AzureDevOpsClient {
  private readonly _config: AzureDevOpsConfig;
  private readonly _baseUrl: string;
  private readonly _searchUrl: string;
  private readonly _extMgmtUrl: string;
  private readonly _authProvider: AdoAuthProvider;
  private readonly _apiVersion: string;

  constructor(config: AzureDevOpsConfig, authConfig: AdoAuthConfig) {
    this._config = {
      ...config,
      apiVersion: config.apiVersion || '7.1',
      enableWorkItemWrite: config.enableWorkItemWrite ?? false,
      enableWorkItemDelete: config.enableWorkItemDelete ?? false,
      enableWikiWrite: config.enableWikiWrite ?? false,
      enableWikiDelete: config.enableWikiDelete ?? false,
      enablePullRequestWrite: config.enablePullRequestWrite ?? false,
    };

    this._baseUrl = `https://dev.azure.com/${this._config.organization}`;
    this._searchUrl = `https://almsearch.dev.azure.com/${this._config.organization}`;
    this._extMgmtUrl = `https://extmgmt.dev.azure.com/${this._config.organization}`;
    this._apiVersion = this._config.apiVersion!;

    this._authProvider = new AdoAuthProvider(authConfig);
  }

  /** Read-only access to config */
  get config(): AzureDevOpsConfig { return this._config; }

  /** Read-only access to organization name */
  get organization(): string { return this._config.organization; }

  /** Read-only access to API version */
  get apiVersion(): string { return this._apiVersion; }

  /** Read-only access to base URL */
  get baseUrl(): string { return this._baseUrl; }

  /** Read-only access to extension management URL */
  get extMgmtUrl(): string { return this._extMgmtUrl; }

  /** Authentication mode (pat or entra-id) */
  get authMode(): string { return this._authProvider.mode; }

  /**
   * Validate that a project is in the allowed list
   */
  validateProject(project: string): void {
    if (this._config.projects.includes('*')) return;
    if (!this._config.projects.includes(project)) {
      throw new Error(`Project '${project}' is not in the allowed projects list. Allowed projects: ${this._config.projects.join(', ')}`);
    }
  }

  /**
   * Make an authenticated request to the Azure DevOps API
   */
  async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
    data?: any,
    useSearchUrl: boolean = false,
    customHeaders?: Record<string, string>
  ): Promise<T> {
    try {
      const authHeader = await this._authProvider.getAuthHeader();
      const baseUrl = useSearchUrl ? this._searchUrl : this._baseUrl;
      const url = `${baseUrl}/${endpoint}`;

      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': authHeader,
          'Content-Type': method === 'PATCH' ? 'application/json-patch+json' : 'application/json',
          'Accept': 'application/json',
          ...customHeaders  // Merge custom headers (can override defaults)
        },
        data,
        maxRedirects: 0,  // ADO API never redirects on success; 302 = auth failure
      });

      return response.data as T;
    } catch (error: any) {
      const errorDetails = error.response?.data?.message || error.response?.data || error.message;
      console.error('Azure DevOps API request failed:', {
        endpoint,
        method,
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: errorDetails
      });

      // 302 redirect = ADO rejected credentials and is redirecting to sign-in page.
      // This happens when PAT is expired/invalid or op:// references weren't resolved.
      if (error.response?.status === 302) {
        throw new Error(
          'Azure DevOps authentication failed (302 redirect to sign-in). ' +
          'Your PAT may be expired, revoked, or not resolved (e.g. 1Password op:// reference). ' +
          'Restart the MCP server to re-authenticate.'
        );
      }

      // Provide user-friendly error messages
      if (error.response?.status === 401) {
        throw new Error('Azure DevOps authentication failed. Please check your credentials (PAT or Entra ID app registration) and permissions.');
      }
      if (error.response?.status === 403) {
        throw new Error('Azure DevOps access denied. Please check your credential scopes and project permissions.');
      }
      if (error.response?.status === 404) {
        throw new Error(`Azure DevOps resource not found: ${endpoint}`);
      }

      throw new Error(`Azure DevOps API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }

  /**
   * Make a raw request returning the full AxiosResponse (for ETag/header access)
   */
  async requestRaw(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
    data?: any,
    customHeaders?: Record<string, string>,
    responseType?: 'json' | 'arraybuffer'
  ): Promise<AxiosResponse> {
    try {
      const authHeader = await this._authProvider.getAuthHeader();
      const url = `${this._baseUrl}/${endpoint}`;

      return await axios({
        method,
        url,
        headers: {
          'Authorization': authHeader,
          'Content-Type': method === 'PATCH' ? 'application/json-patch+json' : 'application/json',
          'Accept': responseType === 'arraybuffer' ? 'application/octet-stream' : 'application/json',
          ...customHeaders
        },
        data,
        responseType: responseType || 'json',
        maxRedirects: 0,
      });
    } catch (error: any) {
      const errorDetails = error.response?.data?.message || error.response?.data || error.message;
      console.error('Azure DevOps API request failed:', {
        endpoint,
        method,
        status: error.response?.status,
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
        throw new Error('Azure DevOps authentication failed. Please check your credentials (PAT or Entra ID app registration) and permissions.');
      }
      if (error.response?.status === 403) {
        throw new Error('Azure DevOps access denied. Please check your credential scopes and project permissions.');
      }
      if (error.response?.status === 404) {
        throw new Error(`Azure DevOps resource not found: ${endpoint}`);
      }

      throw new Error(`Azure DevOps API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }

  /**
   * Make an authenticated request to the Azure DevOps Extension Management API.
   * Uses extmgmt.dev.azure.com instead of dev.azure.com.
   */
  async extRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
    data?: any,
    customHeaders?: Record<string, string>
  ): Promise<T> {
    try {
      const authHeader = await this._authProvider.getAuthHeader();
      const url = `${this._extMgmtUrl}/${endpoint}`;

      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...customHeaders
        },
        data,
        maxRedirects: 0,
      });

      return response.data as T;
    } catch (error: any) {
      const errorDetails = error.response?.data?.message || error.response?.data || error.message;
      console.error('Azure DevOps Extension Management API request failed:', {
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
        throw new Error('Azure DevOps authentication failed. Please check your credentials (PAT or Entra ID app registration) and permissions.');
      }
      if (error.response?.status === 403) {
        throw new Error('Azure DevOps access denied. Please check your credential scopes and project permissions.');
      }
      if (error.response?.status === 404) {
        throw new Error(`Azure DevOps extension resource not found: ${endpoint}`);
      }

      throw new Error(`Azure DevOps Extension Management API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }

  // Convenience methods
  async get<T>(endpoint: string, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, 'GET', undefined, false, customHeaders);
  }

  async post<T>(endpoint: string, data?: any, useSearchUrl: boolean = false, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, 'POST', data, useSearchUrl, customHeaders);
  }

  async patch<T>(endpoint: string, data?: any, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, 'PATCH', data, false, customHeaders);
  }

  async put<T>(endpoint: string, data?: any, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, 'PUT', data, false, customHeaders);
  }

  async del<T>(endpoint: string, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, 'DELETE', undefined, false, customHeaders);
  }
}
