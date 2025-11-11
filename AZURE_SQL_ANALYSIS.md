# Azure SQL Database Integration Analysis

## Executive Summary

The Azure SQL Database integration uses a **single-database configuration** pattern (NOT multi-resource). This is fundamentally different from other integrations like Application Insights, Log Analytics, Service Bus, and SharePoint which support **multi-resource configurations**.

### Key Finding: Design Inconsistency
- **Azure SQL**: Single database only (all operations go to one server/database)
- **Other Integrations**: Multi-resource support (App Insights, Log Analytics, Service Bus, SharePoint)

This analysis reveals the architectural difference and provides the pattern for implementing multi-database support.

---

## 1. Current Azure SQL Configuration Structure

### 1.1 AzureSqlConfig Interface (src/AzureSqlService.ts, lines 8-31)

```typescript
export interface AzureSqlConfig {
  server: string;              // Single server
  database: string;            // Single database
  port?: number;               // Optional: 1433 default

  // SQL Authentication (Method 1)
  username?: string;
  password?: string;

  // Azure AD Authentication (Method 2)
  useAzureAd?: boolean;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;

  // Query safety limits
  queryTimeout?: number;       // Default: 30000ms
  maxResultRows?: number;      // Default: 1000 rows
  connectionTimeout?: number;  // Default: 15000ms

  // Connection pooling
  poolMin?: number;            // Default: 0
  poolMax?: number;            // Default: 10
}
```

**Design Observation**: No `resources` array - single database configuration only.

### 1.2 Environment Variable Configuration (src/index.ts, lines 149-169)

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
```

**Note**: All variables are hardcoded to single server/database. No JSON parsing.

### 1.3 Environment Variables (.env.example)

```
# Single database configuration only
AZURE_SQL_SERVER=myserver.database.windows.net
AZURE_SQL_DATABASE=mydatabase
AZURE_SQL_PORT=1433

# SQL Authentication (Option 1)
AZURE_SQL_USERNAME=mcp_readonly
AZURE_SQL_PASSWORD=SecurePassword123!

# OR Azure AD Authentication (Option 2)
AZURE_SQL_USE_AZURE_AD=false
AZURE_SQL_CLIENT_ID=your-azure-app-client-id
AZURE_SQL_CLIENT_SECRET=your-azure-app-client-secret
AZURE_SQL_TENANT_ID=your-azure-tenant-id

# Query safety settings
AZURE_SQL_QUERY_TIMEOUT=30000
AZURE_SQL_MAX_RESULT_ROWS=1000
AZURE_SQL_CONNECTION_TIMEOUT=15000

