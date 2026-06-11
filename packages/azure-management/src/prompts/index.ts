import type { ServiceContext } from '../types.js';
import { registerManagementPrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerManagementPrompts(server, ctx);
}

export { registerManagementPrompts } from './templates.js';
