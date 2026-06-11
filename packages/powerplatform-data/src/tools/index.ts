/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerReadTools } from './read-tools.js';
import { registerWriteTools } from './write-tools.js';
import { registerAuditTools } from './audit-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerAuditTools(server, ctx);

  // 7 read + 6 write + 1 audit = 14 tools
  console.error(`powerplatform-data tools registered: 14 tools`);
}

export { registerReadTools } from './read-tools.js';
export { registerWriteTools } from './write-tools.js';
export { registerAuditTools } from './audit-tools.js';
