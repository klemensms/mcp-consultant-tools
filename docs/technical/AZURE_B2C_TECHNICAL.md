# Azure B2C - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/AZURE_B2C.md -->

<overview>

**Package:** `@mcp-consultant-tools/azure-b2c`
**MCP Binary:** `mcp-azure-b2c`
**CLI Binary:** `mcp-azure-b2c-cli`
**Tools:** 11 tools (8 user, 3 group) | **Prompts:** 2

Azure AD B2C integration for user and group management via Microsoft Graph API. Uses client credentials flow (service principal) with granular write-operation feature flags.

</overview>

<architecture>

```
MCP Client (Claude, etc.)
          │
          ▼
     index.ts / cli.ts
  ┌──────────────────────────────────────────┐
  │  Tools (11)              Prompts (2)     │
  │  - b2c-list-users        b2c-user-       │
  │  - b2c-get-user            overview      │
  │  - b2c-search-users      b2c-tenant-     │
  │  - b2c-list-groups         summary       │
  │  - b2c-get-user-groups                   │
  │  - b2c-get-group-members                 │
  │  - b2c-reset-user-password               │
  │  - b2c-force-pwd-change                  │
  │  - b2c-create-user                       │
  │  - b2c-update-user                       │
  │  - b2c-delete-user                       │
  └──────────────────────────────────────────┘
          │
          ▼
  ServiceContext (lazy getters)
    ├── B2CClient          (auth, mapping, error enhancement)
    ├── UserService        (user CRUD, search, password ops)
    └── GroupService       (groups, membership, tenant summary)
          │
          ▼
  Microsoft Graph API (graph.microsoft.com/v1.0)
    /users
    /groups
    /users/{id}/memberOf
    /groups/{id}/members
```

<file-structure>

```
packages/azure-b2c/src/
  index.ts                    # MCP server entry point
  context-factory.ts          # Shared createServiceContext() for MCP + CLI
  b2c-client.ts               # Graph API client, auth, mapping, error enhancement
  types.ts                    # ServiceContext interface
  tool-examples.ts            # descWithExamples + example arrays
  cli.ts                      # CLI entry point (Commander.js)
  models/
    api-types.ts              # B2CUser, B2CGroup, AzureB2CConfig, etc.
    index.ts                  # Barrel export
  services/
    user-service.ts           # listUsers, getUser, searchUsers, resetPassword, etc.
    group-service.ts          # listGroups, getUserGroups, getGroupMembers, getTenantSummary
    index.ts                  # Barrel export
  tools/
    user-tools.ts             # registerUserTools() — 8 tools
    group-tools.ts            # registerGroupTools() — 3 tools
    index.ts                  # registerAllTools() aggregator
  prompts/
    templates.ts              # registerB2CPrompts() — 2 prompts
    index.ts                  # registerAllPrompts() aggregator
  utils/
    formatters.ts             # formatUser(), formatUserList(), formatTenantSummary(), etc.
  cli/
    output.ts                 # Cache dir: .mcp-azure-b2c-cache
    commands/
      user-commands.ts        # 8 user CLI commands
      group-commands.ts       # 3 group CLI commands
      tenant-commands.ts      # 1 tenant CLI command (summary)
      index.ts                # registerAllCommands() aggregator
```

</file-structure>

</architecture>

<authentication>

Uses Azure Identity SDK with **Client Credentials flow** (service principal). No user interaction required.

```typescript
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

const graphClient = Client.initWithMiddleware({ authProvider });
```

`ClientSecretCredential` automatically handles token acquisition, caching, and refresh before expiration. No manual token management is required.

<app-registration-setup>

1. Go to **Azure Portal** > **Azure AD B2C** > **App registrations** > **New registration**
2. Name: `MCP B2C Management` — Supported account types: **Accounts in this organizational directory only** — No redirect URI
3. **API permissions** > Add **Microsoft Graph** > **Application permissions**:
   - `User.ReadWrite.All` — required for all user operations (use `User.Read.All` for read-only)
   - `Directory.ReadWrite.All` — required for group operations
   - Click **Grant admin consent**
