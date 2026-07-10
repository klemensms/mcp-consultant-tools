/**
 * Service context shared between the MCP server (index.ts) and the CLI (cli.ts).
 * Uses a lazy getter so a missing credential only surfaces when a tool actually runs.
 */
import type { AppRegistrationService } from './services/app-registration-service.js';

export interface ServiceContext {
  readonly appRegistration: AppRegistrationService;
}
