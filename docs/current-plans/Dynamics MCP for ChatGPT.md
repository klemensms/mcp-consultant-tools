# Product Requirements Document: ChatGPT Dynamics MCP

**Version:** 1.0  
**Date:** December 2024  
**Author:** [Your Name]  
**Status:** Draft

---

## Executive Summary

ChatGPT Dynamics MCP enables ChatGPT users to query their Dynamics 365 CRM data using natural language, with proper user-level permissions enforced. The solution bridges the authentication gap between ChatGPT's MCP implementation (which requires OAuth 2.1 with Dynamic Client Registration) and Microsoft Entra ID (which doesn't support DCR natively).

**Primary value proposition:** Allow CRM users to get instant answers from their data without learning query syntax, building reports, or leaving ChatGPT.

**Initial deployment:** Internal dogfooding at [Your Consultancy], then rollout to CRM clients.

---

## Problem Statement

### Current State
- Users must navigate the Dynamics 365 interface or build Advanced Find queries to extract insights
- Report building requires technical knowledge or involves IT/consultancy support
- ChatGPT users cannot access their CRM data despite MCP connector support existing

### Desired State
- Users ask natural language questions in ChatGPT: "Show me my open opportunities over £50k"
- ChatGPT queries Dynamics 365 using the user's own permissions (delegated auth)
- Users only see data they're authorized to access in CRM

