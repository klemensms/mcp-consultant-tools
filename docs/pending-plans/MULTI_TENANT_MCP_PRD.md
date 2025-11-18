# Multi-Tenant MCP Server - Product Requirements Document

## Executive Summary

Transform the MCP Consultant Tools from a single-user, credential-embedded server into a **multi-tenant HTTP service** where:
- **End users** access multiple environments through a single MCP connection without managing credentials
- **Administrators** control which users can access which environments through a web interface
- **Credentials** are centrally managed in Azure Key Vault and never exposed to end users
- **Audit trails** track all access and operations for compliance

## Problem Statement

### Current State (v21)

Users must:
1. Install MCP server locally (npm/npx)
2. Configure `.env` file with credentials for each integration
3. Manage and rotate credentials manually
4. Have direct access to service principals/PATs

**Problems:**
- ❌ Credential sprawl: Every user has copies of sensitive credentials
- ❌ Security risk: Credentials stored in plaintext `.env` files
- ❌ No access control: Anyone with credentials has full access
- ❌ No audit trail: Can't track who did what
- ❌ Credential rotation nightmare: Must update every user's config
- ❌ No multi-environment support: Users can only access one environment at a time

### Desired State

Users should:
1. Connect to a centralized MCP HTTP server
2. Authenticate with their corporate Azure AD identity
3. See only the environments they have permission to access
4. Never see or manage credentials

**Benefits:**
- ✅ Centralized credential management (Azure Key Vault)
- ✅ Role-based access control per environment
- ✅ Complete audit trail of all operations
- ✅ Easy credential rotation (update Key Vault, no user impact)
- ✅ Multi-environment access through single connection
- ✅ Reduced attack surface (credentials never leave Azure)

---

## System Architecture

### High-Level Flow

```
1. User opens ChatGPT Desktop / Claude Desktop
2. MCP client connects to HTTP server (SSE transport)
3. User authenticates with Azure AD (OAuth flow)
4. Server queries database for user's permitted environments
5. Server loads credentials from Key Vault for those environments
6. MCP tools are dynamically filtered based on permissions
7. User invokes tools (e.g., "list PowerPlatform entities in Production")
8. Server validates permission, executes tool, logs audit entry
9. Results returned to user
```

### Components

#### 1. **HTTP MCP Server** (Azure Container Apps)
- Hosts MCP protocol over HTTP using SSE transport
- Replaces stdio transport with HTTP endpoints
- Handles authentication, authorization, tool execution
- Stateless design for horizontal scaling

#### 2. **Authentication Layer** (Azure AD)
- Users authenticate with corporate identity (OAuth 2.0)
- No separate passwords or API keys for end users
- Supports conditional access policies, MFA
- Provides user principal name (UPN) for authorization

#### 3. **Authorization Database** (Azure SQL)
- Stores environment definitions
- Maps users to environments with access levels
- Tracks admin users and their capabilities
- Maintains audit log

#### 4. **Credential Store** (Azure Key Vault)
- One Key Vault stores secrets for all environments
- Naming convention: `{TYPE}-{ENV}-{PARAM}` (e.g., `PP-PROD-CLIENT-SECRET`)
- Server uses Managed Identity to access Key Vault
- Supports credential rotation without user impact

#### 5. **Admin Interface** (Web UI or API)
- Manage environments (create, update, deactivate)
- Manage user permissions (grant, revoke, set expiration)
- View audit logs
- Manage admin users

---

## Database Schema

### Tables

#### **Environments**
Stores all configured environments across all integration types.

**Fields:**
- `EnvironmentId` (GUID, PK) - Unique identifier
- `EnvironmentName` (string) - Human-readable name (e.g., "Production PowerPlatform")
- `EnvironmentType` (enum) - Integration type: PowerPlatform, AzureDevOps, Figma, ApplicationInsights, LogAnalytics, AzureSQL, ServiceBus, SharePoint, GitHubEnterprise
- `KeyVaultName` (string) - Azure Key Vault name
- `KeyVaultSecretPrefix` (string) - Prefix for secrets (e.g., "PP-PROD")
- `ConfigMetadata` (JSON) - Environment-specific config:
  - PowerPlatform: `{"url": "https://env.crm.dynamics.com"}`
  - AzureDevOps: `{"organization": "myorg", "projects": ["Proj1"]}`
  - AzureSQL: `{"server": "sqlserver.database.windows.net", "database": "mydb"}`
- `IsActive` (boolean) - Enable/disable environment
- `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy` - Audit fields

