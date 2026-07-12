/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerMetadataTools } from './metadata-tools.js';
import { registerPluginTools } from './plugin-tools.js';
import { registerFlowTools } from './flow-tools.js';
import { registerAppTools } from './app-tools.js';
import { registerFormViewTools } from './form-view-tools.js';
import { registerSolutionTools } from './solution-tools.js';
import { registerIntegrationTools } from './integration-tools.js';
import { registerSecurityTools } from './security-tools.js';
import { registerFieldSecurityTools } from './field-security-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerMetadataTools(server, ctx);
  registerPluginTools(server, ctx);
  registerFlowTools(server, ctx);
  registerAppTools(server, ctx);
  registerFormViewTools(server, ctx);
  registerSolutionTools(server, ctx);
  registerIntegrationTools(server, ctx);
  registerSecurityTools(server, ctx);
  registerFieldSecurityTools(server, ctx);

  // 5 metadata + 4 plugin + 11 flow + 4 app + 7 form-view + 8 solution + 5 integration + 4 security + 3 field-security = 51
  console.error(`powerplatform tools registered: 51 tools`);
}

export { registerMetadataTools } from './metadata-tools.js';
export { registerPluginTools } from './plugin-tools.js';
export { registerFlowTools } from './flow-tools.js';
export { registerAppTools } from './app-tools.js';
export { registerFormViewTools } from './form-view-tools.js';
export { registerSolutionTools } from './solution-tools.js';
export { registerIntegrationTools } from './integration-tools.js';
export { registerSecurityTools } from './security-tools.js';
