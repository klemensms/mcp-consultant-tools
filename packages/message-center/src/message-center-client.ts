/**
 * Microsoft Graph client for Microsoft 365 Service Health + Message Center reads.
 *
 * Auth mirrors `packages/entra-id` (the closest sibling - Graph, client credentials,
 * read-only): `ClientSecretCredential` from `@azure/identity` behind
 * `TokenCredentialAuthenticationProvider`. Several packages wire `@azure/msal-node`
 * by hand instead; entra-id's `@azure/identity` path needs no extra dependency and
 * `Client.initWithMiddleware` installs Graph's own retry handler (honours `Retry-After`
 * on 429/503), so this class carries no retry loop of its own.
 *
 * Everything here lives under `/admin/serviceAnnouncement/*`. This package builds NO
 * OData `$filter`/`$orderby`/`$search`/`$count` from caller input and sends no `$top`:
 * those options are undocumented for these collections and Graph's own known-issues page
 * warns that unsupported query parameters "might fail silently" (200 OK, full unfiltered
 * result). A server-side filter here would therefore be a false result on an assurance
 * tool, not an error - so all filtering and ordering happens client-side (see the
 * services), and pagination just follows `@odata.nextLink` from the default page. The only
 * caller values that reach a URL are Graph-assigned issue/message IDs, shape-validated
 * before use (see utils/announcement-id.ts).
 * https://learn.microsoft.com/en-us/graph/known-issues
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client, ResponseType } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

export interface MessageCenterClientConfig {
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

export class MessageCenterClient {
  private graphClient: Client | null = null;

  constructor(private config: MessageCenterClientConfig) {
    if (!config.tenantId || !config.clientId || !config.clientSecret) {
      throw new Error(
        'Message Center requires tenantId, clientId, and clientSecret configuration'
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

  /**
   * Fetch a single resource (or a small, single-page collection). `expand` maps to
   * `$expand` - the ONE OData option verified against a worked example for this API
   * (`healthOverviews?$expand=issues`). No `$filter`/`$select` is attached.
   */
  async get<T>(path: string, expand?: string[]): Promise<T> {
    let request = this.getClient().api(path);
    if (expand && expand.length > 0) request = request.expand(expand);
    return (await request.get()) as T;
  }

  /**
   * Follow `@odata.nextLink` until the collection is exhausted, or until one row past
   * `maxResults` proves more exist. The extra row is what makes `truncated` honest
   * without a second request.
   *
   * No `$top`, `$filter` or `$select` is attached. `$top` is undocumented for these
   * collections and Graph "might return an error" for it; the default page size (100)
   * plus nextLink following is safe and these collections are small. The nextLink URL is
   * passed to `.api()` verbatim - Graph bakes the original query into it and mutating it
   * is unsupported.
   */
  async paginate<T>(path: string, maxResults?: number): Promise<PaginatedResult<T>> {
    const items: T[] = [];

    let page = (await this.getClient().api(path).get()) as GraphPage<T>;

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
   * Fetch a raw binary body (the post-incident-review document stream). Returned as a
   * Buffer so the caller can decide whether it is text or binary; `ARRAYBUFFER` avoids
   * the SDK trying to JSON-parse a non-JSON body.
   */
  async getRaw(path: string): Promise<Buffer> {
    const body = (await this.getClient().api(path).responseType(ResponseType.ARRAYBUFFER).get()) as
      | ArrayBuffer
      | Buffer;
    return Buffer.isBuffer(body) ? body : Buffer.from(body);
  }

  /** Turn a Graph failure into something that names the missing grant. */
  enhanceError(error: unknown, operation: string): Error {
    const err = error as { statusCode?: number; code?: string; message?: string };
    const message = err?.message ?? String(error);
    const status = err?.statusCode;

    if (status === 401) {
      return new Error(
        `Unauthorized while ${operation}. Check MESSAGE_CENTER_TENANT_ID, MESSAGE_CENTER_CLIENT_ID and ` +
          `MESSAGE_CENTER_CLIENT_SECRET. Original error: ${message}`
      );
    }

    if (status === 403) {
      return new Error(
        `Forbidden while ${operation}. The service principal needs the ServiceHealth.Read.All and ` +
          `ServiceMessage.Read.All Microsoft Graph application permissions, granted with admin consent. ` +
          `Original error: ${message}`
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
