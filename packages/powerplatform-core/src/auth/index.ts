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

export { ServicePrincipalAuth } from './service-principal-auth.js';
export { InteractiveAuth } from './interactive-auth.js';
export { TokenCache } from './token-cache.js';