4. **Certificates & secrets** > **New client secret** — copy the value immediately (shown once)
5. **Assign directory role:** Azure AD B2C > Roles and administrators > **User Administrator** > Add assignments > select the app registration

Required configuration values:
- **Tenant ID** — Overview > Directory (tenant) ID
- **Client ID** — App registration > Overview > Application (client) ID
- **Client Secret** — value from step 4

</app-registration-setup>

</authentication>

<configuration>

<environment-variables>

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_B2C_TENANT_ID` | Yes | — | Tenant ID (GUID or `contoso.onmicrosoft.com`) |
| `AZURE_B2C_CLIENT_ID` | Yes | — | App registration client ID |
| `AZURE_B2C_CLIENT_SECRET` | Yes | — | App registration client secret |
| `AZURE_B2C_ENABLE_PASSWORD_RESET` | No | `false` | Enable `b2c-reset-user-password` and `b2c-force-pwd-change` |
| `AZURE_B2C_ENABLE_USER_CREATE` | No | `false` | Enable `b2c-create-user` |
| `AZURE_B2C_ENABLE_USER_UPDATE` | No | `false` | Enable `b2c-update-user` |
| `AZURE_B2C_ENABLE_USER_DELETE` | No | `false` | Enable `b2c-delete-user` |
| `AZURE_B2C_MAX_RESULTS` | No | `100` | Maximum users/groups per API request |

</environment-variables>

<feature-flag-model>

Feature flags are loaded from environment at service initialization and stored in `AzureB2CConfig`. Write tools check flags via `B2CClient.checkPermission()` before executing:

```typescript
checkPermission(operation: string, enabled: boolean): void {
  if (!enabled) {
    throw new Error(
      `${operation} is not enabled. ` +
      `Set the appropriate environment variable to enable this operation.`
    );
  }
}
```

| Flag | Unlocks | Risk |
|------|---------|------|
| *(none)* | All read tools | Safe |
| `AZURE_B2C_ENABLE_PASSWORD_RESET=true` | Reset password, force password change | Medium |
| `AZURE_B2C_ENABLE_USER_CREATE=true` | Create new local account users | Medium |
| `AZURE_B2C_ENABLE_USER_UPDATE=true` | Update user profile fields, enable/disable account | Medium |
| `AZURE_B2C_ENABLE_USER_DELETE=true` | Permanently delete users | High |

</feature-flag-model>

<config-type>

```typescript
export interface AzureB2CConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  enablePasswordReset: boolean;
  enableUserCreate: boolean;
  enableUserUpdate: boolean;
  enableUserDelete: boolean;
  maxResults?: number;       // default: 100
  cacheUsersTTL?: number;    // seconds; default: 300 (5 min)
}
```

</config-type>

</configuration>

<tool-reference>

<tool-group name="user-read" description="Read-only user tools — always enabled">

<tool name="b2c-list-users">

List Azure AD B2C users with optional OData filtering.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `top` | number | No | 50 | Max users to return (capped at `AZURE_B2C_MAX_RESULTS`) |
| `filter` | string | No | — | OData filter expression |
| `includeAllFields` | boolean | No | false | Return all Graph API fields, including `extension_*` custom attributes |

**OData filter examples:**
- `"accountEnabled eq true"` — active users only
- `"startswith(displayName,'John')"` — name prefix match
- `"mail eq 'user@example.com'"` — exact email match

When `filter` is provided, result is not cached. When `filter` is omitted, result is cached for `cacheUsersTTL` seconds.

</tool>

<tool name="b2c-get-user">

Get detailed information about a specific user by ID or email address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User GUID or email/UPN (e.g., `user@tenant.onmicrosoft.com`) |
| `includeAllFields` | boolean | No | Return all Graph API fields including `extension_*` attributes |

</tool>

<tool name="b2c-search-users">

Search users using OData `startswith` filter across one or more fields.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `searchTerm` | string | Yes | — | Prefix to match |
| `searchFields` | enum[] | No | `["displayName","mail"]` | Fields: `displayName`, `mail`, `userPrincipalName`, `givenName`, `surname` |
| `top` | number | No | 25 | Max results (capped at `AZURE_B2C_MAX_RESULTS`) |
| `includeAllFields` | boolean | No | false | Return all Graph API fields |

Single quotes in `searchTerm` are automatically escaped.

</tool>

</tool-group>

<tool-group name="group-read" description="Read-only group tools — always enabled">

<tool name="b2c-list-groups">

List all groups in the B2C tenant.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `top` | number | No | 50 | Max groups to return |

Result is cached for `cacheUsersTTL` seconds (same TTL as users, stored in `GroupService.groupsCache`).

</tool>

<tool name="b2c-get-user-groups">

Get all groups a user belongs to. Filters to `@odata.type === '#microsoft.graph.group'` — directory roles that also appear in `memberOf` are excluded.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User GUID or email/UPN |

</tool>

<tool name="b2c-get-group-members">

Get all members of a specific group. Filters to `@odata.type === '#microsoft.graph.user'` — non-user members (nested groups, service principals) are excluded.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `groupId` | string | Yes | — | Group GUID |
| `top` | number | No | 50 | Max members to return |
| `includeAllFields` | boolean | No | false | Return all Graph API fields including `extension_*` |

</tool>

</tool-group>

<tool-group name="password" description="Password tools — require AZURE_B2C_ENABLE_PASSWORD_RESET=true">

<tool name="b2c-reset-user-password">

Reset a user's password using the Graph API `passwordProfile` update. Only works for **local accounts** (signInType `emailAddress` or `userName`). Fails for social or federated accounts.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `userId` | string | Yes | — | User GUID or email |
| `newPassword` | string | Yes | — | New password (must meet B2C complexity requirements) |
| `forceChangeOnNextLogin` | boolean | No | false | Set `forceChangePasswordNextSignIn: true` |

**Password complexity requirements (Azure AD B2C default policy):**
- 8–256 characters
- Must contain at least 3 of: lowercase letter, uppercase letter, digit, symbol

</tool>

<tool name="b2c-force-pwd-change">

Force a user to change their password on next login by setting `forceChangePasswordNextSignIn: true`. Does not change the current password.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User GUID or email |

</tool>

</tool-group>

<tool-group name="user-write" description="User write tools — each requires its own feature flag">

<tool name="b2c-create-user">

Create a new local account user in Azure AD B2C. Requires `AZURE_B2C_ENABLE_USER_CREATE=true`.

The tool automatically constructs the `identities` array with `signInType: 'emailAddress'`. The issuer is derived from `AZURE_B2C_TENANT_ID` — if it contains a `.`, it is used as-is; otherwise `.onmicrosoft.com` is appended.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `displayName` | string | Yes | — | Display name |
| `email` | string | Yes | — | Email address used for sign-in (`issuerAssignedId`) |
| `password` | string | Yes | — | Initial password |
| `forceChangePasswordNextSignIn` | boolean | No | true | Require password change on first login |
| `givenName` | string | No | — | First name |
| `surname` | string | No | — | Last name |
| `jobTitle` | string | No | — | Job title |
| `department` | string | No | — | Department |
| `mobilePhone` | string | No | — | Mobile phone |
| `city` | string | No | — | City |
| `country` | string | No | — | Country |

After creation, the user cache is invalidated.

</tool>

<tool name="b2c-update-user">

Update a user's profile fields (not password). Requires `AZURE_B2C_ENABLE_USER_UPDATE=true`. The `accountEnabled` field can be used to enable or disable an account.

Requires at least one field to be specified — returns `isError: true` if no updates are provided.

After update, fetches the updated user record and invalidates the user cache.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User GUID or email |
| `displayName` | string | No | New display name |
| `givenName` | string | No | First name |
| `surname` | string | No | Last name |
| `jobTitle` | string | No | Job title |
| `department` | string | No | Department |
| `mobilePhone` | string | No | Mobile phone |
| `city` | string | No | City |
| `country` | string | No | Country |
| `accountEnabled` | boolean | No | Enable (`true`) or disable (`false`) the account |

</tool>

<tool name="b2c-delete-user">

Permanently delete a user from Azure AD B2C. **IRREVERSIBLE.** Requires `AZURE_B2C_ENABLE_USER_DELETE=true`.

The tool enforces a two-gate safety check:
1. Feature flag `AZURE_B2C_ENABLE_USER_DELETE=true` must be set in the environment
2. `confirmDeletion: true` must be passed in the tool call — if false, returns `isError: true` without calling the API

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User GUID (not email — use GUID for delete) |
| `confirmDeletion` | boolean | Yes | Must be `true` to proceed |

</tool>

</tool-group>

</tool-reference>

<prompts>

<prompt name="b2c-user-overview">

Fetches user profile and group memberships in parallel, formats the combined result as structured markdown via `formatUserWithGroups()`.

**Parameter:** `userId` (string) — User GUID or email address

**Output sections:**
- Basic Information (ID, name, account status)
- Contact Information (UPN, email, other emails, mobile phone)
- Work Information (job title, department) — only if present
- Location (city, country) — only if present
- Identities (local type and issuerAssignedId, or federated provider)
- Account Details (createdDateTime)
- Group Memberships (list of group names and descriptions)

</prompt>

<prompt name="b2c-tenant-summary">

Fetches all users (up to 1000) and all groups (up to 1000) in parallel, computes statistics, and formats via `formatTenantSummary()`.

**No parameters required.**

**Output sections:**
- Tenant ID
- User Statistics: total, enabled, disabled
- Account Types: local (emailAddress/userName signInType) vs. federated
- Groups: total count

**Note:** This prompt fetches large result sets to build the summary. On large tenants it may be slow and will count against API quota.

</prompt>

</prompts>

<service-implementation>

<service name="B2CClient" file="b2c-client.ts">

Handles authentication, Graph client initialization, response mapping, and error enhancement. Services depend on `B2CClient` — they do not hold Graph client references directly.

**Responsibilities:**
- Lazy Graph client initialization (created on first `getClient()` call)
- Response mapping: `mapUserResponse()`, `mapUsersResponse()`, `mapGroupResponse()`, `mapGroupsResponse()`
- Permission checking: `checkPermission(operation, enabled)`
- Error enhancement: `enhanceError(error, operation)` — translates HTTP status codes and error messages into actionable user-facing messages

</service>

<service name="UserService" file="services/user-service.ts">

Handles all user operations. Holds an in-memory cache for user lists.

**Methods:**
- `listUsers(top, filter?, skipCache?, includeAllFields?)` — list with optional OData filter and caching
- `getUser(userIdOrEmail, includeAllFields?)` — fetch single user
- `searchUsers(searchTerm, searchFields?, top?, includeAllFields?)` — prefix search using OData `startswith`
- `resetUserPassword(userId, newPassword, forceChangeOnNextLogin?)` — requires `enablePasswordReset`
- `forcePasswordChange(userId)` — requires `enablePasswordReset`
- `createUser(request: CreateUserRequest)` — requires `enableUserCreate`; invalidates cache
- `updateUser(userId, updates: UpdateUserRequest)` — requires `enableUserUpdate`; invalidates cache
- `deleteUser(userId)` — requires `enableUserDelete`; invalidates cache
- `invalidateCache()` — explicitly clears `usersCache`
- `getConfigStatus()` — returns current tenant ID and flag values (used by CLI and `b2c-create-user` to derive issuer)

**Caching behavior:**
- `usersCache` stores `{ data: B2CUser[]; expires: number }`
- Cache is populated only when `filter` is undefined and `includeAllFields` is false
- Cache is invalidated by any write operation (create, update, delete, password reset)
- TTL: `config.cacheUsersTTL` seconds (default 300 = 5 minutes)

</service>

<service name="GroupService" file="services/group-service.ts">

Handles group operations, tenant summary, and connection testing. Takes both `B2CClient` and `UserService` in its constructor (needed for `getTenantSummary`).

**Methods:**
- `listGroups(top?)` — list with caching (same TTL as user cache via `cacheUsersTTL`)
- `getUserGroups(userId)` — get user's group memberships via `/users/{id}/memberOf`; filters to groups only
- `getGroupMembers(groupId, top?, includeAllFields?)` — get members via `/groups/{id}/members`; filters to users only
- `getTenantSummary()` — fetches up to 1000 users and 1000 groups in parallel, computes account type counts
- `testConnection()` — attempts to read 1 user and 1 group; returns `{ connected, canReadUsers, canReadGroups }`
- `clearCache()` — clears `groupsCache`

</service>

</service-implementation>

<graph-api-operations>

<operation name="list-users">

```typescript
const response = await graphClient
  .api('/users')
  .top(limit)
  .select(['id', 'displayName', 'givenName', 'surname',
           'userPrincipalName', 'mail', 'otherMails', 'identities',
           'accountEnabled', 'createdDateTime', 'jobTitle', 'department',
           'mobilePhone', 'city', 'country'])
  .filter(filter)  // omitted if no filter
  .get();
