/**
 * Domain Service - Microsoft Fabric domain operations.
 *
 * Domains are the governance grouping for workspaces. These routes live
 * under the Fabric admin API (`/v1/admin`) and require the service
 * principal to have Fabric admin rights plus the relevant tenant-setting
 * opt-in.
 */
import type { FabricClient } from '../fabric-client.js';

export class DomainService {
  constructor(private readonly client: FabricClient) {}

  /** List all domains in the tenant. */
  async listDomains(): Promise<any> {
    const response = await this.client.get<{ domains?: any[] }>('/domains', { admin: true });
    const domains = response?.domains ?? [];
    return { count: domains.length, domains };
  }

  /** Get a single domain by ID. */
  async getDomain(domainId: string): Promise<any> {
    return this.client.get(`/domains/${domainId}`, { admin: true });
  }

  /** Assign one or more workspaces to a domain. */
  async assignWorkspaces(domainId: string, workspaceIds: string[]): Promise<any> {
    this.client.checkWriteEnabled();
    await this.client.post(
      `/domains/${domainId}/assignWorkspaces`,
      { workspacesIds: workspaceIds },
      { admin: true },
    );
    return { assigned: true, domainId, workspaceIds };
  }

  /** Unassign one or more workspaces from a domain. */
  async unassignWorkspaces(domainId: string, workspaceIds: string[]): Promise<any> {
    this.client.checkWriteEnabled();
    await this.client.post(
      `/domains/${domainId}/unassignWorkspaces`,
      { workspacesIds: workspaceIds },
      { admin: true },
    );
    return { unassigned: true, domainId, workspaceIds };
  }
}
