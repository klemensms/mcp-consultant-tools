# Azure SQL Database Integration - Implementation Plan

## Overview

This document outlines the comprehensive plan to extend the MCP Consultant Tools server to support Azure SQL Database connectivity for investigation and analysis purposes. The integration will be **read-only** and focus on schema exploration and data querying.

### Goals

- Enable querying data from tables and views
- Provide schema exploration capabilities (tables, views, stored procedures, triggers, functions)
- Support investigation workflows for database analysis
- Maintain consistency with existing service architecture patterns
- Ensure security with read-only access and parameterized queries

### Scope

**In Scope:**
- Read-only database access (SELECT queries only)
- Schema metadata exploration (tables, views, columns, indexes, constraints)
- Object definition retrieval (views, stored procedures, triggers, functions)
- Execute user-provided SELECT queries with safety limits
- Azure SQL Database and SQL Server 2016+ support

**Out of Scope:**
- Write operations (INSERT, UPDATE, DELETE, MERGE)
- Schema modifications (CREATE, ALTER, DROP)
- Administrative operations (GRANT, REVOKE, backup, restore)
- Transaction management
- Stored procedure execution (read definitions only)

---

## Architecture & Design Patterns

The implementation follows the existing two-layer architecture established by PowerPlatform, Azure DevOps, and Figma integrations.

### Service Layer: `AzureSqlService.ts`

Located at: `src/AzureSqlService.ts`

**Responsibilities:**
- Manage Azure SQL Database connections with connection pooling
- Handle authentication (SQL Authentication or Azure AD)
- Provide methods for schema exploration and data querying
- Implement query safety mechanisms (timeouts, result limits)
- Format API responses consistently with other services

**Key Design Patterns:**
- **Lazy Initialization**: Service created on-demand when first SQL tool is invoked
- **Connection Pooling**: Reuse database connections efficiently using `mssql` pool
- **Parameterized Queries**: All queries use parameterized inputs to prevent SQL injection
- **Result Limiting**: Enforce maximum row limits on query results (default: 1000 rows)
- **Timeout Protection**: All queries have configurable timeouts (default: 30 seconds)

### MCP Server Layer: `index.ts`

**Integration Points:**
1. Add Azure SQL configuration interface and environment variable loading
2. Create lazy initialization function `getAzureSqlService()`
3. Register SQL tools with Zod schemas for validation
4. Register SQL prompts with template formatting
5. Implement tool handlers that delegate to `AzureSqlService`

---

## Dependencies

### Required NPM Packages

Add the following to `package.json` dependencies:

```json
{
  "mssql": "^11.0.1"
}
```

**Why `mssql`?**
- Most popular and maintained SQL Server driver for Node.js (10M+ weekly downloads)
- Full TypeScript support with type definitions included
- Built-in connection pooling
- Supports both SQL Authentication and Azure AD authentication
- Compatible with Azure SQL Database and SQL Server 2012+
- Streaming support for large result sets
- Prepared statements and parameterized queries

**Alternative Considered:**
- `tedious`: Lower-level TDS protocol library (used internally by `mssql`)
- Rejected because `mssql` provides higher-level abstractions we need

### Optional NPM Packages for Azure AD Auth

If implementing Azure AD authentication (recommended for production):

```json
{
  "@azure/identity": "^4.0.0"
}
```

**Why `@azure/identity`?**
- Provides `DefaultAzureCredential` for Azure AD authentication
- Supports Managed Identity, Service Principal, Azure CLI credentials
- Better security than SQL authentication (no passwords in config)
- Consistent with PowerPlatform's use of `@azure/msal-node`

---

## Configuration

### Environment Variables

Add the following to `.env.example` and documentation:

```bash
# Azure SQL Database Configuration (Optional)
AZURE_SQL_SERVER=myserver.database.windows.net
AZURE_SQL_DATABASE=mydatabase
AZURE_SQL_PORT=1433

# Authentication Method 1: SQL Authentication (username/password)
AZURE_SQL_USERNAME=sqladmin
AZURE_SQL_PASSWORD=SecurePassword123!

# Authentication Method 2: Azure AD Authentication (recommended for production)
AZURE_SQL_USE_AZURE_AD=false
AZURE_SQL_CLIENT_ID=your-azure-app-client-id
AZURE_SQL_CLIENT_SECRET=your-azure-app-client-secret
AZURE_SQL_TENANT_ID=your-azure-tenant-id

# Query Safety Limits
AZURE_SQL_QUERY_TIMEOUT=30000           # milliseconds (default: 30s)
AZURE_SQL_MAX_RESULT_ROWS=1000          # maximum rows returned (default: 1000)
AZURE_SQL_CONNECTION_TIMEOUT=15000       # milliseconds (default: 15s)

# Optional: Connection Pool Settings
AZURE_SQL_POOL_MIN=0                     # minimum pool connections (default: 0)
AZURE_SQL_POOL_MAX=10                    # maximum pool connections (default: 10)
```