```

</operation>

<operation name="search-users">

```typescript
const filters = searchFields.map(
  (field) => `startswith(${field}, '${searchTerm.replace(/'/g, "''")}')`
);
const filterString = filters.join(' or ');

const response = await graphClient
  .api('/users')
  .top(limit)
  .filter(filterString)
  .select([...])
  .get();
```

</operation>

<operation name="password-reset">

```typescript
await graphClient.api(`/users/${userId}`).update({
  passwordProfile: {
    password: newPassword,
    forceChangePasswordNextSignIn: forceChange,
  },
});
```

</operation>

<operation name="create-user">

```typescript
await graphClient.api('/users').post({
  displayName: request.displayName,
  identities: [
    {
      signInType: 'emailAddress',
      issuer: 'contoso.onmicrosoft.com',   // derived from AZURE_B2C_TENANT_ID
      issuerAssignedId: 'jane@contoso.com', // the email param
    },
  ],
  passwordProfile: {
    password: request.passwordProfile.password,
    forceChangePasswordNextSignIn: true,
  },
  // optional profile fields...
});
```

</operation>

<operation name="group-membership">

```typescript
// User's groups (filters to #microsoft.graph.group items only)
const response = await graphClient
  .api(`/users/${userId}/memberOf`)
  .select(['id', 'displayName', 'description', 'mailEnabled', 'securityEnabled'])
  .get();
