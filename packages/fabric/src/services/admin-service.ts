/**
 * Admin Service - Microsoft Fabric tenant-wide admin operations.
 *
 * These routes live under the Fabric admin API (`/v1/admin`) and require
 * the service principal to have Fabric admin rights plus the relevant
 * tenant-setting opt-in. Read-only for v1.
 */
import type { FabricClient } from '../fabric-client.js';

export class AdminService {
  constructor(private readonly client: FabricClient) {}

  /** List all workspaces in the tenant (admin view). */
  async listWorkspaces(): Promise<any> {
    const workspaces = await this.client.listAll<any>('/workspaces', { admin: true });
    return { count: workspaces.length, workspaces };
  }

  /**
   * List the tenant-wide item inventory (admin view), optionally filtered
   * by item type or owning workspace.
   */
  async listItems(filter?: { type?: string; workspaceId?: string }): Promise<any> {
    const query = {
      type: filter?.type,
      workspaceId: filter?.workspaceId,
    };

    const items: any[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.get<{
        itemEntities?: any[];
        value?: any[];
        continuationToken?: string;
      }>('/items', { admin: true, query: { ...query, continuationToken } });
      const pageItems = page?.itemEntities ?? page?.value ?? [];
      items.push(...pageItems);
      continuationToken = page?.continuationToken;
    } while (continuationToken);

    return { count: items.length, items };
  }

  /** Get the tenant settings (read-only). */
  async getTenantSettings(): Promise<any> {
    return this.client.get('/tenantsettings', { admin: true });
  }
}