**Example rows:**
| EnvironmentName | EnvironmentType | KeyVaultSecretPrefix | ConfigMetadata |
|---|---|---|---|
| Production PowerPlatform | PowerPlatform | PP-PROD | `{"url": "https://prod.crm.dynamics.com"}` |
| Dev PowerPlatform | PowerPlatform | PP-DEV | `{"url": "https://dev.crm.dynamics.com"}` |
| Main Azure DevOps | AzureDevOps | ADO-MAIN | `{"organization": "contoso"}` |

#### **UserPermissions**
Maps users to environments with access levels.

**Fields:**
- `PermissionId` (GUID, PK)
- `UserPrincipalName` (string) - Azure AD email (e.g., "alice@contoso.com")
- `EnvironmentId` (GUID, FK to Environments)
- `AccessLevel` (enum) - ReadOnly, ReadWrite, Admin
- `GrantedAt`, `GrantedBy` - Who granted permission and when
- `ExpiresAt` (nullable datetime) - Optional expiration
- `IsActive` (boolean) - Soft delete
- `Notes` (string) - Reason for access, ticket number, etc.

**Access Levels:**
- **ReadOnly**: Can use read-only tools (list, get, search, analyze)
- **ReadWrite**: Can use data modification tools (create, update, delete records)
- **Admin**: Can use schema/configuration tools (publish plugins, update workflows)

**Example rows:**
| UserPrincipalName | EnvironmentName | AccessLevel | ExpiresAt |
|---|---|---|---|
| alice@contoso.com | Production PowerPlatform | ReadOnly | null |
| alice@contoso.com | Dev PowerPlatform | ReadWrite | null |
| bob@contoso.com | Production PowerPlatform | ReadOnly | 2025-12-31 |
| admin@contoso.com | Production PowerPlatform | Admin | null |

#### **AdminUsers**
Users who can manage environments and permissions.

**Fields:**
- `AdminId` (GUID, PK)
- `UserPrincipalName` (string) - Azure AD email
- `CanManageEnvironments` (boolean) - Can create/update/delete environments
- `CanManagePermissions` (boolean) - Can grant/revoke user permissions
- `CanManageAdmins` (boolean) - Super admin, can promote other admins
- `IsActive` (boolean)
- `CreatedAt`, `CreatedBy`

**Example rows:**
| UserPrincipalName | CanManageEnvironments | CanManagePermissions | CanManageAdmins |
|---|---|---|---|
| superadmin@contoso.com | ✓ | ✓ | ✓ |
| envadmin@contoso.com | ✓ | ✗ | ✗ |
| permadmin@contoso.com | ✗ | ✓ | ✗ |

#### **AuditLog**
Complete audit trail of all operations.

**Fields:**
- `AuditId` (GUID, PK)
- `Timestamp` (datetime)
- `UserPrincipalName` (string) - Who performed the action
- `Action` (string) - Action type: ToolExecution, PermissionGranted, EnvironmentCreated, PermissionRevoked, CredentialAccessed
- `EnvironmentId` (nullable GUID) - Which environment
- `ResourceType` (string) - Environment, Permission, AdminUser, Tool
- `ResourceId` (string) - Specific resource identifier
- `Details` (JSON) - Full action details:
  - Tool executions: `{"tool": "list-entities", "params": {...}, "duration_ms": 234}`
  - Permission changes: `{"user": "alice@contoso.com", "level": "ReadOnly", "environment": "Prod"}`
- `Success` (boolean)
- `ErrorMessage` (nullable string)
- `IpAddress`, `UserAgent` - Request metadata

**Use cases:**
- Security audits: "Who accessed production last week?"
- Compliance: "Show all data modifications in Production PowerPlatform"
- Troubleshooting: "Why did Alice's tool call fail?"
- Analytics: "Which tools are most popular?"

---

## Azure Key Vault Secret Naming

### Naming Convention

```
{INTEGRATION_TYPE}-{ENVIRONMENT_NAME}-{PARAMETER}
```

**Examples:**

#### PowerPlatform
```
PP-PROD-URL                = https://prod.crm.dynamics.com
PP-PROD-CLIENT-ID          = <guid>
PP-PROD-CLIENT-SECRET      = <secret>
PP-PROD-TENANT-ID          = <guid>

PP-DEV-URL                 = https://dev.crm.dynamics.com
PP-DEV-CLIENT-ID           = <guid>
PP-DEV-CLIENT-SECRET       = <secret>
PP-DEV-TENANT-ID           = <guid>
```

