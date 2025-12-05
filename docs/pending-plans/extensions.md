# MCP Server Extensions PRD

## Overview

This document outlines enhancements to the existing MCP servers (`AOP-SQL-DEV-azure-sql` and `AOP-SCC-DEV-rest-api`) to reduce discovery overhead and improve AI agent efficiency when interacting with these services.

### Problem Statement

Current MCP server usage requires multiple discovery calls before productive work can begin:

| Server | Discovery Calls | Productive Calls | Overhead |
|--------|-----------------|------------------|----------|
| SQL Server | 2 (list-servers, list-databases) | 1 (execute-query) | 67% |
| REST API | 1-2 (config, external swagger fetch) | 1 (request) | 50-67% |

This overhead:
- Increases latency for simple operations
- Consumes unnecessary tokens/context
- Requires guesswork for REST endpoint paths and schemas

### Goals

1. **Zero-discovery workflows**: Enable direct tool usage without prior discovery calls
2. **Self-documenting APIs**: Provide endpoint and schema discovery within MCP servers
3. **Backwards compatibility**: Existing tool calls must continue to work unchanged

---

## SQL Server Extensions (`AOP-SQL-DEV-azure-sql`)

### 1. New Tool: `sql-get-defaults`

Returns the default/active server and database configuration, enabling agents to understand the environment in a single call.

#### Tool Definition

```json
{
  "name": "sql-get-defaults",
  "description": "Get the default server and database configuration. Use this once at the start of a session to understand the SQL environment, or skip entirely and use the defaults directly in sql-execute-query.",
  "parameters": {
    "type": "object",
    "properties": {},
    "required": []
  }
}
```

#### Response Schema

```json
{
  "defaultServerId": "string",
  "defaultServerName": "string",
  "defaultDatabase": "string",
  "serverCount": "number",
  "hint": "string"
}
```

#### Example Response

```json
{
  "defaultServerId": "default",
  "defaultServerName": "sqls-dev-aop-sc-uks-01.database.windows.net",
  "defaultDatabase": "sqldb-dev-aop-sc-uks-01",
  "serverCount": 1,
  "hint": "Single server configured. You can omit serverId and database parameters in queries."
}
```

---

### 2. Enhancement: Optional Parameters in `sql-execute-query`

Make `serverId` and `database` optional with smart defaults.

#### Current Signature

```json
{
  "serverId": {"type": "string", "required": true},
  "database": {"type": "string", "required": true},
  "query": {"type": "string", "required": true}
}
```

#### New Signature

```json
{
  "serverId": {
    "type": "string",
    "required": false,
    "description": "Server ID. Defaults to the primary configured server if omitted."
  },
  "database": {
    "type": "string",
    "required": false,
    "description": "Database name. Defaults to the primary database on the selected server if omitted."
  },
  "query": {
    "type": "string",
    "required": true,
    "description": "SELECT query to execute"
  }
}
```

#### Default Resolution Logic

```
1. If serverId is omitted:
   - If only 1 server configured → use that server
   - If multiple servers → use the one marked "active: true"
   - If no active server → return error with available servers

2. If database is omitted:
   - If only 1 database on server → use that database
   - If multiple databases → use the one marked "active: true"
   - If no active database → return error with available databases
```

#### Backwards Compatibility

Existing calls with explicit `serverId` and `database` continue to work unchanged.

---

## REST API Server Extensions (`AOP-SCC-DEV-rest-api`)

### 3. New Tool: `rest-list-endpoints`

Returns all available API endpoints with their supported methods, enabling agents to discover the API structure without external documentation.

#### Tool Definition

```json
{
  "name": "rest-list-endpoints",
  "description": "List all available REST API endpoints with their supported HTTP methods. Use this to discover what entities/resources are available in the API.",
  "parameters": {
    "type": "object",
    "properties": {
      "filter": {
        "type": "string",
        "description": "Optional filter to match endpoint paths (case-insensitive contains match). Example: 'exam' returns all exam-related endpoints.",
        "required": false
      }
    },
    "required": []
  }
}
```

#### Response Schema

```json
{
  "baseUrl": "string",
  "endpointCount": "number",
  "endpoints": [
    {
      "path": "string",
      "methods": ["string"],
      "entityName": "string | null",
      "description": "string | null"
    }
  ]
}
```

#### Example Response

```json
{
  "baseUrl": "https://aop-dev.smartconnector.co.uk/api",
  "endpointCount": 45,
  "endpoints": [
    {
      "path": "/sic_examtypes",
      "methods": ["GET", "POST", "PUT", "DELETE"],
      "entityName": "sic_examtype",
      "description": "Exam type reference data"
    },
    {
      "path": "/sic_exams",
      "methods": ["GET", "POST", "PUT", "DELETE"],
      "entityName": "sic_exam",
      "description": "Exam records"
    },
    {
      "path": "/contacts",
      "methods": ["GET", "POST", "PUT", "DELETE"],
      "entityName": "contact",
      "description": "Contact records"
    }
  ]
}
```

#### Implementation Options

**Option A: Parse OpenAPI spec at runtime**
- Fetch and parse `/api/openapi` endpoint
- Cache result with configurable TTL (e.g., 5 minutes)
- Pros: Always up-to-date
- Cons: Adds latency on first call

**Option B: Static configuration file**
- Load from `endpoints.json` deployed alongside MCP server
- Regenerate file as part of API deployment pipeline
- Pros: Fast, no runtime dependency
- Cons: Can become stale if not updated

**Option C: Hybrid (Recommended)**
- Load from static file for immediate response
- Background refresh from OpenAPI spec periodically
- Include `lastUpdated` timestamp in response

---

### 4. New Tool: `rest-get-schema`

