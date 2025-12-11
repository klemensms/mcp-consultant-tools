# User Authentication for Dynamics MCP - Implementation Plan

**Date:** December 2025
**Status:** ✅ COMPLETE - Feature Working
**Version:** v23.0.0-beta.2
**Goal:** Enable CRM users to authenticate with their own identity via browser SSO

---

## ✅ Implementation Complete (December 10, 2025)

The interactive user authentication feature is **fully implemented and tested**. Users can now authenticate with their Microsoft Entra ID credentials via browser SSO.

### Final Status

| Task | Status |
|------|--------|
| Create auth module structure (`packages/powerplatform/src/auth/`) | ✅ Done |
| Implement `ServicePrincipalAuth` class | ✅ Done |
| Implement `InteractiveAuth` class with browser OAuth | ✅ Done |
| Implement `TokenCache` with AES-256-GCM encryption | ✅ Done |
| Modify `PowerPlatformService` to use auth provider | ✅ Done |
| Update `index.ts` with auth mode selection | ✅ Done |
| Add `--logout` and `--help` CLI commands | ✅ Done |
| Update `.env.example` | ✅ Done |
| Update release notes | ✅ Done |
| Update `POWERPLATFORM.md` documentation | ✅ Done |
| Package builds successfully | ✅ Done |
| Add Dynamics CRM `user_impersonation` permission | ✅ Done |
| Grant admin consent | ✅ Done |
| End-to-end testing | ✅ Done |

---

## Tech Stack Overview

### Authentication Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Interactive User Auth Flow                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌─────────────────┐     ┌──────────────┐  │
│  │ MCP Client  │────▶│ MCP Server      │────▶│ Dynamics 365 │  │
│  │ (Claude)    │     │ (PowerPlatform) │     │ (CRM API)    │  │
│  └─────────────┘     └────────┬────────┘     └──────────────┘  │
│                               │                                  │
│                    ┌──────────▼──────────┐                      │
│                    │ Auth Provider       │                      │
│                    │ (InteractiveAuth)   │                      │
│                    └──────────┬──────────┘                      │
│                               │                                  │
│         ┌─────────────────────┼─────────────────────┐           │
│         │                     │                     │           │
│         ▼                     ▼                     ▼           │
│  ┌──────────────┐   ┌─────────────────┐   ┌──────────────┐     │
│  │ Token Cache  │   │ Local HTTP      │   │ Browser      │     │
│  │ (AES-256)    │   │ Server (:random)│   │ (SSO)        │     │
│  └──────────────┘   └─────────────────┘   └──────────────┘     │
│         │                     │                     │           │
│         │                     ▼                     │           │
│         │           ┌─────────────────┐            │           │
│         │           │ Microsoft Entra │◀───────────┘           │
│         │           │ ID (OAuth 2.0)  │                        │
│         │           └─────────────────┘                        │
│         │                     │                                  │
│         └─────────────────────┘                                  │
│              Token Persistence                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Technology Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **MSAL Node** | `@azure/msal-node` v3.x | OAuth 2.0 client library |
| **Auth Flow** | Authorization Code + PKCE | Secure browser-based auth |
| **Token Cache** | Custom `TokenCache` class | Persistent token storage |
| **Encryption** | AES-256-GCM | Encrypt cached tokens |
| **Key Derivation** | `crypto.scryptSync` | Machine-specific encryption key |
| **Browser Launch** | `open` package v10.x | Cross-platform browser opener |
| **Callback Server** | Node.js `http` module | Receive OAuth callback |
| **Transport** | MCP stdio | Claude Desktop integration |

### File Structure

```
packages/powerplatform/src/auth/
├── index.ts                    # AuthProvider interface + createAuthProvider() factory
├── service-principal-auth.ts   # ConfidentialClientApplication (app identity)
├── interactive-auth.ts         # PublicClientApplication (user identity)
└── token-cache.ts              # AES-256-GCM encrypted file cache
```

### Security Features

