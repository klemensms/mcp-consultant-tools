/**
 * Service context shared between MCP server and tool registration modules.
 * Uses lazy getter to initialize service on-demand.
 */
import type { PowerPlatformService } from './PowerPlatformService.js';

export interface ServiceContext {
  readonly pp: PowerPlatformService;
}
