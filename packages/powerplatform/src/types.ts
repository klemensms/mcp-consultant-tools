/**
 * Service context shared between MCP server and tool/prompt registrations.
 * Uses a lazy getter to initialize the PowerPlatformService on-demand.
 */
import type { PowerPlatformService } from './PowerPlatformService.js';

export interface ServiceContext {
  readonly pp: PowerPlatformService;
}
