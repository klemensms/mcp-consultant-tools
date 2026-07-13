# Azure SQL Package Guide

## Overview

Azure SQL Database integration with read-only queries and optional write operations behind feature flags.

- **Tools:** 40 tools (29 read-only + 11 write), 3 prompts. `sql-execute-unrestricted` is conditionally registered on top (41 with `SQL_ENABLE_UNRESTRICTED=true`).
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
```

Single-server mode reads only server, port, database, username, and password — SQL authentication only. **Azure AD authentication** is configured **per server, inside the `AZURE_SQL_SERVERS` JSON** (not via top-level env vars): add `useAzureAd: true` plus `azureAdClientId` / `azureAdClientSecret` / `azureAdTenantId` to the server entry.

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

# Index creation
SQL_ENABLE_INDEX_CREATE=true   # CREATE NONCLUSTERED INDEX on unindexed FK columns

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
- `sql-list-views`, `sql-list-sprocs`, `sql-list-triggers`, `sql-list-functions` - List database objects
- `sql-get-obj-def` - Get SQL definition of any object
- `sql-test-connection` - Test database connectivity

**Query Store Diagnostics (read-only, no feature flag; require Query Store ON + `VIEW DATABASE STATE`):**
- `sql-get-top-waits` - Top 20 wait categories over the last 7 days
- `sql-find-query-in-store` - Search Query Store by query text; returns the `queryId` the next two tools need
- `sql-get-query-wait-stats` - Wait breakdown over time for one `queryId`
- `sql-get-cpu-intensive-queries` - Top CPU consumers, grouped by query hash (default: last 24h, top 15)
- `sql-get-failed-queries` - Recent exception/timeout queries (default: top 50)
- `sql-get-query-plan` - XML execution plan(s) for one `queryId` (can exceed 1 MB)

When Query Store is off these tools fail with an actionable message rather than returning an empty result — the `sys.query_store_*` views return zero rows when disabled, which would otherwise read as a healthy database.

**Session Diagnostics (read-only, no feature flag; require `VIEW SERVER STATE` / `VIEW DATABASE STATE`):**
- `sql-get-blocking-chains` - Live blocking hierarchy, head blockers and blocked sessions
- `sql-get-executing-requests` - Currently running queries with live CPU/read stats; `includePlan` attaches plans
- `sql-get-deadlock-graphs` - Recent deadlocks from `system_health` XEvents — **not supported on Azure SQL Database**
- `sql-get-long-running-transactions` - Open user transactions past a threshold (default 30s)

**Space Diagnostics (read-only, no feature flag):**
- `sql-get-database-space` - File sizes, used/free, growth settings
- `sql-get-table-space` - Largest user tables by reserved space (default top 50)
- `sql-get-tempdb-space` - TempDB file breakdown (version store / user / internal objects)
- `sql-get-tempdb-session-usage` - Sessions consuming TempDB, ranked by net allocation

These eight read DMVs, **not** Query Store — do not reuse `assertQueryStoreEnabled()` for them. They need no proactive gate at all: an unauthorised DMV read raises a SQL error rather than returning zero rows, so an empty result genuinely means "nothing to report". The one exception is `sql-get-deadlock-graphs`, which probes `SERVERPROPERTY('EngineEdition')` and refuses on Azure SQL Database (edition `5`), where the `system_health` session does not exist.

The two TempDB tools always describe the resolved **connection's** TempDB; `database` selects the pool, not the inspected database. They reach TempDB via three-part name (`tempdb.sys.*`), which works on both platforms.

**Index Health (read-only, no feature flag; DMV grant as above plus `VIEW DEFINITION`):**
- `sql-get-disabled-indexes` - Disabled indexes, their key columns, and rebuild DDL **as text** (never executed)
- `sql-get-missing-fk-indexes` - Foreign-key columns with no index leading on them; the dry run for `sql-create-fk-indexes`
- `sql-get-index-usage-stats` - Seeks/scans/lookups/updates per index, least-read first (default top 100)

`sql-get-index-usage-stats` guards three traps in `sys.dm_db_index_usage_stats`, and its result shape exists to make them visible:
- The counters **reset** on engine restart, and on database detach / offline / AUTO_CLOSE. `summary.statsWindowHours` (computed server-side via `DATEDIFF`, so no timezone skew) reports how long they have accumulated. A restart an hour ago makes every index look dormant.
- A never-used index has **no row** in the DMV, not a row of zeros. Hence the LEFT JOIN and `hasUsageData`. `isUnused` deliberately requires `hasUsageData` **and** `userUpdates > 0` — the engine maintains the index on every write and nothing reads it. An index with no row has seen no activity of any kind: absence of evidence, not evidence of disuse.
- The DMV covers neither memory-optimized nor spatial indexes, so both are excluded rather than reported as unused.

`sql-get-missing-fk-indexes` evaluates each FK column separately, so a composite foreign key reports its columns one by one. "Missing" means no index has that column as its **leading** key — an FK column at position 2 of a composite index cannot serve the lookup.

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
- `sql-create-fk-indexes` - Create `IX_<table>_<column>` on every FK column lacking a leading-key index; returns one row per attempt (created / skipped / failed with its error)
- `sql-execute-unrestricted` - Execute any T-SQL without restrictions (conditionally registered, hidden when flag is off)

`sql-create-fk-indexes` is additive (`destructiveHint: false`, like `sql-manage-view`) and stays visible when its flag is off, failing with an explicit message. `sql-execute-unrestricted` is the deliberate exception that hides. Each `CREATE INDEX` takes a schema lock and can run for minutes on a large table. Generated DDL is assembled with `QUOTENAME()` — catalog names may legally contain `]`, and bracket concatenation would let one break out of the identifier.

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
# List configured servers/databases and test connectivity (connection group)
mcp-sql-cli connection list-servers
mcp-sql-cli connection test --server-id prod-sql --database AppDB

# Execute read-only query (server/database are -s/-d options)
mcp-sql-cli query execute "SELECT TOP 10 * FROM Users" --server-id prod-sql --database AppDB

# List tables
mcp-sql-cli query list-tables --server-id prod-sql --database AppDB

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

# Session diagnostics (read-only; requires VIEW SERVER STATE / VIEW DATABASE STATE)
mcp-sql-cli session get-blocking-chains
mcp-sql-cli session get-executing-requests --include-plan
mcp-sql-cli session get-deadlock-graphs --limit 5
mcp-sql-cli session get-long-running-transactions --threshold-seconds 300

# Space diagnostics (read-only)
mcp-sql-cli space get-database-space
mcp-sql-cli space get-table-space --top-n 10
mcp-sql-cli space get-tempdb-space
mcp-sql-cli space get-tempdb-session-usage --top-n 10

# Index health (read-only)
mcp-sql-cli index get-disabled-indexes
mcp-sql-cli index get-missing-fk-indexes
mcp-sql-cli index get-index-usage-stats --top-n 25

# Create the missing FK indexes (requires SQL_ENABLE_INDEX_CREATE=true)
mcp-sql-cli index create-fk-indexes
```
