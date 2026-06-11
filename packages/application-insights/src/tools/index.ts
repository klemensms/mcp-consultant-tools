/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerQueryTools } from './query-tools.js';
import { registerTelemetryTools } from './telemetry-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerQueryTools(server, ctx);
  registerTelemetryTools(server, ctx);
}

export { registerQueryTools } from './query-tools.js';
export { registerTelemetryTools } from './telemetry-tools.js';
