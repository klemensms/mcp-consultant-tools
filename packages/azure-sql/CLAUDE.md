# Azure SQL Package Guide

## Overview

Azure SQL Database integration with read-only queries and optional write operations behind feature flags.

- **Tools:** 28 tools (18 read-only + 10 write), 3 prompts. `sql-execute-unrestricted` is conditionally registered on top (29 with `SQL_ENABLE_UNRESTRICTED=true`).
- **Authentication:** SQL Auth or Azure AD
- **Read-Only by default:** Write operations available behind per-operation feature flags

## Environment Configuration

### Multi-Server Configuration (Recommended)

```bash
AZURE_SQL_SERVERS='[
  {
    "id": "prod-sql",
    "name": "Production SQL Server",
    "server": "prod-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [
      {"name": "AppDB", "active": true},
      {"name": "AnalyticsDB", "active": true}
    ],
    "username": "mcp_readonly",
    "password": "SecurePassword123!",
    "useAzureAd": false
  }
]'
```

### Single-Server Configuration (Legacy)

```bash
AZURE_SQL_SERVER=myserver.database.windows.net
AZURE_SQL_DATABASE=mydatabase
AZURE_SQL_USERNAME=mcp_readonly
AZURE_SQL_PASSWORD=SecurePassword123!

# Azure AD auth
AZURE_SQL_USE_AZURE_AD=false
AZURE_SQL_CLIENT_ID=your-client-id
AZURE_SQL_CLIENT_SECRET=your-client-secret
AZURE_SQL_TENANT_ID=your-tenant-id
```

### Safety Limits

```bash
AZURE_SQL_QUERY_TIMEOUT=30000          # 30 seconds
AZURE_SQL_MAX_RESULT_ROWS=1000         # Row limit
AZURE_SQL_MAX_RESPONSE_SIZE_MB=10      # Max JSON response size in MB (default 10)
AZURE_SQL_CONNECTION_TIMEOUT=15000     # 15 seconds
AZURE_SQL_POOL_MAX=10                  # Max connections
```

### Feature Flags (Write Operations)

All write operations are disabled by default. Enable individually:

```bash
# View management
SQL_ENABLE_VIEW_MANAGE=true    # CREATE OR ALTER VIEW
SQL_ENABLE_VIEW_DROP=true      # DROP VIEW

# Stored procedure management
SQL_ENABLE_SPROC_MANAGE=true   # CREATE OR ALTER PROCEDURE
SQL_ENABLE_SPROC_DROP=true     # DROP PROCEDURE
SQL_ENABLE_SPROC_EXECUTE=true  # EXEC procedure

# Record CRUD
SQL_ENABLE_INSERT=true         # INSERT statements
SQL_ENABLE_UPDATE=true         # UPDATE statements
SQL_ENABLE_DELETE=true         # DELETE statements (requires WHERE clause)

# Unrestricted execution (break glass — tool hidden when off)
SQL_ENABLE_UNRESTRICTED=true  # Any T-SQL: DDL, DML, EXEC, multi-batch with GO
```

## Key Tools

**Read-Only (always available):**
- `sql-list-servers` - List configured servers
- `sql-list-databases` - List databases on server
- `sql-execute-query` - Execute read-only SELECT query
- `sql-get-table-schema` - Table structure
- `sql-list-tables` - Available tables
- `sql-list-views`, `sql-list-stored-procedures`, `sql-list-triggers`, `sql-list-functions` - List database objects
- `sql-get-object-definition` - Get SQL definition of any object
- `sql-test-connection` - Test database connectivity

**Query Store Diagnostics (read-only, no feature flag; require Query Store ON + `VIEW DATABASE STATE`):**
- `sql-get-top-waits` - Top 20 wait categories over the last 7 days
- `sql-find-query-in-store` - Search Query Store by query text; returns the `queryId` the next two tools need
- `sql-get-query-wait-stats` - Wait breakdown over time for one `queryId`
- `sql-get-cpu-intensive-queries` - Top CPU consumers, grouped by query hash (default: last 24h, top 15)
- `sql-get-failed-queries` - Recent exception/timeout queries (default: top 50)
- `sql-get-query-plan` - XML execution plan(s) for one `queryId` (can exceed 1 MB)

