/**
 * Shared ServiceContext factory for Azure DevOps.
 * Used by both MCP server (index.ts) and CLI (cli.ts).
 */

import { createPiiPipelineFromEnv } from '@mcp-consultant-tools/core';
import { AzureDevOpsClient } from './azure-devops-client.js';
import type { AzureDevOpsConfig } from './models/index.js';
import type { ServiceContext } from './types.js';
import { resolveAuthConfig } from './ado-auth-provider.js';
import {
  WikiService,
  WorkItemService,
  PullRequestService,
  BuildService,
  GitService,
  VariableGroupService,
  SyncService,
  ConfigurationService,
  ChecklistService,
  TestService,
} from './services/index.js';

/**
 * Build a ServiceContext from environment variables (lazy client initialization).
 */
export function createServiceContext(): ServiceContext {
  const piiPipeline = createPiiPipelineFromEnv({
    environmentIdentifier: process.env.AZUREDEVOPS_ORGANIZATION,
  });
  let client: AzureDevOpsClient | null = null;

  function getClient(): AzureDevOpsClient {
    if (!client) {
      const missingConfig: string[] = [];
      if (!process.env.AZUREDEVOPS_ORGANIZATION) missingConfig.push("AZUREDEVOPS_ORGANIZATION");
      if (!process.env.AZUREDEVOPS_PROJECTS) missingConfig.push("AZUREDEVOPS_PROJECTS");

      if (missingConfig.length > 0) {
        throw new Error(
          `Missing required Azure DevOps configuration: ${missingConfig.join(", ")}. ` +
          `Set environment variables for organization and allowed projects.`
        );
      }

      // Resolve auth mode (Entra ID or PAT) from environment variables
      const authConfig = resolveAuthConfig();

      const config: AzureDevOpsConfig = {
        organization: process.env.AZUREDEVOPS_ORGANIZATION!,
        pat: authConfig.mode === 'pat' ? authConfig.pat : undefined,
        authMode: authConfig.mode,
        projects: process.env.AZUREDEVOPS_PROJECTS!.split(",").map(p => p.trim()).filter(p => p),
        apiVersion: process.env.AZUREDEVOPS_API_VERSION || "7.1",
        enableWorkItemWrite: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE === "true",
        enableWorkItemDelete: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE === "true",
        enableWikiWrite: process.env.AZUREDEVOPS_ENABLE_WIKI_WRITE === "true",
        enableWikiDelete: process.env.AZUREDEVOPS_ENABLE_WIKI_DELETE === "true",
        enablePullRequestWrite: process.env.AZUREDEVOPS_ENABLE_PR_WRITE === "true",
        commentFormat: (process.env.AZUREDEVOPS_COMMENT_FORMAT as 'markdown' | 'html') || 'markdown',
      };

      client = new AzureDevOpsClient(config, authConfig);
      console.error(`Azure DevOps service initialized (auth: ${authConfig.mode})`);
    }
    return client;
  }

  // Lazy service singletons
  let wiki: WikiService | null = null;
  let workItem: WorkItemService | null = null;
  let pullRequest: PullRequestService | null = null;
  let build: BuildService | null = null;
  let git: GitService | null = null;
  let variableGroup: VariableGroupService | null = null;
  let sync: SyncService | null = null;
  let configuration: ConfigurationService | null = null;
  let checklist: ChecklistService | null = null;
  let test: TestService | null = null;

  return {
    get client() { return getClient(); },
    get wiki() { return wiki ??= new WikiService(getClient()); },
    get workItem() { return workItem ??= new WorkItemService(getClient(), piiPipeline); },
    get pullRequest() { return pullRequest ??= new PullRequestService(getClient()); },
    get build() { return build ??= new BuildService(getClient()); },
    get git() { return git ??= new GitService(getClient()); },
    get variableGroup() { return variableGroup ??= new VariableGroupService(getClient()); },
    get sync() { return sync ??= new SyncService(workItem ??= new WorkItemService(getClient(), piiPipeline)); },
    get configuration() { return configuration ??= new ConfigurationService(); },
    get checklist() { return checklist ??= new ChecklistService(getClient(), workItem ??= new WorkItemService(getClient(), piiPipeline)); },
    get test() { return test ??= new TestService(getClient(), workItem ??= new WorkItemService(getClient(), piiPipeline)); },
  };
}
