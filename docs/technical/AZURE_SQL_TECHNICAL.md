# Azure SQL Database - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/AZURE_SQL.md -->

<overview>

The Azure SQL Database integration provides access to Azure SQL Database and SQL Server through the `mssql` library. Read-only operations are always available. Write operations (view management, stored procedure management/execution, and DML) are gated behind per-operation feature flags, all disabled by default.

**Package:** `@mcp-consultant-tools/azure-sql`
**Binaries:** `mcp-sql` (MCP server), `mcp-sql-cli` (CLI)
**Total tools:** 22 (11 read-only + 10 write operations + 1 conditionally registered)
**Prompts:** 3

</overview>

<architecture>

## Architecture

**Service classes:**
- `ConnectionService` — manages connection pools, server/database resolution, credential handling
- `QueryService` — validates and executes SELECT queries, schema exploration queries
- `WriteService` — handles write operations (views, stored procedures, DML) behind feature flags

All services share connection pooling through `ConnectionService`. The `ServiceContext` interface exposes lazy getters for all three services plus 8 feature-flag guard functions.

**Source layout:**
```
packages/azure-sql/src/
  index.ts                        # MCP server entry + registerAzureSqlTools()
  context-factory.ts              # Shared createServiceContext() for MCP + CLI
  types.ts                        # ServiceContext interface
  tool-examples.ts                # descWithExamples helper + domain examples
  cli.ts                          # CLI entry point
  services/
    connection-service.ts         # ConnectionService, all config interfaces
    query-service.ts              # QueryService, schema/query types
    write-service.ts              # WriteService, DML + DDL operations
  tools/
    connection-tools.ts           # sql-list-servers, sql-list-databases, sql-test-connection
    query-tools.ts                # sql-list-tables, sql-list-views, sql-list-stored-procedures,
                                  # sql-list-triggers, sql-list-functions, sql-get-table-schema,
                                  # sql-get-object-definition, sql-execute-query
    view-tools.ts                 # sql-manage-view, sql-deploy-view-file, sql-drop-view
    sproc-tools.ts                # sql-manage-sproc, sql-deploy-sproc-file, sql-drop-sproc, sql-execute-sproc
    crud-tools.ts                 # sql-insert-records, sql-update-records, sql-delete-records
    unrestricted-tools.ts         # sql-execute-unrestricted (conditionally registered)
  prompts/
    templates.ts                  # sql-database-overview, sql-table-details, sql-query-results
  cli/
    output.ts                     # Cache dir: .mcp-sql-cache
    commands/
      connection-commands.ts
      query-commands.ts
      view-commands.ts
      sproc-commands.ts
      crud-commands.ts
      unrestricted-commands.ts
```

</architecture>

<configuration>

## Configuration

<configuration-modes>

### Configuration Modes

The server supports two mutually exclusive modes, checked in this order:

**Mode 1: Multi-server (`AZURE_SQL_SERVERS`)** — recommended for production.

```bash
AZURE_SQL_SERVERS='[
  {
    "id": "prod-sql",
    "name": "Production SQL Server",
    "server": "prod-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [
      {"name": "AppDB", "active": true, "description": "Main application DB"},
      {"name": "AnalyticsDB", "active": true}
    ],
    "username": "mcp_readonly",
    "password": "SecurePassword123!"
  },
  {
    "id": "dev-sql",
    "name": "Development SQL Server",
    "server": "dev-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [],
    "useAzureAd": true,
    "azureAdClientId": "client-id",
    "azureAdClientSecret": "client-secret",
    "azureAdTenantId": "tenant-id"
  }
]'
```

Key behaviors:
- `databases: []` (empty array) — triggers discovery mode; `sql-list-databases` queries `sys.databases` and any database name may be used as a parameter
- `active: false` on a server or database — tool calls against that target throw an error with a clear message
- Per-server authentication: each server entry can independently use SQL auth or Azure AD
- Pool key format: `"serverId:database"` (e.g., `"prod-sql:AppDB"`)

**Mode 2: Single-server (legacy)** — backward-compatible, creates a single resource entry with `id: "default"`.

```bash
AZURE_SQL_SERVER=myserver.database.windows.net
AZURE_SQL_DATABASE=mydatabase
AZURE_SQL_USERNAME=mcp_readonly
AZURE_SQL_PASSWORD=SecurePassword123!
```

</configuration-modes>

<environment-variables>

### Environment Variables

**Server selection (required — one mode only):**

| Variable | Description |
|----------|-------------|
| `AZURE_SQL_SERVERS` | JSON array of server resources (multi-server mode) |
| `AZURE_SQL_SERVER` | Hostname (single-server mode) |
| `AZURE_SQL_DATABASE` | Database name (single-server mode) |
| `AZURE_SQL_USERNAME` | SQL auth username (single-server mode) |
| `AZURE_SQL_PASSWORD` | SQL auth password (single-server mode) |

