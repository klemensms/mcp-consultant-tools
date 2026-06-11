import { auditLogger } from '@mcp-consultant-tools/core';
import type { ConnectionService } from './connection-service.js';
import type { SqlApiCollectionResponse } from './connection-service.js';

export interface TableInfo {
  schemaName: string;
  tableName: string;
  rowCount: number;
  sizeMB: number;
}

export interface ViewInfo {
  schemaName: string;
  viewName: string;
  definition: string;
}

export interface StoredProcedureInfo {
  schemaName: string;
  procedureName: string;
  createdDate: Date;
  modifiedDate: Date;
}

export interface TriggerInfo {
  schemaName: string;
  triggerName: string;
  objectName: string;
  triggerEvent: string;
  isDisabled: boolean;
  createdDate: Date;
  modifiedDate: Date;
}

export interface FunctionInfo {
  schemaName: string;
  functionName: string;
  returnType: string;
  createdDate: Date;
  modifiedDate: Date;
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  maxLength: number | null;
  isNullable: string;
  defaultValue: string | null;
  isIdentity: number;
}

export interface IndexInfo {
  indexName: string;
  indexType: string;
  isUnique: boolean;
  isPrimaryKey: boolean;
  columns: string;
}

export interface ForeignKeyInfo {
  foreignKeyName: string;
  schemaName: string;
  tableName: string;
  columnName: string;
  referencedSchema: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface TableSchema {
  schemaName: string;
  tableName: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export interface ObjectDefinition {
  objectName: string;
  schemaName: string;
  objectType: string;
  createdDate: Date;
  modifiedDate: Date;
  definition: string;
}

/**
 * QueryService handles all SQL query execution against Azure SQL databases.
 * Depends on ConnectionService for connection pooling.
 */
import type {
  PiiProtectionPipeline,
  PipelineReport,
} from '@mcp-consultant-tools/core';

export class QueryService {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly piiPipeline?: PiiProtectionPipeline
  ) {}

  /**
   * Execute a query with safety limits and size protection
   */
  async executeQuery<T = any>(
    serverId: string,
    database: string,
    query: string,
    parameters?: Record<string, any>
  ): Promise<SqlApiCollectionResponse<T>> {
    const config = this.connectionService.config;
    try {
      const pool = await this.connectionService.getPool(serverId, database);
      const request = pool.request();

      if (parameters) {
        for (const [key, value] of Object.entries(parameters)) {
          request.input(key, value);
        }
      }

      const result = await request.query(query);
      const rows = result.recordset || [];
      const columns = result.recordset?.columns
        ? Object.keys(result.recordset.columns)
        : [];

      const truncated = rows.length > config.maxResultRows!;
      const limitedRows = rows.slice(0, config.maxResultRows!);

      const maxResponseBytes = config.maxResponseSizeMb! * 1024 * 1024;
      const jsonSize = JSON.stringify(limitedRows).length;
      if (jsonSize > maxResponseBytes) {
        throw new Error(
          `Query results too large (${(jsonSize / 1024 / 1024).toFixed(2)} MB after row truncation to ${config.maxResultRows} rows). ` +
          `Maximum allowed: ${config.maxResponseSizeMb} MB. ` +
          `Add WHERE clause, SELECT specific columns, or increase AZURE_SQL_MAX_RESPONSE_SIZE_MB to raise the limit.`
        );
      }

      let outputRows: T[] = limitedRows as T[];
      let piiReport: PipelineReport | undefined;
      if (this.piiPipeline?.isEnabled) {
        const r = this.piiPipeline.redactResponse('row', outputRows);
        outputRows = r.data;
        piiReport = r.report;
      }

      return {
        columns,
        rows: outputRows,
        rowCount: outputRows.length,
        truncated,
        ...(piiReport ? { piiReport } : {}),
      };
    } catch (error: any) {
      console.error(`SQL query execution failed (${serverId}/${database}):`, {
        error: this.connectionService.sanitizeErrorMessage(error.message),
        query: query.substring(0, 200),
      });

      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        throw new Error(
          `Query timeout exceeded (${config.queryTimeout}ms). ` +
          `Try simplifying your query or adding WHERE clause filters.`
        );
      }
      if (error.message.includes('permission denied') || error.message.includes('denied')) {
        throw new Error(
          'Permission denied. Ensure the database user has SELECT permissions ' +
          'on the requested objects.'
        );
      }

      throw new Error(`Query execution failed: ${this.connectionService.sanitizeErrorMessage(error.message)}`);
    }
  }

