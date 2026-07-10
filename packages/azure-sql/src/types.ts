/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { ConnectionService } from './services/connection-service.js';
import type { QueryService } from './services/query-service.js';
import type { WriteService } from './services/write-service.js';
import type { PerformanceService } from './services/performance-service.js';

export interface ServiceContext {
  readonly connection: ConnectionService;
  readonly query: QueryService;
  readonly write: WriteService;
  readonly performance: PerformanceService;
  checkViewManageEnabled(): void;
  checkViewDropEnabled(): void;
  checkSprocManageEnabled(): void;
  checkSprocDropEnabled(): void;
  checkSprocExecuteEnabled(): void;
  checkInsertEnabled(): void;
  checkUpdateEnabled(): void;
  checkDeleteEnabled(): void;
}
