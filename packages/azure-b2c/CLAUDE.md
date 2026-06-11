# Azure B2C Package Guide

## Overview

Azure AD B2C integration for user management via Microsoft Graph API.

- **Tools:** 11 tools, 2 prompts
- **Authentication:** Entra ID (service principal)
- **Security:** Granular flags for write operations

## Environment Configuration

```bash
# Required
AZURE_B2C_TENANT_ID=your-tenant.onmicrosoft.com
AZURE_B2C_CLIENT_ID=your-client-id
AZURE_B2C_CLIENT_SECRET=your-client-secret

# Security flags (all default to false)
AZURE_B2C_ENABLE_PASSWORD_RESET=false  # Requires User Administrator role
AZURE_B2C_ENABLE_USER_CREATE=false
AZURE_B2C_ENABLE_USER_UPDATE=false
AZURE_B2C_ENABLE_USER_DELETE=false     # DANGEROUS - irreversible!

# Optional
AZURE_B2C_MAX_RESULTS=100
```

## Key Tools

### Read-Only (always enabled)
- `list-users` - List B2C users
- `get-user` - Get user by ID
- `search-users` - Search by email/name
- `list-groups` - List B2C groups
- `get-user-groups` - User's group memberships

### Write Operations (require flags)
- `create-user` - Create new user (ENABLE_USER_CREATE)
- `update-user` - Update user profile (ENABLE_USER_UPDATE)
- `delete-user` - Delete user (ENABLE_USER_DELETE)
- `reset-password` - Reset user password (ENABLE_PASSWORD_RESET)
- `force-password-change` - Force password change (ENABLE_PASSWORD_RESET)

## App Registration Requirements

Service principal must have:
- `User.ReadWrite.All` permission (or `User.Read.All` for read-only)
- `Directory.ReadWrite.All` for group operations
- **User Administrator** role for password reset

## Reference

See `docs/technical/AZURE_B2C_TECHNICAL.md` for detailed implementation.

## CLI Usage

Binary: `mcp-azure-b2c-cli`

```bash
# List users
mcp-azure-b2c-cli user list

# Search users
mcp-azure-b2c-cli user search "john@example.com"
```
