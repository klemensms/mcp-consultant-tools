/**
 * Service context shared between MCP server and CLI entry points.
 */
import type { OnePasswordClient } from './onepassword-client.js';
import type { ItemService } from './services/item-service.js';
import type { VaultService } from './services/vault-service.js';
import type { SecretService } from './services/secret-service.js';

export interface OnePasswordConfig {
  serviceAccountToken?: string;
  authMode: 'sdk' | 'cli';
  account?: string;
  allowedVaults: string[];
  enableWrite: boolean;
  enableDelete: boolean;
  enableVaultAdmin: boolean;
}

export interface ServiceContext {
  readonly client: OnePasswordClient;
  readonly items: ItemService;
  readonly vaults: VaultService;
  readonly secrets: SecretService;
  checkWriteEnabled(): void;
  checkDeleteEnabled(): void;
  checkVaultAdminEnabled(): void;
}
