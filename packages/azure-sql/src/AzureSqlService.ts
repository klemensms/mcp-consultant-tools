import sql from 'mssql';
import { auditLogger } from '@mcp-consultant-tools/core';

// Configuration constants
const MAX_RESPONSE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Database configuration within a server
 */
export interface AzureSqlDatabaseConfig {
  name: string;           // Database name
  active: boolean;        // Enable/disable per database
  description?: string;   // Optional description
}

/**
 * SQL Server resource configuration
 */
export interface AzureSqlServerResource {
  id: string;                          // User-friendly ID (e.g., "prod-sql", "dev-sql")
  name: string;                        // Display name
  server: string;                      // SQL server hostname
  port: number;                        // Server port (default: 1433)
  active: boolean;                     // Enable/disable per server
  databases: AzureSqlDatabaseConfig[]; // Empty array = access all databases

  // SQL Authentication (Method 1)
  username?: string;
  password?: string;

  // Azure AD Authentication (Method 2)
  useAzureAd?: boolean;
  azureAdClientId?: string;
  azureAdClientSecret?: string;
  azureAdTenantId?: string;

  description?: string;                // Optional description
}

/**
 * Multi-server Azure SQL configuration
 */
export interface AzureSqlConfig {
  resources: AzureSqlServerResource[];  // Multi-server array

  // Global settings (apply to all servers)
  queryTimeout?: number;
  maxResultRows?: number;
  connectionTimeout?: number;
  poolMin?: number;
  poolMax?: number;
}

// Type definitions for SQL query results
export interface SqlApiCollectionResponse<T> {
  columns: string[];
  rows: T[];
  rowCount: number;
  truncated?: boolean;
}

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

export interface ConnectionTestResult {
  connected: boolean;
  server: string;
  database: string;
  sqlVersion?: string;
  currentDatabase?: string;
  loginName?: string;
  userName?: string;
  error?: string;
}

export interface ServerInfo {
  id: string;
  name: string;
  server: string;
  port: number;
  active: boolean;
  databaseCount: number;
  description?: string;
  authMethod: 'SQL' | 'Azure AD';
}

export interface DatabaseInfo {
  name: string;
  active: boolean;
  description?: string;
}

/**
 * Default configuration response for zero-discovery workflows
 */
export interface DefaultConfiguration {
  defaultServerId: string | null;
  defaultServerName: string | null;
  defaultDatabase: string | null;
  serverCount: number;
  databaseCount: number;
  hint: string;
}

/**
 * Azure SQL Database Service
 *
 * Provides read-only access to Azure SQL Database for investigation and analysis.
 * Supports multiple servers and databases with per-server credentials and active/inactive toggles.
 * Implements security controls including query validation, result limits, and audit logging.
 */
export class AzureSqlService {
  private config: AzureSqlConfig;
  // Multi-pool: Map<"serverId:database", ConnectionPool>
  private pools: Map<string, sql.ConnectionPool> = new Map();

  constructor(config: AzureSqlConfig) {
    // Normalize server configurations
    this.config = {
      resources: config.resources.map(resource => ({
        ...resource,
        port: resource.port || 1433,
        useAzureAd: resource.useAzureAd ?? false,
      })),
      queryTimeout: config.queryTimeout || 30000,
      maxResultRows: config.maxResultRows || 1000,
      connectionTimeout: config.connectionTimeout || 15000,
      poolMin: config.poolMin || 0,
      poolMax: config.poolMax || 10,
    };
  }

  /**
   * Get server resource by ID with validation
   */
  private getServerById(serverId: string): AzureSqlServerResource {
    const server = this.config.resources.find(r => r.id === serverId);
    if (!server) {
      const available = this.config.resources.map(r => `${r.id} (${r.name})`).join(', ');
      throw new Error(
        `Server '${serverId}' not found. Available servers: ${available || 'none configured'}. ` +
        `Use sql-list-servers to see all configured servers.`
      );
    }
    if (!server.active) {
      throw new Error(
        `Server '${serverId}' is inactive. Set active=true in configuration to enable access.`
      );
    }
    return server;
  }

