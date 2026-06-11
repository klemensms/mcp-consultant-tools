import type { ServiceContext } from '../types.js';
import { registerSqlPrompts } from './templates.js';

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  registerSqlPrompts(server, ctx);
}

export { registerSqlPrompts } from './templates.js';