const groups = response.value
  .filter((item: any) => item['@odata.type'] === '#microsoft.graph.group')
  .map((g: any) => client.mapGroupResponse(g));

// Group members (filters to #microsoft.graph.user items only)
const response = await graphClient
  .api(`/groups/${groupId}/members`)
  .top(limit)
  .select([...])
  .get();
const users = response.value
  .filter((item: any) => item['@odata.type'] === '#microsoft.graph.user')
  .map((u: any) => client.mapUserResponse(u));
```

</operation>

</graph-api-operations>

<type-definitions>

```typescript
export interface B2CUser {
  id: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  userPrincipalName: string;
  mail?: string;
  otherMails?: string[];
  identities?: B2CIdentity[];
  accountEnabled: boolean;
  createdDateTime?: string;
  lastSignInDateTime?: string;
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  city?: string;
  country?: string;
}

export interface B2CIdentity {
  signInType: string;       // 'emailAddress' | 'userName' | 'federated'
  issuer: string;           // e.g., 'contoso.onmicrosoft.com'
  issuerAssignedId: string; // e.g., 'jane@contoso.com'
}

export interface B2CGroup {
  id: string;
  displayName: string;
  description?: string;
  mailEnabled: boolean;
  securityEnabled: boolean;
  memberCount?: number;
}

