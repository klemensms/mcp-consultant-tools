/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { AzureStorageService } from './AzureStorageService.js';

export interface ServiceContext {
  readonly storage: AzureStorageService;
}
