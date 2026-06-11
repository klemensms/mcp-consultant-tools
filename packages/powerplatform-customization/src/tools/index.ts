/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerEntityTools } from './entity-tools.js';
import { registerAttributeTools } from './attribute-tools.js';
import { registerRelationshipTools } from './relationship-tools.js';
import { registerOptionSetTools } from './optionset-tools.js';
import { registerFormViewTools } from './form-view-tools.js';
import { registerFormFileTools } from './form-file-tools.js';
import { registerWebResourceTools } from './web-resource-tools.js';
import { registerSolutionTools } from './solution-tools.js';
import { registerPluginTools } from './plugin-tools.js';
import { registerWorkflowTools } from './workflow-tools.js';
import { registerFlowTools } from './flow-tools.js';
import { registerAppEndpointTools } from './app-endpoint-tools.js';
import { registerFieldSecurityTools } from './field-security-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerEntityTools(server, ctx);
  registerAttributeTools(server, ctx);
  registerRelationshipTools(server, ctx);
  registerOptionSetTools(server, ctx);
  registerFormViewTools(server, ctx);
  registerFormFileTools(server, ctx);
  registerWebResourceTools(server, ctx);
  registerSolutionTools(server, ctx);
  registerPluginTools(server, ctx);
  registerWorkflowTools(server, ctx);
  registerFlowTools(server, ctx);
  registerAppEndpointTools(server, ctx);
  registerFieldSecurityTools(server, ctx);

  // 4 entity + 4 attribute + 4 relationship + 6 optionset + 9 form-view + 3 form-file
  // + 4 web-resource + 8 solution + 8 plugin + 6 workflow + 11 flow + 7 app-endpoint
  // + 14 field-security = 88
  console.error(`powerplatform-customization tools registered: 88 tools`);
}

export { registerEntityTools } from './entity-tools.js';
export { registerAttributeTools } from './attribute-tools.js';
export { registerRelationshipTools } from './relationship-tools.js';
export { registerOptionSetTools } from './optionset-tools.js';
export { registerFormViewTools } from './form-view-tools.js';
export { registerFormFileTools } from './form-file-tools.js';
export { registerWebResourceTools } from './web-resource-tools.js';
export { registerSolutionTools } from './solution-tools.js';
export { registerPluginTools } from './plugin-tools.js';
export { registerWorkflowTools } from './workflow-tools.js';
export { registerFlowTools } from './flow-tools.js';
export { registerAppEndpointTools } from './app-endpoint-tools.js';
export { registerFieldSecurityTools } from './field-security-tools.js';
