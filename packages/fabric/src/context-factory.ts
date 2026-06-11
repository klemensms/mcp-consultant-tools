/**
 * Shared ServiceContext factory for Microsoft Fabric.
 * Used by both the MCP server (index.ts) and the CLI (cli.ts).
 */
import { FabricClient } from './fabric-client.js';
import { resolveAuthConfig } from './fabric-auth-provider.js';
import type { ServiceContext } from './types.js';
import {
  WorkspaceService,
  CapacityService,
  ItemService,
  ShortcutService,
  DomainService,
  AdminService,
} from './services/index.js';

export type { ServiceContext } from './types.js';

/**
 * Build a ServiceContext from environment variables (lazy client/service init).
 */
export function createServiceContext(): ServiceContext {
  let client: FabricClient | null = null;

  function getClient(): FabricClient {
    if (!client) {
      const authConfig = resolveAuthConfig();
      client = new FabricClient(authConfig, {
        enableWrite: process.env.FABRIC_ENABLE_WRITE === 'true',
        enableDelete: process.env.FABRIC_ENABLE_DELETE === 'true',
      });
      console.error('Microsoft Fabric service initialized');
    }
    return client;
  }

  let workspaces: WorkspaceService | null = null;
  let capacities: CapacityService | null = null;
  let items: ItemService | null = null;
  let shortcuts: ShortcutService | null = null;
  let domains: DomainService | null = null;
  let admin: AdminService | null = null;

  return {
    get client() { return getClient(); },
    get workspaces() { return workspaces ??= new WorkspaceService(getClient()); },
    get capacities() { return capacities ??= new CapacityService(getClient()); },
    get items() { return items ??= new ItemService(getClient()); },
    get shortcuts() { return shortcuts ??= new ShortcutService(getClient()); },
    get domains() { return domains ??= new DomainService(getClient()); },
    get admin() { return admin ??= new AdminService(getClient()); },
  };
}