  /**
   * Get database configuration with validation
   * Empty databases array = access all databases on server
   */
  private getDatabaseConfig(server: AzureSqlServerResource, database: string): AzureSqlDatabaseConfig {
    // Empty databases array = access all databases (discovery mode)
    if (server.databases.length === 0) {
      return { name: database, active: true };
    }

    const dbConfig = server.databases.find(db => db.name === database);
    if (!dbConfig) {
      const available = server.databases.map(db => db.name).join(', ');
      throw new Error(
        `Database '${database}' not configured on server '${server.id}'. ` +
        `Available databases: ${available || 'none configured'}. ` +
        `Use sql-list-databases to see all databases on this server.`
      );
    }
    if (!dbConfig.active) {
      throw new Error(
        `Database '${database}' is inactive on server '${server.id}'. ` +
        `Set active=true in configuration to enable access.`
      );
    }
    return dbConfig;
  }

  /**
   * Get or create connection pool for specific server and database
   */
  private async getPool(serverId: string, database: string): Promise<sql.ConnectionPool> {
    const poolKey = `${serverId}:${database}`;

    // Check if pool exists and is healthy
    if (this.pools.has(poolKey)) {
      const pool = this.pools.get(poolKey)!;
      if (pool.connected && pool.healthy) {
        return pool;
      }

      // Close unhealthy pool
      try {
        await pool.close();
      } catch (error) {
        console.error(`Error closing unhealthy pool ${poolKey}:`, error);
      }
      this.pools.delete(poolKey);
    }

    // Validate server and database configuration
    const server = this.getServerById(serverId);
    this.getDatabaseConfig(server, database);

    try {
      const poolConfig: sql.config = {
        server: server.server,
        database: database,
        port: server.port,
        connectionTimeout: this.config.connectionTimeout!,
        requestTimeout: this.config.queryTimeout!,
        pool: {
          min: this.config.poolMin!,
          max: this.config.poolMax!,
          idleTimeoutMillis: 30000,
        },
        options: {
          encrypt: true, // Required for Azure SQL
          trustServerCertificate: false,
          enableArithAbort: true,
        },
      };

      // Per-server authentication
      if (server.useAzureAd) {
        poolConfig.authentication = {
          type: 'azure-active-directory-service-principal-secret',
          options: {
            clientId: server.azureAdClientId!,
            clientSecret: server.azureAdClientSecret!,
            tenantId: server.azureAdTenantId!,
          },
        };
      } else {
        poolConfig.user = server.username;
        poolConfig.password = server.password;
      }

      const pool = await sql.connect(poolConfig);
      this.pools.set(poolKey, pool);
      console.error(`Azure SQL connection pool established: ${poolKey}`);

      return pool;
    } catch (error: any) {
      console.error(`Failed to connect to Azure SQL Database (${poolKey}):`, {
        server: server.server,
        database: database,
        error: this.sanitizeErrorMessage(error.message),
      });
      throw new Error(
        `Database connection failed for '${serverId}/${database}': ${this.sanitizeErrorMessage(error.message)}`
      );
    }
  }

  /**
   * Sanitize error messages to prevent credential leakage
   */
  private sanitizeErrorMessage(message: string): string {
    return message
      .replace(/password=[^;]+/gi, 'password=***')
      .replace(/pwd=[^;]+/gi, 'pwd=***')
      .replace(/clientSecret=[^;]+/gi, 'clientSecret=***')
      .replace(/Authentication=ActiveDirectoryServicePrincipal;([^;]*);/gi, 'Authentication=***;');
  }