### Configuration Interface

Define in `src/AzureSqlService.ts`:

```typescript
export interface AzureSqlConfig {
  server: string;                    // e.g., 'myserver.database.windows.net'
  database: string;                  // e.g., 'mydatabase'
  port?: number;                     // default: 1433

  // SQL Authentication (Method 1)
  username?: string;
  password?: string;

  // Azure AD Authentication (Method 2)
  useAzureAd?: boolean;              // default: false
  clientId?: string;                 // For service principal auth
  clientSecret?: string;
  tenantId?: string;

  // Query safety
  queryTimeout?: number;             // default: 30000ms
  maxResultRows?: number;            // default: 1000
  connectionTimeout?: number;        // default: 15000ms

  // Connection pooling
  poolMin?: number;                  // default: 0
  poolMax?: number;                  // default: 10
}
```

### Configuration Loading in `index.ts`

```typescript
const AZURE_SQL_CONFIG: AzureSqlConfig = {
  server: process.env.AZURE_SQL_SERVER || "",
  database: process.env.AZURE_SQL_DATABASE || "",
  port: parseInt(process.env.AZURE_SQL_PORT || "1433"),

  username: process.env.AZURE_SQL_USERNAME || "",
  password: process.env.AZURE_SQL_PASSWORD || "",

  useAzureAd: process.env.AZURE_SQL_USE_AZURE_AD === "true",
  clientId: process.env.AZURE_SQL_CLIENT_ID || "",
  clientSecret: process.env.AZURE_SQL_CLIENT_SECRET || "",
  tenantId: process.env.AZURE_SQL_TENANT_ID || "",

  queryTimeout: parseInt(process.env.AZURE_SQL_QUERY_TIMEOUT || "30000"),
  maxResultRows: parseInt(process.env.AZURE_SQL_MAX_RESULT_ROWS || "1000"),
  connectionTimeout: parseInt(process.env.AZURE_SQL_CONNECTION_TIMEOUT || "15000"),

  poolMin: parseInt(process.env.AZURE_SQL_POOL_MIN || "0"),
  poolMax: parseInt(process.env.AZURE_SQL_POOL_MAX || "10"),
};

let azureSqlService: AzureSqlService | null = null;

function getAzureSqlService(): AzureSqlService {
  if (!azureSqlService) {
    const missingConfig: string[] = [];
    if (!AZURE_SQL_CONFIG.server) missingConfig.push("server");
    if (!AZURE_SQL_CONFIG.database) missingConfig.push("database");

    if (!AZURE_SQL_CONFIG.useAzureAd) {
      // SQL Authentication requires username and password
      if (!AZURE_SQL_CONFIG.username) missingConfig.push("username");
      if (!AZURE_SQL_CONFIG.password) missingConfig.push("password");
    } else {
      // Azure AD requires service principal credentials
      if (!AZURE_SQL_CONFIG.clientId) missingConfig.push("clientId");
      if (!AZURE_SQL_CONFIG.clientSecret) missingConfig.push("clientSecret");
      if (!AZURE_SQL_CONFIG.tenantId) missingConfig.push("tenantId");
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing Azure SQL Database configuration: ${missingConfig.join(", ")}. ` +
        `Set these in environment variables (AZURE_SQL_*).`
      );
    }

    azureSqlService = new AzureSqlService(AZURE_SQL_CONFIG);
    console.error("Azure SQL Database service initialized");
  }

  return azureSqlService;
}
```

---

## Service Implementation: `AzureSqlService.ts`

### Class Structure

```typescript
import sql from 'mssql';
import { DefaultAzureCredential } from '@azure/identity'; // If using Azure AD

export interface AzureSqlConfig {
  // ... (as defined above)
}

export interface SqlApiCollectionResponse<T> {
  columns: string[];
  rows: T[];
  rowCount: number;
  truncated?: boolean; // If results were limited
}

export class AzureSqlService {
  private config: AzureSqlConfig;
  private pool: sql.ConnectionPool | null = null;

  constructor(config: AzureSqlConfig) {
    this.config = {
      ...config,
      port: config.port || 1433,
      queryTimeout: config.queryTimeout || 30000,
      maxResultRows: config.maxResultRows || 1000,
      connectionTimeout: config.connectionTimeout || 15000,
      poolMin: config.poolMin || 0,
      poolMax: config.poolMax || 10,
      useAzureAd: config.useAzureAd || false,
    };
  }

