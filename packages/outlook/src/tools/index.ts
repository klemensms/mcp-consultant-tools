/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerAuthTools } from './auth-tools.js';
import { registerReadTools } from './read-tools.js';
import { registerWriteTools } from './write-tools.js';
import { registerSendTools } from './send-tools.js';
import { registerDeleteTools } from './delete-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerAuthTools(server, ctx);
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerSendTools(server, ctx);
  registerDeleteTools(server, ctx);
}

export { registerAuthTools } from './auth-tools.js';
export { registerReadTools } from './read-tools.js';
export { registerWriteTools } from './write-tools.js';
export { registerSendTools } from './send-tools.js';
export { registerDeleteTools } from './delete-tools.js';
