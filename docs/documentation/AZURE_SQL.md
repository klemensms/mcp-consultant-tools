# Azure SQL Database Integration Documentation

**📦 Package:** `@mcp-consultant-tools/azure-sql`
**🔒 Security:** Production-safe (read-only access to databases)

Complete guide to using the Azure SQL Database integration with MCP Consultant Tools.

---

## ⚡ Quick Start

### MCP Client Configuration

Get started quickly with this minimal configuration. Just replace the placeholder values with your actual credentials:

#### For VS Code

Add this to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "azure-sql": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/azure-sql"],
      "env": {
        "AZURESQL_CONNECTION_STRING": "Server=your-server.database.windows.net;Database=your-db;User Id=your-user;Password=your-password;Encrypt=true;"
      }
    }
  }
}
```

#### For Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "azure-sql": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/azure-sql"],
      "env": {
        "AZURESQL_CONNECTION_STRING": "Server=your-server.database.windows.net;Database=your-db;User Id=your-user;Password=your-password;Encrypt=true;"
      }
    }
  }
}
```

#### Test Your Setup

After configuring, test the connection by listing servers:

```javascript
// Ask Claude: "What SQL servers are configured?"
// Or test connection:
await mcpClient.invoke("sql-test-connection", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Need credentials?** See the [Detailed Setup](#detailed-setup) section below for database user creation and multi-server configuration instructions.

---

## 🎯 Key Features for Consultants

### Automated Workflows (Prompts)

This package includes **3 pre-built prompts** that generate formatted, human-readable reports from Azure SQL databases. These prompts are designed for consultants who need quick insights without writing SQL queries.

#### Database Analysis Prompts

1. 🔥 **`azuresql-schema-analysis`** - **MOST VALUABLE** - Analyzes database schema, tables, indexes, and relationships with recommendations
   - Example: `"Analyze the database schema for AppDB on prod-sql"`
   - Includes: Table inventory, relationship mapping, index analysis, optimization recommendations
   - **Use Case:** Database health checks, performance optimization, schema documentation

2. **`azuresql-database-overview`** - Comprehensive database overview with statistics and top largest tables
   - Example: `"Generate overview report for ProductionDB"`
   - Includes: Database statistics, top 5 largest tables, total size, recommendations

3. **`azuresql-table-details`** - Detailed table structure report with columns, indexes, and foreign keys
   - Example: `"Show me details about the Users table"`
   - Includes: Table statistics, column definitions, indexes, relationships, recommendations

**Why schema-analysis is most valuable:**
- Provides complete database health assessment
- Identifies missing indexes and performance bottlenecks
- Maps all table relationships for understanding data flow
- Detects schema design issues (no primary key, excessive columns)
- Generates actionable optimization recommendations
- Perfect for database audits and capacity planning

### Database Query Tools

Beyond prompts, this package provides **11 specialized tools** for database exploration:

- **`sql-list-servers`** - List all configured SQL servers (multi-server support)
- **`sql-list-databases`** - List databases on a server (discovery mode available)
- **`sql-test-connection`** - Test connectivity to a database
- **`sql-list-tables`** - List all tables with row counts and sizes
- **`sql-list-views`** - List all views with definitions
- **`sql-list-stored-procedures`** - List all stored procedures
- **`sql-list-triggers`** - List all triggers with event types
- **`sql-list-functions`** - List all user-defined functions
- **`sql-get-table-schema`** - Get comprehensive table schema (columns, indexes, foreign keys)
- **`sql-get-object-definition`** - Get SQL definition for views, procedures, functions, triggers
- **`sql-execute-query`** - Execute read-only SELECT queries safely

---

## Table of Contents

1. [Overview](#overview)
2. [Detailed Setup](#detailed-setup)
3. [Tools](#tools) - 11 tools (9 schema + 2 discovery)
4. [Prompts](#prompts) - 3 prompts
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Migration Guide](#migration-guide) - Single-server to multi-server
8. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Azure SQL Database?

Azure SQL Database is a fully managed relational database service offering:
- **High availability** with 99.99% SLA
- **Automatic backups** with point-in-time restore
- **Built-in security** with encryption, firewall, and advanced threat protection
- **Scalability** from single database to elastic pools
- **Compatibility** with SQL Server

**Primary Use Case**: Read-only database investigation, schema exploration, and ad-hoc querying with comprehensive security controls across multiple SQL servers and databases.

### Key Features

**Multi-Server Architecture (NEW):**
- ✅ **Multiple SQL servers** with individual configuration per server
- ✅ **Multiple databases per server** with optional specification
- ✅ **Per-server credentials** - SQL Auth or Azure AD per server
- ✅ **Database discovery mode** - Access all databases on a server if none specified
- ✅ **Active/inactive flags** - Quick enable/disable at server and database levels
- ✅ **Isolated connection pools** - Separate pool per server:database combination
- ✅ **Backward compatible** - Seamless migration from single-server configuration

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
- Automatic connection management per server:database
- Health checks and reconnection
- Configurable pool size (default: 0-10 connections per pool)
- Graceful pool disposal

**Schema Exploration:**
- List tables with row counts and sizes
- List views, stored procedures, triggers, functions
- Get comprehensive table schema (columns, indexes, foreign keys)
- Get SQL definitions for database objects

---

## Detailed Setup

### Prerequisites

1. **Azure SQL Database** or SQL Server (one or more)
2. **Database firewall rules** allowing your IP address
3. **Read-only database user(s)** (recommended) or Azure AD authentication
4. Server names, database names, authentication credentials per server

### Configuration Modes

The integration supports two configuration modes:

**1. Multi-Server Configuration (RECOMMENDED)** - New JSON array format:
- Configure multiple SQL servers with individual credentials
- Specify multiple databases per server with active/inactive flags
- Empty databases array enables access to all databases on that server
- Per-server authentication (SQL or Azure AD)

**2. Legacy Single-Server Configuration** - Backward compatible:
- Uses original `AZURE_SQL_SERVER`/`AZURE_SQL_DATABASE` variables
- Automatically migrated to multi-server format internally
- No breaking changes for existing configurations

### Authentication Methods

**SQL Authentication (Username/Password)** - Per server:
- ✅ Simple setup
- ✅ Standard SQL Server authentication
- ✅ Different credentials per server
- ❌ Stored password (less secure than Azure AD)

**Azure AD Authentication (Service Principal)** - Per server:
- ✅ Better security (token-based)
- ✅ No stored passwords
- ✅ Automatic token refresh
- ✅ Different service principals per server
- ❌ More complex setup

---

### Multi-Server Configuration (Recommended)

#### Step 1: Create Read-Only Database Users

Connect to each Azure SQL Database and execute:

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

**Repeat for each SQL Server.**

#### Step 2: Configure Multi-Server Environment Variable

**Example 1: Production and Development Servers with SQL Auth**

```bash
export AZURE_SQL_SERVERS='[
  {
    "id": "prod-sql",
    "name": "Production SQL Server",
    "server": "prod-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [
      {
        "name": "AppDB",
        "active": true,
        "description": "Main application database"
      },
      {
        "name": "AnalyticsDB",
        "active": true,
        "description": "Analytics database"
      }
    ],
    "username": "mcp_readonly",
    "password": "ProdPassword123!",
    "useAzureAd": false,
    "description": "Production SQL Server"
  },
  {
    "id": "dev-sql",
    "name": "Development SQL Server",
    "server": "dev-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [
      {
        "name": "DevDB",
        "active": true,
        "description": "Development database"
      }
    ],
    "username": "mcp_readonly",
    "password": "DevPassword123!",
    "useAzureAd": false,
    "description": "Development SQL Server"
  }
]'
```

**Example 2: Multi-Server with Azure AD Authentication**

```bash
export AZURE_SQL_SERVERS='[
  {
    "id": "prod-sql",
    "name": "Production SQL Server",
    "server": "prod-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [
      {
        "name": "AppDB",
        "active": true,
        "description": "Main application database"
      }
    ],
    "useAzureAd": true,
    "azureAdClientId": "prod-service-principal-client-id",
    "azureAdClientSecret": "prod-service-principal-secret",
    "azureAdTenantId": "azure-tenant-id",
    "description": "Production SQL Server with Azure AD"
  },
  {
    "id": "dev-sql",
    "name": "Development SQL Server",
    "server": "dev-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [],
    "username": "mcp_readonly",
    "password": "DevPassword123!",
    "useAzureAd": false,
    "description": "Dev server - empty databases[] allows access to all databases"
  }
]'
```

**Example 3: Database Discovery Mode**

```bash
export AZURE_SQL_SERVERS='[
  {
    "id": "reporting-sql",
    "name": "Reporting SQL Server",
    "server": "reporting-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [],
    "username": "mcp_readonly",
    "password": "ReportingPassword123!",
    "useAzureAd": false,
    "description": "Reporting server - empty databases[] enables discovery mode"
  }
]'
```

**When `databases: []` is empty:**
- The `sql-list-databases` tool queries `sys.databases` for all user databases
- Access is granted to all discovered databases (excluding system databases)
- Useful for servers with many databases or dynamic database creation

#### Step 3: Configure Global Settings (Optional)

```bash
# Query timeout (default: 30000ms = 30 seconds)
export AZURE_SQL_QUERY_TIMEOUT="30000"

