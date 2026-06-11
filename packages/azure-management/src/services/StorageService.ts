import { ArmClient } from '../client/ArmClient.js';
import type { StorageAccount } from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

/**
 * Processed Storage Account summary.
 */
export interface StorageAccountSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  kind?: string;
  sku?: string;
  accessTier?: string;
  httpsOnly?: boolean;
  primaryEndpoints?: {
    blob?: string;
    queue?: string;
    table?: string;
    file?: string;
  };
  networkRules?: {
    defaultAction?: string;
    ipRules?: string[];
  };
  isHnsEnabled?: boolean;
  allowBlobPublicAccess?: boolean;
  minimumTlsVersion?: string;
}

/**
 * Service for Azure Storage Account operations.
 */
export class StorageService {
  private redactSecrets: boolean;

  constructor(
    private client: ArmClient,
    options: { redactSecrets?: boolean } = {}
  ) {
    this.redactSecrets = options.redactSecrets ?? true;
  }

  /**
   * List all Storage Accounts in the subscription or resource group.
   */
  async listStorageAccounts(options: { resourceGroup?: string } = {}): Promise<{
    accounts: StorageAccountSummary[];
    summary: {
      total: number;
      byKind: Record<string, number>;
      bySku: Record<string, number>;
      byAccessTier: Record<string, number>;
    };
  }> {
    const { resourceGroup } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(
          resourceGroup,
          '/providers/Microsoft.Storage/storageAccounts'
        )
      : this.client.subscriptionPath('/providers/Microsoft.Storage/storageAccounts');

    const accounts = await this.client.paginate<StorageAccount>(
      path,
      getApiVersion('Microsoft.Storage/storageAccounts')
    );

    const results: StorageAccountSummary[] = [];
    const summary = {
      total: accounts.length,
      byKind: {} as Record<string, number>,
      bySku: {} as Record<string, number>,
      byAccessTier: {} as Record<string, number>,
    };

    for (const account of accounts) {
      const processed = this.processStorageAccount(account);
      results.push(processed);

      const kind = processed.kind || 'Unknown';
      summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;

      if (processed.sku) {
        summary.bySku[processed.sku] = (summary.bySku[processed.sku] || 0) + 1;
      }

      if (processed.accessTier) {
        summary.byAccessTier[processed.accessTier] =
          (summary.byAccessTier[processed.accessTier] || 0) + 1;
      }
    }

    return { accounts: results, summary };
  }

  /**
   * Get detailed information about a Storage Account.
   */
  async getStorageAccount(options: {
    name: string;
    resourceGroup?: string;
    includeKeys?: boolean;
  }): Promise<{
    account: StorageAccountSummary;
    keys?: Array<{ keyName: string; value: string; permissions: string }>;
  }> {
    const { name, resourceGroup, includeKeys = false } = options;

    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) {
      throw new Error('Resource group is required');
    }

    const path = this.client.resourceGroupPath(
      rg,
      `/providers/Microsoft.Storage/storageAccounts/${name}`
    );

    const account = await this.client.get<StorageAccount>(
      path,
      getApiVersion('Microsoft.Storage/storageAccounts')
    );

    const result: {
      account: StorageAccountSummary;
      keys?: Array<{ keyName: string; value: string; permissions: string }>;
    } = {
      account: this.processStorageAccount(account),
    };

    if (includeKeys) {
      try {
        result.keys = await this.getStorageKeys(name, rg);
      } catch (error) {
        console.error(`Failed to get storage keys for ${name}:`, error);
        result.keys = [];
      }
    }

    return result;
  }

  /**
   * Get storage account keys.
   */
  private async getStorageKeys(
    name: string,
    resourceGroup: string
  ): Promise<Array<{ keyName: string; value: string; permissions: string }>> {
    const path = this.client.resourceGroupPath(
      resourceGroup,
      `/providers/Microsoft.Storage/storageAccounts/${name}/listKeys`
    );

    const response = await this.client.post<{
      keys: Array<{ keyName: string; value: string; permissions: string }>;
    }>(path, {}, getApiVersion('Microsoft.Storage/storageAccounts/listKeys'));

    // Redact keys if configured
    if (this.redactSecrets) {
      return response.keys.map((k) => ({
        keyName: k.keyName,
        value: '***REDACTED***',
        permissions: k.permissions,
      }));
    }

    return response.keys;
  }

  /**
   * Process a StorageAccount into a StorageAccountSummary.
   */
  private processStorageAccount(account: StorageAccount): StorageAccountSummary {
    const props = account.properties || {};

    const rgMatch = account.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    const result: StorageAccountSummary = {
      id: account.id,
      name: account.name,
      resourceGroup,
      location: account.location,
      kind: account.kind,
      sku: account.sku?.name,
      accessTier: props.accessTier,
      httpsOnly: props.supportsHttpsTrafficOnly,
      isHnsEnabled: props.isHnsEnabled,
      allowBlobPublicAccess: props.allowBlobPublicAccess,
      minimumTlsVersion: props.minimumTlsVersion,
    };

    if (props.primaryEndpoints) {
      result.primaryEndpoints = {
        blob: props.primaryEndpoints.blob,
        queue: props.primaryEndpoints.queue,
        table: props.primaryEndpoints.table,
        file: props.primaryEndpoints.file,
      };
    }

    if (props.networkAcls) {
      result.networkRules = {
        defaultAction: props.networkAcls.defaultAction,
        ipRules: props.networkAcls.ipRules?.map((r) => r.value),
      };
    }

    return result;
  }
}
