/**
 * Microsoft Fabric HTTP Client
 *
 * Handles authentication, base URL construction, pagination, and API requests
 * for both the Fabric core API (`/v1`) and the Fabric admin API (`/v1/admin`).
 */
import axios from 'axios';
import { FabricAuthProvider, type FabricAuthConfig } from './fabric-auth-provider.js';

/** Microsoft Fabric core/items REST API base URL. */
const CORE_BASE_URL = 'https://api.fabric.microsoft.com/v1';

/** Microsoft Fabric admin REST API base URL. */
const ADMIN_BASE_URL = 'https://api.fabric.microsoft.com/v1/admin';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface FabricClientOptions {
  /** Route the request to the Fabric admin API instead of the core API. */
  admin?: boolean;
  /** Query string parameters. */
  query?: Record<string, string | number | undefined>;
}

/**
 * Result of a long-running operation that the API accepted (HTTP 202) but
 * has not completed synchronously.
 */
export interface AcceptedResult {
  accepted: true;
  status: 202;
  /** Operation status URL from the `Location` header, if present. */
  location?: string;
  /** Suggested polling interval in seconds from `Retry-After`, if present. */
  retryAfter?: number;
}

export class FabricClient {
  private readonly authProvider: FabricAuthProvider;
  private readonly enableWrite: boolean;
  private readonly enableDelete: boolean;

  constructor(authConfig: FabricAuthConfig, opts: { enableWrite: boolean; enableDelete: boolean }) {
    this.authProvider = new FabricAuthProvider(authConfig);
    this.enableWrite = opts.enableWrite;
    this.enableDelete = opts.enableDelete;
  }

  /** Throws if write operations are not enabled. */
  checkWriteEnabled(): void {
    if (!this.enableWrite) {
      throw new Error(
        'Write operations are disabled. Set FABRIC_ENABLE_WRITE=true to enable create/update/assign operations.',
      );
    }
  }

  /** Throws if delete operations are not enabled. */
  checkDeleteEnabled(): void {
    if (!this.enableDelete) {
      throw new Error(
        'Delete operations are disabled. Set FABRIC_ENABLE_DELETE=true to enable delete operations.',
      );
    }
  }

  private buildUrl(endpoint: string, opts?: FabricClientOptions): string {
    const base = opts?.admin ? ADMIN_BASE_URL : CORE_BASE_URL;
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${base}${path}`;
    if (!opts?.query) return url;

    const params = Object.entries(opts.query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return params.length > 0 ? `${url}?${params.join('&')}` : url;
  }

  /**
   * Make an authenticated request to the Fabric API.
   *
   * Returns the response body. For accepted-but-incomplete long-running
   * operations (HTTP 202), returns an {@link AcceptedResult}. For
   * no-content responses (HTTP 204), returns `null`.
   */
  async request<T>(
    endpoint: string,
    method: HttpMethod = 'GET',
    data?: unknown,
    opts?: FabricClientOptions,
  ): Promise<T> {
    try {
      const authHeader = await this.authProvider.getAuthHeader();
      const response = await axios({
        method,
        url: this.buildUrl(endpoint, opts),
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        data,
        validateStatus: (s) => s >= 200 && s < 300,
      });

      if (response.status === 202) {
        const result: AcceptedResult = {
          accepted: true,
          status: 202,
          location: response.headers['location'],
          retryAfter: response.headers['retry-after']
            ? Number(response.headers['retry-after'])
            : undefined,
        };
        return result as T;
      }

      if (response.status === 204 || response.data === '' || response.data === undefined) {
        return null as T;
      }

      return response.data as T;
    } catch (error: any) {
      const status = error.response?.status;
      const apiError =
        error.response?.data?.message ||
        error.response?.data?.error?.message ||
        error.response?.data ||
        error.message;

      console.error('Microsoft Fabric API request failed:', {
        endpoint,
        method,
        status,
        error: apiError,
      });

      if (status === 401) {
        throw new Error(
          'Microsoft Fabric authentication failed (401). Check the service principal credentials and that it has access to the Fabric APIs.',
        );
      }
      if (status === 403) {
        throw new Error(
          'Microsoft Fabric access denied (403). The service principal may lack the required workspace role, capacity permission, or admin/tenant-setting opt-in for admin APIs.',
        );
      }
      if (status === 404) {
        throw new Error(`Microsoft Fabric resource not found: ${endpoint}`);
      }
      if (status === 429) {
        throw new Error('Microsoft Fabric request was throttled (429). Retry after a short delay.');
      }

      throw new Error(
        `Microsoft Fabric API request failed${status ? ` (${status})` : ''}: ${typeof apiError === 'string' ? apiError : JSON.stringify(apiError)}`,
      );
    }
  }

  /**
   * GET a collection endpoint and follow `continuationToken` pagination,
   * concatenating the `value` arrays from every page.
   */
  async listAll<T>(endpoint: string, opts?: FabricClientOptions): Promise<T[]> {
    const items: T[] = [];
    let continuationToken: string | undefined;

    do {
      const query = { ...(opts?.query ?? {}), continuationToken };
      const page = await this.request<{ value?: T[]; continuationToken?: string }>(
        endpoint,
        'GET',
        undefined,
        { ...opts, query },
      );
      if (page?.value) items.push(...page.value);
      continuationToken = page?.continuationToken;
    } while (continuationToken);

    return items;
  }

  // Convenience methods
  get<T>(endpoint: string, opts?: FabricClientOptions): Promise<T> {
    return this.request<T>(endpoint, 'GET', undefined, opts);
  }

  post<T>(endpoint: string, data?: unknown, opts?: FabricClientOptions): Promise<T> {
    return this.request<T>(endpoint, 'POST', data, opts);
  }

  patch<T>(endpoint: string, data?: unknown, opts?: FabricClientOptions): Promise<T> {
    return this.request<T>(endpoint, 'PATCH', data, opts);
  }

  del<T>(endpoint: string, opts?: FabricClientOptions): Promise<T> {
    return this.request<T>(endpoint, 'DELETE', undefined, opts);
  }
}