| Feature | Implementation |
|---------|---------------|
| **No secrets on client** | Uses PKCE, no client_secret required |
| **Encrypted token storage** | AES-256-GCM with machine-specific key |
| **Secure file permissions** | Cache file: 600, directory: 700 |
| **Short-lived access tokens** | ~1 hour, auto-refreshed via refresh token |
| **Long-lived refresh tokens** | ~90 days, persisted securely |
| **SSO support** | Leverages existing Microsoft login session |
| **User identity audit** | All operations logged under user's identity |

---

## Setup Instructions

### Prerequisites

1. **Azure Entra ID App Registration** with:
   - Application (client) ID
   - Directory (tenant) ID
2. **Dynamics 365 environment** URL
3. **Admin consent** for API permissions

### Step 1: Configure App Registration for Interactive Auth

In Azure Portal → **Entra ID** → **App registrations** → [Your App]:

#### Authentication Tab
1. Under **Platform configurations**, click **Add a platform**
2. Select **Mobile and desktop applications**
3. Add redirect URI: `http://localhost`
4. Enable **Allow public client flows** = **Yes**
5. Save

#### API Permissions Tab
Add the following **Delegated** permissions:

| API | Permission | Admin Consent |
|-----|------------|---------------|
| Dynamics CRM | `user_impersonation` | **Required** |
| Microsoft Graph | `offline_access` | Recommended |
| Microsoft Graph | `User.Read` | Optional |

Click **Grant admin consent for [Org]** after adding permissions.

### Step 2: Configure MCP Client

**Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourorg.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

**Note:** No `POWERPLATFORM_CLIENT_SECRET` = Interactive browser auth.

### Step 3: First Run Experience

1. Open Claude Desktop and invoke any PowerPlatform tool
2. Browser opens automatically with Microsoft sign-in
3. If already signed in (SSO), you may see consent prompt on first use
4. Click **Accept** to grant permissions
5. Success page appears → close browser
6. Claude receives data from Dynamics

### Step 4: Token Management

```bash
# View help
npx @mcp-consultant-tools/powerplatform --help

# Clear cached tokens (forces re-authentication)
npx @mcp-consultant-tools/powerplatform --logout
```

Tokens are cached at: `~/.mcp-consultant-tools/token-cache-{clientId}.enc`

---

## Comparison: Auth Modes

| Feature | Interactive User Auth | Service Principal |
|---------|----------------------|-------------------|
| **Config** | No client_secret | Requires client_secret |
| **Identity** | User's identity | App's identity |
| **Security roles** | User's Dynamics roles | App's assigned roles |
| **Audit trail** | User name in logs | App name in logs |
| **Use case** | Desktop apps, debugging | CI/CD, automation |
| **First run** | Opens browser | Transparent |
| **Token lifetime** | ~90 days (refresh) | Configurable secret |

---

### Files Created

```
packages/powerplatform/src/auth/
├── index.ts                    # Auth provider interface + factory
├── service-principal-auth.ts   # ConfidentialClientApplication
├── interactive-auth.ts         # PublicClientApplication + browser OAuth
└── token-cache.ts              # Encrypted token storage
```

### Files Modified

- `packages/powerplatform/package.json` - Added `open`, bumped to v23.0.0-beta.2
- `packages/powerplatform/src/PowerPlatformService.ts` - Uses auth provider
- `packages/powerplatform/src/index.ts` - Auth mode selection, CLI commands
- `.env.example` - Dual auth mode docs
- `docs/release_notes/v23.0.0-beta.1.md` - Feature docs
- `docs/documentation/POWERPLATFORM.md` - User docs

---

## Executive Summary

Add interactive browser-based OAuth to the PowerPlatform MCP server, allowing users to authenticate with their own Entra ID credentials. This enables:

- **User-level security** - Dynamics security roles apply per user
- **SSO experience** - Enterprise users are already signed in
- **Simple rollout** - No secrets on user machines
- **Audit trail** - All actions logged under user identity

**Critical constraint:** Existing `npx @mcp-consultant-tools/powerplatform` usage with service principal credentials must continue to work unchanged.

---

## Architecture Overview

### Current State (Service Principal)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Desktop │────▶│  MCP Server     │────▶│  Dynamics 365   │
│                 │     │  (via npx)      │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        App Registration
                        (client_id + secret)
                        = Service Principal
                        = Single identity for all
