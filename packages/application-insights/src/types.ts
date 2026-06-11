/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { ApplicationInsightsService } from './services/appinsights-service.js';

export interface ServiceContext {
  readonly appInsights: ApplicationInsightsService;
}
