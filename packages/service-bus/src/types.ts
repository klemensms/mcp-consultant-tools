/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { ServiceBusService } from './services/service-bus-service.js';

export interface ServiceContext {
  readonly serviceBus: ServiceBusService;
}