# Maximum rows returned (default: 1000)
export AZURE_SQL_MAX_RESULT_ROWS="1000"

# Connection timeout (default: 15000ms = 15 seconds)
export AZURE_SQL_CONNECTION_TIMEOUT="15000"

# Connection pool size per server:database (default: 0 min, 10 max)
export AZURE_SQL_POOL_MIN="0"
export AZURE_SQL_POOL_MAX="10"
```

---

### Legacy Single-Server Configuration (Backward Compatible)

If you have an existing single-server configuration, it continues to work without changes:

```bash
# Legacy configuration (automatically migrated)
export AZURE_SQL_SERVER="your-server.database.windows.net"
export AZURE_SQL_DATABASE="YourDatabaseName"
export AZURE_SQL_PORT="1433"
export AZURE_SQL_USERNAME="mcp_readonly"
export AZURE_SQL_PASSWORD="YourStrongPassword123!"
export AZURE_SQL_USE_AZURE_AD="false"

# Or with Azure AD
export AZURE_SQL_SERVER="your-server.database.windows.net"
export AZURE_SQL_DATABASE="YourDatabaseName"
export AZURE_SQL_PORT="1433"
export AZURE_SQL_USE_AZURE_AD="true"
export AZURE_SQL_CLIENT_ID="service-principal-client-id"
export AZURE_SQL_CLIENT_SECRET="service-principal-secret"
export AZURE_SQL_TENANT_ID="azure-tenant-id"
```

**Automatic Migration:**
- Internally converted to a single-server resource with ID `"default"`
- No breaking changes - all existing tools work as before
- Can migrate to multi-server format when ready

---

### Azure AD Authentication Setup (Per Server)

#### Step 1: Create Service Principal

```bash
# Create service principal for production
az ad sp create-for-rbac --name "MCP-SQL-Prod" --skip-assignment

