/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import {
  createPiiPipelineFromEnv,
  createAuditConfigFromEnv,
  captureOperator,
  AuditPipeline,
  probeAuditStorage,
} from '@mcp-consultant-tools/core';
import type { AuditAuth } from '@mcp-consultant-tools/core';
import { PowerPlatformService, PowerPlatformConfig } from './PowerPlatformService.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(service?: PowerPlatformService): ServiceContext {
  const piiPipeline = createPiiPipelineFromEnv({
    environmentIdentifier: process.env.POWERPLATFORM_URL,
  });
  const audit = buildAuditPipeline();

  let ppService: PowerPlatformService | null = service || null;

  function getPowerPlatformService(): PowerPlatformService {
    if (!ppService) {
      const requiredVars = [
        'POWERPLATFORM_URL',
        'POWERPLATFORM_CLIENT_ID',
        'POWERPLATFORM_TENANT_ID',
      ];
      const missing = requiredVars.filter((v) => !process.env[v]);
      if (missing.length > 0) {
        throw new Error(`Missing required PowerPlatform configuration: ${missing.join(', ')}`);
      }

      const config: PowerPlatformConfig = {
        organizationUrl: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      ppService = new PowerPlatformService(config, undefined, piiPipeline);
    }
    return ppService;
  }

  return {
    get pp() { return getPowerPlatformService(); },
    audit,
    checkCreateEnabled() {
      if (process.env.POWERPLATFORM_ENABLE_CREATE !== 'true') {
        throw new Error('Create operations are disabled. Set POWERPLATFORM_ENABLE_CREATE=true to enable.');
      }
    },
    checkUpdateEnabled() {
      if (process.env.POWERPLATFORM_ENABLE_UPDATE !== 'true') {
        throw new Error('Update operations are disabled. Set POWERPLATFORM_ENABLE_UPDATE=true to enable.');
      }
    },
    checkDeleteEnabled() {
      if (process.env.POWERPLATFORM_ENABLE_DELETE !== 'true') {
        throw new Error('Delete operations are disabled. Set POWERPLATFORM_ENABLE_DELETE=true to enable.');
      }
    },
    checkActionsEnabled() {
      if (process.env.POWERPLATFORM_ENABLE_ACTIONS !== 'true') {
        throw new Error('Action execution is disabled. Set POWERPLATFORM_ENABLE_ACTIONS=true to enable.');
      }
    },
  };
}

/**
 * Construct the audit pipeline from environment. Returns `null` only when
 * MCP_AUDIT_LEVEL=off (which is itself only allowed in dev/uat per the
 * refuse-to-start matrix). Consumers must null-check `ctx.audit` before use.
 */
function buildAuditPipeline(): AuditPipeline | null {
  const cfg = createAuditConfigFromEnv();
  if (cfg.level === 'off') return null;

  // Refuse-to-start matrix cases D + E: probe storage at startup so unwritable
  // base paths and corrupted chain-state files surface immediately, not on the
  // first audit emit.
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
