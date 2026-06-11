/**
 * Service context shared between MCP server and CLI entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { AzureDevOpsClient } from './azure-devops-client.js';
import type { WikiService } from './services/wiki-service.js';
import type { WorkItemService } from './services/work-item-service.js';
import type { PullRequestService } from './services/pull-request-service.js';
import type { BuildService } from './services/build-service.js';
import type { VariableGroupService } from './services/variable-group-service.js';
import type { SyncService } from './services/sync-service.js';
import type { ConfigurationService } from './services/configuration-service.js';
import type { ChecklistService } from './services/checklist-service.js';
import type { TestService } from './services/test-service.js';

export interface ServiceContext {
  readonly client: AzureDevOpsClient;
  readonly wiki: WikiService;
  readonly workItem: WorkItemService;
  readonly pullRequest: PullRequestService;
  readonly build: BuildService;
  readonly variableGroup: VariableGroupService;
  readonly sync: SyncService;
  readonly configuration: ConfigurationService;
  readonly checklist: ChecklistService;
  readonly test: TestService;
}
