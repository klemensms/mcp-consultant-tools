# @mcp-consultant-tools/azure-b2c

MCP server for Azure AD B2C user management via Microsoft Graph API.

## Features

- **User Management**: List, search, get user details
- **Group Operations**: List groups, get memberships
- **Password Reset**: Reset passwords, force change on next login
- **User Lifecycle**: Create, update, and delete users
- **Granular Security**: Separate flags for each write operation type

## Installation

```bash
npm install @mcp-consultant-tools/azure-b2c
```

## Configuration

### Required Environment Variables

```bash
AZURE_B2C_TENANT_ID=your-tenant.onmicrosoft.com  # or tenant GUID
AZURE_B2C_CLIENT_ID=app-registration-client-id
AZURE_B2C_CLIENT_SECRET=app-registration-secret
```

### Optional Security Flags

All write operations are disabled by default. Enable only what you need:

```bash
AZURE_B2C_ENABLE_PASSWORD_RESET=true   # Enable password reset tools
AZURE_B2C_ENABLE_USER_CREATE=true      # Enable user creation
AZURE_B2C_ENABLE_USER_UPDATE=true      # Enable user profile updates
AZURE_B2C_ENABLE_USER_DELETE=true      # Enable user deletion (dangerous!)
```

### Optional Settings

```bash
AZURE_B2C_MAX_RESULTS=100              # Max users/groups per request
```

## Azure Setup Requirements

1. **Create App Registration** in your B2C tenant
2. **Add API Permissions** (Application type):
   - `User.ReadWrite.All`
   - `Directory.ReadWrite.All` (for group operations)
3. **Grant Admin Consent** for the permissions
4. **Assign Role**: Add "User Administrator" role to the app's service principal

## Tools (11)

### Read-Only (Always Enabled)

| Tool | Description |
|------|-------------|
| `b2c-list-users` | List users with optional filtering |
| `b2c-get-user` | Get user by ID or email |
| `b2c-search-users` | Search by name, email |
| `b2c-list-groups` | List all groups |
| `b2c-get-user-groups` | Get groups for a user |
| `b2c-get-group-members` | Get members of a group |

### Password Operations (Requires `AZURE_B2C_ENABLE_PASSWORD_RESET=true`)

| Tool | Description |
|------|-------------|
| `b2c-reset-user-password` | Set new password |
| `b2c-force-password-change` | Force change on next login |

### User Creation (Requires `AZURE_B2C_ENABLE_USER_CREATE=true`)

| Tool | Description |
|------|-------------|
| `b2c-create-user` | Create new local account |

### User Update (Requires `AZURE_B2C_ENABLE_USER_UPDATE=true`)

| Tool | Description |
|------|-------------|
| `b2c-update-user` | Update user profile |

### User Deletion (Requires `AZURE_B2C_ENABLE_USER_DELETE=true`)

| Tool | Description |
|------|-------------|
| `b2c-delete-user` | Delete user (irreversible!) |

## Prompts (2)

| Prompt | Description |
|--------|-------------|
| `b2c-user-overview` | Formatted user profile with groups |
| `b2c-tenant-summary` | Tenant statistics |

## Usage Example

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

## Important Notes

- **Local Accounts Only**: Password operations only work for local B2C accounts, not federated/social accounts
- **Password Requirements**: Passwords must be 8-256 characters with at least 3 of: lowercase, uppercase, digit, symbol
- **Deletion is Permanent**: The delete operation cannot be undone

## License

MIT
