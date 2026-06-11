import axios from 'axios';
import { ArmClient } from '../client/ArmClient.js';
import type { KeyVault, KeyVaultSecretItem } from '../types/arm-types.js';
import { getApiVersion, KEY_VAULT_API_VERSION } from '../utils/arm-api-versions.js';

/**
 * Processed Key Vault summary.
 */
export interface KeyVaultSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  vaultUri?: string;
  sku?: string;
  enableSoftDelete?: boolean;
  enablePurgeProtection?: boolean;
  enableRbacAuthorization?: boolean;
  networkAcls?: {
    defaultAction?: string;
    ipRules?: string[];
    virtualNetworkRules?: string[];
  };
  accessPolicies?: Array<{
    objectId: string;
    tenantId: string;
    permissions: {
      keys?: string[];
      secrets?: string[];
      certificates?: string[];
    };
  }>;
}

/**
 * Processed secret metadata.
 */
export interface SecretMetadata {
  name: string;
  enabled: boolean;
  created: string;
  updated: string;
  contentType?: string;
  tags?: Record<string, string>;
}

/**
 * Service for Azure Key Vault operations.
 */
export class KeyVaultService {
  constructor(private client: ArmClient) {}

  /**
   * List all Key Vaults in the subscription or resource group.
   */
  async listKeyVaults(options: { resourceGroup?: string } = {}): Promise<{
    vaults: KeyVaultSummary[];
    summary: {
      total: number;
      bySku: Record<string, number>;
      byRbacEnabled: { enabled: number; disabled: number };
    };
  }> {
    const { resourceGroup } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.KeyVault/vaults')
      : this.client.subscriptionPath('/providers/Microsoft.KeyVault/vaults');

    const vaults = await this.client.paginate<KeyVault>(
      path,
      getApiVersion('Microsoft.KeyVault/vaults')
    );

    const results: KeyVaultSummary[] = [];
    const summary = {
      total: vaults.length,
      bySku: {} as Record<string, number>,
      byRbacEnabled: { enabled: 0, disabled: 0 },
    };

    for (const vault of vaults) {
      const processed = this.processKeyVault(vault);
      results.push(processed);

      const sku = processed.sku || 'standard';
      summary.bySku[sku] = (summary.bySku[sku] || 0) + 1;

      if (processed.enableRbacAuthorization) {
        summary.byRbacEnabled.enabled++;
      } else {
        summary.byRbacEnabled.disabled++;
      }
    }

    return { vaults: results, summary };
  }

  /**
   * Get detailed information about a Key Vault.
   */
  async getKeyVault(options: {
    name: string;
    resourceGroup?: string;
    includeAccessPolicies?: boolean;
  }): Promise<{ vault: KeyVaultSummary }> {
    const { name, resourceGroup, includeAccessPolicies = true } = options;

    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) {
      throw new Error('Resource group is required');
    }

    const path = this.client.resourceGroupPath(
      rg,
      `/providers/Microsoft.KeyVault/vaults/${name}`
    );

    const vault = await this.client.get<KeyVault>(path, getApiVersion('Microsoft.KeyVault/vaults'));
    const processed = this.processKeyVault(vault, includeAccessPolicies);

    return { vault: processed };
  }

  /**
   * List secret names (NOT values) in a Key Vault.
   * Uses the Key Vault data plane API.
   */
  async listKeyVaultSecrets(options: { vaultName: string }): Promise<{
    secrets: SecretMetadata[];
    summary: {
      total: number;
      enabled: number;
      disabled: number;
    };
  }> {
    const { vaultName } = options;

    // Get vault URI (could be from vault name pattern or need to look it up)
    const vaultUri = `https://${vaultName}.vault.azure.net`;

    // Get Key Vault data plane token
    const token = await this.client.getAuthProvider().getKeyVaultToken(vaultUri);

    // Call Key Vault data plane API to list secrets
    const url = `${vaultUri}/secrets?api-version=${KEY_VAULT_API_VERSION}`;

    const response = await axios.get<{ value: KeyVaultSecretItem[]; nextLink?: string }>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const secrets: SecretMetadata[] = [];
    const summary = {
      total: 0,
      enabled: 0,
      disabled: 0,
    };

    // Process all pages
    let currentResponse = response.data;
    while (true) {
      for (const secret of currentResponse.value) {
        const name = this.extractSecretName(secret.id);
        const metadata: SecretMetadata = {
          name,
          enabled: secret.attributes.enabled,
          created: new Date(secret.attributes.created * 1000).toISOString(),
          updated: new Date(secret.attributes.updated * 1000).toISOString(),
          contentType: secret.contentType,
          tags: secret.tags,
        };

        secrets.push(metadata);
        summary.total++;

        if (secret.attributes.enabled) {
          summary.enabled++;
        } else {
          summary.disabled++;
        }
      }

      // Check for next page
      if (!currentResponse.nextLink) {
        break;
      }

      const nextResponse = await axios.get<{ value: KeyVaultSecretItem[]; nextLink?: string }>(
        currentResponse.nextLink,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      currentResponse = nextResponse.data;
    }

    return { secrets, summary };
  }

  /**
   * Process a KeyVault into a KeyVaultSummary.
   */
  private processKeyVault(vault: KeyVault, includeAccessPolicies = false): KeyVaultSummary {
    const props = vault.properties || {};

    const rgMatch = vault.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    const result: KeyVaultSummary = {
      id: vault.id,
      name: vault.name,
      resourceGroup,
      location: vault.location,
      vaultUri: props.vaultUri,
      sku: props.sku?.name,
      enableSoftDelete: props.enableSoftDelete,
      enablePurgeProtection: props.enablePurgeProtection,
      enableRbacAuthorization: props.enableRbacAuthorization,
    };

    // Network ACLs
    if (props.networkAcls) {
      result.networkAcls = {
        defaultAction: props.networkAcls.defaultAction,
        ipRules: props.networkAcls.ipRules?.map((r) => r.value),
        virtualNetworkRules: props.networkAcls.virtualNetworkRules?.map((r) => r.id),
      };
    }

    // Access policies (only if requested and not using RBAC)
    if (includeAccessPolicies && !props.enableRbacAuthorization && props.accessPolicies) {
      result.accessPolicies = props.accessPolicies.map((policy) => ({
        objectId: policy.objectId,
        tenantId: policy.tenantId,
        permissions: {
          keys: policy.permissions.keys,
          secrets: policy.permissions.secrets,
          certificates: policy.permissions.certificates,
        },
      }));
    }

    return result;
  }

  /**
   * Extract secret name from Key Vault secret ID.
   * ID format: https://{vault}.vault.azure.net/secrets/{name}
   */
  private extractSecretName(secretId: string): string {
    const match = secretId.match(/\/secrets\/([^/]+)/);
    return match ? match[1] : secretId;
  }
}