```

### New State (Dual Auth Modes)

```
┌─────────────────┐     ┌─────────────────────────────────────┐     ┌─────────────────┐
│  Claude Desktop │────▶│  MCP Server                         │────▶│  Dynamics 365   │
│                 │     │                                     │     │                 │
└─────────────────┘     │  ┌─────────────────────────────┐   │     └─────────────────┘
                        │  │ Auth Mode Selection          │   │
                        │  │                              │   │
                        │  │ IF client_secret provided:   │   │
                        │  │   → Service Principal (existing)│  │
                        │  │                              │   │
                        │  │ IF no client_secret:         │   │
                        │  │   → Interactive User Auth    │───┼──▶ Browser
                        │  │   → Opens browser for SSO    │   │    (login.microsoftonline.com)
                        │  │   → Caches tokens locally    │   │
                        │  └─────────────────────────────┘   │
                        └─────────────────────────────────────┘
```

---

## App Registration Requirements

### Your Current App Registration

You mentioned having an app registration with:
- System admin rights
- Impersonate permissions inside Dynamics

**Question:** Does it have these configured?

| Setting | Required for User Auth | How to Check |
|---------|----------------------|--------------|
| Delegated permission: `user_impersonation` on Dynamics CRM | **YES** | Azure Portal → App registrations → API permissions |
| "Allow public client flows" = Yes | **YES** | Azure Portal → App registrations → Authentication |
| Redirect URI: `http://localhost` | **YES** | Azure Portal → App registrations → Authentication → Mobile/Desktop |

### Permissions Breakdown

**For Dynamics access (you likely already have this):**
```
Dynamics CRM
└── user_impersonation (Delegated) ← Required for acting as user
```

**For OAuth flow (may need to add):**
```
Microsoft Graph
├── openid (Delegated) ← Automatic with v2.0 endpoint
├── offline_access (Delegated) ← For refresh tokens (IMPORTANT)
└── User.Read (Delegated) ← Optional, for user info display
```

### Configuration Checklist

**In Azure Portal → Entra ID → App registrations → [Your App]:**

1. **Authentication tab:**
   - [ ] "Allow public client flows" = **Yes**
   - [ ] Platform: "Mobile and desktop applications" added
   - [ ] Redirect URI: `http://localhost` added

2. **API permissions tab:**
   - [ ] Dynamics CRM → `user_impersonation` (Delegated) - **should already have**
   - [ ] Microsoft Graph → `offline_access` (Delegated) - **add if missing**
   - [ ] Microsoft Graph → `User.Read` (Delegated) - optional
   - [ ] Admin consent granted (if required by tenant policy)

3. **Overview tab - note these values:**
   - [ ] Application (client) ID: `_______________`
   - [ ] Directory (tenant) ID: `_______________`

**Important:** No client secret is needed for public client auth. The existing secret can stay for service principal mode.

---

## Code Changes

### 1. New Package Dependencies

Add to `packages/powerplatform/package.json`:

```json
{
  "dependencies": {
    "@azure/msal-node": "^2.x",
    "open": "^10.x",
    "keytar": "^7.x"  // Optional: for OS keychain storage
  }
}
```

### 2. New Files to Create

```
packages/powerplatform/src/
├── auth/
│   ├── index.ts                    # Auth provider factory
│   ├── service-principal-auth.ts   # Existing app auth (refactored)
│   ├── interactive-auth.ts         # NEW: Browser-based user auth
│   └── token-cache.ts              # NEW: Secure token storage
├── index.ts                        # Modified to use auth factory
└── PowerPlatformService.ts         # Modified to accept auth provider
```

### 3. Auth Provider Interface

```typescript
// packages/powerplatform/src/auth/index.ts

export interface AuthProvider {
  getAccessToken(resource: string): Promise<string>;
  getUserInfo?(): Promise<{ name: string; email: string } | null>;
}

export function createAuthProvider(config: PowerPlatformConfig): AuthProvider {
  // If client_secret provided → service principal (existing behavior)
  if (config.clientSecret) {
    return new ServicePrincipalAuth(config);
  }

  // If no client_secret → interactive user auth (new behavior)
  return new InteractiveAuth(config);
}
```

### 4. Interactive Auth Implementation

