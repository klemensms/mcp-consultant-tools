/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { LogAnalyticsService } from './services/log-analytics-service.js';

export interface ServiceContext {
  readonly logAnalytics: LogAnalyticsService;
}