**Azure AD authentication (single-server mode):**

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_SQL_USE_AZURE_AD` | `false` | Enable Azure AD authentication |
| `AZURE_SQL_CLIENT_ID` | — | Service principal client ID |
| `AZURE_SQL_CLIENT_SECRET` | — | Service principal client secret |
| `AZURE_SQL_TENANT_ID` | — | Azure AD tenant ID |

**Optional global settings:**

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_SQL_PORT` | `1433` | SQL Server port |
| `AZURE_SQL_QUERY_TIMEOUT` | `30000` | Query timeout in milliseconds |
| `AZURE_SQL_MAX_RESULT_ROWS` | `1000` | Maximum rows returned per query |
| `AZURE_SQL_MAX_RESPONSE_SIZE_MB` | `10` | Maximum JSON response size in MB (applied after row truncation) |
| `AZURE_SQL_CONNECTION_TIMEOUT` | `15000` | Connection timeout in milliseconds |
| `AZURE_SQL_POOL_MIN` | `0` | Minimum pool connections per database |
| `AZURE_SQL_POOL_MAX` | `10` | Maximum pool connections per database |

**Write operation feature flags (all default to `false`):**

| Variable | Operation | Tool |
|----------|-----------|------|
| `SQL_ENABLE_VIEW_MANAGE` | `CREATE OR ALTER VIEW` | `sql-manage-view`, `sql-deploy-view-file` |
| `SQL_ENABLE_VIEW_DROP` | `DROP VIEW IF EXISTS` | `sql-drop-view` |
| `SQL_ENABLE_SPROC_MANAGE` | `CREATE OR ALTER PROCEDURE` | `sql-manage-sproc`, `sql-deploy-sproc-file` |
| `SQL_ENABLE_SPROC_DROP` | `DROP PROCEDURE IF EXISTS` | `sql-drop-sproc` |
| `SQL_ENABLE_SPROC_EXECUTE` | `EXEC procedure` | `sql-execute-sproc` |
| `SQL_ENABLE_INSERT` | `INSERT` statement | `sql-insert-records` |
| `SQL_ENABLE_UPDATE` | `UPDATE` statement | `sql-update-records` |
| `SQL_ENABLE_DELETE` | `DELETE` statement (WHERE required) | `sql-delete-records` |
| `SQL_ENABLE_UNRESTRICTED` | Any T-SQL without restrictions (break glass) | `sql-execute-unrestricted` (tool hidden when `false`) |

</environment-variables>

<database-permissions>

### Required Database Permissions

For read-only access (minimum required):
```sql
ALTER ROLE db_datareader ADD MEMBER [mcp_readonly];
GRANT VIEW DEFINITION TO [mcp_readonly];
```

For write operations, grant additional permissions as needed for the specific operations enabled.

</database-permissions>

</configuration>

<tool-reference>

## Tool Reference

### Server and Database Discovery

<tool name="sql-list-servers">

**`sql-list-servers`** — List all configured SQL servers from `AZURE_SQL_SERVERS` with active/inactive status, database count, and authentication method. Takes no parameters.

Returns: `id`, `name`, `server`, `port`, `active`, `databaseCount`, `authMethod` (`SQL` | `Azure AD`), `description`.

</tool>

<tool name="sql-list-databases">

**`sql-list-databases`** — List databases for a given server.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID from `sql-list-servers`. Omit to use default. |

If `databases: []` was configured for the server (discovery mode), this queries `sys.databases` filtering out system databases (database_id > 4). Otherwise, returns the configured list.

</tool>

<tool name="sql-test-connection">

**`sql-test-connection`** — Test connectivity and return server information.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |

Returns: `connected`, `server`, `database`, `sqlVersion`, `currentDatabase`, `loginName`, `userName`, and `error` on failure.

</tool>

### Schema Exploration

<tool name="sql-list-tables">

**`sql-list-tables`** — List all user tables with row counts and storage sizes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |

Returns: `schemaName`, `tableName`, `rowCount`, `sizeMB` per table. Queries `INFORMATION_SCHEMA.TABLES` joined with `sys.tables`, `sys.partitions`, and `sys.allocation_units` for size data.

</tool>

<tool name="sql-list-views">

**`sql-list-views`** — List all views with their definitions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |

Returns: `schemaName`, `viewName`, `definition` per view. Queries `INFORMATION_SCHEMA.VIEWS` excluding `sys` schema.

</tool>

<tool name="sql-list-stored-procedures">

**`sql-list-stored-procedures`** — List all stored procedures with creation and modification dates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |

Returns: `schemaName`, `procedureName`, `createdDate`, `modifiedDate`. Queries `INFORMATION_SCHEMA.ROUTINES` where `ROUTINE_TYPE = 'PROCEDURE'`.

</tool>

<tool name="sql-list-triggers">

**`sql-list-triggers`** — List all triggers with event types and enabled/disabled status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |

Returns: `schemaName`, `triggerName`, `objectName` (parent table), `triggerEvent` (`INSERT`|`UPDATE`|`DELETE`|`UNKNOWN`), `isDisabled`, `createdDate`, `modifiedDate`. Queries `sys.triggers` joined with `sys.objects` and `sys.schemas`.

</tool>

<tool name="sql-list-functions">

**`sql-list-functions`** — List all user-defined functions with return types.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |

Returns: `schemaName`, `functionName`, `returnType`, `createdDate`, `modifiedDate`. Queries `INFORMATION_SCHEMA.ROUTINES` where `ROUTINE_TYPE = 'FUNCTION'`.

</tool>

<tool name="sql-get-table-schema">

**`sql-get-table-schema`** — Get complete table schema: columns, indexes, and foreign keys.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |
| `schemaName` | string | Yes | Schema name (e.g., `dbo`) |
| `tableName` | string | Yes | Table name |

Returns structured object with:
- `columns`: `columnName`, `dataType`, `maxLength`, `isNullable`, `defaultValue`, `isIdentity`
- `indexes`: `indexName`, `indexType`, `isUnique`, `isPrimaryKey`, `columns`
- `foreignKeys`: `foreignKeyName`, `schemaName`, `tableName`, `columnName`, `referencedSchema`, `referencedTable`, `referencedColumn`

Verifies table existence before querying; throws if not found with suggestion to use `sql-list-tables`.

</tool>

<tool name="sql-get-object-definition">

**`sql-get-object-definition`** — Get the SQL definition (source code) for views, stored procedures, functions, or triggers.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |
| `schemaName` | string | Yes | Schema name |
| `objectName` | string | Yes | Object name |
| `objectType` | enum | Yes | `VIEW`, `PROCEDURE`, `FUNCTION`, or `TRIGGER` |

Queries `sys.objects` + `OBJECT_DEFINITION()`. Returns `objectName`, `schemaName`, `objectType`, `createdDate`, `modifiedDate`, `definition`.

</tool>

### Query Execution

<tool name="sql-execute-query">

**`sql-execute-query`** — Execute a SELECT query with multi-layer security validation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |
| `query` | string | Yes | SELECT query to execute |

**Validation pipeline (before execution):**
1. Strip SQL comments (single-line `--` and multi-line `/* */`) to prevent comment-hiding attacks
2. Normalize whitespace
3. Verify query starts with `SELECT` after cleaning
4. Check against dangerous keyword patterns with word-boundary detection (`\b`):
   - `insert|update|delete|merge` — write operations
   - `drop|create|alter|truncate` — schema modifications
   - `exec|execute|sp_executesql` — command execution
   - `xp_*|sp_*` — system stored procedures
   - `grant|revoke|deny` — permission changes
   - `into` — SELECT INTO
   - `openquery|openrowset|opendatasource` — linked server queries

**Result limits:**
- Row limit: `AZURE_SQL_MAX_RESULT_ROWS` (default 1000). Rows are sliced first; `truncated: true` is set on the response.
- Size limit: `AZURE_SQL_MAX_RESPONSE_SIZE_MB` (default 10). Applied **after** row truncation. Throws if JSON of the truncated rows exceeds the limit.
- Timeout: `AZURE_SQL_QUERY_TIMEOUT` (default 30 seconds).

All executions are audit-logged with operation, success/failure, row count, truncation status, and execution time.

Returns: `columns`, `rows`, `rowCount`, `truncated`.

</tool>

### Write Operations (Feature-Flag Gated)

All write tools call a guard function before executing. If the corresponding env var is not `"true"`, the tool throws an error listing the exact variable name to set.

<tool name="sql-manage-view">

**`sql-manage-view`** — Create or alter a view. Requires `SQL_ENABLE_VIEW_MANAGE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | Yes | Server ID |
| `database` | string | Yes | Database name |
| `schemaName` | string | Yes | Schema name (validated against `^[a-zA-Z_][a-zA-Z0-9_]*$`) |
| `viewName` | string | Yes | View name (validated against identifier regex) |
| `selectBody` | string | Yes | The SELECT statement body (without `AS`) |

Executes: `CREATE OR ALTER VIEW [schema].[name] AS {selectBody}`. Audit-logged as `CREATE` operation.

</tool>

<tool name="sql-deploy-view-file">

**`sql-deploy-view-file`** — Deploy a SQL view from a local `.sql` file. Requires `SQL_ENABLE_VIEW_MANAGE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | string | Yes | Path to a `.sql` file containing a complete `CREATE OR ALTER VIEW` statement |
| `serverId` | string | No | Server ID (omit for default) |
| `database` | string | No | Database name (omit for default) |

