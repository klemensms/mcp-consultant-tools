# Building an MCP Server for Any REST API

A guide for AI agents to build Model Context Protocol (MCP) servers that wrap REST APIs.

---

## Overview

MCP servers expose **tools** (functions AI can call) and **prompts** (pre-defined templates) via stdio JSON-RPC transport.

```
┌─────────────┐   stdio/JSON-RPC   ┌─────────────┐     HTTP      ┌─────────────┐
│ AI Assistant│◄──────────────────►│ MCP Server  │◄─────────────►│  REST API   │
└─────────────┘                    └─────────────┘               └─────────────┘
```

---

## Project Structure

```
my-mcp-server/
├── src/
│   ├── index.ts          # MCP server, tool/prompt registration
│   ├── MyApiService.ts   # Service layer - API calls, auth
│   └── types.ts          # TypeScript interfaces
├── build/                # Compiled output
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## Step 1: package.json

```json
{
  "name": "my-api-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "build/index.js",
  "bin": { "my-api-mcp": "build/index.js" },
  "files": ["build", "README.md"],
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "dotenv": "^16.3.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

---

## Step 2: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

---

## Step 3: Service Layer (src/MyApiService.ts)

```typescript
interface Config {
  baseUrl: string;
  apiKey?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class MyApiService {
  private config: Config;
  private cachedToken: CachedToken | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  // Token caching - reuse until near expiration
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
      return this.cachedToken.token;
    }
    const token = await this.acquireToken();
    this.cachedToken = { token, expiresAt: Date.now() + 3600000 };
    return token;
  }

  private async acquireToken(): Promise<string> {
    // Implement based on your API's auth (OAuth, API key, etc.)
    return this.config.apiKey || '';
  }

  // Generic request method
  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  // Example methods - adapt to your API
  async listItems(limit?: number): Promise<any[]> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request('GET', `/items${query}`);
  }

  async getItem(id: string): Promise<any> {
    return this.request('GET', `/items/${id}`);
  }

  async createItem(data: { name: string }): Promise<any> {
    return this.request('POST', '/items', data);
  }
}
```

---

## Step 4: MCP Server (src/index.ts)

```typescript
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MyApiService } from './MyApiService.js';

// ============================================================
// CRITICAL: Suppress stdout during dotenv initialization
// MCP uses stdio - ANY stdout output breaks the JSON-RPC protocol
// ============================================================
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk: any, encoding?: any, callback?: any) => {
  if (typeof chunk === 'string' && !chunk.startsWith('{')) return true;
  return originalStdoutWrite(chunk, encoding, callback);
};

import 'dotenv/config';
process.stdout.write = originalStdoutWrite;

// ============================================================
// Configuration - load from environment
// ============================================================
function loadConfig() {
  const baseUrl = process.env.MY_API_BASE_URL;
  if (!baseUrl) return null; // Not configured - integration is optional
  return {
    baseUrl,
    apiKey: process.env.MY_API_KEY,
  };
}

// ============================================================
// Lazy Service Initialization
// ============================================================
let service: MyApiService | null = null;

function getService(): MyApiService {
  if (!service) {
    const config = loadConfig();
    if (!config) {
      throw new Error('Not configured. Set MY_API_BASE_URL environment variable.');
    }
    service = new MyApiService(config);
  }
  return service;
}

// ============================================================
// MCP Server Setup
// ============================================================
const server = new Server(
  { name: 'my-api-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {}, prompts: {} } }
);

// ============================================================
// Tool Definitions
// ============================================================
const TOOLS = [
  {
    name: 'list-items',
    description: 'List all items with optional limit',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results to return' },
      },
    },
  },
  {
    name: 'get-item',
    description: 'Get a specific item by ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The item ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create-item',
    description: 'Create a new item',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Item name' },
      },
      required: ['name'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// ============================================================
// Zod Schemas for Validation
// ============================================================
const ListItemsSchema = z.object({ limit: z.number().optional() });
const GetItemSchema = z.object({ id: z.string() });
const CreateItemSchema = z.object({ name: z.string() });

// ============================================================
// Tool Execution Handler
// ============================================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list-items': {
        const params = ListItemsSchema.parse(args);
        const items = await getService().listItems(params.limit);
        return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
      }

      case 'get-item': {
        const params = GetItemSchema.parse(args);
        const item = await getService().getItem(params.id);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'create-item': {
        const params = CreateItemSchema.parse(args);
        const item = await getService().createItem(params);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

// ============================================================
// Prompt Definitions
// ============================================================
const PROMPTS = [
  {
    name: 'analyze-items',
    description: 'Analyze all items and provide insights',
    arguments: [
      { name: 'focus', description: 'Area to focus on', required: false },
    ],
  },
];

server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'analyze-items': {
      const items = await getService().listItems();
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze these items${args?.focus ? ` focusing on ${args.focus}` : ''}:

\`\`\`json
${JSON.stringify(items, null, 2)}
\`\`\`

Provide: 1) Key patterns 2) Issues 3) Recommendations`,
          },
        }],
      };
    }
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// ============================================================
// Start Server
// ============================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP server started'); // stderr only!
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

