# ChatGPT MCP OAuth Integration - Progress Summary

**Date:** December 6, 2025
**Status:** Blocked - Awaiting Admin Permissions

## Objective

Enable ChatGPT to connect to our PowerPlatform MCP HTTP server using OAuth authentication via Entra ID.

## What We've Done

### 1. Added OAuth Discovery Endpoint (RFC 9728)

Added `GET /.well-known/oauth-protected-resource` endpoint to `packages/powerplatform/src/http-server.ts`:

```typescript
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: process.env.MCP_SERVER_URL,
    authorization_servers: [
      `https://login.microsoftonline.com/${tenantId}`  // v1.0 endpoint
    ],
    bearer_methods_supported: ['header']
  });
});
```

**Key decision:** Using Azure AD v1.0 endpoint (not v2.0) because v2.0 doesn't support the `resource` parameter that ChatGPT's OAuth implementation requires.

### 2. Added Authorization Header Logging

Temporary middleware to verify tokens are arriving:

```typescript
app.use((req, res, next) => {
  if (req.headers.authorization) {
    console.error('=== Incoming Request ===');
    console.error('Path:', req.path);
    console.error('Auth header present:', req.headers.authorization.substring(0, 50) + '...');
  }
  next();
});
```

### 3. ChatGPT Connector Configuration

Created connector in ChatGPT with:
- **URL:** `https://echoic-untrumping-carlota.ngrok-free.dev/mcp`
- **Auth:** OAuth
- **Client ID:** `acecee6e-bc7b-4710-ba9b-326cf54015a5`

### 4. OAuth Flow Testing

| Step | Result |
|------|--------|
| Discovery endpoint returns correct JSON | ✅ Working |
| ChatGPT initiates OAuth flow | ✅ Working |
| Azure AD v1.0 endpoint reached | ✅ Working |
| Resource validation | ❌ **Blocked** |

**Current Error:**
```
AADSTS500011: The resource principal named https://echoic-untrumping-carlota.ngrok-free.dev
was not found in the tenant named Smart Impact Ltd.
```

## Blocker: Application ID URI Required

Azure AD requires a registered Application ID URI to issue tokens for OAuth `resource` parameter.

### Admin Action Required

**Request sent to admin:**

> Please configure an Application ID URI for our Entra app registration:
>
> - **App:** Client ID `acecee6e-bc7b-4710-ba9b-326cf54015a5`
> - **Location:** Azure Portal → Entra ID → App registrations → [App] → Expose an API
> - **Action:** Set Application ID URI to `api://mcp-powerplatform`

## Next Steps (After Admin Grants Permission)

### Step 1: Get the Application ID URI

Admin will provide the URI they configured (e.g., `api://mcp-powerplatform`).

### Step 2: Update Discovery Endpoint

Add new environment variable and update code:

```typescript
// In http-server.ts
const resourceUri = process.env.OAUTH_RESOURCE_URI || serverUrl;

res.json({
  resource: resourceUri,  // Use the registered Application ID URI
  authorization_servers: [...],
  bearer_methods_supported: ['header']
});
```

### Step 3: Restart Server with New Variable

```bash
export MCP_SERVER_URL="https://your-ngrok-url.ngrok-free.dev"
export OAUTH_RESOURCE_URI="api://mcp-powerplatform"  # Whatever admin set
npm run start:http
```

### Step 4: Recreate ChatGPT Connector

Delete and recreate the connector to pick up new discovery metadata.

### Step 5: Test OAuth Flow

1. Click "Connect" in ChatGPT
2. Should redirect to Microsoft login
3. After login, should see auth header in server logs
4. ChatGPT should be able to call MCP tools

### Step 6: (Future) Add Token Validation

Once OAuth flow works, add actual JWT validation to verify tokens:

```typescript
// Future: Validate JWT tokens
import jwt from 'jsonwebtoken';
// Verify audience, issuer, signature, etc.
```

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_SERVER_URL` | Yes | Your ngrok URL |
| `POWERPLATFORM_TENANT_ID` | Yes | Entra tenant ID |
| `OAUTH_RESOURCE_URI` | Yes* | Application ID URI from Entra (*after admin configures) |

## Files Modified

- `packages/powerplatform/src/http-server.ts` - Added OAuth discovery + auth logging

## Reference URLs

- **ngrok URL:** `https://echoic-untrumping-carlota.ngrok-free.dev`
- **MCP endpoint:** `https://echoic-untrumping-carlota.ngrok-free.dev/mcp`
- **OAuth discovery:** `https://echoic-untrumping-carlota.ngrok-free.dev/.well-known/oauth-protected-resource`
- **Tenant ID:** `a477f0ac-93dd-4caf-97f2-ac9224ae1d73`
- **Client ID:** `acecee6e-bc7b-4710-ba9b-326cf54015a5`

## Notes

- ngrok URLs change on restart (free tier) - will need to update `MCP_SERVER_URL` and recreate connector
- Server logs go to stderr (required for MCP protocol)
- Build command: `cd packages/powerplatform && npm run build`
