# Azure B2C Technical Implementation Guide

This document contains detailed technical implementation information for the Azure B2C integration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Client                                  │
│                   (Claude, etc.)                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     index.ts                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tools (11)              │  Prompts (2)                  │   │
│  │  - b2c-list-users        │  - b2c-user-overview          │   │
│  │  - b2c-get-user          │  - b2c-tenant-summary         │   │
│  │  - b2c-search-users      │                               │   │
│  │  - b2c-list-groups       │                               │   │
│  │  - b2c-get-user-groups   │                               │   │
│  │  - b2c-get-group-members │                               │   │
│  │  - b2c-reset-password    │                               │   │
│  │  - b2c-force-change      │                               │   │
│  │  - b2c-create-user       │                               │   │
│  │  - b2c-update-user       │                               │   │
│  │  - b2c-delete-user       │                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AzureB2CService                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  - Graph API Client (Microsoft Graph SDK)                │   │
│  │  - Token Caching (ClientSecretCredential)                │   │
│  │  - User/Group Caching                                    │   │
│  │  - Permission Checking                                   │   │
│  │  - Audit Logging                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Microsoft Graph API                            │
│                 graph.microsoft.com/v1.0                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /users         - User CRUD operations                   │   │
│  │  /groups        - Group listing                          │   │
│  │  /users/{id}/memberOf - Group membership                 │   │
│  │  /groups/{id}/members - Group members                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Service Implementation

### AzureB2CService

The core service class manages Graph API interactions:

```typescript
export class AzureB2CService {
  private config: AzureB2CConfig;
  private graphClient: Client | null = null;
  private credential: ClientSecretCredential | null = null;

  // Cache for user/group lists
  private usersCache: { data: B2CUser[]; expires: number } | null = null;
  private groupsCache: { data: B2CGroup[]; expires: number } | null = null;
}
```

### Authentication Flow

Uses Azure Identity SDK with Client Credentials flow:

```typescript
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

// Create credential
const credential = new ClientSecretCredential(
  config.tenantId,
  config.clientId,
  config.clientSecret
);

// Create auth provider
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

// Create Graph client
const graphClient = Client.initWithMiddleware({ authProvider });
```

### Token Caching

The `ClientSecretCredential` automatically handles:
- Token acquisition
- Token caching
- Token refresh before expiration

No manual token management required.

## Graph API Operations

### User Listing

```typescript
const response = await client
  .api('/users')
  .top(limit)
  .select([
    'id', 'displayName', 'givenName', 'surname',
    'userPrincipalName', 'mail', 'otherMails',
    'identities', 'accountEnabled', 'createdDateTime'
  ])
  .get();
```

### User Search

Uses OData `startswith` filter:

```typescript
const filters = searchFields.map(
  (field) => `startswith(${field}, '${searchTerm}')`
);
const filterString = filters.join(' or ');

const response = await client
  .api('/users')
  .filter(filterString)
  .get();
```

### Password Reset

Uses the Update User API:

```typescript
await client.api(`/users/${userId}`).update({
  passwordProfile: {
    password: newPassword,
    forceChangePasswordNextSignIn: forceChange,
  },
});
```

### User Creation

B2C local accounts require specific identity format:

```typescript
await client.api('/users').post({
  displayName: 'Jane Doe',
  identities: [
    {
      signInType: 'emailAddress',
      issuer: 'contoso.onmicrosoft.com',
      issuerAssignedId: 'jane@contoso.com',
    },
  ],
  passwordProfile: {
    password: 'InitialPass123!',
    forceChangePasswordNextSignIn: true,
  },
});
```

## Security Implementation

### Permission Checking

Write operations check flags before execution:

```typescript
private checkPermission(operation: string, enabled: boolean): void {
  if (!enabled) {
    throw new Error(
      `${operation} is not enabled. ` +
      `Set the appropriate environment variable.`
    );
  }
}

// Usage
async resetUserPassword(userId: string, password: string): Promise<void> {
  this.checkPermission('password reset', this.config.enablePasswordReset);
  // ... rest of implementation
}
```

### Flag Configuration

Loaded from environment at service initialization:

```typescript
const config: AzureB2CConfig = {
  tenantId: process.env.AZURE_B2C_TENANT_ID!,
  clientId: process.env.AZURE_B2C_CLIENT_ID!,
  clientSecret: process.env.AZURE_B2C_CLIENT_SECRET!,
  enablePasswordReset: process.env.AZURE_B2C_ENABLE_PASSWORD_RESET === 'true',
  enableUserCreate: process.env.AZURE_B2C_ENABLE_USER_CREATE === 'true',
  enableUserUpdate: process.env.AZURE_B2C_ENABLE_USER_UPDATE === 'true',
  enableUserDelete: process.env.AZURE_B2C_ENABLE_USER_DELETE === 'true',
};
```

## Caching Strategy

### User/Group List Caching

Reduces API calls for frequently accessed data:

