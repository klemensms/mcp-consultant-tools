/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerBlobTools } from './blob-tools.js';
import { registerFileTools } from './file-tools.js';
import { registerQueueTools } from './queue-tools.js';
import { registerTableTools } from './table-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerBlobTools(server, ctx);
  registerFileTools(server, ctx);
  registerQueueTools(server, ctx);
  registerTableTools(server, ctx);
}

export { registerBlobTools } from './blob-tools.js';
export { registerFileTools } from './file-tools.js';
export { registerQueueTools } from './queue-tools.js';
export { registerTableTools } from './table-tools.js';
