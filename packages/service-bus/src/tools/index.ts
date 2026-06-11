/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerServiceBusTools } from './service-bus-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerServiceBusTools(server, ctx);
}

export { registerServiceBusTools } from './service-bus-tools.js';