# Create service principal for development (optional - can reuse same one)
az ad sp create-for-rbac --name "MCP-SQL-Dev" --skip-assignment
```

#### Step 2: Assign Permissions in SQL Database

Connect to each Azure SQL Database as an Azure AD admin and execute:

```sql
-- Create user from Azure AD service principal
CREATE USER [MCP-SQL-Prod] FROM EXTERNAL PROVIDER;

-- Grant read permissions
ALTER ROLE db_datareader ADD MEMBER [MCP-SQL-Prod];

-- Grant VIEW DEFINITION permission
GRANT VIEW DEFINITION TO [MCP-SQL-Prod];
```

**Repeat for each SQL Server and service principal.**

---

### Environment Variables Reference

#### Multi-Server Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AZURE_SQL_SERVERS` | Yes (Multi) | JSON array of server resources | See examples above |

**JSON Structure per Server:**
```json
{
  "id": "server-id",                    // User-friendly ID (required)
  "name": "Display Name",               // Server display name (required)
  "server": "hostname",                 // SQL Server hostname (required)
  "port": 1433,                         // Server port (default: 1433)
  "active": true,                       // Enable/disable server (required)
  "databases": [                        // Database list (empty = all databases)
    {
      "name": "DatabaseName",           // Database name
      "active": true,                   // Enable/disable database
      "description": "Optional description"
    }
  ],
  "username": "user",                   // SQL Auth username (if useAzureAd=false)
  "password": "pass",                   // SQL Auth password (if useAzureAd=false)
  "useAzureAd": false,                  // Use Azure AD auth (default: false)
  "azureAdClientId": "client-id",       // Azure AD client ID (if useAzureAd=true)
  "azureAdClientSecret": "secret",      // Azure AD client secret (if useAzureAd=true)
  "azureAdTenantId": "tenant-id",       // Azure AD tenant ID (if useAzureAd=true)
  "description": "Optional server description"
}
```

#### Legacy Single-Server Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `AZURE_SQL_SERVER` | Yes (Legacy) | SQL Server hostname | - |
| `AZURE_SQL_DATABASE` | Yes (Legacy) | Database name | - |
| `AZURE_SQL_PORT` | No | SQL Server port | 1433 |
| `AZURE_SQL_USERNAME` | Yes (SQL Auth) | Database username | - |
| `AZURE_SQL_PASSWORD` | Yes (SQL Auth) | Database password | - |
| `AZURE_SQL_USE_AZURE_AD` | No | Use Azure AD authentication | "false" |
| `AZURE_SQL_CLIENT_ID` | Yes (Azure AD) | Service principal client ID | - |
| `AZURE_SQL_CLIENT_SECRET` | Yes (Azure AD) | Service principal client secret | - |
| `AZURE_SQL_TENANT_ID` | Yes (Azure AD) | Azure tenant ID | - |

#### Global Settings (Both Modes)

| Variable | Description | Default |
|----------|-------------|---------|
| `AZURE_SQL_QUERY_TIMEOUT` | Query timeout in milliseconds | 30000 |
| `AZURE_SQL_MAX_RESULT_ROWS` | Maximum rows returned | 1000 |
| `AZURE_SQL_CONNECTION_TIMEOUT` | Connection timeout in milliseconds | 15000 |
| `AZURE_SQL_POOL_MIN` | Minimum connection pool size (per server:database) | 0 |
| `AZURE_SQL_POOL_MAX` | Maximum connection pool size (per server:database) | 10 |

---

## Tools

Total: **11 tools** (9 schema exploration + 2 server/database discovery)

### Server & Database Discovery Tools (NEW)

#### sql-list-servers

List all configured SQL servers with active/inactive status.

**Parameters:** None

**Returns:**
Array of servers with:
- `id`: Server ID (user-friendly identifier)
- `name`: Display name
- `server`: SQL Server hostname
- `port`: Server port
- `active`: Enabled/disabled status
- `databaseCount`: Number of configured databases (0 = discovery mode)
- `authMethod`: "SQL" or "Azure AD"
- `description`: Optional description

**Use Cases:**
- Discover available SQL servers
- Check server active/inactive status
- Identify authentication method per server
- Understand multi-server configuration

**Example:**
```javascript
await mcpClient.invoke("sql-list-servers", {});
```

