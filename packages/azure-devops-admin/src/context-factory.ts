/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { AdminClient } from './services/admin-client.js';
import { PipelineService } from './services/pipeline-service.js';
import { ServiceConnectionService } from './services/service-connection-service.js';
import { VariableGroupService } from './services/variable-group-service.js';
import { AgentPoolService } from './services/agent-pool-service.js';
import { EnvironmentService } from './services/environment-service.js';
import { ClassificationService } from './services/classification-service.js';
import { IterationCapacityService } from './services/iteration-capacity-service.js';
import { ArtifactFeedService } from './services/artifact-feed-service.js';
import { ProjectService } from './services/project-service.js';
import type { ServiceContext, AzureDevOpsAdminConfig, TierFlags } from './types.js';
import { resolveAuthConfig } from './ado-auth-provider.js';

export type { ServiceContext, TierFlags } from './types.js';

export function createServiceContext(): ServiceContext {
  let client: AdminClient | null = null;

  function getClient(): AdminClient {
    if (!client) {
      const missingConfig: string[] = [];
      if (!process.env.AZUREDEVOPS_ORGANIZATION) missingConfig.push('AZUREDEVOPS_ORGANIZATION');
      if (!process.env.AZUREDEVOPS_PROJECTS) missingConfig.push('AZUREDEVOPS_PROJECTS');

      if (missingConfig.length > 0) {
        throw new Error(
          `Missing required Azure DevOps configuration: ${missingConfig.join(', ')}`
        );
      }

      // Resolve auth mode (Entra ID or PAT) from environment variables
      const authConfig = resolveAuthConfig();

      const config: AzureDevOpsAdminConfig = {
        organization: process.env.AZUREDEVOPS_ORGANIZATION!,
        pat: authConfig.mode === 'pat' ? authConfig.pat : undefined,
        authMode: authConfig.mode,
        projects: process.env.AZUREDEVOPS_PROJECTS!.split(',').map(p => p.trim()).filter(p => p),
        apiVersion: process.env.AZUREDEVOPS_API_VERSION || '7.1',
        enablePipelineUpsert: process.env.AZUREDEVOPS_ENABLE_PIPELINE_UPSERT === 'true',
        enablePipelineDelete: process.env.AZUREDEVOPS_ENABLE_PIPELINE_DELETE === 'true',
        enableServiceConnUpsert: process.env.AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT === 'true',
        enableServiceConnDelete: process.env.AZUREDEVOPS_ENABLE_SERVICE_CONN_DELETE === 'true',
        enableVariableGroupUpsert: process.env.AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT === 'true',
        enableVariableGroupDelete: process.env.AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE === 'true',
        enableAgentPoolUpsert: process.env.AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT === 'true',
        enableAgentPoolDisable: process.env.AZUREDEVOPS_ENABLE_AGENT_POOL_DISABLE === 'true',
        enableEnvironmentUpsert: process.env.AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT === 'true',
        enableEnvironmentDelete: process.env.AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE === 'true',
        enableClassificationNodeUpsert: process.env.AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT === 'true',
        enableClassificationNodeDelete: process.env.AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE === 'true',
        enableIterationCapacityUpsert: process.env.AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT === 'true',
        enableProjectUpsert: process.env.AZUREDEVOPS_ENABLE_PROJECT_UPSERT === 'true',
        enableProjectDelete: process.env.AZUREDEVOPS_ENABLE_PROJECT_DELETE === 'true',
        feeds: process.env.AZUREDEVOPS_FEEDS
          ? process.env.AZUREDEVOPS_FEEDS.split(',').map(f => f.trim()).filter(f => f)
          : undefined,
      };

      client = new AdminClient(config, authConfig);
      console.error(`Azure DevOps Admin service initialized (auth: ${authConfig.mode})`);
    }
    return client;
  }

  const tierFlags: TierFlags = {
    enablePipelineUpsert: process.env.AZUREDEVOPS_ENABLE_PIPELINE_UPSERT === 'true',
    enablePipelineDelete: process.env.AZUREDEVOPS_ENABLE_PIPELINE_DELETE === 'true',
    enableServiceConnUpsert: process.env.AZUREDEVOPS_ENABLE_SERVICE_CONN_UPSERT === 'true',
    enableServiceConnDelete: process.env.AZUREDEVOPS_ENABLE_SERVICE_CONN_DELETE === 'true',
    enableVariableGroupUpsert: process.env.AZUREDEVOPS_ENABLE_VARIABLE_GROUP_UPSERT === 'true',
    enableVariableGroupDelete: process.env.AZUREDEVOPS_ENABLE_VARIABLE_GROUP_DELETE === 'true',
    enableAgentPoolUpsert: process.env.AZUREDEVOPS_ENABLE_AGENT_POOL_UPSERT === 'true',
    enableAgentPoolDisable: process.env.AZUREDEVOPS_ENABLE_AGENT_POOL_DISABLE === 'true',
    enableEnvironmentUpsert: process.env.AZUREDEVOPS_ENABLE_ENVIRONMENT_UPSERT === 'true',
    enableEnvironmentDelete: process.env.AZUREDEVOPS_ENABLE_ENVIRONMENT_DELETE === 'true',
    enableClassificationNodeUpsert: process.env.AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_UPSERT === 'true',
    enableClassificationNodeDelete: process.env.AZUREDEVOPS_ENABLE_CLASSIFICATION_NODE_DELETE === 'true',
    enableIterationCapacityUpsert: process.env.AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT === 'true',
    enableProjectUpsert: process.env.AZUREDEVOPS_ENABLE_PROJECT_UPSERT === 'true',
    enableProjectDelete: process.env.AZUREDEVOPS_ENABLE_PROJECT_DELETE === 'true',
  };

  return {
    get client() { return getClient(); },
    get pipelines() { return new PipelineService(getClient()); },
    get serviceConnections() { return new ServiceConnectionService(getClient()); },
    get variableGroups() { return new VariableGroupService(getClient()); },
    get agentPools() { return new AgentPoolService(getClient()); },
    get environments() { return new EnvironmentService(getClient()); },
    get classification() { return new ClassificationService(getClient()); },
    get iterationCapacity() { return new IterationCapacityService(getClient()); },
    get artifactFeeds() { return new ArtifactFeedService(getClient()); },
    get projects() { return new ProjectService(getClient()); },
    tierFlags,
  };
}
