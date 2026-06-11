/**
 * Shortcut Service - Microsoft Fabric OneLake shortcut operations.
 *
 * Shortcuts are zero-copy virtual references into ADLS Gen2, Amazon S3,
 * Dataverse, or other OneLake locations. They live under a data item
 * (typically a lakehouse) in a workspace.
 */
import type { FabricClient } from '../fabric-client.js';

export class ShortcutService {
  constructor(private readonly client: FabricClient) {}

  /** List shortcuts defined in an item (e.g. a lakehouse). */
  async listShortcuts(workspaceId: string, itemId: string): Promise<any> {
    const shortcuts = await this.client.listAll<any>(
      `/workspaces/${workspaceId}/items/${itemId}/shortcuts`,
    );
    return { workspaceId, itemId, count: shortcuts.length, shortcuts };
  }

  /**
   * Create a OneLake shortcut.
   *
   * `target` is the connector-specific target object, e.g.
   * `{ "adlsGen2": { "location": "...", "subpath": "...", "connectionId": "..." } }`
   * or `{ "oneLake": { "workspaceId": "...", "itemId": "...", "path": "..." } }`.
   */
  async createShortcut(
    workspaceId: string,
    itemId: string,
    input: { path: string; name: string; target: Record<string, unknown> },
  ): Promise<any> {
    this.client.checkWriteEnabled();
    return this.client.post(`/workspaces/${workspaceId}/items/${itemId}/shortcuts`, {
      path: input.path,
      name: input.name,
      target: input.target,
    });
  }

  /** Delete a shortcut by its path and name within an item. */
  async deleteShortcut(
    workspaceId: string,
    itemId: string,
    shortcutPath: string,
    shortcutName: string,
  ): Promise<any> {
    this.client.checkDeleteEnabled();
    const path = shortcutPath
      .split('/')
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    await this.client.del(
      `/workspaces/${workspaceId}/items/${itemId}/shortcuts/${path}/${encodeURIComponent(shortcutName)}`,
    );
    return { deleted: true, workspaceId, itemId, shortcutPath, shortcutName };
  }
}