**Example Response:**
```json
[
  {
    "id": "prod-sql",
    "name": "Production SQL Server",
    "server": "prod-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databaseCount": 2,
    "authMethod": "Azure AD",
    "description": "Production SQL Server"
  },
  {
    "id": "dev-sql",
    "name": "Development SQL Server",
    "server": "dev-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databaseCount": 0,
    "authMethod": "SQL",
    "description": "Dev server - discovery mode"
  }
]
```

---

#### sql-list-databases

List databases on a SQL server (configured or discovered via `sys.databases`).

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`

**Returns:**
Array of databases with:
- `name`: Database name
- `active`: Enabled/disabled status
- `description`: Optional description

**Use Cases:**
- Discover databases on a server
- Check database active/inactive status
- Database discovery mode (when `databases: []` is empty)
- Understand available databases per server

**Example:**
```javascript
await mcpClient.invoke("sql-list-databases", {
  serverId: "prod-sql"
});
```

**Example Response (Configured Databases):**
```json
[
  {
    "name": "AppDB",
    "active": true,
    "description": "Main application database"
  },
  {
    "name": "AnalyticsDB",
    "active": true,
    "description": "Analytics database"
  }
]
```

**Example Response (Discovery Mode):**
```json
[
  {
    "name": "AppDB",
    "active": true,
    "description": "Discovered database"
  },
  {
    "name": "ReportingDB",
    "active": true,
    "description": "Discovered database"
  },
  {
    "name": "TestDB",
    "active": true,
    "description": "Discovered database"
  }
]
```

---

### Schema Exploration Tools

#### sql-test-connection

Test connectivity to a specific Azure SQL Database.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`

**Returns:**
- `connected` (boolean): Connection status
- `sqlVersion` (string): SQL Server version
- `database` (string): Connected database name
- `user` (string): Current user (sanitized)
- `serverTime` (string): Server UTC time

**Example:**
```javascript
await mcpClient.invoke("sql-test-connection", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Use Cases:** Verify connectivity, check SQL version, troubleshoot connection issues

---

#### sql-list-tables

List all user tables with row counts and sizes.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`

**Returns:**
Array of tables with:
- `schemaName`: Schema name (e.g., "dbo")
- `tableName`: Table name
- `rowCount`: Approximate row count
- `totalSpaceMB`: Total space in MB
- `dataSpaceMB`: Data space in MB
- `indexSpaceMB`: Index space in MB

**Example:**
```javascript
await mcpClient.invoke("sql-list-tables", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Use Cases:** Database inventory, identify large tables, understand schema structure

---

#### sql-list-views

List all database views with definitions.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`

**Returns:**
Array of views with:
- `schemaName`: Schema name
- `viewName`: View name
- `definition`: View SQL definition

**Example:**
```javascript
await mcpClient.invoke("sql-list-views", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Use Cases:** Explore views, understand data access patterns, document database logic

---

#### sql-list-stored-procedures

List all stored procedures.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`

**Returns:**
Array of procedures with:
- `schemaName`: Schema name
- `procedureName`: Procedure name
- `definition`: Procedure SQL definition
- `createDate`: Creation date
- `modifyDate`: Last modification date

**Example:**
```javascript
await mcpClient.invoke("sql-list-stored-procedures", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Use Cases:** Inventory procedures, review procedure logic, find procedures by name

---

#### sql-list-triggers

List all database triggers with event types.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`

**Returns:**
Array of triggers with:
- `schemaName`: Schema name
- `triggerName`: Trigger name
- `tableName`: Associated table name
- `eventType`: Trigger event (INSERT, UPDATE, DELETE)
- `isEnabled`: Enabled status
- `definition`: Trigger SQL definition

**Example:**
```javascript
await mcpClient.invoke("sql-list-triggers", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Use Cases:** Audit automated operations, understand data modification logic, troubleshoot trigger conflicts

---

#### sql-list-functions

List all user-defined functions.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`

**Returns:**
Array of functions with:
- `schemaName`: Schema name
- `functionName`: Function name
- `functionType`: Function type (Scalar, Table-valued, etc.)
- `returnType`: Return data type
- `definition`: Function SQL definition

**Example:**
```javascript
await mcpClient.invoke("sql-list-functions", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Use Cases:** Inventory functions, review calculation logic, document business rules

---

#### sql-get-table-schema

Get comprehensive schema details for a specific table.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`
- `schemaName` (required): Schema name (e.g., "dbo")
- `tableName` (required): Table name

**Returns:**
- `columns`: Column definitions with data types, nullability, defaults, identity
- `indexes`: Index definitions with columns, uniqueness, primary key status
- `foreignKeys`: Foreign key relationships with referenced tables and columns

**Example:**
```javascript
await mcpClient.invoke("sql-get-table-schema", {
  serverId: "prod-sql",
  database: "AppDB",
  schemaName: "dbo",
  tableName: "Users"
});
```

**Use Cases:** Understand table structure, plan data queries, document relationships, troubleshoot data issues

---

#### sql-get-object-definition

