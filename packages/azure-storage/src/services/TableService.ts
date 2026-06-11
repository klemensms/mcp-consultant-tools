/**
 * Table Service
 *
 * Handles all table storage operations: tables and entities.
 */

import {
  TableServiceClient,
  TableClient,
  TableEntity as AzureTableEntity,
  TableItem,
  TransactionAction,
} from '@azure/data-tables';
import { auditLogger } from '@mcp-consultant-tools/core';

import type {
  TableInfo,
  TableEntity,
  QueryEntitiesOptions,
  BatchOperationItem,
  ListResult,
  OperationResult,
} from '../types/storage-types.js';

export class TableService {
  private client: TableServiceClient;
  private accountId: string;
  private maxListResults: number;

  // Cache for table clients
  private tableClients: Map<string, TableClient> = new Map();

  constructor(client: TableServiceClient, accountId: string, maxListResults: number) {
    this.client = client;
    this.accountId = accountId;
    this.maxListResults = maxListResults;
  }

  /**
   * Get or create a TableClient for a specific table
   */
  private getTableClient(tableName: string): TableClient {
    if (!this.tableClients.has(tableName)) {
      // Extract the URL from the service client and create table client
      // TableServiceClient doesn't expose getTableClient, so we use the URL pattern
      const serviceUrl = (this.client as any).url || (this.client as any).tableEndpointUrl;
      if (serviceUrl) {
        const tableClient = new TableClient(serviceUrl, tableName, (this.client as any).credential);
        this.tableClients.set(tableName, tableClient);
      } else {
        throw new Error('Cannot determine table service URL');
      }
    }
    return this.tableClients.get(tableName)!;
  }

  // ==========================================================================
  // Table Operations
  // ==========================================================================

  /**
   * List all tables
   */
  async listTables(maxResults?: number): Promise<ListResult<TableInfo>> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(maxResults || this.maxListResults, this.maxListResults);

