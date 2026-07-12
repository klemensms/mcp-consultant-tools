import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { AzureAuthProvider, type AzureAuthConfig } from '../auth/AzureAuthProvider.js';
import { getApiVersion } from '../utils/arm-api-versions.js';
import type { ArmListResponse, ArmError } from '../types/arm-types.js';

/**
 * An ARM failure that still carries its HTTP status.
 *
 * Callers that fan out across many resources need to tell "this resource has
 * nothing configured" (200 with an empty list) apart from "we were not allowed
 * to look" (403). Without the status, the two collapse into one bucket and an
 * audit reports a permissions gap as a clean result.
 */
export interface ArmRequestError extends Error {
  status?: number;
}

/** Read the HTTP status off an error thrown by {@link ArmClient}, if it has one. */
export function getArmErrorStatus(error: unknown): number | undefined {
  return error instanceof Error ? (error as ArmRequestError).status : undefined;
}

/**
 * Configuration for the ARM client.
 */
export interface ArmClientConfig extends AzureAuthConfig {
  subscriptionId: string;
  resourceGroup?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * HTTP client for Azure Resource Manager API.
 * Handles authentication, pagination, retries, and error handling.
 */
export class ArmClient {
  private client: AxiosInstance;
  private authProvider: AzureAuthProvider;
  private subscriptionId: string;
  private defaultResourceGroup?: string;
  private maxRetries: number;
  private retryDelayMs: number;

  private static readonly BASE_URL = 'https://management.azure.com';
  private static readonly RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

  constructor(config: ArmClientConfig) {
    this.authProvider = new AzureAuthProvider({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    this.subscriptionId = config.subscriptionId;
    this.defaultResourceGroup = config.resourceGroup;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;

    this.client = axios.create({
      baseURL: ArmClient.BASE_URL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get the subscription ID.
   */
  getSubscriptionId(): string {
    return this.subscriptionId;
  }

  /**
   * Get the default resource group.
   */
  getDefaultResourceGroup(): string | undefined {
    return this.defaultResourceGroup;
  }

  /**
   * Make an authenticated GET request to the ARM API.
   */
  async get<T>(path: string, apiVersion?: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, apiVersion, params);
    return this.executeWithRetry<T>('GET', url);
  }

  /**
   * Make an authenticated POST request to the ARM API.
   */
  async post<T>(
    path: string,
    body: unknown,
    apiVersion?: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = this.buildUrl(path, apiVersion, params);
    return this.executeWithRetry<T>('POST', url, body);
  }

  /**
   * Make an authenticated PUT request to the ARM API.
   */
  async put<T>(
    path: string,
    body: unknown,
    apiVersion?: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = this.buildUrl(path, apiVersion, params);
    return this.executeWithRetry<T>('PUT', url, body);
  }

  /**
   * Make an authenticated PATCH request to the ARM API.
   */
  async patch<T>(
    path: string,
    body: unknown,
    apiVersion?: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = this.buildUrl(path, apiVersion, params);
    return this.executeWithRetry<T>('PATCH', url, body);
  }

  /**
   * Paginate through all results from a list endpoint.
   */
  async paginate<T>(
    path: string,
    apiVersion?: string,
    params?: Record<string, string>,
    maxResults?: number
  ): Promise<T[]> {
    const results: T[] = [];
    let nextLink: string | undefined;
    let url = this.buildUrl(path, apiVersion, params);

    while (url) {
      const response: ArmListResponse<T> = await this.executeWithRetry('GET', url);

      results.push(...response.value);

      // Check if we've reached max results
      if (maxResults && results.length >= maxResults) {
        return results.slice(0, maxResults);
      }

      // Get next page URL if available
      nextLink = response.nextLink;
      url = nextLink || '';
    }

    return results;
  }

  /**
   * Build URL for subscription-level resource.
   */
  subscriptionPath(path: string = ''): string {
    return `/subscriptions/${this.subscriptionId}${path}`;
  }

  /**
   * Build URL for resource group-level resource.
   */
  resourceGroupPath(resourceGroup?: string, path: string = ''): string {
    const rg = resourceGroup || this.defaultResourceGroup;
    if (!rg) {
      throw new Error('Resource group is required but not specified');
    }
    return `/subscriptions/${this.subscriptionId}/resourceGroups/${rg}${path}`;
  }

  /**
   * Build URL for a specific resource by full resource ID.
   */
  resourcePath(resourceId: string): string {
    return resourceId;
  }

  /**
   * Get the Azure Auth Provider for data plane operations.
   */
  getAuthProvider(): AzureAuthProvider {
    return this.authProvider;
  }

  /**
   * Build the full URL with API version and query params.
   */
  private buildUrl(path: string, apiVersion?: string, params?: Record<string, string>): string {
    // If path already contains api-version, don't add it again
    const hasApiVersion = path.includes('api-version=');
    const version = apiVersion || this.extractApiVersionFromPath(path) || getApiVersion('default');

    const queryParams = new URLSearchParams(params || {});

    if (!hasApiVersion) {
      queryParams.set('api-version', version);
    }

    const separator = path.includes('?') ? '&' : '?';
    const queryString = queryParams.toString();

    return queryString ? `${path}${separator}${queryString}` : path;
  }

  /**
   * Try to extract resource type from path to get the right API version.
   */
  private extractApiVersionFromPath(path: string): string | undefined {
    // Look for provider patterns like /providers/Microsoft.Web/sites
    const providerMatch = path.match(/\/providers\/([^/]+\/[^/]+)/);
    if (providerMatch) {
      return getApiVersion(providerMatch[1]);
    }
    return undefined;
  }

  /**
   * Execute a request with retry logic.
   */
  private async executeWithRetry<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const token = await this.authProvider.getArmToken();

        const config: AxiosRequestConfig = {
          method,
          url,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          data: body,
        };

        const response = await this.client.request<T>(config);
        return response.data;
      } catch (error) {
        lastError = this.handleError(error);

        // Check if we should retry
        if (error instanceof AxiosError && error.response) {
          const status = error.response.status;

          if (ArmClient.RETRY_STATUS_CODES.includes(status) && attempt < this.maxRetries) {
            // Check for Retry-After header
            const retryAfter = error.response.headers['retry-after'];
            const delayMs = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : this.retryDelayMs * Math.pow(2, attempt);

            console.error(
              `ARM API request failed with status ${status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${this.maxRetries})`
            );

            await this.delay(delayMs);
            continue;
          }
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Handle and transform errors.
   */
  private handleError(error: unknown): Error {
    if (error instanceof AxiosError) {
      const armError = error.response?.data as ArmError;

      if (armError?.error) {
        const message = `${armError.error.code}: ${armError.error.message}`;
        const details = armError.error.details
          ?.map((d) => `  - ${d.code}: ${d.message}`)
          .join('\n');

        return this.withStatus(
          new Error(details ? `${message}\n${details}` : message),
          error.response?.status
        );
      }

      return this.withStatus(
        new Error(`ARM API error: ${error.message} (status: ${error.response?.status})`),
        error.response?.status
      );
    }

    return error instanceof Error ? error : new Error(String(error));
  }

  private withStatus(error: Error, status?: number): ArmRequestError {
    (error as ArmRequestError).status = status;
    return error;
  }

  /**
   * Delay helper for retries.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
