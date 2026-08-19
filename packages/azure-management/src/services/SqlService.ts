import { ArmClient } from '../client/ArmClient.js';
import { FanOutRecorder, type FanOutInfo } from '@mcp-consultant-tools/core';
import type { SqlServer, SqlDatabase } from '../types/arm-types.js';
import { getApiVersion } from '../utils/arm-api-versions.js';

/**
 * Processed SQL Server summary.
 */
export interface SqlServerSummary {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  fullyQualifiedDomainName?: string;
  administratorLogin?: string;
  version?: string;
  state?: string;
  publicNetworkAccess?: string;
  minimalTlsVersion?: string;
  databases?: Array<{
    name: string;
    status?: string;
  }>;
}

/**
 * Processed SQL Database summary.
 */
export interface SqlDatabaseSummary {
  id: string;
  name: string;
  serverName: string;
  resourceGroup: string;
  location: string;
  status?: string;
  sku?: {
    name: string;
    tier?: string;
    capacity?: number;
  };
  maxSizeBytes?: number;
  maxSizeGB?: number;
  collation?: string;
  creationDate?: string;
  earliestRestoreDate?: string;
  zoneRedundant?: boolean;
  licenseType?: string;
  readScale?: string;
}

/**
 * Service for Azure SQL operations.
 */
export class SqlService {
  constructor(private client: ArmClient) {}

  /**
   * List all SQL Servers in the subscription or resource group.
   */
  async listSqlServers(options: { resourceGroup?: string } = {}): Promise<{
    servers: SqlServerSummary[];
    summary: {
      total: number;
      byVersion: Record<string, number>;
      byPublicAccess: Record<string, number>;
    };
    fanOut: FanOutInfo;
  }> {
    const { resourceGroup } = options;

    const path = resourceGroup
      ? this.client.resourceGroupPath(resourceGroup, '/providers/Microsoft.Sql/servers')
      : this.client.subscriptionPath('/providers/Microsoft.Sql/servers');

    const servers = await this.client.paginate<SqlServer>(
      path,
      getApiVersion('Microsoft.Sql/servers')
    );

    const results: SqlServerSummary[] = [];
    const fanOut = new FanOutRecorder();
    const summary = {
      total: servers.length,
      byVersion: {} as Record<string, number>,
      byPublicAccess: {} as Record<string, number>,
    };

    for (const server of servers) {
      const processed = await this.processSqlServer(server, fanOut);
      results.push(processed);

      const version = processed.version || 'Unknown';
      summary.byVersion[version] = (summary.byVersion[version] || 0) + 1;

      const publicAccess = processed.publicNetworkAccess || 'Unknown';
      summary.byPublicAccess[publicAccess] = (summary.byPublicAccess[publicAccess] || 0) + 1;
    }

    return { servers: results, summary, fanOut: fanOut.result() };
  }

  /**
   * List all databases on a SQL Server.
   */
  async listSqlDatabases(options: {
    serverName: string;
    resourceGroup?: string;
  }): Promise<{
    databases: SqlDatabaseSummary[];
    summary: {
      total: number;
      byTier: Record<string, number>;
      byStatus: Record<string, number>;
    };
  }> {
    const { serverName, resourceGroup } = options;

    const rg = resourceGroup || this.client.getDefaultResourceGroup();
    if (!rg) {
      throw new Error('Resource group is required');
    }

    const path = this.client.resourceGroupPath(
      rg,
      `/providers/Microsoft.Sql/servers/${serverName}/databases`
    );

    const databases = await this.client.paginate<SqlDatabase>(
      path,
      getApiVersion('Microsoft.Sql/servers/databases')
    );

    const results: SqlDatabaseSummary[] = [];
    const summary = {
      total: databases.length,
      byTier: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };

    for (const db of databases) {
      // Skip system databases
      if (db.name === 'master') {
        continue;
      }

      const processed = this.processSqlDatabase(db, serverName);
      results.push(processed);

      const tier = processed.sku?.tier || 'Unknown';
      summary.byTier[tier] = (summary.byTier[tier] || 0) + 1;

      const status = processed.status || 'Unknown';
      summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    }

    // Update total to exclude system databases
    summary.total = results.length;

    return { databases: results, summary };
  }

  /**
   * Process a SqlServer into a SqlServerSummary.
   */
  private async processSqlServer(
    server: SqlServer,
    fanOut: FanOutRecorder = new FanOutRecorder()
  ): Promise<SqlServerSummary> {
    const props = server.properties || {};

    const rgMatch = server.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    const result: SqlServerSummary = {
      id: server.id,
      name: server.name,
      resourceGroup,
      location: server.location,
      fullyQualifiedDomainName: props.fullyQualifiedDomainName,
      administratorLogin: props.administratorLogin,
      version: props.version,
      state: props.state,
      publicNetworkAccess: props.publicNetworkAccess,
      minimalTlsVersion: props.minimalTlsVersion,
    };

    // Try to get database count (summary only)
    const dbPath = `${server.id}/databases`;
    const databases = await fanOut.run(server.name, 'databases', () =>
      this.client.paginate<SqlDatabase>(dbPath, getApiVersion('Microsoft.Sql/servers/databases'))
    );

    if (databases) {
      // Filter out system databases
      const userDatabases = databases.filter((db) => db.name !== 'master');
      result.databases = userDatabases.slice(0, 10).map((db) => ({
        name: db.name,
        status: db.properties?.status,
      }));
    }

    return result;
  }

  /**
   * Process a SqlDatabase into a SqlDatabaseSummary.
   */
  private processSqlDatabase(db: SqlDatabase, serverName: string): SqlDatabaseSummary {
    const props = db.properties || {};

    const rgMatch = db.id.match(/\/resourceGroups\/([^/]+)/i);
    const resourceGroup = rgMatch ? rgMatch[1] : '';

    const maxSizeBytes = props.maxSizeBytes || 0;
    const maxSizeGB = maxSizeBytes ? Math.round(maxSizeBytes / (1024 * 1024 * 1024)) : undefined;

    return {
      id: db.id,
      name: db.name,
      serverName,
      resourceGroup,
      location: db.location,
      status: props.status,
      sku: props.currentSku
        ? {
            name: props.currentSku.name,
            tier: props.currentSku.tier,
            capacity: props.currentSku.capacity,
          }
        : db.sku
          ? {
              name: db.sku.name,
              tier: db.sku.tier,
              capacity: db.sku.capacity,
            }
          : undefined,
      maxSizeBytes,
      maxSizeGB,
      collation: props.collation,
      creationDate: props.creationDate,
      earliestRestoreDate: props.earliestRestoreDate,
      zoneRedundant: props.zoneRedundant,
      licenseType: props.licenseType,
      readScale: props.readScale,
    };
  }
}