### Why Now
- ChatGPT added full MCP support with OAuth authentication (September 2025)
- Microsoft has documented MCP server authentication patterns for Entra ID
- Open-source reference implementation exists (Profility's mcp-server-dotnet-entra-id)

---

## Goals and Non-Goals

### Goals (MVP)
1. Users can authenticate with their Entra ID credentials via ChatGPT's OAuth flow
2. Users can execute read-only queries against Dynamics 365 entities they have access to
3. Predefined report prompts are available for common queries
4. Solution deploys to a single Azure tenant (client-hosted model)
5. Internal team can dogfood the solution before client rollout

### Non-Goals (MVP)
- Write operations to CRM (Phase 2)
- Multi-tenant SaaS hosting (Phase 2+)
- Support for other AI clients (Claude, Copilot) - different auth requirements
- Data warehouse integration
- Custom prompt builder UI

---

## User Personas

| Persona | Description | Example Queries |
|---------|-------------|-----------------|
| Sales Rep | Queries their own pipeline and accounts | "What opportunities do I have closing this month?" |
| Sales Manager | Views team performance and pipeline | "Show me the team's pipeline by stage" |
| Analyst | Runs cross-organization reports | "Which accounts have had no activity in 30 days?" |

All personas use ChatGPT (Plus, Pro, or Enterprise) and have Dynamics 365 user accounts with appropriate security roles.

---

## Technical Architecture

### High-Level Flow

```
┌──────────────────┐                           
│  ChatGPT Desktop │                           
│  or Web          │                           
└────────┬─────────┘                           
         │ 1. User adds connector (one-time)
         │ 2. OAuth 2.1 + DCR flow
         ▼                                     
┌──────────────────────────────────────────────┐
│           MCP OAuth Proxy + Server           │
│  ┌─────────────────────────────────────────┐ │
│  │  OAuth Proxy Layer                      │ │
│  │  - DCR endpoint (for ChatGPT)           │ │
│  │  - Token exchange (Entra ID)            │ │
│  │  - Client registration persistence      │ │
│  └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────┐ │
│  │  MCP Server Layer                       │ │
│  │  - CRM query tools                      │ │
│  │  - Predefined report prompts            │ │
│  │  - OBO token exchange to Dataverse      │ │
│  └─────────────────────────────────────────┘ │
└────────┬─────────────────────────────────────┘
         │ 3. On-Behalf-Of flow
         │ 4. Dataverse API calls
         ▼                                     
┌──────────────────┐                           
│  Dynamics 365    │                           
│  (Dataverse)     │                           
└──────────────────┘                           
```

### Authentication Flow (Detailed)

```
1.  ChatGPT    → GET /.well-known/oauth-protected-resource
                 ← Discovers authorization server metadata

2.  ChatGPT    → POST /oauth/register
                 ← Returns client_id (persisted in Azure Table Storage)

3.  ChatGPT    → GET /oauth/authorize?client_id=...&code_challenge=...
                 ← Shows branded login page

4.  User       → Clicks "Continue"
                 → Redirected to Entra ID login

5.  Entra ID   → User authenticates with MFA
                 → Redirects to /oauth/callback?code=...

6.  Proxy      → Exchanges code with Entra ID
                 ← Receives access_token + id_token + refresh_token

7.  Proxy      → Generates proxy authorization code
                 → Redirects to ChatGPT callback

8.  ChatGPT    → POST /oauth/token (code + code_verifier)
                 ← Receives opaque access_token (maps to Entra token internally)

9.  ChatGPT    → MCP tool calls with Authorization: Bearer <token>
                 → Proxy validates, extracts user identity
                 → Performs OBO exchange for Dataverse token
                 → Calls Dataverse API as user
                 ← Returns results
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| OAuth Proxy | ASP.NET Core 8 | Handles DCR, token exchange, PKCE |
| MCP Server | ASP.NET Core 8 + MCP C# SDK | Exposes tools, handles MCP protocol |
| Client Store | Azure Table Storage | Persists DCR registrations (ChatGPT requirement) |
| Token Store | Azure Table Storage | Maps opaque tokens to Entra tokens |
| Secrets | Azure Key Vault | Stores Entra client secret, JWT signing keys |
| Hosting | Azure App Service | Runs the application |
| Identity | Entra ID App Registration | OAuth resource server + client |

### Entra ID App Registration Configuration

**App Registration Settings:**
- Supported account types: Single tenant (this organization only)
- Redirect URI: `https://<app-service-url>/oauth/callback`
- API permissions (Delegated):
  - `openid` (Sign in)
  - `profile` (User profile)
  - `email` (Email address)
  - `User.Read` (Microsoft Graph - for user info)
  - `user_impersonation` on Dynamics 365 (for OBO to Dataverse)

**Expose an API:**
- Application ID URI: `api://<client-id>`
- Scope: `MCP.Access` - "Access CRM via MCP"

**Token Configuration:**
- Access token version: 2
- Optional claims: `email`, `upn`

---

## MCP Tools Specification

### Core Tools

#### 1. `query_crm`
Execute a FetchXML or OData query against Dataverse.

```json
{
  "name": "query_crm",
  "description": "Query Dynamics 365 CRM data. Supports FetchXML for complex queries or simple entity/filter for basic queries. Results are limited to data the authenticated user has permission to view.",
  "parameters": {
    "entity": {
      "type": "string",
      "description": "The logical name of the entity to query (e.g., 'account', 'opportunity', 'contact')"
    },
    "select": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of columns to return"
    },
    "filter": {
      "type": "string",
      "description": "OData filter expression (e.g., \"statecode eq 0 and estimatedvalue gt 50000\")"
    },
    "top": {
      "type": "integer",
      "description": "Maximum number of records to return (default: 50, max: 500)"
    },
    "orderby": {
      "type": "string",
      "description": "Column to sort by, optionally with 'asc' or 'desc'"
    }
  }
}
```

#### 2. `get_record`
Retrieve a single CRM record by ID.

```json
{
  "name": "get_record",
  "description": "Get a single Dynamics 365 record by its ID",
  "parameters": {
    "entity": {
      "type": "string",
      "description": "The logical name of the entity"
    },
    "id": {
      "type": "string",
      "description": "The GUID of the record"
    },
    "select": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of columns to return (optional, returns all if not specified)"
    }
  }
}
```

#### 3. `get_entity_metadata`
Describe the schema of a CRM entity.

```json
{
  "name": "get_entity_metadata",
  "description": "Get the schema/metadata for a Dynamics 365 entity including available columns, relationships, and option set values",
  "parameters": {
    "entity": {
      "type": "string",
      "description": "The logical name of the entity"
    }
  }
}
```

#### 4. `list_entities`
List available CRM entities.

```json
{
  "name": "list_entities",
  "description": "List all Dynamics 365 entities the user has access to query",
  "parameters": {}
}
```

#### 5. `whoami`
Return authenticated user information.

```json
{
  "name": "whoami",
  "description": "Returns information about the currently authenticated user including their CRM user ID and business unit",
  "parameters": {}
}
```

### Predefined Report Prompts (MCP Resources)

The MCP server will expose predefined prompts as MCP resources that ChatGPT can use:

```json
{
  "resources": [
    {
      "uri": "prompt://reports/my-open-opportunities",
      "name": "My Open Opportunities",
      "description": "List all open opportunities assigned to the current user"
    },
    {
      "uri": "prompt://reports/pipeline-by-stage",
      "name": "Pipeline by Stage",
      "description": "Summary of opportunity pipeline grouped by sales stage"
    },
    {
      "uri": "prompt://reports/accounts-no-activity",
      "name": "Inactive Accounts",
      "description": "Accounts with no activities in the last 30 days"
    },
    {
      "uri": "prompt://reports/closing-this-month",
      "name": "Closing This Month",
      "description": "Opportunities with estimated close date in the current month"
    }
  ]
}
```

These prompts translate to predefined FetchXML queries that incorporate the current user's ID where appropriate.

---

## Security Considerations

### Authentication & Authorization
- All authentication flows use PKCE (S256) to prevent authorization code interception
- Tokens are short-lived (1 hour) with refresh token support
- User can only access CRM data their Dynamics 365 security role permits
- OBO flow ensures Dataverse API calls are made as the authenticated user

### Data Protection
- No CRM data is persisted by the MCP server
- Token mappings stored in Azure Table Storage with encryption at rest
- All traffic over HTTPS/TLS 1.3
- Secrets stored in Azure Key Vault, never in code or config files

### ChatGPT-Specific Considerations
- Client registrations must be persisted (ChatGPT only does DCR once)
- Tool descriptions must avoid mentioning "personal data" to pass ChatGPT's safety scan
- Read-only tools should use `readOnlyHint: true` annotation

### Audit Trail
- All MCP tool invocations logged with user identity and query details
- Application Insights integration for monitoring and alerting

---

## Infrastructure (Azure)

### Required Resources

| Resource | SKU | Purpose | Est. Monthly Cost |
|----------|-----|---------|-------------------|
| App Service | B1 (Basic) | Host MCP server | ~£10 |
| App Service Plan | B1 | Compute for App Service | (included) |
| Storage Account | Standard LRS | Table Storage for tokens/clients | ~£1 |
| Key Vault | Standard | Secrets management | ~£0.03/10k operations |
| Application Insights | Pay-as-you-go | Monitoring | ~£2 (low volume) |

**Estimated total:** ~£15/month for POC

### Deployment

Bicep/ARM templates will be provided for one-click deployment to any Azure subscription.

---

## Development Phases

### Phase 1: MVP (This PRD) - 2-3 weeks

**Week 1:**
- [ ] Fork Profility mcp-server-dotnet-entra-id
- [ ] Set up Azure infrastructure (App Service, Storage, Key Vault)
- [ ] Configure Entra ID App Registration
- [ ] Verify OAuth flow works with ChatGPT (WhoAmI tool)

**Week 2:**
- [ ] Implement OBO flow to acquire Dataverse token
- [ ] Implement `query_crm` and `get_record` tools
- [ ] Implement `get_entity_metadata` and `list_entities` tools
- [ ] Test with real CRM data (internal environment)

**Week 3:**
- [ ] Add predefined report prompts
- [ ] Polish error handling and logging
- [ ] Documentation for internal team
- [ ] Internal dogfooding begins

**Deliverables:**
- Working MCP server deployed to internal Azure
- 5 core tools functional
- 4+ predefined report prompts
- Setup documentation

### Phase 2: Write Operations - 2 weeks (Future)

- [ ] Add `create_record` tool
- [ ] Add `update_record` tool
- [ ] Implement confirmation flow (ChatGPT shows confirmation before write)
- [ ] Enhanced audit logging for mutations

### Phase 3: Client Deployments - Ongoing (Future)

- [ ] Bicep templates for one-click deployment
- [ ] Client deployment runbook
- [ ] Per-client customization (branding, prompts)

### Phase 4: Multi-Tenant SaaS (Future)

- [ ] Tenant resolution middleware
- [ ] Per-tenant credential isolation
- [ ] Centralized management portal
- [ ] Usage-based billing infrastructure

---

## Success Criteria

### MVP Success (Phase 1)
1. Internal team can query CRM data via ChatGPT
2. Permissions are correctly enforced (users only see their data)
3. Predefined reports return accurate results
4. Solution is stable for daily use

### Metrics to Track
- Number of tool invocations per day
- Query latency (p50, p95)
- Authentication success rate
- Error rate by error type
- Most-used predefined reports

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| ChatGPT changes MCP/OAuth spec | High | Low | Pin to known-working ChatGPT version for testing; monitor OpenAI announcements |
| OBO flow doesn't work with Dataverse | High | Low | Validated in Microsoft docs; test early in Week 1 |
| ChatGPT rate limits MCP calls | Medium | Medium | Implement caching for metadata; batch queries where possible |
| Users construct queries that timeout | Medium | High | Enforce `top` limit; timeout long-running queries; guide users to use predefined reports |
| Token refresh fails silently | Medium | Low | Comprehensive logging; proactive token refresh before expiry |

---

## Open Questions

1. **ChatGPT Enterprise** - Does your organization have ChatGPT Enterprise/Business? This would enable admin-published connectors (no per-user setup).

2. **Branding** - What company name/logo for the login page? (Configurable via appsettings.json)

3. **Initial report prompts** - Which 4-6 reports are highest priority for internal team?

4. **Existing MCP server tools** - Can you share the current Node.js MCP server so I can identify tools to port?

---

## References

- [Profility mcp-server-dotnet-entra-id](https://github.com/Profility-be/mcp-server-dotnet-entra-id) - Base OAuth proxy implementation
- [OpenAI MCP Authentication Docs](https://developers.openai.com/apps-sdk/build/auth/) - ChatGPT MCP OAuth requirements
- [Microsoft MCP Auth for App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-mcp) - Azure-native MCP auth
- [MCP C# SDK](https://github.com/modelcontextprotocol/csharp-sdk) - Official .NET MCP implementation
- [Dataverse Web API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview) - CRM API reference

---

## Appendix A: Example Tool Implementations

### query_crm Implementation Sketch

```csharp
[McpServerTool(Name = "query_crm")]
[Description("Query Dynamics 365 CRM data. Returns records the authenticated user has permission to view.")]
public async Task<QueryResult> QueryCrm(
    [Description("Entity logical name (e.g., 'opportunity')")] string entity,
    [Description("Columns to return")] string[]? select = null,
    [Description("OData filter expression")] string? filter = null,
    [Description("Max records (default 50, max 500)")] int top = 50,
    [Description("Sort column with optional 'asc' or 'desc'")] string? orderby = null)
{
    // Get user's Dataverse token via OBO
    var dataverseToken = await _tokenService.GetDataverseTokenAsync(UserContext.EntraToken);
    
    // Build OData query
    var query = new DataverseQuery(entity)
        .Select(select)
        .Filter(filter)
        .Top(Math.Min(top, 500))
        .OrderBy(orderby);
    
    // Execute against Dataverse
    var client = new DataverseClient(_config.DataverseUrl, dataverseToken);
    var results = await client.QueryAsync(query);
    
    return new QueryResult
    {
        Entity = entity,
        Count = results.Count,
        Records = results.Records
    };
}
```

---

## Appendix B: Deployment Checklist

### Azure Resources
- [ ] Resource Group created
- [ ] App Service Plan created (B1)
- [ ] App Service created
- [ ] Storage Account created
- [ ] Key Vault created
- [ ] Application Insights created

### Entra ID
- [ ] App Registration created
- [ ] Redirect URI configured
- [ ] API permissions granted (admin consent)
- [ ] API exposed (MCP.Access scope)
- [ ] Client secret generated and stored in Key Vault

### Application
- [ ] appsettings.json configured
- [ ] Key Vault references working
- [ ] Application deployed
- [ ] SSL certificate bound
- [ ] Custom domain (optional)

### Validation
- [ ] /.well-known/oauth-protected-resource returns valid JSON
- [ ] ChatGPT can complete OAuth flow
- [ ] WhoAmI tool returns user info
- [ ] query_crm returns CRM data
- [ ] Permissions correctly enforced

---

## Appendix C: Experimental Work Log (December 2025)

### Overview

Before building the full OAuth proxy solution described in this PRD, we attempted to connect ChatGPT directly to our existing Node.js MCP server (`@mcp-consultant-tools/powerplatform`) via HTTP/ngrok. This section documents what we tried, what worked, and what ultimately failed.

### What We Built

#### HTTP Server for MCP (`packages/powerplatform/src/http-server.ts`)

Added an Express-based HTTP server that exposes the existing PowerPlatform MCP tools over HTTP:

```typescript
// Key endpoints:
POST /mcp              - MCP JSON-RPC endpoint (initialize, tools/list, tools/call)
GET  /mcp              - SSE endpoint for streaming
GET  /health           - Health check
GET  /                 - Server info (for ChatGPT validation)
POST /:connector/:linkId/:toolName - REST-style fallback for ChatGPT
```

**Key implementation details:**
- Uses `InMemoryTransport` from MCP SDK (not `StreamableHTTPServerTransport` which had issues)
- Manual JSON-RPC handling with proper notification support
- CORS enabled for ChatGPT compatibility
- Optional API key authentication via `MCP_API_KEY` env var

#### OAuth Discovery Endpoint (Partially Implemented)

Added RFC 9728 OAuth Protected Resource Metadata endpoint:

```typescript
GET /.well-known/oauth-protected-resource
// Returns:
{
  "resource": "https://your-ngrok-url",
  "authorization_servers": ["https://login.microsoftonline.com/{tenant}/v2.0"],
  "bearer_methods_supported": ["header"]
}
```

### What Worked ✅

1. **MCP Protocol Handshake** - ChatGPT successfully:
   - Sent `initialize` request and received server capabilities
   - Sent `notifications/initialized` (handled correctly with 202 response)
   - Sent `tools/list` and received all 39 PowerPlatform tools

2. **Direct API Calls via curl** - The MCP server works correctly:
   ```bash
   curl -X POST https://ngrok-url/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"query-records","arguments":{"entityNamePlural":"accounts","filter":"accountid ne null","maxRecords":1}}}'
   # Returns: Account data from Dataverse ✅
   ```

3. **ChatGPT Connector Creation** - Connector added successfully with "No authentication"

4. **Tool Discovery in ChatGPT** - ChatGPT sees and displays all available tools

### What Failed ❌

#### ChatGPT Tool Execution Bug

**The Problem:**
ChatGPT's MCP connector has a fundamental bug where it:
1. ✅ Discovers tools via `tools/list` (sends request to our server)
2. ❌ Does NOT send `tools/call` to our server when executing tools

**Evidence from ChatGPT's internal error:**
```
Resource not found: /asdf/link_6933b9a5aa148191b45ca8ddd6cc5aae/query-records
Your available resources are: { "resources": [], "finite": true }
```

This error occurs **inside ChatGPT's adapter layer** before any HTTP request is made to our server. Our server logs show zero requests when ChatGPT attempts tool execution.

**Root Cause Analysis:**
- ChatGPT's MCP connector stores tool metadata with internal URIs like `/connector_name/link_xxx/tool_name`
- When executing tools, it tries to route to these internal URIs instead of sending `tools/call` JSON-RPC to the MCP endpoint
- The `link_xxx` binding between discovered tools and execution is broken

#### OAuth Flow Blockers

We also attempted OAuth integration but hit these blockers:

1. **AADSTS9010010 Error** - Azure AD v2.0 endpoint doesn't support the `resource` parameter that ChatGPT's OAuth implementation requires
   - **Fix:** Changed to v1.0 endpoint

2. **AADSTS500011 Error** - "Resource principal not found"
   - **Cause:** Entra ID requires a registered Application ID URI to issue tokens for OAuth `resource` parameter
   - **Fix Required:** Admin must configure Application ID URI in Azure Portal → Entra ID → App registrations → Expose an API
   - **Status:** Blocked - awaiting admin permissions

### Technical Lessons Learned

1. **MCP SDK Transport Issues:**
   - `StreamableHTTPServerTransport` doesn't work with ChatGPT's concurrent POST/GET pattern
   - `InMemoryTransport` with manual JSON-RPC handling works correctly

2. **Notification Handling:**
   - MCP notifications (like `notifications/initialized`) have no `id` field
   - They must be acknowledged without waiting for a response (we return 202 Accepted)

3. **ChatGPT MCP Connector Limitations:**
   - Only supports OAuth or no authentication (no API key option)
   - Tool discovery and tool execution are disconnected
   - Internal routing mechanism doesn't forward tool calls to external servers

4. **Azure AD OAuth:**
   - v2.0 endpoint doesn't support `resource` parameter (uses `scope` instead)
   - v1.0 endpoint requires Application ID URI to be pre-configured
   - ChatGPT requires `resource` parameter for OAuth discovery

### Files Created/Modified

| File | Purpose |
|------|---------|
| `packages/powerplatform/src/http-server.ts` | HTTP server for MCP over HTTP |
| `packages/powerplatform/package.json` | Added `start:http` script |
| `docs/pending-plans/chatgpt-oauth-integration.md` | OAuth progress documentation |

### Recommendations for Future Work

1. **Wait for OpenAI Fix** - The tool execution bug is on ChatGPT's side. Monitor for updates to their MCP connector.

2. **Test with Other MCP Clients** - Verify the HTTP server works with:
   - Claude Desktop (HTTP transport)
   - Cursor
   - Other MCP-compatible clients

3. **Complete OAuth Proxy (This PRD)** - The full solution with DCR proxy may work better because:
   - It intercepts and rewrites the OAuth flow
   - It may handle tool routing differently
   - It's the pattern Microsoft recommends

4. **Alternative: OpenAI Actions/GPTs** - Instead of MCP, consider building:
   - Custom GPT with OpenAPI spec
   - OAuth via standard Azure AD app
   - May have better tool execution support

### Environment Variables for HTTP Server

```bash
# Required for Dataverse access
POWERPLATFORM_URL="https://yourenv.crm.dynamics.com"
POWERPLATFORM_CLIENT_ID="your-app-client-id"
POWERPLATFORM_CLIENT_SECRET="your-app-secret"
POWERPLATFORM_TENANT_ID="your-tenant-id"

# Optional
HTTP_PORT=3000
MCP_API_KEY="optional-api-key"
MCP_SERVER_URL="https://your-ngrok-url"  # For OAuth discovery
```

### Quick Test Commands

```bash
# Start the HTTP server
cd packages/powerplatform
npm run start:http

# In another terminal, expose via ngrok
ngrok http 3000

# Test MCP protocol
curl -X POST https://your-ngrok-url/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# Test tool call
curl -X POST https://your-ngrok-url/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query-records","arguments":{"entityNamePlural":"accounts","maxRecords":1}}}'
```

---

*End of PRD*