  /**
   * Initialize connection pool on demand
   */
  private async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    try {
      const poolConfig: sql.config = {
        server: this.config.server,
        database: this.config.database,
        port: this.config.port!,
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
        },
      };

      if (this.config.useAzureAd) {
        // Azure AD Authentication
        poolConfig.authentication = {
          type: 'azure-active-directory-service-principal-secret',
          options: {
            clientId: this.config.clientId!,
            clientSecret: this.config.clientSecret!,
            tenantId: this.config.tenantId!,
          },
        };
      } else {
        // SQL Authentication
        poolConfig.user = this.config.username;
        poolConfig.password = this.config.password;
      }

      this.pool = await sql.connect(poolConfig);
      console.error('Azure SQL connection pool established');

      return this.pool;
    } catch (error: any) {
      console.error('Failed to connect to Azure SQL Database:', error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  /**
   * Execute a SELECT query with safety limits
   */
  private async executeQuery<T = any>(
    query: string,
    parameters?: Record<string, any>
  ): Promise<SqlApiCollectionResponse<T>> {
    try {
      const pool = await this.getPool();
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

      // Enforce row limit
      const truncated = rows.length > this.config.maxResultRows!;
      const limitedRows = rows.slice(0, this.config.maxResultRows!);

      return {
        columns,
        rows: limitedRows,
        rowCount: limitedRows.length,
        truncated,
      };
    } catch (error: any) {
      console.error('SQL query execution failed:', {
        error: error.message,
        query: query.substring(0, 200), // Log first 200 chars
      });

      // Provide user-friendly error messages
      if (error.message.includes('timeout')) {
        throw new Error(
          `Query timeout exceeded (${this.config.queryTimeout}ms). ` +
          `Try simplifying your query or adding WHERE clause filters.`
        );
      }
      if (error.message.includes('permission denied')) {
        throw new Error(
          'Permission denied. Ensure the database user has SELECT permissions ' +
          'on the requested objects.'
        );
      }

      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Close connection pool (cleanup)
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      console.error('Azure SQL connection pool closed');
    }
  }

  // Tool methods (implement below)
  // ...
}
```

### Tool Methods to Implement

Each method corresponds to an MCP tool. Implement these in `AzureSqlService`:

#### 1. `listTables(): Promise<any[]>`

Lists all user tables in the database.

```typescript
async listTables(): Promise<any[]> {
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

  const result = await this.executeQuery(query);
  return result.rows;
}
```

#### 2. `listViews(): Promise<any[]>`

Lists all views in the database.

```typescript
async listViews(): Promise<any[]> {
  const query = `
    SELECT
      TABLE_SCHEMA as schemaName,
      TABLE_NAME as viewName,
      VIEW_DEFINITION as definition
    FROM INFORMATION_SCHEMA.VIEWS
    WHERE TABLE_SCHEMA != 'sys'
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `;

  const result = await this.executeQuery(query);
  return result.rows;
}
```

#### 3. `listStoredProcedures(): Promise<any[]>`

Lists all stored procedures.

```typescript
async listStoredProcedures(): Promise<any[]> {
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

  const result = await this.executeQuery(query);
  return result.rows;
}
```

#### 4. `listTriggers(): Promise<any[]>`

Lists all database triggers.

```typescript
async listTriggers(): Promise<any[]> {
  const query = `
    SELECT
      s.name as schemaName,
      t.name as triggerName,
      OBJECT_NAME(t.parent_id) as objectName,
      CASE
        WHEN OBJECTPROPERTY(t.object_id, 'ExecIsInsertTrigger') = 1 THEN 'INSERT'
        WHEN OBJECTPROPERTY(t.object_id, 'ExecIsUpdateTrigger') = 1 THEN 'UPDATE'
        WHEN OBJECTPROPERTY(t.object_id, 'ExecIsDeleteTrigger') = 1 THEN 'DELETE'
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

  const result = await this.executeQuery(query);
  return result.rows;
}
```

#### 5. `listFunctions(): Promise<any[]>`

Lists all user-defined functions.

```typescript
async listFunctions(): Promise<any[]> {
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

  const result = await this.executeQuery(query);
  return result.rows;
}
```

#### 6. `getTableSchema(schemaName: string, tableName: string): Promise<any>`

Gets detailed schema information for a table.

```typescript
async getTableSchema(schemaName: string, tableName: string): Promise<any> {
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

  const columnsResult = await this.executeQuery(columnsQuery, {
    schema: schemaName,
    table: tableName,
  });

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

  const indexesResult = await this.executeQuery(indexesQuery, {
    schema: schemaName,
    table: tableName,
  });

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

  const foreignKeysResult = await this.executeQuery(foreignKeysQuery, {
    schema: schemaName,
    table: tableName,
  });

  return {
    schemaName,
    tableName,
    columns: columnsResult.rows,
    indexes: indexesResult.rows,
    foreignKeys: foreignKeysResult.rows,
  };
}
```

#### 7. `getObjectDefinition(schemaName: string, objectName: string, objectType: string): Promise<any>`

Gets the SQL definition for views, stored procedures, functions, or triggers.

```typescript
async getObjectDefinition(
  schemaName: string,
  objectName: string,
  objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER'
): Promise<any> {
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

  const result = await this.executeQuery(query, {
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
```

#### 8. `executeSelectQuery(query: string): Promise<SqlApiCollectionResponse<any>>`

Executes a user-provided SELECT query with safety validation.

```typescript
async executeSelectQuery(query: string): Promise<SqlApiCollectionResponse<any>> {
  // Validate query is SELECT only
  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery.startsWith('select')) {
    throw new Error(
      'Only SELECT queries are allowed. ' +
      'Write operations (INSERT, UPDATE, DELETE, etc.) are not permitted.'
    );
  }

  // Check for dangerous keywords
  const dangerousKeywords = [
    'insert', 'update', 'delete', 'drop', 'create', 'alter',
    'truncate', 'exec', 'execute', 'sp_', 'xp_', 'grant', 'revoke'
  ];

  for (const keyword of dangerousKeywords) {
    if (trimmedQuery.includes(keyword)) {
      throw new Error(
        `Query contains forbidden keyword: ${keyword}. ` +
        `Only SELECT queries are allowed for investigation purposes.`
      );
    }
  }

  // Execute query with limits
  const result = await this.executeQuery(query);

  if (result.truncated) {
    console.error(
      `Query results truncated. Returned ${result.rowCount} of potentially more rows. ` +
      `Maximum: ${this.config.maxResultRows}. Add WHERE clause to filter results.`
    );
  }

  return result;
}
```

---

## MCP Tools to Implement

Register these tools in `index.ts` with Zod schemas and handlers.

### Tool Definitions

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `sql-list-tables` | List all user tables in the database | None |
| `sql-list-views` | List all views in the database | None |
| `sql-list-stored-procedures` | List all stored procedures | None |
| `sql-list-triggers` | List all database triggers | None |
| `sql-list-functions` | List all user-defined functions | None |
| `sql-get-table-schema` | Get detailed schema for a table (columns, indexes, foreign keys) | `schemaName`, `tableName` |
| `sql-get-object-definition` | Get SQL definition for a view, procedure, function, or trigger | `schemaName`, `objectName`, `objectType` |
| `sql-execute-query` | Execute a SELECT query with safety limits | `query` |

### Tool Registration Example

```typescript
server.tool(
  "sql-list-tables",
  "List all user tables in the Azure SQL Database",
  {},
  async () => {
    try {
      const sqlService = getAzureSqlService();
      const tables = await sqlService.listTables();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tables, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing tables: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "sql-get-table-schema",
  "Get detailed schema information for a table including columns, indexes, and foreign keys",
  {
    schemaName: z.string().describe("Schema name (e.g., 'dbo')"),
    tableName: z.string().describe("Table name"),
  },
  async ({ schemaName, tableName }) => {
    try {
      const sqlService = getAzureSqlService();
      const schema = await sqlService.getTableSchema(schemaName, tableName);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting table schema: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "sql-execute-query",
  "Execute a SELECT query against the Azure SQL Database (read-only, with result limits)",
  {
    query: z.string().describe("SELECT query to execute (e.g., 'SELECT TOP 10 * FROM dbo.Users WHERE IsActive = 1')"),
  },
  async ({ query }) => {
    try {
      const sqlService = getAzureSqlService();
      const result = await sqlService.executeSelectQuery(query);

      let text = JSON.stringify(result, null, 2);

      if (result.truncated) {
        text += `\n\n⚠️ WARNING: Results truncated to ${result.rowCount} rows. Add WHERE clause to filter results.`;
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing query: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);
```

---

## MCP Prompts to Implement

Prompts provide formatted, human-readable context from SQL data.

### Prompt Definitions

| Prompt Name | Description | Parameters |
|-------------|-------------|------------|
| `sql-database-overview` | Comprehensive overview of database schema with all objects | None |
| `sql-table-details` | Detailed report for a specific table with columns, indexes, and relationships | `schemaName`, `tableName` |
| `sql-query-results` | Execute query and return formatted results with column headers | `query` |

### Prompt Templates

```typescript
const azureSqlPrompts = {
  DATABASE_OVERVIEW: () =>
    `## Azure SQL Database Overview\n\n` +
    `This is a comprehensive overview of the connected Azure SQL Database:\n\n` +
    `### Tables\n{{tables}}\n\n` +
    `### Views\n{{views}}\n\n` +
    `### Stored Procedures\n{{stored_procedures}}\n\n` +
    `### Triggers\n{{triggers}}\n\n` +
    `### Functions\n{{functions}}\n\n` +
    `You can query tables and views using the sql-execute-query tool.`,

  TABLE_DETAILS: (schemaName: string, tableName: string) =>
    `## Table: ${schemaName}.${tableName}\n\n` +
    `Detailed information for table '${schemaName}.${tableName}':\n\n` +
    `### Columns\n{{columns}}\n\n` +
    `### Indexes\n{{indexes}}\n\n` +
    `### Foreign Keys\n{{foreign_keys}}\n\n` +
    `### Sample Query\n` +
    `\`\`\`sql\n` +
    `SELECT TOP 100 * FROM ${schemaName}.${tableName}\n` +
    `\`\`\``,

  QUERY_RESULTS: (query: string) =>
    `## Query Results\n\n` +
    `**Query:**\n\`\`\`sql\n${query}\n\`\`\`\n\n` +
    `**Results:**\n{{results}}\n\n` +
    `**Row Count:** {{row_count}}`,
};
```

### Prompt Registration Example

```typescript
server.prompt(
  "sql-database-overview",
  "Get a comprehensive overview of the Azure SQL Database schema",
  {},
  async () => {
    const sqlService = getAzureSqlService();

    const [tables, views, storedProcs, triggers, functions] = await Promise.all([
      sqlService.listTables(),
      sqlService.listViews(),
      sqlService.listStoredProcedures(),
      sqlService.listTriggers(),
      sqlService.listFunctions(),
    ]);

    let template = azureSqlPrompts.DATABASE_OVERVIEW();

    template = template.replace('{{tables}}', formatTableList(tables));
    template = template.replace('{{views}}', formatViewList(views));
    template = template.replace('{{stored_procedures}}', formatProcedureList(storedProcs));
    template = template.replace('{{triggers}}', formatTriggerList(triggers));
    template = template.replace('{{functions}}', formatFunctionList(functions));

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: template,
          },
        },
      ],
    };
  }
);
```

---

## Security Considerations

### Authentication

**Recommended Approach: Azure AD Service Principal**
- No passwords stored in configuration
- Centralized access management via Azure RBAC
- Audit trail in Azure AD logs
- Can be revoked centrally

**Alternative: SQL Authentication**
- Simpler setup for development
- Requires secure password storage (use Azure Key Vault in production)
- Less auditable than Azure AD

### Database Permissions

Grant minimal permissions to the database user:

```sql
-- Create a read-only user (SQL Authentication)
CREATE USER [mcp_readonly] WITH PASSWORD = 'SecurePassword123!';