  /**
   * List all user tables in the database
   */
  async listTables(serverId: string, database: string): Promise<TableInfo[]> {
    const query = `
      SELECT
        t.TABLE_SCHEMA as schemaName,
        t.TABLE_NAME as tableName,
        p.rows as rowCount,
        CAST(SUM(a.total_pages) * 8 / 1024.0 AS DECIMAL(10,2)) as sizeMB
      FROM INFORMATION_SCHEMA.TABLES t
      LEFT JOIN sys.tables st ON t.TABLE_NAME = st.name
      LEFT JOIN sys.partitions p ON st.object_id = p.object_id AND p.index_id IN (0,1)
      LEFT JOIN sys.allocation_units a ON p.partition_id = a.container_id
      WHERE t.TABLE_TYPE = 'BASE TABLE'
        AND t.TABLE_SCHEMA != 'sys'
      GROUP BY t.TABLE_SCHEMA, t.TABLE_NAME, p.rows
      ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
    `;

    const result = await this.executeQuery<TableInfo>(serverId, database, query);
    return result.rows;
  }

  /**
   * List all views in the database
   */
  async listViews(serverId: string, database: string): Promise<ViewInfo[]> {
    const query = `
      SELECT
        TABLE_SCHEMA as schemaName,
        TABLE_NAME as viewName,
        VIEW_DEFINITION as definition
      FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA != 'sys'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `;

    const result = await this.executeQuery<ViewInfo>(serverId, database, query);
    return result.rows;
  }

  /**
   * List all stored procedures
   */
  async listStoredProcedures(serverId: string, database: string): Promise<StoredProcedureInfo[]> {
    const query = `
      SELECT
        ROUTINE_SCHEMA as schemaName,
        ROUTINE_NAME as procedureName,
        CREATED as createdDate,
        LAST_ALTERED as modifiedDate
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_TYPE = 'PROCEDURE'
        AND ROUTINE_SCHEMA != 'sys'
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    `;

    const result = await this.executeQuery<StoredProcedureInfo>(serverId, database, query);
    return result.rows;
  }

  /**
   * List all database triggers
   */
  async listTriggers(serverId: string, database: string): Promise<TriggerInfo[]> {
    const query = `
      SELECT
        s.name as schemaName,
        t.name as triggerName,
        OBJECT_NAME(t.parent_id) as objectName,
        CASE
          WHEN OBJECTPROPERTY(t.object_id, 'ExecIsInsertTrigger') = 1 THEN 'INSERT'
          WHEN OBJECTPROPERTY(t.object_id, 'ExecIsUpdateTrigger') = 1 THEN 'UPDATE'
          WHEN OBJECTPROPERTY(t.object_id, 'ExecIsDeleteTrigger') = 1 THEN 'DELETE'
          ELSE 'UNKNOWN'
        END as triggerEvent,
        t.is_disabled as isDisabled,
        t.create_date as createdDate,
        t.modify_date as modifiedDate
      FROM sys.triggers t
      INNER JOIN sys.objects o ON t.parent_id = o.object_id
      INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE t.parent_class = 1
      ORDER BY s.name, t.name
    `;

    const result = await this.executeQuery<TriggerInfo>(serverId, database, query);
    return result.rows;
  }

  /**
   * List all user-defined functions
   */
  async listFunctions(serverId: string, database: string): Promise<FunctionInfo[]> {
    const query = `
      SELECT
        ROUTINE_SCHEMA as schemaName,
        ROUTINE_NAME as functionName,
        DATA_TYPE as returnType,
        CREATED as createdDate,
        LAST_ALTERED as modifiedDate
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_TYPE = 'FUNCTION'
        AND ROUTINE_SCHEMA != 'sys'
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    `;

    const result = await this.executeQuery<FunctionInfo>(serverId, database, query);
    return result.rows;
  }