```typescript
// packages/powerplatform/src/auth/interactive-auth.ts

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-node';
import open from 'open';
import http from 'http';
import { TokenCache } from './token-cache.js';

export class InteractiveAuth implements AuthProvider {
  private pca: PublicClientApplication;
  private cache: TokenCache;
  private dynamicsUrl: string;

  constructor(config: { clientId: string; tenantId: string; dynamicsUrl: string }) {
    this.dynamicsUrl = config.dynamicsUrl;
    this.cache = new TokenCache(config.clientId);

    this.pca = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
      cache: {
        cachePlugin: this.cache.createPlugin(),
      },
    });
  }

  async getAccessToken(resource: string): Promise<string> {
    // Try silent auth first (uses cached tokens)
    const accounts = await this.pca.getTokenCache().getAllAccounts();

    if (accounts.length > 0) {
      try {
        const result = await this.pca.acquireTokenSilent({
          account: accounts[0],
          scopes: [`${resource}/.default`],
        });
        return result.accessToken;
      } catch (error) {
        if (!(error instanceof InteractionRequiredAuthError)) {
          throw error;
        }
        // Token expired or revoked, need interactive auth
      }
    }

    // Interactive auth required
    return this.acquireTokenInteractive(resource);
  }

  private async acquireTokenInteractive(resource: string): Promise<string> {
    const port = await this.findFreePort();
    const redirectUri = `http://localhost:${port}`;

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, `http://localhost:${port}`);

        if (url.pathname === '/') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Authentication failed</h1><p>${error}</p>`);
            server.close();
            reject(new Error(error));
            return;
          }

          if (code) {
            try {
              const result = await this.pca.acquireTokenByCode({
                code,
                scopes: [`${resource}/.default`, 'offline_access'],
                redirectUri,
              });

              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                  <h1>✓ Authentication successful</h1>
                  <p>You can close this window and return to Claude.</p>
                  <script>setTimeout(() => window.close(), 2000);</script>
                </body>
                </html>
              `);

              server.close();
              resolve(result.accessToken);
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end(`<h1>Token exchange failed</h1><p>${err}</p>`);
              server.close();
              reject(err);
            }
          }
        }
      });

      server.listen(port, async () => {
        const authUrl = await this.pca.getAuthCodeUrl({
          scopes: [`${resource}/.default`, 'offline_access', 'openid'],
          redirectUri,
        });

        console.error('');
        console.error('🔐 Authentication required');
        console.error('   Opening browser for sign-in...');
        console.error('');

        await open(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timed out'));
      }, 5 * 60 * 1000);
    });
  }

  private async findFreePort(): Promise<number> {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(0, () => {
        const port = (server.address() as any).port;
        server.close(() => resolve(port));
      });
    });
  }
}
```

### 5. Token Cache Implementation

```typescript
// packages/powerplatform/src/auth/token-cache.ts

import { ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export class TokenCache {
  private cacheFile: string;
  private encryptionKey: Buffer;

  constructor(clientId: string) {
    const cacheDir = path.join(os.homedir(), '.mcp-consultant-tools');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    }

    this.cacheFile = path.join(cacheDir, `token-cache-${clientId}.enc`);

    // Derive encryption key from machine-specific data
    // This is basic encryption - for production, use OS keychain (keytar)
    const machineId = os.hostname() + os.userInfo().username;
    this.encryptionKey = crypto.scryptSync(machineId, 'mcp-salt', 32);
  }

  createPlugin(): ICachePlugin {
    return {
      beforeCacheAccess: async (context: TokenCacheContext) => {
        if (fs.existsSync(this.cacheFile)) {
          try {
            const encrypted = fs.readFileSync(this.cacheFile);
            const decrypted = this.decrypt(encrypted);
            context.tokenCache.deserialize(decrypted);
          } catch {
            // Cache corrupted or from different machine, ignore
          }
        }
      },
      afterCacheAccess: async (context: TokenCacheContext) => {
        if (context.cacheHasChanged) {
          const data = context.tokenCache.serialize();
          const encrypted = this.encrypt(data);
          fs.writeFileSync(this.cacheFile, encrypted, { mode: 0o600 });
        }
      },
    };
  }

  private encrypt(data: string): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  private decrypt(data: Buffer): string {
    const iv = data.subarray(0, 16);
    const tag = data.subarray(16, 32);
    const encrypted = data.subarray(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }

  clear(): void {
    if (fs.existsSync(this.cacheFile)) {
      fs.unlinkSync(this.cacheFile);
    }
  }
}
```

### 6. Modified PowerPlatformService

```typescript
// Modify constructor to accept auth provider instead of credentials directly

export class PowerPlatformService {
  private authProvider: AuthProvider;
  private baseUrl: string;

  constructor(config: { authProvider: AuthProvider; baseUrl: string }) {
    this.authProvider = config.authProvider;
    this.baseUrl = config.baseUrl;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.authProvider.getAccessToken(this.baseUrl);
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    };
  }

  // ... rest of methods unchanged, just use this.getHeaders()
}
```

### 7. Environment Variable Changes

**Current (still supported):**
```bash
# Service Principal mode (requires all 4)
POWERPLATFORM_URL=https://org.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=xxx
POWERPLATFORM_CLIENT_SECRET=xxx  # ← Presence triggers service principal mode
POWERPLATFORM_TENANT_ID=xxx
```

**New (for interactive user auth):**
```bash
# Interactive User Auth mode (no secret = triggers interactive mode)
POWERPLATFORM_URL=https://org.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=xxx      # Same app registration, public client enabled
POWERPLATFORM_TENANT_ID=xxx
# No POWERPLATFORM_CLIENT_SECRET = interactive auth
```

---

## User Experience

### First Run (No Cached Token)

```
$ npx @mcp-consultant-tools/powerplatform

🔐 Authentication required
   Opening browser for sign-in...

[Browser opens → Microsoft login → SSO auto-signs in → Consent screen (first time only)]

✓ Authentication successful - you can close this window

[Back in Claude Desktop]
User: "Show me my accounts"
Claude: [Queries Dynamics as the user] "You have 42 accounts..."
```

### Subsequent Runs (Cached Token)

```
$ npx @mcp-consultant-tools/powerplatform

[No browser - uses cached token]
[If token expired, refreshes automatically using refresh_token]
[Only prompts for re-auth if refresh token expired (~90 days)]
```

### Logout / Clear Cache

Add a tool or CLI command:

```bash
npx @mcp-consultant-tools/powerplatform --logout
# Clears cached tokens, next run will require browser auth
```

---

## Claude Desktop Configuration

### For Service Principal (Existing - Unchanged)

```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://org.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "xxx",
        "POWERPLATFORM_CLIENT_SECRET": "xxx",
        "POWERPLATFORM_TENANT_ID": "xxx"
      }
    }
  }
}
```

### For Interactive User Auth (New)

```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://org.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "xxx",
        "POWERPLATFORM_TENANT_ID": "xxx"
      }
    }
  }
}
```

Note: Only difference is **no `POWERPLATFORM_CLIENT_SECRET`**.

---

## Rollout Process

### For IT Admin (One-Time Setup)

1. **Update App Registration** (5 minutes):
   - Enable "Allow public client flows"
   - Add redirect URI `http://localhost`
   - Add `offline_access` permission if missing
   - Grant admin consent if required

2. **Document for Users**:
   - Client ID: `your-client-id`
   - Tenant ID: `your-tenant-id`
   - Dynamics URL: `https://yourorg.crm.dynamics.com`

### For End Users

1. Install Claude Desktop (if not already)
2. Add config to `claude_desktop_config.json` (IT provides template)
3. First use: Browser opens, click through SSO
4. Done - works for ~90 days before re-auth needed

---

## Security Considerations

| Aspect | Implementation |
|--------|----------------|
| **No secrets on user machines** | Public client flow uses PKCE, no client_secret |
| **Token storage** | Encrypted file in user's home directory |
| **Token scope** | Only Dynamics API access, nothing else |
| **Refresh tokens** | Stored encrypted, ~90 day lifetime |
| **Revocation** | Admin can revoke via Entra ID |
| **Audit** | All Dynamics operations logged under user's identity |
| **MFA** | Enforced by Entra ID policies as normal |

---

## Testing Checklist

### App Registration Configuration