#### Azure DevOps
```
ADO-MAIN-ORGANIZATION      = contoso
ADO-MAIN-PAT               = <personal-access-token>
ADO-MAIN-PROJECTS          = Project1,Project2
```

#### Azure SQL
```
ASQL-PROD-SERVER           = sqlserver.database.windows.net
ASQL-PROD-DATABASE         = ProductionDB
ASQL-PROD-USERNAME         = sqladmin
ASQL-PROD-PASSWORD         = <password>
```

#### Application Insights
```
APPINS-PROD-APP-ID         = <application-id>
APPINS-PROD-API-KEY        = <api-key>
APPINS-PROD-TENANT-ID      = <tenant-id>
```

### Credential Rotation Process

1. Admin updates secret in Key Vault (new version created automatically)
2. Server cache expires (5-minute TTL)
3. Next request fetches new secret version
4. **Zero user impact** - no configuration changes needed

---

## User Flows

### End User Flow

#### Initial Setup (One-time)
1. User receives email: "You've been granted access to MCP Consultant Tools"
2. User configures MCP client (ChatGPT Desktop / Claude Desktop):
   ```json
   {
     "mcpServers": {
       "consultant-tools": {
         "url": "https://mcp.contoso.com/sse",
         "transport": "sse",
         "auth": {
           "type": "oauth",
           "authority": "https://login.microsoftonline.com/contoso.com",
           "clientId": "mcp-client-id",
           "scopes": ["api://mcp-consultant-tools/access"]
         }
       }
     }
   }
   ```
3. User opens AI assistant, MCP client triggers OAuth login
4. User signs in with corporate credentials (Azure AD)
5. Access token obtained and cached

#### Daily Usage
1. User asks: "List all PowerPlatform entities in Production"
2. MCP client sends request to server with access token
3. Server:
   - Validates token → extracts UPN (alice@contoso.com)
   - Queries database → finds user has ReadOnly access to "Production PowerPlatform"
   - Loads credentials from Key Vault (PP-PROD-*)
   - Initializes PowerPlatformService with those credentials
   - Executes `list-entities` tool
   - Logs audit entry
   - Returns results
4. User sees entity list

#### Multi-Environment Access
User asks: "Compare entity counts between Production and Dev PowerPlatform"

Server recognizes two environments:
- Checks permissions for both (user has access to both)
- Loads credentials for both environments
- Executes queries against both
- Returns comparison

### Admin Flow

#### Onboarding New User
1. Admin logs into Admin Portal
2. Navigates to "User Permissions"
3. Clicks "Grant Access"
4. Fills form:
   - **User**: alice@contoso.com
   - **Environment**: Production PowerPlatform
   - **Access Level**: ReadOnly
   - **Expiration**: None (or specific date for temporary access)
   - **Notes**: "Business analyst - needs reporting access"
5. Clicks "Grant"
6. System:
   - Inserts row into UserPermissions table
   - Logs audit entry (PermissionGranted)
   - Sends email notification to alice@contoso.com
7. User can immediately access environment

#### Adding New Environment
1. Admin navigates to "Environments"
2. Clicks "Add Environment"
3. Fills form:
   - **Name**: "UAT PowerPlatform"
   - **Type**: PowerPlatform (dropdown)
   - **Key Vault**: mcp-keyvault
   - **Secret Prefix**: PP-UAT
   - **Config**: `{"url": "https://uat.crm.dynamics.com"}`
4. Clicks "Save"
5. System:
   - Inserts row into Environments table
   - Validates Key Vault secrets exist (PP-UAT-URL, PP-UAT-CLIENT-ID, etc.)
   - Logs audit entry (EnvironmentCreated)
6. Admin can now grant users access to this environment

#### Credential Rotation
1. Admin updates secret in Azure Key Vault:
   - Navigates to Key Vault → Secrets → PP-PROD-CLIENT-SECRET
   - Clicks "New Version"
   - Enters new secret value
   - Saves
2. **No action needed in MCP server** - next request automatically fetches new version
3. Old version remains available for rollback

#### Revoking Access
1. Admin navigates to "User Permissions"
2. Searches for user: bob@contoso.com
3. Sees permission: "Production PowerPlatform - ReadOnly"
4. Clicks "Revoke"
5. Confirms action
6. System:
   - Sets IsActive = false (soft delete)
   - Logs audit entry (PermissionRevoked)
   - Sends email notification to bob@contoso.com
7. Bob's next MCP request to Production fails with "Access Denied"

