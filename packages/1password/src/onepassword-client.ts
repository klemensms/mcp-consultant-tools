/**
 * 1Password Client Wrapper
 *
 * Supports two authentication backends:
 * - SDK mode: Uses @1password/sdk with Service Account token (OP_SERVICE_ACCOUNT_TOKEN)
 * - CLI mode: Uses `op` CLI integrated with 1Password desktop app (default)
 *
 * Both backends expose the same method surface so services work transparently.
 */
import * as sdk from '@1password/sdk';
import { OpCliBackend } from './op-cli-adapter.js';
import type { OnePasswordConfig } from './types.js';

export class OnePasswordClient {
  private _client: sdk.Client | OpCliBackend | null = null;
  private readonly _config: OnePasswordConfig;
  private _vaultNameMap: Map<string, string> | null = null;

  constructor(config: OnePasswordConfig) {
    this._config = config;
  }

  async getClient(): Promise<sdk.Client | OpCliBackend> {
    if (!this._client) {
      if (this._config.authMode === 'sdk') {
        this._client = await sdk.createClient({
          auth: this._config.serviceAccountToken!,
          integrationName: 'mcp-consultant-tools-onepassword',
          integrationVersion: '29.0.0',
        });
      } else {
        this._client = new OpCliBackend(this._config.account);
      }
    }
    return this._client;
  }

  private async buildVaultCache(): Promise<Map<string, string>> {
    if (this._vaultNameMap) return this._vaultNameMap;
    const client = await this.getClient();
    const vaults = await client.vaults.list();
    this._vaultNameMap = new Map<string, string>();
    for (const vault of vaults) {
      this._vaultNameMap.set(vault.title.toLowerCase(), vault.id);
      this._vaultNameMap.set(vault.id.toLowerCase(), vault.id);
    }
    return this._vaultNameMap;
  }

  async resolveVaultId(nameOrId: string): Promise<string> {
    const cache = await this.buildVaultCache();
    const resolved = cache.get(nameOrId.toLowerCase());
    if (!resolved) {
      const available = [...cache.entries()]
        .filter(([key, val]) => key !== val.toLowerCase())
        .map(([key]) => key);
      throw new Error(
        `Vault '${nameOrId}' not found. Available vaults: ${available.join(', ')}`
      );
    }
    return resolved;
  }

  async validateVault(vaultId: string): Promise<void> {
    if (this._config.allowedVaults.includes('*')) return;
    const cache = await this.buildVaultCache();
    const allowedIds = this._config.allowedVaults.map(v => {
      const resolved = cache.get(v.toLowerCase());
      return resolved || v;
    });
    if (!allowedIds.includes(vaultId)) {
      throw new Error(
        `Vault '${vaultId}' is not in the allowed vaults list. ` +
        `Allowed: ${this._config.allowedVaults.join(', ')}`
      );
    }
  }

  invalidateVaultCache(): void {
    this._vaultNameMap = null;
  }

  get config(): OnePasswordConfig {
    return this._config;
  }
}
