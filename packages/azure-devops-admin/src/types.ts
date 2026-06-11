/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { AdminClient } from './services/admin-client.js';
import type { PipelineService } from './services/pipeline-service.js';
import type { ServiceConnectionService } from './services/service-connection-service.js';
import type { VariableGroupService } from './services/variable-group-service.js';
import type { AgentPoolService } from './services/agent-pool-service.js';
import type { EnvironmentService } from './services/environment-service.js';
import type { ClassificationService } from './services/classification-service.js';
import type { ArtifactFeedService } from './services/artifact-feed-service.js';
import type { ProjectService } from './services/project-service.js';

export interface AzureDevOpsAdminConfig {
  organization: string;
  pat?: string;
  authMode?: 'pat' | 'entra-id';
  projects: string[];
  apiVersion?: string;

  // Pipeline operations
  enablePipelineUpsert?: boolean;
  enablePipelineDelete?: boolean;

  // Service connection operations
  enableServiceConnUpsert?: boolean;
  enableServiceConnDelete?: boolean;

  // Variable group admin operations
  enableVariableGroupUpsert?: boolean;
  enableVariableGroupDelete?: boolean;

  // Agent pool operations
  enableAgentPoolUpsert?: boolean;
  enableAgentPoolDisable?: boolean;

  // Environment operations
  enableEnvironmentUpsert?: boolean;
  enableEnvironmentDelete?: boolean;

  // Classification node (iteration/area) operations
  enableClassificationNodeUpsert?: boolean;
  enableClassificationNodeDelete?: boolean;

  // Project operations
  enableProjectUpsert?: boolean;
  enableProjectDelete?: boolean;

  // Artifact feed allowlist
  feeds?: string[];
}

export interface TierFlags {
  // Tier 2: Upsert flags
  enablePipelineUpsert: boolean;
  enableServiceConnUpsert: boolean;
  enableVariableGroupUpsert: boolean;
  enableAgentPoolUpsert: boolean;
  enableEnvironmentUpsert: boolean;
  enableClassificationNodeUpsert: boolean;

  // Tier 3: Delete/Disable flags
  enablePipelineDelete: boolean;
  enableServiceConnDelete: boolean;
  enableVariableGroupDelete: boolean;
  enableAgentPoolDisable: boolean;
  enableEnvironmentDelete: boolean;
  enableClassificationNodeDelete: boolean;
  enableProjectUpsert: boolean;
  enableProjectDelete: boolean;
}

export interface ServiceContext {
  readonly client: AdminClient;
  readonly pipelines: PipelineService;
  readonly serviceConnections: ServiceConnectionService;
  readonly variableGroups: VariableGroupService;
  readonly agentPools: AgentPoolService;
  readonly environments: EnvironmentService;
  readonly classification: ClassificationService;
  readonly artifactFeeds: ArtifactFeedService;
  readonly projects: ProjectService;
  readonly tierFlags: TierFlags;
}

// Pipeline/Build types
export interface AdoApiCollectionResponse<T> {
  value: T[];
  count?: number;
  [key: string]: any;
}
