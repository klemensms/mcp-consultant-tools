# Documentation Restructuring Plan for End-User Focus

**Created:** 2025-11-14
**Status:** Planning
**Goal:** Reorganize all 11 integration documentation files to prioritize configuration and key features for non-technical consultants

---

## Problem Statement

Current documentation structure buries the most important information:
- **Configuration** is 80-100 lines deep (after "What is X?" background sections)
- **Prompts** (the most valuable automated features) are buried after all tools
- Documents start with technical background instead of actionable setup
- Non-technical consultants can't quickly figure out:
  1. How to configure the integration
  2. What powerful features are available to them

## Solution: User-First Documentation Structure

Reorganize all 11 integration docs to follow this new structure:

### New Document Structure Template

```markdown
# {Integration Name}

**Package:** `@mcp-consultant-tools/{package-name}`
**Security:** {Production-safe status}

---

## ⚡ Quick Start

### MCP Client Configuration

**For VS Code** (`settings.json` → MCP Settings):
```json
{
  "mcpServers": {
    "{integration-name}": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/{package-name}"],
      "env": {
        "{INTEGRATION}_VAR": "your-value",
        "{INTEGRATION}_VAR2": "your-value"
      }
    }
  }
}
```

**For Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "{integration-name}": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/{package-name}"],
      "env": {
        "{INTEGRATION}_VAR": "your-value"
      }
    }
  }
}
```

**Test your setup:**
Ask Claude: "List available {integration} resources"

---

## 🎯 Key Features for Consultants

### Automated Workflows (Prompts)
These prompts combine multiple steps into single, powerful workflows:

