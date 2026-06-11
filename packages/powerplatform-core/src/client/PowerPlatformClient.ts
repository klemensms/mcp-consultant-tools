/**
 * PowerPlatformClient
 *
 * Core HTTP client for PowerPlatform/Dataverse API.
 * Handles authentication (service principal or interactive) and HTTP requests.
 *
 * All modular services use this client for API access.
 */

import axios from 'axios';
import { type AuthProvider, createAuthProvider } from '../auth/index.js';
import type { PowerPlatformConfig } from './types.js';
import { getRequestCallerObjectId } from './request-context.js';

export class PowerPlatformClient {
  private config: PowerPlatformConfig;
  private authProvider: AuthProvider;
  private environmentId: string | null = null;
  private _callerObjectId: string | null = null;

  /**
   * Create a new PowerPlatformClient
   * @param config - PowerPlatform configuration
   * @param authProvider - Optional custom auth provider (uses createAuthProvider if not provided)
   */
  constructor(config: PowerPlatformConfig, authProvider?: AuthProvider) {
    this.config = config;

    // Use provided auth provider or create one based on config
    this.authProvider =
      authProvider ||
      createAuthProvider({
        organizationUrl: config.organizationUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tenantId: config.tenantId,
      });
  }

  /**
   * Set the CallerObjectId for Dataverse impersonation.
   * When set, all requests include CallerObjectId and MSCRMCallerID headers,
   * causing Dataverse to execute as the specified user (enforcing their security roles).
   * Requires the app user to have the prvActOnBehalfOfAnotherUser privilege.
   */
  setCallerObjectId(oid: string | null): void {
    this._callerObjectId = oid;
  }

  /**
   * Get the effective CallerObjectId for the current request.
   * Priority: instance-level > request-context (from HTTP server JWT)
   */
  private getEffectiveCallerObjectId(): string | null {
    return this._callerObjectId || getRequestCallerObjectId();
  }

  /**
   * Get the organization URL
   */
  getOrganizationUrl(): string {
    return this.config.organizationUrl;
  }

  /**
   * Get the full configuration
   */
  getConfig(): PowerPlatformConfig {
    return this.config;
  }

  /**
   * Get the authentication mode being used
   */
  getAuthMode(): 'service-principal' | 'interactive' {
    return this.authProvider.getAuthMode();
  }

  /**
   * Get information about the authenticated user (if using interactive auth)
   */
  async getUserInfo(): Promise<{ name: string; email: string; oid: string } | null> {
    if (this.authProvider.getUserInfo) {
      return this.authProvider.getUserInfo();
    }
    return null;
  }

  /**
   * Clear cached tokens (logout) - only applicable for interactive auth
   */
  async logout(): Promise<void> {
    if (this.authProvider.clearCache) {
      await this.authProvider.clearCache();
    }
  }

  /**
   * Get an access token for the PowerPlatform/Dataverse API
   */
  async getAccessToken(): Promise<string> {
    return this.authProvider.getAccessToken(this.config.organizationUrl);
  }

  /**
   * Get an access token for the Power Automate Flow API
   * Used for Power Automate flow operations via api.flow.microsoft.com
   * (getFlowRunDetails, cancelFlowRun, resubmitFlowRun)
   */
  async getManagementToken(): Promise<string> {
    return this.authProvider.getAccessToken('https://service.flow.microsoft.com');
  }

  /**
   * Get the environment ID from the organization URL
   */
  async getEnvironmentId(): Promise<string> {
    if (this.environmentId) {
      return this.environmentId;
    }

    // Extract from organization URL or fetch from API
    const orgUrl = this.config.organizationUrl;
    const match = orgUrl.match(/https:\/\/([^.]+)\./);
    if (match) {
      this.environmentId = match[1];
    }

    return this.environmentId || '';
  }

  /**
   * Make an authenticated request to the PowerPlatform API
   *
   * @param endpoint - API endpoint (relative to organization URL)
   * @param method - HTTP method
   * @param data - Request body data
   * @param additionalHeaders - Additional HTTP headers
   * @returns Response data
   */
  async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    data?: unknown,
    additionalHeaders?: Record<string, string>
  ): Promise<T> {
    try {
      const token = await this.getAccessToken();
      const callerOid = this.getEffectiveCallerObjectId();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...additionalHeaders,
      };

      if (callerOid) {
        headers['CallerObjectId'] = callerOid;
        headers['MSCRMCallerID'] = callerOid;
      }

      // Add Content-Type for POST/PUT/PATCH requests
      if (method !== 'GET' && method !== 'DELETE' && data) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await axios({
        method,
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers,
        data,
      });

      return response.data as T;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
          headers?: Record<string, string>;
        };
        message?: string;
      };
      const errorDetails =
        axiosError.response?.data?.error || axiosError.response?.data || axiosError.message;
      console.error('PowerPlatform API request failed:', {
        endpoint,
        method,
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        error: errorDetails,
      });
      throw new Error(
        `PowerPlatform API request failed: ${axiosError.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Make a request and return the full response (including headers)
   * Useful for operations that need to check response headers
   */
  async makeRequestWithResponse<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    data?: unknown,
    additionalHeaders?: Record<string, string>
  ): Promise<{ data: T; headers: Record<string, string>; status: number }> {
    try {
      const token = await this.getAccessToken();
      const callerOid = this.getEffectiveCallerObjectId();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...additionalHeaders,
      };

      if (callerOid) {
        headers['CallerObjectId'] = callerOid;
        headers['MSCRMCallerID'] = callerOid;
      }

      if (method !== 'GET' && method !== 'DELETE' && data) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await axios({
        method,
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers,
        data,
      });

      return {
        data: response.data as T,
        headers: response.headers as Record<string, string>,
        status: response.status,
      };
    } catch (error: unknown) {
      const axiosError = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
        };
        message?: string;
      };
      const errorDetails =
        axiosError.response?.data?.error || axiosError.response?.data || axiosError.message;
      throw new Error(
        `PowerPlatform API request failed: ${axiosError.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Make a request that returns no content (204 response)
   * Used for DELETE operations and some updates
   */
  async makeRequestNoContent(
    endpoint: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'DELETE',
    data?: unknown,
    additionalHeaders?: Record<string, string>
  ): Promise<void> {
    try {
      const token = await this.getAccessToken();
      const callerOid = this.getEffectiveCallerObjectId();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...additionalHeaders,
      };

      if (callerOid) {
        headers['CallerObjectId'] = callerOid;
        headers['MSCRMCallerID'] = callerOid;
      }

      if (data) {
        headers['Content-Type'] = 'application/json';
      }

      await axios({
        method,
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers,
        data,
      });
    } catch (error: unknown) {
      const axiosError = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
        };
        message?: string;
      };
      const errorDetails =
        axiosError.response?.data?.error || axiosError.response?.data || axiosError.message;
      throw new Error(
        `PowerPlatform API request failed: ${axiosError.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }
}