# Connection pooling
AZURE_SQL_POOL_MIN=0
AZURE_SQL_POOL_MAX=10
```

---

## 2. Credential Management

### 2.1 Two Authentication Methods

#### Method 1: SQL Authentication (Default)
```typescript
if (this.config.useAzureAd === false) {  // Default
  poolConfig.user = this.config.username;
  poolConfig.password = this.config.password;
}
```
- Uses SQL Server login credentials
- Simpler for development
- Less secure (stored passwords)

#### Method 2: Azure AD (Service Principal)
```typescript
if (this.config.useAzureAd === true) {
  poolConfig.authentication = {
    type: 'azure-active-directory-service-principal-secret',
    options: {
      clientId: this.config.clientId!,
      clientSecret: this.config.clientSecret!,
      tenantId: this.config.tenantId!,
    },
  };
}
```
- Token-based authentication
- More secure (no stored passwords)
- Requires Azure AD app registration

### 2.2 Credential Sanitization (src/AzureSqlService.ts, lines 228-234)

The service sanitizes error messages to prevent credential leakage:

```typescript
private sanitizeErrorMessage(message: string): string {
  return message
    .replace(/password=[^;]+/gi, 'password=***')
    .replace(/pwd=[^;]+/gi, 'pwd=***')
    .replace(/clientSecret=[^;]+/gi, 'clientSecret=***')
    .replace(/Authentication=ActiveDirectoryServicePrincipal;([^;]*);/gi, 'Authentication=***;');
}
```

**Pattern**: All error messages are sanitized before being returned or logged.

### 2.3 Token Caching (Only for PowerPlatform, Not SQL)

Azure SQL Service does NOT implement token caching. Each connection uses credentials directly without token management.

**Note**: Unlike PowerPlatform Service (which caches tokens), Azure SQL just passes credentials to the mssql library for connection pooling.

---

## 3. Connection Pooling Implementation

### 3.1 Lazy Initialization with Health Checks (src/AzureSqlService.ts, lines 160-223)

```typescript
private async getPool(): Promise<sql.ConnectionPool> {
  // Check if pool exists, is connected, and is healthy
  if (this.pool && this.pool.connected && this.pool.healthy) {
    return this.pool;
  }

  // Close unhealthy pool if it exists
  if (this.pool && !this.pool.healthy) {
    try {
      await this.pool.close();
    } catch (error) {
      console.error('Error closing unhealthy pool:', error);
    }
    this.pool = null;
  }

  // Create pool configuration
  const poolConfig: sql.config = {
    server: this.config.server,
    database: this.config.database,
    port: this.config.port!,
    connectionTimeout: this.config.connectionTimeout!,
    requestTimeout: this.config.queryTimeout!,
    pool: {
      min: this.config.poolMin!,    // Default: 0
      max: this.config.poolMax!,    // Default: 10
      idleTimeoutMillis: 30000,     // 30 seconds idle timeout
    },
    options: {
      encrypt: true,               // SSL/TLS required for Azure SQL
      trustServerCertificate: false,
      enableArithAbort: true,
    },
  };
  
  // Set authentication method
  if (this.config.useAzureAd) {
    // Azure AD configuration
  } else {
    // SQL Authentication configuration
  }

  // Connect and return pool
  this.pool = await sql.connect(poolConfig);
  console.error('Azure SQL connection pool established');
  return this.pool;
}
```

**Key Features**:
- Lazy initialization (created on first query, not in constructor)
- Health checks (detects unhealthy pools)
- Auto-recovery (closes and recreates unhealthy connections)
- Connection pooling (min: 0, max: 10 connections)
- Idle timeout (30 seconds)
- SSL/TLS encryption required (Azure SQL requirement)

### 3.2 Service Constructor (lines 144-155)

```typescript
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
      useAzureAd: config.useAzureAd ?? false,
    };
  }
}
```

**Pattern**: Configuration merging with defaults - no service initialization in constructor.

### 3.3 Cleanup Handler (src/index.ts, lifecycle management)

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

**Pattern**: Pool is closed gracefully on process shutdown.

---

## 4. Tool Definitions in src/index.ts

### 4.1 Service Initialization (lines 447-478)

```typescript
let azureSqlService: AzureSqlService | null = null;

