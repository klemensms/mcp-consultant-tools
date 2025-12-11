# Microsoft PowerPlatform / Dynamics 365 Integration (Read-Only)

**📦 Package:** `@mcp-consultant-tools/powerplatform`
**🔒 Security:** Production-safe (read-only access, no schema modifications, no data writes)

---

## 🚨 IMPORTANT: Package Split Information

As of **v16.0.0**, the PowerPlatform integration is split into **3 security-isolated packages**:

| Package | Purpose | Tools | Prompts | Production-Safe? |
|---------|---------|-------|---------|------------------|
| **[@mcp-consultant-tools/powerplatform](POWERPLATFORM.md)** (This Package) | Read-only access | 40 | 11 | ✅ **YES** |
| **[@mcp-consultant-tools/powerplatform-customization](POWERPLATFORM_CUSTOMIZATION.md)** | Schema changes | 40 | 2 | ⚠️ **NO** - Dev/config only |
| **[@mcp-consultant-tools/powerplatform-data](POWERPLATFORM_DATA.md)** | Data CRUD | 3 | 0 | ⚠️ **NO** - Operational use |

**This documentation covers the read-only package only.** For customization or data CRUD operations, see the respective package documentation.

---

## ⚡ Quick Start

### MCP Client Configuration

Get started quickly with this minimal configuration. Choose your authentication mode:

#### Authentication Modes (v23+)

| Mode | When to Use | Config Required |
|------|-------------|-----------------|
| **Interactive (SSO)** | Individual users, desktop apps | No client secret needed |
| **Service Principal** | CI/CD, automation, shared services | Client secret required |

---

#### Option 1: Interactive User Auth (Recommended for Desktop)

Opens a browser for Microsoft sign-in. User's Dynamics security roles apply. No secrets on user machines.

