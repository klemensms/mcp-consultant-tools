# Archived Documentation

This folder contains **DEPRECATED** documentation files that have been replaced by the new per-integration documentation structure.

## Why These Files Are Archived

These monolithic documentation files became too large and difficult to navigate as the project grew to 7 integrations with 138+ tools and 28+ prompts:

- **SETUP.md** (~5,000 lines) - Setup for all integrations in one file
- **TOOLS.md** (~10,000 lines) - All 138+ tools in one file
- **USAGE.md** (~3,000 lines) - Usage examples for all integrations in one file

**Problems with the old structure:**
- ❌ Single 10,000-line TOOLS.md file was overwhelming
- ❌ Users had to scroll through all integrations to find one they needed
- ❌ Updates to one integration risked breaking docs for others
- ❌ Hard to search and navigate
- ❌ No clear separation between integrations

## New Documentation Structure

As of **Version 9.0** (January 2025), documentation has been restructured into **per-integration files** in [`docs/documentation/`](../documentation/):

### Per-Integration Documentation

Each integration has its own comprehensive documentation file:

- **[PowerPlatform/Dataverse](../documentation/POWERPLATFORM.md)** - 76 tools, 9 prompts
- **[Azure DevOps](../documentation/AZURE_DEVOPS.md)** - 11 tools, 4 prompts
- **[Figma](../documentation/FIGMA.md)** - 2 tools
- **[Application Insights](../documentation/APPLICATION_INSIGHTS.md)** - 10 tools, 5 prompts
- **[Log Analytics](../documentation/LOG_ANALYTICS.md)** - 10 tools, 5 prompts
- **[Azure SQL Database](../documentation/AZURE_SQL.md)** - 9 tools, 3 prompts
- **[GitHub Enterprise](../documentation/GITHUB_ENTERPRISE.md)** - 22 tools, 5 prompts

Each file contains everything you need for that integration:
- Overview (what it is, why use it, key features)
- Setup (prerequisites, authentication, environment variables)
- All Tools (with parameters, returns, examples)
- All Prompts (with parameters, returns, examples)
- Usage Examples (real-world scenarios)
- Best Practices (security, performance)
- Troubleshooting (common errors, solutions)

### Core Documentation (Root Directory)

- **[README.md](../../README.md)** - Project overview, quick start, and configuration
- **[CLAUDE.md](../../CLAUDE.md)** - Architecture and development guide

## Benefits of New Structure

✅ **Self-contained** - Each integration has everything in one place
✅ **User-friendly** - Users only read docs for integrations they use
✅ **Scalable** - Easy to add future integrations without bloating docs
✅ **Maintainable** - Update one integration without touching others
✅ **Searchable** - Integration-specific keywords in dedicated files

## Migration Guide

If you're using the old documentation structure, here's how to find what you need:

| Old File | New Location |
|----------|--------------|
| SETUP.md (PowerPlatform) | [POWERPLATFORM.md](../documentation/POWERPLATFORM.md#setup) |
| SETUP.md (Azure DevOps) | [AZURE_DEVOPS.md](../documentation/AZURE_DEVOPS.md#setup) |
| SETUP.md (Figma) | [FIGMA.md](../documentation/FIGMA.md#setup) |
| SETUP.md (Application Insights) | [APPLICATION_INSIGHTS.md](../documentation/APPLICATION_INSIGHTS.md#setup) |
| SETUP.md (Log Analytics) | [LOG_ANALYTICS.md](../documentation/LOG_ANALYTICS.md#setup) |
| SETUP.md (Azure SQL) | [AZURE_SQL.md](../documentation/AZURE_SQL.md#setup) |
| SETUP.md (GitHub Enterprise) | [GITHUB_ENTERPRISE.md](../documentation/GITHUB_ENTERPRISE.md#setup) |
| TOOLS.md (all tools) | See individual integration docs |
| USAGE.md (all examples) | See individual integration docs |

## Archived Files

The following files are kept in this archive for historical reference only:

- **SETUP.md** - Archived January 2025
- **TOOLS.md** - Archived January 2025
- **USAGE.md** - Archived January 2025

**DO NOT USE THESE FILES** - They are no longer maintained and may contain outdated information.

## Questions?

If you have questions about the new documentation structure, please:
1. Check the [README.md](../../README.md) for an overview
2. Browse the [per-integration docs](../documentation/) for your specific integration
3. Refer to [CLAUDE.md](../../CLAUDE.md) for architecture details
4. Open an issue on GitHub if you need help

---

**Archive Date:** January 2025
**Reason:** Documentation restructure (v9.0)
**Status:** Deprecated - Use per-integration docs in `docs/documentation/`
