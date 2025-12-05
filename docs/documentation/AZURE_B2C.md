# Azure AD B2C Integration

MCP server for Azure Active Directory B2C user management via Microsoft Graph API.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Configuration](#configuration)
- [Tools (11)](#tools)
- [Prompts (2)](#prompts)
- [Usage Examples](#usage-examples)
- [Security Model](#security-model)
- [Troubleshooting](#troubleshooting)

## Overview

The Azure B2C integration provides user management capabilities for Azure AD B2C tenants:

- **User Management**: List, search, get user details
- **Group Operations**: List groups, view memberships
- **Password Management**: Reset passwords, force change on next login
- **User Lifecycle**: Create, update, and delete users

### Key Features

- **Granular Security Flags**: Separate enable flags for password, create, update, and delete operations
- **Local Account Focus**: Optimized for B2C local accounts (email/password)
- **Microsoft Graph API**: Uses the official Microsoft Graph SDK
- **Audit Logging**: All operations are logged for compliance

## Setup

### 1. Create Azure App Registration

1. Go to **Azure Portal** > **Azure AD B2C** > **App registrations**
2. Click **New registration**
3. Name: `MCP B2C Management` (or your preferred name)
4. Supported account types: **Accounts in this organizational directory only**
5. Redirect URI: Leave blank (not needed for client credentials)
6. Click **Register**

### 2. Configure API Permissions

1. Go to **API permissions** > **Add a permission**
2. Select **Microsoft Graph** > **Application permissions**
3. Add these permissions:
   - `User.ReadWrite.All` - Required for user operations
   - `Directory.ReadWrite.All` - Required for group operations
4. Click **Grant admin consent**

### 3. Create Client Secret

1. Go to **Certificates & secrets** > **New client secret**
2. Description: `MCP Integration`
3. Expiration: Choose appropriate duration
4. Copy the secret value immediately (shown only once)

### 4. Assign Directory Role

1. Go to **Azure AD B2C** > **Roles and administrators**
2. Find and click **User Administrator**
3. Click **Add assignments**
4. Search for your app registration name
5. Select it and click **Add**

### 5. Gather Configuration Values

You'll need:
- **Tenant ID**: Found in Overview > Directory (tenant) ID
- **Client ID**: Found in App registration > Overview > Application (client) ID
- **Client Secret**: The value you copied in step 3

## Configuration

### Required Environment Variables

```bash
# B2C Tenant ID (GUID or domain like contoso.onmicrosoft.com)
AZURE_B2C_TENANT_ID=your-tenant.onmicrosoft.com

# App Registration Client ID
AZURE_B2C_CLIENT_ID=12345678-1234-1234-1234-123456789012

# App Registration Client Secret
AZURE_B2C_CLIENT_SECRET=your-client-secret
```

### Security Flags (Optional)

All write operations are **disabled by default**. Enable only what you need:

```bash
# Enable password reset operations
AZURE_B2C_ENABLE_PASSWORD_RESET=true

# Enable user creation
AZURE_B2C_ENABLE_USER_CREATE=true

# Enable user profile updates
AZURE_B2C_ENABLE_USER_UPDATE=true

# Enable user deletion (DANGEROUS - irreversible!)
AZURE_B2C_ENABLE_USER_DELETE=true
```

### Optional Settings

```bash
# Maximum users/groups per request (default: 100)
AZURE_B2C_MAX_RESULTS=100
```

### MCP Client Configuration

```json
{
  "mcpServers": {
    "azure-b2c": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/azure-b2c"],
      "env": {
        "AZURE_B2C_TENANT_ID": "contoso.onmicrosoft.com",
        "AZURE_B2C_CLIENT_ID": "your-client-id",
        "AZURE_B2C_CLIENT_SECRET": "your-secret",
        "AZURE_B2C_ENABLE_PASSWORD_RESET": "true"
      }
    }
  }
}
```

## Tools

### Read-Only Tools (Always Enabled)

#### b2c-list-users

List Azure AD B2C users with optional filtering.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `top` | number | No | Max users to return (default: 50, max: 100) |
| `filter` | string | No | OData filter expression |

**Example:**
```
List all enabled users
filter: "accountEnabled eq true"
```

#### b2c-get-user

Get detailed information about a specific user.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID (GUID) or email address |

#### b2c-search-users

Search users by display name, email, or other fields.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `searchTerm` | string | Yes | Search term |
| `searchFields` | array | No | Fields to search (default: displayName, mail) |
| `top` | number | No | Max results (default: 25) |

**Example:**
```
Search for users named "John"
searchTerm: "John"
searchFields: ["displayName", "givenName"]
```

#### b2c-list-groups

List all groups in the B2C tenant.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `top` | number | No | Max groups to return (default: 50) |

#### b2c-get-user-groups

Get all groups that a user is a member of.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID or email |

#### b2c-get-group-members

Get all members of a specific group.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `groupId` | string | Yes | Group ID (GUID) |
| `top` | number | No | Max members (default: 50) |

### Password Tools (Requires `AZURE_B2C_ENABLE_PASSWORD_RESET=true`)

#### b2c-reset-user-password

Reset a user's password to a new value.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID or email |
| `newPassword` | string | Yes | New password |
| `forceChangeOnNextLogin` | boolean | No | Force change on next login (default: false) |

**Password Requirements:**
- 8-256 characters
- Must contain at least 3 of: lowercase, uppercase, digit, symbol

#### b2c-force-password-change

Force a user to change their password on next login.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID or email |

### User Creation Tool (Requires `AZURE_B2C_ENABLE_USER_CREATE=true`)

#### b2c-create-user

Create a new local account user.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `displayName` | string | Yes | Display name |
| `email` | string | Yes | Email address (used for sign-in) |
| `password` | string | Yes | Initial password |
| `forceChangePasswordNextSignIn` | boolean | No | Force change on first login (default: true) |
| `givenName` | string | No | First name |
| `surname` | string | No | Last name |
| `jobTitle` | string | No | Job title |
| `department` | string | No | Department |
| `mobilePhone` | string | No | Mobile phone |
| `city` | string | No | City |
| `country` | string | No | Country |

### User Update Tool (Requires `AZURE_B2C_ENABLE_USER_UPDATE=true`)

#### b2c-update-user

Update a user's profile information (not password).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID or email |
| `displayName` | string | No | New display name |
| `givenName` | string | No | First name |
| `surname` | string | No | Last name |
| `jobTitle` | string | No | Job title |
| `department` | string | No | Department |
| `mobilePhone` | string | No | Mobile phone |
| `city` | string | No | City |
| `country` | string | No | Country |
| `accountEnabled` | boolean | No | Enable/disable account |

### User Deletion Tool (Requires `AZURE_B2C_ENABLE_USER_DELETE=true`)

#### b2c-delete-user

Delete a user from Azure AD B2C. **THIS ACTION IS IRREVERSIBLE.**

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID (GUID) to delete |
| `confirmDeletion` | boolean | Yes | Must be `true` to confirm |

## Prompts

### b2c-user-overview

Get a comprehensive overview of a user including profile details and group memberships.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID or email |

**Output includes:**
- Basic information (name, email, account status)
- Contact information
- Work information (job title, department)
- Location (city, country)
- Identity types (local, federated)
- Group memberships

### b2c-tenant-summary

Get a summary of the Azure AD B2C tenant.

**No parameters required.**

**Output includes:**
- Total user count
- Enabled/disabled user breakdown
- Local vs federated account counts
- Total group count

## Usage Examples

### List All Users

```
Use b2c-list-users to get a list of users
```

### Search for a User

```
Search for users with "john" in their name:
Use b2c-search-users with searchTerm "john"
```

### Reset a Password

```
Reset password for user john@contoso.com:
Use b2c-reset-user-password with:
- userId: john@contoso.com
- newPassword: TempPass123!
- forceChangeOnNextLogin: true
```

### Create a New User

```
Create a new user:
Use b2c-create-user with:
- displayName: Jane Doe
- email: jane@contoso.com
- password: InitialPass123!
- givenName: Jane
- surname: Doe
- department: Engineering
```

### Disable a User Account

```
Disable user account:
Use b2c-update-user with:
- userId: jane@contoso.com
- accountEnabled: false
```

## Security Model

### Principle of Least Privilege

The integration follows a **granular security model**:

| Flag | Operations Enabled | Risk Level |
|------|-------------------|------------|
| *(none)* | List, get, search users/groups | Safe |
| `AZURE_B2C_ENABLE_PASSWORD_RESET` | Password reset, force change | Medium |
| `AZURE_B2C_ENABLE_USER_CREATE` | Create new users | Medium |
| `AZURE_B2C_ENABLE_USER_UPDATE` | Update user profiles | Medium |
| `AZURE_B2C_ENABLE_USER_DELETE` | Delete user | High |

### Best Practices

1. **Start with read-only**: Test the integration without any flags enabled
2. **Enable incrementally**: Add flags only when needed
3. **Avoid delete in production**: Only enable `AZURE_B2C_ENABLE_USER_DELETE` in controlled environments
4. **Rotate secrets regularly**: Update the client secret periodically
5. **Monitor audit logs**: Review operations for compliance

### Local Accounts Only

Password operations only work for **local accounts** (users who sign in with email/password created in B2C). They do not work for:
- Social accounts (Google, Facebook, Microsoft, Apple)
- Federated accounts (external identity providers)

## Troubleshooting

### Common Errors

#### "Unauthorized to list users"

**Cause:** App registration lacks required permissions.

**Solution:**
1. Add `User.ReadWrite.All` permission
2. Grant admin consent
3. Assign "User Administrator" role

#### "Invalid password format"

**Cause:** Password doesn't meet B2C requirements.

**Solution:** Ensure password has:
- 8-256 characters
- At least 3 of: lowercase, uppercase, digit, symbol

#### "Resource not found"

**Cause:** Invalid user/group ID.

**Solution:**
1. Use `b2c-list-users` to find the correct ID
2. Verify the user exists in the B2C tenant

#### "password reset is not enabled"

**Cause:** Trying to reset password without the flag enabled.

**Solution:** Set `AZURE_B2C_ENABLE_PASSWORD_RESET=true`

### Debugging Tips

1. **Check permissions**: Verify app registration has admin consent
2. **Verify role assignment**: Ensure app has "User Administrator" role
3. **Test with read-only first**: Confirm basic connectivity works
4. **Check tenant domain**: Use correct format (contoso.onmicrosoft.com or GUID)
