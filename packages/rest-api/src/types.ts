/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { RestApiService } from './services/rest-api-service.js';

export interface ServiceContext {
  readonly restApi: RestApiService;
}
