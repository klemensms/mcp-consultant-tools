/**
 * Shared ServiceContext factory for PowerPlatform.
 * Used by both MCP server (index.ts) and CLI (cli.ts).
 */

import { createAuditConfigFromEnv, captureOperator, AuditPipeline, probeAuditStorage } from '@mcp-consultant-tools/core';
import type { AuditAuth } from '@mcp-consultant-tools/core';
import { PowerPlatformService, type PowerPlatformConfig } from './PowerPlatformService.js';
import type { ServiceContext } from './types.js';

/**
 * Build a ServiceContext from environment variables (lazy client initialization).
 */
export function createServiceContext(service?: PowerPlatformService): ServiceContext {
  let ppService: PowerPlatformService | null = service || null;

  function getPowerPlatformService(): PowerPlatformService {
    if (!ppService) {
      const coreRequiredVars = [
        'POWERPLATFORM_URL',
        'POWERPLATFORM_CLIENT_ID',
        'POWERPLATFORM_TENANT_ID'
      ];

      const missing = coreRequiredVars.filter(v => !process.env[v]);
      if (missing.length > 0) {
        throw new Error(`Missing required PowerPlatform configuration: ${missing.join(', ')}`);
      }

      const hasClientSecret = !!process.env.POWERPLATFORM_CLIENT_SECRET;

      const config: PowerPlatformConfig = {
        organizationUrl: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      ppService = new PowerPlatformService(config);

      const authMode = hasClientSecret ? 'service-principal' : 'interactive';
      console.error(`PowerPlatform auth mode: ${authMode}`);
    }
    return ppService;
  }

  const audit = buildAuditPipeline();

  return {
    get pp() { return getPowerPlatformService(); },
    audit,
  };
}

/**
 * The audit log, configured exactly as in powerplatform-data. Off, and null,
 * while MCP_AUDIT_LEVEL is unset, so a configuration without it starts as
 * before. With a level set, MCP_AUDIT_CLIENT is required (refuse to start).
 */
function buildAuditPipeline(): AuditPipeline | null {
  const cfg = createAuditConfigFromEnv();
  if (cfg.level === 'off') return null;
  probeAuditStorage(cfg);
  return new AuditPipeline(cfg, {
    operator: captureOperator(),
    auth: detectAuthPrincipal(),
    environment: {
      type: cfg.environmentType,
      url: process.env.POWERPLATFORM_URL,
      auditLevel: cfg.level,
    },
  });
}

function detectAuthPrincipal(): AuditAuth {
  const clientId = process.env.POWERPLATFORM_CLIENT_ID?.trim();
  const hasSecret = !!process.env.POWERPLATFORM_CLIENT_SECRET?.trim();
  if (clientId && hasSecret) {
    return { principalId: clientId, principalType: 'service-principal', userId: null };
  }
  if (clientId) {
    return { principalId: clientId, principalType: 'user-interactive', userId: null };
  }
  return { principalId: null, principalType: 'unknown', userId: null };
}
