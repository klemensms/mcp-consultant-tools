import axios from 'axios';

/**
 * Azure DevOps' first-party application ID. `<id>/.default` is the client-credentials scope that
 * yields a token Azure DevOps REST and Git accept. A public, well-known Microsoft constant.
 */
export const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';

export interface AzdoEntraAuthOptions {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Turn a failed token request into a message built ONLY from the response body. An axios error
 * carries the outbound request body on `error.config.data` - and that body contains the client
 * secret - so anything that stringifies the whole error leaks the credential.
 */
export function describeTokenError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    const body = error.response.data as { error?: string; error_description?: string } | undefined;
    const detail = body?.error_description ?? body?.error;
    return detail ? `${error.response.status} ${detail}` : `HTTP ${error.response.status}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Client-credentials token source for the Azure DevOps provider, so a run authenticates as a
 * service principal instead of a person-owned PAT. Mirrors `GheAppAuth`: cached token refreshed
 * five minutes early, kept in this package rather than hoisted to core (the per-package precedent).
 */
export class AzdoEntraAuth {
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  constructor(options: AzdoEntraAuthOptions) {
    this.tenantId = options.tenantId;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  async getToken(): Promise<string> {
    if (this.accessToken && this.tokenExpirationTime > Date.now()) {
      return this.accessToken;
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: `${AZURE_DEVOPS_RESOURCE_ID}/.default`,
    });

    let data: { access_token?: string; expires_in?: number };
    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      data = response.data;
    } catch (error) {
      throw new Error(`Entra token request failed for tenant ${this.tenantId}: ${describeTokenError(error)}`);
    }

    if (!data.access_token) {
      throw new Error(`Entra token response for tenant ${this.tenantId} contained no access_token.`);
    }

    this.accessToken = data.access_token;
    const expiresInSec = Number(data.expires_in) || 3600;
    this.tokenExpirationTime = Date.now() + expiresInSec * 1000 - 5 * 60 * 1000;
    return this.accessToken;
  }
}