#### Viewing Audit Logs
1. Admin navigates to "Audit Logs"
2. Filters:
   - **User**: alice@contoso.com
   - **Environment**: Production PowerPlatform
   - **Action**: ToolExecution
   - **Date Range**: Last 7 days
3. Views table:
   | Timestamp | User | Action | Tool | Environment | Success |
   |---|---|---|---|---|---|
   | 2025-11-17 10:23 | alice@... | ToolExecution | list-entities | Prod PP | ✓ |
   | 2025-11-17 10:25 | alice@... | ToolExecution | search-records | Prod PP | ✓ |
   | 2025-11-17 10:30 | alice@... | ToolExecution | get-entity-metadata | Prod PP | ✗ |
4. Clicks on failed entry to see error details

---

## Security Model

### Authentication (Who are you?)

**Azure AD OAuth 2.0**
- Users authenticate with corporate identity
- Supports MFA, conditional access, device compliance
- No separate passwords to manage
- Tokens expire (1 hour), require refresh

**Flow:**
1. User opens MCP client
2. Client redirects to Azure AD login
3. User enters corporate credentials
4. Azure AD issues access token (JWT)
5. Client includes token in all MCP requests (Authorization: Bearer <token>)
6. Server validates token signature and claims

### Authorization (What can you do?)

**Database-Driven RBAC**

Every tool execution follows this flow:
1. Extract UPN from token (e.g., alice@contoso.com)
2. Query UserPermissions table:
   ```sql
   SELECT e.*, up.AccessLevel
   FROM UserPermissions up
   JOIN Environments e ON up.EnvironmentId = e.EnvironmentId
   WHERE up.UserPrincipalName = 'alice@contoso.com'
     AND up.IsActive = 1
     AND (up.ExpiresAt IS NULL OR up.ExpiresAt > GETUTCDATE())
   ```
3. Check if requested environment is in results
4. Check if tool's required access level <= user's access level:
   - Tool requires "ReadOnly", user has "ReadOnly" → ✓ Allow
   - Tool requires "ReadWrite", user has "ReadOnly" → ✗ Deny
   - Tool requires "Admin", user has "ReadWrite" → ✗ Deny
5. If allowed, proceed; otherwise return "Access Denied"

**Access Level Matrix:**

| Tool Category | Example Tools | Required Level |
|---|---|---|
| Metadata inspection | list-entities, get-entity-metadata, describe-plugin | ReadOnly |
| Data querying | search-records, fetch-record | ReadOnly |
| Data modification | create-record, update-record, delete-record | ReadWrite |
| Schema changes | publish-plugin, update-workflow | Admin |
| Configuration | update-environment-variable, deploy-solution | Admin |

### Credential Isolation

**Key Principles:**
1. **End users never see credentials** - stored in Key Vault, accessed via Managed Identity
2. **Credentials scoped to environment** - Production secrets != Dev secrets
3. **Least privilege** - Server uses read-only Managed Identity for Key Vault
4. **Short-lived caching** - Credentials cached for 5 minutes max
5. **No credential export** - No API to retrieve raw credentials

**Architecture:**
```
┌────────────────┐
│  End User      │  ← No access to credentials
└───────┬────────┘
        │ OAuth Token (user identity only)
        ▼
┌────────────────┐
│  MCP Server    │  ← Uses Managed Identity
└───────┬────────┘
        │ Managed Identity
        ▼
┌────────────────┐
│  Key Vault     │  ← Stores all credentials
└────────────────┘
```

### Audit Compliance

**Every operation logged:**
- Who (UserPrincipalName)
- What (Action, Tool)
- When (Timestamp)
- Where (EnvironmentId, IpAddress)
- Result (Success/Failure, ErrorMessage)
- Details (Full request/response)

**Retention:**
- Audit logs retained for 90 days (configurable)
- Archived to Azure Storage for long-term retention
- Tamper-proof (append-only table)

**Compliance use cases:**
- SOC 2: Demonstrate access controls and audit trails
- GDPR: Track data access and modifications
- HIPAA: Audit patient data access
- Internal audit: "Who modified this record last month?"

---

## Tool Filtering & Multi-Tenancy

### Dynamic Tool Registration

Unlike v21 where all tools are registered globally, the multi-tenant server registers tools **dynamically per user session** based on permissions.

**Example:**

**User: alice@contoso.com**
Permissions:
- Production PowerPlatform (ReadOnly)
- Dev Azure DevOps (ReadWrite)