-- Grant read-only access
ALTER ROLE db_datareader ADD MEMBER [mcp_readonly];

-- Grant view definition permissions (for stored procs, views, triggers)
GRANT VIEW DEFINITION TO [mcp_readonly];

-- Optional: Grant access to system views for metadata
GRANT SELECT ON sys.tables TO [mcp_readonly];
GRANT SELECT ON sys.columns TO [mcp_readonly];
GRANT SELECT ON sys.indexes TO [mcp_readonly];
GRANT SELECT ON sys.objects TO [mcp_readonly];
```

For Azure AD authentication, assign the **SQL DB Contributor** or custom role with similar permissions.

### Query Safety Mechanisms

1. **Query Validation**: Block non-SELECT statements
2. **Keyword Blacklist**: Reject queries with dangerous keywords (INSERT, DELETE, EXEC, etc.)
3. **Result Limiting**: Enforce maximum row count (default: 1000)
4. **Timeout Protection**: All queries timeout after 30 seconds (configurable)
5. **Parameterized Queries**: Use parameterized inputs for all internal queries
6. **Connection Pooling**: Limit concurrent connections (default max: 10)

### Error Handling

- Never expose connection strings or credentials in error messages
- Log errors to stderr (not stdout, per MCP protocol)
- Provide user-friendly error messages without sensitive details
- Catch and handle common errors (timeout, permission denied, not found)

---

## Testing Strategy

### Unit Tests

Create `tests/AzureSqlService.test.ts`:

```typescript
import { AzureSqlService } from '../src/AzureSqlService';

