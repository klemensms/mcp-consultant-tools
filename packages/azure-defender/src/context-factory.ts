/**
 * Shared ServiceContext factory for Azure Defender.
 * Used by both the MCP server (index.ts) and the CLI (cli.ts).
 *
 * Unlike azure-sql, this package has exactly ONE copy of this function — index.ts
 * imports it rather than keeping a private duplicate.
 */

import { DefenderClient, type DefenderClientConfig } from './defender-client.js';
import { SecureScoreService } from './services/secure-score-service.js';
import { AssessmentService } from './services/assessment-service.js';
import { ComplianceService } from './services/compliance-service.js';
import { AttackPathService } from './services/attack-path-service.js';
import { AlertService } from './services/alert-service.js';
import { PricingService } from './services/pricing-service.js';
import type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let client: DefenderClient | null = null;
  let secureScore: SecureScoreService | null = null;
  let assessment: AssessmentService | null = null;
  let compliance: ComplianceService | null = null;
  let attackPath: AttackPathService | null = null;
  let alert: AlertService | null = null;
  let pricing: PricingService | null = null;

  function getClient(): DefenderClient {
    if (!client) {
      const tenantId = process.env.AZURE_TENANT_ID;
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;
      const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;

      const missingConfig: string[] = [];
      if (!tenantId) missingConfig.push('AZURE_TENANT_ID');
      if (!clientId) missingConfig.push('AZURE_CLIENT_ID');
      if (!clientSecret) missingConfig.push('AZURE_CLIENT_SECRET');
      // Every tool in this package is subscription-scoped, so demand it up front
      // rather than failing later inside a request.
      if (!subscriptionId) missingConfig.push('AZURE_SUBSCRIPTION_ID');

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure Defender configuration: ${missingConfig.join(', ')}`);
      }

      const config: DefenderClientConfig = {
        tenantId: tenantId!,
        clientId: clientId!,
        clientSecret: clientSecret!,
        subscriptionId,
      };

      client = new DefenderClient(config);
      // Never log the subscription ID — it lands in transcripts and logs.
      console.error('Azure Defender client initialized');
    }
    return client;
  }

  return {
    get secureScore() {
      return (secureScore ??= new SecureScoreService(getClient()));
    },
    get assessment() {
      return (assessment ??= new AssessmentService(getClient()));
    },
    get compliance() {
      return (compliance ??= new ComplianceService(getClient()));
    },
    get attackPath() {
      return (attackPath ??= new AttackPathService(getClient()));
    },
    get alert() {
      return (alert ??= new AlertService(getClient()));
    },
    get pricing() {
      return (pricing ??= new PricingService(getClient()));
    },
  };
}
