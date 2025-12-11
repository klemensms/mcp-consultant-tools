# Docker MCP Registry Implementation Plan

## Current Status (2025-12-10)

**Phase**: PowerPlatform Pilot - Implementation Complete, Testing & Submission Pending

### Done ✅

| Task | File |
|------|------|
| Dockerfile | `packages/powerplatform/Dockerfile` |
| .dockerignore | `.dockerignore` |
| Icon requirements | `assets/icons/README.md` |
| Registry server.yaml | `docker-registry/servers/mcp-consultant-tools-powerplatform/server.yaml` |
| Registry readme.md | `docker-registry/servers/mcp-consultant-tools-powerplatform/readme.md` |
| Installation guide | `docs/documentation/docker-installation.md` |
| README.md | Added Docker section |
| CLAUDE.md | Added Docker section |
| POWERPLATFORM.md | Added Docker option |

### Pending ⏳

1. **Create Icon** - 200x200 PNG, purple/blue, save to `assets/icons/powerplatform.png`

2. **Test Docker Build**:
   ```bash
   docker build -f packages/powerplatform/Dockerfile -t mcp/mcp-consultant-tools-powerplatform .
   docker run -it --rm -e POWERPLATFORM_URL=... -e POWERPLATFORM_TENANT_ID=... -e POWERPLATFORM_CLIENT_ID=... -e POWERPLATFORM_CLIENT_SECRET=... mcp/mcp-consultant-tools-powerplatform
   ```

3. **Submit to Registry** - Fork `docker/mcp-registry`, copy `docker-registry/servers/` files, update commit SHA, submit PR

---

## Overview

This document outlines the complete implementation plan for publishing mcp-consultant-tools packages to the Docker MCP Registry, starting with the PowerPlatform package as a pilot.

**Goal**: Enable users to discover and install our MCP servers via Docker Desktop's MCP Toolkit while maintaining existing npx distribution.

**Naming Convention**: `mcp/mcp-consultant-tools-{package}` (branded)

---

## Table of Contents

