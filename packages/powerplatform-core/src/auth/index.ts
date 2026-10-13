/**
 * Authentication module for PowerPlatform MCP Server
 *
 * Supports two authentication modes:
 * 1. Service Principal (ConfidentialClientApplication) - DEFAULT for internal dev work
 *    - Uses client_id + client_secret
 *    - Recommended for all development and testing
 *
 * 2. Interactive User Auth (PublicClientApplication) - EXCEPTION for production client use only
 *    - Uses browser-based SSO when no client_secret is provided
 *    - Only use for production scenarios where client needs user-delegated permissions
 *    - Not recommended for internal development work
 */

import { ServicePrincipalAuth } from './service-principal-auth.js';
import { InteractiveAuth } from './interactive-auth.js';

/**
 * Authentication provider interface
 * All auth implementations must provide a way to get access tokens
 */
export interface AuthProvider {
  /**
   * Get an access token for the specified resource
   * @param resource - The resource URL (e.g., https://org.crm.dynamics.com)
   * @returns Access token string
   */
  getAccessToken(resource: string): Promise<string>;

  /**
   * Get information about the authenticated user (if available)
   * Only available for interactive auth
   */
  getUserInfo?(): Promise<{ name: string; email: string; oid: string } | null>;

  /**
   * Get the authentication mode being used
   */
  getAuthMode(): 'service-principal' | 'interactive';

  /**
   * Clear cached tokens (logout)
   * Only applicable for interactive auth
   */
  clearCache?(): Promise<void>;
}

/**
 * Configuration for PowerPlatform authentication
 */
export interface PowerPlatformAuthConfig {
  /** PowerPlatform organization URL (e.g., https://org.crm.dynamics.com) */
  organizationUrl: string;
  /** Azure AD application (client) ID */
  clientId: string;
  /** Azure AD tenant ID */
  tenantId: string;
  /** Client secret (optional - if provided, uses service principal auth) */
  clientSecret?: string;
}

/**
 * Create an appropriate auth provider based on configuration
 *
 * If clientSecret is provided → ServicePrincipalAuth (existing behavior)
 * If no clientSecret → InteractiveAuth (browser-based SSO)
 *
 * @param config - PowerPlatform authentication configuration
 * @returns Auth provider instance
 */
export function createAuthProvider(config: PowerPlatformAuthConfig): AuthProvider {
  if (process.env.MCP_POWERPLATFORM_FAKE_SERVICE === '1') {
    return new FakeServiceAuth(config.organizationUrl);
  }

  if (config.clientSecret) {
    // Service Principal mode (existing behavior)
    return new ServicePrincipalAuth({
      organizationUrl: config.organizationUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tenantId: config.tenantId,
    });
  }

  // Interactive User Auth mode (new behavior)
  return new InteractiveAuth({
    organizationUrl: config.organizationUrl,
    clientId: config.clientId,
    tenantId: config.tenantId,
  });
}

/** The token a fake Dataverse sees; it is never valid anywhere else. */
export const FAKE_SERVICE_TOKEN = 'fake-service-token';

/**
 * Test-only provider for the local tester's fake-service mode
 * (`MCP_POWERPLATFORM_FAKE_SERVICE=1`). It signs nobody in and hands out a fixed
 * token, and refuses to start unless the organisation URL is on this machine, so
 * the token can only ever reach a local fake. Any other resource (for example the
 * Flow API) is refused, because no fake answers for it.
 */
export class FakeServiceAuth implements AuthProvider {
  constructor(private organizationUrl: string) {
    let host = '';
    try {
      host = new URL(organizationUrl).hostname;
    } catch {
      // reported below
    }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
      throw new Error(
        `MCP_POWERPLATFORM_FAKE_SERVICE is set but POWERPLATFORM_URL (${organizationUrl}) is not on this machine. Fake-service mode only talks to a local fake.`
      );
    }
  }

  async getAccessToken(resource: string): Promise<string> {
    if (resource.replace(/\/+$/, '') !== this.organizationUrl.replace(/\/+$/, '')) {
      throw new Error(`Fake-service mode covers the Dataverse Web API only, not ${resource}.`);
    }
    return FAKE_SERVICE_TOKEN;
  }

  getAuthMode(): 'service-principal' {
    return 'service-principal';
  }
}

export { ServicePrincipalAuth } from './service-principal-auth.js';
export { InteractiveAuth } from './interactive-auth.js';
export { TokenCache } from './token-cache.js';
