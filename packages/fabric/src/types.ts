/**
 * Service context shared between the MCP server and CLI entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { FabricClient } from './fabric-client.js';
import type { WorkspaceService } from './services/workspace-service.js';
import type { CapacityService } from './services/capacity-service.js';
import type { ItemService } from './services/item-service.js';
import type { ShortcutService } from './services/shortcut-service.js';
import type { DomainService } from './services/domain-service.js';
import type { AdminService } from './services/admin-service.js';

export interface ServiceContext {
  readonly client: FabricClient;
  readonly workspaces: WorkspaceService;
  readonly capacities: CapacityService;
  readonly items: ItemService;
  readonly shortcuts: ShortcutService;
  readonly domains: DomainService;
  readonly admin: AdminService;
}
