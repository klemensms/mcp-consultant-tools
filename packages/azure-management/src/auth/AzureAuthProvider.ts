import { ClientSecretCredential } from '@azure/identity';

/**
 * Configuration for Azure authentication.
 */
export interface AzureAuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Provides authentication tokens for Azure APIs.
 * Supports both ARM (management.azure.com) and Key Vault data plane.
 */
export class AzureAuthProvider {
  private credential: ClientSecretCredential;
  private armTokenCache: { token: string; expiresOn: number } | null = null;
  private keyVaultTokenCache: Map<string, { token: string; expiresOn: number }> = new Map();

  // Token refresh buffer (5 minutes before expiry)
  private static readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

  // Scopes for different Azure APIs
  private static readonly ARM_SCOPE = 'https://management.azure.com/.default';
  private static readonly KEY_VAULT_SCOPE = 'https://vault.azure.net/.default';

  constructor(config: AzureAuthConfig) {
    this.credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret
    );
  }

  /**
   * Get an access token for the Azure Resource Manager API.
   */
  async getArmToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid
    if (
      this.armTokenCache &&
      this.armTokenCache.expiresOn > now + AzureAuthProvider.TOKEN_REFRESH_BUFFER_MS
    ) {
      return this.armTokenCache.token;
    }

    // Acquire new token
    const tokenResponse = await this.credential.getToken(AzureAuthProvider.ARM_SCOPE);

    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Failed to acquire ARM access token');
    }

    this.armTokenCache = {
      token: tokenResponse.token,
      expiresOn: tokenResponse.expiresOnTimestamp,
    };

    console.error(`Azure ARM token acquired, expires at ${new Date(tokenResponse.expiresOnTimestamp).toISOString()}`);

    return tokenResponse.token;
  }

  /**
   * Get an access token for a Key Vault's data plane.
   * Key Vault tokens are vault-specific due to different scopes.
   */
  async getKeyVaultToken(vaultUri?: string): Promise<string> {
    const cacheKey = vaultUri || 'default';
    const now = Date.now();

    // Return cached token if still valid
    const cached = this.keyVaultTokenCache.get(cacheKey);
    if (cached && cached.expiresOn > now + AzureAuthProvider.TOKEN_REFRESH_BUFFER_MS) {
      return cached.token;
    }

    // Acquire new token
    const tokenResponse = await this.credential.getToken(AzureAuthProvider.KEY_VAULT_SCOPE);

    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Failed to acquire Key Vault access token');
    }

    this.keyVaultTokenCache.set(cacheKey, {
      token: tokenResponse.token,
      expiresOn: tokenResponse.expiresOnTimestamp,
    });

    console.error(`Azure Key Vault token acquired, expires at ${new Date(tokenResponse.expiresOnTimestamp).toISOString()}`);

    return tokenResponse.token;
  }

  /**
   * Clear all cached tokens.
   */
  clearCache(): void {
    this.armTokenCache = null;
    this.keyVaultTokenCache.clear();
    console.error('Azure auth token cache cleared');
  }
}
