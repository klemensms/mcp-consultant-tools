import type { ServiceContext } from '../types.js';
import { registerConnectionTools } from './connection-tools.js';
import { registerQueryTools } from './query-tools.js';
import { registerViewTools } from './view-tools.js';
import { registerSprocTools } from './sproc-tools.js';
import { registerCrudTools } from './crud-tools.js';
import { registerUnrestrictedTools } from './unrestricted-tools.js';
import { registerPerformanceTools } from './performance-tools.js';
import { registerSessionTools } from './session-tools.js';
import { registerSpaceTools } from './space-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerConnectionTools(server, ctx);
  registerQueryTools(server, ctx);
  registerViewTools(server, ctx);
  registerSprocTools(server, ctx);
  registerCrudTools(server, ctx);
  registerUnrestrictedTools(server, ctx);
  registerPerformanceTools(server, ctx);
  registerSessionTools(server, ctx);
  registerSpaceTools(server, ctx);
}

export { registerConnectionTools } from './connection-tools.js';
export { registerQueryTools } from './query-tools.js';
export { registerViewTools } from './view-tools.js';
export { registerSprocTools } from './sproc-tools.js';
export { registerCrudTools } from './crud-tools.js';
export { registerUnrestrictedTools } from './unrestricted-tools.js';
export { registerPerformanceTools } from './performance-tools.js';
export { registerSessionTools } from './session-tools.js';
export { registerSpaceTools } from './space-tools.js';