1. [Architecture Decision](#architecture-decision)
2. [Phase 1: PowerPlatform Pilot](#phase-1-powerplatform-pilot)
3. [Phase 2: Remaining Packages](#phase-2-remaining-packages)
4. [Documentation Updates](#documentation-updates)
5. [CI/CD Integration](#cicd-integration)
6. [Rollout Checklist](#rollout-checklist)

---

## Architecture Decision

### Dual Distribution Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DISTRIBUTION CHANNELS                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  NPM (existing - MAINTAINED)          Docker MCP Registry (new)     │
│  ─────────────────────────────        ─────────────────────────     │
│  npx @mcp-consultant-tools/           Docker Desktop MCP Toolkit    │
│      powerplatform                    → Catalog → Add Server        │
│                                                                      │
│  • Direct npm install                 • One-click install           │
│  • .env file credentials              • Docker secrets management   │
│  • Manual configuration               • UI-guided configuration     │
│  • Full flexibility                   • Token-efficient discovery   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

Both channels use the **same codebase** - Docker just containerizes the npm package.

### Credential Handling

| Aspect | NPM Distribution | Docker Distribution |
|--------|------------------|---------------------|
| Storage | `.env` file or MCP client config | Docker Desktop Secrets |
| Entry | Manual env vars | UI form fields |
| Security | User responsibility | Docker-managed, never in env inspection |
| Multi-env | JSON arrays in env vars | Add server multiple times |

---

## Phase 1: PowerPlatform Pilot

### 1.1 Create Dockerfile

**File**: `packages/powerplatform/Dockerfile`

```dockerfile
# Production Dockerfile for mcp-consultant-tools/powerplatform
# Enables distribution via Docker MCP Registry

FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files needed for install
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/powerplatform/package*.json ./packages/powerplatform/

# Install dependencies
RUN npm ci --workspace=@mcp-consultant-tools/core \
    --workspace=@mcp-consultant-tools/powerplatform

# Copy source files
COPY packages/core/ ./packages/core/
COPY packages/powerplatform/ ./packages/powerplatform/
COPY tsconfig.base.json ./

# Build
RUN npm run build --workspace=@mcp-consultant-tools/core && \
    npm run build --workspace=@mcp-consultant-tools/powerplatform

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts and production dependencies
COPY --from=builder /app/packages/core/build ./packages/core/build
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/powerplatform/build ./packages/powerplatform/build
COPY --from=builder /app/packages/powerplatform/package.json ./packages/powerplatform/

# Copy node_modules (production only)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=builder /app/packages/powerplatform/node_modules ./packages/powerplatform/node_modules

WORKDIR /app/packages/powerplatform

# MCP servers communicate via stdio
ENTRYPOINT ["node", "build/index.js"]
```

### 1.2 Create Icon Asset

**File**: `assets/icons/powerplatform.png`

**Requirements**:
- Size: 200x200 pixels (minimum)
- Format: PNG with transparency
- Content: PowerPlatform/Dynamics 365 themed icon
- Status: **TO BE CREATED - requires user sign-off**

**Proposed Design**:
- Purple/blue gradient (PowerPlatform brand colors)
- Stylized "PP" or Dataverse symbol
- Clean, modern look matching Docker catalog aesthetics

**Hosting**: GitHub raw URL from main branch:
```
https://raw.githubusercontent.com/klemensms/mcp-consultant-tools/main/assets/icons/powerplatform.png
```

### 1.3 Create Docker Registry Entry

**Fork Required**: `docker/mcp-registry`

**Create Directory Structure**:
```
servers/mcp-consultant-tools-powerplatform/
├── server.yaml
├── readme.md
└── tools.json (auto-generated by build)
```

**File**: `servers/mcp-consultant-tools-powerplatform/server.yaml`

```yaml
name: mcp-consultant-tools-powerplatform
type: local
image: mcp/mcp-consultant-tools-powerplatform

meta:
  category: enterprise
  tags:
    - microsoft
    - dynamics365
    - dataverse
    - powerplatform
    - crm

about:
  title: PowerPlatform / Dataverse (Read-Only)
  description: >
    Read-only access to Microsoft PowerPlatform/Dataverse environments.
    Explore entities, inspect plugins, analyze workflows, query records,
    and validate solutions. Production-safe with no write operations.
  icon: https://raw.githubusercontent.com/klemensms/mcp-consultant-tools/main/assets/icons/powerplatform.png

source:
  project: https://github.com/klemensms/mcp-consultant-tools
  commit: <COMMIT_SHA_TO_BE_FILLED>

config:
  description: >
    Configure your PowerPlatform/Dataverse environment credentials.
    Create an Azure AD App Registration with Dynamics CRM permissions.
  secrets:
    - name: mcp-consultant-tools-powerplatform.url
      env: POWERPLATFORM_URL
      description: Your PowerPlatform environment URL
      example: https://yourorg.crm.dynamics.com

    - name: mcp-consultant-tools-powerplatform.tenant_id
      env: POWERPLATFORM_TENANT_ID
      description: Azure AD Tenant ID (GUID)
      example: 12345678-1234-1234-1234-123456789abc

    - name: mcp-consultant-tools-powerplatform.client_id
      env: POWERPLATFORM_CLIENT_ID
      description: Azure AD App Registration Client ID
      example: 87654321-4321-4321-4321-cba987654321

    - name: mcp-consultant-tools-powerplatform.client_secret
      env: POWERPLATFORM_CLIENT_SECRET
      description: Azure AD App Registration Client Secret
      example: your-client-secret-value

    - name: mcp-consultant-tools-powerplatform.default_solution
      env: POWERPLATFORM_DEFAULT_SOLUTION
      description: (Optional) Default solution unique name for filtering
      example: MySolution
```

**File**: `servers/mcp-consultant-tools-powerplatform/readme.md`

```markdown
# PowerPlatform / Dataverse MCP Server

Read-only access to Microsoft PowerPlatform/Dataverse environments for AI assistants.

## Features

- **38 tools** for exploring entities, plugins, workflows, and records
- **10 prompts** for common analysis tasks
- Production-safe: No write operations
- Azure AD authentication via MSAL

## Prerequisites

1. Azure AD App Registration with:
   - API Permission: Dynamics CRM → user_impersonation
   - Client secret configured

2. PowerPlatform environment URL

## Documentation

Full documentation: https://github.com/klemensms/mcp-consultant-tools/blob/main/docs/documentation/powerplatform/

## Also Available

- **powerplatform-customization**: Schema modification tools (dev environments)
- **powerplatform-data**: Data CRUD operations (operational use)
```

### 1.4 Local Testing

```bash
# Build Docker image locally
cd /path/to/mcp-consultant-tools
docker build -f packages/powerplatform/Dockerfile -t mcp/mcp-consultant-tools-powerplatform .

# Test with environment variables
docker run -it --rm \
  -e POWERPLATFORM_URL=https://yourorg.crm.dynamics.com \
  -e POWERPLATFORM_TENANT_ID=your-tenant-id \
  -e POWERPLATFORM_CLIENT_ID=your-client-id \
  -e POWERPLATFORM_CLIENT_SECRET=your-client-secret \
  mcp/mcp-consultant-tools-powerplatform

# Should see MCP JSON-RPC ready on stdio
```

### 1.5 Registry Validation

```bash
# In forked mcp-registry directory
cd /path/to/mcp-registry-fork

# Validate server entry
task validate -- --name mcp-consultant-tools-powerplatform

# Build and verify
task build -- --tools mcp-consultant-tools-powerplatform

# Test in Docker Desktop
docker mcp catalog import ./servers/mcp-consultant-tools-powerplatform
```

### 1.6 Submit PR

**PR Template Requirements** (from Docker registry):

1. Server name and description
2. Category and tags
3. Source repository link
4. Commit SHA
5. Test credentials (via Docker's secure form)
6. Confirmation of license compatibility (MIT - compatible)

---

## Phase 2: Remaining Packages

After PowerPlatform pilot is accepted, repeat for remaining packages.

### Package Priority Order

| Priority | Package | Rationale |
|----------|---------|-----------|
| 1 | powerplatform | Pilot - most feature-rich |
| 2 | azure-devops | High demand, simple PAT auth |
| 3 | figma | Simple, 2 tools, quick win |
| 4 | application-insights | Azure monitoring suite |
| 5 | log-analytics | Azure monitoring suite |
| 6 | azure-sql | Database access |
| 7 | sharepoint | Microsoft 365 integration |
| 8 | github-enterprise | Code repository access |
| 9 | service-bus | Messaging integration |
| 10 | azure-b2c | Identity management |
| 11 | powerplatform-customization | Dev-only package |
| 12 | powerplatform-data | Operational package |
| 13 | rest-api | Generic REST client |

### Dockerfile Template for Other Packages

Each package will use a similar Dockerfile pattern:

```dockerfile
# Template: packages/{package-name}/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

# Copy and install
COPY package*.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/{package-name}/package*.json ./packages/{package-name}/
RUN npm ci --workspace=@mcp-consultant-tools/core \
    --workspace=@mcp-consultant-tools/{package-name}

# Build
COPY packages/core/ ./packages/core/
COPY packages/{package-name}/ ./packages/{package-name}/
COPY tsconfig.base.json ./
RUN npm run build --workspace=@mcp-consultant-tools/core && \
    npm run build --workspace=@mcp-consultant-tools/{package-name}

# Production
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/core/build ./packages/core/build
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/{package-name}/build ./packages/{package-name}/build
COPY --from=builder /app/packages/{package-name}/package.json ./packages/{package-name}/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=builder /app/packages/{package-name}/node_modules ./packages/{package-name}/node_modules

WORKDIR /app/packages/{package-name}
ENTRYPOINT ["node", "build/index.js"]
```

### Icons Required

| Package | Icon Design Notes |
|---------|-------------------|
| powerplatform | Purple/blue, Dataverse symbol |
| powerplatform-customization | Same + gear/wrench overlay |
| powerplatform-data | Same + data/table overlay |
| azure-devops | Azure DevOps logo style, blue |
| figma | Figma-inspired, design tool aesthetic |
| application-insights | Azure monitor style, chart/graph |
| log-analytics | Azure monitor style, logs/terminal |
| azure-sql | Database icon, Azure blue |
| service-bus | Message queue icon, Azure orange |
| sharepoint | SharePoint green/teal |
| github-enterprise | GitHub octocat variant, enterprise |
| azure-b2c | Identity/user icon, Azure blue |
| rest-api | API/endpoint icon, neutral |

**Status**: All icons **TO BE CREATED - requires user sign-off**

---

## Documentation Updates

### 3.1 Update README.md

Add new section after "Quick Start":

```markdown
## Installation Options

### Option 1: Docker Desktop (Recommended)

The easiest way to get started with mcp-consultant-tools is via Docker Desktop's MCP Toolkit:

1. Open Docker Desktop
2. Navigate to **MCP Toolkit** → **Catalog**
3. Search for `mcp-consultant-tools-powerplatform`
4. Click **Add** and configure your credentials
5. Enable the server

Available packages in Docker Catalog:
- `mcp-consultant-tools-powerplatform` - Read-only Dataverse access
- `mcp-consultant-tools-azure-devops` - Wiki and work items
- ... (list all packages)

### Option 2: NPX (Direct)

Run directly via npx without installation:

\`\`\`bash
npx @mcp-consultant-tools/powerplatform
\`\`\`

Configure in your MCP client (e.g., Claude Desktop):

\`\`\`json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourorg.crm.dynamics.com",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
\`\`\`
```

### 3.2 Create Docker Installation Guide

**File**: `docs/documentation/docker-installation.md`

```markdown
# Installing via Docker MCP Toolkit

This guide covers installing mcp-consultant-tools packages via Docker Desktop's MCP Toolkit.

## Prerequisites

- Docker Desktop 4.40+ with MCP Toolkit enabled
- Azure AD credentials for your integrations

## Benefits of Docker Installation

| Feature | Docker | NPX |
|---------|--------|-----|
| Installation | One-click | Manual config |
| Credentials | Secure Docker secrets | .env or client config |
| Updates | Automatic | Manual npm update |
| Discovery | Catalog search | Know package name |
| Token efficiency | Dynamic loading | Always in context |

## Installation Steps

### 1. Enable MCP Toolkit

1. Open Docker Desktop
2. Go to **Settings** → **Features in development**
3. Enable **MCP Toolkit**
4. Restart Docker Desktop

### 2. Add Server from Catalog

1. Click **MCP Toolkit** in the sidebar
2. Go to **Catalog** tab
3. Search for your desired package:
   - `mcp-consultant-tools-powerplatform`
   - `mcp-consultant-tools-azure-devops`
   - etc.
4. Click **Add**

### 3. Configure Credentials

Docker Desktop will prompt for required credentials:

**PowerPlatform Example:**
- PowerPlatform URL: `https://yourorg.crm.dynamics.com`
- Tenant ID: `your-azure-tenant-guid`
- Client ID: `your-app-registration-id`
- Client Secret: `your-secret` (stored securely)

### 4. Enable Server

Toggle the server to **Enabled** state.

### 5. Connect Your AI Client

Configure your AI client to use Docker MCP Gateway:

**Claude Desktop / Claude Code:**
\`\`\`json
{
  "mcpServers": {
    "docker": {
      "command": "docker",
      "args": ["mcp", "gateway"]
    }
  }
}
\`\`\`

The Docker gateway provides access to all enabled MCP servers.

## Multiple Environments

To connect to multiple PowerPlatform environments:

1. Add the server multiple times with different names
2. Each instance has its own credential configuration

Example:
- `mcp-consultant-tools-powerplatform` → Production
- Add again as `powerplatform-dev` → Development

## Troubleshooting

### Server not appearing in catalog
- Ensure Docker Desktop is updated to 4.40+
- Check MCP Toolkit is enabled in settings
- Try `docker mcp catalog refresh`

### Authentication errors
- Verify credentials in Docker Desktop secrets
- Check Azure AD app permissions include Dynamics CRM
- Ensure client secret hasn't expired

### Container startup issues
\`\`\`bash
# Check container logs
docker logs <container-id>

# Verify image is pulled
docker images | grep mcp-consultant-tools
\`\`\`
```

### 3.3 Update CLAUDE.md

Add brief section in Architecture:

```markdown
### Docker Distribution

Packages are also distributed via Docker MCP Registry for use with Docker Desktop's MCP Toolkit:

- Image naming: `mcp/mcp-consultant-tools-{package}`
- Dockerfiles: `packages/{package}/Dockerfile`
- Registry entries: Maintained in fork of `docker/mcp-registry`

See [Docker Installation Guide](docs/documentation/docker-installation.md) for details.
```

### 3.4 Update Package-Specific Documentation

For each package in `docs/documentation/{package}/`:

Add section:

```markdown
## Installation

### Docker Desktop (Recommended)

1. Open Docker Desktop → MCP Toolkit → Catalog
2. Search for `mcp-consultant-tools-{package}`
3. Add and configure credentials
4. Enable the server

### NPX

\`\`\`bash
npx @mcp-consultant-tools/{package}
\`\`\`
```

---

## CI/CD Integration (Future)

### GitHub Actions Workflow

**File**: `.github/workflows/docker-build.yml`

```yaml
name: Docker Build

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package:
          - powerplatform
          - azure-devops
          - figma
          # ... add more as they're added to registry

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        run: |
          docker build \
            -f packages/${{ matrix.package }}/Dockerfile \
            -t mcp/mcp-consultant-tools-${{ matrix.package }}:${{ github.ref_name }} \
            -t mcp/mcp-consultant-tools-${{ matrix.package }}:latest \
            .

      # Note: Docker MCP Registry builds images themselves
      # This workflow is for local testing/validation
```

---

## Rollout Checklist

### Phase 1: PowerPlatform Pilot

- [x] **1.1 Dockerfile**
  - [x] Create `packages/powerplatform/Dockerfile`
  - [ ] Test local build: `docker build -f packages/powerplatform/Dockerfile -t test .`
  - [ ] Test container runs and accepts MCP commands

- [ ] **1.2 Icon Asset**
  - [ ] Design PowerPlatform icon (200x200 PNG)
  - [ ] Get user sign-off on design
  - [ ] Commit to `assets/icons/powerplatform.png`
  - [ ] Verify GitHub raw URL works

- [x] **1.3 Docker Registry Entry** (files created locally)
  - [ ] Fork `docker/mcp-registry`
  - [x] Create `docker-registry/servers/mcp-consultant-tools-powerplatform/server.yaml`
  - [x] Create `docker-registry/servers/mcp-consultant-tools-powerplatform/readme.md`
  - [ ] Copy to fork and fill in commit SHA

- [ ] **1.4 Validation**
  - [ ] Run `task validate -- --name mcp-consultant-tools-powerplatform`
  - [ ] Run `task build -- --tools mcp-consultant-tools-powerplatform`
  - [ ] Test in Docker Desktop MCP Toolkit

- [x] **1.5 Documentation**
  - [x] Update README.md with Docker installation option
  - [x] Create `docs/documentation/docker-installation.md`
  - [x] Update `docs/documentation/POWERPLATFORM.md` with Docker option
  - [x] Update CLAUDE.md with brief Docker section

- [ ] **1.6 Submit PR**
  - [ ] Create PR to `docker/mcp-registry`
  - [ ] Submit test credentials via Docker's secure form
  - [ ] Respond to review feedback
  - [ ] PR merged

### Phase 2: Remaining Packages (repeat for each)

- [ ] Create Dockerfile
- [ ] Create icon asset (get sign-off)
- [ ] Create registry entry
- [ ] Validate and test
- [ ] Update package documentation
- [ ] Submit PR

---

## Files Summary

### New Files Created ✅

| File | Purpose | Status |
|------|---------|--------|
| `packages/powerplatform/Dockerfile` | Docker build instructions | ✅ Done |
| `.dockerignore` | Optimize Docker build | ✅ Done |
| `assets/icons/README.md` | Icon requirements | ✅ Done |
| `assets/icons/powerplatform.png` | Package icon for catalog | ⏳ Pending |
| `docs/documentation/docker-installation.md` | User installation guide | ✅ Done |
| `docker-registry/README.md` | Submission instructions | ✅ Done |
| `docker-registry/servers/mcp-consultant-tools-powerplatform/server.yaml` | Server config | ✅ Done |
| `docker-registry/servers/mcp-consultant-tools-powerplatform/readme.md` | Server docs | ✅ Done |

### Files Modified ✅

| File | Change | Status |
|------|--------|--------|
| `README.md` | Added Docker installation section | ✅ Done |
| `CLAUDE.md` | Added Docker distribution note | ✅ Done |
| `docs/documentation/POWERPLATFORM.md` | Added Docker installation option | ✅ Done |

### External Files (to copy to docker/mcp-registry fork)

| Source | Destination | Status |
|--------|-------------|--------|
| `docker-registry/servers/mcp-consultant-tools-powerplatform/` | `servers/mcp-consultant-tools-powerplatform/` | ⏳ Copy when submitting |

---

## Success Criteria

1. **PowerPlatform available in Docker catalog** - users can find and add it
2. **Credentials work via Docker secrets** - no .env file needed
3. **NPX continues to work** - existing users unaffected
4. **Documentation complete** - users can follow either path
5. **Icon approved** - professional appearance in catalog
