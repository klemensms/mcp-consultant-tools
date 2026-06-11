/**
 * ConnectionReferenceService
 *
 * Read-only service for querying connection references in a Dataverse environment.
 * Connection references define the connector configurations used by Power Automate flows
 * and other components.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';

// ============================================================================
// Types
// ============================================================================

export interface ConnectionReference {
  id: string;
  logicalName: string;
  displayName: string;
  connectorId: string;
  stateCode: number;
  statusCode: number;
  isManaged: boolean;
  connectionId: string | null;
  connectionName: string | null;
}

export interface ConnectionReferencesResult {
  references: ConnectionReference[];
  summary: {
    total: number;
    byConnector: Record<string, number>;
    withConnection: number;
    withoutConnection: number;
    managed: number;
    unmanaged: number;
  };
}

interface DataverseConnectionReference {
  connectionreferenceid: string;
  connectionreferencelogicalname: string;
  connectionreferencedisplayname: string;
  connectorid: string;
  statecode: number;
  statuscode: number;
  ismanaged: boolean;
  connectionid?: string | null;
}

// ============================================================================
// Service
// ============================================================================

export class ConnectionReferenceService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all connection references in the environment
   */
  async getConnectionReferences(options?: {
    maxRecords?: number;
    managedOnly?: boolean;
    hasConnection?: boolean;
  }): Promise<ConnectionReferencesResult> {
    const maxRecords = options?.maxRecords ?? 100;
    const managedOnly = options?.managedOnly ?? false;
    const hasConnection = options?.hasConnection;

    const filters: string[] = [];
    if (managedOnly) {
      filters.push('ismanaged eq true');
    }

    const filterStr = filters.length > 0 ? `&$filter=${filters.join(' and ')}` : '';

    const response = await this.client.makeRequest<ApiCollectionResponse<DataverseConnectionReference>>(
      `api/data/v9.2/connectionreferences` +
      `?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,` +
      `connectorid,statecode,statuscode,ismanaged,connectionid` +
      `&$orderby=connectionreferencelogicalname` +
      `&$top=${maxRecords}` +
      filterStr
    );

    let references: ConnectionReference[] = (response.value || []).map((cr) => ({
      id: cr.connectionreferenceid,
      logicalName: cr.connectionreferencelogicalname,
      displayName: cr.connectionreferencedisplayname || cr.connectionreferencelogicalname,
      connectorId: cr.connectorid,
      stateCode: cr.statecode,
      statusCode: cr.statuscode,
      isManaged: cr.ismanaged,
      connectionId: cr.connectionid ?? null,
      connectionName: null,
    }));

    // Client-side filter for hasConnection
    if (hasConnection === true) {
      references = references.filter((r) => r.connectionId !== null);
    } else if (hasConnection === false) {
      references = references.filter((r) => r.connectionId === null);
    }

    // Build summary
    const byConnector: Record<string, number> = {};
    let withConnection = 0;
    let withoutConnection = 0;
    let managed = 0;
    let unmanaged = 0;

    for (const ref of references) {
      const connectorName = this.extractConnectorName(ref.connectorId);
      byConnector[connectorName] = (byConnector[connectorName] || 0) + 1;
      if (ref.connectionId) {
        withConnection++;
      } else {
        withoutConnection++;
      }
      if (ref.isManaged) {
        managed++;
      } else {
        unmanaged++;
      }
    }

    return {
      references,
      summary: {
        total: references.length,
        byConnector,
        withConnection,
        withoutConnection,
        managed,
        unmanaged,
      },
    };
  }

  /**
   * Extract a readable connector name from the connector ID.
   * Connector IDs look like: /providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps
   */
  private extractConnectorName(connectorId: string): string {
    const parts = connectorId.split('/');
    const lastPart = parts[parts.length - 1] || connectorId;
    return lastPart.replace('shared_', '');
  }
}
