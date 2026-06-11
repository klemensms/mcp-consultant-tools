/**
 * Authentication provider for Azure DevOps.
 * Supports PAT (Basic) and Entra ID (Bearer) authentication.
 */
import { ClientSecretCredential } from '@azure/identity';

/** Azure DevOps resource ID for OAuth2 scope */
const ADO_RESOURCE_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

/** Refresh token 5 minutes before expiry */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type AuthMode = 'pat' | 'entra-id';

export interface PatAuthConfig {
  mode: 'pat';
  pat: string;
}

export interface EntraIdAuthConfig {
  mode: 'entra-id';
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export type AdoAuthConfig = PatAuthConfig | EntraIdAuthConfig;

export class AdoAuthProvider {
  private readonly config: AdoAuthConfig;
  private readonly patHeader: string | null = null;
  private credential: ClientSecretCredential | null = null;
  private tokenCache: { token: string; expiresOn: number } | null = null;

  constructor(config: AdoAuthConfig) {
    this.config = config;
    if (config.mode === 'pat') {
      this.patHeader = `Basic ${Buffer.from(`:${config.pat}`).toString('base64')}`;
    } else {
      this.credential = new ClientSecretCredential(
        config.tenantId,
        config.clientId,
        config.clientSecret,
      );
    }
  }

  get mode(): AuthMode {
    return this.config.mode;
  }

  /**
   * Get the Authorization header value.
   * PAT mode: returns cached "Basic <base64>" header.
   * Entra ID mode: returns "Bearer <token>" (acquires/caches token).
   */
  async getAuthHeader(): Promise<string> {
    if (this.config.mode === 'pat') {
      return this.patHeader!;
    }

    // Entra ID mode — return cached token if still valid
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresOn > now + TOKEN_REFRESH_BUFFER_MS) {
      return `Bearer ${this.tokenCache.token}`;
    }

    // Acquire new token
    const tokenResponse = await this.credential!.getToken(ADO_RESOURCE_SCOPE);
    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Failed to acquire Azure DevOps access token via Entra ID');
    }

    this.tokenCache = {
      token: tokenResponse.token,
      expiresOn: tokenResponse.expiresOnTimestamp,
    };

    console.error(
      `Azure DevOps Entra ID token acquired, expires at ${new Date(tokenResponse.expiresOnTimestamp).toISOString()}`,
    );

    return `Bearer ${this.tokenCache.token}`;
  }
}

/**
 * Detect auth mode from environment variables and build config.
 * Priority: Entra ID > PAT. If both set, Entra ID wins (PAT ignored with warning).
 */
export function resolveAuthConfig(): AdoAuthConfig {
  const entraIdVars = [
    process.env.AZUREDEVOPS_TENANT_ID,
    process.env.AZUREDEVOPS_CLIENT_ID,
    process.env.AZUREDEVOPS_CLIENT_SECRET,
  ];
  const entraIdSetCount = entraIdVars.filter(Boolean).length;
  const hasEntraId = entraIdSetCount === 3;
  const hasPat = !!process.env.AZUREDEVOPS_PAT;

  if (entraIdSetCount > 0 && entraIdSetCount < 3) {
    throw new Error(
      'Incomplete Entra ID configuration. All three variables are required: ' +
      'AZUREDEVOPS_TENANT_ID, AZUREDEVOPS_CLIENT_ID, AZUREDEVOPS_CLIENT_SECRET',
    );
  }

  if (hasEntraId && hasPat) {
    console.error(
      'Both Entra ID credentials and PAT are configured. Using Entra ID; PAT will be ignored.',
    );
  }

  if (hasEntraId) {
    return {
      mode: 'entra-id',
      tenantId: process.env.AZUREDEVOPS_TENANT_ID!,
      clientId: process.env.AZUREDEVOPS_CLIENT_ID!,
      clientSecret: process.env.AZUREDEVOPS_CLIENT_SECRET!,
    };
  }

  if (hasPat) {
    return {
      mode: 'pat',
      pat: process.env.AZUREDEVOPS_PAT!,
    };
  }

  throw new Error(
    'Missing Azure DevOps authentication. Provide either:\n' +
    '  - AZUREDEVOPS_PAT (Personal Access Token), or\n' +
    '  - AZUREDEVOPS_TENANT_ID + AZUREDEVOPS_CLIENT_ID + AZUREDEVOPS_CLIENT_SECRET (Entra ID)',
  );
}
