/**
 * Service context shared between the MCP server (index.ts) and the CLI (cli.ts).
 * Uses lazy getters so a missing credential only surfaces when a tool actually runs.
 */
import type { HealthService } from './services/health-service.js';
import type { MessageService } from './services/message-service.js';

export interface ServiceContext {
  readonly health: HealthService;
  readonly messages: MessageService;
}