  /**
   * Execute a query with safety limits and size protection
   */
  private async executeQuery<T = any>(
    serverId: string,
    database: string,
    query: string,
    parameters?: Record<string, any>
  ): Promise<SqlApiCollectionResponse<T>> {
    try {
      const pool = await this.getPool(serverId, database);
      const request = pool.request();

      // Add parameters if provided
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

      // Check response size BEFORE processing
      const jsonSize = JSON.stringify(rows).length;
      if (jsonSize > MAX_RESPONSE_SIZE_BYTES) {
        throw new Error(
          `Query results too large (${(jsonSize / 1024 / 1024).toFixed(2)} MB). ` +
          `Maximum allowed: ${MAX_RESPONSE_SIZE_BYTES / 1024 / 1024} MB. ` +
          `Add WHERE clause or SELECT specific columns to reduce result size.`
        );
      }

      // Enforce row limit
      const truncated = rows.length > this.config.maxResultRows!;
      const limitedRows = rows.slice(0, this.config.maxResultRows!);

      return {
        columns,
        rows: limitedRows as T[],
        rowCount: limitedRows.length,
        truncated,
      };
    } catch (error: any) {
      console.error(`SQL query execution failed (${serverId}/${database}):`, {
        error: this.sanitizeErrorMessage(error.message),
        query: query.substring(0, 200), // Log first 200 chars
      });

      // Provide user-friendly error messages
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        throw new Error(
          `Query timeout exceeded (${this.config.queryTimeout}ms). ` +
          `Try simplifying your query or adding WHERE clause filters.`
        );
      }
      if (error.message.includes('permission denied') || error.message.includes('denied')) {
        throw new Error(
          'Permission denied. Ensure the database user has SELECT permissions ' +
          'on the requested objects.'
        );
      }

      throw new Error(`Query execution failed: ${this.sanitizeErrorMessage(error.message)}`);
    }
  }

  /**
   * Close all connection pools (cleanup)
   */
  async close(): Promise<void> {
    const closedPools: string[] = [];
    const errors: string[] = [];

    for (const [poolKey, pool] of this.pools.entries()) {
      try {
        await pool.close();
        closedPools.push(poolKey);
      } catch (error: any) {
        const errorMsg = this.sanitizeErrorMessage(error.message);
        errors.push(`${poolKey}: ${errorMsg}`);
        console.error(`Error closing pool ${poolKey}:`, errorMsg);
      }
    }

    this.pools.clear();

    if (closedPools.length > 0) {
      console.error(`Azure SQL connection pools closed: ${closedPools.join(', ')}`);
    }
    if (errors.length > 0) {
      console.error(`Errors closing pools: ${errors.join('; ')}`);
    }
  }

  /**
   * List all configured SQL servers
   */
  async listServers(): Promise<ServerInfo[]> {
    return this.config.resources.map(resource => ({
      id: resource.id,
      name: resource.name,
      server: resource.server,
      port: resource.port,
      active: resource.active,
      databaseCount: resource.databases.length,
      description: resource.description,
      authMethod: resource.useAzureAd ? 'Azure AD' : 'SQL',
    }));
  }

  /**
   * Get default server and database configuration for zero-discovery workflows
   * Returns the default/active server and database, enabling agents to skip discovery calls
   */
  getDefaultConfiguration(): DefaultConfiguration {
    const activeServers = this.config.resources.filter(r => r.active);
    const serverCount = this.config.resources.length;

    // No servers configured
    if (serverCount === 0) {
      return {
        defaultServerId: null,
        defaultServerName: null,
        defaultDatabase: null,
        serverCount: 0,
        databaseCount: 0,
        hint: 'No SQL servers configured. Add AZURE_SQL_SERVERS or AZURE_SQL_SERVER/AZURE_SQL_DATABASE environment variables.',
      };
    }

    // No active servers
    if (activeServers.length === 0) {
      return {
        defaultServerId: null,
        defaultServerName: null,
        defaultDatabase: null,
        serverCount,
        databaseCount: 0,
        hint: `${serverCount} server(s) configured but none are active. Set active=true on a server to enable it.`,
      };
    }

    // Get the default server (first active, or only server)
    const defaultServer = activeServers[0];
    const activeDatabases = defaultServer.databases.filter(db => db.active);
    const databaseCount = defaultServer.databases.length;

    // No databases configured (discovery mode) or no active databases
    if (databaseCount === 0) {
      // Discovery mode - no specific database configured
      return {
        defaultServerId: defaultServer.id,
        defaultServerName: defaultServer.name,
        defaultDatabase: null,
        serverCount,
        databaseCount: 0,
        hint: serverCount === 1
          ? `Single server configured (${defaultServer.id}). Databases are in discovery mode - you must specify the database parameter.`
          : `${serverCount} server(s) configured. Default: ${defaultServer.id}. Databases are in discovery mode - you must specify the database parameter.`,
      };
    }

    if (activeDatabases.length === 0) {
      return {
        defaultServerId: defaultServer.id,
        defaultServerName: defaultServer.name,
        defaultDatabase: null,
        serverCount,
        databaseCount,
        hint: `${databaseCount} database(s) configured on server '${defaultServer.id}' but none are active. Set active=true on a database to enable it.`,
      };
    }

    // Get the default database (first active)
    const defaultDatabase = activeDatabases[0];

    // Build appropriate hint based on configuration complexity
    let hint: string;
    if (serverCount === 1 && databaseCount === 1) {
      hint = `Single server and database configured. You can omit serverId and database parameters in queries - they will default to '${defaultServer.id}' and '${defaultDatabase.name}'.`;
    } else if (serverCount === 1 && activeDatabases.length === 1) {
      hint = `Single server with one active database. You can omit serverId and database parameters - defaults: server='${defaultServer.id}', database='${defaultDatabase.name}'.`;
    } else {
      hint = `${serverCount} server(s), ${databaseCount} database(s) on default server. Defaults: server='${defaultServer.id}', database='${defaultDatabase.name}'. Use sql-list-servers and sql-list-databases for full list.`;
    }

    return {
      defaultServerId: defaultServer.id,
      defaultServerName: defaultServer.name,
      defaultDatabase: defaultDatabase.name,
      serverCount,
      databaseCount,
      hint,
    };
  }

  /**
   * Resolve server ID - returns the provided ID or resolves the default
   * @throws Error if no default can be resolved
   */
  resolveServerId(serverId?: string): string {
    if (serverId) {
      return serverId;
    }

    const defaults = this.getDefaultConfiguration();
    if (!defaults.defaultServerId) {
      throw new Error(defaults.hint);
    }
    return defaults.defaultServerId;
  }

  /**
   * Resolve database name - returns the provided name or resolves the default for the given server
   * @throws Error if no default can be resolved
   */
  resolveDatabase(serverId: string, database?: string): string {
    if (database) {
      return database;
    }

    const server = this.getServerById(serverId);
    const activeDatabases = server.databases.filter(db => db.active);

    // Discovery mode - no databases configured
    if (server.databases.length === 0) {
      throw new Error(
        `Server '${serverId}' is in discovery mode (no databases pre-configured). ` +
        `You must specify the database parameter. Use sql-list-databases to discover available databases.`
      );
    }

    // No active databases
    if (activeDatabases.length === 0) {
      const available = server.databases.map(db => db.name).join(', ');
      throw new Error(
        `No active databases on server '${serverId}'. Available databases: ${available}. ` +
        `Set active=true in configuration or specify the database parameter explicitly.`
      );
    }

    return activeDatabases[0].name;
  }

  /**
   * List databases on a server
   * If server.databases is configured (non-empty), return configured databases
   * If server.databases is empty, query sys.databases for all databases
   */
  async listDatabases(serverId: string): Promise<DatabaseInfo[]> {
    const server = this.getServerById(serverId);

    // If databases configured, return them
    if (server.databases.length > 0) {
      return server.databases.map(db => ({
        name: db.name,
        active: db.active,
        description: db.description,
      }));
    }

    // Otherwise, query SQL Server for all databases (discovery mode)
    try {
      const pool = await this.getPool(serverId, 'master');
      const result = await pool.request().query(`
        SELECT name
        FROM sys.databases
        WHERE database_id > 4  -- Exclude system databases (master, tempdb, model, msdb)
        ORDER BY name
      `);

      return result.recordset.map((r: any) => ({
        name: r.name,
        active: true,
        description: 'Discovered database',
      }));
    } catch (error: any) {
      throw new Error(
        `Failed to query databases on server '${serverId}': ${this.sanitizeErrorMessage(error.message)}`
      );
    }
  }

  /**
   * Test database connectivity
   */
  async testConnection(serverId: string, database: string): Promise<ConnectionTestResult> {
    const server = this.getServerById(serverId);

    try {
      const pool = await this.getPool(serverId, database);
      const result = await pool.request().query(`
        SELECT
          @@VERSION as sqlVersion,
          DB_NAME() as currentDatabase,
          SUSER_SNAME() as loginName,
          USER_NAME() as userName
      `);

      return {
        connected: true,
        server: server.server,
        database: database,
        sqlVersion: result.recordset[0].sqlVersion,
        currentDatabase: result.recordset[0].currentDatabase,
        loginName: result.recordset[0].loginName,
        userName: result.recordset[0].userName,
      };
    } catch (error: any) {
      return {
        connected: false,
        server: server.server,
        database: database,
        error: this.sanitizeErrorMessage(error.message),
      };
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
      WHERE t.parent_class = 1  -- Object triggers (not database triggers)
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
    // First, verify table exists
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

    // Get columns
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

    // Get indexes
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

    // Get foreign keys
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

    // Query all schema information with graceful degradation
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
      throw new Error(`Failed to retrieve schema for '${schemaName}.${tableName}': ${this.sanitizeErrorMessage(error.message)}`);
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
    const timer = auditLogger.startTimer();

    // Step 1: Remove comments (SQL and C-style)
    let cleanQuery = query
      .replace(/--.*$/gm, '')           // Remove -- comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/\s+/g, ' ')             // Normalize whitespace
      .trim()
      .toLowerCase();

    // Step 2: Validate SELECT query
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

    // Step 3: Check for dangerous keywords with word boundaries
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

    // Execute query with audit logging
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
          `Maximum: ${this.config.maxResultRows}. Add WHERE clause to filter results.`
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
