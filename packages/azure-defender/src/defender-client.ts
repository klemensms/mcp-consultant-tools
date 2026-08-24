import { ClientSecretCredential } from '@azure/identity';
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

/**
 * Configuration for Azure authentication.
 */
export interface AzureAuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * ARM-scoped token provider.
 *
 * Deliberately duplicated rather than shared: every Azure package in this repo
 * (azure-management, azure-b2c, azure-storage, fabric, service-bus, ...) carries
 * its own credential wiring, and `core` exports no Azure auth. Hoisting this to
 * `core` would ripple into the sibling `mcp-computer-use` repo on the next core
 * version bump - a consolidation worth doing across all of them at once, not here.
 */
export class AzureAuthProvider {
  private credential: ClientSecretCredential;
  private tokenCache: { token: string; expiresOn: number } | null = null;

  // Refresh 5 minutes before expiry so a long-running request cannot race the deadline.
  private static readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
  private static readonly ARM_SCOPE = 'https://management.azure.com/.default';

  constructor(config: AzureAuthConfig) {
    this.credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret
    );
  }

  async getArmToken(): Promise<string> {
    const now = Date.now();

    if (
      this.tokenCache &&
      this.tokenCache.expiresOn > now + AzureAuthProvider.TOKEN_REFRESH_BUFFER_MS
    ) {
      return this.tokenCache.token;
    }

    const tokenResponse = await this.credential.getToken(AzureAuthProvider.ARM_SCOPE);

    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Failed to acquire Azure ARM access token');
    }

    this.tokenCache = {
      token: tokenResponse.token,
      expiresOn: tokenResponse.expiresOnTimestamp,
    };

    return tokenResponse.token;
  }

  clearCache(): void {
    this.tokenCache = null;
  }
}

export interface DefenderClientConfig extends AzureAuthConfig {
  subscriptionId?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

/** Every `Microsoft.Security` list endpoint returns this envelope. */
export interface AzureListResponse<T> {
  value?: T[];
  nextLink?: string;
}

/** ARM's standard error body. */
export interface AzureError {
  error: {
    code: string;
    message: string;
    target?: string;
    details?: Array<{ code: string; message: string }>;
  };
}

/**
 * A page-bounded list result.
 *
 * `truncated` means the caller's limit stopped the fetch, so any counts derived
 * from `items` are a lower bound. The source this was ported from silently
 * dropped the remainder and reported summaries over the truncated slice.
 */
export interface PaginatedResult<T> {
  items: T[];
  truncated: boolean;
}

/**
 * HTTP client for the Microsoft Defender for Cloud ARM APIs.
 * Handles authentication, pagination, retries, and error normalisation.
 */
export class DefenderClient {
  private client: AxiosInstance;
  private authProvider: AzureAuthProvider;
  private subscriptionId: string | undefined;
  private maxRetries: number;
  private retryDelayMs: number;

  private static readonly BASE_URL = 'https://management.azure.com';
  private static readonly RETRY_STATUS_CODES = [429, 500, 502, 503, 504];

  constructor(config: DefenderClientConfig) {
    this.authProvider = new AzureAuthProvider({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    this.subscriptionId = config.subscriptionId;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;

    this.client = axios.create({
      baseURL: DefenderClient.BASE_URL,
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  getSubscriptionId(): string {
    if (!this.subscriptionId) {
      throw new Error(
        'AZURE_SUBSCRIPTION_ID is required for this operation but was not configured.'
      );
    }
    return this.subscriptionId;
  }

  subscriptionPath(path: string = ''): string {
    return `/subscriptions/${this.getSubscriptionId()}${path}`;
  }

  async get<T>(path: string, apiVersion: string, params?: Record<string, string>): Promise<T> {
    return this.executeWithRetry<T>('GET', this.buildUrl(path, apiVersion, params));
  }

  async post<T>(
    path: string,
    body: unknown,
    apiVersion: string,
    params?: Record<string, string>
  ): Promise<T> {
    return this.executeWithRetry<T>('POST', this.buildUrl(path, apiVersion, params), body);
  }

  /**
   * Follow `nextLink` until the list is exhausted, or until one row past `maxResults`
   * proves more exist. Fetching the extra row is what lets `truncated` be honest
   * without a second request.
   */
  async paginate<T>(
    path: string,
    apiVersion: string,
    params?: Record<string, string>,
    maxResults?: number
  ): Promise<PaginatedResult<T>> {
    const results: T[] = [];
    let url: string = this.buildUrl(path, apiVersion, params);

    while (url) {
      const response = await this.executeWithRetry<AzureListResponse<T>>('GET', url);
      // A 200 with no `value` is legal for an empty collection on some providers.
      results.push(...(response.value ?? []));

      if (maxResults !== undefined && results.length > maxResults) {
        return { items: results.slice(0, maxResults), truncated: true };
      }

      url = response.nextLink ?? '';
    }

    return { items: results, truncated: false };
  }

  private buildUrl(path: string, apiVersion: string, params?: Record<string, string>): string {
    const queryParams = new URLSearchParams(params ?? {});
    queryParams.set('api-version', apiVersion);
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}${queryParams.toString()}`;
  }

  private async executeWithRetry<T>(
    method: 'GET' | 'POST',
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
          headers: { Authorization: `Bearer ${token}` },
          data: body,
        };

        const response = await this.client.request<T>(config);
        return response.data;
      } catch (error) {
        lastError = this.handleError(error);

        if (error instanceof AxiosError && error.response) {
          const status = error.response.status;

          if (DefenderClient.RETRY_STATUS_CODES.includes(status) && attempt < this.maxRetries) {
            const retryAfter = error.response.headers['retry-after'];
            const delayMs = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : this.retryDelayMs * Math.pow(2, attempt);

            console.error(
              `Defender API request failed with status ${status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${this.maxRetries})`
            );

            await this.delay(delayMs);
            continue;
          }
        }

        throw lastError;
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  private handleError(error: unknown): Error {
    if (error instanceof AxiosError) {
      const azureError = error.response?.data as AzureError | undefined;

      if (azureError?.error) {
        const message = `${azureError.error.code}: ${azureError.error.message}`;
        const details = azureError.error.details
          ?.map((d) => `  - ${d.code}: ${d.message}`)
          .join('\n');

        return new Error(details ? `${message}\n${details}` : message);
      }

      return new Error(`Defender API error: ${error.message} (status: ${error.response?.status})`);
    }

    return error instanceof Error ? error : new Error(String(error));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