    try {
      const tables: TableInfo[] = [];
      const iter = this.client.listTables();

      for await (const table of iter) {
        tables.push({ name: table.name || '' });
        if (tables.length >= limit) break;
      }

      auditLogger.log({
        operation: 'list-tables',
        operationType: 'READ',
        componentType: 'Table',
        parameters: { accountId: this.accountId, count: tables.length },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        items: tables,
        hasMore: tables.length >= limit,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-tables',
        operationType: 'READ',
        componentType: 'Table',
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Create a new table
   */
  async createTable(tableName: string): Promise<OperationResult<TableInfo>> {
    const timer = auditLogger.startTimer();

    try {
      await this.client.createTable(tableName);

      auditLogger.log({
        operation: 'create-table',
        operationType: 'CREATE',
        componentType: 'Table',
        componentName: tableName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: { name: tableName } };
    } catch (error: any) {
      // Check if table already exists (not an error in some cases)
      if (error.statusCode === 409) {
        return { success: true, data: { name: tableName } };
      }

      auditLogger.log({
        operation: 'create-table',
        operationType: 'CREATE',
        componentType: 'Table',
        componentName: tableName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a table
   */
  async deleteTable(tableName: string): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      await this.client.deleteTable(tableName);

      // Remove cached client
      this.tableClients.delete(tableName);

      auditLogger.log({
        operation: 'delete-table',
        operationType: 'DELETE',
        componentType: 'Table',
        componentName: tableName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-table',
        operationType: 'DELETE',
        componentType: 'Table',
        componentName: tableName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // Entity Operations
  // ==========================================================================

  /**
   * Get a single entity by partition key and row key
   */
  async getEntity(
    tableName: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TableEntity> {
    const timer = auditLogger.startTimer();

    try {
      const tableClient = this.getTableClient(tableName);
      const entity = await tableClient.getEntity(partitionKey, rowKey);

      auditLogger.log({
        operation: 'get-entity',
        operationType: 'READ',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${partitionKey}/${rowKey}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return this.mapEntity(entity);
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-entity',
        operationType: 'READ',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${partitionKey}/${rowKey}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Query entities with OData filter
   */
  async queryEntities(
    tableName: string,
    options?: QueryEntitiesOptions
  ): Promise<ListResult<TableEntity>> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(options?.top || this.maxListResults, this.maxListResults);

    try {
      const tableClient = this.getTableClient(tableName);
      const entities: TableEntity[] = [];

      const queryOptions: any = {};
      if (options?.filter) queryOptions.filter = options.filter;
      if (options?.select) queryOptions.select = options.select;

      const iter = tableClient.listEntities({ queryOptions });

      for await (const entity of iter) {
        entities.push(this.mapEntity(entity));
        if (entities.length >= limit) break;
      }

      auditLogger.log({
        operation: 'query-entities',
        operationType: 'READ',
        componentType: 'TableEntity',
        componentName: tableName,
        parameters: {
          accountId: this.accountId,
          filter: options?.filter,
          count: entities.length,
        },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        items: entities,
        hasMore: entities.length >= limit,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'query-entities',
        operationType: 'READ',
        componentType: 'TableEntity',
        componentName: tableName,
        parameters: { accountId: this.accountId, filter: options?.filter },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Insert a new entity
   */
  async insertEntity(tableName: string, entity: TableEntity): Promise<OperationResult<TableEntity>> {
    const timer = auditLogger.startTimer();

    try {
      const tableClient = this.getTableClient(tableName);
      const azureEntity = this.toAzureEntity(entity);
      await tableClient.createEntity(azureEntity);

      // Fetch the created entity to get server-generated fields
      const created = await this.getEntity(tableName, entity.partitionKey, entity.rowKey);

      auditLogger.log({
        operation: 'insert-entity',
        operationType: 'CREATE',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${entity.partitionKey}/${entity.rowKey}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: created };
    } catch (error: any) {
      auditLogger.log({
        operation: 'insert-entity',
        operationType: 'CREATE',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${entity.partitionKey}/${entity.rowKey}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Update an existing entity (replace mode)
   */
  async updateEntity(
    tableName: string,
    entity: TableEntity,
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<OperationResult<TableEntity>> {
    const timer = auditLogger.startTimer();

    try {
      const tableClient = this.getTableClient(tableName);
      const azureEntity = this.toAzureEntity(entity);

      if (mode === 'merge') {
        await tableClient.updateEntity(azureEntity, 'Merge');
      } else {
        await tableClient.updateEntity(azureEntity, 'Replace');
      }

      // Fetch the updated entity
      const updated = await this.getEntity(tableName, entity.partitionKey, entity.rowKey);

      auditLogger.log({
        operation: 'update-entity',
        operationType: 'UPDATE',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${entity.partitionKey}/${entity.rowKey}`,
        parameters: { accountId: this.accountId, mode },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: updated };
    } catch (error: any) {
      auditLogger.log({
        operation: 'update-entity',
        operationType: 'UPDATE',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${entity.partitionKey}/${entity.rowKey}`,
        parameters: { accountId: this.accountId, mode },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Upsert an entity (insert or update)
   */
  async upsertEntity(
    tableName: string,
    entity: TableEntity,
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<OperationResult<TableEntity>> {
    const timer = auditLogger.startTimer();

    try {
      const tableClient = this.getTableClient(tableName);
      const azureEntity = this.toAzureEntity(entity);

      if (mode === 'merge') {
        await tableClient.upsertEntity(azureEntity, 'Merge');
      } else {
        await tableClient.upsertEntity(azureEntity, 'Replace');
      }

      // Fetch the entity
      const result = await this.getEntity(tableName, entity.partitionKey, entity.rowKey);

      auditLogger.log({
        operation: 'upsert-entity',
        operationType: 'UPDATE',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${entity.partitionKey}/${entity.rowKey}`,
        parameters: { accountId: this.accountId, mode },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: result };
    } catch (error: any) {
      auditLogger.log({
        operation: 'upsert-entity',
        operationType: 'UPDATE',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${entity.partitionKey}/${entity.rowKey}`,
        parameters: { accountId: this.accountId, mode },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete an entity
   */
  async deleteEntity(
    tableName: string,
    partitionKey: string,
    rowKey: string
  ): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const tableClient = this.getTableClient(tableName);
      await tableClient.deleteEntity(partitionKey, rowKey);

      auditLogger.log({
        operation: 'delete-entity',
        operationType: 'DELETE',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${partitionKey}/${rowKey}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-entity',
        operationType: 'DELETE',
        componentType: 'TableEntity',
        componentName: tableName,
        componentId: `${partitionKey}/${rowKey}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute batch operations (all operations must be on same partition)
   */
  async batchOperation(
    tableName: string,
    operations: BatchOperationItem[]
  ): Promise<OperationResult<{ succeeded: number; failed: number }>> {
    const timer = auditLogger.startTimer();

    try {
      if (operations.length === 0) {
        return { success: true, data: { succeeded: 0, failed: 0 } };
      }

      // Validate all operations are on the same partition
      const partitionKey = operations[0].entity.partitionKey;
      for (const op of operations) {
        if (op.entity.partitionKey !== partitionKey) {
          throw new Error(
            'All batch operations must be on the same partition key. ' +
              `Found '${op.entity.partitionKey}' but expected '${partitionKey}'.`
          );
        }
      }

      const tableClient = this.getTableClient(tableName);

      // Convert to Azure transaction actions
      const actions: TransactionAction[] = operations.map((op) => {
        const azureEntity = this.toAzureEntity(op.entity);

        switch (op.operation) {
          case 'create':
            return ['create', azureEntity];
          case 'update':
            return ['update', azureEntity, 'Merge'];
          case 'upsert':
            return ['upsert', azureEntity, 'Merge'];
          case 'delete':
            return ['delete', azureEntity];
          default:
            throw new Error(`Unknown operation: ${op.operation}`);
        }
      });

      const response = await tableClient.submitTransaction(actions);

      const succeeded = response.subResponses.filter((r) => r.status >= 200 && r.status < 300).length;
      const failed = response.subResponses.length - succeeded;

      auditLogger.log({
        operation: 'batch-operation',
        operationType: 'UPDATE',
        componentType: 'TableEntity',
        componentName: tableName,
        parameters: {
          accountId: this.accountId,
          partitionKey,
          operationCount: operations.length,
          succeeded,
          failed,
        },
        success: failed === 0,
        executionTimeMs: timer(),
      });

      return { success: failed === 0, data: { succeeded, failed } };
    } catch (error: any) {
      auditLogger.log({
        operation: 'batch-operation',
        operationType: 'UPDATE',
        componentType: 'TableEntity',
        componentName: tableName,
        parameters: { accountId: this.accountId, operationCount: operations.length },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private mapEntity(entity: any): TableEntity {
    const result: TableEntity = {
      partitionKey: entity.partitionKey || '',
      rowKey: entity.rowKey || '',
      timestamp: entity.timestamp as Date | undefined,
      etag: entity.etag as string | undefined,
    };

    // Copy other properties
    for (const [key, value] of Object.entries(entity)) {
      if (!['partitionKey', 'rowKey', 'timestamp', 'etag'].includes(key)) {
        result[key] = value;
      }
    }

    return result;
  }

  private toAzureEntity(entity: TableEntity): AzureTableEntity {
    const result: AzureTableEntity = {
      partitionKey: entity.partitionKey,
      rowKey: entity.rowKey,
    };

    // Copy other properties (excluding timestamp and etag which are server-managed)
    for (const [key, value] of Object.entries(entity)) {
      if (!['partitionKey', 'rowKey', 'timestamp', 'etag'].includes(key)) {
        result[key] = value;
      }
    }

    return result;
  }
}
