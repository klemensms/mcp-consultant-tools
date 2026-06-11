/**
 * Agent pool operations for Azure DevOps Admin.
 */
import type { AdminClient } from './admin-client.js';
import type { AdoApiCollectionResponse } from '../types.js';

export class AgentPoolService {
  constructor(private client: AdminClient) {}

  async listAgentPools(poolType?: string): Promise<any> {
    let url = `_apis/distributedtask/pools?api-version=${this.client.apiVersion}`;
    if (poolType) {
      url += `&poolType=${poolType}`;
    }

    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(url);

    return {
      totalCount: response.value.length,
      pools: response.value.map((pool: any) => ({
        id: pool.id,
        name: pool.name,
        size: pool.size,
        isHosted: pool.isHosted,
        poolType: pool.poolType,
        createdBy: pool.createdBy?.displayName,
        createdOn: pool.createdOn,
        autoProvision: pool.autoProvision,
        autoUpdate: pool.autoUpdate,
        autoSize: pool.autoSize,
        targetSize: pool.targetSize
      }))
    };
  }

  async getAgentPool(poolId: number): Promise<any> {
    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/pools/${poolId}?api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      name: response.name,
      size: response.size,
      isHosted: response.isHosted,
      poolType: response.poolType,
      createdBy: response.createdBy?.displayName,
      createdOn: response.createdOn,
      autoProvision: response.autoProvision,
      autoUpdate: response.autoUpdate,
      autoSize: response.autoSize,
      targetSize: response.targetSize,
      owner: response.owner?.displayName,
      agentCloudId: response.agentCloudId,
      properties: response.properties
    };
  }

  async listAgents(poolId: number, includeCapabilities: boolean = false): Promise<any> {
    const response = await this.client.makeRequest<AdoApiCollectionResponse<any>>(
      `_apis/distributedtask/pools/${poolId}/agents?includeCapabilities=${includeCapabilities}&api-version=${this.client.apiVersion}`
    );

    return {
      poolId,
      totalCount: response.value.length,
      agents: response.value.map((agent: any) => ({
        id: agent.id,
        name: agent.name,
        version: agent.version,
        osDescription: agent.osDescription,
        enabled: agent.enabled,
        status: agent.status,
        provisioningState: agent.provisioningState,
        createdOn: agent.createdOn,
        maxParallelism: agent.maxParallelism,
        systemCapabilities: includeCapabilities ? agent.systemCapabilities : undefined,
        userCapabilities: includeCapabilities ? agent.userCapabilities : undefined
      }))
    };
  }

  async getAgent(poolId: number, agentId: number): Promise<any> {
    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/pools/${poolId}/agents/${agentId}?includeCapabilities=true&api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      name: response.name,
      version: response.version,
      osDescription: response.osDescription,
      enabled: response.enabled,
      status: response.status,
      provisioningState: response.provisioningState,
      accessPoint: response.accessPoint,
      createdOn: response.createdOn,
      maxParallelism: response.maxParallelism,
      systemCapabilities: response.systemCapabilities,
      userCapabilities: response.userCapabilities,
      assignedRequest: response.assignedRequest,
      lastCompletedRequest: response.lastCompletedRequest
    };
  }

  async updateAgentPool(
    poolId: number,
    updates: {
      autoProvision?: boolean;
      autoUpdate?: boolean;
      autoSize?: boolean;
      targetSize?: number;
    }
  ): Promise<any> {
    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/pools/${poolId}?api-version=${this.client.apiVersion}`,
      'PATCH',
      updates
    );

    return {
      id: response.id,
      name: response.name,
      autoProvision: response.autoProvision,
      autoUpdate: response.autoUpdate,
      autoSize: response.autoSize,
      targetSize: response.targetSize
    };
  }

  async enableAgent(poolId: number, agentId: number): Promise<any> {
    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/pools/${poolId}/agents/${agentId}?api-version=${this.client.apiVersion}`,
      'PATCH',
      { enabled: true }
    );

    return {
      id: response.id,
      name: response.name,
      enabled: response.enabled,
      status: response.status
    };
  }

  async disableAgent(poolId: number, agentId: number): Promise<any> {
    const response = await this.client.makeRequest<any>(
      `_apis/distributedtask/pools/${poolId}/agents/${agentId}?api-version=${this.client.apiVersion}`,
      'PATCH',
      { enabled: false }
    );

    return {
      id: response.id,
      name: response.name,
      enabled: response.enabled,
      status: response.status,
      message: 'Agent disabled - will complete current job then stop accepting new jobs'
    };
  }
}
