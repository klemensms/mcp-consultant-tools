/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerConfigurationTools } from './configuration-tools.js';
import { registerWikiTools } from './wiki-tools.js';
import { registerWorkItemTools } from './work-item-tools.js';
import { registerPullRequestTools, getPrWriteToolCount } from './pull-request-tools.js';
import { registerBuildTools } from './build-tools.js';
import { registerVariableGroupTools } from './variable-group-tools.js';
import { registerSyncTools } from './sync-tools.js';
import { registerChecklistTools } from './checklist-tools.js';
import { registerVisualizeTools } from './visualize-tools.js';
import { registerTestTools } from './test-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerConfigurationTools(server, ctx);
  registerWikiTools(server, ctx);
  registerWorkItemTools(server, ctx);
  registerPullRequestTools(server, ctx);
  registerBuildTools(server, ctx);
  registerVariableGroupTools(server, ctx);
  registerSyncTools(server, ctx);
  registerChecklistTools(server, ctx);
  registerVisualizeTools(server, ctx);
  registerTestTools(server, ctx);

  // Log registration summary
  // 1 config + 11 wiki + 10 work-item + 6 PR-read + 3 build + 2 variable-group + 8 sync + 8 checklist + 2 visualize + 7 test = 58
  const baseToolsCount = 58;
  const prWriteToolsCount = getPrWriteToolCount();
  const totalToolsCount = baseToolsCount + prWriteToolsCount;
  console.error(`azure-devops tools registered: ${totalToolsCount} tools (${baseToolsCount} base + ${prWriteToolsCount} PR write)`);
}

export { registerConfigurationTools } from './configuration-tools.js';
export { registerWikiTools } from './wiki-tools.js';
export { registerWorkItemTools } from './work-item-tools.js';
export { registerPullRequestTools, getPrWriteToolCount } from './pull-request-tools.js';
export { registerBuildTools } from './build-tools.js';
export { registerVariableGroupTools } from './variable-group-tools.js';
export { registerSyncTools } from './sync-tools.js';
export { registerChecklistTools } from './checklist-tools.js';
export { registerVisualizeTools } from './visualize-tools.js';
export { registerTestTools } from './test-tools.js';