---

## Step 5: .env.example

```bash
# Required
MY_API_BASE_URL=https://api.example.com/v1

# Authentication (adapt to your API)
MY_API_KEY=your-api-key-here
```

---

## Critical Rules

### 1. NEVER Write to stdout

MCP uses stdio for JSON-RPC. Any stdout output breaks the protocol.

```typescript
// ❌ FORBIDDEN
console.log('Debug info');
process.stdout.write('...');

// ✅ ALLOWED (writes to stderr)
console.error('Error:', error);
console.warn('Warning');
```

### 2. Lazy Initialization

Don't create services at startup. Create on first use.

```typescript
let service: MyApiService | null = null;

function getService(): MyApiService {
  if (!service) {
    service = new MyApiService(loadConfig());
  }
  return service;
}
```

### 3. Cache Authentication Tokens

```typescript
private cachedToken: { token: string; expiresAt: number } | null = null;

private async getAccessToken(): Promise<string> {
  if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
    return this.cachedToken.token;
  }
  // ... acquire and cache new token
}
```

### 4. Use Zod for Validation

Always validate tool parameters:

```typescript
const MySchema = z.object({
  id: z.string(),
  limit: z.number().optional(),
});

const params = MySchema.parse(args);
```

### 5. Return Proper Error Responses

```typescript
catch (error) {
  return {
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
  };
}
```

---

## Authentication Patterns

### API Key (Header)
```typescript
headers: { 'X-API-Key': this.config.apiKey }
```

### Bearer Token
```typescript
headers: { 'Authorization': `Bearer ${token}` }
```

### OAuth Client Credentials
```typescript
const response = await fetch(tokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: this.config.clientId,
    client_secret: this.config.clientSecret,
  }),
});
```

### Basic Auth
```typescript
const credentials = Buffer.from(`${username}:${password}`).toString('base64');
headers: { 'Authorization': `Basic ${credentials}` }
```

---

## Testing

### Local Test
```bash
npm run build
node build/index.js
```

### With MCP Client (Claude Desktop)
```json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "MY_API_BASE_URL": "https://api.example.com",
        "MY_API_KEY": "test-key"
      }
    }
  }
}
```

### Package Validation
```bash
npm pack
npx ./my-api-mcp-server-1.0.0.tgz
```

---

## Publishing to npm

### Initial npm Setup

1. **Create npm account** at https://www.npmjs.com/signup

2. **Login from terminal:**
   ```bash
   npm login
   # Enter username, password, email, and OTP if 2FA enabled
   ```

3. **Verify login:**
   ```bash
   npm whoami
   # Should print your username
   ```

4. **Choose package name** - Check availability:
   ```bash
   npm view my-api-mcp-server
   # 404 = available, otherwise pick different name
   ```

5. **For scoped packages** (@myorg/package-name):
   ```bash
   # Create org at npmjs.com first, then:
   npm init --scope=@myorg

   # Scoped packages are private by default, make public:
   npm publish --access public
   ```

### Understanding npm Tags (dist-tags)

npm uses **tags** to manage release channels. Key concept: **tags point to specific versions**.

| Tag | Purpose | Install Command |
|-----|---------|-----------------|
| `latest` | Production releases (DEFAULT) | `npm install my-pkg` |
| `beta` | Pre-release testing | `npm install my-pkg@beta` |
| `next` | Upcoming major version | `npm install my-pkg@next` |
| `alpha` | Early development | `npm install my-pkg@alpha` |

