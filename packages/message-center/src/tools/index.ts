import type { ServiceContext } from '../types.js';
import { registerHealthTools } from './health-tools.js';
import { registerMessageTools } from './message-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerHealthTools(server, ctx);
  registerMessageTools(server, ctx);
}

export { registerHealthTools } from './health-tools.js';
export { registerMessageTools } from './message-tools.js';