**Available tools for Alice:**
- PowerPlatform tools (PP-PROD environment):
  - `pp-prod-list-entities`
  - `pp-prod-search-records`
  - `pp-prod-get-entity-metadata`
  - (39 read-only tools)
- Azure DevOps tools (ADO-DEV environment):
  - `ado-dev-list-wikis`
  - `ado-dev-create-work-item` (has ReadWrite)
  - `ado-dev-update-work-item` (has ReadWrite)
  - (18 tools)

**NOT available for Alice:**
- PowerPlatform write tools (PP-PROD): `create-record`, `update-record` (requires ReadWrite)
- PowerPlatform admin tools (PP-PROD): `publish-plugin` (requires Admin)
- Dev PowerPlatform tools (no permission to PP-DEV)

### Tool Naming Convention

Tools are prefixed with environment identifier to support multi-environment access:

```
{environment-id}-{original-tool-name}
```

**Examples:**
- `pp-prod-list-entities` - List entities in Production PowerPlatform
- `pp-dev-list-entities` - List entities in Dev PowerPlatform
- `ado-main-list-wikis` - List wikis in Main Azure DevOps
- `asql-prod-execute-query` - Query Production Azure SQL

**Why prefixes?**
- Allows user to access multiple environments simultaneously
- Prevents ambiguity: "list entities" in which environment?
- Enables cross-environment queries: "Compare Prod vs Dev"

### Prompt Filtering

Prompts are similarly filtered based on environment access.

**Example prompts for Alice:**
- `pp-prod-analyze-plugin-deployment` (Production PowerPlatform)
- `ado-dev-work-item-report` (Dev Azure DevOps)

### Environment Context in Responses

Server includes environment context in responses:

**User request:** "List all entities"

**Server response (multiple environments):**
```
You have access to PowerPlatform in these environments:
- Production PowerPlatform (pp-prod)
- Dev PowerPlatform (pp-dev)

Please specify which environment, or use tool:
- pp-prod-list-entities
- pp-dev-list-entities
```

**User request:** "List all entities in Production"

**Server response:**
```
[Results from pp-prod-list-entities...]
```

---

## Deployment Architecture

### Azure Resources

#### 1. **Azure Container Apps** (HTTP MCP Server)
- Hosts Node.js application with SSE transport
- Auto-scales based on concurrent connections
- Environment variables from Key Vault references
- System-assigned Managed Identity for Key Vault access
- Ingress: External HTTPS (public or private depending on requirements)
- Health probes: `/health` endpoint

#### 2. **Azure SQL Database** (Authorization Database)
- Tier: Standard S0 (scalable up as needed)
- Contains Environments, UserPermissions, AdminUsers, AuditLog tables
- Firewall: Allow Azure services + admin IP
- SQL Authentication or Azure AD authentication
- Automated backups (point-in-time restore)

#### 3. **Azure Key Vault** (Credential Store)
- Stores all integration credentials
- Naming convention: `{TYPE}-{ENV}-{PARAM}`
- Access policies: MCP Server Managed Identity (Get Secret permission only)
- Soft delete enabled (90-day retention)
- Audit logging enabled (track secret access)

#### 4. **Azure App Service / Static Web App** (Admin Portal)
- Web UI for managing environments and permissions
- Authentication: Azure AD (restricted to admin users)
- API endpoints: `/api/environments`, `/api/permissions`, `/api/audit`
- CORS: Allow MCP server domain

#### 5. **Azure Application Insights** (Monitoring)
- Monitors MCP server performance
- Tracks tool execution times
- Alerts on errors, high latency
- Custom events for authorization failures

#### 6. **Azure Front Door** (Optional - Global Distribution)
- CDN for low-latency global access
- DDoS protection
- WAF rules for security

### Network Architecture

**Option A: Public Access**
```
Internet → Azure Front Door → Container Apps → SQL Database
                                            → Key Vault
```

**Option B: Private Access (Enterprise)**
```
Corporate Network → VPN/ExpressRoute → Virtual Network → Container Apps → SQL Database
                                                                       → Key Vault
```

### High Availability

- **Container Apps**: Multi-replica deployment (min 2 replicas)
- **SQL Database**: Geo-redundant backups, failover groups
- **Key Vault**: Automatically geo-replicated by Azure
- **Uptime SLA**: 99.95% (Container Apps) + 99.99% (SQL Database)

### Disaster Recovery

