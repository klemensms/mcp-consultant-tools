/**
 * Service Principal Authentication Provider
 *
 * Uses ClientSecretCredential from @azure/identity (client credentials flow)
 * for app-to-app authentication with client_id + client_secret.
 *
 * DEFAULT AUTH MODE - Use this for all internal development and testing.
 * Interactive auth should only be used for production client scenarios.
 */

import { ClientSecretCredential } from '@azure/identity';
import type { AuthProvider } from './index.js';

export interface ServicePrincipalConfig {
  organizationUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

interface CachedToken {
  accessToken: string;
  expirationTime: number;
}

export class ServicePrincipalAuth implements AuthProvider {
  private config: ServicePrincipalConfig;
  private credential: ClientSecretCredential;
  // Cache tokens per resource to support multiple APIs (Dataverse, Management API, etc.)
  private tokenCache: Map<string, CachedToken> = new Map();

  constructor(config: ServicePrincipalConfig) {
    this.config = config;

    this.credential = new ClientSecretCredential(
      this.config.tenantId,
      this.config.clientId,
      this.config.clientSecret
    );
  }

  getAuthMode(): 'service-principal' | 'interactive' {
    return 'service-principal';
  }

  async getAccessToken(resource: string): Promise<string> {
    const currentTime = Date.now();

    // Check if we have a cached token for this specific resource
    const cached = this.tokenCache.get(resource);
    if (cached && cached.expirationTime > currentTime) {
      return cached.accessToken;
    }

    try {
      // Get a new token using @azure/identity - always returns Bearer tokens
      const token = await this.credential.getToken(`${resource}/.default`);

      if (!token || !token.token) {
        throw new Error('Failed to acquire access token');
      }

      // Cache the token with expiration (subtract 5 minutes to refresh early)
      const expirationTime = token.expiresOnTimestamp
        ? token.expiresOnTimestamp - 5 * 60 * 1000
        : currentTime + 55 * 60 * 1000; // Default to 55 minutes if no expiry provided

      this.tokenCache.set(resource, {
        accessToken: token.token,
        expirationTime,
      });

      return token.token;
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error('Service Principal authentication failed:', errorMessage);
      throw new Error(`Service Principal authentication failed: ${errorMessage}`);
    }
  }

  async getUserInfo(): Promise<null> {
    // Service principal doesn't have user info
    return null;
  }
}