```typescript
private usersCache: { data: B2CUser[]; expires: number } | null = null;

async listUsers(top: number, filter?: string, skipCache: boolean = false): Promise<B2CUser[]> {
  // Check cache if not skipping and no filter
  if (!skipCache && !filter && this.usersCache && this.usersCache.expires > Date.now()) {
    return this.usersCache.data.slice(0, top);
  }

  // Fetch from API
  const users = await this.fetchUsers(top, filter);

  // Cache if no filter
  if (!filter) {
    this.usersCache = {
      data: users,
      expires: Date.now() + this.config.cacheUsersTTL! * 1000,
    };
  }

  return users;
}
```

### Cache Invalidation

Write operations invalidate relevant caches:

```typescript
async createUser(request: CreateUserRequest): Promise<B2CUser> {
  // ... create user
  this.usersCache = null; // Invalidate cache
  return user;
}
```

## Error Handling

### Enhanced Error Messages

Errors are enhanced with helpful context:

```typescript
private enhanceError(error: any, operation: string): Error {
  const message = error.message || String(error);

  if (error.statusCode === 401) {
    return new Error(
      `Unauthorized to ${operation}. ` +
      `Verify app has correct permissions and role assignments.`
    );
  }

  if (message.includes('Invalid password')) {
    return new Error(
      `Invalid password format. Password must meet B2C requirements: ` +
      `8-256 chars, 3 of: lowercase, uppercase, digit, symbol.`
    );
  }

  return new Error(`Failed to ${operation}: ${message}`);
}
```

## Audit Logging

All operations are logged via the core audit logger:

```typescript
import { auditLogger } from '@mcp-consultant-tools/core';

async listUsers(): Promise<B2CUser[]> {
  const timer = auditLogger.startTimer();

  try {
    const users = await this.fetchUsers();

    auditLogger.log({
      operation: 'list-users',
      operationType: 'READ',
      componentType: 'User',
      success: true,
      executionTimeMs: timer(),
    });

    return users;
  } catch (error: any) {
    auditLogger.log({
      operation: 'list-users',
      operationType: 'READ',
      componentType: 'User',
      success: false,
      error: error.message,
      executionTimeMs: timer(),
    });

    throw this.enhanceError(error, 'list users');
  }
}
```

## Type Definitions

### B2CUser Interface

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
  jobTitle?: string;
  department?: string;
  mobilePhone?: string;
  city?: string;
  country?: string;
}
```

### B2CIdentity Interface

```typescript
export interface B2CIdentity {
  signInType: string;    // 'emailAddress', 'userName', 'federated'
  issuer: string;        // e.g., 'contoso.onmicrosoft.com'
  issuerAssignedId: string;  // e.g., 'jane@contoso.com'
}
```

### Configuration Interface

```typescript
export interface AzureB2CConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  enablePasswordReset: boolean;
  enableUserCreate: boolean;
  enableUserUpdate: boolean;
  enableUserDelete: boolean;
  maxResults?: number;
  cacheUsersTTL?: number;
}
```

## Response Formatting

### User Formatting

```typescript
export function formatUser(user: B2CUser): string {
  const lines: string[] = [];

  lines.push(`## ${user.displayName}`);
  lines.push('### Basic Information');
  lines.push(`- **ID:** ${user.id}`);
  lines.push(`- **Account Enabled:** ${user.accountEnabled ? 'Yes' : 'No'}`);

  // Identities
  if (user.identities?.length) {
    lines.push('### Identities');
    for (const identity of user.identities) {
      const type = identity.signInType === 'federated' ? 'Federated' : 'Local';
      lines.push(`- **${type}:** ${identity.issuerAssignedId}`);
    }
  }

  return lines.join('\n');
}
```

## Dependencies

```json
{
  "dependencies": {
    "@mcp-consultant-tools/core": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@azure/identity": "^4.5.0",
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "zod": "^3.24.1"
  }
}
```

## Best Practices

### 1. Always Use Lazy Initialization

```typescript
function getAzureB2CService(): AzureB2CService {
  if (!service) {
    service = new AzureB2CService(config);
    console.error("Azure B2C service initialized");
  }
  return service;
}
```

### 2. Never Log to stdout

MCP protocol uses stdout for JSON-RPC. Use stderr only:

```typescript
console.error("Service initialized");  // OK
console.log("Debug info");             // NEVER - breaks MCP
```

### 3. Validate Input with Zod

```typescript
server.tool(
  "b2c-get-user",
  "Get user details",
  {
    userId: z.string().describe("User ID or email"),
  },
  async ({ userId }) => { ... }
);
```

### 4. Return Structured Errors

```typescript
return {
  content: [{
    type: "text",
    text: `Error: ${error.message}`,
  }],
  isError: true,
};
```

### 5. Invalidate Cache on Writes

```typescript
async updateUser(userId: string, updates: UpdateUserRequest): Promise<B2CUser> {
  await client.api(`/users/${userId}`).update(updates);
  this.usersCache = null;  // Important!
  return await this.getUser(userId);
}
```