- **RPO (Recovery Point Objective)**: < 5 minutes (SQL Database point-in-time restore)
- **RTO (Recovery Time Objective)**: < 30 minutes (Container Apps redeploy + DNS update)
- **Backup strategy**:
  - SQL Database: Automated daily backups, 35-day retention
  - Key Vault: Soft delete with 90-day retention
  - Audit logs: Archived to Azure Storage (immutable, 7-year retention)

---

## Admin Interface

### Admin Portal (Web UI)

**Technology options:**
1. **React + Azure Static Web Apps** (recommended)
2. **Blazor Server** (if .NET preferred)
3. **Next.js + Azure App Service**

**Features:**

#### Dashboard
- Total environments: 12
- Total users: 245
- Active sessions: 18
- Recent audit events (last 24h)
- Health status of all integrations

#### Environments Management
**List view:**
| Name | Type | Status | Users | Actions |
|---|---|---|---|---|
| Production PowerPlatform | PowerPlatform | Active | 45 | Edit, Disable, Test |
| Dev PowerPlatform | PowerPlatform | Active | 12 | Edit, Disable, Test |
| Main Azure DevOps | AzureDevOps | Active | 30 | Edit, Disable, Test |

**Add/Edit form:**
- Environment Name (text)
- Environment Type (dropdown: PowerPlatform, AzureDevOps, etc.)
- Key Vault Name (text)
- Secret Prefix (text)
- Config Metadata (JSON editor)
- Status (Active/Inactive toggle)
- **Test Connection** button (validates credentials in Key Vault)

#### User Permissions Management
**List view with search/filter:**
| User | Environment | Access Level | Granted By | Expires | Actions |
|---|---|---|---|---|---|
| alice@contoso.com | Production PP | ReadOnly | admin@... | - | Revoke |
| bob@contoso.com | Production PP | ReadOnly | admin@... | 2025-12-31 | Extend, Revoke |
| charlie@contoso.com | Dev PP | ReadWrite | admin@... | - | Modify, Revoke |

**Grant Access form:**
- User Email (autocomplete from Azure AD)
- Environment (dropdown)
- Access Level (ReadOnly / ReadWrite / Admin)
- Expiration Date (optional)
- Notes (text area)

**Bulk operations:**
- Import from CSV (user,environment,level)
- Grant to group (Azure AD group → all members)

#### Admin Users Management
**List view:**
| User | Manage Environments | Manage Permissions | Manage Admins | Actions |
|---|---|---|---|---|
| superadmin@contoso.com | ✓ | ✓ | ✓ | Edit, Remove |
| envadmin@contoso.com | ✓ | ✗ | ✗ | Edit, Remove |

**Add/Edit form:**
- User Email
- Permissions checkboxes:
  - [ ] Can manage environments
  - [ ] Can manage permissions
  - [ ] Can manage admins (super admin only)

#### Audit Logs Viewer
**Filters:**
- User (autocomplete)
- Environment (dropdown)
- Action type (dropdown: All, ToolExecution, PermissionGranted, etc.)
- Date range (date picker)
- Success/Failure (checkbox)

**Results table:**
| Timestamp | User | Action | Environment | Resource | Success | Details |
|---|---|---|---|---|---|---|
| 2025-11-17 10:23 | alice@... | ToolExecution | Prod PP | list-entities | ✓ | View JSON |
| 2025-11-17 09:15 | admin@... | PermissionGranted | Prod PP | alice@... | ✓ | View JSON |

**Export:**
- Export to CSV
- Export to JSON
- Export to Azure Storage (long-term archive)

### CLI Alternative (for automation)

For admins who prefer CLI or need automation:

```bash
# Authenticate
mcp-admin login

# List environments
mcp-admin environments list

# Add environment
mcp-admin environments add \
  --name "UAT PowerPlatform" \
  --type PowerPlatform \
  --keyvault mcp-keyvault \
  --prefix PP-UAT \
  --config '{"url": "https://uat.crm.dynamics.com"}'

# Grant access
mcp-admin permissions grant \
  --user alice@contoso.com \
  --environment "Production PowerPlatform" \
  --level ReadOnly

# Revoke access
mcp-admin permissions revoke \
  --user bob@contoso.com \
  --environment "Production PowerPlatform"

# View audit logs
mcp-admin audit logs \
  --user alice@contoso.com \
  --environment "Production PowerPlatform" \
  --start "2025-11-01" \
  --end "2025-11-17"

# Bulk import
mcp-admin permissions import --file permissions.csv
```

---

## Performance & Scalability

### Expected Load
- **Users**: 500-1000 concurrent users
- **Environments**: 50-100 environments
- **Tool executions**: 10,000 per day
- **Audit records**: 100,000 per month