export interface CreateUserRequest {
  displayName: string;
  identities: B2CIdentity[];
  passwordProfile: { password: string; forceChangePasswordNextSignIn: boolean; };
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  city?: string;
  country?: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  city?: string;
  country?: string;
  accountEnabled?: boolean;
}

export interface TenantSummary {
  tenantId: string;
  userCount: number;
  groupCount: number;
  enabledUserCount: number;
  disabledUserCount: number;
  localAccountCount: number;
  federatedAccountCount: number;
}
```

</type-definitions>

<error-handling>

`B2CClient.enhanceError()` maps Graph API errors to actionable messages:

| Condition | Enhanced Message |
|-----------|-----------------|
| `statusCode === 401` or `Unauthorized` | Verify app has `User.ReadWrite.All` permission and `User Administrator` role |
| `statusCode === 403` or `Forbidden` | App lacks required permissions or role assignments |
| `statusCode === 404` or `Request_ResourceNotFound` | Verify user/group ID is correct |
| `Invalid password` in message | Password must be 8–256 chars, 3 of: lowercase, uppercase, digit, symbol |
| All others | `Failed to {operation}: {original message}` |

All tool catch blocks return `{ isError: true }` with the enhanced error message as `text` content.

All service methods use `auditLogger` from `@mcp-consultant-tools/core` to log both success and failure with `operationType` (`READ`, `CREATE`, `UPDATE`, `DELETE`) and `executionTimeMs`.

</error-handling>

<cli-architecture>

<overview>
The CLI reuses the same `ServiceContext` as the MCP server via `context-factory.ts`. Both `index.ts` and `context-factory.ts` define `createServiceContext()` identically — this deliberate duplication ensures zero risk to the MCP entry point.
</overview>

<command-groups>

| Group | File | Commands |
|-------|------|----------|
| `user` | user-commands.ts | `list`, `get`, `search`, `reset-password`, `force-pwd-change`, `create`, `update`, `delete` |
| `group` | group-commands.ts | `list`, `user-groups`, `members` |
| `tenant` | tenant-commands.ts | `summary` |

</command-groups>

<global-flags>

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of summary |
| `--no-cache` | Skip writing cache files |
| `--env-file <path>` | Load environment variables from a custom `.env` file |

</global-flags>

<examples>

```bash
# List users (with optional filter)
mcp-azure-b2c-cli user list --top 50 --filter "accountEnabled eq true"