Reads the file and executes its contents as-is against the database. Use this instead of `sql-manage-view` when the view exists as a local file — preserves exact formatting, comments, and avoids agent rewriting. The file must start with `CREATE OR ALTER VIEW` (leading SQL comments are allowed). View name is extracted from the SQL for audit logging. Audit-logged as `CREATE` operation.

Validations:
- File must have `.sql` extension
- File must exist and be non-empty
- Content must begin with `CREATE OR ALTER VIEW` (after stripping comments)

</tool>

<tool name="sql-drop-view">

**`sql-drop-view`** — Drop a view if it exists. Requires `SQL_ENABLE_VIEW_DROP=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | Yes | Server ID |
| `database` | string | Yes | Database name |
| `schemaName` | string | Yes | Schema name (identifier-validated) |
| `viewName` | string | Yes | View name (identifier-validated) |

Executes: `DROP VIEW IF EXISTS [schema].[name]`. Audit-logged as `DELETE` operation. Does not fail if view does not exist.

</tool>

<tool name="sql-manage-sproc">

**`sql-manage-sproc`** — Create or alter a stored procedure. Requires `SQL_ENABLE_SPROC_MANAGE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | Yes | Server ID |
| `database` | string | Yes | Database name |
| `schemaName` | string | Yes | Schema name (identifier-validated) |
| `sprocName` | string | Yes | Procedure name (identifier-validated) |
| `definition` | string | Yes | Procedure body (the part after `CREATE OR ALTER PROCEDURE [name]`) |

Executes: `CREATE OR ALTER PROCEDURE [schema].[name] {definition}`. Audit-logged as `CREATE` operation.

</tool>

<tool name="sql-deploy-sproc-file">

**`sql-deploy-sproc-file`** — Deploy a stored procedure from a local `.sql` file. Requires `SQL_ENABLE_SPROC_MANAGE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | string | Yes | Path to a `.sql` file containing a complete `CREATE OR ALTER PROCEDURE` statement |
| `serverId` | string | No | Server ID (omit for default) |
| `database` | string | No | Database name (omit for default) |

Reads the file and executes its contents as-is against the database. Use this instead of `sql-manage-sproc` when the procedure exists as a local file — preserves exact formatting, comments, and avoids agent rewriting. The file must start with `CREATE OR ALTER PROCEDURE` (leading SQL comments are allowed). Procedure name is extracted from the SQL for audit logging. Audit-logged as `CREATE` operation.

Validations:
- File must have `.sql` extension
- File must exist and be non-empty
- Content must begin with `CREATE OR ALTER PROCEDURE` (after stripping comments)

</tool>

<tool name="sql-drop-sproc">

**`sql-drop-sproc`** — Drop a stored procedure if it exists. Requires `SQL_ENABLE_SPROC_DROP=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | Yes | Server ID |
| `database` | string | Yes | Database name |
| `schemaName` | string | Yes | Schema name (identifier-validated) |
| `sprocName` | string | Yes | Procedure name (identifier-validated) |

Executes: `DROP PROCEDURE IF EXISTS [schema].[name]`. Audit-logged as `DELETE` operation.

</tool>

<tool name="sql-execute-sproc">

**`sql-execute-sproc`** — Execute a stored procedure with optional parameters. Requires `SQL_ENABLE_SPROC_EXECUTE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | Yes | Server ID |
| `database` | string | Yes | Database name |
| `schemaName` | string | Yes | Schema name (identifier-validated) |
| `sprocName` | string | Yes | Procedure name (identifier-validated) |
| `parameters` | object | No | Key-value parameter map passed via `request.input()` |

Uses `mssql` library's `request.execute()` — not raw SQL interpolation. Parameters are bound via `request.input(key, value)` for safe parameter passing. Audit-logged as `READ` operation.

Returns: `rows`, `rowCount`, `returnValue`.

</tool>

<tool name="sql-insert-records">

**`sql-insert-records`** — Execute an INSERT statement. Requires `SQL_ENABLE_INSERT=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | Yes | Server ID |
| `database` | string | Yes | Database name |
| `query` | string | Yes | INSERT statement |

DML validation applied (see DML Validation section). Audit-logged as `CREATE` operation. Returns `success`, `message`, `rowsAffected`.

</tool>

<tool name="sql-update-records">