  /**
   * Get detailed schema information for a table
   */
  async getTableSchema(
    serverId: string,
    database: string,
    schemaName: string,
    tableName: string
  ): Promise<TableSchema> {
    const existsQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
    `;
    const existsResult = await this.executeQuery(
      serverId,
      database,
      existsQuery,
      { schema: schemaName, table: tableName }
    );

    if (existsResult.rows.length === 0) {
      throw new Error(
        `Table '${schemaName}.${tableName}' not found. ` +
        `Use sql-list-tables to see available tables.`
      );
    }

    const columnsQuery = `
      SELECT
        COLUMN_NAME as columnName,
        DATA_TYPE as dataType,
        CHARACTER_MAXIMUM_LENGTH as maxLength,
        IS_NULLABLE as isNullable,
        COLUMN_DEFAULT as defaultValue,
        COLUMNPROPERTY(OBJECT_ID(@schema + '.' + @table), COLUMN_NAME, 'IsIdentity') as isIdentity
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
      ORDER BY ORDINAL_POSITION
    `;

    const indexesQuery = `
      SELECT
        i.name as indexName,
        i.type_desc as indexType,
        i.is_unique as isUnique,
        i.is_primary_key as isPrimaryKey,
        STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) as columns
      FROM sys.indexes i
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE s.name = @schema AND t.name = @table
      GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key
      ORDER BY i.is_primary_key DESC, i.name
    `;

    const foreignKeysQuery = `
      SELECT
        fk.name as foreignKeyName,
        OBJECT_SCHEMA_NAME(fk.parent_object_id) as schemaName,
        OBJECT_NAME(fk.parent_object_id) as tableName,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) as columnName,
        OBJECT_SCHEMA_NAME(fk.referenced_object_id) as referencedSchema,
        OBJECT_NAME(fk.referenced_object_id) as referencedTable,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) as referencedColumn
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = @schema
        AND OBJECT_NAME(fk.parent_object_id) = @table
      ORDER BY fk.name
    `;

    try {
      const [columnsResult, indexesResult, foreignKeysResult] = await Promise.all([
        this.executeQuery<ColumnInfo>(serverId, database, columnsQuery, { schema: schemaName, table: tableName }),
        this.executeQuery<IndexInfo>(serverId, database, indexesQuery, { schema: schemaName, table: tableName })
          .catch(() => ({ rows: [], rowCount: 0, columns: [] })),
        this.executeQuery<ForeignKeyInfo>(serverId, database, foreignKeysQuery, { schema: schemaName, table: tableName })
          .catch(() => ({ rows: [], rowCount: 0, columns: [] })),
      ]);

      return {
        schemaName,
        tableName,
        columns: columnsResult.rows,
        indexes: indexesResult.rows,
        foreignKeys: foreignKeysResult.rows,
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve schema for '${schemaName}.${tableName}': ${this.connectionService.sanitizeErrorMessage(error.message)}`);
    }
  }

  /**
   * Get the SQL definition for views, stored procedures, functions, or triggers
   */
  async getObjectDefinition(
    serverId: string,
    database: string,
    schemaName: string,
    objectName: string,
    objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER'
  ): Promise<ObjectDefinition> {
    const query = `
      SELECT
        o.name as objectName,
        s.name as schemaName,
        o.type_desc as objectType,
        o.create_date as createdDate,
        o.modify_date as modifiedDate,
        OBJECT_DEFINITION(o.object_id) as definition
      FROM sys.objects o
      INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE s.name = @schema
        AND o.name = @object
        AND o.type_desc LIKE '%' + @type + '%'
    `;

    const result = await this.executeQuery<ObjectDefinition>(serverId, database, query, {
      schema: schemaName,
      object: objectName,
      type: objectType,
    });

    if (result.rows.length === 0) {
      throw new Error(
        `${objectType} '${schemaName}.${objectName}' not found. ` +
        `Check the schema name, object name, and object type.`
      );
    }

    return result.rows[0];
  }

  /**
   * Execute a user-provided SELECT query with enhanced safety validation
   */
  async executeSelectQuery(
    serverId: string,
    database: string,
    query: string
  ): Promise<SqlApiCollectionResponse<any>> {
    const config = this.connectionService.config;
    const timer = auditLogger.startTimer();

    let cleanQuery = query
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!cleanQuery.startsWith('select')) {
      const error = 'Only SELECT queries are allowed. Write operations (INSERT, UPDATE, DELETE, etc.) are not permitted.';
      auditLogger.log({
        operation: 'execute-select-query',
        operationType: 'READ',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer()
      });
      throw new Error(error);
    }

    const dangerousPatterns = [
      { pattern: /\b(insert|update|delete|merge)\b/i, name: 'write operations' },
      { pattern: /\b(drop|create|alter|truncate)\b/i, name: 'schema modifications' },
      { pattern: /\b(exec|execute|sp_executesql)\b/i, name: 'command execution' },
      { pattern: /\b(xp_|sp_)\w+/i, name: 'system stored procedures' },
      { pattern: /\b(grant|revoke|deny)\b/i, name: 'permission changes' },
      { pattern: /\binto\b/i, name: 'SELECT INTO' },
      { pattern: /\b(openquery|openrowset|opendatasource)\b/i, name: 'linked server queries' },
    ];

    for (const { pattern, name } of dangerousPatterns) {
      if (pattern.test(cleanQuery)) {
        const error = `Query contains forbidden keyword or pattern (${name}). Only SELECT queries are allowed for investigation purposes.`;
        auditLogger.log({
          operation: 'execute-select-query',
          operationType: 'READ',
          componentType: 'Query',
          componentName: `${serverId}/${database}`,
          success: false,
          error,
          parameters: { query: query.substring(0, 500) },
          executionTimeMs: timer()
        });
        throw new Error(error);
      }
    }

    try {
      const result = await this.executeQuery(serverId, database, query);

      auditLogger.log({
        operation: 'execute-select-query',
        operationType: 'READ',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        parameters: {
          query: query.substring(0, 500),
          rowCount: result.rowCount,
          truncated: result.truncated
        },
        success: true,
        executionTimeMs: timer()
      });

      if (result.truncated) {
        console.error(
          `Query results truncated. Returned ${result.rowCount} of potentially more rows. ` +
          `Maximum: ${config.maxResultRows}. Add WHERE clause to filter results.`
        );
      }

      return result;
    } catch (error) {
      auditLogger.log({
        operation: 'execute-select-query',
        operationType: 'READ',
        componentType: 'Query',
        componentName: `${serverId}/${database}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer()
      });
      throw error;
    }
  }
}