Get SQL definition for views, stored procedures, functions, or triggers.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`
- `schemaName` (required): Schema name
- `objectName` (required): Object name
- `objectType` (required): "VIEW", "PROCEDURE", "FUNCTION", or "TRIGGER"

**Example:**
```javascript
await mcpClient.invoke("sql-get-object-definition", {
  serverId: "prod-sql",
  database: "AppDB",
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
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`
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
  serverId: "prod-sql",
  database: "AppDB",
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

Total: **3 prompts** (all updated with multi-server parameters)

### azuresql-schema-analysis

🔥 **MOST VALUABLE** - Comprehensive database schema analysis with tables, indexes, relationships, and optimization recommendations.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`

**Returns:** Markdown report with:
- Complete table inventory with sizes
- Index analysis (clustered, non-clustered, missing indexes)
- Foreign key relationship mapping
- Schema design issues
- Performance optimization recommendations
- Capacity planning insights

**Example:**
```javascript
await mcpClient.callPrompt("azuresql-schema-analysis", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Use Cases:**
- Database health assessment
- Performance optimization planning
- Schema documentation generation
- Database audits
- Capacity planning
- Migration planning

---

### azuresql-database-overview

Generate comprehensive database overview report.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`

**Returns:** Markdown report with:
- Database statistics (tables, views, procedures, triggers, functions)
- Top 5 largest tables
- Total database size
- Recommendations

**Example:**
```javascript
await mcpClient.callPrompt("azuresql-database-overview", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

---

### azuresql-table-details

Generate detailed table structure report.

**Parameters:**
- `serverId` (required): Server ID from `sql-list-servers`
- `database` (required): Database name from `sql-list-databases`
- `schemaName` (required): Schema name
- `tableName` (required): Table name

**Returns:** Markdown report with:
- Table statistics (row count, size)
- Column definitions
- Indexes
- Foreign key relationships
- Recommendations

**Example:**
```javascript
await mcpClient.callPrompt("azuresql-table-details", {
  serverId: "prod-sql",
  database: "AppDB",
  schemaName: "dbo",
  tableName: "Users"
});
```

---

## Usage Examples

### Example 1: Discover Available SQL Servers

**Scenario:** List all configured SQL servers.

```javascript
// List all servers
await mcpClient.invoke("sql-list-servers", {});
```

**AI Analysis:**
"Found 3 SQL servers: prod-sql (Production, 2 databases, Azure AD auth), dev-sql (Development, discovery mode, SQL auth), reporting-sql (Reporting, 5 databases, SQL auth). All servers are active."

---

### Example 2: Discover Databases on a Server

**Scenario:** List databases on production server.

```javascript
// List databases on prod-sql
await mcpClient.invoke("sql-list-databases", {
  serverId: "prod-sql"
});
```

**AI Analysis:**
"Production server has 2 configured databases: AppDB (active, main application database) and AnalyticsDB (active, analytics database). Both databases are accessible."

---

### Example 3: Database Discovery Mode

**Scenario:** Discover all databases on dev server (empty databases[] array).

```javascript
// List databases on dev-sql (discovery mode)
await mcpClient.invoke("sql-list-databases", {
  serverId: "dev-sql"
});
```

**AI Analysis:**
"Development server is in discovery mode. Found 5 databases: AppDB, TestDB, StagingDB, FeatureDB, SandboxDB. All discovered databases are active."

---

### Example 4: Database Schema Discovery

**Scenario:** Understand database structure on production server.

```javascript
// Get comprehensive database overview
await mcpClient.callPrompt("azuresql-database-overview", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**AI Analysis:**
"AppDB contains 45 tables (2.5M rows, 1.2 GB), 12 views, 28 stored procedures, 15 triggers, 8 user-defined functions. Largest table: OrderHistory (1.2M rows, 450 MB). All tables in 'dbo' schema."

---

### Example 5: Table Structure Investigation

**Scenario:** Understand Users table structure in production database.

```javascript
// Get detailed table structure
await mcpClient.callPrompt("azuresql-table-details", {
  serverId: "prod-sql",
  database: "AppDB",
  schemaName: "dbo",
  tableName: "Users"
});
```

**AI Analysis:**
"Users table has 250K rows, 15 columns. Primary key: UserId (int, identity). Unique indexes on Email and UserName. Foreign keys: UserRoles.UserId, Orders.UserId, AuditLog.UserId. Recommendation: Consider archiving old users (LastLoginDate > 1 year)."

---

### Example 6: Multi-Server Data Investigation

**Scenario:** Find recent active users across multiple environments.

```javascript
// Execute query on production
await mcpClient.invoke("sql-execute-query", {
  serverId: "prod-sql",
  database: "AppDB",
  query: `
    SELECT TOP 10 UserId, UserName, Email, CreateDate, LastLoginDate
    FROM dbo.Users
    WHERE IsActive = 1
    ORDER BY CreateDate DESC
  `
});

// Execute same query on development
await mcpClient.invoke("sql-execute-query", {
  serverId: "dev-sql",
  database: "DevDB",
  query: `
    SELECT TOP 10 UserId, UserName, Email, CreateDate, LastLoginDate
    FROM dbo.Users
    WHERE IsActive = 1
    ORDER BY CreateDate DESC
  `
});
```

**AI Analysis:**
"Production: Found 10 most recent active users. 3 users have never logged in. Most recent: jdoe2025 (created 2025-01-15). Development: Found 8 test users, all created today. Data consistency verified between environments."

---

### Example 7: Exploring Database Objects

**Scenario:** What views are available in analytics database?

```javascript
// List all views
await mcpClient.invoke("sql-list-views", {
  serverId: "prod-sql",
  database: "AnalyticsDB"
});
```

**AI Analysis:**
"Found 18 views including vw_SalesMetrics (daily sales aggregation), vw_CustomerInsights (customer behavior analysis), vw_ProductPerformance (product sales trends), vw_RegionalAnalysis (sales by region)."

---

### Example 8: Testing Connectivity

**Scenario:** Verify database connection to production server.

```javascript
// Test connection
await mcpClient.invoke("sql-test-connection", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**Result:**
```json
{
  "connected": true,
  "sqlVersion": "Microsoft SQL Server 2022 (RTM) - 16.0.1000.6",
  "database": "AppDB",
  "user": "mcp_readonly",
  "serverTime": "2025-01-16T10:35:22Z"
}
```

**AI Analysis:**
"Connection successful to prod-sql/AppDB. SQL Server 2022, read-only user mcp_readonly. Connection is healthy and ready for queries."

---

### Example 9: Cross-Server Database Comparison

**Scenario:** Compare table sizes across production and development.

```javascript
// Get tables from production
const prodTables = await mcpClient.invoke("sql-list-tables", {
  serverId: "prod-sql",
  database: "AppDB"
});

// Get tables from development
const devTables = await mcpClient.invoke("sql-list-tables", {
  serverId: "dev-sql",
  database: "DevDB"
});
```

**AI Analysis:**
"Production has 45 tables (1.2 GB total). Development has 42 tables (85 MB total). Missing in dev: OrderHistory, AuditLog, PaymentTransactions. Schema drift detected - dev environment needs synchronization."

---

### Example 10: Comprehensive Schema Analysis

**Scenario:** Perform database health check and optimization analysis.

```javascript
// Get comprehensive schema analysis
await mcpClient.callPrompt("azuresql-schema-analysis", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

**AI Analysis:**
"Database contains 45 tables with 2.5M total rows. Identified 3 tables without primary keys (AuditLog, TempData, ImportQueue). Found 12 missing indexes on frequently queried columns. Foreign key relationships mapped: 28 relationships across 15 tables. Recommendations: Add primary keys to audit tables, implement suggested indexes for 40% query performance improvement, archive historical data older than 2 years."

---

## Best Practices

### Multi-Server Configuration

**Server Organization:**
- ✅ Use descriptive server IDs (e.g., "prod-sql", "dev-sql", "reporting-sql")
- ✅ Group databases logically per server (application DB, analytics DB, etc.)
- ✅ Use discovery mode (`databases: []`) for servers with many databases
- ✅ Document server purposes in `description` fields
- ❌ Avoid overly complex configurations with too many servers

**Active/Inactive Flags:**
- ✅ Use `active: false` to temporarily disable server/database access
- ✅ Keep inactive configurations for quick re-enablement
- ✅ Document reasons for inactivity in `description` fields
- ❌ Don't remove server configs - mark as inactive instead

**Per-Server Authentication:**
- ✅ Use Azure AD for production servers (better security)
- ✅ Use SQL Auth for dev/test servers (simpler setup)
- ✅ Different credentials per environment (dev/test/prod)
- ❌ Never reuse production credentials in non-production environments

### Security

**Read-Only Accounts:**
- ✅ Use dedicated read-only database user per server
- ✅ Grant db_datareader role
- ✅ Grant VIEW DEFINITION permission (for schema exploration)
- ❌ Never use admin or owner accounts
- ❌ Never grant write permissions (INSERT, UPDATE, DELETE)

**Credential Management:**
- ✅ Store credentials in environment variables, never in code
- ✅ Use Azure AD authentication for production (no stored passwords)
- ✅ Use different service principals per environment
- ✅ Rotate SQL Authentication passwords regularly (90 days)
- ✅ Use `.env` files for local development (add to `.gitignore`)
- ❌ Never commit credentials to version control
- ❌ Never share credentials between environments

**Network Security:**
- Configure Azure SQL firewall rules to allow only trusted IPs per server
- Use VNet integration for production environments
- Enable SSL/TLS encryption (default in Azure SQL)
- Monitor connection attempts in Azure SQL audit logs
- Review audit logs regularly for unauthorized access attempts

**Query Safety:**
- All queries validated before execution
- Write operations blocked at multiple layers
- SQL comments removed to prevent comment-hiding attacks
- Credentials sanitized from error messages
- Audit logging tracks all queries with server:database context

### Performance

**Connection Pooling:**
- Default pool: 0 min, 10 max connections **per server:database combination**
- Connections reused across queries within same server:database
- Automatic health checks and reconnection
- Configure pool size based on total workload across all servers
- **Example:** 3 servers × 2 databases × 10 max = 60 max connections total

**Query Optimization:**
- Use `TOP` clause to limit result sets
- Add `WHERE` clauses to filter data
- Use indexes for better performance
- Avoid `SELECT *` - specify needed columns only
- Minimize cross-server queries (perform in separate calls)

**Result Limiting:**
- Default: 1000 row limit per query
- Default: 10MB response limit per query
- Default: 30-second timeout per query
- Configure limits based on needs
- Applies consistently across all servers

**Multi-Server Workflows:**
- Query multiple servers in parallel when possible
- Cache server/database lists to avoid repeated discovery calls
- Use discovery mode for dynamic environments
- Monitor total connection count across all servers

### Data Privacy

**Sensitive Data:**
- Avoid querying PII (personally identifiable information) when possible
- Mask sensitive data in query results (credit cards, SSN, etc.)
- Use views to hide sensitive columns
- Follow GDPR and compliance requirements
- Different data sensitivity levels per environment (prod vs dev)

**Environment Separation:**
- Never query production data from non-production tools
- Use anonymized data in development/test environments
- Audit all production data access
- Separate credentials ensure environment isolation

---

## Migration Guide

### Migrating from Single-Server to Multi-Server Configuration

If you have an existing single-server configuration and want to migrate to the new multi-server format:

#### Step 1: Identify Current Configuration

Your current configuration might look like this:

```bash
# Legacy single-server configuration
export AZURE_SQL_SERVER="myserver.database.windows.net"
export AZURE_SQL_DATABASE="ProductionDB"
export AZURE_SQL_PORT="1433"
export AZURE_SQL_USERNAME="mcp_readonly"
export AZURE_SQL_PASSWORD="MyPassword123!"
export AZURE_SQL_USE_AZURE_AD="false"
```

#### Step 2: Convert to Multi-Server Format

Transform your configuration into the new JSON array format:

```bash
# New multi-server configuration
export AZURE_SQL_SERVERS='[
  {
    "id": "prod-sql",
    "name": "Production SQL Server",
    "server": "myserver.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [
      {
        "name": "ProductionDB",
        "active": true,
        "description": "Main production database"
      }
    ],
    "username": "mcp_readonly",
    "password": "MyPassword123!",
    "useAzureAd": false,
    "description": "Production SQL Server"
  }
]'
```

#### Step 3: Remove Legacy Variables (Optional)

Once multi-server configuration is working, you can remove legacy variables:

```bash
# Remove these (after verifying multi-server works)
unset AZURE_SQL_SERVER
unset AZURE_SQL_DATABASE
unset AZURE_SQL_PORT
unset AZURE_SQL_USERNAME
unset AZURE_SQL_PASSWORD
unset AZURE_SQL_USE_AZURE_AD
unset AZURE_SQL_CLIENT_ID
unset AZURE_SQL_CLIENT_SECRET
unset AZURE_SQL_TENANT_ID
```

**Note:** Legacy variables will continue to work indefinitely (backward compatibility), so this step is optional.

#### Step 4: Add Additional Servers

Now you can add more servers to your configuration:

```bash
export AZURE_SQL_SERVERS='[
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
    "password": "ProdPassword123!",
    "useAzureAd": false
  },
  {
    "id": "dev-sql",
    "name": "Development SQL Server",
    "server": "dev-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [],
    "username": "mcp_readonly",
    "password": "DevPassword123!",
    "useAzureAd": false,
    "description": "Development server with database discovery"
  },
  {
    "id": "reporting-sql",
    "name": "Reporting SQL Server",
    "server": "reporting-server.database.windows.net",
    "port": 1433,
    "active": true,
    "databases": [
      {"name": "ReportingDB", "active": true}
    ],
    "useAzureAd": true,
    "azureAdClientId": "your-service-principal-id",
    "azureAdClientSecret": "your-service-principal-secret",
    "azureAdTenantId": "your-tenant-id",
    "description": "Reporting server with Azure AD auth"
  }
]'
```

#### Step 5: Update Tool Calls

Update your code to include the new `serverId` and `database` parameters:

**Before (single-server):**
```javascript
await mcpClient.invoke("sql-list-tables", {});
```

**After (multi-server):**
```javascript
// Discover servers
const servers = await mcpClient.invoke("sql-list-servers", {});

// Discover databases on a server
const databases = await mcpClient.invoke("sql-list-databases", {
  serverId: "prod-sql"
});

// Query tables
await mcpClient.invoke("sql-list-tables", {
  serverId: "prod-sql",
  database: "AppDB"
});
```

#### Step 6: Test Configuration

Verify your new configuration works:

```javascript
// 1. List all servers
const servers = await mcpClient.invoke("sql-list-servers", {});
console.log("Servers:", servers);

// 2. Test connection to each server
for (const server of servers) {
  if (server.active) {
    const databases = await mcpClient.invoke("sql-list-databases", {
      serverId: server.id
    });

    for (const db of databases) {
      if (db.active) {
        const result = await mcpClient.invoke("sql-test-connection", {
          serverId: server.id,
          database: db.name
        });
        console.log(`${server.id}/${db.name}: ${result.connected ? 'OK' : 'FAILED'}`);
      }
    }
  }
}
```

### Common Migration Scenarios

#### Scenario 1: Single Database → Multiple Databases on Same Server

**Before:**
```bash
export AZURE_SQL_SERVER="myserver.database.windows.net"
export AZURE_SQL_DATABASE="AppDB"
```

**After:**
```bash
export AZURE_SQL_SERVERS='[{
  "id": "prod-sql",
  "server": "myserver.database.windows.net",
  "databases": [
    {"name": "AppDB", "active": true},
    {"name": "AnalyticsDB", "active": true},
    {"name": "ReportingDB", "active": true}
  ],
  ...
}]'
```

#### Scenario 2: Adding Development Environment

**Before:**
```bash
export AZURE_SQL_SERVER="prod-server.database.windows.net"
export AZURE_SQL_DATABASE="ProductionDB"
```

**After:**
```bash
export AZURE_SQL_SERVERS='[
  {
    "id": "prod-sql",
    "server": "prod-server.database.windows.net",
    "databases": [{"name": "ProductionDB", "active": true}],
    ...
  },
  {
    "id": "dev-sql",
    "server": "dev-server.database.windows.net",
    "databases": [],
    ...
  }
]'
```

#### Scenario 3: Upgrading to Azure AD Authentication

**Before:**
```bash
export AZURE_SQL_SERVER="myserver.database.windows.net"
export AZURE_SQL_USERNAME="mcp_readonly"
export AZURE_SQL_PASSWORD="password"
```

**After:**
```bash
export AZURE_SQL_SERVERS='[{
  "id": "prod-sql",
  "server": "myserver.database.windows.net",
  "useAzureAd": true,
  "azureAdClientId": "client-id",
  "azureAdClientSecret": "client-secret",
  "azureAdTenantId": "tenant-id",
  ...
}]'
```

---

## Troubleshooting

### Multi-Server Configuration Errors

#### Error: "Missing Azure SQL Database configuration"

**Cause:** No servers configured in `AZURE_SQL_SERVERS` or legacy variables.

**Solution:**
1. **For multi-server setup:** Set `AZURE_SQL_SERVERS` environment variable with JSON array
2. **For single-server setup:** Set legacy variables (`AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE`)
3. Verify JSON syntax is valid (use online JSON validator)
4. Check for missing required fields (`id`, `name`, `server`, `active`, `databases`)

**Example:**
```bash
# Multi-server configuration
export AZURE_SQL_SERVERS='[{"id":"prod-sql","name":"Production","server":"prod.database.windows.net","port":1433,"active":true,"databases":[{"name":"AppDB","active":true}],"username":"readonly","password":"pass"}]'

# Or legacy single-server
export AZURE_SQL_SERVER="server.database.windows.net"
export AZURE_SQL_DATABASE="DatabaseName"
```

---

#### Error: "Server 'xyz' not found"

**Cause:** Server ID doesn't match any configured server.

**Solution:**
1. Use `sql-list-servers` to see all configured servers
2. Verify server ID matches exactly (case-sensitive)
3. Check that server `active` flag is `true`
4. Verify JSON configuration syntax

**Example:**
```javascript
// List available servers
const servers = await mcpClient.invoke("sql-list-servers", {});
console.log(servers); // Use correct ID from this list
```

---

#### Error: "Server 'xyz' is inactive"

**Cause:** Server configured but `active: false`.

**Solution:**
1. Update JSON configuration and set `"active": true`
2. Reload environment variables
3. Restart MCP server

**Example:**
```bash
# Update configuration
export AZURE_SQL_SERVERS='[{"id":"prod-sql",...,"active":true,...}]'
```

---

#### Error: "Database 'xyz' not configured on server"

**Cause:** Database not in server's `databases` array and not in discovery mode.

**Solution:**
1. **Add database to configuration:**
   ```json
   {
     "id": "prod-sql",
     "databases": [
       {"name": "AppDB", "active": true},
       {"name": "NewDB", "active": true}  // Add this
     ]
   }
   ```

2. **Or enable discovery mode:**
   ```json
   {
     "id": "prod-sql",
     "databases": []  // Empty array = discovery mode
   }
   ```

3. **Use sql-list-databases to see available databases:**
   ```javascript
   await mcpClient.invoke("sql-list-databases", { serverId: "prod-sql" });
   ```

---

#### Error: "Database 'xyz' is inactive"

**Cause:** Database configured but `active: false`.

**Solution:**
Update JSON configuration and set `"active": true` for the database.

---

### Connection Errors

#### Error: "Cannot connect to SQL Server"

**Cause:** Network connectivity or firewall issue.

**Solution:**
1. Verify server hostname in configuration: `your-server.database.windows.net`
2. Check Azure SQL firewall rules:
   - Go to Azure Portal → SQL Database → Firewalls and virtual networks
   - Add your IP address to allowed IPs
3. Verify port 1433 is accessible
4. Check if server requires VNet integration
5. Verify server is active in configuration

**Test Connection:**
```bash
# Test TCP connection (Linux/Mac)
nc -zv your-server.database.windows.net 1433

# Test TCP connection (Windows PowerShell)
Test-NetConnection -ComputerName your-server.database.windows.net -Port 1433
```

**Verify Configuration:**
```javascript
// List servers and check status
await mcpClient.invoke("sql-list-servers", {});

// Test connection to specific database
await mcpClient.invoke("sql-test-connection", {
  serverId: "prod-sql",
  database: "AppDB"
});
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