When Query Store is off these tools fail with an actionable message rather than returning an empty result — the `sys.query_store_*` views return zero rows when disabled, which would otherwise read as a healthy database.

**Write Operations (feature-flag gated):**
- `sql-manage-view` - Create or update a view
- `sql-deploy-view-file` - Deploy a view from a local .sql file
- `sql-drop-view` - Drop a view
- `sql-manage-sproc` - Create or update a stored procedure
- `sql-deploy-sproc-file` - Deploy a stored procedure from a local .sql file
- `sql-drop-sproc` - Drop a stored procedure
- `sql-execute-sproc` - Execute a stored procedure with parameters
- `sql-insert-records` - Execute INSERT
- `sql-update-records` - Execute UPDATE
- `sql-delete-records` - Execute DELETE (WHERE required)
- `sql-execute-unrestricted` - Execute any T-SQL without restrictions (conditionally registered, hidden when flag is off)

## Security

- Read-only by default; write operations require explicit feature flags
- All queries validated (DML validation, dangerous pattern detection)
- Identifier validation prevents SQL injection on object names
- DELETE queries require a WHERE clause
- Connection pooling per database
- Query timeout enforcement
- Result row limits
- Audit logging on all operations

## Reference

See `docs/technical/AZURE_SQL_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-sql-cli`

```bash
# Execute read-only query
mcp-sql-cli query execute prod-sql AppDB "SELECT TOP 10 * FROM Users"

# List tables
mcp-sql-cli query tables prod-sql AppDB

# View management (requires SQL_ENABLE_VIEW_MANAGE=true)
mcp-sql-cli view manage dbo MyView "SELECT Id, Name FROM dbo.Users WHERE IsActive = 1"

# Drop a view (requires SQL_ENABLE_VIEW_DROP=true)
mcp-sql-cli view drop dbo MyView

# Stored procedure management (requires SQL_ENABLE_SPROC_MANAGE=true)
mcp-sql-cli sproc manage dbo GetActiveUsers "AS BEGIN SELECT * FROM dbo.Users WHERE IsActive = 1 END"

# Deploy a view from file (requires SQL_ENABLE_VIEW_MANAGE=true)
mcp-sql-cli view deploy ./sql/vw_ActiveUsers.sql

# Deploy a stored procedure from file (requires SQL_ENABLE_SPROC_MANAGE=true)
mcp-sql-cli sproc deploy ./sql/usp_GetActiveUsers.sql

# Execute a stored procedure (requires SQL_ENABLE_SPROC_EXECUTE=true)
mcp-sql-cli sproc execute dbo GetUserById -p '{"UserId": 42}'

# Insert records (requires SQL_ENABLE_INSERT=true)
mcp-sql-cli crud insert "INSERT INTO dbo.Config (Key, Value) VALUES ('theme', 'dark')"

# Update records (requires SQL_ENABLE_UPDATE=true)
mcp-sql-cli crud update "UPDATE dbo.Config SET Value = 'light' WHERE Key = 'theme'"

# Delete records (requires SQL_ENABLE_DELETE=true)
mcp-sql-cli crud delete "DELETE FROM dbo.Config WHERE Key = 'theme'"

# Unrestricted execution (requires SQL_ENABLE_UNRESTRICTED=true)
mcp-sql-cli unrestricted execute "ALTER TABLE dbo.Users ADD LastLoginDate DATETIME2 NULL"
mcp-sql-cli unrestricted execute "EXEC sp_MSforeachtable 'TRUNCATE TABLE ?'"

# Query Store diagnostics (read-only; requires Query Store enabled)
mcp-sql-cli perf get-top-waits
mcp-sql-cli perf find-query-in-store "Orders"
mcp-sql-cli perf get-query-wait-stats 1234
mcp-sql-cli perf get-cpu-intensive-queries --hours 6 --limit 5
mcp-sql-cli perf get-failed-queries --limit 20
mcp-sql-cli perf get-query-plan 1234
```
