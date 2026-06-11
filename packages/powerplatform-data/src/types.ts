/**
 * Service context shared between MCP server and CLI entry points.
 * Uses lazy getters to initialize the PowerPlatformService on-demand.
 */
import type { PowerPlatformService } from './PowerPlatformService.js';
import type { AuditPipeline } from '@mcp-consultant-tools/core';

export interface ServiceContext {
  readonly pp: PowerPlatformService;
  readonly audit: AuditPipeline | null;
  checkCreateEnabled(): void;
  checkUpdateEnabled(): void;
  checkDeleteEnabled(): void;
  checkActionsEnabled(): void;
}
