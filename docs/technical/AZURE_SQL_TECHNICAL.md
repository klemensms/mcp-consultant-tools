# Azure SQL Database Integration - Technical Documentation

**Related Documentation:**
- User Guide: [docs/documentation/AZURE_SQL.md](../documentation/AZURE_SQL.md)
- Main Documentation: [CLAUDE.md](../../CLAUDE.md)
- Source Code: [packages/azure-sql/src/](../../packages/azure-sql/src/)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Service Implementation](#service-implementation)
4. [Multi-Server Architecture](#multi-server-architecture)
5. [Connection Pooling](#connection-pooling)
6. [Enhanced Query Validation](#enhanced-query-validation)
7. [Result Size Protection](#result-size-protection)
8. [Credential Sanitization](#credential-sanitization)
9. [Available Tools](#available-tools)
10. [Available Prompts](#available-prompts)
11. [Service Integration](#service-integration)
12. [Formatting Utilities](#formatting-utilities)
13. [Use Cases](#use-cases)
14. [Security Considerations](#security-considerations)
15. [Error Handling](#error-handling)
16. [Performance Optimization](#performance-optimization)

---

## Overview

The Azure SQL Database integration provides read-only access to SQL databases for schema exploration, data investigation, and ad-hoc querying. The integration is designed with comprehensive security controls and is read-only by design to prevent accidental data modifications.

## Architecture

The Azure SQL Database integration provides read-only access to Azure SQL Database and SQL Server through the `mssql` library with comprehensive security controls.

**Service Class:** `AzureSqlService` ([src/AzureSqlService.ts](../../src/AzureSqlService.ts))
- Manages database connections with connection pooling
- Implements query validation and security controls
- Provides schema exploration methods
- Executes safe SELECT queries with result limiting

**Authentication Methods:**
1. **SQL Authentication (Username/Password)** - Simpler for getting started
   - Standard SQL Server authentication
   - Username and password configured via environment variables
   - Suitable for development and testing

2. **Azure AD Authentication (Service Principal)** - Recommended for production
   - Token-based authentication using Azure AD
   - No stored passwords (uses client credentials flow)
   - Better security with token refresh
   - Uses `mssql` library's built-in Azure AD support

**Configuration:**
Supports two configuration modes:
1. **Multi-server configuration** (RECOMMENDED) - JSON array with per-server settings:
   - Multiple SQL servers with individual credentials per server
   - Multiple databases per server with active/inactive flags
   - Empty databases[] array enables access to all databases on that server
   - Per-server authentication (SQL or Azure AD)
2. **Legacy single-server** - Backward compatible with existing environment variables

## Multi-Server Architecture

**Key Features:**
- Connection pooling: `Map<"serverId:database", ConnectionPool>` for isolated per-database connections
- Per-server credentials: Each server can use different authentication methods
- Database discovery: Empty databases[] triggers `sys.databases` query
- Active/inactive flags: Quick toggle at server and database levels

Each connection is validated on first use and maintains a health-checked connection pool.

## Service Implementation

**File:** [src/AzureSqlService.ts](../../src/AzureSqlService.ts)

**Core Architecture:**

```typescript
export interface AzureSqlDatabaseConfig {
  name: string;
  active: boolean;
  description?: string;
}

export interface AzureSqlServerResource {
  id: string;                          // Unique server identifier
  name: string;                        // Display name
  server: string;                      // Server hostname
  port: number;                        // SQL Server port
  active: boolean;                     // Server active flag
  databases: AzureSqlDatabaseConfig[]; // Databases (empty = all)

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

export interface AzureSqlConfig {
  resources: AzureSqlServerResource[];

  // Global settings (apply to all servers)
  queryTimeout?: number;
  maxResultRows?: number;
  connectionTimeout?: number;
  poolMin?: number;
  poolMax?: number;
}

class AzureSqlService {
  // Multi-pool connection management
  private pools: Map<string, ConnectionPool> = new Map();

  // Configuration
  private config: AzureSqlConfig;

  // Helper methods
  private getServerById(serverId: string): AzureSqlServerResource
  private getDatabaseConfig(server, database): AzureSqlDatabaseConfig

  // Connection pool management (per database)
  private async getPool(serverId, database): Promise<ConnectionPool>

  // Security and execution
  private sanitizeErrorMessage(error: Error): string
  private async executeQuery<T>(serverId, database, query): Promise<IResult<T>>

  // Public API methods (all require serverId and database)
  async listServers(): Promise<ServerInfo[]>
  async listDatabases(serverId): Promise<DatabaseInfo[]>
  async testConnection(serverId, database): Promise<ConnectionTestResult>
  async listTables(serverId, database): Promise<TableInfo[]>
  async listViews(serverId, database): Promise<ViewInfo[]>
  async listStoredProcedures(serverId, database): Promise<StoredProcedureInfo[]>
  async listTriggers(serverId, database): Promise<TriggerInfo[]>
  async listFunctions(serverId, database): Promise<FunctionInfo[]>
  async getTableSchema(serverId, database, schema, table): Promise<TableSchema>
  async getObjectDefinition(serverId, database, schema, name, type): Promise<ObjectDefinition>
  async executeSelectQuery(serverId, database, query): Promise<SqlApiCollectionResponse>
  async close(): Promise<void>
}
```

## Connection Pooling

- Uses `mssql` library's built-in connection pooling
- **Multi-pool architecture**: Separate connection pool per `serverId:database` combination
- Pool key format: `"prod-sql:AppDB"`, `"dev-sql:TestDB"`, etc.
- Default pool: 0 min connections, 10 max connections per database (configurable)
- Automatic connection health checks and reconnection
- Graceful pool disposal on service shutdown (closes all pools)

## Enhanced Query Validation

**File:** [src/AzureSqlService.ts:338](../../src/AzureSqlService.ts)

The service implements multi-layer security for query execution:

```typescript
async executeSelectQuery(query: string): Promise<SqlApiCollectionResponse<any>> {
  const timer = auditLogger.startTimer();

  // Layer 1: Remove SQL comments (prevents comment-hiding attacks)
  let cleanQuery = query
    .replace(/--.*$/gm, '')           // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .trim()
    .toLowerCase();

  // Layer 2: Validate SELECT-only
  if (!cleanQuery.startsWith('select')) {
    throw new Error('Only SELECT queries are permitted');
  }

  // Layer 3: Dangerous keyword detection with word boundaries
  const dangerousPatterns = [
    { pattern: /\b(insert|update|delete|merge)\b/i, name: 'write operations' },
    { pattern: /\b(drop|create|alter|truncate)\b/i, name: 'schema modifications' },
    { pattern: /\b(exec|execute|sp_|xp_)\b/i, name: 'procedure execution' },
    { pattern: /\binto\b/i, name: 'data insertion' },
    // ... more patterns
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(cleanQuery)) {
      auditLogger.log({
        operation: 'execute-select-query',
        operationType: 'READ',
        componentType: 'Query',
        success: false,
        error: `Blocked ${name}`,
        parameters: { query: query.substring(0, 500) },
        executionTimeMs: timer()
      });
      throw new Error(`Invalid query: ${name} detected`);
    }
  }

  // Execute with safety limits
  const result = await this.executeQuery(query);

  // Audit logging
  auditLogger.log({
    operation: 'execute-select-query',
    operationType: 'READ',
    componentType: 'Query',
    success: true,
    parameters: {
      query: query.substring(0, 500),
      rowCount: result.rowCount
    },
    executionTimeMs: timer()
  });

  return result;
}
```

## Result Size Protection

**File:** [src/AzureSqlService.ts:266](../../src/AzureSqlService.ts)

```typescript
private async executeQuery<T>(query: string): Promise<IResult<T>> {
  const pool = await this.getPool();
  const request = pool.request();

  // Set query timeout (default: 30 seconds)
  request.timeout = this.config.queryTimeout || 30000;

  const result = await request.query<T>(query);

  // Enforce row limit (default: 1000 rows)
  const maxRows = this.config.maxResultRows || 1000;
  if (result.recordset && result.recordset.length > maxRows) {
    result.recordset = result.recordset.slice(0, maxRows);
    result.rowsAffected = [maxRows];
  }

  // Enforce response size limit (10MB)
  const responseSize = JSON.stringify(result).length;
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (responseSize > maxSize) {
    throw new Error(`Query result too large (${responseSize} bytes, max ${maxSize})`);
  }

  return result;
}
```

## Credential Sanitization

**File:** [src/AzureSqlService.ts:232](../../src/AzureSqlService.ts)

All error messages are sanitized to remove credentials:

```typescript
private sanitizeErrorMessage(error: Error): string {
  let message = error.message;

  // Remove connection strings
  message = message.replace(/Server=[^;]+/gi, 'Server=***');
  message = message.replace(/Password=[^;]+/gi, 'Password=***');
  message = message.replace(/User ID=[^;]+/gi, 'User ID=***');

  // Remove IP addresses
  message = message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '***.***.***.***');

  return message;
}
```

## Available Tools

**Total: 11 tools**

**Server & Database Discovery Tools:**
1. **`sql-list-servers`** - List all configured SQL servers with active/inactive status
2. **`sql-list-databases`** - List databases on a server (configured or discovered via sys.databases)

**Schema Exploration Tools:**
3. **`sql-test-connection`** - Test database connectivity and server information
4. **`sql-list-tables`** - List all tables with row counts and sizes
5. **`sql-list-views`** - List all views with definitions
6. **`sql-list-stored-procedures`** - List all stored procedures
7. **`sql-list-triggers`** - List all triggers with event types
8. **`sql-list-functions`** - List all user-defined functions
9. **`sql-get-table-schema`** - Get complete table schema (columns, indexes, foreign keys)
10. **`sql-get-object-definition`** - Get SQL definition for views, procedures, functions, triggers

**Query Execution Tools:**
11. **`sql-execute-query`** - Execute SELECT queries safely with validation

## Available Prompts

**Total: 3 prompts**

1. **`sql-database-overview`** - Comprehensive database overview with all objects
2. **`sql-table-details`** - Detailed table report with schema information
3. **`sql-query-results`** - Formatted query results as markdown tables

## Service Integration

**File:** [src/index.ts](../../src/index.ts)

**Configuration Parsing:**
```typescript
const AZURE_SQL_CONFIG: AzureSqlConfig = {
  resources: [],
  queryTimeout: parseInt(process.env.AZURE_SQL_QUERY_TIMEOUT || "30000"),
  maxResultRows: parseInt(process.env.AZURE_SQL_MAX_RESULT_ROWS || "1000"),
  connectionTimeout: parseInt(process.env.AZURE_SQL_CONNECTION_TIMEOUT || "15000"),
  poolMin: parseInt(process.env.AZURE_SQL_POOL_MIN || "0"),
  poolMax: parseInt(process.env.AZURE_SQL_POOL_MAX || "10"),
};

// Multi-server configuration (RECOMMENDED)
if (process.env.AZURE_SQL_SERVERS) {
  try {
    AZURE_SQL_CONFIG.resources = JSON.parse(process.env.AZURE_SQL_SERVERS);
  } catch (error) {
    console.error('Failed to parse AZURE_SQL_SERVERS:', error);
  }
}
// Legacy single-server configuration (backward compatibility)
else if (process.env.AZURE_SQL_SERVER && process.env.AZURE_SQL_DATABASE) {
  AZURE_SQL_CONFIG.resources = [
    {
      id: 'default',
      name: 'Default SQL Server',
      server: process.env.AZURE_SQL_SERVER,
      port: parseInt(process.env.AZURE_SQL_PORT || "1433"),
      active: true,
      databases: [
        {
          name: process.env.AZURE_SQL_DATABASE,
          active: true,
          description: 'Default database',
        },
      ],
      username: process.env.AZURE_SQL_USERNAME || '',
      password: process.env.AZURE_SQL_PASSWORD || '',
      useAzureAd: process.env.AZURE_SQL_USE_AZURE_AD === "true",
      azureAdClientId: process.env.AZURE_SQL_CLIENT_ID || '',
      azureAdClientSecret: process.env.AZURE_SQL_CLIENT_SECRET || '',
      azureAdTenantId: process.env.AZURE_SQL_TENANT_ID || '',
      description: 'Migrated from single-server configuration',
    },
  ];
}
```

**Lazy Initialization Pattern:**
```typescript
let azureSqlService: AzureSqlService | null = null;

function getAzureSqlService(): AzureSqlService {
  if (!azureSqlService) {
    // Validate required configuration
    const missingConfig: string[] = [];

    if (!AZURE_SQL_CONFIG.resources || AZURE_SQL_CONFIG.resources.length === 0) {
      missingConfig.push("AZURE_SQL_SERVERS or AZURE_SQL_SERVER/AZURE_SQL_DATABASE");
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing Azure SQL Database configuration: ${missingConfig.join(", ")}. ` +
        `Configure via AZURE_SQL_SERVERS JSON array or legacy AZURE_SQL_SERVER/AZURE_SQL_DATABASE variables.`
      );
    }

    azureSqlService = new AzureSqlService(AZURE_SQL_CONFIG);
    console.error("Azure SQL Database service initialized");
  }
  return azureSqlService;
}
```

**Cleanup Handlers:**
```typescript
process.on('SIGINT', async () => {
  console.error('Shutting down gracefully (SIGINT)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down gracefully (SIGTERM)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  process.exit(0);
});
```

## Formatting Utilities

**File:** [src/utils/sql-formatters.ts](../../src/utils/sql-formatters.ts)

The SQL formatters transform raw query results into human-readable markdown:

**Key Formatters:**
- `formatSqlResultsAsMarkdown()` - Convert query results to markdown tables
- `formatTableList()` - Format table listings with row counts and sizes
- `formatViewList()` - Format view listings
- `formatProcedureList()` - Format stored procedure listings
- `formatTriggerList()` - Format trigger listings with status
- `formatFunctionList()` - Format function listings
- `formatTableSchemaAsMarkdown()` - Comprehensive table schema with columns, indexes, FKs
- `formatDatabaseOverview()` - Complete database overview with all objects

**Example Output:**
```markdown
## Database Tables (45 total)

| Schema | Table Name    | Rows    | Total Size | Data Size | Index Size |
|--------|---------------|---------|------------|-----------|------------|
| dbo    | OrderHistory  | 1.2M    | 450 MB     | 380 MB    | 70 MB      |
| dbo    | Users         | 250K    | 180 MB     | 150 MB    | 30 MB      |
| dbo    | Products      | 150K    | 95 MB      | 78 MB     | 17 MB      |
```

## Use Cases

**Database Investigation:**
- Explore unknown database schema
- Document database structure for new team members
- Investigate data issues without write access
- Review database objects (tables, views, procedures, triggers, functions)

**Data Analysis:**
- Ad-hoc queries for data investigation
- Verify data quality
- Extract data for reporting
- Troubleshoot application issues

**Schema Documentation:**
- Generate comprehensive database documentation
- Map table relationships
- Document indexes and constraints
- Review stored procedure logic

**Read-Only Operations:**
- Safe database access for non-DBA users
- Prevent accidental data modifications
- Audit all query operations
- Enforce row and size limits

## Security Considerations

**Query Safety:**
- **Read-only enforcement** - Only SELECT queries permitted
- **Keyword blacklist** - Blocks INSERT, UPDATE, DELETE, DROP, EXEC, and more
- **Comment removal** - Prevents comment-hiding attacks
- **Word boundary detection** - Uses regex `\b` to catch keyword variations
- **Query size limits** - 10MB response max, 1000 row max (configurable)
- **Timeout protection** - 30-second query timeout (configurable)
- **Audit logging** - All queries logged with execution time

**Credential Management:**
- **Never logged** - Credentials never appear in logs or errors
- **Sanitized errors** - Connection strings and passwords removed from error messages
- **Environment variables** - Credentials stored in environment, not code
- **Token-based auth** - Azure AD uses tokens, not stored passwords
- **Separate accounts** - Use dedicated read-only accounts, not admin accounts

**Database Permissions:**
For read-only access, the user/service principal needs:
```sql
ALTER ROLE db_datareader ADD MEMBER [mcp_readonly];
GRANT VIEW DEFINITION TO [mcp_readonly];
```

**Connection Security:**
- **SSL/TLS encryption** - All connections encrypted by default
- **Firewall rules** - Azure SQL firewall controls IP access
- **Connection pooling** - Limits concurrent connections (max 10 default)
- **Health checks** - Automatic connection validation and reconnection

## Error Handling

The service implements comprehensive error handling:

**Connection Errors:**
- Clear messages about server/database not found
- Firewall rule suggestions
- Authentication failure details (sanitized)
- Connection timeout handling

**Query Errors:**
- **Syntax errors** - Clear SQL syntax error messages
- **Permission errors** - Explains missing VIEW DEFINITION permission
- **Timeout errors** - Suggests query optimization
- **Result too large** - Provides row/size limit information

**Validation Errors:**
- **Write operation detected** - Explains read-only restriction
- **Dangerous keyword** - Identifies blocked keyword and category
- **Invalid query** - Suggests SELECT query format

## Performance Optimization

**Connection Pooling:**
- Reuses connections for multiple queries
- Configurable pool size (default: 0-10 connections)
- Automatic connection health checks
- Graceful connection disposal

**Query Optimization:**
- 30-second timeout encourages efficient queries
- Row limit (1000 default) prevents large result sets
- Response size limit (10MB) prevents memory issues
- Recommends using TOP, WHERE, and ORDER BY clauses

**Result Formatting:**
- Markdown formatting is client-side only
- No additional server load
- Efficient string building
- Minimal memory overhead
