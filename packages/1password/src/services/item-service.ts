/**
 * Item Service — CRUD, batch, search operations on 1Password items.
 *
 * Key notes:
 * - list-items filtering is CLIENT-SIDE (SDK only supports ItemListFilter natively)
 * - update-item uses get-merge-put pattern (SDK requires full Item object)
 * - search-items iterates across all allowed vaults
 */
import type { OnePasswordClient } from '../onepassword-client.js';

export class ItemService {
  private readonly _client: OnePasswordClient;

  constructor(client: OnePasswordClient) {
    this._client = client;
  }

  async listItems(
    vaultId: string,
    filter?: { title?: string; tag?: string; state?: 'active' | 'archived' }
  ): Promise<any[]> {
    await this._client.validateVault(vaultId);
    const client = await this._client.getClient();
    // SDK returns Promise<ItemOverview[]> directly
    const items: any[] = await client.items.list(vaultId);

    // Client-side filtering
    let filtered = items;
    if (filter?.title) {
      const search = filter.title.toLowerCase();
      filtered = filtered.filter((i: any) => i.title?.toLowerCase().includes(search));
    }
    if (filter?.tag) {
      filtered = filtered.filter((i: any) =>
        i.tags?.some((t: string) => t.toLowerCase() === filter.tag!.toLowerCase())
      );
    }
    return filtered;
  }

  async getItem(vaultId: string, itemId: string): Promise<any> {
    await this._client.validateVault(vaultId);
    const client = await this._client.getClient();
    return client.items.get(vaultId, itemId);
  }

  async batchGetItems(vaultId: string, itemIds: string[]): Promise<any> {
    await this._client.validateVault(vaultId);
    if (itemIds.length > 50) {
      throw new Error('Batch get supports up to 50 items. Received: ' + itemIds.length);
    }
    const client = await this._client.getClient();
    // Returns ItemsGetAllResponse (not a plain array)
    return client.items.getAll(vaultId, itemIds);
  }

  async createItem(vaultId: string, item: any): Promise<any> {
    await this._client.validateVault(vaultId);
    const client = await this._client.getClient();
    // SDK create() takes ItemCreateParams which includes vaultId as a field
    return client.items.create({ vaultId, ...item } as any);
  }

  async updateItem(vaultId: string, itemId: string, changes: any): Promise<any> {
    await this._client.validateVault(vaultId);
    const client = await this._client.getClient();

    // GET current item
    const current = await client.items.get(vaultId, itemId);

    // MERGE changes onto current
    if (changes.title !== undefined) (current as any).title = changes.title;
    if (changes.notes !== undefined) (current as any).notes = changes.notes;
    if (changes.tags !== undefined) (current as any).tags = changes.tags;
    if (changes.fields !== undefined) {
      for (const newField of changes.fields) {
        const fields = (current as any).fields || [];
        const idx = fields.findIndex(
          (f: any) => f.id === newField.id || f.title === newField.title
        );
        if (idx >= 0) {
          fields[idx] = { ...fields[idx], ...newField };
        } else {
          fields.push(newField);
        }
        (current as any).fields = fields;
      }
    }
    if (changes.websites !== undefined) (current as any).websites = changes.websites;

    // PUT full object back
    return client.items.put(current);
  }

  async deleteItem(vaultId: string, itemId: string): Promise<void> {
    await this._client.validateVault(vaultId);
    const client = await this._client.getClient();
    await client.items.delete(vaultId, itemId);
  }

  async batchDeleteItems(vaultId: string, itemIds: string[]): Promise<void> {
    await this._client.validateVault(vaultId);
    const client = await this._client.getClient();
    await client.items.deleteAll(vaultId, itemIds);
  }

  async archiveItem(vaultId: string, itemId: string): Promise<void> {
    await this._client.validateVault(vaultId);
    const client = await this._client.getClient();
    await client.items.archive(vaultId, itemId);
  }

  async batchCreateItems(vaultId: string, items: any[]): Promise<any> {
    await this._client.validateVault(vaultId);
    if (items.length > 100) {
      throw new Error('Batch create supports up to 100 items. Received: ' + items.length);
    }
    const client = await this._client.getClient();
    // Returns ItemsUpdateAllResponse (not a plain array)
    return client.items.createAll(vaultId, items as any);
  }

  async searchItems(
    filter?: { title?: string; tag?: string }
  ): Promise<Array<any & { vaultId: string; vaultName: string }>> {
    const client = await this._client.getClient();
    const results: Array<any & { vaultId: string; vaultName: string }> = [];

    // SDK returns Promise<VaultOverview[]> directly
    const vaults: any[] = await client.vaults.list();

    const allowedVaults = this._client.config.allowedVaults;
    const filteredVaults = allowedVaults.includes('*')
      ? vaults
      : vaults.filter(v =>
          allowedVaults.some(a =>
            a.toLowerCase() === v.title.toLowerCase() || a.toLowerCase() === v.id.toLowerCase()
          )
        );

    for (const vault of filteredVaults) {
      const items = await this.listItems(vault.id, filter);
      for (const item of items) {
        results.push({ ...item, vaultId: vault.id, vaultName: vault.title });
      }
    }

    return results;
  }
}
