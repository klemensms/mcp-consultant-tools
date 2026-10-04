/**
 * Service context shared between MCP server and tool/prompt registrations.
 * Uses a lazy getter to initialize the PowerPlatformService on-demand.
 */
import type { AuditPipeline } from '@mcp-consultant-tools/core';
import type { PowerPlatformService } from './PowerPlatformService.js';

export interface ServiceContext {
  readonly pp: PowerPlatformService;
  /**
   * Audit log, or null while MCP_AUDIT_LEVEL is unset or `off` (the default).
   * Used by the flow-run tools, which moved here from powerplatform-data with
   * their audit logging.
   */
  readonly audit?: AuditPipeline | null;
}
