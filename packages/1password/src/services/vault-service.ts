/**
 * Vault Service - vault CRUD and permission management.
 */
import type { OnePasswordClient } from '../onepassword-client.js';
import { permissionsToBitmask, type PermissionName } from '../models/api-types.js';

export class VaultService {
  private readonly _client: OnePasswordClient;

  constructor(client: OnePasswordClient) {
    this._client = client;
  }

  async listVaults(): Promise<any[]> {
    const client = await this._client.getClient();
    // SDK returns Promise<VaultOverview[]> directly (not async iterable)
    const allVaults: any[] = await client.vaults.list();

    const allowed = this._client.config.allowedVaults;
    if (allowed.includes('*')) return allVaults;

    return allVaults.filter(v =>
      allowed.some(a =>
        a.toLowerCase() === v.title.toLowerCase() || a.toLowerCase() === v.id.toLowerCase()
      )
    );
  }

  async getVault(vaultId: string, includeAccessors?: boolean): Promise<any> {
    const resolvedId = await this._client.resolveVaultId(vaultId);
    await this._client.validateVault(resolvedId);
    const client = await this._client.getClient();
    // vaults.get() requires VaultGetParams (not optional)
    return client.vaults.get(resolvedId, { accessors: includeAccessors ?? false });
  }

  async createVault(name: string, description?: string): Promise<any> {
    const client = await this._client.getClient();
    // SDK VaultCreateParams uses 'title', not 'name'
    const result = await client.vaults.create({ title: name, description: description || '' });
    this._client.invalidateVaultCache();
    return result;
  }

  async updateVault(vaultId: string, changes: { name?: string; description?: string }): Promise<any> {
    const resolvedId = await this._client.resolveVaultId(vaultId);
    await this._client.validateVault(resolvedId);
    const client = await this._client.getClient();
    // SDK update() takes (vaultId, VaultUpdateParams) - uses 'title', not 'name'
    const params: any = {};
    if (changes.name !== undefined) params.title = changes.name;
    if (changes.description !== undefined) params.description = changes.description;
    return client.vaults.update(resolvedId, params);
  }

  async deleteVault(vaultId: string): Promise<void> {
    const resolvedId = await this._client.resolveVaultId(vaultId);
    await this._client.validateVault(resolvedId);
    const client = await this._client.getClient();
    await client.vaults.delete(resolvedId);
    this._client.invalidateVaultCache();
  }

  async grantPermissions(
    vaultId: string,
    groupPermissions: Array<{ groupId: string; permissions: PermissionName[] }>
  ): Promise<void> {
    const resolvedId = await this._client.resolveVaultId(vaultId);
    await this._client.validateVault(resolvedId);
    const client = await this._client.getClient();

    const grants = groupPermissions.map(gp => ({
      groupId: gp.groupId,
      permissions: permissionsToBitmask(gp.permissions),
    }));

    await client.vaults.grantGroupPermissions(resolvedId, grants as any);
  }

  async updatePermissions(
    groupPermissions: Array<{ vaultId: string; groupId: string; permissions: PermissionName[] }>
  ): Promise<void> {
    const client = await this._client.getClient();

    const updates = [];
    for (const gp of groupPermissions) {
      const resolvedVaultId = await this._client.resolveVaultId(gp.vaultId);
      await this._client.validateVault(resolvedVaultId);
      updates.push({
        vaultId: resolvedVaultId,
        groupId: gp.groupId,
        permissions: permissionsToBitmask(gp.permissions),
      });
    }

    await client.vaults.updateGroupPermissions(updates as any);
  }

  async revokePermissions(vaultId: string, groupIds: string[]): Promise<void> {
    const resolvedId = await this._client.resolveVaultId(vaultId);
    await this._client.validateVault(resolvedId);
    const client = await this._client.getClient();

    for (const groupId of groupIds) {
      await client.vaults.revokeGroupPermissions(resolvedId, groupId);
    }
  }
}