# Get user (all fields including extension_* attributes)
mcp-azure-b2c-cli user get user@contoso.com --all-fields

# Search by name
mcp-azure-b2c-cli user search "John" --fields displayName,givenName --top 25

# Reset password
mcp-azure-b2c-cli user reset-password user@contoso.com "NewPass123!" --force-change

# Force password change on next login
mcp-azure-b2c-cli user force-pwd-change user@contoso.com

# Create user
mcp-azure-b2c-cli user create \
  --display-name "Jane Doe" \
  --email jane@contoso.com \
  --password "InitialPass123!" \
  --given-name Jane \
  --surname Doe \
  --department Engineering

# Update user (disable account)
mcp-azure-b2c-cli user update user@contoso.com --account-enabled false

# Delete user (irreversible)
mcp-azure-b2c-cli user delete 12345678-1234-1234-1234-123456789abc --confirm

# List groups
mcp-azure-b2c-cli group list --top 100

# Get user's groups
mcp-azure-b2c-cli group user-groups user@contoso.com

# Get group members (all fields)
mcp-azure-b2c-cli group members 12345678-1234-1234-1234-123456789abc --all-fields

# Tenant summary
mcp-azure-b2c-cli tenant summary

# JSON output
mcp-azure-b2c-cli --json user list
```

</examples>

<tool-to-command-mapping>

| MCP Tool | CLI Command |
|----------|-------------|
| `b2c-list-users` | `mcp-azure-b2c-cli user list` |
| `b2c-get-user` | `mcp-azure-b2c-cli user get <userId>` |
| `b2c-search-users` | `mcp-azure-b2c-cli user search <searchTerm>` |
| `b2c-reset-user-password` | `mcp-azure-b2c-cli user reset-password <userId> <newPassword>` |
| `b2c-force-pwd-change` | `mcp-azure-b2c-cli user force-pwd-change <userId>` |
| `b2c-create-user` | `mcp-azure-b2c-cli user create --display-name ... --email ... --password ...` |
| `b2c-update-user` | `mcp-azure-b2c-cli user update <userId> [--field value ...]` |
| `b2c-delete-user` | `mcp-azure-b2c-cli user delete <userId> --confirm` |
| `b2c-list-groups` | `mcp-azure-b2c-cli group list` |
| `b2c-get-user-groups` | `mcp-azure-b2c-cli group user-groups <userId>` |
| `b2c-get-group-members` | `mcp-azure-b2c-cli group members <groupId>` |
| *(b2c-tenant-summary prompt)* | `mcp-azure-b2c-cli tenant summary` |

</tool-to-command-mapping>

</cli-architecture>

<security>

<principles>
- All write operations are disabled by default. Enable only what is needed for the use case.
- `b2c-delete-user` has a two-gate safety check: environment flag AND `confirmDeletion: true` parameter.
- Password operations only work for local accounts — they do not affect social (Google, Facebook, Microsoft, Apple) or federated accounts.
- The client secret must be rotated periodically. The secret is only shown once at creation time in the Azure Portal.
- All operations are audit-logged via `@mcp-consultant-tools/core` `auditLogger`.
</principles>

<mcp-protocol>

MCP uses stdio transport — any non-JSON written to stdout corrupts the protocol.

```typescript
console.error("Service initialized");  // OK — writes to stderr
console.log("Debug info");             // FORBIDDEN — breaks MCP protocol
```

</mcp-protocol>

</security>

<troubleshooting>

| Error | Cause | Resolution |
|-------|-------|------------|
| `Unauthorized to list users` | App lacks API permissions or admin consent | Add `User.ReadWrite.All`, grant admin consent, assign `User Administrator` role |
| `Forbidden to {operation}` | App has permissions but lacks role assignment | Assign `User Administrator` directory role to the app registration |
| `Resource not found` | Invalid user or group ID | Use `b2c-list-users` or `b2c-search-users` to find the correct GUID |
| `password reset is not enabled` | `AZURE_B2C_ENABLE_PASSWORD_RESET` not set | Set `AZURE_B2C_ENABLE_PASSWORD_RESET=true` |
| `user creation is not enabled` | `AZURE_B2C_ENABLE_USER_CREATE` not set | Set `AZURE_B2C_ENABLE_USER_CREATE=true` |
| `user update is not enabled` | `AZURE_B2C_ENABLE_USER_UPDATE` not set | Set `AZURE_B2C_ENABLE_USER_UPDATE=true` |
| `user deletion is not enabled` | `AZURE_B2C_ENABLE_USER_DELETE` not set | Set `AZURE_B2C_ENABLE_USER_DELETE=true` |
| `Invalid password format` | Password does not meet B2C policy | Use 8–256 chars with at least 3 of: lowercase, uppercase, digit, symbol |
| `Missing Azure B2C configuration` | Required env vars not set | Set `AZURE_B2C_TENANT_ID`, `AZURE_B2C_CLIENT_ID`, `AZURE_B2C_CLIENT_SECRET` |

**Debugging tips:**
1. Test read-only access first (no flags) before enabling write operations
2. Verify admin consent was granted in the Azure Portal (not just permissions added)
3. Check that the `User Administrator` role is assigned to the app registration, not just a user
4. Use `mcp-azure-b2c-cli tenant summary` to confirm basic connectivity

</troubleshooting>

<dependencies>

```json
{
  "@mcp-consultant-tools/core": "^1.0.0",
  "@modelcontextprotocol/sdk": "^1.0.4",
  "@azure/identity": "^4.5.0",
  "@microsoft/microsoft-graph-client": "^3.0.7",
  "commander": "^12.x",
  "zod": "^3.24.1"
}
```

</dependencies>
