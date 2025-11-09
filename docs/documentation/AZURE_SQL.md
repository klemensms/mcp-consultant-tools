# Azure SQL Database Integration Documentation

Complete guide to using the Azure SQL Database integration with MCP Consultant Tools.

---

## Table of Contents

1. [Overview](#overview)
2. [Setup](#setup)
3. [Tools](#tools)
4. [Prompts](#prompts)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Azure SQL Database?

Azure SQL Database is a fully managed relational database service offering:
- **High availability** with 99.99% SLA
- **Automatic backups** with point-in-time restore
- **Built-in security** with encryption, firewall, and advanced threat protection
- **Scalability** from single database to elastic pools
- **Compatibility** with SQL Server

**Primary Use Case**: Read-only database investigation, schema exploration, and ad-hoc querying with comprehensive security controls.

### Key Features

**Read-Only by Design:**
- ✅ Only SELECT queries permitted
- ✅ Blocks INSERT, UPDATE, DELETE, DROP, EXEC, and other write operations
- ✅ Query validation with keyword blacklist
- ✅ Comprehensive security controls

**Safety Mechanisms:**
- 🔒 10MB response limit (configurable)
- 🔒 1000 row limit (configurable)
- 🔒 30-second query timeout (configurable)
- 🔒 Credential sanitization in error messages
- 🔒 Audit logging of all queries

**Connection Pooling:**
- Automatic connection management
- Health checks and reconnection
- Configurable pool size (default: 0-10 connections)
- Graceful pool disposal

**Schema Exploration:**
- List tables with row counts and sizes
- List views, stored procedures, triggers, functions
- Get comprehensive table schema (columns, indexes, foreign keys)
- Get SQL definitions for database objects

---

## Setup

### Prerequisites

1. **Azure SQL Database** or SQL Server
2. **Database firewall rule** allowing your IP address
3. **Read-only database user** (recommended) or Azure AD authentication
4. Server name, database name, authentication credentials

### Authentication Methods

**SQL Authentication (Username/Password)**
- ✅ Simple setup
- ✅ Standard SQL Server authentication
- ❌ Stored password (less secure than Azure AD)

**Azure AD Authentication (Service Principal)**
- ✅ Better security (token-based)
- ✅ No stored passwords
- ✅ Automatic token refresh
- ❌ More complex setup

### SQL Authentication Setup

#### Step 1: Create Read-Only Database User

Connect to your Azure SQL Database and execute:

```sql
-- Create login (server-level)
CREATE LOGIN mcp_readonly WITH PASSWORD = 'YourStrongPassword123!';

-- Switch to your database
USE YourDatabaseName;

-- Create user from login
CREATE USER mcp_readonly FOR LOGIN mcp_readonly;

-- Grant read permissions
ALTER ROLE db_datareader ADD MEMBER mcp_readonly;

-- Grant VIEW DEFINITION permission (for schema exploration)
GRANT VIEW DEFINITION TO mcp_readonly;

-- Optional: Grant specific table permissions instead of db_datareader
-- GRANT SELECT ON dbo.Users TO mcp_readonly;
-- GRANT SELECT ON dbo.Orders TO mcp_readonly;
```

#### Step 2: Configure Environment Variables

```bash
export AZURE_SQL_SERVER="your-server.database.windows.net"
export AZURE_SQL_DATABASE="YourDatabaseName"
export AZURE_SQL_PORT="1433"
export AZURE_SQL_USERNAME="mcp_readonly"
export AZURE_SQL_PASSWORD="YourStrongPassword123!"
export AZURE_SQL_USE_AZURE_AD="false"
```

### Azure AD Authentication Setup

#### Step 1: Create Service Principal

```bash
# Create service principal
az ad sp create-for-rbac --name "MCP-Consultant-Tools-SQL" --skip-assignment
```

#### Step 2: Assign Permissions in SQL Database

Connect to your Azure SQL Database as an Azure AD admin and execute:

```sql
-- Create user from Azure AD service principal
CREATE USER [MCP-Consultant-Tools-SQL] FROM EXTERNAL PROVIDER;

-- Grant read permissions
ALTER ROLE db_datareader ADD MEMBER [MCP-Consultant-Tools-SQL];

-- Grant VIEW DEFINITION permission
GRANT VIEW DEFINITION TO [MCP-Consultant-Tools-SQL];
```

#### Step 3: Configure Environment Variables

```bash
export AZURE_SQL_SERVER="your-server.database.windows.net"
export AZURE_SQL_DATABASE="YourDatabaseName"
export AZURE_SQL_PORT="1433"
export AZURE_SQL_USE_AZURE_AD="true"
export AZURE_SQL_CLIENT_ID="service-principal-client-id"
export AZURE_SQL_CLIENT_SECRET="service-principal-secret"
export AZURE_SQL_TENANT_ID="azure-tenant-id"
```

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `AZURE_SQL_SERVER` | Yes | SQL Server hostname (e.g., "server.database.windows.net") | - |
| `AZURE_SQL_DATABASE` | Yes | Database name | - |
| `AZURE_SQL_PORT` | No | SQL Server port | 1433 |
| `AZURE_SQL_USERNAME` | Yes (SQL Auth) | Database username | - |
| `AZURE_SQL_PASSWORD` | Yes (SQL Auth) | Database password | - |
| `AZURE_SQL_USE_AZURE_AD` | No | Use Azure AD authentication | "false" |
| `AZURE_SQL_CLIENT_ID` | Yes (Azure AD) | Service principal client ID | - |
| `AZURE_SQL_CLIENT_SECRET` | Yes (Azure AD) | Service principal client secret | - |
| `AZURE_SQL_TENANT_ID` | Yes (Azure AD) | Azure tenant ID | - |
| `AZURE_SQL_QUERY_TIMEOUT` | No | Query timeout in milliseconds | 30000 |
| `AZURE_SQL_MAX_RESULT_ROWS` | No | Maximum rows returned | 1000 |
| `AZURE_SQL_CONNECTION_TIMEOUT` | No | Connection timeout in milliseconds | 15000 |
| `AZURE_SQL_POOL_MIN` | No | Minimum connection pool size | 0 |
| `AZURE_SQL_POOL_MAX` | No | Maximum connection pool size | 10 |

---

## Tools

### Schema Exploration Tools

#### sql-test-connection

Test connectivity to the Azure SQL Database.

**Parameters:** None

**Returns:**
- `connected` (boolean): Connection status
- `sqlVersion` (string): SQL Server version
- `database` (string): Connected database name
- `user` (string): Current user (sanitized)
- `serverTime` (string): Server UTC time

**Use Cases:** Verify connectivity, check SQL version, troubleshoot connection issues

---

#### sql-list-tables

List all user tables with row counts and sizes.

**Parameters:** None

**Returns:**
Array of tables with:
- `schemaName`: Schema name (e.g., "dbo")
- `tableName`: Table name
- `rowCount`: Approximate row count
- `totalSpaceMB`: Total space in MB
- `dataSpaceMB`: Data space in MB
- `indexSpaceMB`: Index space in MB

**Use Cases:** Database inventory, identify large tables, understand schema structure

---

#### sql-list-views

List all database views with definitions.

**Parameters:** None

**Returns:**
Array of views with:
- `schemaName`: Schema name
- `viewName`: View name
- `definition`: View SQL definition

**Use Cases:** Explore views, understand data access patterns, document database logic

---

#### sql-list-stored-procedures

List all stored procedures.

**Parameters:** None

**Returns:**
Array of procedures with:
- `schemaName`: Schema name
- `procedureName`: Procedure name
- `definition`: Procedure SQL definition
- `createDate`: Creation date
- `modifyDate`: Last modification date

**Use Cases:** Inventory procedures, review procedure logic, find procedures by name

---

#### sql-list-triggers

List all database triggers with event types.

**Parameters:** None

**Returns:**
Array of triggers with:
- `schemaName`: Schema name
- `triggerName`: Trigger name
- `tableName`: Associated table name
- `eventType`: Trigger event (INSERT, UPDATE, DELETE)
- `isEnabled`: Enabled status
- `definition`: Trigger SQL definition

**Use Cases:** Audit automated operations, understand data modification logic, troubleshoot trigger conflicts

---

#### sql-list-functions

List all user-defined functions.

**Parameters:** None

**Returns:**
Array of functions with:
- `schemaName`: Schema name
- `functionName`: Function name
- `functionType`: Function type (Scalar, Table-valued, etc.)
- `returnType`: Return data type
- `definition`: Function SQL definition

**Use Cases:** Inventory functions, review calculation logic, document business rules

---

#### sql-get-table-schema

Get comprehensive schema details for a specific table.

**Parameters:**
- `schemaName` (required): Schema name (e.g., "dbo")
- `tableName` (required): Table name

**Returns:**
- `columns`: Column definitions with data types, nullability, defaults, identity
- `indexes`: Index definitions with columns, uniqueness, primary key status
- `foreignKeys`: Foreign key relationships with referenced tables and columns

**Example:**
```javascript
await mcpClient.invoke("sql-get-table-schema", {
  schemaName: "dbo",
  tableName: "Users"
});
```

**Use Cases:** Understand table structure, plan data queries, document relationships, troubleshoot data issues

---

#### sql-get-object-definition

Get SQL definition for views, stored procedures, functions, or triggers.

**Parameters:**
- `schemaName` (required): Schema name
- `objectName` (required): Object name
- `objectType` (required): "VIEW", "PROCEDURE", "FUNCTION", or "TRIGGER"

**Example:**
```javascript
await mcpClient.invoke("sql-get-object-definition", {
  schemaName: "dbo",
  objectName: "vw_ActiveUsers",
  objectType: "VIEW"
});
```

**Use Cases:** Review database logic, document business rules, troubleshoot procedure issues

---

### Query Execution Tools

#### sql-execute-query

Execute a SELECT query safely with read-only access.

**Parameters:**
- `query` (required): SQL SELECT query to execute

**Security Features:**
- ✅ Only SELECT queries permitted
- ✅ Blocks INSERT, UPDATE, DELETE, DROP, EXEC, and other write operations
- ✅ Removes SQL comments to prevent comment-hiding attacks
- ✅ Word boundary detection for dangerous keywords
- ✅ 10MB response limit
- ✅ 1000 row limit (configurable)
- ✅ 30-second timeout (configurable)

**Example:**
```javascript
await mcpClient.invoke("sql-execute-query", {
  query: `
    SELECT TOP 10 UserId, UserName, Email, CreateDate
    FROM dbo.Users
    WHERE IsActive = 1
    ORDER BY CreateDate DESC
  `
});
```

**Validation Errors:**
- "Only SELECT queries are permitted" - Non-SELECT query detected
- "Invalid query: write operations detected" - INSERT/UPDATE/DELETE detected
- "Invalid query: schema modifications detected" - DROP/CREATE/ALTER detected
- "Invalid query: procedure execution detected" - EXEC/sp_/xp_ detected

**Use Cases:** Ad-hoc data investigation, troubleshoot data issues, generate reports, verify data quality

---

## Prompts

### sql-database-overview

Generate comprehensive database overview report.

**Parameters:** None

**Returns:** Markdown report with:
- Database statistics (tables, views, procedures, triggers, functions)
- Top 5 largest tables
- Total database size
- Recommendations

---

### sql-table-details

Generate detailed table structure report.

**Parameters:**
- `schemaName` (required): Schema name
- `tableName` (required): Table name

**Returns:** Markdown report with:
- Table statistics (row count, size)
- Column definitions
- Indexes
- Foreign key relationships
- Recommendations

---

### sql-query-results

Format query results as markdown table.

**Parameters:**
- `query` (required): SQL SELECT query

**Returns:** Markdown-formatted table with query results

---

## Usage Examples

### Example 1: Database Schema Discovery

**Scenario:** Understand database structure.

```javascript
// Get comprehensive database overview
await mcpClient.callPrompt("sql-database-overview", {});
```

**AI Analysis:**
"Database contains 45 tables (2.5M rows, 1.2 GB), 12 views, 28 stored procedures, 15 triggers, 8 user-defined functions. Largest table: OrderHistory (1.2M rows, 450 MB). All tables in 'dbo' schema."

---

### Example 2: Table Structure Investigation

**Scenario:** Understand Users table structure.

```javascript
// Get detailed table structure
await mcpClient.callPrompt("sql-table-details", {
  schemaName: "dbo",
  tableName: "Users"
});
```

**AI Analysis:**
"Users table has 250K rows, 15 columns. Primary key: UserId (int, identity). Unique indexes on Email and UserName. Foreign keys: UserRoles.UserId, Orders.UserId, AuditLog.UserId. Recommendation: Consider archiving old users (LastLoginDate > 1 year)."

---

### Example 3: Data Investigation

**Scenario:** Find recent active users.

```javascript
// Execute data query
await mcpClient.invoke("sql-execute-query", {
  query: `
    SELECT TOP 10 UserId, UserName, Email, CreateDate, LastLoginDate
    FROM dbo.Users
    WHERE IsActive = 1
    ORDER BY CreateDate DESC
  `
});
```

**AI Analysis:**
"Found 10 most recent active users. 3 users have never logged in (LastLoginDate is NULL). Most recent user: jdoe2025 (created 2025-01-15, last login 2025-01-16)."

---

### Example 4: Exploring Database Objects

**Scenario:** What views are available?

```javascript
// List all views
await mcpClient.invoke("sql-list-views", {});
```

**AI Analysis:**
"Found 12 views including vw_ActiveUsers (active users with last login), vw_OrderSummary (order aggregation by user), vw_ProductInventory (current inventory levels), vw_UserPermissions (consolidated roles and permissions)."

---

### Example 5: Testing Connectivity

**Scenario:** Verify database connection.

```javascript
// Test connection
await mcpClient.invoke("sql-test-connection", {});
```

**Result:**
```json
{
  "connected": true,
  "sqlVersion": "Microsoft SQL Server 2022 (RTM) - 16.0.1000.6",
  "database": "ProductionDB",
  "user": "mcp_readonly",
  "serverTime": "2025-01-16T10:35:22Z"
}
```

**AI Analysis:**
"Connection successful. SQL Server 2022, ProductionDB database, read-only user mcp_readonly. Connection is healthy and ready for queries."

---

## Best Practices

### Security

**Read-Only Account:**
- ✅ Use dedicated read-only database user
- ✅ Grant db_datareader role
- ✅ Grant VIEW DEFINITION permission (for schema exploration)
- ❌ Never use admin or owner accounts
- ❌ Never grant write permissions (INSERT, UPDATE, DELETE)

**Credential Management:**
- ✅ Store credentials in environment variables, never in code
- ✅ Use Azure AD authentication for production (no stored passwords)
- ✅ Rotate SQL Authentication passwords regularly (90 days)
- ✅ Use `.env` files for local development (add to `.gitignore`)
- ❌ Never commit credentials to version control

**Network Security:**
- Configure Azure SQL firewall rules to allow only trusted IPs
- Use VNet integration for production environments
- Enable SSL/TLS encryption (default in Azure SQL)
- Monitor connection attempts in Azure SQL audit logs

**Query Safety:**
- All queries validated before execution
- Write operations blocked at multiple layers
- SQL comments removed to prevent comment-hiding attacks
- Credentials sanitized from error messages

### Performance

**Connection Pooling:**
- Default pool: 0 min, 10 max connections
- Connections reused across queries
- Automatic health checks and reconnection
- Configure pool size based on workload

**Query Optimization:**
- Use `TOP` clause to limit result sets
- Add `WHERE` clauses to filter data
- Use indexes for better performance
- Avoid `SELECT *` - specify needed columns only

**Result Limiting:**
- Default: 1000 row limit
- Default: 10MB response limit
- Default: 30-second timeout
- Configure limits based on needs

### Data Privacy

**Sensitive Data:**
- Avoid querying PII (personally identifiable information) when possible
- Mask sensitive data in query results (credit cards, SSN, etc.)
- Use views to hide sensitive columns
- Follow GDPR and compliance requirements

---

## Troubleshooting

### Common Errors

#### Error: "Missing required Azure SQL configuration"

**Cause:** Missing environment variables.

**Solution:**
1. Check that `AZURE_SQL_SERVER` and `AZURE_SQL_DATABASE` are set
2. For SQL Auth: Verify `AZURE_SQL_USERNAME` and `AZURE_SQL_PASSWORD`
3. For Azure AD: Verify `AZURE_SQL_CLIENT_ID`, `AZURE_SQL_CLIENT_SECRET`, `AZURE_SQL_TENANT_ID`

---

#### Error: "Cannot connect to SQL Server"

**Cause:** Network connectivity or firewall issue.

**Solution:**
1. Verify server hostname: `your-server.database.windows.net`
2. Check Azure SQL firewall rules:
   - Go to Azure Portal → SQL Database → Firewalls and virtual networks
   - Add your IP address to allowed IPs
3. Verify port 1433 is accessible
4. Check if server requires VNet integration

**Test Connection:**
```bash
# Test TCP connection (Linux/Mac)
nc -zv your-server.database.windows.net 1433

# Test TCP connection (Windows PowerShell)
Test-NetConnection -ComputerName your-server.database.windows.net -Port 1433
```

---

#### Error: "Login failed for user"

**Cause:** Invalid credentials or permissions.

**Solution for SQL Auth:**
1. Verify username and password are correct
2. Check if user exists in database: `SELECT name FROM sys.database_principals WHERE name = 'mcp_readonly'`
3. Verify user has correct permissions: `EXEC sp_helprolemember 'db_datareader'`

**Solution for Azure AD:**
1. Verify service principal exists in Azure AD
2. Check if user exists in database: `SELECT name FROM sys.database_principals WHERE name = '[MCP-Consultant-Tools-SQL]'`
3. Verify service principal client secret hasn't expired

---

#### Error: "Only SELECT queries are permitted"

**Cause:** Non-SELECT query detected.

**Solution:**
This is by design. The integration is read-only for safety. Only SELECT queries are allowed.

**Examples:**
```sql
-- ✅ ALLOWED
SELECT * FROM dbo.Users;

-- ❌ BLOCKED
INSERT INTO dbo.Users (UserName) VALUES ('test');
UPDATE dbo.Users SET IsActive = 0;
DELETE FROM dbo.Users WHERE UserId = 1;
DROP TABLE dbo.Users;
EXEC dbo.usp_CreateUser @UserName = 'test';
```

---

#### Error: "Query result too large"

**Cause:** Query returned more than 10MB of data.

**Solution:**
1. Use `TOP` clause to limit rows:
   ```sql
   SELECT TOP 100 * FROM dbo.LargeTable;
   ```
2. Use `WHERE` clause to filter data:
   ```sql
   SELECT * FROM dbo.Orders WHERE CreateDate > '2025-01-01';
   ```
3. Select specific columns instead of `*`:
   ```sql
   SELECT UserId, UserName FROM dbo.Users;
   ```
4. Increase `AZURE_SQL_MAX_RESULT_ROWS` if needed (with caution)

---

#### Error: "Query timeout"

**Cause:** Query took longer than 30 seconds.

**Solution:**
1. Optimize query with indexes
2. Reduce result set size with `WHERE` clauses
3. Use `TOP` to limit rows
4. Increase `AZURE_SQL_QUERY_TIMEOUT` if needed (with caution)

---

### Permission Issues

#### Error: "VIEW DEFINITION permission denied"

**Cause:** User lacks VIEW DEFINITION permission.

**Solution:**
Grant VIEW DEFINITION permission as database admin:

```sql
USE YourDatabaseName;
GRANT VIEW DEFINITION TO mcp_readonly;
```

**Why Needed:**
VIEW DEFINITION permission is required for:
- `sql-list-views` - Get view definitions
- `sql-list-stored-procedures` - Get procedure definitions
- `sql-list-triggers` - Get trigger definitions
- `sql-list-functions` - Get function definitions
- `sql-get-object-definition` - Get any object definition

---

#### Error: "SELECT permission denied on object"

**Cause:** User lacks SELECT permission on specific table.

**Solution:**
Grant SELECT permission as database admin:

```sql
-- Grant on all tables
ALTER ROLE db_datareader ADD MEMBER mcp_readonly;

-- Or grant on specific tables
GRANT SELECT ON dbo.Users TO mcp_readonly;
GRANT SELECT ON dbo.Orders TO mcp_readonly;
```

---

**For additional help:**
- Azure SQL Documentation: https://docs.microsoft.com/azure/azure-sql/
- SQL Server Reference: https://docs.microsoft.com/sql/sql-server/
- GitHub Issues: https://github.com/anthropics/mcp-consultant-tools/issues

---
