import type { ServiceContext } from '../types.js';
import { registerAppRegistrationTools } from './app-registration-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerAppRegistrationTools(server, ctx);
}

export { registerAppRegistrationTools } from './app-registration-tools.js';