**`sql-update-records`** — Execute an UPDATE statement. Requires `SQL_ENABLE_UPDATE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | Yes | Server ID |
| `database` | string | Yes | Database name |
| `query` | string | Yes | UPDATE statement |

DML validation applied. Audit-logged as `UPDATE` operation. Returns `success`, `message`, `rowsAffected`.

</tool>

<tool name="sql-delete-records">

**`sql-delete-records`** — Execute a DELETE statement. Requires `SQL_ENABLE_DELETE=true`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | Yes | Server ID |
| `database` | string | Yes | Database name |
| `query` | string | Yes | DELETE statement (must include WHERE clause) |

DML validation applied plus a mandatory WHERE clause check. If no WHERE clause is detected after comment stripping, throws: `"DELETE queries must include a WHERE clause to prevent accidental full-table deletion. If you truly need to delete all rows, use DELETE FROM table WHERE 1=1."`. Audit-logged as `DELETE` operation.

</tool>

### Break-Glass Execution (Conditionally Registered)

<tool name="sql-execute-unrestricted">

**`sql-execute-unrestricted`** — Execute any T-SQL without restrictions. Requires `SQL_ENABLE_UNRESTRICTED=true`. **Conditionally registered** — this tool does not appear in the MCP tool list at all when the flag is off (unlike other write tools which are always visible but guard on call).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Server ID. Omit to use default. |
| `database` | string | No | Database name. Omit to use default. |
| `sql` | string | Yes | Any T-SQL to execute: DDL, DML, EXEC, multi-batch statements separated by GO |

**Use cases:** Incident response, environment resets, one-off schema migrations, truncating tables, running system stored procedures, multi-step scripts with `GO` batch separators.

**Timeout:** Governed by the pool-level `AZURE_SQL_QUERY_TIMEOUT` setting (default 30 seconds). There is no per-call timeout override.

**No validation applied.** Unlike `sql-execute-query` and the DML tools, no keyword blocklist or pattern checks are run. The SQL is executed as-is.

**GO batch splitting:** Input is split on lines matching `^\s*GO\s*$` (case-insensitive). Each batch executes sequentially. If any batch fails, execution stops and results from completed batches plus the error are returned.

**Audit logging:** Each batch is individually audit-logged with an auto-detected operation type (`READ` for SELECT, `CREATE` for INSERT/CREATE, `UPDATE` for UPDATE/ALTER/EXEC, `DELETE` for DELETE/DROP/TRUNCATE).

**Result set capture:** For batches that return rows (SELECT-like), the first recordset is included. Multi-recordset batches (e.g., `SELECT 1; SELECT 2` in a single batch) only capture the first recordset — split with GO if all results are needed.

Returns per-batch results:
```typescript
{
  batches: Array<{
    batchIndex: number;
    sql: string;           // first 200 chars
    success: boolean;
    rowsAffected?: number;
    resultSet?: any[];     // if SELECT-like
    error?: string;        // if failed
  }>;
  totalBatches: number;
  completedBatches: number;
}
```

</tool>

</tool-reference>

<prompts-reference>

## Prompts Reference

<prompt name="sql-database-overview">

**`sql-database-overview`** — Comprehensive database overview.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Omit to use default server |
| `database` | string | No | Omit to use default database |

Calls all five listing methods in parallel (`listTables`, `listViews`, `listStoredProcedures`, `listTriggers`, `listFunctions`) and formats results via `formatDatabaseOverview()`. Returns a single markdown document with all database object counts and names.

</prompt>

<prompt name="sql-table-details">

**`sql-table-details`** — Detailed report for a specific table.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Omit to use default server |
| `database` | string | No | Omit to use default database |
| `schemaName` | string | Yes | Schema name (e.g., `dbo`) |
| `tableName` | string | Yes | Table name |

Calls `getTableSchema()` and formats via `formatTableSchemaAsMarkdown()`. Appends a sample query: `SELECT TOP 100 * FROM {schema}.{table}`.

</prompt>

<prompt name="sql-query-results">

**`sql-query-results`** — Execute a SELECT query and return formatted results.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `serverId` | string | No | Omit to use default server |
| `database` | string | No | Omit to use default database |
| `query` | string | Yes | SELECT query to execute |

Calls `executeSelectQuery()` (same security validation as `sql-execute-query`). Returns query text, results formatted as markdown table via `formatSqlResultsAsMarkdown()`, row count, and truncation status.

</prompt>

</prompts-reference>

<security>

## Security

<query-safety>

### Query Safety (sql-execute-query)

Multi-layer validation for read-only queries:

1. **Comment stripping** — `--` single-line and `/* */` multi-line comments removed before validation
2. **SELECT enforcement** — cleaned query must start with `select`
3. **Keyword blocklist** with word-boundary regex (`\b`):
   - `insert|update|delete|merge` — write operations
   - `drop|create|alter|truncate` — schema modifications
   - `exec|execute|sp_executesql` — command execution
   - `xp_*|sp_*` — system stored procedures
   - `grant|revoke|deny` — permission changes
   - `into` — SELECT INTO data exfiltration
   - `openquery|openrowset|opendatasource` — linked server queries
4. **Result size limits** — 1000 rows (configurable), 10 MB (hardcoded)
5. **Timeout enforcement** — 30 seconds (configurable)
6. **Audit logging** — every execution logged regardless of outcome

</query-safety>

<dml-validation>

### DML Validation (Write Operations)

The `WriteService.validateDmlQuery()` method is applied to INSERT, UPDATE, and DELETE queries:

1. Strip comments and normalize whitespace
2. Verify query starts with expected keyword (`INSERT`, `UPDATE`, or `DELETE`)
3. Check against dangerous pattern list:
   - `drop|create|alter|truncate` — schema modifications
   - `exec|execute|sp_executesql` — command execution
   - `xp_\w+` — xp_ system procedures
   - `sp_\w+` — sp_ system procedures
   - `grant|revoke|deny` — permission changes
   - `openquery|openrowset|opendatasource` — linked server queries

**Additional DELETE safety:** After DML validation, checks for presence of `where` in cleaned query. Rejects without WHERE clause.

</dml-validation>

<identifier-validation>

### Identifier Validation

All schema names and object names passed to view/sproc management tools are validated:

```typescript
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
```

Prevents SQL injection through object names. Object names are then bracketed in the final SQL: `[schemaName].[objectName]`.

</identifier-validation>

<credential-safety>

### Credential Safety

`ConnectionService.sanitizeErrorMessage()` removes credentials from all error messages before they are returned to the caller:
- Removes `password=...` (case-insensitive)
- Removes `pwd=...`
- Removes `clientSecret=...`
- Removes `Authentication=ActiveDirectoryServicePrincipal;...;`

Credentials are never logged. Connection errors include sanitized messages only.

</credential-safety>

<audit-logging>

### Audit Logging

All tool executions (read and write) are logged via `auditLogger` from `@mcp-consultant-tools/core`:
- `sql-execute-query`: logged on both success and failure with row count and truncation status
- Write operations: logged with operation type (`CREATE`, `UPDATE`, `DELETE`, `READ` for sproc execution), component type (`View`, `StoredProcedure`, `Query`), component name (`serverId/database/objectName`), execution time
- Query text truncated to 500 characters in audit log

</audit-logging>

</security>

<service-implementation>

## Service Implementation

<connection-service>

### ConnectionService

**File:** `packages/azure-sql/src/services/connection-service.ts`

Manages connection pools using `mssql`:

```typescript
// Pool key format
const poolKey = `${serverId}:${database}`; // e.g., "prod-sql:AppDB"