**For Claude Desktop:**
```json
{
  "mcpServers": {
    "powerplatform-readonly": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

**For VS Code:**
```json
{
  "mcp.servers": {
    "powerplatform-readonly": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

**First run:** Browser opens → Sign in → Tokens cached for ~90 days.

**App Registration Requirements for Interactive Auth:**

> ⚠️ **All 4 steps required** - Missing any will cause authentication to fail

1. **Authentication Tab:**
   - Enable **"Allow public client flows"** = **Yes**
   - Add platform: **Mobile and desktop applications**
   - Add redirect URI: `http://localhost`

2. **API Permissions Tab - Add these delegated permissions:**
   | API | Permission | Required? |
   |-----|------------|-----------|
   | **Dynamics CRM** | `user_impersonation` | **Required** |
   | Microsoft Graph | `offline_access` | Recommended |
   | Microsoft Graph | `User.Read` | Optional |

3. **Grant Admin Consent:**
   - Click **"Grant admin consent for [Your Org]"**
   - This requires Global Administrator or Privileged Role Administrator
   - **Without admin consent, users will see "Approval required" on first login**

4. **CLI Commands (for token management):**
   ```bash
   npx @mcp-consultant-tools/powerplatform --help    # Show usage
   npx @mcp-consultant-tools/powerplatform --logout  # Clear cached tokens
   ```

📖 **[Full Interactive Auth Setup Guide](#interactive-user-authentication-setup-v23)**

---

#### Option 2: Service Principal Auth (For Automation)

Uses app identity. Best for CI/CD, scheduled tasks, or shared services.

**For Claude Desktop:**
```json
{
  "mcpServers": {
    "powerplatform-readonly": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

**For VS Code:**
```json
{
  "mcp.servers": {
    "powerplatform-readonly": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-client-id",
        "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
        "POWERPLATFORM_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

#### For Docker Desktop (One-Click Install)

The easiest installation method is via **Docker Desktop's MCP Toolkit**:

1. Open **Docker Desktop** → **MCP Toolkit** → **Catalog**
2. Search for `mcp-consultant-tools-powerplatform`
3. Click **Add**
4. Enter your credentials in the form:
   - PowerPlatform URL
   - Tenant ID
   - Client ID
   - Client Secret
5. Enable the server

Then configure Claude Desktop to use Docker gateway:

```json
{
  "mcpServers": {
    "docker": {
      "command": "docker",
      "args": ["mcp", "gateway"]
    }
  }
}
```

**Benefits:** Secure credential storage, automatic updates, one-click setup.

**📖 [Full Docker Installation Guide](docker-installation.md)**

#### Test Your Setup

After configuring, test the connection by querying entity metadata:

```javascript
// Ask Claude: "List all entities in my PowerPlatform environment"
// Or use the entity-overview prompt:
await mcpClient.invoke("entity-overview", {
  entityName: "account"
});
```

**Need credentials?** See the [Detailed Setup](#detailed-setup) section below for Azure AD app registration instructions.

---

## 🎯 Key Features for Consultants

### Automated Workflows (Prompts)

This package includes **11 pre-built prompts** that generate formatted, human-readable reports from PowerPlatform metadata. These prompts are designed for consultants who need quick insights without writing code.

#### Entity Analysis Prompts

1. **`entity-overview`** - Comprehensive overview of an entity with key fields, relationships, and usage patterns
   - Example: `"Give me an overview of the account entity"`

2. **`attribute-details`** - Detailed attribute information with data types, constraints, and best practices
   - Example: `"Show me details about the revenue attribute on account"`

3. **`query-template`** - OData query templates with filter examples and optimization tips
   - Example: `"Generate a query template for the contact entity"`

4. **`relationship-map`** - Visual relationship map showing parent/child and N:N relationships
   - Example: `"Show me all relationships for the opportunity entity"`

#### Plugin & Automation Prompts

5. **`plugin-deployment-report`** - Plugin deployment validation with automatic issue detection
   - Example: `"Generate a deployment report for MyCompany.Plugins"`

6. **`entity-plugin-pipeline-report`** - Plugin execution pipeline showing order and configuration
   - Example: `"Show me the plugin pipeline for account updates"`

7. **`flows-report`** - Power Automate flows inventory grouped by state
   - Example: `"List all active flows in the environment"`

8. **`workflows-report`** - Classic workflows inventory with trigger configuration
   - Example: `"Show me all real-time workflows"`

9. **`business-rules-report`** - Business rules inventory by entity and state
   - Example: `"List all business rules for the account entity"`

#### Best Practice Validation Prompts

10. **`dataverse-best-practices-report`** 🔥 **MOST VALUABLE** - Validates naming conventions, required columns, global option sets, entity icons, and more
    - Automatically detects violations of organizational standards
    - Provides complete lists of all affected entities and columns
    - Generates actionable recommendations for fixing issues
    - Example: `"Validate best practices for the AOPCore solution with prefix sic_"`
    - **Use Case:** Pre-deployment validation, compliance auditing, quality gates in CI/CD

**Why the best-practices-report is most valuable:**
- Catches naming convention violations before production deployment
- Enforces organizational standards (e.g., all entities must have `updatedbyprocess` column)
- Validates global option set usage (no local option sets allowed)
- Ensures custom entities have icons for better UX
- Generates complete affected entity lists for bulk remediation
- Perfect for code reviews and compliance audits

---

## Table of Contents

1. [Overview](#overview)
   - [What is PowerPlatform?](#what-is-powerplatform)
   - [Why Use This Integration?](#why-use-this-integration)
   - [Key Features (Read-Only)](#key-features-read-only)
   - [Supported Environments](#supported-environments)

2. [Detailed Setup](#detailed-setup)
   - [Prerequisites](#prerequisites)
   - [Azure AD App Registration](#azure-ad-app-registration)
   - [Environment Variables](#environment-variables)
   - [Configuration Example](#configuration-example)

3. [Tools (39 Total)](#tools-39-total)
   - [Entity Metadata Tools (6)](#entity-metadata-tools)
   - [Plugin Inspection Tools (4)](#plugin-inspection-tools)
   - [Workflow & Power Automate Flow Tools (5)](#workflow--power-automate-flow-tools)
   - [Business Rules Tools (2)](#business-rules-tools)
   - [Form Management Tools (Read-Only) (3)](#form-management-tools-read-only)
   - [View Management Tools (Read-Only) (3)](#view-management-tools-read-only)
   - [Model-Driven App Tools (Read-Only) (4)](#model-driven-app-tools-read-only)
   - [Web Resource Tools (Read-Only) (3)](#web-resource-tools-read-only)
   - [Solution Management Tools (Read-Only) (8)](#solution-management-tools-read-only)
   - [Best Practice Validation Tools (1)](#best-practice-validation-tools)

4. [Prompts (11 Total)](#prompts-11-total)
   - [Entity Prompts (4)](#entity-prompts)
   - [Plugin Prompts (2)](#plugin-prompts)
   - [Workflow & Flow Prompts (2)](#workflow--flow-prompts)
   - [Business Rules Prompts (1)](#business-rules-prompts)
   - [Solution Prompts (1)](#solution-prompts)
   - [Best Practice Validation Prompts (1)](#best-practice-validation-prompts)

5. [Usage Examples](#usage-examples)
   - [Entity Exploration](#entity-exploration)
   - [Plugin Validation](#plugin-validation)
   - [Workflow Analysis](#workflow-analysis)
   - [Cross-Service Correlation](#cross-service-correlation)

6. [Best Practices](#best-practices)
   - [Security](#security)
   - [Performance](#performance)
   - [Production Use](#production-use)

7. [Troubleshooting](#troubleshooting)
   - [Common Errors](#common-errors)
   - [Authentication Issues](#authentication-issues)
   - [Permission Problems](#permission-problems)

---

## Overview

### What is PowerPlatform?

Microsoft PowerPlatform is a low-code/no-code platform that includes:
- **Dynamics 365**: CRM and ERP applications
- **Power Apps**: Custom business applications
- **Power Automate**: Workflow automation
- **Power BI**: Business intelligence
- **Power Pages**: External-facing websites
- **Dataverse**: Unified data platform (formerly Common Data Service)

This integration provides **read-only programmatic access** to Dataverse, the data layer underlying PowerPlatform applications.

### Why Use This Integration?

**Primary Use Cases (Read-Only):**
1. **Entity Exploration**: Quickly understand entity schemas, relationships, and data without navigating the UI
2. **Plugin Validation**: Automated validation of plugin deployments with issue detection
3. **Workflow Analysis**: Inspect Power Automate flows and classic workflows to understand automation logic
4. **Documentation Generation**: Auto-generate entity documentation from metadata
5. **Quality Assurance**: Validate configurations, check dependencies, detect configuration issues
6. **Cross-Service Correlation**: Correlate PowerPlatform plugins with source code (GitHub Enterprise), deployment logs (Azure DevOps), and runtime telemetry (Application Insights)
7. **Production Monitoring**: Safe read-only access for troubleshooting and investigation

### Key Features (Read-Only)

- ✅ **Entity Metadata Access**: Read entity definitions, attributes, relationships, option sets
- ✅ **Record Querying**: Query records via OData with filters, joins, and pagination
- ✅ **Plugin Inspection**: View plugin assemblies, steps, images with automatic validation
- ✅ **Workflow & Flow Analysis**: Inspect Power Automate flows, classic workflows, and run history
- ✅ **Business Rules Inspection**: View business rules and their configurations
- ✅ **Form/View Metadata**: Read form and view definitions
- ✅ **Model-Driven App Inspection**: View app configurations and components
- ✅ **Web Resource Listing**: List and inspect web resources
- ✅ **Solution Analysis**: View solution components and dependencies
- ✅ **Formatted Prompts**: Human-readable reports for entities, plugins, flows, workflows
- ✅ **Dual Interface**: Both raw tools (JSON) and formatted prompts (markdown)
- ✅ **Production-Safe**: No write operations, no schema modifications, no data changes

**What This Package Cannot Do:**
- ❌ Create, update, or delete entities, attributes, or relationships
- ❌ Create, update, or delete records
- ❌ Modify forms, views, or business rules
- ❌ Publish customizations
- ❌ Import or export solutions
- ❌ Modify model-driven apps

**For these operations, see:**
- [PowerPlatform Customization Package](POWERPLATFORM_CUSTOMIZATION.md) - Schema modifications
- [PowerPlatform Data Package](POWERPLATFORM_DATA.md) - Record CRUD operations

### Supported Environments

- **Dynamics 365 Online**: All Dynamics 365 online environments (CRM, Sales, Service, etc.)
- **PowerPlatform**: All PowerPlatform environments with Dataverse
- **On-Premises**: Not supported (requires Dataverse Web API)
- **API Version**: Dataverse Web API v9.2 with OData 4.0

**Authentication**: Azure AD OAuth 2.0 (service principal/app registration)

---

## Detailed Setup

### Prerequisites

1. **PowerPlatform Environment**: Dynamics 365 or PowerPlatform environment with Dataverse
2. **Azure AD Tenant**: Access to Azure portal for app registration
3. **System Administrator Role**: To register app and grant permissions
4. **Environment URL**: Your environment's organization URL (e.g., `https://yourenvironment.crm.dynamics.com`)

### Azure AD App Registration

**Step 1: Create Azure AD App Registration**

1. Navigate to [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. Configure:
   - **Name**: "MCP PowerPlatform Integration" (or your preferred name)
   - **Supported account types**: "Accounts in this organizational directory only"
   - **Redirect URI**: Leave blank (not needed for service principal)
4. Click **Register**

**Step 2: Note Application Details**

After registration:
1. Copy **Application (client) ID** → This is your `POWERPLATFORM_CLIENT_ID`
2. Copy **Directory (tenant) ID** → This is your `POWERPLATFORM_TENANT_ID`

**Step 3: Create Client Secret**

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Configure:
   - **Description**: "MCP Integration Secret"
   - **Expires**: Choose expiration period (e.g., 24 months)
4. Click **Add**
5. **CRITICAL**: Copy the secret **Value** immediately → This is your `POWERPLATFORM_CLIENT_SECRET`
   - The secret value is only shown once
   - If you lose it, you must create a new secret

**Step 4: Configure API Permissions**

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Dynamics CRM** (or **Dataverse** if shown)
4. Select **Delegated permissions**
5. Check **user_impersonation**
6. Click **Add permissions**
7. Click **Grant admin consent for [Your Organization]**
   - Requires Global Administrator or Privileged Role Administrator
   - This step is CRITICAL - the app won't work without admin consent

**Step 5: Create Application User in PowerPlatform**

1. Navigate to PowerPlatform Admin Center: https://admin.powerplatform.microsoft.com
2. Select your environment
3. Go to **Settings** → **Users + permissions** → **Application users**
4. Click **New app user**
5. Configure:
   - Click **Add an app**
   - Search for and select your app registration (by name or client ID)
   - **Business unit**: Select appropriate business unit
   - **Security roles**: Assign required roles
     - **Recommended**: **Basic User** or custom **Read-only** role
     - For plugin trace logs: **System Administrator** (read-only subset)
6. Click **Create**

**Security Role Requirements (Read-Only Package):**

| Operation Type | Minimum Required Role | Privileges Needed |
|----------------|----------------------|-------------------|
| Read entity metadata | Basic User | Read Entity Metadata |
| Read records (query-records) | Basic User | Read on target entities |
| Read plugin assemblies/steps | Basic User | Read Plugin Assembly, Plugin Type, SDK Message Processing Step |
| Query plugin trace logs | System Administrator | Read Plugin Trace Log |
| Read workflows/flows | Basic User | Read Process (Workflow) |
| Read business rules | Basic User | Read Business Rules |
| Read forms/views | Basic User | Read Form, System Form |
| Read solutions | Basic User | Read Solution |

**Note:** This package requires **read-only access only**. Do not assign System Customizer or System Administrator roles unless plugin trace log access is needed.

### Environment Variables

Configure the following environment variables for the **read-only package**:

```bash
# PowerPlatform Configuration (Required for all modes)
POWERPLATFORM_URL=https://yourenvironment.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=your-azure-app-client-id
POWERPLATFORM_TENANT_ID=your-azure-tenant-id

# Optional: Client Secret (omit for interactive browser auth)
# If set: Uses service principal authentication (app identity)
# If NOT set: Uses interactive browser auth (user identity + SSO)
POWERPLATFORM_CLIENT_SECRET=your-azure-app-client-secret
```

**Environment Variable Details:**

| Variable | Required | Description |
|----------|----------|-------------|
| `POWERPLATFORM_URL` | Yes | Organization URL (e.g., `https://org.crm.dynamics.com`) |
| `POWERPLATFORM_CLIENT_ID` | Yes | Azure AD app registration client ID (GUID) |
| `POWERPLATFORM_TENANT_ID` | Yes | Azure tenant ID (GUID) |
| `POWERPLATFORM_CLIENT_SECRET` | **Optional** | Client secret. Omit for interactive browser auth (v23+) |

**Authentication Modes (v23+):**

| Mode | When Client Secret Is | Behavior |
|------|----------------------|----------|
| Interactive | NOT provided | Opens browser for Microsoft SSO. User's security roles apply. |
| Service Principal | Provided | Uses app identity. Best for automation. |

**Note:** This read-only package provides 38 tools for querying metadata, records, plugins, and workflows. For additional capabilities, install separate packages:
- [PowerPlatform Customization Package](POWERPLATFORM_CUSTOMIZATION.md) - Schema modifications (entities, attributes, relationships)
- [PowerPlatform Data Package](POWERPLATFORM_DATA.md) - Data CRUD operations (create, update, delete records)

**v21+ Security Model:** Install only the packages you need. No configuration flags required - package installation grants immediate access to operations.

**Regional Endpoints:**

Adjust `POWERPLATFORM_URL` based on your region:
- **North America**: `https://org.crm.dynamics.com`
- **Europe**: `https://org.crm4.dynamics.com`
- **Asia Pacific**: `https://org.crm5.dynamics.com`
- **Australia**: `https://org.crm6.dynamics.com`
- **Canada**: `https://org.crm3.dynamics.com`
- **UK**: `https://org.crm11.dynamics.com`
- **Government (GCC)**: `https://org.crm9.dynamics.com`

### Configuration Example

**Claude Desktop (`claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "powerplatform-readonly": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform", "mcp-pp"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "12345678-1234-1234-1234-123456789abc",
        "POWERPLATFORM_CLIENT_SECRET": "your-secret-value",
        "POWERPLATFORM_TENANT_ID": "87654321-4321-4321-4321-cba987654321"
      }
    }
  }
}
```

**VS Code MCP Extension (`settings.json`):**

```json
{
  "mcp.servers": {
    "powerplatform-readonly": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/powerplatform", "mcp-pp"],
      "env": {
        "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "12345678-1234-1234-1234-123456789abc",
        "POWERPLATFORM_CLIENT_SECRET": "your-secret-value",
        "POWERPLATFORM_TENANT_ID": "87654321-4321-4321-4321-cba987654321"
      }
    }
  }
}
```

**Local Development (`.env` file):**

```bash
# PowerPlatform Read-Only Package
POWERPLATFORM_URL=https://yourenvironment.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=12345678-1234-1234-1234-123456789abc
POWERPLATFORM_CLIENT_SECRET=your-secret-value
POWERPLATFORM_TENANT_ID=87654321-4321-4321-4321-cba987654321
```

---

## Interactive User Authentication Setup (v23+)

Version 23 introduces **browser-based interactive authentication**, allowing users to sign in with their own Microsoft Entra ID credentials. This provides:

- **User-level security**: User's Dynamics security roles apply (not app's roles)
- **SSO experience**: Leverages existing Microsoft login session
- **No secrets on client**: Uses PKCE, no client_secret required
- **Audit trail**: All operations logged under user's identity

### Tech Stack

| Component | Technology | Description |
|-----------|------------|-------------|
| **OAuth Library** | `@azure/msal-node` v3.x | Microsoft Authentication Library for Node.js |
| **Auth Flow** | Authorization Code + PKCE | Secure browser-based authentication |
| **Token Storage** | Custom encrypted cache | AES-256-GCM encrypted file |
| **Encryption** | `crypto.scryptSync` | Machine-specific key derivation |
| **Browser Launch** | `open` v10.x | Cross-platform browser opener |
| **Callback Server** | Node.js `http` | Temporary localhost server for OAuth callback |

### Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│ Claude      │────▶│ MCP Server      │────▶│ Dynamics 365 │
│ Desktop     │     │ (PowerPlatform) │     │ (API)        │
└─────────────┘     └────────┬────────┘     └──────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │ Token    │   │ HTTP     │   │ Browser  │
       │ Cache    │   │ Callback │   │ (SSO)    │
       │ (AES)    │   │ Server   │   │          │
       └──────────┘   └──────────┘   └──────────┘
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────┐
                    │ Microsoft Entra │
                    │ ID (OAuth 2.0)  │
                    └─────────────────┘
```

### Complete Setup Guide

#### Step 1: Configure Azure App Registration

Navigate to **Azure Portal** → **Entra ID** → **App registrations** → Select or create your app.

##### Authentication Tab

1. Click **Add a platform** → **Mobile and desktop applications**
2. Enter redirect URI: `http://localhost`
3. Set **Allow public client flows** to **Yes**
4. Click **Save**

##### API Permissions Tab

Add the following **Delegated** permissions:

| API | Permission | Purpose | Admin Consent |
|-----|------------|---------|---------------|
| **Dynamics CRM** | `user_impersonation` | Access CRM as the user | **Required** |
| Microsoft Graph | `offline_access` | Refresh token support | Recommended |
| Microsoft Graph | `User.Read` | Display user info | Optional |

> ⚠️ **Critical**: Click **"Grant admin consent for [Your Org]"** after adding permissions.
>
> Without admin consent, users will see an "Approval required" screen when they try to authenticate.

#### Step 2: Configure MCP Client

Add to your MCP client configuration **without** the `POWERPLATFORM_CLIENT_SECRET`:

**Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):**

```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform"],
      "env": {
        "POWERPLATFORM_URL": "https://yourorg.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "your-azure-app-client-id",
        "POWERPLATFORM_TENANT_ID": "your-azure-tenant-id"
      }
    }
  }
}
```

> **Note**: No `POWERPLATFORM_CLIENT_SECRET` means interactive auth is used.

#### Step 3: First Run

1. Restart Claude Desktop (Cmd+Q and relaunch)
2. Ask Claude to use any PowerPlatform tool (e.g., "List all entities")
3. Browser opens with Microsoft sign-in
4. If already signed into Microsoft (SSO), you'll see consent screen
5. Click **Accept** to grant permissions
6. Success page appears → close browser
7. Claude receives data from Dynamics

#### Step 4: Subsequent Runs

After first authentication:
- Tokens are cached for **~90 days** (refresh token lifetime)
- No browser prompt needed until refresh token expires
- Access tokens auto-refresh silently using cached refresh token

### Token Management

```bash
# View help and options
npx @mcp-consultant-tools/powerplatform --help

# Clear cached tokens (forces re-authentication)
npx @mcp-consultant-tools/powerplatform --logout

# Token cache location
~/.mcp-consultant-tools/token-cache-{clientId}.enc
```

### Security Considerations

| Aspect | Implementation |
|--------|---------------|
| **No secrets on user machines** | Public client flow uses PKCE, no client_secret |
| **Token encryption** | AES-256-GCM with machine-specific key |
| **File permissions** | Cache file: 600, directory: 700 |
| **Token scope** | Only Dynamics API access requested |
| **Refresh tokens** | ~90 day lifetime, auto-refresh until expiry |
| **Revocation** | Admin can revoke via Entra ID |
| **MFA** | Enforced by Entra ID Conditional Access policies |

### Comparison: Auth Modes

| Feature | Interactive User Auth | Service Principal |
|---------|----------------------|-------------------|
| **Config** | No client_secret | Requires client_secret |
| **Identity** | User's identity | App's identity |
| **Security roles** | User's Dynamics roles | App's assigned roles |
| **Audit trail** | User name in logs | App name in logs |
| **Best for** | Desktop apps, debugging | CI/CD, automation |
| **First run** | Opens browser | Transparent |
| **Token lifetime** | ~90 days (refresh) | Configurable secret expiry |

### Troubleshooting Interactive Auth

| Error | Cause | Solution |
|-------|-------|----------|
| `AADSTS650057: Invalid resource` | Missing Dynamics CRM permission | Add `user_impersonation` delegated permission |
| "Approval required" screen | No admin consent | Admin must click "Grant admin consent" |
| Browser doesn't open | Port blocked or `open` package issue | Check firewall, try `--logout` |
| "Authentication timed out" | User didn't complete sign-in within 5 minutes | Try again, complete faster |
| Token cache errors | Corrupted cache | Run `--logout` to clear cache |

---

## Tools (40 Total - Read-Only)

**⚠️ IMPORTANT: READ-ONLY PACKAGE DOCUMENTATION**

This package (`@mcp-consultant-tools/powerplatform`) provides **40 read-only tools** for querying and validating PowerPlatform environments. All tools are production-safe and perform **zero modifications**.

**Tools included in THIS package (read-only operations only):**
- ✅ All `get-*` tools (metadata, records, plugins, workflows, forms, views, etc.)
- ✅ All `query-*` tools (data queries)
- ✅ All `validate-*` tools (best practices, schema names, solution integrity)
- ✅ All `check-*` tools (dependencies, delete eligibility)
- ✅ `preview-unpublished-changes` (inspection only)

**Tools NOT in this package - Install separately:**
- ❌ **Data CRUD** (`create-record`, `update-record`, `delete-record`) → Install **[@mcp-consultant-tools/powerplatform-data](POWERPLATFORM_DATA.md)**
- ❌ **Schema Changes** (`create-entity`, `create-attribute`, `create-relationship`, etc.) → Install **[@mcp-consultant-tools/powerplatform-customization](POWERPLATFORM_CUSTOMIZATION.md)**

**Configuration: No flags required for read-only package**
- ✅ Only 4 environment variables needed: `POWERPLATFORM_URL`, `POWERPLATFORM_CLIENT_ID`, `POWERPLATFORM_CLIENT_SECRET`, `POWERPLATFORM_TENANT_ID`
- ❌ Ignore references to `POWERPLATFORM_ENABLE_CUSTOMIZATION`, `POWERPLATFORM_DEFAULT_SOLUTION`, or enable flags (not applicable to read-only package)

---

### Entity Metadata & Data Tools

#### get-entity-metadata

Get comprehensive metadata about a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity (e.g., "account", "contact")

**Returns:**
- Entity definition including primary key, display name, description
- Collection status (online/offline)
- Primary identifier and name attributes
- Ownership type

**Example:**
```javascript
await mcpClient.invoke("get-entity-metadata", {
  entityName: "account"
});
```

**Use Cases:**
- Understand entity schema before querying
- Verify entity ownership type for security role configuration
- Check if entity supports offline mode

---

#### get-entity-attributes

Get all attributes/fields of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Array of all attributes with:
  - Logical name
  - Display name
  - Data type
  - Required/optional status
  - Format information
  - Valid values for option sets

**Example:**
```javascript
await mcpClient.invoke("get-entity-attributes", {
  entityName: "account"
});
```

**Use Cases:**
- Discover available fields on an entity
- Understand field data types before creating records
- Identify required fields for forms
- Map fields for data migration

---

#### get-entity-attribute

Get details for a specific attribute/field of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `attributeName` (string, required): Logical name of the attribute

**Returns:**
- Detailed attribute information:
  - Data type and format
  - Min/max values or lengths
  - Option set values (if applicable)
  - Lookup target entities
  - Searchability and requirement status

**Example:**
```javascript
await mcpClient.invoke("get-entity-attribute", {
  entityName: "account",
  attributeName: "revenue"
});
```

**Use Cases:**
- Validate field constraints before data entry
- Understand option set values for picklists
- Determine lookup targets for relationship fields

---

#### get-entity-relationships

Get all relationships for a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- One-to-Many relationships
- Many-to-Many relationships
- Relationship schema names
- Referenced/referencing entity names
- Lookup attribute names

**Example:**
```javascript
await mcpClient.invoke("get-entity-relationships", {
  entityName: "account"
});
```

**Use Cases:**
- Understand entity relationship graph
- Identify parent/child relationships
- Plan data model extensions
- Troubleshoot relationship cascading behavior

---

#### get-global-option-set

Get a global option set definition.

**Parameters:**
- `optionSetName` (string, required): Name of the global option set

**Returns:**
- Option set name
- Display name
- All options with values and labels

**Example:**
```javascript
await mcpClient.invoke("get-global-option-set", {
  optionSetName: "industrycode"
});
```

**Use Cases:**
- Retrieve picklist values for form dropdowns
- Validate option values before updating records
- Document available choices for users

---

#### get-record

Get a specific record by entity name and ID.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `recordId` (string, required): GUID of the record
- `selectAttributes` (string, optional): Comma-separated list of attributes to retrieve

**Returns:**
- Record data with all or selected attributes

**Example:**
```javascript
await mcpClient.invoke("get-record", {
  entityName: "account",
  recordId: "00000000-0000-0000-0000-000000000000",
  selectAttributes: "name,revenue,industrycode"
});
```

**Use Cases:**
- Retrieve specific record details
- Verify record data after updates
- Debug data issues

---

#### query-records

Query records using OData filter expression.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `filter` (string, optional): OData $filter expression
- `select` (string, optional): Comma-separated list of attributes
- `orderby` (string, optional): Ordering expression
- `top` (number, optional): Maximum number of records to return

**Returns:**
- Array of matching records
- Total count

**Example:**
```javascript
await mcpClient.invoke("query-records", {
  entityName: "account",
  filter: "revenue gt 1000000 and statecode eq 0",
  select: "name,revenue,industrycode",
  orderby: "revenue desc",
  top: 50
});
```

**Use Cases:**
- Find records matching criteria
- Export data for reporting
- Verify data quality
- Count records by category

**Common OData Filters:**
- **Equality**: `name eq 'Contoso'`
- **Comparison**: `revenue gt 1000000`
- **Logical**: `statecode eq 0 and industrycode eq 1`
- **Contains**: `contains(name, 'Corp')`
- **Date**: `createdon gt 2025-01-01`

---

**Note:** For data CRUD operations (`create-record`, `update-record`, `delete-record`), see the separate **[@mcp-consultant-tools/powerplatform-data](POWERPLATFORM_DATA.md)** package.

---

### Plugin Registration & Validation Tools

#### get-plugin-assemblies

List all plugin assemblies in the environment.

**Parameters:**
- `includeManaged` (boolean, optional, default: false): Include managed plugin assemblies

**Returns:**
- Total count
- Array of assemblies with:
  - Assembly name
  - Version
  - Isolation mode (Sandbox/None)
  - Modified date and modifier
  - Culture and public key token

**Example:**
```javascript
await mcpClient.invoke("get-plugin-assemblies", {
  includeManaged: false
});
```

**Use Cases:**
- Discover deployed plugins
- Verify plugin versions after deployment
- Audit plugin registrations

---

#### get-plugin-assembly-complete

Get comprehensive plugin assembly information with automatic validation.

**Parameters:**
- `assemblyName` (string, required): Name of the plugin assembly
- `includeDisabled` (boolean, optional, default: false): Include disabled steps

**Returns:**
- Assembly metadata
- All plugin types (classes)
- All registered steps with:
  - Stage, mode, rank
  - Filtering attributes
  - Pre/Post images with attributes
  - SDK message and entity
- **Automatic validation warnings:**
  - Missing filtering attributes
  - Missing images
  - Disabled steps

**Example:**
```javascript
await mcpClient.invoke("get-plugin-assembly-complete", {
  assemblyName: "MyCompany.Plugins",
  includeDisabled: false
});
```

**Use Cases:**
- PR review for plugin deployments
- Validate plugin configuration
- Detect common mistakes (missing images, no filtering)
- Compare deployed vs source code

**Validation Checks:**
- ✅ **Filtering Attributes**: Update/Delete steps should have filteringattributes for performance
- ✅ **Pre/Post Images**: Update/Delete steps should have images to access original values
- ✅ **Disabled Steps**: Identifies disabled steps that won't execute
- ✅ **Sync vs Async**: Counts synchronous vs asynchronous steps

---

#### get-entity-plugin-pipeline

Get all plugins that execute on a specific entity, organized by message and execution order.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `messageFilter` (string, optional): Filter by SDK message (e.g., "Update", "Create", "Delete")

**Returns:**
- Plugins organized by:
  - SDK message type
  - Execution stage
  - Execution rank
- For each step:
  - Assembly name and version
  - Plugin type name
  - Mode (Sync/Async)
  - Filtering attributes
  - Pre/Post images

**Example:**
```javascript
await mcpClient.invoke("get-entity-plugin-pipeline", {
  entityName: "account",
  messageFilter: "Update"
});
```

**Use Cases:**
- Understand plugin execution order
- Troubleshoot plugin conflicts
- Document plugin dependencies
- Plan new plugin placement

---

#### get-plugin-trace-logs

Query plugin execution trace logs with filtering and exception parsing.

**Parameters:**
- `entityName` (string, optional): Filter by entity logical name
- `messageName` (string, optional): Filter by SDK message name
- `correlationId` (string, optional): Filter by correlation ID
- `exceptionOnly` (boolean, optional, default: false): Only return logs with exceptions
- `hoursBack` (number, optional, default: 24): How many hours back to search
- `maxRecords` (number, optional, default: 50): Maximum records to return

**Returns:**
- Array of trace logs with:
  - Execution timestamp
  - Entity and message names
  - Performance metrics
  - Parsed exception details:
    - Exception type
    - Message
    - Stack trace
  - Correlation ID

**Example:**
```javascript
await mcpClient.invoke("get-plugin-trace-logs", {
  entityName: "account",
  exceptionOnly: true,
  hoursBack: 24,
  maxRecords: 50
});
```

**Use Cases:**
- Troubleshoot plugin failures
- Identify performance bottlenecks
- Correlate exceptions with user reports
- Analyze plugin execution patterns

---

### Workflow & Power Automate Flow Tools

#### get-flows

List all Power Automate cloud flows (category = 5).

**Parameters:**
- `activeOnly` (boolean, optional, default: false): Only return activated flows

**Returns:**
- Array of flows with:
  - Flow name and ID
  - State (Draft/Activated/Suspended)
  - Owner and modifier
  - Primary entity
  - Trigger type
  - Modified date

**Example:**
```javascript
await mcpClient.invoke("get-flows", {
  activeOnly: true
});
```

**Use Cases:**
- Audit active automation
- Identify flow owners
- Document automation inventory

---

#### get-flow-definition

Get complete flow definition including JSON logic from clientdata field.

**Parameters:**
- `flowName` (string, required): Name of the flow

**Returns:**
- Flow metadata:
  - Name, ID, state
  - Owner and modifier
  - Primary entity
- Complete flow definition (JSON):
  - Triggers
  - Actions
  - Conditions
  - Connections

**Example:**
```javascript
await mcpClient.invoke("get-flow-definition", {
  flowName: "Lead Notification Flow"
});
```

**Use Cases:**
- Review flow logic
- Document automation workflows
- Export flow definitions
- Troubleshoot flow failures

---

#### get-flow-runs

Get flow run history with status, duration, and error details.

**Parameters:**
- `flowName` (string, required): Name of the flow
- `maxRecords` (number, optional, default: 100): Maximum number of runs to return

**Returns:**
- Array of flow runs with:
  - Run ID and timestamp
  - Status (Succeeded/Failed/Running/TimedOut/Cancelled/Faulted)
  - Start time, end time, duration
  - Trigger type
  - Error message and code (if failed)
  - Parsed JSON error details

**Example:**
```javascript
await mcpClient.invoke("get-flow-runs", {
  flowName: "Lead Notification Flow",
  maxRecords: 50
});
```

**Use Cases:**
- Monitor flow execution success rates
- Troubleshoot flow failures
- Analyze flow performance
- Track flow run patterns over time

---

#### get-flow-run-details

**NEW** - Get detailed action-level execution information for a specific flow run to verify which business logic steps were actually executed.

**Parameters:**
- `flowId` (string, required): The GUID of the flow (workflowid)
- `runId` (string, required): The GUID of the flow run (flowrunid) - obtain from `get-flow-runs`

**Returns:**
- Flow run metadata:
  - Flow ID, run ID, run name
  - Overall status (Succeeded/Failed/Running/etc.)
  - Start time, end time
- Trigger information:
  - Trigger name and status
  - Trigger execution timing
  - Links to inputs/outputs
- Detailed action execution:
  - **Each action's status** (Succeeded/Failed/Skipped)
  - Action start time, end time, duration
  - Action-level error information
  - Links to inputs/outputs for each action
- Action summary statistics:
  - Total actions
  - Succeeded count
  - Failed count
  - Skipped count (conditions evaluated false)

**Example:**
```javascript
// Step 1: Get recent runs
const runs = await mcpClient.invoke("get-flow-runs", {
  flowName: "Lead Notification Flow",
  maxRecords: 5
});

// Step 2: Get detailed execution for specific run
await mcpClient.invoke("get-flow-run-details", {
  flowId: "12345678-1234-1234-1234-123456789012",
  runId: runs.runs[0].flowrunid  // Use flowrunid from get-flow-runs
});
```

**Use Cases:**
- **Verify specific business logic execution** - "Did the Send Email action actually run?"
- **Debug conditional flows** - See which branch was taken, which actions were skipped
- **Analyze branching behavior** - Understand why certain actions didn't execute
- **Investigate action-level failures** - Get detailed error messages per action
- **Validate flow logic in production** - Confirm expected actions executed in the correct order
- **Troubleshoot complex flows** - See the exact execution path through conditions and switches

**Authentication Note:**
This tool uses the Power Automate Management API (not Dataverse). Your Azure AD app registration must have permissions to `https://management.azure.com` (Azure Service Management API). No additional environment variables required.

**Comparison with get-flow-runs:**
- **get-flow-runs**: High-level overview of multiple runs (statistics, monitoring)
- **get-flow-run-details**: Deep dive into single run (debugging, verification)

---

#### get-workflows

List all classic Dynamics workflows (category = 0).

**Parameters:**
- `activeOnly` (boolean, optional, default: false): Only return activated workflows

**Returns:**
- Array of workflows with:
  - Workflow name and ID
  - State (Draft/Activated/Suspended)
  - Mode (Background/Real-time)
  - Trigger events (Create/Update/Delete)
  - Primary entity
  - Owner and modifier

**Example:**
```javascript
await mcpClient.invoke("get-workflows", {
  activeOnly: true
});
```

**Use Cases:**
- Audit legacy workflows
- Plan migration to Power Automate
- Identify background vs real-time workflows

---

#### get-workflow-definition

Get complete workflow definition including XAML and trigger configuration.

**Parameters:**
- `workflowName` (string, required): Name of the workflow

**Returns:**
- Workflow metadata:
  - Name, ID, state
  - Mode (Background/Real-time)
  - Trigger events
  - Primary entity
- Complete XAML definition
- Trigger attributes
- Filtering attributes

**Example:**
```javascript
await mcpClient.invoke("get-workflow-definition", {
  workflowName: "Account Update Workflow"
});
```

**Use Cases:**
- Review workflow logic
- Document legacy automation
- Export workflow definitions

---

### Entity Customization Tools

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`**

#### create-entity

Create a new custom entity (table) in PowerPlatform.

**Parameters:**
- `schemaName` (string, required): Entity schema name (e.g., "sic_application")
- `displayName` (string, required): Display name
- `pluralDisplayName` (string, required): Plural display name
- `description` (string, optional): Entity description
- `ownershipType` (string, required): UserOwned, TeamOwned, or OrganizationOwned
- `hasActivities` (boolean, optional): Enable activities (default: false)
- `hasNotes` (boolean, optional): Enable notes (default: false)
- `isActivityParty` (boolean, optional): Can be activity party (default: false)
- `primaryAttributeSchemaName` (string, optional): Primary attribute name (default: "name")
- `primaryAttributeDisplayName` (string, optional): Primary attribute display name (default: "Name")
- `primaryAttributeMaxLength` (number, optional): Primary attribute max length (default: 850)
- `solutionUniqueName` (string, optional): Solution to add entity to

**Default Settings:**
- Activities: Disabled
- Notes: Disabled
- Duplicate detection: Disabled
- Mail merge: Disabled
- Primary column max length: 850 characters

**Returns:**
- Created entity metadata including MetadataId

**Example:**
```javascript
await mcpClient.invoke("create-entity", {
  schemaName: "sic_application",
  displayName: "Application",
  pluralDisplayName: "Applications",
  description: "Custom application entity",
  ownershipType: "UserOwned",
  hasActivities: true,
  hasNotes: true,
  solutionUniqueName: "MySolution"
});
```

**Note:** Remember to publish customizations after creation.

---

#### update-entity

Update existing entity metadata.

**Parameters:**
- `metadataId` (string, required): Entity MetadataId (GUID)
- `displayName` (string, optional): New display name
- `pluralDisplayName` (string, optional): New plural display name
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("update-entity", {
  metadataId: "12345678-1234-1234-1234-123456789012",
  displayName: "Updated Application",
  description: "Updated description"
});
```

---

#### update-entity-icon

Set or update entity icon using Fluent UI System Icons from Microsoft's official icon library.

**Parameters:**
- `entityLogicalName` (string, required): The logical name of the entity (e.g., 'sic_strikeaction')
- `iconFileName` (string, required): Fluent UI icon file name (e.g., 'people_community_24_filled.svg')
- `solutionUniqueName` (string, optional): Solution to add the web resource to

**Returns:**
- Entity details with web resource information
- Web resource ID and name
- Icon vector name

**Example:**
```javascript
await mcpClient.invoke("update-entity-icon", {
  entityLogicalName: "sic_strikeaction",
  iconFileName: "people_community_24_filled.svg",
  solutionUniqueName: "MCPTestCore"
});
```

**Icon Suggestions:**
- **Strike Action**: `people_community_24_filled.svg` (group/collective action)
- **Calendar/Period**: `calendar_24_filled.svg` (date ranges)
- **Contact**: `person_24_filled.svg` (individual person)
- **Account**: `building_24_filled.svg` (organization)
- **Alert/Case**: `alert_24_filled.svg` (alerts/warnings)

**Browse icons:** https://github.com/microsoft/fluentui-system-icons

**Note:** You must publish customizations after updating icons for changes to appear in the UI.

---

#### delete-entity

Delete a custom entity.

**Parameters:**
- `metadataId` (string, required): Entity MetadataId (GUID)

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("delete-entity", {
  metadataId: "12345678-1234-1234-1234-123456789012"
});
```

**Warning:** This permanently deletes the entity and all its data. Check dependencies first.

---

### Attribute Management Tools

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`**

#### create-attribute

Create a new attribute (column) on an entity. Supports 10 user-creatable attribute types.

**⚠️ IMPORTANT LIMITATIONS:**
1. **Local option sets are NOT SUPPORTED** - All Picklist/MultiSelectPicklist attributes MUST use global option sets
2. **Customer-type attributes CANNOT be created via SDK** - This is a Microsoft platform limitation. Use a standard Lookup to Account or Contact instead, or create manually via Power Apps maker portal

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `attributeType` (string, required): One of: String, Memo, Integer, Decimal, Money, DateTime, Boolean, Picklist, Lookup, Customer, MultiSelectPicklist, AutoNumber
- `schemaName` (string, required): Attribute schema name
- `displayName` (string, required): Display name
- `description` (string, optional): Description
- `isRequired` (string, optional): "None", "ApplicationRequired", or "SystemRequired"
- Type-specific parameters (see below)
- `solutionUniqueName` (string, optional): Solution to add attribute to

**Type-Specific Parameters:**

**String:**
- `maxLength` (number, required): Max length (1-4000)
- `format` (string, optional): "Email", "Text", "TextArea", "Url", "TickerSymbol", "PhoneticGuide", "VersionNumber", "Phone"

**Memo:**
- `maxLength` (number, required): Max length (1-1048576)

**Integer:**
- `minValue` (number, optional): Minimum value
- `maxValue` (number, optional): Maximum value

**Decimal:**
- `precision` (number, required): Total digits (1-10)
- `minValue` (number, optional): Minimum value
- `maxValue` (number, optional): Maximum value

**Money:**
- `precision` (number, required): Decimal places (0-4)
- `minValue` (number, optional): Minimum value
- `maxValue` (number, optional): Maximum value

**DateTime:**
- `dateTimeBehavior` (string, required): "UserLocal", "DateOnly", or "TimeZoneIndependent"
- `format` (string, optional): "DateOnly" or "DateAndTime"

**Boolean:**
- `defaultValue` (boolean, optional): Default value

**Picklist:**
- `globalOptionSetName` (string, optional): Name of existing global option set to reference
- `optionSetOptions` (array, optional): Options to create a NEW global option set automatically
  - **Simple format (RECOMMENDED)**: Array of strings - values auto-numbered 0, 1, 2, etc.
  - **Advanced format**: Array of {value: number, label: string} for custom values

**IMPORTANT:** All option sets are created as GLOBAL for consistency and reusability. Local option sets are NOT supported. Provide either `globalOptionSetName` (to use existing) OR `optionSetOptions` (to create new).

**Lookup:**
- `referencedEntity` (string, required): Target entity logical name

**Customer:**
- ⚠️ **NOT SUPPORTED VIA SDK** - Customer-type attributes cannot be created programmatically due to Microsoft API limitations
- **Workarounds:**
  1. Create manually via Power Apps maker portal
  2. Use a standard Lookup to Account or Contact instead
  3. Create separate lookup fields for each target entity (Account and Contact)

**MultiSelectPicklist:**
- `globalOptionSetName` (string, optional): Name of existing global option set to reference
- `optionSetOptions` (array, optional): Options to create a NEW global option set automatically
  - **Simple format (RECOMMENDED)**: Array of strings - values auto-numbered 0, 1, 2, etc.
  - **Advanced format**: Array of {value: number, label: string} for custom values

**Returns:**
- Created attribute metadata

**Example - String:**
```javascript
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "account",
  attributeType: "String",
  schemaName: "sic_customfield",
  displayName: "Custom Field",
  description: "A custom text field",
  maxLength: 100,
  solutionUniqueName: "MySolution"
});
```

**Example - Picklist (Use Existing Global Option Set):**
```javascript
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "account",
  attributeType: "Picklist",
  schemaName: "sic_status",
  displayName: "Status",
  globalOptionSetName: "sic_status"  // Reference existing global option set
});
```

**Example - Picklist (Create New Global Option Set - Simple):**
```javascript
// Simple format with auto-numbering from 0
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "account",
  attributeType: "Picklist",
  schemaName: "sic_priority",
  displayName: "Priority",
  optionSetOptions: ["Low", "Medium", "High", "Critical"]  // Values: 0, 1, 2, 3
  // Global option set named "sic_priority" will be created automatically
});
```

**Example - Picklist (Create New Global Option Set - Custom Values):**
```javascript
// Advanced format with custom values
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "account",
  attributeType: "Picklist",
  schemaName: "sic_customstatus",
  displayName: "Custom Status",
  optionSetOptions: [
    {value: 100, label: "Active"},
    {value: 200, label: "Inactive"},
    {value: 300, label: "Pending"}
  ]
  // Global option set named "sic_customstatus" will be created automatically
});
```

**Example - Lookup:**
```javascript
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "sic_application",
  attributeType: "Lookup",
  schemaName: "sic_parentaccount",
  displayName: "Parent Account",
  referencedEntity: "account"
});
```

---

#### update-attribute

Update existing attribute metadata. **Supports converting String attributes to AutoNumber type** by setting the `autoNumberFormat` parameter.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `attributeLogicalName` (string, required): Attribute logical name
- `displayName` (string, optional): New display name
- `description` (string, optional): New description
- `requiredLevel` (string, optional): Required level ("None", "Recommended", "ApplicationRequired")
- `autoNumberFormat` (string, optional): Auto-number format to convert String attribute to AutoNumber (see format details below)
- `solutionUniqueName` (string, optional): Solution context

**AutoNumber Format Placeholders:**
- `{SEQNUM:n}` - Sequential number with minimum length n (grows as needed)
- `{RANDSTRING:n}` - Random alphanumeric string (length 1-6 ONLY - API limitation)
- `{DATETIMEUTC:format}` - UTC timestamp with .NET DateTime format

**Examples:**
```javascript
// Convert primary name field to AutoNumber
await mcpClient.invoke("update-attribute", {
  entityLogicalName: "sic_strikeactionperiod",
  attributeLogicalName: "sic_name",
  autoNumberFormat: "SAP-{SEQNUM:5}",
  solutionUniqueName: "MCPTestCore"
});
// Result: SAP-00001, SAP-00002, SAP-00003...

// Complex format with date and random string
await mcpClient.invoke("update-attribute", {
  entityLogicalName: "incident",
  attributeLogicalName: "ticketnumber",
  autoNumberFormat: "CASE-{DATETIMEUTC:yyyyMMdd}-{SEQNUM:4}-{RANDSTRING:4}"
});
// Result: CASE-20250115-0001-A7K2, CASE-20250115-0002-B9M4...
```

**⚠️ IMPORTANT NOTES:**
- Converting to AutoNumber is **irreversible** - you cannot convert back to a regular String
- Existing values in the field will remain, but new records will use auto-generated values
- RANDSTRING length must be 1-6 (Dataverse API limitation)

**Returns:**
- Success confirmation with format details

---

#### delete-attribute

Delete an attribute from an entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `attributeMetadataId` (string, required): Attribute MetadataId (GUID)

**Returns:**
- Success confirmation

**Warning:** This permanently deletes the attribute and all its data.

---

#### create-global-optionset-attribute

Create a picklist attribute that uses a global option set.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `schemaName` (string, required): Attribute schema name
- `displayName` (string, required): Display name
- `globalOptionSetName` (string, required): Global option set name
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created attribute metadata

**Example:**
```javascript
await mcpClient.invoke("create-global-optionset-attribute", {
  entityLogicalName: "account",
  schemaName: "sic_industry",
  displayName: "Industry",
  globalOptionSetName: "sic_industrycodes"
});
```

---

### Relationship Management Tools

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`**

#### create-one-to-many-relationship

Create a one-to-many (1:N) relationship between entities.

**Parameters:**
- `schemaName` (string, required): Relationship schema name
- `referencedEntity` (string, required): Parent entity (1 side)
- `referencingEntity` (string, required): Child entity (N side)
- `lookupAttributeSchemaName` (string, required): Lookup field name on child entity
- `lookupAttributeDisplayName` (string, required): Lookup field display name
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created relationship metadata

**Example:**
```javascript
await mcpClient.invoke("create-one-to-many-relationship", {
  schemaName: "sic_account_application",
  referencedEntity: "account",
  referencingEntity: "sic_application",
  lookupAttributeSchemaName: "sic_parentaccount",
  lookupAttributeDisplayName: "Parent Account"
});
```

---

#### create-many-to-many-relationship

Create a many-to-many (N:N) relationship between entities.

**Parameters:**
- `schemaName` (string, required): Relationship schema name
- `entity1LogicalName` (string, required): First entity
- `entity2LogicalName` (string, required): Second entity
- `entity1NavigationPropertyName` (string, optional): Navigation property name
- `entity2NavigationPropertyName` (string, optional): Navigation property name
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created relationship metadata

**Example:**
```javascript
await mcpClient.invoke("create-many-to-many-relationship", {
  schemaName: "sic_application_contact",
  entity1LogicalName: "sic_application",
  entity2LogicalName: "contact"
});
```

---

#### update-relationship

Update relationship metadata (labels only - most properties are immutable).

**Parameters:**
- `metadataId` (string, required): Relationship MetadataId (GUID)
- `displayName` (string, optional): New display name

**Returns:**
- Success confirmation

---

#### delete-relationship

Delete a relationship.

**Parameters:**
- `metadataId` (string, required): Relationship MetadataId (GUID)

**Returns:**
- Success confirmation

---

### Global Option Set Tools

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`**

#### update-global-optionset

Update global option set metadata.

**Parameters:**
- `metadataId` (string, required): Option set MetadataId (GUID)
- `displayName` (string, optional): New display name
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

---

#### add-optionset-value

Add a new value to a global option set.

**Parameters:**
- `optionSetName` (string, required): Option set name
- `value` (number, required): Numeric value
- `label` (string, required): Display label
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Created option metadata

**Example:**
```javascript
await mcpClient.invoke("add-optionset-value", {
  optionSetName: "sic_industrycodes",
  value: 100000,
  label: "Technology"
});
```

---

#### update-optionset-value

Update an existing option set value label.

**Parameters:**
- `optionSetName` (string, required): Option set name
- `value` (number, required): Value to update
- `label` (string, required): New label
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

---

#### delete-optionset-value

Delete a value from an option set.

**Parameters:**
- `optionSetName` (string, required): Option set name
- `value` (number, required): Value to delete

**Returns:**
- Success confirmation

**Warning:** Removes the value from all records using it.

---

#### reorder-optionset-values

Reorder option set values to change their display order.

**Parameters:**
- `optionSetName` (string, required): Option set name
- `values` (array, required): Array of values in desired order
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("reorder-optionset-values", {
  optionSetName: "sic_priority",
  values: [3, 1, 2]  // High, Medium, Low
});
```

---

### Form Management Tools

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`**

#### create-form

Create a new form for an entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `name` (string, required): Form name
- `formType` (number, required): Form type code (2=Main, 7=QuickCreate, 6=QuickView, 11=Card)
- `formXml` (string, required): Form XML definition
- `description` (string, optional): Form description
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created form ID

**Example:**
```javascript
await mcpClient.invoke("create-form", {
  entityLogicalName: "account",
  name: "Custom Main Form",
  formType: 2,
  formXml: "<form>...</form>"
});
```

---

#### update-form

Update existing form XML and metadata.

**Parameters:**
- `formId` (string, required): Form ID (GUID)
- `name` (string, optional): New form name
- `formXml` (string, optional): New form XML
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

---

#### delete-form

Delete a form.

**Parameters:**
- `formId` (string, required): Form ID (GUID)

**Returns:**
- Success confirmation

---

#### activate-form

Activate a form to make it available for use.

**Parameters:**
- `formId` (string, required): Form ID (GUID)

**Returns:**
- Success confirmation

---

#### deactivate-form

Deactivate a form to hide it from users.

**Parameters:**
- `formId` (string, required): Form ID (GUID)

**Returns:**
- Success confirmation

---

#### get-forms

Get all forms for an entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- Array of forms with metadata

**Example:**
```javascript
await mcpClient.invoke("get-forms", {
  entityLogicalName: "account"
});
```

---

### View Management Tools

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`**

#### create-view

Create a new view (saved query) with FetchXML.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name
- `name` (string, required): View name
- `fetchXml` (string, required): FetchXML query
- `layoutXml` (string, required): Layout XML (columns)
- `queryType` (number, required): View type (0=Public, 64=Lookup)
- `description` (string, optional): View description
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created view ID

**Example:**
```javascript
await mcpClient.invoke("create-view", {
  entityLogicalName: "account",
  name: "Active Accounts",
  fetchXml: "<fetch><entity name='account'><filter><condition attribute='statecode' operator='eq' value='0'/></filter></entity></fetch>",
  layoutXml: "<grid><row><cell name='name'/><cell name='revenue'/></row></grid>",
  queryType: 0
});
```

---

#### update-view

Update existing view query and layout.

**Parameters:**
- `viewId` (string, required): View ID (GUID)
- `name` (string, optional): New view name
- `fetchXml` (string, optional): New FetchXML
- `layoutXml` (string, optional): New layout XML
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

---

#### delete-view

Delete a view.

**Parameters:**
- `viewId` (string, required): View ID (GUID)

**Returns:**
- Success confirmation

---

#### set-default-view

Set a view as the default view for its entity.

**Parameters:**
- `viewId` (string, required): View ID (GUID)

**Returns:**
- Success confirmation

---

#### get-view-fetchxml

Get the FetchXML from a specific view.

**Parameters:**
- `viewId` (string, required): View ID (GUID)

**Returns:**
- View metadata including FetchXML

---

#### get-views

Get all views for an entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- Array of views with metadata

---

### Business Rules Tools

#### get-business-rules

Get all business rules in the environment (read-only for troubleshooting).

**Parameters:**
- `activeOnly` (boolean, optional): Only return activated business rules (default: false)
- `maxRecords` (number, optional): Maximum number of business rules to return (default: 100)

**Returns:**
- List of business rules with basic information

**Note:** Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.

---

#### get-business-rule

Get the complete definition of a specific business rule including its XAML (read-only for troubleshooting).

**Parameters:**
- `workflowId` (string, required): Business rule ID (GUID)

**Returns:**
- Complete business rule information including XAML definition

**Note:** Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.

---

### Model-Driven App Tools

#### get-apps

Get all model-driven apps in the PowerPlatform environment.

**Parameters:**
- `activeOnly` (boolean, optional): Only return active apps (default: false)
- `maxRecords` (number, optional): Maximum number of apps to return (default: 100)

**Returns:**
- List of model-driven apps with:
  - App ID, name, unique name
  - Description and URL
  - State (Active/Inactive)
  - Publisher information
  - Published timestamp

**Example:**
```javascript
await mcpClient.invoke("get-apps", {
  activeOnly: true,
  maxRecords: 50
});
```

---

#### get-app

Get detailed information about a specific model-driven app.

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- Complete app information including:
  - Basic properties (name, unique name, description)
  - Navigation type (single/multi session)
  - Featured and default status
  - Publisher details
  - Created/modified timestamps

**Example:**
```javascript
await mcpClient.invoke("get-app", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

---

#### get-app-components

Get all components (entities, forms, views, sitemaps) in a model-driven app.

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- List of all components with:
  - Component ID and type
  - Grouped by type (Entity, Form, View, SiteMap, etc.)
  - Creation and modification timestamps

**Example:**
```javascript
await mcpClient.invoke("get-app-components", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

---

#### get-app-sitemap

Get the sitemap (navigation) configuration for a model-driven app.

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- Sitemap information including:
  - Sitemap name and ID
  - Sitemap XML structure
  - Configuration options (collapsible groups, show home, pinned, recents)
  - Managed status

**Example:**
```javascript
await mcpClient.invoke("get-app-sitemap", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

---

#### add-entities-to-app

Add entities to a model-driven app (automatically adds them to navigation).

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`**

**Parameters:**
- `appId` (string, required): App ID (GUID)
- `entityNames` (array of strings, required): Entity logical names to add (e.g., ["account", "contact"])

**Returns:**
- List of entities added
- Success message

**Example:**
```javascript
await mcpClient.invoke("add-entities-to-app", {
  appId: "12345678-1234-1234-1234-123456789abc",
  entityNames: ["account", "contact", "opportunity"]
});
```

**Important Notes:**
- Entities are validated before adding
- After adding entities, run validate-app
- Then publish-app to make changes live

---

#### validate-app

Validate a model-driven app before publishing (checks for missing components and configuration issues).

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- Validation success status
- List of validation issues (if any)
- Issue details (error type, message, component ID)

**Example:**
```javascript
await mcpClient.invoke("validate-app", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

**Common Issues:**
- Missing sitemap
- Entities without forms or views
- Invalid component references

---

#### publish-app

Publish a model-driven app to make it available to users (automatically validates first).

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true`**

**Parameters:**
- `appId` (string, required): App ID (GUID)

**Returns:**
- Success message
- Published app ID

**Example:**
```javascript
await mcpClient.invoke("publish-app", {
  appId: "12345678-1234-1234-1234-123456789abc"
});
```

**Important Notes:**
- App must pass validation before publishing
- Users need appropriate security roles to access the app
- Publishing makes changes visible to all users

---

### Web Resource Tools

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` (for create/update/delete)**

#### create-web-resource

Create a new web resource (JavaScript, CSS, HTML, images, etc.).

**Parameters:**
- `name` (string, required): Web resource name (must include prefix, e.g., "prefix_/scripts/file.js")
- `displayName` (string, required): Display name
- `webResourceType` (number, required): Type code (1=HTML, 2=CSS, 3=JS, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=XAP, 9=XSL, 10=ICO, 11=SVG, 12=RESX)
- `content` (string, required): Base64-encoded content
- `description` (string, optional): Description
- `solutionUniqueName` (string, optional): Solution to add to

**Returns:**
- Created web resource ID

**Example:**
```javascript
await mcpClient.invoke("create-web-resource", {
  name: "sic_/scripts/myfile.js",
  displayName: "My JavaScript File",
  webResourceType: 3,
  content: "ZnVuY3Rpb24gaGVsbG8oKSB7IGNvbnNvbGUubG9nKCdIZWxsbycpOyB9"  // Base64 of JS code
});
```

---

#### update-web-resource

Update web resource content or metadata.

**Parameters:**
- `webResourceId` (string, required): Web resource ID (GUID)
- `displayName` (string, optional): New display name
- `content` (string, optional): New base64-encoded content
- `description` (string, optional): New description
- `solutionUniqueName` (string, optional): Solution context

**Returns:**
- Success confirmation

**Note:** Remember to publish after updating.

---

#### delete-web-resource

Delete a web resource.

**Parameters:**
- `webResourceId` (string, required): Web resource ID (GUID)

**Returns:**
- Success confirmation

---

#### get-web-resource

Get web resource by ID.

**Parameters:**
- `webResourceId` (string, required): Web resource ID (GUID)

**Returns:**
- Web resource metadata and content

---

#### get-web-resources

Get web resources by name pattern.

**Parameters:**
- `nameFilter` (string, optional): Name filter (partial match)

**Returns:**
- Array of web resources

**Example:**
```javascript
await mcpClient.invoke("get-web-resources", {
  nameFilter: "sic_/scripts"
});
```

---

#### get-webresource-dependencies

Get dependencies for a web resource.

**Parameters:**
- `webResourceId` (string, required): Web resource ID (GUID)

**Returns:**
- Array of components that depend on this web resource

---

### Solution Management Tools

**⚠️ REQUIRES: `POWERPLATFORM_ENABLE_CUSTOMIZATION=true` (for create/update/delete operations)**

#### create-publisher

Create a new solution publisher.

**Parameters:**
- `uniqueName` (string, required): Publisher unique name
- `friendlyName` (string, required): Publisher friendly name
- `customizationPrefix` (string, required): Customization prefix (e.g., "sic")
- `description` (string, optional): Description

**Returns:**
- Created publisher ID

**Example:**
```javascript
await mcpClient.invoke("create-publisher", {
  uniqueName: "SmartImpactConsulting",
  friendlyName: "Smart Impact Consulting",
  customizationPrefix: "sic",
  description: "Our company publisher"
});
```

---

#### get-publishers

Get all publishers (excluding system publishers).

**Parameters:**
None

**Returns:**
- Array of publishers

---

#### create-solution

Create a new solution.

**Parameters:**
- `uniqueName` (string, required): Solution unique name
- `friendlyName` (string, required): Solution friendly name
- `publisherId` (string, required): Publisher ID (GUID)
- `version` (string, required): Version (e.g., "1.0.0.0")
- `description` (string, optional): Description

**Returns:**
- Created solution ID

**Example:**
```javascript
await mcpClient.invoke("create-solution", {
  uniqueName: "MyCustomSolution",
  friendlyName: "My Custom Solution",
  publisherId: "12345678-1234-1234-1234-123456789012",
  version: "1.0.0.0",
  description: "Custom solution for our app"
});
```

---

#### add-solution-component

Add a component to a solution.

**Parameters:**
- `solutionUniqueName` (string, required): Solution unique name
- `componentId` (string, required): Component ID (GUID)
- `componentType` (number, required): Component type code (1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=View, 29=Workflow, 60=SystemForm, 61=WebResource)
- `addRequiredComponents` (boolean, optional, default: true): Include required components

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("add-solution-component", {
  solutionUniqueName: "MyCustomSolution",
  componentId: "12345678-1234-1234-1234-123456789012",
  componentType: 1,  // Entity
  addRequiredComponents: true
});
```

---

#### remove-solution-component

Remove a component from a solution.

**Parameters:**
- `solutionUniqueName` (string, required): Solution unique name
- `componentId` (string, required): Component ID (GUID)
- `componentType` (number, required): Component type code

**Returns:**
- Success confirmation

---

#### export-solution

Export a solution as a zip file (base64-encoded).

**Parameters:**
- `solutionName` (string, required): Solution unique name
- `managed` (boolean, optional, default: false): Export as managed solution

**Returns:**
- Base64-encoded zip file

**Example:**
```javascript
const result = await mcpClient.invoke("export-solution", {
  solutionName: "MyCustomSolution",
  managed: false
});
// result.ExportSolutionFile contains base64-encoded zip
```

---

#### import-solution

Import a solution from a base64-encoded zip file.

**Parameters:**
- `customizationFile` (string, required): Base64-encoded solution zip
- `publishWorkflows` (boolean, optional, default: true): Activate workflows after import
- `overwriteUnmanagedCustomizations` (boolean, optional, default: false): Overwrite existing customizations

**Returns:**
- Import job ID

**Example:**
```javascript
await mcpClient.invoke("import-solution", {
  customizationFile: "UEsDBBQ...",  // Base64 zip content
  publishWorkflows: true,
  overwriteUnmanagedCustomizations: false
});
```

---

#### publish-customizations

Publish all pending customizations to make them active.

**Parameters:**
None

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("publish-customizations", {});
```

**Note:** This makes all unpublished entity, form, view, and other customizations active in the system.

---

#### publish-entity

Publish customizations for a specific entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- Success confirmation

**Example:**
```javascript
await mcpClient.invoke("publish-entity", {
  entityLogicalName: "account"
});
```

---

#### check-dependencies

Check what components depend on a specific component.

**Parameters:**
- `componentId` (string, required): Component ID (GUID)
- `componentType` (number, required): Component type code

**Returns:**
- Array of dependent components

**Example:**
```javascript
await mcpClient.invoke("check-dependencies", {
  componentId: "12345678-1234-1234-1234-123456789012",
  componentType: 1  // Entity
});
```

---

#### check-entity-dependencies

Check dependencies for a specific entity.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- Array of dependent components

---

#### check-delete-eligibility

Check if a component can be safely deleted.

**Parameters:**
- `componentId` (string, required): Component ID (GUID)
- `componentType` (number, required): Component type code

**Returns:**
- `canDelete` (boolean): Whether component can be deleted
- `dependencies` (array): List of blocking dependencies

**Example:**
```javascript
const result = await mcpClient.invoke("check-delete-eligibility", {
  componentId: "12345678-1234-1234-1234-123456789012",
  componentType: 1
});
if (result.canDelete) {
  // Safe to delete
}
```

---

#### get-entity-customization-info

Check if an entity is customizable and its managed state.

**Parameters:**
- `entityLogicalName` (string, required): Entity logical name

**Returns:**
- `IsCustomizable`: Whether entity can be customized
- `IsManaged`: Whether entity is managed
- `IsCustomEntity`: Whether entity is custom (not system)

---

#### validate-schema-name

Validate a schema name against naming rules.

**Parameters:**
- `schemaName` (string, required): Schema name to validate
- `prefix` (string, required): Required prefix

**Returns:**
- `valid` (boolean): Whether name is valid
- `errors` (array): List of validation errors

**Example:**
```javascript
const result = await mcpClient.invoke("validate-schema-name", {
  schemaName: "sic_application",
  prefix: "sic_"
});
if (!result.valid) {
  console.log("Errors:", result.errors);
}
```

---

#### preview-unpublished-changes

Preview all unpublished customizations in the environment.

**Parameters:**
None

**Returns:**
- List of components with unpublished changes

---

#### validate-solution-integrity

Validate a solution for missing dependencies and issues.

**Parameters:**
- `solutionUniqueName` (string, required): Solution unique name

**Returns:**
- `isValid` (boolean): Whether solution is valid
- `issues` (array): Missing dependencies
- `warnings` (array): Potential issues

**Example:**
```javascript
const result = await mcpClient.invoke("validate-solution-integrity", {
  solutionUniqueName: "MyCustomSolution"
});
if (!result.isValid) {
  console.log("Issues:", result.issues);
}
```

---

### Best Practice Validation Tools

#### validate-dataverse-best-practices

Validate Dataverse entities against internal best practices for column naming, prefixes, configuration, and entity icons.

**Purpose:** Automated validation of Dataverse schema against organizational standards to ensure consistency, maintainability, and compliance.

**Parameters:**
- `solutionUniqueName` (string, optional): Solution unique name to validate all entities in the solution
- `entityLogicalNames` (string[], optional): Specific entity logical names to validate (alternative to solution)
- `publisherPrefix` (string, required): Publisher prefix for naming convention checks (e.g., "sic_")
- `recentDays` (number, optional): Only validate columns created in last N days (default: 30, 0 = all)
- `includeRefDataTables` (boolean, optional): Include RefData tables in validation (default: true)
- `rules` (string[], optional): Specific rules to validate (default: all rules)
  - `"prefix"`: Publisher prefix compliance
  - `"lowercase"`: Schema name casing (LogicalName must be lowercase)
  - `"lookup"`: Lookup naming convention (must end with "id")
  - `"optionset"`: Option set scope (all must be global, not local)
  - `"required-column"`: Required column existence (e.g., `updatedbyprocess`)
  - `"entity-icon"`: Entity icon assignment (custom entities should have icons)
- `maxEntities` (number, optional): Maximum entities to validate (default: 0 = unlimited, use for testing/performance)
- `requiredColumns` (string[], optional): **NEW v20.1** List of required column schema names to check for. Use `{prefix}` placeholder which will be replaced with `publisherPrefix` at runtime. Default: `["{prefix}updatedbyprocess"]`. **Use Case:** Enforce SQL timestamp columns for bi-directional sync: `["{prefix}sqlcreatedon", "{prefix}sqlmodifiedon"]` or any other custom required columns. Skips RefData tables.

**Returns:**
- Comprehensive JSON object with:
  - `metadata`: Generation timestamp, solution info, publisher prefix, execution time
  - `summary`: Total entities/attributes checked, violation counts by severity
  - `violationsSummary`: **⭐ Complete lists of all affected tables and columns grouped by rule**
    - `rule`: Rule name (e.g., "Required Column Existence")
    - `severity`: "MUST" (critical) or "SHOULD" (warning)
    - `totalCount`: Total violations for this rule
    - `affectedEntities`: Complete list of entity logical names with entity-level violations
    - `affectedColumns`: Complete list of "entity.column" pairs with column-level violations
    - `action`: Recommended action to fix violations
    - `recommendation`: Explanation of why this is important
  - `entities`: Per-entity detailed breakdown with individual violations
  - `statistics`: Excluded system columns, old columns, RefData tables skipped

**Validation Rules:**

| Rule | Severity | Checks | Example Violation |
|------|----------|--------|-------------------|
| **Publisher Prefix** | MUST | All custom entities/attributes start with publisher prefix | Column `emailaddress` missing `sic_` prefix |
| **Schema Name Casing** | MUST | SchemaName uses PascalCase, LogicalName uses lowercase | LogicalName `sic_ContactId` should be `sic_contactid` |
| **Lookup Naming** | MUST | Lookup columns named `{prefix}_{entityname}id` | Lookup `sic_contact` should be `sic_contactid` |
| **Option Set Scope** | MUST | ALL option sets are global (not local) | Local option set on `sic_status` should be global |
| **Required Column** | MUST | Specified columns exist on non-RefData tables (default: `{prefix}updatedbyprocess`, customizable via `requiredColumns` parameter) | Entity `sic_member` missing `sic_sqlcreatedon` |
| **Entity Icon** | SHOULD | Custom entities have icons assigned | Entity `sic_strikeaction` has no icon |

**Key Feature: Complete Affected Lists**

The `violationsSummary` field provides immediate access to complete lists of all affected entities and columns:

```json
{
  "violationsSummary": [
    {
      "rule": "Required Column Existence",
      "severity": "MUST",
      "totalCount": 41,
      "affectedEntities": [
        "sic_strikeaction",
        "sic_strikeperiod",
        "sic_member",
        // ... all 41 entities listed
      ],
      "affectedColumns": [],
      "action": "Create column with Display Name \"Updated by process\"...",
      "recommendation": "This field is required for audit tracking..."
    }
  ]
}
```

**Use Cases:**
- **Pre-Deployment Validation**: Catch naming convention violations before deploying to production
- **Compliance Auditing**: Ensure all entities follow organizational standards
- **Quality Gates**: Automated checks in CI/CD pipelines
- **Technical Debt Identification**: Find entities that need refactoring
- **Onboarding**: Generate reports showing entities that don't meet standards

**Example 1: Validate entire solution**
```typescript
const result = await service.validateBestPractices(
  "MyCustomSolution",    // Solution unique name
  undefined,              // All entities in solution
  "sic_",                 // Publisher prefix
  30,                     // Columns created in last 30 days
  true,                   // Include RefData tables
  ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'],
  0                       // No entity limit
);

// Access complete lists
for (const violation of result.violationsSummary) {
  console.log(`${violation.rule}: ${violation.totalCount} violations`);
  console.log(`Affected tables: ${violation.affectedEntities.join(', ')}`);
  console.log(`Affected columns: ${violation.affectedColumns.join(', ')}`);
}
```

**Example 2: Validate specific entities**
```typescript
const result = await service.validateBestPractices(
  undefined,                               // No solution filter
  ['sic_strikeaction', 'sic_member'],      // Specific entities
  "sic_",                                  // Publisher prefix
  0,                                       // All columns (no date filter)
  true,                                    // Include RefData
  ['required-column', 'entity-icon'],      // Only check these rules
  0                                        // No entity limit
);
```

**Example 3: Test performance with entity limit**
```typescript
const result = await service.validateBestPractices(
  "LargeSolution",       // Solution with 200+ entities
  undefined,              // All entities
  "sic_",
  30,
  true,
  ['prefix'],             // Only check prefix rule (fastest)
  10                      // Limit to first 10 entities (for testing)
);
```

**Example 4: Validate custom required columns (SQL timestamps)**
```typescript
const result = await service.validateBestPractices(
  "MyCustomSolution",
  undefined,
  "sic_",
  0,                      // All columns
  true,
  ['required-column'],    // Only check required columns
  0,                      // No entity limit
  ['{prefix}sqlcreatedon', '{prefix}sqlmodifiedon', '{prefix}updatedbyprocess']  // Custom required columns
);

// Check which entities are missing SQL timestamp columns
for (const violation of result.violationsSummary) {
  if (violation.rule === 'Required Column Existence') {
    console.log(`Missing columns: ${violation.affectedEntities.length} entities`);
    console.log(`Tables: ${violation.affectedEntities.join(', ')}`);
  }
}
```

**Use Case: Bi-Directional Sync with SQL Database**

When syncing Dataverse with SQL databases, you need `sqlcreatedon` and `sqlmodifiedon` columns to track when records were created/modified in SQL. Use the `requiredColumns` parameter to validate all tables have these columns:

```typescript
// Validate all entities have SQL timestamp columns for bi-directional sync
const result = await service.validateBestPractices(
  undefined,                                                    // All entities
  ['sic_member', 'sic_strikeaction', 'sic_application'],       // Specific entities
  "sic_",
  0,
  false,                                                        // Skip RefData tables
  ['required-column'],
  0,
  ['{prefix}sqlcreatedon', '{prefix}sqlmodifiedon']            // SQL timestamp columns
);
```

**Performance:**
- Typical execution: 200-500ms per entity
- Date filtering significantly improves performance (fewer attributes to check)
- Rule selection allows targeted validation
- System columns automatically excluded
- Option set validation requires additional API calls (slower)

**Output Summary:**
```
Validation Complete: 49 entities checked
Total Violations: 77 (41 critical, 36 warnings)
Compliant Entities: 2/49
Execution Time: 11,542ms
```

---

## Prompts (11 Total)

### Entity Prompts

#### entity-overview

Comprehensive overview of a PowerPlatform entity.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - Entity description and purpose
  - Key fields and their meanings
  - Relationship summary
  - Common usage patterns

**Use Cases:**
- Onboarding new developers to an entity
- Documenting custom entities
- Understanding system entities

---

#### attribute-details

Detailed information about a specific entity attribute.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `attributeName` (string, required): Logical name of the attribute

**Returns:**
- Formatted markdown with:
  - Attribute purpose and description
  - Data type with examples
  - Valid values or ranges
  - Usage notes and best practices

**Use Cases:**
- Understanding field constraints
- Documenting custom attributes
- Training users on field usage

---

#### query-template

OData query template for an entity with example filters.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - Basic query structure
  - Common filter patterns
  - Ordering and pagination examples
  - Field selection recommendations

**Use Cases:**
- Learning OData query syntax
- Building custom queries
- Optimizing query performance

---

#### relationship-map

Visual map of entity relationships.

**Parameters:**
- `entityName` (string, required): Logical name of the entity

**Returns:**
- Formatted markdown with:
  - One-to-Many relationships (parent → children)
  - Many-to-Many relationships
  - Related entity purposes
  - Relationship navigation examples

**Use Cases:**
- Understanding data model
- Planning entity extensions
- Documenting entity connections

---

### Plugin Prompts

#### plugin-deployment-report

Comprehensive deployment report for a plugin assembly with validation warnings.

**Parameters:**
- `assemblyName` (string, required): Name of the plugin assembly

**Returns:**
- Formatted markdown report with:
  - Assembly information (version, isolation, modified by)
  - All registered steps organized by entity and message
  - Validation results:
    - ✓ Checkmarks for valid configuration
    - ⚠ Warnings for potential issues
  - Detailed issue descriptions

**Use Case:** PR reviews for plugin deployments

**Example Report:**
```markdown
# Plugin Deployment Report: MyCompany.Plugins

## Assembly Information
- **Version**: 1.0.0.0
- **Isolation Mode**: Sandbox
- **Modified**: 2025-01-07 by John Doe

## Registered Steps (8)

### Account - Update
1. ✅ **PreValidation - UpdateAccountPlugin**
   - Rank: 10
   - Mode: Synchronous
   - Filtering: name, revenue
   - PreImage: ✅ "PreImage" (name, revenue, statecode)

2. ⚠ **PreOperation - CalculateRevenuePlugin**
   - Rank: 20
   - Mode: Synchronous
   - **WARNING**: No filtering attributes (performance impact)
   - **WARNING**: No pre-image configured

## Validation Summary
- ✅ 6 steps configured correctly
- ⚠ 2 potential issues detected

## Recommendations
1. Add filtering attributes to CalculateRevenuePlugin
2. Add pre-image to CalculateRevenuePlugin for field comparison
```

---

#### entity-plugin-pipeline-report

Visual execution pipeline showing all plugins for an entity in order.

**Parameters:**
- `entityName` (string, required): Logical name of the entity
- `messageFilter` (string, optional): Filter by SDK message

**Returns:**
- Formatted markdown with:
  - Plugins grouped by message type
  - Execution order by stage and rank
  - Mode indicators (Sync/Async)
  - Filtering attributes
  - Image configuration
  - Assembly versions

**Use Case:** Understanding plugin execution flow

**Example Report:**
```markdown
# Plugin Pipeline: Account

## Update Message

### PreValidation Stage
1. **Rank 10** - UpdateAccountPlugin (MyCompany.Plugins v1.0.0.0)
   - Mode: Synchronous
   - Filtering: name, revenue
   - PreImage: "PreImage" (name, revenue, statecode)

### PreOperation Stage
1. **Rank 10** - ValidateAccountDataPlugin (MyCompany.Plugins v1.0.0.0)
   - Mode: Synchronous
   - Filtering: (none)
   - Images: (none)

2. **Rank 20** - EnrichAccountDataPlugin (MyCompany.Plugins v1.0.0.0)
   - Mode: Synchronous
   - Filtering: industrycode
   - PreImage: "PreImage" (industrycode)

### PostOperation Stage
1. **Rank 10** - NotifyExternalSystemPlugin (MyCompany.Plugins v1.0.0.0)
   - Mode: Asynchronous
   - Filtering: statecode
   - PostImage: "PostImage" (all attributes)
```

---

### Workflow & Flow Prompts

#### flows-report

Comprehensive report of all Power Automate flows grouped by state.

**Parameters:** None

**Returns:**
- Formatted markdown with:
  - Flows grouped by state (Activated/Draft/Suspended)
  - Flow names and owners
  - Primary entities
  - Trigger types
  - Last modified dates

**Use Cases:**
- Audit automation inventory
- Identify inactive flows
- Plan cleanup activities

---

#### workflows-report

Comprehensive report of all classic Dynamics workflows grouped by state.

**Parameters:** None

**Returns:**
- Formatted markdown with:
  - Workflows grouped by state
  - Execution modes (Background/Real-time)
  - Trigger events
  - Primary entities
  - Owners and modified dates

**Use Cases:**
- Document legacy workflows
- Plan migration to Power Automate
- Identify background processes

---

#### business-rules-report

Comprehensive report of all business rules grouped by state (read-only for troubleshooting).

**Parameters:**
- `activeOnly` (string, optional): Set to 'true' to only include activated business rules (default: false)

**Returns:**
- Formatted markdown with:
  - Business rules grouped by state (Active, Draft, Suspended)
  - Primary entities
  - Owners and modified dates
  - Note about read-only access

**Note:** Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.

---

### Best Practice Validation Prompts

#### dataverse-best-practices-report

Generate formatted markdown report from Dataverse best practice validation results.

**Purpose:** Transform raw validation JSON into human-readable markdown report with complete affected entity lists, severity-based grouping, and actionable recommendations.

**Parameters:**
- `validationResult` (string, required): JSON result from `validate-dataverse-best-practices` tool (stringify the JSON object)

**Returns:**
- Comprehensive markdown report with:
  - **Header**: Solution name, generation timestamp, publisher prefix, time filter
  - **Summary Table**: Entities checked, attributes checked, total violations, critical/warnings breakdown, compliant entities
  - **Overall Status**: ✅ All Compliant or ⚠️ Issues Found
  - **📋 Violations Summary (Complete Lists)**: **⭐ Most Important Section**
    - Groups all violations by rule type
    - Shows **complete list of ALL affected tables** (for entity-level violations like missing `updatedbyprocess`, no icons)
    - Shows **complete list of ALL affected columns** (for column-level violations like incorrect naming)
    - Displays severity icons (🔴 for MUST, ⚠️ for SHOULD)
    - Includes recommended actions and explanations for each rule
  - **🔴 Critical Violations (MUST Fix)**: Per-entity detailed breakdown with specific fixes
  - **⚠️ Warnings (SHOULD Fix)**: Per-entity recommendations for improvements
  - **✅ Compliant Entities**: List of entities with no violations
  - **Exclusions**: System columns excluded, old columns excluded, RefData tables skipped
  - **Execution Statistics**: Performance metrics and timing

**Example Output Structure:**
```markdown
# Dataverse Best Practice Validation Report

**Solution**: AOPCore (AOPCore)
**Generated**: 2025-01-13 10:30 AM
**Publisher Prefix**: sic_
**Time Filter**: Columns created in last 30 days

## Summary
| Metric | Count |
|--------|-------|
| Entities Checked | 49 |
| Attributes Checked | 44 |
| **Total Violations** | **77** |
| Critical (MUST) | 41 |
| Warnings (SHOULD) | 36 |
| Compliant Entities | 2 |

**Overall Status**: ⚠️ Issues Found

---

## 📋 Violations Summary (Complete Lists)

### 🔴 Required Column Existence (MUST)
**Affected Items**: 41

**Affected Tables**: `sic_strikeaction`, `sic_strikeperiod`, `sic_member`, `sic_organization`, `sic_contact`, `sic_case`, `sic_task`, `sic_activity`, `sic_document`, `sic_note`, `sic_email`, `sic_phone`, `sic_appointment`, `sic_meeting`, `sic_event`, `sic_project`, `sic_milestone`, `sic_deliverable`, `sic_resource`, `sic_allocation`, `sic_budget`, `sic_expense`, `sic_invoice`, `sic_payment`, `sic_contract`, `sic_agreement`, `sic_proposal`, `sic_quote`, `sic_order`, `sic_orderitem`, `sic_product`, `sic_pricelist`, `sic_discount`, `sic_campaign`, `sic_lead`, `sic_opportunity`, `sic_competitor`, `sic_partner`, `sic_vendor`, `sic_supplier`, `sic_manufacturer`

**Recommended Action**: Create column with Display Name "Updated by process", Schema Name "sic_updatedbyprocess", Type: Text (4000 chars), Description: "This field is updated, each time an automated process updates this record."

**Why**: This field is required for audit tracking of automated process updates.

### 🔴 Lookup Naming Convention (MUST)
**Affected Items**: 2

**Affected Columns**: `sic_examsponsor.sic_exam`, `sic_examsponsor.sic_examsponsor`

**Recommended Action**: Rename column to add "id" suffix

**Why**: Lookup columns must follow {prefix}_{entityname}id naming convention

### ⚠️ Entity Icon (SHOULD)
**Affected Items**: 36

**Affected Tables**: `sic_strikeaction`, `sic_strikeperiod`, `sic_member`, `sic_organization`, `sic_contact`, `sic_case`, `sic_task`, `sic_activity`, `sic_document`, `sic_note`, `sic_email`, `sic_phone`, `sic_appointment`, `sic_meeting`, `sic_event`, `sic_project`, `sic_milestone`, `sic_deliverable`, `sic_resource`, `sic_allocation`, `sic_budget`, `sic_expense`, `sic_invoice`, `sic_payment`, `sic_contract`, `sic_agreement`, `sic_proposal`, `sic_quote`, `sic_order`, `sic_orderitem`, `sic_product`, `sic_pricelist`, `sic_discount`, `sic_campaign`, `sic_lead`, `sic_opportunity`

**Recommended Action**: Assign a Fluent UI icon using the update-entity-icon tool. Example: update-entity-icon with entityLogicalName="sic_strikeaction" and an appropriate icon file.

**Why**: Custom icons improve entity recognition in Model-Driven Apps and enhance user experience. Use Fluent UI System Icons for consistency with Microsoft design language.

---

## 🔴 Critical Violations (MUST Fix)
[Per-entity detailed breakdown...]

## ⚠️ Warnings (SHOULD Fix)
[Per-entity detailed breakdown...]

## ✅ Compliant Entities
- **Topic Channel RefData** (`sic_ref_TopicChannel`) - 0 columns checked (RefData table)
- **Event Cancellation Request** (`sic_eventcancellationrequest`) - 3 columns checked

---

## Exclusions
- System columns excluded: 1,515
- Columns older than 30 days: 333
- RefData tables (updatedbyprocess check skipped): 1

**Execution Time**: 11,542ms
```

**Use Cases:**
- **Executive Reports**: Share validation results with stakeholders in readable format
- **Code Reviews**: Include in PR descriptions to show schema compliance
- **Documentation**: Generate best practices documentation for wikis
- **CI/CD Output**: Display validation results in build pipelines
- **Quality Gates**: Human-readable reports for approval workflows

**Example:**
```typescript
// Step 1: Run validation
const validationResult = await service.validateBestPractices(
  "AOPCore",
  undefined,
  "sic_",
  30,
  true,
  ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'],
  0
);

// Step 2: Generate markdown report
const prompt = await getPrompt("dataverse-best-practices-report");
const report = await prompt.execute({
  validationResult: JSON.stringify(validationResult)
});

console.log(report);  // Formatted markdown report
```

**Key Benefit: Complete Affected Lists**

Unlike per-entity breakdowns, this report shows **ALL affected entities at once** in the Violations Summary section:
- Easily copy-paste entity names for bulk operations
- Quick scanning to identify scope of work
- AI assistants can accurately report: "41 entities are missing `sic_updatedbyprocess`: `sic_strikeaction`, `sic_strikeperiod`, ..."
- No need to manually aggregate violations across entities

---

## Usage Examples

### Entity Exploration

**Scenario:** You need to understand the Account entity schema before building a custom integration.

```javascript
// 1. Get entity overview
const overview = await mcpClient.invoke("entity-overview", {
  entityName: "account"
});
console.log(overview);
// Shows: entity purpose, key fields, relationships

// 2. List all attributes
const attributes = await mcpClient.invoke("get-entity-attributes", {
  entityName: "account"
});
console.log(`Found ${attributes.length} attributes`);

// 3. Get specific attribute details
const revenueDetails = await mcpClient.invoke("get-entity-attribute", {
  entityName: "account",
  attributeName: "revenue"
});
console.log(`Revenue field:`, revenueDetails);
// Shows: data type (Money), min/max values, precision

// 4. Understand relationships
const relationships = await mcpClient.invoke("get-entity-relationships", {
  entityName: "account"
});
console.log(`1:N relationships: ${relationships.oneToMany.length}`);
console.log(`N:N relationships: ${relationships.manyToMany.length}`);

// 5. Query records
const records = await mcpClient.invoke("query-records", {
  entityName: "account",
  filter: "revenue gt 1000000 and statecode eq 0",
  select: "name,revenue,industrycode",
  orderby: "revenue desc",
  top: 10
});
console.log(`Top 10 accounts by revenue:`, records);
```

---

### Plugin Validation

**Scenario:** You're reviewing a plugin deployment PR and need to validate the configuration.

```javascript
// 1. List all plugin assemblies
const assemblies = await mcpClient.invoke("get-plugin-assemblies", {
  includeManaged: false
});
console.log(`Found ${assemblies.length} custom plugin assemblies`);

// 2. Get complete plugin information with validation
const pluginDetails = await mcpClient.invoke("get-plugin-assembly-complete", {
  assemblyName: "MyCompany.Plugins",
  includeDisabled: false
});
console.log(`Plugin types: ${pluginDetails.pluginTypes.length}`);
console.log(`Registered steps: ${pluginDetails.steps.length}`);

// Check validation warnings
if (pluginDetails.potentialIssues && pluginDetails.potentialIssues.length > 0) {
  console.warn(`⚠ ${pluginDetails.potentialIssues.length} validation issues:`);
  pluginDetails.potentialIssues.forEach(issue => console.warn(`  - ${issue}`));
}

// 3. Generate deployment report for PR
const deploymentReport = await mcpClient.invoke("plugin-deployment-report", {
  assemblyName: "MyCompany.Plugins"
});
console.log(deploymentReport);
// Post this report as PR comment

// 4. Check specific entity's plugin pipeline
const pipeline = await mcpClient.invoke("entity-plugin-pipeline-report", {
  entityName: "account",
  messageFilter: "Update"
});
console.log(pipeline);
// Shows execution order, identifies conflicts

// 5. Query recent plugin errors
const errors = await mcpClient.invoke("get-plugin-trace-logs", {
  entityName: "account",
  exceptionOnly: true,
  hoursBack: 24,
  maxRecords: 10
});
console.log(`Recent plugin errors: ${errors.length}`);
errors.forEach(error => {
  console.error(`${error.timestamp}: ${error.exceptionType} - ${error.exceptionMessage}`);
});
```

---

### Entity Customization Workflows

**Scenario 1: Create Custom Entity with Attributes**

```javascript
// Enable customization first!
// POWERPLATFORM_ENABLE_CUSTOMIZATION=true

// 1. Create publisher (one-time setup)
const publisher = await mcpClient.invoke("create-publisher", {
  uniqueName: "MyCompany",
  friendlyName: "My Company",
  customizationPrefix: "myco",
  description: "My Company Publisher"
});
console.log(`Publisher created: ${publisher.publisherid}`);

// 2. Create solution
const solution = await mcpClient.invoke("create-solution", {
  uniqueName: "MyCustomSolution",
  friendlyName: "My Custom Solution",
  publisherId: publisher.publisherid,
  version: "1.0.0.0",
  description: "My custom solution"
});
console.log(`Solution created: ${solution.solutionid}`);

// 3. Create custom entity
const entity = await mcpClient.invoke("create-entity", {
  schemaName: "myco_application",
  displayName: "Application",
  pluralDisplayName: "Applications",
  description: "Custom application tracking entity",
  ownershipType: "UserOwned",
  hasActivities: true,
  hasNotes: true,
  solutionUniqueName: "MyCustomSolution"
});
console.log(`Entity created: ${entity.MetadataId}`);

// 4. Add string attribute
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "myco_application",
  attributeType: "String",
  schemaName: "myco_applicantname",
  displayName: "Applicant Name",
  description: "Name of the applicant",
  maxLength: 200,
  isRequired: "ApplicationRequired",
  solutionUniqueName: "MyCustomSolution"
});

// 5. Add picklist attribute with new global option set
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "myco_application",
  attributeType: "Picklist",
  schemaName: "myco_status",
  displayName: "Status",
  description: "Application status",
  optionSetOptions: ["Draft", "Submitted", "Under Review", "Approved", "Rejected"],
  solutionUniqueName: "MyCustomSolution"
});
// Global option set "myco_status" auto-created with values 0-4

// 6. Add lookup to Account
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "myco_application",
  attributeType: "Lookup",
  schemaName: "myco_accountid",
  displayName: "Related Account",
  description: "Account associated with this application",
  referencedEntity: "account",
  solutionUniqueName: "MyCustomSolution"
});

// 7. Add date attribute
await mcpClient.invoke("create-attribute", {
  entityLogicalName: "myco_application",
  attributeType: "DateTime",
  schemaName: "myco_submissiondate",
  displayName: "Submission Date",
  description: "Date application was submitted",
  dateTimeBehavior: "DateOnly",
  solutionUniqueName: "MyCustomSolution"
});

// 8. Set entity icon
await mcpClient.invoke("update-entity-icon", {
  entityLogicalName: "myco_application",
  iconFileName: "document_text_24_filled.svg",
  solutionUniqueName: "MyCustomSolution"
});

// 9. Publish customizations
await mcpClient.invoke("publish-customizations", {});
console.log("✅ Entity and attributes published!");
```

**Scenario 2: Create Model-Driven App**

```javascript
// 1. Create app manually via Power Apps maker portal
// (create-app tool removed due to API bug - see GITHUB_ENTERPRISE.md)
const appId = "12345678-1234-1234-1234-123456789abc";

// 2. Add entities to app
await mcpClient.invoke("add-entities-to-app", {
  appId: appId,
  entityNames: ["myco_application", "account", "contact"]
});
console.log("✅ Entities added to app");

// 3. Validate app configuration
const validation = await mcpClient.invoke("validate-app", {
  appId: appId
});
if (!validation.success) {
  console.error("❌ Validation failed:");
  validation.issues.forEach(issue => console.error(`  - ${issue.message}`));
} else {
  console.log("✅ App validation passed");
}

// 4. Publish app
await mcpClient.invoke("publish-app", {
  appId: appId
});
console.log("✅ App published and ready for users!");
```

**Scenario 3: AutoNumber Field Conversion**

```javascript
// Convert primary name field to AutoNumber format
await mcpClient.invoke("update-attribute", {
  entityLogicalName: "myco_application",
  attributeLogicalName: "myco_name",
  autoNumberFormat: "APP-{SEQNUM:5}",
  solutionUniqueName: "MyCustomSolution"
});

await mcpClient.invoke("publish-entity", {
  entityLogicalName: "myco_application"
});

console.log("✅ Primary field converted to AutoNumber: APP-00001, APP-00002, ...");
```

---

### Model-Driven App Management

**Scenario:** Configure and publish a model-driven app.

```javascript
// 1. List all apps
const apps = await mcpClient.invoke("get-apps", {
  activeOnly: false,
  maxRecords: 100
});
console.log(`Found ${apps.length} apps`);

// 2. Get specific app details
const myApp = apps.find(app => app.uniquename === "myco_myapp");
const appDetails = await mcpClient.invoke("get-app", {
  appId: myApp.appmoduleid
});
console.log(`App: ${appDetails.name}, State: ${appDetails.statecode}`);

// 3. List app components
const components = await mcpClient.invoke("get-app-components", {
  appId: myApp.appmoduleid
});
console.log(`Entities: ${components.entities.length}`);
console.log(`Forms: ${components.forms.length}`);
console.log(`Views: ${components.views.length}`);

// 4. Get sitemap configuration
const sitemap = await mcpClient.invoke("get-app-sitemap", {
  appId: myApp.appmoduleid
});
console.log(`Sitemap: ${sitemap.sitemapname}`);

// 5. Add entities to app (requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true)
await mcpClient.invoke("add-entities-to-app", {
  appId: myApp.appmoduleid,
  entityNames: ["myco_application", "myco_task"]
});

// 6. Validate before publishing
const validation = await mcpClient.invoke("validate-app", {
  appId: myApp.appmoduleid
});
if (validation.success) {
  // 7. Publish app
  await mcpClient.invoke("publish-app", {
    appId: myApp.appmoduleid
  });
  console.log("✅ App published successfully!");
} else {
  console.error("❌ Validation failed:", validation.issues);
}
```

---

## Best Practices

### Security

**1. Principle of Least Privilege**

```bash
# Read-only access for most users
POWERPLATFORM_ENABLE_CUSTOMIZATION=false

# Enable customization only when needed
POWERPLATFORM_ENABLE_CUSTOMIZATION=true
```

**2. Separate Environments**

- **Development**: Enable customization, use dev environment URL
- **Testing**: Enable customization, use test environment URL
- **Production Read-Only**: Disable customization, use prod environment URL
- **Production Deployments**: Enable temporarily via solution import

**3. Service Principal Security**

- Store credentials in Azure Key Vault (not in code)
- Use separate app registrations per environment
- Rotate client secrets regularly (before expiration)
- Audit service principal usage via Azure AD logs
- Grant minimal required security roles

**4. Sensitive Data Handling**

```javascript
// ❌ DON'T: Log sensitive data
console.log(record);  // May contain PII

// ✅ DO: Log minimal identifiers
console.log(`Processing record ID: ${record.id}`);

// ❌ DON'T: Include sensitive fields in queries
select: "*"

// ✅ DO: Select only needed fields
select: "name,statecode,createdon"
```

---

### Performance

**1. OData Query Optimization**

```javascript
// ❌ BAD: No filtering, returns all records
await mcpClient.invoke("query-records", {
  entityName: "account"
});

// ✅ GOOD: Filter, select specific fields, limit results
await mcpClient.invoke("query-records", {
  entityName: "account",
  filter: "statecode eq 0 and createdon gt 2025-01-01",
  select: "name,accountnumber,revenue",
  orderby: "createdon desc",
  top: 50
});
```

**2. Plugin Filtering Attributes**

```javascript
// ❌ BAD: No filtering - plugin runs on ALL field updates
{
  message: "Update",
  filteringattributes: null
}

// ✅ GOOD: Filtering - plugin only runs when specific fields change
{
  message: "Update",
  filteringattributes: "revenue,statecode,industrycode"
}
```

**3. Batch Operations**

```javascript
// ❌ BAD: Individual API calls for each record
for (const id of recordIds) {
  await mcpClient.invoke("get-record", {
    entityName: "account",
    recordId: id
  });
}

// ✅ GOOD: Use query-records to fetch multiple
await mcpClient.invoke("query-records", {
  entityName: "account",
  filter: `accountid in (${recordIds.join(",")})`,
  select: "name,revenue"
});
```

**4. Caching**

```javascript
// Cache entity metadata (rarely changes)
const cachedMetadata = {};

async function getEntityMetadata(entityName) {
  if (!cachedMetadata[entityName]) {
    cachedMetadata[entityName] = await mcpClient.invoke("get-entity-metadata", {
      entityName
    });
  }
  return cachedMetadata[entityName];
}
```

---

### Customization Management

**1. Solution-Based Development**

```javascript
// ✅ ALWAYS: Specify solution context
await mcpClient.invoke("create-entity", {
  schemaName: "myco_application",
  displayName: "Application",
  pluralDisplayName: "Applications",
  ownershipType: "UserOwned",
  solutionUniqueName: "MyCustomSolution"  // ✅ Explicit solution
});

// ❌ AVOID: Creating customizations in default solution
await mcpClient.invoke("create-entity", {
  schemaName: "myco_application",
  displayName: "Application",
  pluralDisplayName: "Applications",
  ownershipType: "UserOwned"
  // No solution specified - goes to default solution ❌
});
```

**2. Naming Conventions**

```javascript
// ✅ GOOD: Use publisher prefix consistently
schemaName: "myco_application"      // Entity
schemaName: "myco_applicantname"    // Attribute
schemaName: "myco_account_application"  // Relationship

// ❌ BAD: Inconsistent or missing prefix
schemaName: "application"           // Missing prefix
schemaName: "app_application"       // Different prefix
```

**3. Publishing Workflow**

```javascript
// Development workflow
// 1. Make changes
await mcpClient.invoke("create-entity", {...});
await mcpClient.invoke("create-attribute", {...});

// 2. Validate before publishing
const validation = await mcpClient.invoke("validate-solution-integrity", {
  solutionUniqueName: "MyCustomSolution"
});

if (validation.isValid) {
  // 3. Publish customizations
  await mcpClient.invoke("publish-customizations", {});
} else {
  console.error("Validation failed:", validation.issues);
}
```

**4. Dependency Management**

```javascript
// Before deleting, check dependencies
const canDelete = await mcpClient.invoke("check-delete-eligibility", {
  componentId: entityMetadataId,
  componentType: 1  // Entity
});

if (canDelete.canDelete) {
  await mcpClient.invoke("delete-entity", {
    metadataId: entityMetadataId
  });
} else {
  console.warn("Cannot delete entity - dependencies exist:");
  canDelete.dependencies.forEach(dep => console.warn(`  - ${dep.name}`));
}
```

**5. Export/Import Best Practices**

```javascript
// Export unmanaged solution for source control
const exportResult = await mcpClient.invoke("export-solution", {
  solutionName: "MyCustomSolution",
  managed: false
});
// Save exportResult.ExportSolutionFile to version control

// Import with proper settings
await mcpClient.invoke("import-solution", {
  customizationFile: base64ZipContent,
  publishWorkflows: true,
  overwriteUnmanagedCustomizations: false  // Prevent accidental overwrites
});
```

---

## Troubleshooting

### CLI Commands (v23+)

The PowerPlatform package includes CLI commands for managing authentication:

```bash
# Show help and available options
npx @mcp-consultant-tools/powerplatform --help

# Clear cached authentication tokens (logout)
npx @mcp-consultant-tools/powerplatform --logout

# Start the MCP server normally
npx @mcp-consultant-tools/powerplatform
```

**Token Cache Location:** `~/.mcp-consultant-tools/token-cache-{clientId}.enc`

---

### Interactive Authentication Issues (v23+)

**Issue: Browser doesn't open for sign-in**

**Solutions:**
1. Check if a browser is available and set as default
2. If running in a headless environment, interactive auth won't work - use service principal instead
3. Try opening the URL manually (shown in console output)

---

**Issue: "Authentication timed out after 5 minutes"**

**Solutions:**
1. Complete the sign-in process faster
2. Check if the browser window was closed accidentally
3. Re-run the command and complete sign-in

---

**Issue: Token cache errors**

```
Token cache read error (will re-authenticate): ...
```

**Solutions:**
1. Clear the cache: `npx @mcp-consultant-tools/powerplatform --logout`
2. Token may be from a different machine or corrupted
3. Re-authenticate by running any tool

---

**Issue: "Allow public client flows" not enabled**

```
AADSTS7000218: The request body must contain the following parameter: 'client_assertion' or 'client_secret'
```

**Solution:**
1. Go to Azure Portal → App Registration → Authentication
2. Enable "Allow public client flows" = Yes
3. Add redirect URI: `http://localhost` under "Mobile and desktop applications"

---

### Common Errors

**Error: "Missing required PowerPlatform configuration"**

```
Missing required PowerPlatform configuration: POWERPLATFORM_URL, POWERPLATFORM_CLIENT_ID, POWERPLATFORM_TENANT_ID
```

**Solution:**
1. Verify required environment variables are set (URL, CLIENT_ID, TENANT_ID)
2. CLIENT_SECRET is optional (omit for interactive auth)
3. Check for typos in variable names
4. Ensure values are not empty strings
5. Restart MCP client after updating configuration

---

**Error: "Write operations are disabled"**

```
Write operations are disabled. Set POWERPLATFORM_ENABLE_CUSTOMIZATION=true to enable customization tools.
```

**Solution:**
```bash
# Add to configuration
POWERPLATFORM_ENABLE_CUSTOMIZATION=true
```

---

**Error: "The SDK operation failed with error code: 0x80040217"**

```
Error: The attribute cannot be created because it already exists with Id = 12345678-1234-1234-1234-123456789012
```

**Solution:**
1. Attribute already exists with that schema name
2. Use `get-entity-attributes` to verify existing attributes
3. Choose a different schema name or update existing attribute

---

**Error: "Principal user is missing required privileges"**

```
Error: Principal user (Id=...) is missing prvCreateEntity privilege
```

**Solution:**
1. Application user needs System Customizer or System Administrator role
2. Navigate to PowerPlatform Admin Center
3. Select environment → Settings → Users + permissions → Application users
4. Find your app user and assign appropriate security role

---

### Authentication Issues

**Error: "AADSTS700016: Application not found"**

```
Error: AADSTS700016: Application with identifier 'your-client-id' was not found in the directory
```

**Solution:**
1. Verify `POWERPLATFORM_CLIENT_ID` matches Azure AD app registration
2. Ensure app registration is in correct tenant
3. Check `POWERPLATFORM_TENANT_ID` is correct

---

**Error: "AADSTS7000215: Invalid client secret"**

```
Error: AADSTS7000215: Invalid client secret is provided.
```

**Solution:**
1. Client secret has expired or is incorrect
2. Generate new client secret in Azure AD app registration
3. Update `POWERPLATFORM_CLIENT_SECRET` with new value
4. Remember: secret is only shown once when created

---

**Error: "AADSTS50013: Assertion failed signature validation"**

```
Error: AADSTS50013: Assertion failed signature validation
```

**Solution:**
1. Check system clock is synchronized (time drift can cause this)
2. Verify tenant ID is correct
3. Try regenerating client secret

---

### Permission Problems

**Error: "Error executing plugin: Access Denied"**

```
Error: Error executing plugin 'GetEntityMetadata': Access Denied for entity 'account'
```

**Solution:**
1. Application user needs Read permission on target entity
2. Assign appropriate security role with entity-level privileges
3. For read operations: Basic User or Reader role
4. For customization: System Customizer role

---

**Error: "Cannot create relationship without Create Relationship privilege"**

```
Error: The user does not have the required Create Relationship privilege
```

**Solution:**
1. Application user needs System Customizer role minimum
2. Grant Create Relationship privilege via custom security role
3. Or assign System Administrator role for full access

---

**Error: "Only organization users can publish customizations"**

```
Error: Only organization users with the System Administrator or System Customizer role can publish customizations
```

**Solution:**
1. Assign System Customizer or System Administrator role to application user
2. Verify role is assigned in correct business unit
3. Role assignment may take a few minutes to propagate

---

**Need Help?**

- Review the [CLAUDE.md](../../CLAUDE.md) file for architecture details
- Check [SETUP.md](../../SETUP.md) for detailed setup instructions
- See [USAGE.md](../../USAGE.md) for more usage examples
- File issues at: https://github.com/anthropics/mcp-consultant-tools/issues

---