### Performance Targets
- **Authentication**: < 200ms (token validation + DB lookup)
- **Tool execution**: < 2s (depends on integration API)
- **Admin portal load**: < 1s (page load)
- **Concurrent connections**: 1000+ SSE connections

### Caching Strategy
1. **User permissions cache**:
   - Cache user → environments mapping for 5 minutes
   - Invalidate on permission changes
   - Reduces DB queries by 90%

2. **Key Vault credentials cache**:
   - Cache secrets for 5 minutes
   - Reduces Key Vault API calls
   - Automatic refresh on expiration

3. **Azure AD token cache**:
   - Cache validated tokens for 5 minutes
   - Reduces token validation overhead

4. **Environment metadata cache**:
   - Cache environment configs for 15 minutes
   - Invalidate on environment updates

### Horizontal Scaling
- Container Apps auto-scales based on:
  - CPU utilization (> 70% triggers scale-out)
  - Concurrent connections (> 100 per replica)
  - Custom metric: Tool execution queue depth
- Max replicas: 10 (configurable)

---

## Migration Path from v21

### Phase 1: Add HTTP Transport (Backward Compatible)
- Add new package: `@mcp-consultant-tools/http-server`
- Existing packages remain unchanged (stdio transport)
- Users can continue using v21 locally while HTTP server is set up

### Phase 2: Deploy HTTP Server (Pilot)
- Deploy to Azure with single environment
- Invite pilot users (10-20 users)
- Validate authentication, authorization, tool execution
- Collect feedback

### Phase 3: Full Rollout
- Add remaining environments
- Migrate all users to HTTP server
- Deprecate local stdio installations (optional - can coexist)

### Phase 4: Decommission Local Installations
- After 6 months, deprecate stdio packages (optional)
- All users on centralized HTTP server

---

## Success Metrics

### Security Metrics
- ✓ Zero credential exposures (no credentials in user configs)
- ✓ 100% audit coverage (all operations logged)
- ✓ < 5 minute credential rotation impact

### User Experience Metrics
- ✓ < 5 minute onboarding time (from email to first tool use)
- ✓ Zero credential management tasks for end users
- ✓ Multi-environment access (users can access avg 3.5 environments)

### Operational Metrics
- ✓ 99.9% uptime SLA
- ✓ < 2s average tool execution time
- ✓ < 1 hour time-to-grant-access

### Admin Efficiency Metrics
- ✓ < 2 minutes to onboard new user
- ✓ < 5 minutes to add new environment
- ✓ < 30 seconds to revoke access

---

## Open Questions & Decisions

### 1. Admin Portal Technology
**Options:**
- A) React + Azure Static Web Apps (recommended)
- B) Blazor Server (.NET)
- C) Next.js + App Service

**Decision needed:** Which framework aligns with team skills?

### 2. Database Choice
**Options:**
- A) Azure SQL Database (recommended - relational, ACID, familiar)
- B) Cosmos DB (NoSQL, global distribution, higher cost)
- C) PostgreSQL on Azure (open-source, similar to SQL)

**Decision needed:** Preference for relational vs NoSQL?

### 3. Public vs Private Deployment
**Options:**
- A) Public internet access (easier, lower cost)
- B) Private VNet (more secure, requires VPN/ExpressRoute)

**Decision needed:** Security requirements?

### 4. Group-Based Permissions
**Should we support Azure AD group-based permissions?**
- Pro: Easier to manage large user bases ("grant DevTeam group access")
- Con: More complex to implement (requires Graph API, group expansion)

**Decision needed:** Support groups or individual users only?

### 5. Environment Isolation
**Should each environment have separate Key Vaults?**
- Current design: One Key Vault, prefix-based isolation (PP-PROD-*, PP-DEV-*)
- Alternative: One Key Vault per environment (higher isolation, more management)

**Decision needed:** Security vs operational overhead trade-off?

### 6. Credential Type Support
**Which authentication methods to support?**
- Azure AD (Entra ID) - ✓ Recommended for all Azure services
- Service Principal (client ID/secret) - ✓ Current approach
- Managed Identity - ✓ Where possible
- Personal Access Tokens (PAT) - ✓ For GitHub, Azure DevOps
- API Keys - ✓ For Figma, Application Insights
- OAuth tokens - Future consideration

**Decision needed:** Prioritization order?

---

## Next Steps

1. **Review PRD with stakeholders**
   - Security team (credential management, audit requirements)
   - Infrastructure team (Azure deployment, cost estimates)
   - Development team (implementation feasibility)

