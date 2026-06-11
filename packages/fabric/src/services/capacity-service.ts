/**
 * Capacity Service - Microsoft Fabric capacity operations.
 *
 * Fabric exposes a list endpoint for capacities; there is no dedicated
 * "get single capacity" route, so getCapacity filters the list. Capacity
 * assignment/unassignment is performed against the workspace resource.
 */
import type { FabricClient } from '../fabric-client.js';

export class CapacityService {
  constructor(private readonly client: FabricClient) {}

  /** List all capacities the service principal can access. */
  async listCapacities(): Promise<any> {
    const capacities = await this.client.listAll<any>('/capacities');
    return { count: capacities.length, capacities };
  }

  /**
   * Get a single capacity by ID.
   *
   * The Fabric REST API has no per-capacity GET route, so this filters the
   * list endpoint client-side.
   */
  async getCapacity(capacityId: string): Promise<any> {
    const capacities = await this.client.listAll<any>('/capacities');
    const match = capacities.find((c: any) => c.id === capacityId);
    if (!match) {
      throw new Error(`Capacity not found: ${capacityId}`);
    }
    return match;
  }

  /** Assign a workspace to a capacity. */
  async assignWorkspaceToCapacity(workspaceId: string, capacityId: string): Promise<any> {
    this.client.checkWriteEnabled();
    await this.client.post(`/workspaces/${workspaceId}/assignToCapacity`, { capacityId });
    return { assigned: true, workspaceId, capacityId };
  }

  /** Unassign a workspace from its capacity. */
  async unassignWorkspaceFromCapacity(workspaceId: string): Promise<any> {
    this.client.checkWriteEnabled();
    await this.client.post(`/workspaces/${workspaceId}/unassignFromCapacity`);
    return { unassigned: true, workspaceId };
  }
}