describe('AzureSqlService', () => {
  let service: AzureSqlService;

  beforeAll(() => {
    service = new AzureSqlService({
      server: process.env.TEST_SQL_SERVER!,
      database: process.env.TEST_SQL_DATABASE!,
      username: process.env.TEST_SQL_USERNAME!,
      password: process.env.TEST_SQL_PASSWORD!,
    });
  });

  afterAll(async () => {
    await service.close();
  });

  test('listTables returns user tables', async () => {
    const tables = await service.listTables();
    expect(Array.isArray(tables)).toBe(true);
  });

  test('getTableSchema returns schema details', async () => {
    const schema = await service.getTableSchema('dbo', 'Users');
    expect(schema).toHaveProperty('columns');
    expect(schema).toHaveProperty('indexes');
    expect(schema).toHaveProperty('foreignKeys');
  });

  test('executeSelectQuery blocks INSERT statements', async () => {
    await expect(
      service.executeSelectQuery('INSERT INTO Users (Name) VALUES (\'Test\')')
    ).rejects.toThrow('Only SELECT queries are allowed');
  });

  test('executeSelectQuery blocks EXEC statements', async () => {
    await expect(
      service.executeSelectQuery('EXEC sp_who')
    ).rejects.toThrow('forbidden keyword: exec');
  });

  test('executeSelectQuery enforces result limits', async () => {
    const result = await service.executeSelectQuery('SELECT * FROM LargeTable');
    expect(result.rowCount).toBeLessThanOrEqual(1000);
  });
});
```

### Integration Tests

Create `tests/integration/azure-sql.integration.test.ts`:

```typescript
import { McpClient } from '@modelcontextprotocol/sdk/client/mcp.js';