Returns the schema for a specific entity, including field names, types, and validation rules.

#### Tool Definition

```json
{
  "name": "rest-get-schema",
  "description": "Get the schema/field definitions for a specific entity. Returns field names, types, whether they're required, and any validation rules. Use this before creating or updating records to understand the data structure.",
  "parameters": {
    "type": "object",
    "properties": {
      "entity": {
        "type": "string",
        "description": "Entity name (singular or plural). Examples: 'sic_exam', 'sic_exams', 'contact', 'contacts'",
        "required": true
      }
    },
    "required": ["entity"]
  }
}
```

#### Response Schema

```json
{
  "entityName": "string",
  "pluralName": "string",
  "endpoint": "string",
  "primaryKey": "string",
  "fields": [
    {
      "name": "string",
      "type": "string",
      "required": "boolean",
      "nullable": "boolean",
      "maxLength": "number | null",
      "description": "string | null",
      "foreignKey": {
        "entity": "string",
        "field": "string"
      } | null,
      "enumValues": ["string"] | null
    }
  ],
  "example": "object | null"
}
```

#### Example Response

```json
{
  "entityName": "sic_exam",
  "pluralName": "sic_exams",
  "endpoint": "/sic_exams",
  "primaryKey": "sic_examid",
  "fields": [
    {
      "name": "sic_examid",
      "type": "Guid",
      "required": false,
      "nullable": false,
      "description": "Primary key. Auto-generated if not provided.",
      "foreignKey": null
    },
    {
      "name": "sic_name",
      "type": "string",
      "required": true,
      "nullable": false,
      "maxLength": 200,
      "description": "Exam name/title",
      "foreignKey": null
    },
    {
      "name": "sic_examtypeid",
      "type": "Guid",
      "required": false,
      "nullable": true,
      "description": "Reference to exam type",
      "foreignKey": {
        "entity": "sic_examtype",
        "field": "sic_examtypeid"
      }
    },
    {
      "name": "sic_passpercentage",
      "type": "decimal",
      "required": false,
      "nullable": true,
      "description": "Minimum percentage to pass (0-100)"
    },
    {
      "name": "sic_startdate",
      "type": "datetime",
      "required": false,
      "nullable": true,
      "description": "Exam availability start date (ISO 8601 format)"
    },
    {
      "name": "statuscode",
      "type": "int",
      "required": false,
      "nullable": true,
      "description": "Record status",
      "enumValues": ["1 = Active", "2 = Inactive"]
    }
  ],
  "example": {
    "sic_name": "Example Exam",
    "sic_examtypeid": "6ea6e646-a094-f011-b4cb-7ced8d99006e",
    "sic_passpercentage": 70,
    "sic_startdate": "2025-01-01T00:00:00Z",
    "sic_enddate": "2025-12-31T23:59:00Z",
    "statuscode": 1
  }
}
```

#### Data Source

Schema information can be derived from:

1. **OpenAPI spec** (if available with full schema definitions)
2. **sc-configuration.json** - Already contains:
   - ModelName / ModelPluralName
   - Fields with FieldName, FieldType
   - ForeignKey references
3. **Database introspection** - Query SQL schema for additional constraints

**Recommended approach**: Use `sc-configuration.json` as primary source since it's the source of truth for the Smart Connector data model.

---

## Implementation Priority

| Priority | Tool | Effort | Impact |
|----------|------|--------|--------|
| P0 | `sql-execute-query` optional params | Low | High - eliminates 2 calls per session |
| P1 | `rest-list-endpoints` | Medium | High - eliminates guesswork |
| P2 | `sql-get-defaults` | Low | Medium - single call for full context |
| P3 | `rest-get-schema` | Medium | Medium - helps with complex entities |

---

## Success Metrics

### Before Enhancement
- Average tool calls for simple SQL query: **3** (list-servers → list-databases → execute-query)
- Average tool calls for REST POST: **2-3** (config → swagger fetch → request)

### After Enhancement
- Average tool calls for simple SQL query: **1** (execute-query with defaults)
- Average tool calls for REST POST: **1-2** (optional list-endpoints → request)

### Target
- **50% reduction** in discovery-related tool calls
- **Zero failed REST calls** due to incorrect endpoint guessing

---

## Appendix A: Updated Tool Descriptions

For AI agents to use tools efficiently, tool descriptions should be enhanced:

### sql-execute-query (updated description)
```
Execute a SELECT query against the Azure SQL Database.

Parameters:
- serverId: Optional. Defaults to primary server if omitted.
- database: Optional. Defaults to primary database if omitted.
- query: Required. The SELECT query to execute.

For most use cases, you can omit serverId and database:
  sql-execute-query(query="SELECT TOP 10 * FROM dbo.contacts")
```

### rest-request (updated description)
```
Execute a REST API request with automatic authentication.

Endpoint paths follow the pattern: /{entity_plural_name}
- Use rest-list-endpoints to discover available endpoints
- Use rest-get-schema to understand entity fields before POST/PUT

Examples:
- GET /contacts - List contacts
- POST /sic_exams - Create an exam
- GET /sic_examtypes - List exam types
```

---

## Appendix B: Configuration File Approach

If implementing Option B (static configuration) for `rest-list-endpoints`, generate the endpoints file from `sc-configuration.json`:

```javascript
// generate-endpoints.js
const config = require('./sc-configuration.json');

const endpoints = config.Entities.map(entity => ({
  path: `/${entity.ModelPluralName}`,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  entityName: entity.ModelName,
  description: entity.Description || null
}));

fs.writeFileSync('endpoints.json', JSON.stringify({ endpoints }, null, 2));
```

Run this as part of the build/deployment pipeline to keep endpoints in sync.
