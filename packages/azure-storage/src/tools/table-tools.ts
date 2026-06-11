import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  ACCOUNT_ID_EXAMPLES,
  TABLE_NAME_EXAMPLES,
  PARTITION_KEY_EXAMPLES,
  ROW_KEY_EXAMPLES,
  ODATA_FILTER_EXAMPLES,
  SELECT_COLUMNS_EXAMPLES,
  ENTITY_JSON_EXAMPLES,
  BATCH_OPERATIONS_EXAMPLES,
} from '../utils/tool-examples.js';

function checkWriteEnabled(): void {
  if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
    throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
  }
}

function checkDeleteEnabled(): void {
  if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
    throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
  }
}

export function registerTableTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "table-list-tables",
    "List tables",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      maxResults: z.number().optional().describe("Maximum results (default: 1000)"),
    },
    async ({ accountId, maxResults }: any) => {
      try {
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.listTables(maxResults);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing tables:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-create-table",
    "Create table. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
    },
    async ({ accountId, tableName }: any) => {
      try {
        checkWriteEnabled();
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.createTable(tableName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error creating table:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-delete-table",
    "Delete table. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
    },
    async ({ accountId, tableName }: any) => {
      try {
        checkDeleteEnabled();
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.deleteTable(tableName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting table:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-get-entity",
    "Get entity by PartitionKey and RowKey",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
      partitionKey: z.string().describe(descWithExamples("Partition key", PARTITION_KEY_EXAMPLES)),
      rowKey: z.string().describe(descWithExamples("Row key", ROW_KEY_EXAMPLES)),
    },
    async ({ accountId, tableName, partitionKey, rowKey }: any) => {
      try {
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.getEntity(tableName, partitionKey, rowKey);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting entity:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-query-entities",
    "Query entities with OData filter",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
      filter: z.string().optional().describe(descWithExamples("OData filter", ODATA_FILTER_EXAMPLES)),
      select: z.string().optional().describe(descWithExamples("Columns to return (comma-separated)", SELECT_COLUMNS_EXAMPLES)),
      top: z.number().optional().describe("Maximum results (default: 1000)"),
    },
    async ({ accountId, tableName, filter, select, top }: any) => {
      try {
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.queryEntities(tableName, {
          filter,
          select: select ? select.split(',').map((s: string) => s.trim()) : undefined,
          top,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error querying entities:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-insert-entity",
    "Insert new entity. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
      entity: z.string().describe(descWithExamples("Entity JSON with partitionKey, rowKey, and properties", ENTITY_JSON_EXAMPLES)),
    },
    async ({ accountId, tableName, entity }: any) => {
      try {
        checkWriteEnabled();
        const tableSvc = ctx.storage.getTableService(accountId);
        const entityObj = JSON.parse(entity);
        const result = await tableSvc.insertEntity(tableName, entityObj);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error inserting entity:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-update-entity",
    "Update existing entity (merge or replace). Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
      entity: z.string().describe(descWithExamples("Entity JSON with partitionKey, rowKey, and properties", ENTITY_JSON_EXAMPLES)),
      mode: z.enum(['merge', 'replace']).optional().describe("Update mode (default: merge)"),
    },
    async ({ accountId, tableName, entity, mode }: any) => {
      try {
        checkWriteEnabled();
        const tableSvc = ctx.storage.getTableService(accountId);
        const entityObj = JSON.parse(entity);
        const result = await tableSvc.updateEntity(tableName, entityObj, mode || 'merge');
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error updating entity:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-upsert-entity",
    "Insert or update entity. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
      entity: z.string().describe(descWithExamples("Entity JSON with partitionKey, rowKey, and properties", ENTITY_JSON_EXAMPLES)),
      mode: z.enum(['merge', 'replace']).optional().describe("Upsert mode (default: merge)"),
    },
    async ({ accountId, tableName, entity, mode }: any) => {
      try {
        checkWriteEnabled();
        const tableSvc = ctx.storage.getTableService(accountId);
        const entityObj = JSON.parse(entity);
        const result = await tableSvc.upsertEntity(tableName, entityObj, mode || 'merge');
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error upserting entity:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-delete-entity",
    "Delete entity. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
      partitionKey: z.string().describe(descWithExamples("Partition key", PARTITION_KEY_EXAMPLES)),
      rowKey: z.string().describe(descWithExamples("Row key", ROW_KEY_EXAMPLES)),
    },
    async ({ accountId, tableName, partitionKey, rowKey }: any) => {
      try {
        checkDeleteEnabled();
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.deleteEntity(tableName, partitionKey, rowKey);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting entity:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "table-batch-operation",
    "Execute batch operations (same partition only). Requires AZURE_STORAGE_ENABLE_WRITE=true for create/update/upsert and AZURE_STORAGE_ENABLE_DELETE=true for delete operations.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
      operations: z.string().describe(descWithExamples("Operations JSON array", BATCH_OPERATIONS_EXAMPLES)),
    },
    async ({ accountId, tableName, operations }: any) => {
      try {
        const ops = JSON.parse(operations);
        const hasWrite = ops.some((op: any) => ['create', 'update', 'upsert'].includes(op.operation));
        const hasDelete = ops.some((op: any) => op.operation === 'delete');
        if (hasWrite) checkWriteEnabled();
        if (hasDelete) checkDeleteEnabled();
        const tableSvc = ctx.storage.getTableService(accountId);
        const result = await tableSvc.batchOperation(tableName, ops);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error executing batch:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );
}
