/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { FigmaService } from './services/figma-service.js';

export interface ServiceContext {
  readonly figma: FigmaService;
}
