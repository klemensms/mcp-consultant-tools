/**
 * Microsoft Graph client for Entra ID app-registration reads.
 *
 * Auth mirrors `packages/azure-b2c`: `ClientSecretCredential` from `@azure/identity`
 * behind `TokenCredentialAuthenticationProvider`. Seven packages in this repo wire
 * `@azure/msal-node` by hand instead; azure-b2c is the closer precedent (Graph,
 * client credentials, read-only) and needs no extra dependency.
 *
 * `Client.initWithMiddleware` installs Graph's own retry handler, which honours
 * `Retry-After` on 429/503 — so this class carries no retry loop of its own.
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { isGuid } from './utils/guid.js';
import type { GraphServicePrincipal } from './models/entra-types.js';

export interface EntraIdClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/** A page-bounded list. `truncated` means a limit stopped the fetch, so counts are a lower bound. */
export interface PaginatedResult<T> {
  items: T[];
  truncated: boolean;
}

interface GraphPage<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

/** Graph reports failures with a numeric `statusCode`; duck-type it rather than importing GraphError. */
export function statusCodeOf(error: unknown): number | undefined {
  return (error as { statusCode?: number } | null)?.statusCode;
}

export class EntraIdClient {
  private graphClient: Client | null = null;
  private servicePrincipalCache = new Map<string, GraphServicePrincipal | null>();

  /**
   * `/applications` allows at most 999 per page and defaults to 100. Asking for the
   * maximum keeps a whole-tenant scan to as few round trips as possible; every
   * credential filter in this package requires such a scan because Graph cannot
   * filter on credential expiry.
   */
  private static readonly PAGE_SIZE = 999;

  constructor(private config: EntraIdClientConfig) {
    if (!config.tenantId || !config.clientId || !config.clientSecret) {
      throw new Error(
        'Entra ID requires tenantId, clientId, and clientSecret configuration'
      );
    }
  }

  getClient(): Client {
    if (!this.graphClient) {
      const credential = new ClientSecretCredential(
        this.config.tenantId,
        this.config.clientId,
        this.config.clientSecret
      );

      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });

      this.graphClient = Client.initWithMiddleware({ authProvider });
    }

    return this.graphClient;
  }

  /** Fetch a single resource. `select` is mandatory — see the note on paginate(). */
  async get<T>(path: string, select: string[]): Promise<T> {
    return (await this.getClient().api(path).select(select).get()) as T;
  }

  /**
   * Follow `@odata.nextLink` until the collection is exhausted, or until one row past
   * `maxResults` proves more exist. The extra row is what makes `truncated` honest
   * without a second request.
   *
   * `select` is mandatory. Graph returns only what is selected, so a caller that forgets
   * `passwordCredentials` gets applications with no credentials and reads "nothing is
   * expiring" — a false all-clear rather than an error.
   *
   * The nextLink URL is passed to `.api()` verbatim: Graph bakes the original query into
   * it, and mutating it (adding $top, extracting $skiptoken) is explicitly unsupported.
   */
  async paginate<T>(path: string, select: string[], maxResults?: number): Promise<PaginatedResult<T>> {
    const items: T[] = [];

    let page = (await this.getClient()
      .api(path)
      .select(select)
      .top(EntraIdClient.PAGE_SIZE)
      .get()) as GraphPage<T>;

    while (true) {
      items.push(...(page.value ?? []));

      if (maxResults !== undefined && items.length > maxResults) {
        return { items: items.slice(0, maxResults), truncated: true };
      }

      const nextLink = page['@odata.nextLink'];
      if (!nextLink) break;

      page = (await this.getClient().api(nextLink).get()) as GraphPage<T>;
    }

    return { items, truncated: false };
  }

  /**
   * Resolve a resource application's service principal, to turn permission GUIDs into
   * names. Cached for the lifetime of the client: `appRoles` and `oauth2PermissionScopes`
   * are stable within a tenant. Returns null when the SP cannot be read, so permission
   * names fall back to raw GUIDs rather than the whole call failing.
   *
   * Ceiling: the cache is unbounded. It is keyed by distinct resource appId, of which a
   * tenant has a handful (Graph, ARM, a few custom APIs), so it does not grow with usage.
   */
  async getServicePrincipalByAppId(appId: string): Promise<GraphServicePrincipal | null> {
    if (this.servicePrincipalCache.has(appId)) {
      return this.servicePrincipalCache.get(appId) ?? null;
    }

    // resourceAppId comes from Graph, not from a caller — but it lands in a URL, so shape-check it.
    if (!isGuid(appId)) {
      this.servicePrincipalCache.set(appId, null);
      return null;
    }

    let sp: GraphServicePrincipal | null = null;
    try {
      sp = await this.get<GraphServicePrincipal>(`/servicePrincipals(appId='${appId}')`, [
        'appId',
        'displayName',
        'appRoles',
        'oauth2PermissionScopes',
      ]);
    } catch {
      // Not every resourceAppId has a service principal in this tenant.
      sp = null;
    }

    this.servicePrincipalCache.set(appId, sp);
    return sp;
  }

  /** Turn a Graph failure into something that names the missing grant. */
  enhanceError(error: unknown, operation: string): Error {
    const err = error as { statusCode?: number; code?: string; message?: string };
    const message = err?.message ?? String(error);
    const status = err?.statusCode;

    if (status === 401) {
      return new Error(
        `Unauthorized while ${operation}. Check ENTRA_ID_TENANT_ID, ENTRA_ID_CLIENT_ID and ` +
          `ENTRA_ID_CLIENT_SECRET. Original error: ${message}`
      );
    }

    if (status === 403) {
      return new Error(
        `Forbidden while ${operation}. The service principal needs the Application.Read.All ` +
          `application permission, granted with admin consent. Original error: ${message}`
      );
    }

    if (status === 404) {
      return new Error(`Not found while ${operation}. Original error: ${message}`);
    }

    if (status === 429) {
      return new Error(
        `Throttled by Microsoft Graph while ${operation}. Retry shortly. Original error: ${message}`
      );
    }

    return new Error(`Failed while ${operation}: ${message}`);
  }
}