- [x] Enable "Allow public client flows" = Yes
- [x] Add `http://localhost` redirect URI (Mobile/Desktop platform)
- [ ] **Dynamics CRM → `user_impersonation` (Delegated)** ← BLOCKED - NEED ADMIN
- [ ] Microsoft Graph → `offline_access` (Delegated) ← RECOMMENDED
- [ ] Admin consent granted

### CLI Commands (Verified Working)

- [x] `--help` shows usage information
- [x] `--logout` clears token cache
- [x] Build compiles without errors

### Functional Testing (After Admin Consent)

- [ ] Service principal mode still works (with secret)
- [ ] Interactive mode triggers when no secret provided
- [ ] Browser opens on first run
- [ ] SSO works (no manual password entry for enterprise users)
- [ ] Token is cached after successful auth
- [ ] Subsequent runs use cached token (no browser)
- [ ] Token refresh works when access token expires
- [ ] `--logout` clears cache
- [ ] User's Dynamics security role is respected
- [ ] Different users on same machine have separate caches

---

## Implementation Phases

### Phase 1: Core Auth (MVP) ✅ COMPLETE
- [x] Create `InteractiveAuth` class with browser flow
- [x] Create `TokenCache` with AES-256-GCM encryption
- [x] Modify `PowerPlatformService` to use auth provider
- [x] Update index.ts with auth mode selection
- [ ] Test with Claude Desktop ← BLOCKED (need admin consent)

### Phase 2: Polish ✅ COMPLETE
- [x] Add `--logout` CLI command
- [x] Add `--help` CLI command
- [x] Add user info display on auth success (beautiful HTML pages)
- [x] Improve error messages (styled error pages)
- [x] Add timeout handling (5 minute timeout)
- [ ] Test token refresh scenarios ← BLOCKED (need admin consent)

### Phase 3: Enhanced Security (Future)
- [ ] Use OS keychain via `keytar` instead of encrypted file
- [ ] Device code flow fallback for headless environments
- [ ] Certificate-based auth option
- [ ] Conditional Access support

---

## Open Questions

1. **Should we create a separate package?**
   - Option A: Add to existing `@mcp-consultant-tools/powerplatform`
   - Option B: Create `@mcp-consultant-tools/powerplatform-desktop`
   - **Recommendation:** Option A (single package, mode determined by config)

2. **Token cache location?**
   - Option A: `~/.mcp-consultant-tools/token-cache.enc`
   - Option B: OS keychain (requires native dependency)
   - **Recommendation:** Start with Option A, add Option B later

3. **What if browser can't open?**
   - Fallback to device code flow (user manually visits URL and enters code)
   - **Recommendation:** Implement as fallback

---

## Appendix: Quick Reference Commands

```bash
# Test service principal mode (existing)
POWERPLATFORM_URL=https://org.crm.dynamics.com \
POWERPLATFORM_CLIENT_ID=xxx \
POWERPLATFORM_CLIENT_SECRET=xxx \
POWERPLATFORM_TENANT_ID=xxx \
npx @mcp-consultant-tools/powerplatform

# Test interactive user auth mode (new)
POWERPLATFORM_URL=https://org.crm.dynamics.com \
POWERPLATFORM_CLIENT_ID=xxx \
POWERPLATFORM_TENANT_ID=xxx \
npx @mcp-consultant-tools/powerplatform

# Clear cached tokens
npx @mcp-consultant-tools/powerplatform --logout
```

---

## Quick Reference Commands

```bash
# Build the package
cd /Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools
npm run build

# Test CLI --help
node packages/powerplatform/build/index.js --help

# Clear cached tokens
node packages/powerplatform/build/index.js --logout

# Test interactive auth (after admin consent)
export POWERPLATFORM_URL=https://mcptests.crm4.dynamics.com
export POWERPLATFORM_CLIENT_ID=acecee6e-bc7b-4710-ba9b-326cf54015a5
export POWERPLATFORM_TENANT_ID=your-tenant-id
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list-entities","arguments":{}}}' | node packages/powerplatform/build/index.js
```

---

*Last Updated: December 10, 2025*
*Status: Awaiting admin to add Dynamics CRM API permission to app registration*