2. **Prototype core components** (2-week spike)
   - HTTP transport with SSE
   - Azure AD authentication
   - Database authorization lookup
   - Single integration (PowerPlatform) end-to-end

3. **Cost estimation**
   - Azure Container Apps: ~$50/month (2 replicas)
   - Azure SQL Database: ~$15/month (S0 tier)
   - Azure Key Vault: ~$0.50/month
   - **Total: ~$65-100/month** (scales with usage)

4. **Implementation plan**
   - Sprint 1-2: Database schema, Key Vault setup, HTTP server skeleton
   - Sprint 3-4: Authentication, authorization, tool filtering
   - Sprint 5-6: Admin portal MVP (environments + permissions)
   - Sprint 7-8: Pilot deployment, testing, refinement
   - Sprint 9-10: Full rollout

5. **Documentation**
   - Admin guide (how to manage environments/permissions)
   - User guide (how to configure MCP client for HTTP)
   - Operations runbook (deployment, monitoring, troubleshooting)

---

## Appendix: Example Scenarios

### Scenario 1: Consultant Accessing Client Environments

**Context:** Alice is a consultant working with 3 clients, each with their own PowerPlatform environment.

**Setup:**
1. Admin creates 3 environments:
   - "Client A Production"
   - "Client B Production"
   - "Client C Dev"
2. Admin grants Alice ReadOnly access to all 3

**Usage:**
- Alice opens ChatGPT Desktop
- Asks: "Compare entity counts across all my PowerPlatform environments"
- Server:
  - Identifies Alice has access to 3 environments
  - Loads credentials for all 3 from Key Vault (different client credentials)
  - Executes list-entities on all 3
  - Returns comparison table

**Benefit:** Alice accesses 3 different client environments with different credentials through single connection, without managing any credentials herself.

### Scenario 2: Temporary Contractor Access

**Context:** Bob is a contractor hired for 3-month project needing Azure DevOps access.

**Setup:**
1. Admin grants Bob ReadWrite access to "Project X Azure DevOps"
2. Sets expiration: 2026-02-17 (3 months)
3. Notes: "Contractor - Project X - PO#12345"

**Usage:**
- Bob uses tools for 3 months
- Feb 17 arrives → permission expires automatically
- Bob's next tool call fails: "Access expired. Contact admin to extend."

**Benefit:** No manual revocation needed, automatic cleanup, audit trail preserved.

### Scenario 3: Production Incident Response

**Context:** Production PowerPlatform is down. DevOps team needs emergency access to investigate.

**Setup:**
1. On-call admin logs into portal
2. Grants "DevOpsTeam" group ReadOnly access to "Production PowerPlatform"
3. Sets expiration: +4 hours

**Usage:**
- Team members immediately have access (within 5 min cache refresh)
- Investigate using read-only tools
- Issue resolved
- 4 hours later, access automatically revoked

**Audit:**
- Complete trail of who accessed what during incident
- No lingering elevated access

**Benefit:** Fast emergency access grant, automatic revocation, complete audit trail.

### Scenario 4: Developer Promoting Changes

**Context:** Developer Alice wants to test plugin deployment workflow from Dev → UAT → Production.

**Permissions:**
- Dev PowerPlatform: Admin (can publish plugins)
- UAT PowerPlatform: ReadWrite (can test, not publish)
- Production PowerPlatform: ReadOnly (can verify, not change)

**Usage:**
- Alice: "Publish my plugin to Dev PowerPlatform"
  - ✓ Allowed (has Admin level)
- Alice: "Test plugin in UAT PowerPlatform"
  - ✓ Allowed (ReadWrite sufficient for testing)
- Alice: "Publish plugin to Production PowerPlatform"
  - ✗ Denied (requires Admin level, Alice only has ReadOnly)
- Alice requests Production publish via change management process
- Admin reviews, approves, uses their own Admin access to publish

**Benefit:** Principle of least privilege enforced, production protected, safe lower-environment access.

---

## Conclusion

This multi-tenant MCP server architecture transforms credential management from a user problem into an infrastructure solution. By centralizing authentication, authorization, and credential storage, we achieve:

- **Better security** (credentials never leave Azure)
- **Better compliance** (complete audit trail)
- **Better user experience** (zero credential management)
- **Better operations** (centralized administration)

The investment in HTTP transport, database-driven authorization, and admin tooling pays dividends in reduced security risk, simplified onboarding, and operational efficiency.
