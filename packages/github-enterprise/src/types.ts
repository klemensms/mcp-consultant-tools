/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { RepoService } from './services/repo-service.js';
import type { PrService } from './services/pr-service.js';

export interface ServiceContext {
  readonly repo: RepoService;
  readonly pr: PrService;
}
