/**
 * ConnectionReferenceService
 *
 * Read-only service for querying connection references in a Dataverse environment.
 * Connection references define the connector configurations used by Power Automate flows
 * and other components.
 */

import {
  buildTruncation,
  UNCAPPED,
  type TruncationInfo,
} from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import { paginateDataverse } from './paginate.js';

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
  truncation: TruncationInfo;
  summary: {
    /**
     * References in this payload. When `truncation.hasMore` is true, `byConnector`
     * under-counts every connector, so this block is a census of the returned set
     * rather than of the environment.
     */
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
    const maxRecords = options?.maxRecords ?? UNCAPPED;
    const managedOnly = options?.managedOnly ?? false;
    const hasConnection = options?.hasConnection;

    const filters: string[] = [];
    if (managedOnly) {
      filters.push('ismanaged eq true');
    }

    const filterStr = filters.length > 0 ? `&$filter=${filters.join(' and ')}` : '';

    const { rows, hasMore, truncationReason } =
      await paginateDataverse<DataverseConnectionReference>(this.client, {
        endpoint:
          `api/data/v9.2/connectionreferences` +
          `?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,` +
          `connectorid,statecode,statuscode,ismanaged,connectionid` +
          `&$orderby=connectionreferencelogicalname` +
          filterStr,
        maxRecords,
        // Applied inside the paging loop so a cap counts returned rows, not fetched ones.
        keep: (cr) => {
          if (hasConnection === true) return (cr.connectionid ?? null) !== null;
          if (hasConnection === false) return (cr.connectionid ?? null) === null;
          return true;
        },
      });

    const references: ConnectionReference[] = rows.map((cr) => ({
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
      truncation: buildTruncation({
        returnedCount: references.length,
        requestedMax: maxRecords,
        hasMore,
        truncationReason,
      }),
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
