/**
 * Authentication provider for Microsoft Fabric.
 *
 * Uses Azure AD (Entra) service-principal client-credentials flow.
 * The Fabric REST APIs (core and admin) accept a bearer token issued for
 * the Fabric resource scope.
 */
import { ClientSecretCredential } from '@azure/identity';

/** OAuth2 scope for the Microsoft Fabric REST API (core + admin). */
const FABRIC_RESOURCE_SCOPE = 'https://api.fabric.microsoft.com/.default';

/** Refresh token 5 minutes before expiry. */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface FabricAuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export class FabricAuthProvider {
  private readonly credential: ClientSecretCredential;
  private tokenCache: { token: string; expiresOn: number } | null = null;

  constructor(config: FabricAuthConfig) {
    this.credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret,
    );
  }

  /**
   * Get the Authorization header value ("Bearer <token>").
   * Acquires and caches a token, refreshing shortly before expiry.
   */
  async getAuthHeader(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresOn > now + TOKEN_REFRESH_BUFFER_MS) {
      return `Bearer ${this.tokenCache.token}`;
    }

    const tokenResponse = await this.credential.getToken(FABRIC_RESOURCE_SCOPE);
    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Failed to acquire Microsoft Fabric access token via Entra ID');
    }

    this.tokenCache = {
      token: tokenResponse.token,
      expiresOn: tokenResponse.expiresOnTimestamp,
    };

    console.error(
      `Microsoft Fabric Entra ID token acquired, expires at ${new Date(tokenResponse.expiresOnTimestamp).toISOString()}`,
    );

    return `Bearer ${this.tokenCache.token}`;
  }
}

/**
 * Build the Fabric auth config from environment variables.
 * Throws with a clear message if any required variable is missing.
 */
export function resolveAuthConfig(): FabricAuthConfig {
  const missing: string[] = [];
  if (!process.env.FABRIC_TENANT_ID) missing.push('FABRIC_TENANT_ID');
  if (!process.env.FABRIC_CLIENT_ID) missing.push('FABRIC_CLIENT_ID');
  if (!process.env.FABRIC_CLIENT_SECRET) missing.push('FABRIC_CLIENT_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing Microsoft Fabric authentication. Required variables: ${missing.join(', ')}. ` +
      'Provide a service principal (Azure AD app registration) with access to the Fabric APIs.',
    );
  }

  return {
    tenantId: process.env.FABRIC_TENANT_ID!,
    clientId: process.env.FABRIC_CLIENT_ID!,
    clientSecret: process.env.FABRIC_CLIENT_SECRET!,
  };
}