function getAzureSqlService(): AzureSqlService {
  if (!azureSqlService) {
    // Validate required configuration
    const missingConfig: string[] = [];
    if (!AZURE_SQL_CONFIG.server) missingConfig.push("server");
    if (!AZURE_SQL_CONFIG.database) missingConfig.push("database");

    if (!AZURE_SQL_CONFIG.useAzureAd) {
      // SQL Authentication validation
      if (!AZURE_SQL_CONFIG.username) missingConfig.push("username");
      if (!AZURE_SQL_CONFIG.password) missingConfig.push("password");
    } else {
      // Azure AD validation
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

    // Initialize service
    azureSqlService = new AzureSqlService(AZURE_SQL_CONFIG);
    console.error("Azure SQL Database service initialized");
  }

  return azureSqlService;
}
```

**Pattern**: Lazy initialization with validation and single service instance.

### 4.2 SQL Tool Definitions (9 total)

All tools follow the same pattern: parameter validation → service call → result formatting.

#### Schema Exploration Tools:

1. **sql-test-connection** (lines 7904-7930)
   - No parameters
   - Calls: `sqlService.testConnection()`
   - Returns: Connection test result with SQL version, current database, login info

2. **sql-list-tables** (lines 7938-7970)
   - No parameters
   - Calls: `sqlService.listTables()`
   - Returns: Table list with row counts and sizes

3. **sql-list-views** (lines 7978-8010)
   - No parameters
   - Calls: `sqlService.listViews()`
   - Returns: View list with definitions

4. **sql-list-stored-procedures** (lines 8018-8050)
   - No parameters
   - Calls: `sqlService.listStoredProcedures()`
   - Returns: Procedure list with created/modified dates

5. **sql-list-triggers** (lines 8058-8090)
   - No parameters
   - Calls: `sqlService.listTriggers()`
   - Returns: Trigger list with event types and status

6. **sql-list-functions** (lines 8098-8130)
   - No parameters
   - Calls: `sqlService.listFunctions()`
   - Returns: Function list with return types

7. **sql-get-table-schema** (lines 8138-8167)
   - Parameters: `schemaName` (string), `tableName` (string)
   - Calls: `sqlService.getTableSchema(schemaName, tableName)`
   - Returns: Detailed schema with columns, indexes, foreign keys

8. **sql-get-object-definition** (lines 8175-8218)
   - Parameters: `schemaName` (string), `objectName` (string), `objectType` (string enum)
   - Calls: `sqlService.getObjectDefinition(schemaName, objectName, objectType)`
   - Returns: SQL definition with metadata

#### Query Execution Tool:

9. **sql-execute-query** (lines 8226-8273)
   - Parameters: `query` (string - SELECT only)
   - Calls: `sqlService.executeSelectQuery(query)`
   - Returns: Formatted results with column names and rows
   - **CRITICAL**: Query validation with dangerous keyword detection

---

## 5. Multi-Resource Configuration Patterns (Other Integrations)

### 5.1 Application Insights Pattern (src/index.ts, lines 119-147)

```typescript
interface ApplicationInsightsResourceConfig {
  id: string;
  name: string;
  appId: string;
  active: boolean;
  apiKey?: string;
  description?: string;
}

interface ApplicationInsightsConfig {
  resources: ApplicationInsightsResourceConfig[];  // ARRAY!
  authMethod: 'entra-id' | 'api-key';
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

// Configuration parsing
const APPINSIGHTS_CONFIG: ApplicationInsightsConfig = {
  resources: [],
  authMethod: (process.env.APPINSIGHTS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'api-key',
  tenantId: process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.APPINSIGHTS_CLIENT_SECRET || '',
};

// Parse multi-resource configuration (JSON array)
if (process.env.APPINSIGHTS_RESOURCES) {
  try {
    APPINSIGHTS_CONFIG.resources = JSON.parse(process.env.APPINSIGHTS_RESOURCES);
  } catch (error) {
    console.error('Failed to parse APPINSIGHTS_RESOURCES:', error);
  }
} else if (process.env.APPINSIGHTS_APP_ID) {
  // Fallback to single-resource configuration
  APPINSIGHTS_CONFIG.resources = [
    {
      id: 'default',
      name: 'Default Application Insights',
      appId: process.env.APPINSIGHTS_APP_ID,
      active: true,
      apiKey: process.env.APPINSIGHTS_API_KEY || '',
      description: 'Default Application Insights resource',
    },
  ];
}
```

**Environment Variables**:
```
# Multi-resource (JSON array)
APPINSIGHTS_RESOURCES=[{"id":"prod-api","name":"Production API","appId":"...","active":true}]

# OR single-resource fallback
APPINSIGHTS_APP_ID=your-app-id
APPINSIGHTS_API_KEY=your-api-key

# Shared authentication
APPINSIGHTS_AUTH_METHOD=entra-id
APPINSIGHTS_TENANT_ID=...
APPINSIGHTS_CLIENT_ID=...
APPINSIGHTS_CLIENT_SECRET=...
```

### 5.2 Log Analytics Pattern (src/index.ts, lines 171-199)

```typescript
interface LogAnalyticsResourceConfig {
  id: string;
  name: string;
  workspaceId: string;
  active: boolean;
  apiKey?: string;
  description?: string;
}

interface LogAnalyticsConfig {
  resources: LogAnalyticsResourceConfig[];  // ARRAY!
  authMethod: 'entra-id' | 'api-key';
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

// Parsing with fallback pattern
if (process.env.LOGANALYTICS_RESOURCES) {
  try {
    LOGANALYTICS_CONFIG.resources = JSON.parse(process.env.LOGANALYTICS_RESOURCES);
  } catch (error) {
    console.error('Failed to parse LOGANALYTICS_RESOURCES:', error);
  }
} else if (process.env.LOGANALYTICS_WORKSPACE_ID) {
  LOGANALYTICS_CONFIG.resources = [
    {
      id: 'default',
      name: 'Default Log Analytics Workspace',
      workspaceId: process.env.LOGANALYTICS_WORKSPACE_ID,
      active: true,
      apiKey: process.env.LOGANALYTICS_API_KEY || '',
      description: 'Default Log Analytics workspace',
    },
  ];
}
```

**Special Feature**: Shared credential fallback to Application Insights
```typescript
const LOGANALYTICS_CONFIG: LogAnalyticsConfig = {
  // ...
  tenantId: process.env.LOGANALYTICS_TENANT_ID || process.env.APPINSIGHTS_TENANT_ID || '',
  clientId: process.env.LOGANALYTICS_CLIENT_ID || process.env.APPINSIGHTS_CLIENT_ID || '',
  clientSecret: process.env.LOGANALYTICS_CLIENT_SECRET || process.env.APPINSIGHTS_CLIENT_SECRET || '',
};
```

This allows users with both integrations to use a single Azure AD app registration!

### 5.3 Service Bus Pattern (src/index.ts, lines 228-263)

```typescript
interface ServiceBusResource {
  id: string;
  name: string;
  namespace: string;
  active: boolean;
  connectionString?: string;
  description?: string;
}

interface ServiceBusConfig {
  resources: ServiceBusResource[];  // ARRAY!
  authMethod: 'entra-id' | 'connection-string';
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  sanitizeMessages?: boolean;
  maxPeekMessages?: number;
  // ... more options
}

// Parsing with fallback
if (process.env.SERVICEBUS_RESOURCES) {
  try {
    SERVICEBUS_CONFIG.resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
  } catch (error) {
    console.error('Failed to parse SERVICEBUS_RESOURCES:', error);
  }
} else if (process.env.SERVICEBUS_NAMESPACE) {
  SERVICEBUS_CONFIG.resources = [
    {
      id: 'default',
      name: 'Default Service Bus',
      namespace: process.env.SERVICEBUS_NAMESPACE,
      active: true,
      connectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
      description: 'Default Service Bus namespace',
    },
  ];
}
```

### 5.4 SharePoint Pattern (src/index.ts, lines 265-294)

```typescript
interface SharePointSiteConfig {
  id: string;
  name: string;
  siteUrl: string;
  active: boolean;
  description?: string;
}

interface SharePointConfig {
  sites: SharePointSiteConfig[];  // ARRAY! (different naming)
  authMethod: 'entra-id';  // Only supports Entra ID
  tenantId: string;
  clientId: string;
  clientSecret: string;
  cacheTTL?: number;
  maxSearchResults?: number;
}

// Parsing with fallback
if (process.env.SHAREPOINT_SITES) {
  try {
    SHAREPOINT_CONFIG.sites = JSON.parse(process.env.SHAREPOINT_SITES);
  } catch (error) {
    console.error('Failed to parse SHAREPOINT_SITES:', error);
  }
} else if (process.env.SHAREPOINT_SITE_URL) {
  SHAREPOINT_CONFIG.sites = [
    {
      id: 'default',
      name: 'Default SharePoint Site',
      siteUrl: process.env.SHAREPOINT_SITE_URL,
      active: true,
      description: 'Default SharePoint site',
    },
  ];
}
```

---

## 6. Multi-Resource Pattern Summary

### 6.1 Comparison Table

| Feature | Azure SQL | App Insights | Log Analytics | Service Bus | SharePoint |
|---------|-----------|--------------|---------------|-------------|------------|
| **Resource Model** | Single database | Multi-resource | Multi-resource | Multi-resource | Multi-resource |
| **Config Type** | `AzureSqlConfig` | `ApplicationInsightsConfig` | `LogAnalyticsConfig` | `ServiceBusConfig` | `SharePointConfig` |
| **Resource Interface** | N/A | `ApplicationInsightsResourceConfig` | `LogAnalyticsResourceConfig` | `ServiceBusResource` | `SharePointSiteConfig` |
| **Resources Field** | N/A | `resources: []` | `resources: []` | `resources: []` | `sites: []` |
| **JSON Env Variable** | None | `APPINSIGHTS_RESOURCES` | `LOGANALYTICS_RESOURCES` | `SERVICEBUS_RESOURCES` | `SHAREPOINT_SITES` |
| **Fallback Single** | Direct fields | `APPINSIGHTS_APP_ID` | `LOGANALYTICS_WORKSPACE_ID` | `SERVICEBUS_NAMESPACE` | `SHAREPOINT_SITE_URL` |
| **Active/Inactive Toggle** | N/A | Yes (`active` field) | Yes (`active` field) | Yes (`active` field) | Yes (`active` field) |
| **Shared Credentials** | N/A | Yes | Yes (can use App Insights) | Yes | Entra ID only |
| **Authentication Methods** | 2 (SQL Auth, Azure AD) | 2 (Entra ID, API Key) | 2 (Entra ID, API Key) | 2 (Entra ID, Connection String) | 1 (Entra ID) |

### 6.2 Common Pattern

All multi-resource integrations follow this pattern:

1. **Resource Interface**
   ```typescript
   interface ResourceConfig {
     id: string;              // User-friendly ID
     name: string;            // Display name
     [resourceIdentifier]: string; // Service-specific ID (appId, workspaceId, namespace, etc.)
     active: boolean;         // Enable/disable toggle
     [authField]?: string;    // Optional per-resource auth (apiKey, connectionString)
     description?: string;    // Optional description
   }
   ```

2. **Service Config Interface**
   ```typescript
   interface ServiceConfig {
     resources: ResourceConfig[];        // ARRAY of resources
     authMethod: 'auth-type-1' | 'auth-type-2';  // Global auth method
     [sharedAuthField1]?: string;        // Global auth credentials
     [sharedAuthField2]?: string;
     [otherOptions]?: any;               // Service-specific options
   }
   ```

3. **Environment Variable Parsing**
   ```typescript
   const CONFIG: ServiceConfig = {
     resources: [],
     authMethod: (process.env.SERVICE_AUTH_METHOD || 'default') as 'method1' | 'method2',
     sharedAuth1: process.env.SERVICE_AUTH_FIELD_1 || '',
     sharedAuth2: process.env.SERVICE_AUTH_FIELD_2 || '',
   };

   if (process.env.SERVICE_RESOURCES) {
     try {
       CONFIG.resources = JSON.parse(process.env.SERVICE_RESOURCES);
     } catch (error) {
       console.error('Failed to parse SERVICE_RESOURCES:', error);
     }
   } else if (process.env.SERVICE_SINGLE_ID) {
     // Fallback to single-resource
     CONFIG.resources = [{
       id: 'default',
       name: 'Default Service Resource',
       [resourceId]: process.env.SERVICE_SINGLE_ID,
       active: true,
     }];
   }
   ```

4. **Service Implementation**
   - Multi-resource services receive `resources: []` array in constructor
   - Tool calls include `resourceId` parameter to specify which resource to use
   - Service looks up resource by ID before making API calls

### 6.3 Service Implementation Pattern (Example: ApplicationInsightsService)

```typescript
export class ApplicationInsightsService {
  private config: ApplicationInsightsConfig;
  private msalClient: ConfidentialClientApplication | null = null;
  
  // MULTI-RESOURCE: One MSAL client shared by all resources
  // SINGLE-RESOURCE (SQL): One connection pool per service instance

  getActiveResources(): ApplicationInsightsResourceConfig[] {
    return this.config.resources.filter(r => r.active);
  }

  private getResourceById(resourceId: string): ApplicationInsightsResourceConfig {
    const resource = this.config.resources.find(r => r.id === resourceId);
    if (!resource) {
      throw new Error(`Resource '${resourceId}' not found`);
    }
    if (!resource.active) {
      throw new Error(`Resource '${resourceId}' is inactive`);
    }
    return resource;
  }

  async executeQuery(resourceId: string, query: string, timespan?: string): Promise<QueryResult> {
    const resource = this.getResourceById(resourceId);
    const headers = await this.getAuthHeaders(resource);
    const url = `${this.baseUrl}/apps/${resource.appId}/query`;
    // ... make API call
  }
}
```

---

## 7. Key Architectural Differences

### 7.1 Single vs. Multi-Resource

| Aspect | Azure SQL (Single) | Others (Multi) |
|--------|-------------------|----------------|
| **Number of Instances** | 1 service = 1 database | 1 service = multiple resources |
| **Connection Management** | Single ConnectionPool | Shared authentication, per-resource API calls |
| **Tool Parameters** | No resource selection | Requires `resourceId` parameter |
| **Scaling** | Create new service instance for 2nd database | Add to `resources` array |
| **Configuration Complexity** | Simple (all direct env vars) | Medium (JSON array parsing) |
| **Use Case** | Single on-premises or cloud database | Multiple environments (dev/test/prod) |

### 7.2 Query Execution Flow

**Azure SQL (Single)**:
```
User calls sql-execute-query
  → Tool calls getAzureSqlService()
    → Returns singleton AzureSqlService instance
      → Uses single ConnectionPool
        → Connects to AZURE_SQL_SERVER / AZURE_SQL_DATABASE
          → Executes query
```

**App Insights (Multi)**:
```
User calls appinsights-execute-query with resourceId="prod-api"
  → Tool calls getApplicationInsightsService()
    → Returns singleton ApplicationInsightsService instance
      → Looks up resource by ID: { id: "prod-api", appId: "...", active: true }
        → Gets access token (shared MSAL client)
          → Makes API call to https://api.applicationinsights.io/v1/apps/{appId}/query
            → Executes KQL query
```

---

## 8. Configuration Examples

### 8.1 Azure SQL: Single Database Only

```bash
# Environment variables
export AZURE_SQL_SERVER=myserver.database.windows.net
export AZURE_SQL_DATABASE=mydatabase
export AZURE_SQL_USE_AZURE_AD=true
export AZURE_SQL_CLIENT_ID=...
export AZURE_SQL_CLIENT_SECRET=...
export AZURE_SQL_TENANT_ID=...
```

**Cannot configure**: Multiple servers or multiple databases in single MCP instance.

### 8.2 Application Insights: Multiple Environments

```bash
# Environment variable
export APPINSIGHTS_RESOURCES='[
  {
    "id": "dev-api",
    "name": "Development API",
    "appId": "dev-app-id",
    "active": true
  },
  {
    "id": "prod-api",
    "name": "Production API",
    "appId": "prod-app-id",
    "active": true
  },
  {
    "id": "staging-api",
    "name": "Staging API",
    "appId": "staging-app-id",
    "active": false
  }
]'

# Shared authentication
export APPINSIGHTS_AUTH_METHOD=entra-id
export APPINSIGHTS_TENANT_ID=...
export APPINSIGHTS_CLIENT_ID=...
export APPINSIGHTS_CLIENT_SECRET=...
```

**Usage**: `appinsights-execute-query` with `resourceId` parameter to switch between dev/prod/staging.

### 8.3 Service Bus: Multiple Namespaces

```bash
# Environment variable
export SERVICEBUS_RESOURCES='[
  {
    "id": "prod",
    "name": "Production Service Bus",
    "namespace": "prod-namespace.servicebus.windows.net",
    "active": true
  },
  {
    "id": "staging",
    "name": "Staging Service Bus",
    "namespace": "staging-namespace.servicebus.windows.net",
    "active": true
  }
]'

# Shared authentication
export SERVICEBUS_AUTH_METHOD=entra-id
export SERVICEBUS_TENANT_ID=...
export SERVICEBUS_CLIENT_ID=...
export SERVICEBUS_CLIENT_SECRET=...
```

---

## 9. Recommended Improvements for Azure SQL

### 9.1 Implement Multi-Database Support

To align Azure SQL with other integrations, implement:

1. **New Config Interface**:
   ```typescript
   interface AzureSqlDatabaseResource {
     id: string;
     name: string;
     server: string;
     database: string;
     port?: number;
     active: boolean;
     description?: string;
   }

   interface AzureSqlConfig {
     resources: AzureSqlDatabaseResource[];
     useAzureAd?: boolean;
     username?: string;        // Shared SQL auth (optional)
     password?: string;
     clientId?: string;         // Shared Azure AD auth
     clientSecret?: string;
     tenantId?: string;
     queryTimeout?: number;
     maxResultRows?: number;
     // ... other options
   }
   ```

2. **Environment Variables**:
   ```bash
   # Multi-database
   export AZURE_SQL_RESOURCES='[
     {
       "id": "prod-main",
       "name": "Production Main",
       "server": "prod.database.windows.net",
       "database": "main",
       "active": true
     },
     {
       "id": "prod-analytics",
       "name": "Production Analytics",
       "server": "prod.database.windows.net",
       "database": "analytics",
       "active": true
     }
   ]'

   # Shared auth
   export AZURE_SQL_USE_AZURE_AD=true
   export AZURE_SQL_CLIENT_ID=...
   export AZURE_SQL_CLIENT_SECRET=...
   export AZURE_SQL_TENANT_ID=...
   ```

3. **Tool Changes**:
   - Add `resourceId` parameter to all SQL tools
   - Update tool calls to include resourceId

### 9.2 Connection Pool Management

Current implementation: Single pool per service instance.

Recommended: Pool per resource (if implementing multi-database):
```typescript
export class AzureSqlService {
  private pools: Map<string, sql.ConnectionPool> = new Map();

  private async getPool(resourceId: string): Promise<sql.ConnectionPool> {
    let pool = this.pools.get(resourceId);
    if (pool && pool.connected && pool.healthy) {
      return pool;
    }
    // Create new pool for this resource
    pool = await this.createPool(resourceId);
    this.pools.set(resourceId, pool);
    return pool;
  }
}
```

---

## 10. Summary Table: Complete Configuration Comparison

```
INTEGRATION              CONFIG STRUCTURE           RESOURCES       AUTH        FALLBACK
────────────────────────────────────────────────────────────────────────────────────
Azure SQL               Single database            N/A             2 methods   N/A
                        All fields in config       
                        Direct env vars

Application Insights    Config + resources array   resources: []   2 methods   APPINSIGHTS_APP_ID
                        Shared + per-resource      appId           entra-id    (single)
                        JSON parsing               apiKey          api-key

Log Analytics           Config + resources array   resources: []   2 methods   LOGANALYTICS_WORKSPACE_ID
                        Shared + per-resource      workspaceId     entra-id    (single)
                        JSON parsing               apiKey          api-key
                        ✨ Fallback to App Insights credentials

Service Bus             Config + resources array   resources: []   2 methods   SERVICEBUS_NAMESPACE
                        Shared + per-resource      namespace       entra-id    (single)
                        JSON parsing               connectionString connection-string

SharePoint              Config + sites array       sites: []       1 method    SHAREPOINT_SITE_URL
                        (different naming)         siteUrl         entra-id    (single)
                        JSON parsing               N/A             only

GitHub Enterprise      Config + repos array       repos: []       2 methods   (none - multi required)
                        (different naming)         repo IDs        pat         
                        JSON parsing               defaultBranch   github-app
```

---

## 11. Design Decisions & Rationale

### Why Azure SQL is Single-Database

1. **Original Design**: Azure SQL Service was designed for investigating a single production database
2. **Connection Pool**: mssql library maintains single pool per AzureSqlService instance
3. **Credentials**: Typically production database has read-only account; connection pooling is per-account
4. **Query Scope**: Most SQL queries are specific to one database schema

### Why Others Implement Multi-Resource

1. **Azure Services**: Often multi-environment (dev/test/prod) with separate resource instances
2. **Shared Auth**: Azure AD credential can authenticate to multiple resources
3. **API-Based**: REST APIs can point to different resources without reconnecting
4. **Monitoring**: Want to correlate telemetry across multiple resources

### Trade-offs

**Single-Database (Current Azure SQL)**:
- ✅ Simpler configuration
- ✅ Automatic connection pooling
- ✅ Lower memory overhead
- ❌ Cannot access multiple databases
- ❌ Inconsistent with other integrations

**Multi-Resource (Recommended)**:
- ✅ Access multiple databases/servers
- ✅ Consistent with other integrations
- ✅ Support multiple environments
- ❌ More complex configuration
- ❌ Per-resource connection pooling required

