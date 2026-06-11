/**
 * Workspace Service - Microsoft Fabric workspace operations.
 *
 * Covers the Fabric core API workspace endpoints plus workspace role
 * assignments. Mutations are gated behind FABRIC_ENABLE_WRITE /
 * FABRIC_ENABLE_DELETE via the shared FabricClient.
 */
import type { FabricClient } from '../fabric-client.js';

/** Fabric workspace role granted to a principal. */
export type WorkspaceRole = 'Admin' | 'Member' | 'Contributor' | 'Viewer';

/** Type of a principal in a workspace role assignment. */
export type PrincipalType = 'User' | 'Group' | 'ServicePrincipal' | 'ServicePrincipalProfile';

export class WorkspaceService {
  constructor(private readonly client: FabricClient) {}

  /** List all workspaces the service principal can access. */
  async listWorkspaces(): Promise<any> {
    const workspaces = await this.client.listAll<any>('/workspaces');
    return { count: workspaces.length, workspaces };
  }

  /** Get a single workspace by ID. */
  async getWorkspace(workspaceId: string): Promise<any> {
    return this.client.get(`/workspaces/${workspaceId}`);
  }

  /** Create a new workspace. */
  async createWorkspace(input: {
    displayName: string;
    description?: string;
    capacityId?: string;
  }): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.post('/workspaces', {
      displayName: input.displayName,
      description: input.description,
      capacityId: input.capacityId,
    });
  }

  /** Update a workspace's display name and/or description. */
  async updateWorkspace(
    workspaceId: string,
    input: { displayName?: string; description?: string },
  ): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.patch(`/workspaces/${workspaceId}`, {
      displayName: input.displayName,
      description: input.description,
    });
  }

  /** Delete a workspace. */
  async deleteWorkspace(workspaceId: string): Promise<any> {
    this.client.checkDeleteEnabled();
    await this.client.del(`/workspaces/${workspaceId}`);
    return { deleted: true, workspaceId };
  }

  /** List role assignments on a workspace. */
  async listRoleAssignments(workspaceId: string): Promise<any> {
    const assignments = await this.client.listAll<any>(
      `/workspaces/${workspaceId}/roleAssignments`,
    );
    return { workspaceId, count: assignments.length, roleAssignments: assignments };
  }

  /** Add a role assignment (grant a principal a role on a workspace). */
  async addRoleAssignment(
    workspaceId: string,
    input: { principalId: string; principalType: PrincipalType; role: WorkspaceRole },
  ): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.post(`/workspaces/${workspaceId}/roleAssignments`, {
      principal: { id: input.principalId, type: input.principalType },
      role: input.role,
    });
  }

  /** Remove a role assignment from a workspace. */
  async removeRoleAssignment(workspaceId: string, principalId: string): Promise<any> {
    this.client.checkWriteEnabled();
    await this.client.del(`/workspaces/${workspaceId}/roleAssignments/${principalId}`);
    return { removed: true, workspaceId, principalId };
  }
}
