/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerConfigurationTools } from './configuration-tools.js';
import { registerWikiTools } from './wiki-tools.js';
import { registerWorkItemTools } from './work-item-tools.js';
import { registerPullRequestTools, getPrWriteToolCount } from './pull-request-tools.js';
import { registerBuildTools } from './build-tools.js';
import { registerGitTools } from './git-tools.js';
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
  registerGitTools(server, ctx);
  registerVariableGroupTools(server, ctx);
  registerSyncTools(server, ctx);
  registerChecklistTools(server, ctx);
  registerVisualizeTools(server, ctx);
  registerTestTools(server, ctx);

  // Log registration summary.
  // 66 tools register unconditionally; the 7 pull-request write tools register
  // only when AZUREDEVOPS_ENABLE_PR_WRITE=true, for 73 in total.
  // Measured against `tools/list` over stdio - do not derive this by hand.
  const baseToolsCount = 66;
  const prWriteToolsCount = getPrWriteToolCount();
  const totalToolsCount = baseToolsCount + prWriteToolsCount;
  console.error(`azure-devops tools registered: ${totalToolsCount} tools (${baseToolsCount} base + ${prWriteToolsCount} PR write)`);
}

export { registerConfigurationTools } from './configuration-tools.js';
export { registerWikiTools } from './wiki-tools.js';
export { registerWorkItemTools } from './work-item-tools.js';
export { registerPullRequestTools, getPrWriteToolCount } from './pull-request-tools.js';
export { registerBuildTools } from './build-tools.js';
export { registerGitTools } from './git-tools.js';
export { registerVariableGroupTools } from './variable-group-tools.js';
export { registerSyncTools } from './sync-tools.js';
export { registerChecklistTools } from './checklist-tools.js';
export { registerVisualizeTools } from './visualize-tools.js';
export { registerTestTools } from './test-tools.js';