describe('Azure SQL MCP Integration', () => {
  let client: McpClient;

  beforeAll(async () => {
    // Initialize MCP client and connect to server
    client = await initializeMcpClient();
  });

  afterAll(async () => {
    await client.close();
  });

  test('sql-list-tables tool returns tables', async () => {
    const result = await client.callTool('sql-list-tables', {});
    expect(result.content[0].text).toContain('schemaName');
    expect(result.content[0].text).toContain('tableName');
  });

  test('sql-execute-query tool executes SELECT', async () => {
    const result = await client.callTool('sql-execute-query', {
      query: 'SELECT TOP 5 * FROM dbo.Users',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.rows.length).toBeLessThanOrEqual(5);
  });

  test('sql-database-overview prompt returns formatted report', async () => {
    const result = await client.getPrompt('sql-database-overview', {});
    expect(result.messages[0].content.text).toContain('Azure SQL Database Overview');
    expect(result.messages[0].content.text).toContain('### Tables');
  });
});
```

### Manual Testing Checklist

- [ ] Connect to Azure SQL Database using SQL authentication
- [ ] Connect to Azure SQL Database using Azure AD authentication
- [ ] List all tables and verify results
- [ ] List all views and verify results
- [ ] Get table schema with columns, indexes, foreign keys
- [ ] Get object definition for a view
- [ ] Get object definition for a stored procedure
- [ ] Execute a simple SELECT query
- [ ] Execute a SELECT query that returns >1000 rows (verify truncation)
- [ ] Attempt to execute an INSERT query (verify rejection)
- [ ] Attempt to execute an EXEC query (verify rejection)
- [ ] Test query timeout with a slow query
- [ ] Test connection timeout by using invalid server
- [ ] Test authentication failure with wrong credentials
- [ ] Verify prompts return formatted markdown

---

## Implementation Steps

### Phase 1: Foundation (1-2 hours)

1. **Add Dependencies**
   ```bash
   npm install mssql@^11.0.1
   npm install --save-dev @types/mssql
   ```

2. **Create Configuration**
   - Update `.env.example` with Azure SQL variables
   - Add configuration interface to project

3. **Create Service Skeleton**
   - Create `src/AzureSqlService.ts`
   - Implement config interface
   - Implement constructor and connection pool management

### Phase 2: Core Service Methods (2-3 hours)

4. **Implement Schema Exploration Methods**
   - `listTables()`
   - `listViews()`
   - `listStoredProcedures()`
   - `listTriggers()`
   - `listFunctions()`
   - `getTableSchema()`
   - `getObjectDefinition()`

5. **Implement Query Execution**
   - `executeQuery()` (private helper)
   - `executeSelectQuery()` (public, with validation)

6. **Add Error Handling**
   - Timeout handling
   - Permission errors
   - Connection failures
   - User-friendly error messages

### Phase 3: MCP Integration (2-3 hours)

7. **Register Tools in `index.ts`**
   - Add configuration loading
   - Implement lazy initialization function
   - Register 8 SQL tools with Zod schemas
   - Implement tool handlers

8. **Register Prompts in `index.ts`**
   - Add prompt templates
   - Register 3 SQL prompts
   - Implement prompt handlers with template formatting

### Phase 4: Testing & Documentation (2-3 hours)

9. **Write Tests**
   - Unit tests for `AzureSqlService`
   - Integration tests for MCP tools
   - Manual testing checklist execution

10. **Update Documentation**
    - Update `README.md` with Azure SQL section
    - Update `SETUP.md` with configuration instructions
    - Update `TOOLS.md` with SQL tool documentation
    - Update `CLAUDE.md` with architecture notes

11. **Update Configuration Examples**
    - Update `claude_desktop_config.example.json` with SQL variables
    - Update `.env.example` with SQL configuration

### Phase 5: Optional Enhancements (Future)

12. **Advanced Features** (optional, for v2)
    - Execution plan analysis tool
    - Index usage statistics tool
    - Query performance recommendations
    - Table statistics and health checks
    - Schema comparison between databases
    - Export query results to CSV/JSON

---

## Example Usage

### Scenario: Investigate a Database

**Goal**: Explore an Azure SQL Database to understand its schema and query data.

**Steps:**

1. **Configure Environment**

```bash
# .env file
AZURE_SQL_SERVER=mycompany.database.windows.net
AZURE_SQL_DATABASE=ProductionDB
AZURE_SQL_USERNAME=mcp_readonly
AZURE_SQL_PASSWORD=SecurePassword123!
AZURE_SQL_QUERY_TIMEOUT=30000
AZURE_SQL_MAX_RESULT_ROWS=1000
```

2. **Get Database Overview**

```javascript
// Using prompt
const overview = await mcpClient.getPrompt('sql-database-overview', {});
console.log(overview.messages[0].content.text);

// Output:
// ## Azure SQL Database Overview
//
// ### Tables
// - dbo.Users (15,234 rows, 12.5 MB)
// - dbo.Orders (45,678 rows, 34.2 MB)
// - dbo.Products (1,234 rows, 2.1 MB)
//
// ### Views
// - dbo.vw_ActiveUsers
// - dbo.vw_OrderSummary
// ...
```

3. **Explore a Table**

```javascript
// Using tool
const tableSchema = await mcpClient.callTool('sql-get-table-schema', {
  schemaName: 'dbo',
  tableName: 'Users',
});

console.log(JSON.parse(tableSchema.content[0].text));

// Output:
// {
//   "schemaName": "dbo",
//   "tableName": "Users",
//   "columns": [
//     { "columnName": "UserId", "dataType": "int", "isNullable": "NO", "isIdentity": 1 },
//     { "columnName": "Email", "dataType": "nvarchar", "maxLength": 255, "isNullable": "NO" },
//     { "columnName": "CreatedDate", "dataType": "datetime", "isNullable": "NO" }
//   ],
//   "indexes": [
//     { "indexName": "PK_Users", "indexType": "CLUSTERED", "isPrimaryKey": true, "columns": "UserId" },
//     { "indexName": "IX_Users_Email", "indexType": "NONCLUSTERED", "isUnique": true, "columns": "Email" }
//   ],
//   "foreignKeys": []
// }
```

4. **Query Data**

```javascript
// Using tool
const queryResult = await mcpClient.callTool('sql-execute-query', {
  query: 'SELECT TOP 10 UserId, Email, CreatedDate FROM dbo.Users WHERE IsActive = 1 ORDER BY CreatedDate DESC',
});

console.log(JSON.parse(queryResult.content[0].text));

// Output:
// {
//   "columns": ["UserId", "Email", "CreatedDate"],
//   "rows": [
//     { "UserId": 12345, "Email": "user1@example.com", "CreatedDate": "2025-11-06T10:30:00" },
//     { "UserId": 12346, "Email": "user2@example.com", "CreatedDate": "2025-11-06T09:15:00" },
//     ...
//   ],
//   "rowCount": 10,
//   "truncated": false
// }
```

5. **Investigate Stored Procedures**

```javascript
// List all stored procedures
const procs = await mcpClient.callTool('sql-list-stored-procedures', {});
console.log(JSON.parse(procs.content[0].text));

// Get definition of a specific procedure
const procDef = await mcpClient.callTool('sql-get-object-definition', {
  schemaName: 'dbo',
  objectName: 'usp_GetUserOrders',
  objectType: 'PROCEDURE',
});

console.log(JSON.parse(procDef.content[0].text).definition);

// Output:
// CREATE PROCEDURE [dbo].[usp_GetUserOrders]
//   @UserId INT
// AS
// BEGIN
//   SELECT o.OrderId, o.OrderDate, o.TotalAmount
//   FROM dbo.Orders o
//   WHERE o.UserId = @UserId
//   ORDER BY o.OrderDate DESC
// END
```

---

## Risks & Mitigations

### Risk: Excessive Query Resource Usage

**Mitigation:**
- Enforce query timeouts (30s default)
- Limit result set size (1000 rows default)
- Use connection pooling with max connections (10 default)
- Monitor query patterns and add usage logging

### Risk: SQL Injection Attacks

**Mitigation:**
- Use parameterized queries for all internal queries
- Validate user queries before execution (block dangerous keywords)
- Grant minimal database permissions (read-only)
- User queries are executed as-is but validated first (no string concatenation)

### Risk: Credential Exposure

**Mitigation:**
- Store credentials in environment variables (never in code)
- Use Azure AD authentication in production (no passwords)
- Never log connection strings or credentials
- Use Azure Key Vault for production secrets

### Risk: Database Performance Impact

**Mitigation:**
- Read-only access prevents data modifications
- Query timeouts prevent long-running queries
- Connection pooling prevents connection exhaustion
- Result limiting prevents memory issues

### Risk: MCP Protocol Corruption

**Mitigation:**
- Use `console.error()` for all logging (writes to stderr)
- Never use `console.log()` (writes to stdout, breaks JSON protocol)
- Follow existing pattern established in other services

---

## Future Enhancements (v2)

These are potential enhancements for future versions:

1. **Query Performance Analysis**
   - Tool to get execution plans (SHOWPLAN_XML)
   - Tool to analyze query performance
   - Tool to suggest index improvements

2. **Database Health Monitoring**
   - Tool to get database statistics
   - Tool to check index fragmentation
   - Tool to identify missing indexes
   - Tool to analyze table sizes and growth

3. **Schema Comparison**
   - Tool to compare schemas between databases
   - Tool to generate schema diff reports
   - Tool to identify schema drift

4. **Advanced Query Features**
   - Support for query parameters in user queries
   - Support for CTE (Common Table Expressions)
   - Support for window functions
   - Export results to CSV/JSON files

5. **Multi-Database Support**
   - Connect to multiple databases simultaneously
   - Cross-database queries
   - Database comparison tools

6. **Azure Synapse Analytics Support**
   - Dedicated column store query optimization
   - External table support
   - Polybase query support

---

## Summary

This implementation plan provides a comprehensive roadmap to extend the MCP Consultant Tools server with Azure SQL Database connectivity. The design follows established patterns in the codebase, ensures security with read-only access, and provides a rich set of tools for database investigation.

**Key Features:**
- ✅ Read-only database access (investigation purposes)
- ✅ Schema exploration (tables, views, stored procedures, triggers, functions)
- ✅ Data querying with safety limits
- ✅ Consistent architecture with existing services
- ✅ Security-first design (query validation, timeouts, result limits)
- ✅ Azure AD and SQL authentication support

**Estimated Implementation Time:** 8-12 hours

**Dependencies:** `mssql` (SQL Server driver for Node.js)

**Testing:** Unit tests, integration tests, manual testing checklist

**Documentation:** README, SETUP, TOOLS, CLAUDE.md updates

---

## Questions & Decisions

**Decision Points for Implementation:**

1. **Authentication Method**:
   - Start with SQL authentication for simplicity
   - Add Azure AD authentication as optional enhancement

2. **Result Limiting**:
   - Default: 1000 rows
   - Make configurable via environment variable
   - Show warning when results are truncated

3. **Query Validation**:
   - Use keyword blacklist for simplicity
   - Consider SQL parser library for more robust validation (future enhancement)

4. **Connection Pooling**:
   - Use `mssql` built-in pooling
   - Default: min=0, max=10 connections
   - Make configurable via environment variables

5. **Error Handling**:
   - Follow existing pattern: `console.error()` for logging
   - User-friendly error messages without sensitive details
   - Structured error responses in MCP format

**Open Questions:**

- Should we support stored procedure execution (read-only procedures)?
  - **Recommendation**: No, in v1. Only read definitions. Add in v2 if needed.

- Should we support multiple database connections simultaneously?
  - **Recommendation**: No, in v1. Single database per service instance. Add multi-DB support in v2.

- Should we include query result caching?
  - **Recommendation**: No, in v1. Results should always be fresh for investigation. Consider in v2 for performance.

---

**End of Implementation Plan**