/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { OnePasswordClient } from './onepassword-client.js';
import { ItemService } from './services/item-service.js';
import { VaultService } from './services/vault-service.js';
import { SecretService } from './services/secret-service.js';
import type { ServiceContext, OnePasswordConfig } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let client: OnePasswordClient | null = null;
  let items: ItemService | null = null;
  let vaults: VaultService | null = null;
  let secrets: SecretService | null = null;

  function getClient(): OnePasswordClient {
    if (!client) {
      const token = process.env.OP_SERVICE_ACCOUNT_TOKEN;
      const authMode = token ? 'sdk' : 'cli';

      if (authMode === 'cli') {
        console.error('1Password: Using CLI mode (desktop app integration)');
      } else {
        console.error('1Password: Using SDK mode (service account)');
      }

      const config: OnePasswordConfig = {
        serviceAccountToken: token,
        authMode,
        account: process.env.OP_ACCOUNT,
        allowedVaults: (process.env.OP_ALLOWED_VAULTS || '*')
          .split(',')
          .map(v => v.trim())
          .filter(v => v),
        enableWrite: process.env.OP_ENABLE_WRITE === 'true',
        enableDelete: process.env.OP_ENABLE_DELETE === 'true',
        enableVaultAdmin: process.env.OP_ENABLE_VAULT_ADMIN === 'true',
      };

      client = new OnePasswordClient(config);
    }
    return client;
  }

  return {
    get client() { return getClient(); },
    get items() { return items ??= new ItemService(getClient()); },
    get vaults() { return vaults ??= new VaultService(getClient()); },
    get secrets() { return secrets ??= new SecretService(getClient()); },
    checkWriteEnabled() {
      if (process.env.OP_ENABLE_WRITE !== 'true') {
        throw new Error('Write operations are disabled. Set OP_ENABLE_WRITE=true to enable.');
      }
    },
    checkDeleteEnabled() {
      if (process.env.OP_ENABLE_DELETE !== 'true') {
        throw new Error('Delete operations are disabled. Set OP_ENABLE_DELETE=true to enable.');
      }
    },
    checkVaultAdminEnabled() {
      if (process.env.OP_ENABLE_VAULT_ADMIN !== 'true') {
        throw new Error('Vault admin operations are disabled. Set OP_ENABLE_VAULT_ADMIN=true to enable.');
      }
    },
  };
}