**🔥 Most Valuable:**
- **`{top-prompt-name}`** - {What it does and why it's valuable}
  - **Example:** "{Real-world usage example}"
  - **Use case:** {When consultants should use this}

**Other Prompts:**
- **`{prompt-2}`** - {Brief description}
- **`{prompt-3}`** - {Brief description}
- ... (all prompts)

### Advanced Tools
These tools combine multiple operations or provide complex functionality:
- **`{advanced-tool-1}`** - {What it does}
- ... (complex/combined tools)

### Individual Tools
All other tools available for agent use (see [Full Tools Reference](#tools) below)

---

## Table of Contents
{Existing TOC - moved down}

---

## Overview
{Existing "What is X?", "Why Use?", "Key Features" - moved down}

---

## Detailed Setup
{Existing prerequisites, authentication, credential setup - becomes reference material}

---

## Tools (Full Reference)
{Existing comprehensive tool documentation}

---

## Prompts (Full Reference)
{Existing comprehensive prompt documentation}

---

## Usage Examples
{Existing examples}

---

## Best Practices
{Existing best practices}

---

## Troubleshooting
{Existing troubleshooting}
```

---

## Files to Update (11 Total)

### Integration Docs by Prompt Count

| File | Prompts | Priority | Key Highlight |
|------|---------|----------|---------------|
| **POWERPLATFORM.md** | 11 | HIGH | `validate-dataverse-best-practices` |
| **AZURE_DEVOPS.md** | 6 | HIGH | Wiki search & work item prompts |
| **APPLICATION_INSIGHTS.md** | 5 | HIGH | `appinsights-troubleshooting-guide` |
| **LOG_ANALYTICS.md** | 5 | HIGH | Azure Functions troubleshooting |
| **SERVICE_BUS.md** | 5 | MEDIUM | Message & DLQ analysis |
| **SHAREPOINT.md** | 5 | MEDIUM | Site & library analysis |
| **GITHUB_ENTERPRISE.md** | 5 | MEDIUM | Repository & correlation prompts |
| **AZURE_SQL.md** | 3 | MEDIUM | Database analysis prompts |
| **POWERPLATFORM_CUSTOMIZATION.md** | 2 | LOW | Schema change prompts |
| **POWERPLATFORM_DATA.md** | 0 | LOW | Config warnings only |
| **FIGMA.md** | 0 | LOW | Design extraction config |

**Total prompts to highlight:** 47 across 9 integrations

---

## Implementation Todos

### ✅ Phase 1: Establish Pattern (High Priority)

- [ ] **Update POWERPLATFORM.md** (11 prompts)
  - [ ] Add Quick Start section with VS Code config example
  - [ ] Add Quick Start section with Claude Desktop config example
  - [ ] Add "Test your setup" example
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight `validate-dataverse-best-practices` as 🔥 most valuable
  - [ ] List all 11 prompts with examples
  - [ ] Move Table of Contents down (after Quick Start + Key Features)
  - [ ] Move Overview section down (after TOC)
  - [ ] Move Detailed Setup down (after Overview)
  - [ ] Verify existing Tools/Prompts sections remain as reference

- [ ] **Update APPLICATION_INSIGHTS.md** (5 prompts)
  - [ ] Add Quick Start section with VS Code config example
  - [ ] Add Quick Start section with Claude Desktop config example
  - [ ] Add "Test your setup" example
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight `appinsights-troubleshooting-guide` as 🔥 most valuable
  - [ ] List all 5 prompts with examples
  - [ ] Move Table of Contents down
  - [ ] Move Overview section down
  - [ ] Move Detailed Setup down
  - [ ] Verify existing sections remain as reference

### ✅ Phase 2: Apply Pattern (Medium Priority)

- [ ] **Update AZURE_DEVOPS.md** (6 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight wiki search prompts as 🔥 most valuable
  - [ ] List all 6 prompts with examples
  - [ ] Reorganize structure per template

- [ ] **Update LOG_ANALYTICS.md** (5 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight Azure Functions troubleshooting as 🔥 most valuable
  - [ ] List all 5 prompts with examples
  - [ ] Reorganize structure per template

- [ ] **Update SERVICE_BUS.md** (5 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight message/DLQ analysis as 🔥 most valuable
  - [ ] List all 5 prompts with examples
  - [ ] Reorganize structure per template

- [ ] **Update SHAREPOINT.md** (5 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight site/library validation as 🔥 most valuable
  - [ ] List all 5 prompts with examples
  - [ ] Reorganize structure per template

- [ ] **Update GITHUB_ENTERPRISE.md** (5 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight cross-service correlation as 🔥 most valuable
  - [ ] List all 5 prompts with examples
  - [ ] Reorganize structure per template

- [ ] **Update AZURE_SQL.md** (3 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight database analysis as 🔥 most valuable
  - [ ] List all 3 prompts with examples
  - [ ] Reorganize structure per template

### ✅ Phase 3: Finish Remaining (Low Priority)

- [ ] **Update POWERPLATFORM_CUSTOMIZATION.md** (2 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section
  - [ ] Highlight schema change workflows
  - [ ] List 2 prompts with examples
  - [ ] Reorganize structure per template

- [ ] **Update POWERPLATFORM_DATA.md** (0 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section (focus on CRUD capabilities)
  - [ ] Emphasize security warnings and operational use
  - [ ] Reorganize structure per template

- [ ] **Update FIGMA.md** (0 prompts)
  - [ ] Add Quick Start section (VS Code + Claude Desktop)
  - [ ] Add "Key Features for Consultants" section (focus on design extraction)
  - [ ] Reorganize structure per template

---

## Configuration Examples by Integration

### PowerPlatform (Entra ID)
```json
{
  "env": {
    "POWERPLATFORM_URL": "https://yourenvironment.crm.dynamics.com",
    "POWERPLATFORM_CLIENT_ID": "your-client-id",
    "POWERPLATFORM_CLIENT_SECRET": "your-client-secret",
    "POWERPLATFORM_TENANT_ID": "your-tenant-id"
  }
}
```

### Azure DevOps (PAT)
```json
{
  "env": {
    "AZUREDEVOPS_ORGANIZATION": "your-org",
    "AZUREDEVOPS_PAT": "your-personal-access-token",
    "AZUREDEVOPS_PROJECTS": "Project1,Project2"
  }
}
```

### Application Insights (Entra ID or API Key)
```json
{
  "env": {
    "APPLICATIONINSIGHTS_APP_ID": "your-app-id",
    "APPLICATIONINSIGHTS_CLIENT_ID": "your-client-id",
    "APPLICATIONINSIGHTS_CLIENT_SECRET": "your-client-secret",
    "APPLICATIONINSIGHTS_TENANT_ID": "your-tenant-id"
  }
}
```

### Log Analytics (Entra ID or API Key, can reuse App Insights credentials)
```json
{
  "env": {
    "LOGANALYTICS_WORKSPACE_ID": "your-workspace-id",
    "LOGANALYTICS_CLIENT_ID": "your-client-id",
    "LOGANALYTICS_CLIENT_SECRET": "your-client-secret",
    "LOGANALYTICS_TENANT_ID": "your-tenant-id"
  }
}
```

### Service Bus (Entra ID or Connection String)
```json
{
  "env": {
    "SERVICEBUS_NAMESPACE": "your-namespace.servicebus.windows.net",
    "SERVICEBUS_CLIENT_ID": "your-client-id",
    "SERVICEBUS_CLIENT_SECRET": "your-client-secret",
    "SERVICEBUS_TENANT_ID": "your-tenant-id"
  }
}
```

### SharePoint (Entra ID via Graph API)
```json
{
  "env": {
    "SHAREPOINT_CLIENT_ID": "your-client-id",
    "SHAREPOINT_CLIENT_SECRET": "your-client-secret",
    "SHAREPOINT_TENANT_ID": "your-tenant-id",
    "SHAREPOINT_SITE_URL": "https://yourtenant.sharepoint.com/sites/yoursite"
  }
}
```

### GitHub Enterprise (PAT or GitHub App)
```json
{
  "env": {
    "GITHUB_TOKEN": "your-personal-access-token",
    "GITHUB_ENTERPRISE_URL": "https://github.yourcompany.com"
  }
}
```

### Azure SQL (Connection String or Azure AD)
```json
{
  "env": {
    "AZURESQL_CONNECTION_STRING": "Server=your-server.database.windows.net;Database=your-db;User Id=your-user;Password=your-password;Encrypt=true;"
  }
}
```

### Figma (PAT or OAuth)
```json
{
  "env": {
    "FIGMA_API_KEY": "your-personal-access-token"
  }
}
```

---

## Most Valuable Prompts by Integration

### PowerPlatform
🔥 **`validate-dataverse-best-practices`**
- **What:** Validates columns, choice sets, and relationships against Dataverse best practices
- **Example:** "Use validate-dataverse-best-practices to check the 'ClientCore' solution with publisher prefix 'sic_' for columns created in the last 30 days"
- **Why:** Catches configuration issues before they become production problems

### Azure DevOps
🔥 **`azuredevops-wiki-search-summary`**
- **What:** Full-text search across wiki pages with formatted results
- **Example:** "Search the wiki for 'deployment process' and show me the relevant pages"
- **Why:** Quickly find documentation without navigating the web UI

### Application Insights
🔥 **`appinsights-troubleshooting-guide`**
- **What:** Generates comprehensive incident report with exceptions, slow requests, and dependency failures
- **Example:** "Generate a troubleshooting guide for the last 24 hours"
- **Why:** First-responder guide for production incidents

### Log Analytics
🔥 **`loganalytics-function-troubleshooting`**
- **What:** Analyzes Azure Function executions, failures, and performance
- **Example:** "Troubleshoot Azure Functions in the last hour"
- **Why:** Quickly identify function failures and root causes

### Service Bus
🔥 **`servicebus-dlq-analysis`**
- **What:** Analyzes dead-letter queue messages to identify patterns
- **Example:** "Analyze DLQ for queue 'orders' and show common failure reasons"
- **Why:** Identify systemic message processing issues

### SharePoint
🔥 **`sharepoint-site-structure`**
- **What:** Shows complete site structure with libraries, lists, and permissions
- **Example:** "Show me the structure of the 'Project Documents' site"
- **Why:** Quickly understand SharePoint organization

### GitHub Enterprise
🔥 **`github-cross-service-correlation`**
- **What:** Correlates commits with Azure DevOps work items and App Insights deployments
- **Example:** "Show me changes related to work item 12345"
- **Why:** Track full SDLC lifecycle from code to production

### Azure SQL
🔥 **`azuresql-schema-analysis`**
- **What:** Analyzes database schema, tables, indexes, and relationships
- **Example:** "Analyze the schema for database 'Production'"
- **Why:** Quickly understand database structure without manual exploration

---

## Success Criteria

- ✅ Every doc starts with copy-paste ready MCP config (VS Code + Claude Desktop)
- ✅ Prompts highlighted in first 50-100 lines (before Table of Contents)
- ✅ "Test your setup" example in Quick Start
- ✅ Most valuable prompt (per integration) called out with 🔥 icon
- ✅ Configuration works out-of-box for both VS Code and Claude Desktop
- ✅ Non-technical users can configure and use key features in < 5 minutes
- ✅ Background information (What is X?) moved down but still accessible
- ✅ All 11 integration docs follow consistent structure

---

## Implementation Strategy

1. **Start with POWERPLATFORM.md** (establish pattern with most complex integration)
2. **Verify with APPLICATION_INSIGHTS.md** (confirm pattern works for different auth type)
3. **Batch update remaining 9 files** using established pattern
4. **Review all 11 files** for consistency
5. **Update README.md** if needed to reference new Quick Start sections

---

## Notes

- **Don't delete existing content** - just reorganize and add new Quick Start section
- **Maintain existing tool/prompt references** - they become detailed reference material
- **Keep existing examples** - they support the Quick Start with real-world scenarios
- **Update cross-references** - ensure links between docs still work
- **Test configurations** - verify all config examples actually work

---

## Related Files

- All integration docs: `docs/documentation/*.md`
- Main README: `README.md`
- Technical guides: `docs/technical/*_TECHNICAL.md`
- CLAUDE.md: Project guidance (keep brief, link to this plan)
