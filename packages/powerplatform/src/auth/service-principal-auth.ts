/**
 * Service Principal Authentication Provider
 *
 * Uses ConfidentialClientApplication (client credentials flow)
 * for app-to-app authentication with client_id + client_secret.
 *
 * This is the existing authentication mechanism, refactored into the auth module.
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import type { AuthProvider } from './index.js';

export interface ServicePrincipalConfig {
  organizationUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

export class ServicePrincipalAuth implements AuthProvider {
  private config: ServicePrincipalConfig;
  private msalClient: ConfidentialClientApplication;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  constructor(config: ServicePrincipalConfig) {
    this.config = config;

    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
      },
    });
  }

  getAuthMode(): 'service-principal' | 'interactive' {
    return 'service-principal';
  }

  async getAccessToken(resource: string): Promise<string> {
    const currentTime = Date.now();

    // If we have a token that isn't expired, return it
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      // Get a new token using client credentials flow
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: [`${resource}/.default`],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;

      // Set expiration time (subtract 5 minutes to refresh early)
      if (result.expiresOn) {
        this.tokenExpirationTime = result.expiresOn.getTime() - 5 * 60 * 1000;
      }

      return this.accessToken;
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
