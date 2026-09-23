/**
 * Build the SharePoint service configuration from environment variables.
 * Shared by the MCP server and the CLI.
 */
import { resolveAuthMode } from './auth-mode.js';
import type { SharePointConfig, SharePointSiteConfig } from './types/sharepoint-types.js';

export function loadSharePointConfig(env: NodeJS.ProcessEnv = process.env): SharePointConfig {
  const authMode = resolveAuthMode(env);
  const { SHAREPOINT_CLIENT_SECRET: secret } = env;
  const missingConfig: string[] = [];
  let resources: SharePointSiteConfig[] = [];

  if (env.SHAREPOINT_SITES) {
    try {
      resources = JSON.parse(env.SHAREPOINT_SITES);
    } catch {
      throw new Error('Failed to parse SHAREPOINT_SITES JSON');
    }
  } else if (env.SHAREPOINT_SITE_URL) {
    resources = [{
      id: 'default',
      name: 'Default SharePoint Site',
      siteUrl: env.SHAREPOINT_SITE_URL,
      active: true,
    }];
  } else if (authMode === 'client-credentials') {
    // Sites are optional when signed in as the user: any site URL they can open works.
    missingConfig.push('SHAREPOINT_SITES or SHAREPOINT_SITE_URL');
  }

  if (!env.SHAREPOINT_TENANT_ID) missingConfig.push('SHAREPOINT_TENANT_ID');
  if (!env.SHAREPOINT_CLIENT_ID) missingConfig.push('SHAREPOINT_CLIENT_ID');
  if (authMode === 'client-credentials' && !secret) {
    missingConfig.push('SHAREPOINT_CLIENT_SECRET');
  }

  if (missingConfig.length > 0) {
    throw new Error(`Missing SharePoint configuration: ${missingConfig.join(', ')}`);
  }

  const config: SharePointConfig = {
    sites: resources,
    authMethod: 'entra-id',
    authMode,
    tenantId: env.SHAREPOINT_TENANT_ID!,
    clientId: env.SHAREPOINT_CLIENT_ID!,
  };
  if (authMode === 'client-credentials') {
    config.clientSecret = secret;
  }
  return config;
}
