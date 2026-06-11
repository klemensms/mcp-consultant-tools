/**
 * OOTB (Out-of-the-Box) component detection for integration audit tools.
 *
 * Filters Microsoft-provided components so audit results focus on
 * custom integrations. Based on analysis of typical environment data.
 */

import type { ServiceEndpoint, WebhookRegistration, EnvironmentVariable } from '../services/IntegrationAuditService.js';

// ============================================================================
// OOTB Detection Constants
// ============================================================================

/** Webhook entity prefixes that indicate OOTB origin */
const OOTB_WEBHOOK_ENTITY_PREFIXES = ['msdyn', 'msevtmgt_', 'msdynmkt_'];

/** Webhook trigger message prefixes that indicate OOTB origin */
const OOTB_WEBHOOK_MESSAGE_PREFIXES = ['msdyn', 'msdyncrm_', 'msdynmkt_', 'msevtmgt_', 'msgdpr_', 'pva'];

/** Webhook entity names that are OOTB (exact match) */
const OOTB_WEBHOOK_ENTITIES = new Set([
  'chat',
  'msevtmgt_event',
  'msevtmgt_session',
  'msevtmgt_eventteammember',
]);

/** Environment variable schema name prefixes that indicate OOTB origin (unmanaged OOTB) */
const OOTB_ENV_VAR_PREFIXES = ['msdyn_', 'msdynmkt_', 'AllowUpdate'];

/** Service endpoint exact names that are OOTB */
const OOTB_ENDPOINT_NAMES = new Set(['IoT Message', 'Managed Data Lake']);

/** Service endpoint name prefixes that are OOTB */
const OOTB_ENDPOINT_PREFIXES = ['orch-engine-'];

// ============================================================================
// OOTB Detection Functions
// ============================================================================

/**
 * Detect if a webhook registration is an OOTB Microsoft component.
 *
 * Uses trigger message prefix + entity name patterns rather than isManaged
 * (which is always false for webhooks in practice).
 */
export function isOotbWebhook(webhook: WebhookRegistration): boolean {
  const entity = webhook.triggerEntity.toLowerCase();
  const message = webhook.triggerMessage.toLowerCase();
  const name = webhook.name;

  // Check if the webhook name or trigger message starts with underscore (internal OOTB)
  if (name.startsWith('_') || webhook.triggerMessage.startsWith('_')) return true;

  // Check entity exact matches
  if (OOTB_WEBHOOK_ENTITIES.has(webhook.triggerEntity)) return true;

  // Check entity prefixes
  for (const prefix of OOTB_WEBHOOK_ENTITY_PREFIXES) {
    if (entity.startsWith(prefix.toLowerCase())) return true;
  }

  // Check trigger message prefixes
  for (const prefix of OOTB_WEBHOOK_MESSAGE_PREFIXES) {
    if (message.startsWith(prefix.toLowerCase())) return true;
  }

  return false;
}

/**
 * Detect if an environment variable is an OOTB Microsoft component.
 *
 * Uses isManaged flag (100% correlation for managed OOTB) plus
 * prefix matching for unmanaged OOTB variables.
 */
export function isOotbEnvVar(envVar: EnvironmentVariable): boolean {
  // Managed = OOTB in virtually all cases
  if (envVar.isManaged) return true;

  // Unmanaged but OOTB by prefix
  const schema = envVar.schemaName;
  for (const prefix of OOTB_ENV_VAR_PREFIXES) {
    if (schema.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Detect if a service endpoint is an OOTB Microsoft component.
 *
 * Uses name patterns + managed status with no URL (internal plumbing).
 */
export function isOotbServiceEndpoint(endpoint: ServiceEndpoint): boolean {
  // Exact name matches
  if (OOTB_ENDPOINT_NAMES.has(endpoint.name)) return true;

  // Name prefix matches
  const nameLower = endpoint.name.toLowerCase();
  for (const prefix of OOTB_ENDPOINT_PREFIXES) {
    if (nameLower.startsWith(prefix.toLowerCase())) return true;
  }

  // Managed endpoints with no URL = internal OOTB plumbing
  if (endpoint.isManaged && !endpoint.url) return true;

  return false;
}

// ============================================================================
// Generic Filter Helper
// ============================================================================

export interface FilterOotbResult<T> {
  filtered: T[];
  excludedCount: number;
}

/**
 * Filter OOTB items from an array using a detection function.
 * Returns the filtered array and the count of excluded items.
 */
export function filterOotb<T>(
  items: T[],
  isOotbFn: (item: T) => boolean
): FilterOotbResult<T> {
  const filtered: T[] = [];
  let excludedCount = 0;

  for (const item of items) {
    if (isOotbFn(item)) {
      excludedCount++;
    } else {
      filtered.push(item);
    }
  }

  return { filtered, excludedCount };
}
