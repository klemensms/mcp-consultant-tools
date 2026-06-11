import sql from 'mssql';
import type { PipelineReport } from '@mcp-consultant-tools/core';

/**
 * Database configuration within a server
 */
export interface AzureSqlDatabaseConfig {
  name: string;
  active: boolean;
  description?: string;
}

/**
 * SQL Server resource configuration
 */
export interface AzureSqlServerResource {
  id: string;
  name: string;
  server: string;
  port: number;
  active: boolean;
  databases: AzureSqlDatabaseConfig[];

  // SQL Authentication
  username?: string;
  password?: string;

  // Azure AD Authentication
  useAzureAd?: boolean;
  azureAdClientId?: string;
  azureAdClientSecret?: string;
  azureAdTenantId?: string;

  description?: string;
}

/**
 * Multi-server Azure SQL configuration
 */
export interface AzureSqlConfig {
  resources: AzureSqlServerResource[];
  queryTimeout?: number;
  maxResultRows?: number;
  maxResponseSizeMb?: number;
  connectionTimeout?: number;
  poolMin?: number;
  poolMax?: number;
}

export interface SqlApiCollectionResponse<T> {
  columns: string[];
  rows: T[];
  rowCount: number;
  truncated?: boolean;
  piiReport?: PipelineReport;
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

export interface DefaultConfiguration {
  defaultServerId: string | null;
  defaultServerName: string | null;
  defaultDatabase: string | null;
  serverCount: number;
  databaseCount: number;
  hint: string;
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

/**
 * ConnectionService manages connection pools, server/database resolution, and connectivity.
 */
export class ConnectionService {
  readonly config: AzureSqlConfig;
  // Multi-pool: Map<"serverId:database", ConnectionPool>
  private pools: Map<string, sql.ConnectionPool> = new Map();

  constructor(config: AzureSqlConfig) {
    this.config = {
      resources: config.resources.map(resource => ({
        ...resource,
        port: resource.port || 1433,
        useAzureAd: resource.useAzureAd ?? false,
      })),
      queryTimeout: config.queryTimeout || 30000,
      maxResultRows: config.maxResultRows || 1000,
      maxResponseSizeMb: config.maxResponseSizeMb || 10,
      connectionTimeout: config.connectionTimeout || 15000,
      poolMin: config.poolMin || 0,
      poolMax: config.poolMax || 10,
    };
  }

  /**
   * Get server resource by ID with validation
   */
  getServerById(serverId: string): AzureSqlServerResource {
    const server = this.config.resources.find(r => r.id === serverId);
    if (!server) {
      const available = this.config.resources.map(r => r.id).join(', ');
      const defaultServer = this.config.resources.find(r => r.active)?.id;
      throw new Error(
        `Server '${serverId}' not found. Available: [${available || 'none'}]. ` +
        (defaultServer
          ? `\uD83D\uDCA1 TIP: OMIT the serverId parameter entirely to use the default server '${defaultServer}'. DO NOT GUESS server IDs.`
          : `Use sql-list-servers to see configured servers.`)
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
   */
  getDatabaseConfig(server: AzureSqlServerResource, database: string): AzureSqlDatabaseConfig {
    if (server.databases.length === 0) {
      return { name: database, active: true };
    }

    const dbConfig = server.databases.find(db => db.name === database);
    if (!dbConfig) {
      const available = server.databases.map(db => db.name).join(', ');
      const defaultDb = server.databases.find(db => db.active)?.name;
      throw new Error(
        `Database '${database}' not found on server '${server.id}'. Available: [${available || 'none'}]. ` +
        (defaultDb
          ? `\uD83D\uDCA1 TIP: OMIT the database parameter entirely to use the default database '${defaultDb}'. DO NOT GUESS database names.`
          : `Use sql-list-databases to see available databases.`)
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
  async getPool(serverId: string, database: string): Promise<sql.ConnectionPool> {
    const poolKey = `${serverId}:${database}`;

    if (this.pools.has(poolKey)) {
      const pool = this.pools.get(poolKey)!;
      if (pool.connected && pool.healthy) {
        return pool;
      }
      try {
        await pool.close();
      } catch (error) {
        console.error(`Error closing unhealthy pool ${poolKey}:`, error);
      }
      this.pools.delete(poolKey);
    }

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
          encrypt: true,
          trustServerCertificate: false,
          enableArithAbort: true,
        },
      };

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
  sanitizeErrorMessage(message: string): string {
    return message
      .replace(/password=[^;]+/gi, 'password=***')
      .replace(/pwd=[^;]+/gi, 'pwd=***')
      .replace(/clientSecret=[^;]+/gi, 'clientSecret=***')
      .replace(/Authentication=ActiveDirectoryServicePrincipal;([^;]*);/gi, 'Authentication=***;');
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
   */
  getDefaultConfiguration(): DefaultConfiguration {
    const activeServers = this.config.resources.filter(r => r.active);
    const serverCount = this.config.resources.length;

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

    const defaultServer = activeServers[0];
    const activeDatabases = defaultServer.databases.filter(db => db.active);
    const databaseCount = defaultServer.databases.length;

    if (databaseCount === 0) {
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

    const defaultDatabase = activeDatabases[0];

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
   */
  resolveDatabase(serverId: string, database?: string): string {
    if (database) {
      return database;
    }

    const server = this.getServerById(serverId);
    const activeDatabases = server.databases.filter(db => db.active);

    if (server.databases.length === 0) {
      throw new Error(
        `Server '${serverId}' is in discovery mode (no databases pre-configured). ` +
        `You must specify the database parameter. Use sql-list-databases to discover available databases.`
      );
    }

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
   */
  async listDatabases(serverId: string): Promise<DatabaseInfo[]> {
    const server = this.getServerById(serverId);

    if (server.databases.length > 0) {
      return server.databases.map(db => ({
        name: db.name,
        active: db.active,
        description: db.description,
      }));
    }

    try {
      const pool = await this.getPool(serverId, 'master');
      const result = await pool.request().query(`
        SELECT name
        FROM sys.databases
        WHERE database_id > 4
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
}
