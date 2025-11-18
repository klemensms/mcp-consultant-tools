# Migration Guide: v20.x → v21.0.0

## Overview

Version 21.0.0 introduces a **breaking change** to the PowerPlatform security model. Environment flags are no longer checked - security is enforced solely through package selection.

## What Changed

### Old Security Model (v16-20): Defense-in-Depth

Two layers of protection:
1. Install the correct package
2. Set environment flag to `true`

```bash
# Both required in v20
npm install @mcp-consultant-tools/powerplatform-customization
POWERPLATFORM_ENABLE_CUSTOMIZATION=true
```

### New Security Model (v21+): Package-Only Protection

Single layer of protection:
- Install only the packages you need per environment

```bash
# Just package installation in v21
npm install @mcp-consultant-tools/powerplatform-customization
# No flags needed - installation = explicit intent
```

## Breaking Changes

### PowerPlatform Customization

**Removed:**
- Environment flag: `POWERPLATFORM_ENABLE_CUSTOMIZATION`
- Package registration check (no longer throws error if flag missing)
- Tool-level permission checks

**Impact:**
- Installing `@mcp-consultant-tools/powerplatform-customization` immediately grants access to customization operations
- No environment flag needed

### PowerPlatform Data

**NO CHANGES - Flags Retained:**
- Environment flags: `POWERPLATFORM_ENABLE_CREATE`, `POWERPLATFORM_ENABLE_UPDATE`, `POWERPLATFORM_ENABLE_DELETE`
- Tool-level permission checks for create/update/delete remain in place

**Impact:**
- **No breaking changes for data operations**
- Granular control via flags is preserved
- Delete operations still require explicit `confirm: true` parameter (tool-level safety retained)
- All three flags still required and checked

## Migration Steps

### Step 1: Review Package Installations

**Action Required:** Audit which packages are installed in each environment.

```bash
# Check what's installed
npm list | grep @mcp-consultant-tools/powerplatform

# Or check Claude Desktop config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Step 2: Uninstall Dangerous Packages from Production

**If you have installed:**
- `@mcp-consultant-tools/powerplatform-customization` in production → **UNINSTALL**
- `@mcp-consultant-tools/powerplatform-data` in read-only production → **UNINSTALL** (same as v20)

```bash
# Remove from package.json
npm uninstall @mcp-consultant-tools/powerplatform-customization
npm uninstall @mcp-consultant-tools/powerplatform-data

# Or update Claude Desktop config to remove these servers
```

### Step 3: Update Environment Flags (Optional Cleanup)

**Customization flag can be removed:**
```bash
# Remove from .env files (optional)
# This line can be deleted - it has no effect in v21
POWERPLATFORM_ENABLE_CUSTOMIZATION=true
```

**Data flags must be kept:**
```bash
# Keep these - they are still required in v21
POWERPLATFORM_ENABLE_CREATE=true
POWERPLATFORM_ENABLE_UPDATE=true
POWERPLATFORM_ENABLE_DELETE=true
```

### Step 4: Update Documentation

If you have internal documentation referencing environment flags, update to reflect package-based security model.

## Recommended Package Configuration by Environment

### Production (Read-Only)
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform@latest"],
      "env": {
        "POWERPLATFORM_URL": "https://prod.crm.dynamics.com",
        "POWERPLATFORM_CLIENT_ID": "...",
        "POWERPLATFORM_CLIENT_SECRET": "...",
        "POWERPLATFORM_TENANT_ID": "..."
      }
    }
  }
}
```

### Development (Read + Customization)
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform@latest"],
      "env": { /* credentials */ }
    },
    "powerplatform-customization": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform-customization@latest"],
      "env": {
        /* same credentials */
        "POWERPLATFORM_DEFAULT_SOLUTION": "DevSolution"
      }
    }
  }
}
```

### Operational (Read + Data CRUD)
```json
{
  "mcpServers": {
    "powerplatform": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform@latest"],
      "env": { /* credentials */ }
    },
    "powerplatform-data": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/powerplatform-data@latest"],
      "env": {
        /* same credentials */
        "POWERPLATFORM_ENABLE_CREATE": "true",
        "POWERPLATFORM_ENABLE_UPDATE": "true",
        "POWERPLATFORM_ENABLE_DELETE": "true"
      }
    }
  }
}
```

## FAQ

### Q: Will my v20 configuration stop working?

**A:** No. Your v20 configuration will continue to work:
- Customization flag will be ignored (no errors)
- Data flags are still required and checked (same behavior as v20)

### Q: Is this more or less secure?

**A:** **Equal security, simpler model for customization.**
- Customization: Package isolation provides sufficient security boundary (user testing confirmed)
- Data operations: Granular flags preserved for fine-tuned control per operation type
- Same security model for data, simpler for customization

### Q: What if I accidentally install the wrong package?

**A:** Review your Claude Desktop config and package.json files. Uninstall packages you don't need. This is the same risk as v20 - the only change is removing the redundant flag layer.

### Q: Do I need to update immediately?

**A:** No urgency for existing installations. However, you should:
1. Review package installations across environments (recommended)
2. Remove flags from configs (optional cleanup)
3. Update internal documentation (if applicable)

### Q: Can I still use the meta package?

**A:** Yes, but be aware: `@mcp-consultant-tools/meta` includes ALL packages (including customization and data). Only use the meta package in development/operational environments. For production, use individual packages.

## Support

For issues or questions:
- GitHub Issues: https://github.com/klemensms/mcp-consultant-tools/issues
- Documentation: `/docs/documentation/POWERPLATFORM*.md`