// Pool config
const poolConfig: sql.config = {
  server: server.server,
  database: database,
  port: server.port,
  connectionTimeout: this.config.connectionTimeout,    // default 15000ms
  requestTimeout: this.config.queryTimeout,             // default 30000ms
  pool: {
    min: this.config.poolMin,                           // default 0
    max: this.config.poolMax,                           // default 10
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
};
```

**Azure AD authentication config (when `useAzureAd: true`):**
```typescript
poolConfig.authentication = {
  type: 'azure-active-directory-service-principal-secret',
  options: {
    clientId: server.azureAdClientId,
    clientSecret: server.azureAdClientSecret,
    tenantId: server.azureAdTenantId,
  },
};
```

**Health-checked pool reuse:** Before returning an existing pool, checks `pool.connected && pool.healthy`. Closes and recreates unhealthy pools.

**Server/database resolution:** `resolveServerId()` and `resolveDatabase()` provide default resolution — if a single active server/database is configured, tools can omit these parameters. Tool descriptions warn: "OMIT to use default. DO NOT GUESS."

</connection-service>

<query-service>

### QueryService

**File:** `packages/azure-sql/src/services/query-service.ts`

Internal `executeQuery<T>()` method:
- Gets pool from `ConnectionService`
- Supports parameterized queries via `request.input()`
- Checks JSON size of results against 10 MB limit before returning
- Applies row limit (`maxResultRows`) via array slicing with `truncated` flag
- Handles timeout and permission errors with specific messages

Schema exploration methods use `INFORMATION_SCHEMA` views and `sys.*` catalog views. `getTableSchema()` runs 3 queries in parallel (columns, indexes, foreign keys) with the index and FK queries silently catching errors (returns empty arrays on failure — some SQL editions may not support all catalog views).

</query-service>

<write-service>

### WriteService

**File:** `packages/azure-sql/src/services/write-service.ts`

Handles view management, stored procedure management/execution, and DML. All methods:
1. Validate identifiers (schema/object names)
2. Start audit timer
3. Execute SQL via `ConnectionService.getPool()`
4. Audit log success or failure
5. Sanitize errors before re-throwing

`executeSproc()` uses `request.execute(fullName)` (mssql's stored procedure execution API) rather than raw SQL, with parameters bound via `request.input()`.

</write-service>

</service-implementation>

<connection-pooling>

## Connection Pooling

- **Architecture:** Separate `mssql.ConnectionPool` per `serverId:database` combination stored in `Map<string, ConnectionPool>`
- **Pool lifecycle:** Created on first access, reused on subsequent calls, health-checked before reuse, closed on SIGINT/SIGTERM
- **Shutdown handlers:** Both SIGINT and SIGTERM handlers call `connectionService.close()` which iterates all pools and closes them gracefully
- **Pool size:** Configurable via `AZURE_SQL_POOL_MIN` (default 0) and `AZURE_SQL_POOL_MAX` (default 10)
- **Idle timeout:** 30 seconds (hardcoded in pool config)

</connection-pooling>

<formatting-utilities>

## Formatting Utilities

**File:** `packages/azure-sql/src/utils/sql-formatters.ts`

Used by prompts to format raw query results into markdown:

| Function | Purpose |
|----------|---------|
| `formatSqlResultsAsMarkdown()` | Convert query result rows/columns to markdown table |
| `formatTableList()` | Format table listing with row counts and sizes |
| `formatViewList()` | Format view listing |
| `formatProcedureList()` | Format stored procedure listing |
| `formatTriggerList()` | Format trigger listing with enabled/disabled status |
| `formatFunctionList()` | Format function listing |
| `formatTableSchemaAsMarkdown()` | Full table schema: columns, indexes, foreign keys |
| `formatDatabaseOverview()` | Combined overview of all object types |

Example output from `formatTableList()`:
```markdown
## Database Tables (45 total)

| Schema | Table Name   | Rows  | Size (MB) |
|--------|--------------|-------|-----------|
| dbo    | OrderHistory | 1.2M  | 450.00    |
| dbo    | Users        | 250K  | 180.00    |
```

</formatting-utilities>

<error-handling>

## Error Handling

All tool handlers wrap service calls in try/catch and return `isError: true` on failure.

**Connection errors:**
- Server not found: lists available server IDs and suggests using `sql-list-servers`
- Inactive server/database: tells user to set `active: true` in config
- Connection failure: sanitized error message (credentials removed)

**Query errors:**
- Non-SELECT query: "Only SELECT queries are allowed. Write operations (INSERT, UPDATE, DELETE, etc.) are not permitted."
- Dangerous keyword blocked: "Query contains forbidden keyword or pattern ({category}). Only SELECT queries are allowed for investigation purposes."
- Timeout: "Query timeout exceeded ({ms}ms). Try simplifying your query or adding WHERE clause filters."
- Permission denied: "Permission denied. Ensure the database user has SELECT permissions on the requested objects."
- Result too large: "Query results too large ({MB} MB after row truncation to {N} rows). Maximum allowed: {limit} MB. Add WHERE clause, SELECT specific columns, or increase AZURE_SQL_MAX_RESPONSE_SIZE_MB to raise the limit."

**Write validation errors:**
- Wrong starting keyword: "Query must start with {keyword}. Got: '...'"
- Forbidden pattern: "Query contains forbidden pattern ({name}). Only {keyword} statements are allowed in this operation."
- DELETE without WHERE: "DELETE queries must include a WHERE clause to prevent accidental full-table deletion. If you truly need to delete all rows, use DELETE FROM table WHERE 1=1."
- Invalid identifier: "Invalid {label}: '{name}'. Only alphanumeric characters and underscores are allowed, and it must start with a letter or underscore."

**Feature flag errors:**
- Pattern: "View management is disabled. Set SQL_ENABLE_VIEW_MANAGE=true to enable CREATE OR ALTER VIEW."
- Same pattern for each of the 8 flags.

</error-handling>

<cli-architecture>

## CLI Architecture

The CLI reuses the same `ServiceContext` as the MCP server via `context-factory.ts`.

**Binary:** `mcp-sql-cli`
**Cache directory:** `.mcp-sql-cache/`

### Command Groups

| Group | Commands | Maps to Tools |
|-------|----------|--------------|
| `query` | `execute`, `tables`, `views`, `sprocs`, `triggers`, `functions`, `table-schema`, `object-def`, `list-servers`, `list-databases`, `test-connection` | All read-only tools |
| `view` | `manage`, `deploy`, `drop` | `sql-manage-view`, `sql-deploy-view-file`, `sql-drop-view` |
| `sproc` | `manage`, `deploy`, `drop`, `execute` | `sql-manage-sproc`, `sql-deploy-sproc-file`, `sql-drop-sproc`, `sql-execute-sproc` |
| `crud` | `insert`, `update`, `delete` | `sql-insert-records`, `sql-update-records`, `sql-delete-records` |
| `unrestricted` | `execute` | `sql-execute-unrestricted` (requires `SQL_ENABLE_UNRESTRICTED=true`) |

### Parameter Mapping

Required tool parameters (e.g., `serverId`, `database`, `query`) become positional CLI arguments. Optional parameters become `--flag` options. JSON object parameters (like `parameters` for `sql-execute-sproc`) are passed as JSON strings and parsed in the command handler.

### CLI Usage Examples

```bash
# Execute read-only query
mcp-sql-cli query execute prod-sql AppDB "SELECT TOP 10 * FROM Users"

# List tables
mcp-sql-cli query tables prod-sql AppDB

# Get table schema
mcp-sql-cli query table-schema prod-sql AppDB dbo Users

# Test connection
mcp-sql-cli query test-connection prod-sql AppDB

# View management (requires SQL_ENABLE_VIEW_MANAGE=true)
mcp-sql-cli view manage prod-sql AppDB dbo ActiveUsers "SELECT Id, Name FROM dbo.Users WHERE IsActive = 1"

# Drop a view (requires SQL_ENABLE_VIEW_DROP=true)
mcp-sql-cli view drop prod-sql AppDB dbo ActiveUsers

# Stored procedure management (requires SQL_ENABLE_SPROC_MANAGE=true)
mcp-sql-cli sproc manage prod-sql AppDB dbo GetActiveUsers "AS BEGIN SELECT * FROM dbo.Users WHERE IsActive = 1 END"

# Execute a stored procedure (requires SQL_ENABLE_SPROC_EXECUTE=true)
mcp-sql-cli sproc execute prod-sql AppDB dbo GetUserById -p '{"UserId": 42}'

# Insert records (requires SQL_ENABLE_INSERT=true)
mcp-sql-cli crud insert prod-sql AppDB "INSERT INTO dbo.Config (Key, Value) VALUES ('theme', 'dark')"

# Update records (requires SQL_ENABLE_UPDATE=true)
mcp-sql-cli crud update prod-sql AppDB "UPDATE dbo.Config SET Value = 'light' WHERE Key = 'theme'"

# Delete records (requires SQL_ENABLE_DELETE=true)
mcp-sql-cli crud delete prod-sql AppDB "DELETE FROM dbo.Config WHERE Key = 'theme'"

# Unrestricted execution (requires SQL_ENABLE_UNRESTRICTED=true)
mcp-sql-cli unrestricted execute "ALTER TABLE dbo.Users ADD LastLoginDate DATETIME2 NULL"
mcp-sql-cli unrestricted execute "EXEC sp_MSforeachtable 'TRUNCATE TABLE ?'"
mcp-sql-cli unrestricted execute "ALTER TABLE dbo.Users ADD LastLoginDate DATETIME2 NULL" --server-id prod-sql --database AppDB

# Global flags
mcp-sql-cli --json query tables prod-sql AppDB       # Raw JSON output
mcp-sql-cli --no-cache query tables prod-sql AppDB   # Skip cache
mcp-sql-cli --env-file .env.prod query tables prod-sql AppDB
```

</cli-architecture>

<use-cases>

## Use Cases

**Database investigation:**
- Explore unknown database schema for new projects
- Document database structure for team onboarding
- Investigate data issues without requiring write access
- Review stored procedures, triggers, and function logic

**Data analysis:**
- Ad-hoc SELECT queries for data investigation
- Verify data quality and integrity
- Extract data samples for reporting
- Troubleshoot application data issues

**Schema documentation:**
- Generate comprehensive database documentation via prompts
- Map table relationships through foreign key analysis
- Document indexes and constraints
- Review object definitions

**Write operations (when enabled):**
- Manage reporting views across multiple databases
- Deploy or update stored procedures
- Perform controlled data operations with full audit trail

</use-cases>

<performance>

## Performance

- **Connection reuse:** Pools are reused across tool calls within a session; first call per database incurs connection overhead
- **Query timeout:** 30 seconds default prevents runaway queries from consuming resources
- **Row limit:** 1000 rows default prevents accidentally large result sets; increase `AZURE_SQL_MAX_RESULT_ROWS` for bulk operations
- **Size limit:** 10 MB default cap (configurable via `AZURE_SQL_MAX_RESPONSE_SIZE_MB`) prevents memory exhaustion from wide result sets; applied after row truncation so `maxResultRows` takes effect first
- **Parallel prompt queries:** `sql-database-overview` prompt fetches all object types in parallel (`Promise.all`) for speed
- **No additional server load from formatting:** Markdown formatting is applied client-side after results are returned

</performance>
