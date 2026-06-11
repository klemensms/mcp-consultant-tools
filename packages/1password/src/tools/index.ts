/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerSecretTools } from './secret-tools.js';
import { registerItemTools } from './item-tools.js';
import { registerVaultTools } from './vault-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerSecretTools(server, ctx);
  registerItemTools(server, ctx);
  registerVaultTools(server, ctx);

  // 3 secret + 10 item + 8 vault = 21 tools
  console.error('onepassword tools registered: 21 tools');
}

export { registerSecretTools } from './secret-tools.js';
export { registerItemTools } from './item-tools.js';
export { registerVaultTools } from './vault-tools.js';
