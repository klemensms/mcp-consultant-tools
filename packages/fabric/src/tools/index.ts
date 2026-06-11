/**
 * Tools barrel export + combined registration.
 */
import type { ServiceContext } from '../types.js';
import { registerWorkspaceTools } from './workspace-tools.js';
import { registerCapacityTools } from './capacity-tools.js';
import { registerItemTools } from './item-tools.js';
import { registerShortcutTools } from './shortcut-tools.js';
import { registerDomainTools } from './domain-tools.js';
import { registerAdminTools } from './admin-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerWorkspaceTools(server, ctx);
  registerCapacityTools(server, ctx);
  registerItemTools(server, ctx);
  registerShortcutTools(server, ctx);
  registerDomainTools(server, ctx);
  registerAdminTools(server, ctx);
}

export { registerWorkspaceTools } from './workspace-tools.js';
export { registerCapacityTools } from './capacity-tools.js';
export { registerItemTools } from './item-tools.js';
export { registerShortcutTools } from './shortcut-tools.js';
export { registerDomainTools } from './domain-tools.js';
export { registerAdminTools } from './admin-tools.js';