**Critical:** `npm publish` defaults to `latest` tag. Always use `--tag beta` for pre-releases!

```bash
# View current tags for a package
npm dist-tag ls my-api-mcp-server

# Output example:
# latest: 1.0.0
# beta: 1.1.0-beta.3
```

### Safe Release Workflow

#### Step 1: Build and Test Locally
```bash
npm run build
node build/index.js  # Quick smoke test
```

#### Step 2: Validate Package Structure
```bash
# Create tarball (doesn't publish)
npm pack

# Test the exact package users will get
npx ./my-api-mcp-server-1.0.0.tgz
```

#### Step 3: Publish Beta (ALWAYS DO THIS FIRST)
```bash
# Bump to beta version: 1.0.0 → 1.0.1-beta.0
npm version prerelease --preid=beta

# Publish to beta tag (NOT latest)
npm publish --tag beta

# Push version commit and tag to git
git push && git push --tags
```

**Users can now test with:**
```bash
npx my-api-mcp-server@beta
# or
npm install my-api-mcp-server@beta
```

#### Step 4: Iterate on Beta (if issues found)
```bash
# Fix bugs, then bump beta: 1.0.1-beta.0 → 1.0.1-beta.1
npm version prerelease --preid=beta
npm publish --tag beta
git push && git push --tags
```

#### Step 5: Promote to Production (after validation)

**Option A: Promote existing beta version**
```bash
# Point 'latest' tag to tested beta version
npm dist-tag add my-api-mcp-server@1.0.1-beta.3 latest
```

**Option B: Publish as final version**
```bash
# Bump to release version: 1.0.1-beta.3 → 1.0.1
npm version patch

# Publish (defaults to 'latest' tag)
npm publish

git push && git push --tags
```

### Version Bumping Reference

```bash
npm version prerelease --preid=beta  # 1.0.0 → 1.0.1-beta.0
npm version prerelease --preid=beta  # 1.0.1-beta.0 → 1.0.1-beta.1
npm version patch                     # 1.0.1-beta.1 → 1.0.2
npm version minor                     # 1.0.2 → 1.1.0
npm version major                     # 1.1.0 → 2.0.0
```

### Emergency Rollback

```bash
# Deprecate broken version (warns users)
npm deprecate my-api-mcp-server@1.0.5 "Broken release - use 1.0.4"

# Point 'latest' back to last good version
npm dist-tag add my-api-mcp-server@1.0.4 latest
```

### Unpublish (use sparingly)

```bash
# Unpublish specific version (within 72 hours only)
npm unpublish my-api-mcp-server@1.0.5

# Unpublish entire package (within 72 hours, no dependents)
npm unpublish my-api-mcp-server --force
```

### MCP Client Configuration for Testing

**Testing beta in Claude Desktop:**
```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["my-api-mcp-server@beta"],
      "env": {
        "MY_API_BASE_URL": "https://api.example.com",
        "MY_API_KEY": "test-key"
      }
    }
  }
}
```

**Testing local build:**
```json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"],
      "env": {
        "MY_API_BASE_URL": "https://api.example.com",
        "MY_API_KEY": "test-key"
      }
    }
  }
}
```

### Publishing Checklist

- [ ] `npm whoami` shows correct account
- [ ] Package name available or you own the scope
- [ ] `npm run build` succeeds
- [ ] `npm pack` + `npx ./tarball.tgz` works
- [ ] Version bumped with `npm version prerelease --preid=beta`
- [ ] Published with `--tag beta` (NOT to latest)
- [ ] Tested beta with real MCP client
- [ ] After validation: promoted to `latest`

---

## Checklist

- [ ] Service class with auth and API methods
- [ ] Token caching implemented
- [ ] MCP server with tools and prompts
- [ ] Zod schemas for all parameters
- [ ] NO stdout writes (only stderr)
- [ ] Lazy service initialization
- [ ] Proper error handling with `isError: true`
- [ ] .env.example with all config options
- [ ] README with setup instructions
- [ ] Test with `npm pack` before publish
- [ ] Publish to beta tag first