/**
 * Item Service - Microsoft Fabric item operations.
 *
 * Items are the generic container for lakehouses, warehouses, notebooks,
 * data pipelines, semantic models, reports, etc. This service exposes the
 * generic item endpoints plus item-type-specific create routes for the
 * types where the Fabric API differentiates (lakehouse, warehouse, notebook).
 */
import type { FabricClient } from '../fabric-client.js';

export class ItemService {
  constructor(private readonly client: FabricClient) {}

  /** List items in a workspace, optionally filtered by item type. */
  async listItems(workspaceId: string, type?: string): Promise<any> {
    const items = await this.client.listAll<any>(`/workspaces/${workspaceId}/items`, {
      query: type ? { type } : undefined,
    });
    return { workspaceId, count: items.length, items };
  }

  /** Get a single item by ID. */
  async getItem(workspaceId: string, itemId: string): Promise<any> {
    return this.client.get(`/workspaces/${workspaceId}/items/${itemId}`);
  }

  /** Create a generic item of any type. */
  async createItem(
    workspaceId: string,
    input: { displayName: string; type: string; description?: string; definition?: unknown },
  ): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.post(`/workspaces/${workspaceId}/items`, {
      displayName: input.displayName,
      type: input.type,
      description: input.description,
      definition: input.definition,
    });
  }

  /** Update an item's display name and/or description. */
  async updateItem(
    workspaceId: string,
    itemId: string,
    input: { displayName?: string; description?: string },
  ): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.patch(`/workspaces/${workspaceId}/items/${itemId}`, {
      displayName: input.displayName,
      description: input.description,
    });
  }

  /** Delete an item. */
  async deleteItem(workspaceId: string, itemId: string): Promise<any> {
    this.client.checkDeleteEnabled();
    await this.client.del(`/workspaces/${workspaceId}/items/${itemId}`);
    return { deleted: true, workspaceId, itemId };
  }

  /** Create a lakehouse (item-type-specific endpoint). */
  async createLakehouse(
    workspaceId: string,
    input: { displayName: string; description?: string },
  ): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.post(`/workspaces/${workspaceId}/lakehouses`, {
      displayName: input.displayName,
      description: input.description,
    });
  }

  /** Create a warehouse (item-type-specific endpoint). */
  async createWarehouse(
    workspaceId: string,
    input: { displayName: string; description?: string },
  ): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.post(`/workspaces/${workspaceId}/warehouses`, {
      displayName: input.displayName,
      description: input.description,
    });
  }

  /** Create a notebook (item-type-specific endpoint). */
  async createNotebook(
    workspaceId: string,
    input: { displayName: string; description?: string },
  ): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.post(`/workspaces/${workspaceId}/notebooks`, {
      displayName: input.displayName,
      description: input.description,
    });
  }
}
