# Icon Assets for Docker MCP Registry

This directory contains icon assets for each MCP server package, used in the Docker MCP Catalog.

## Requirements

- **Format**: PNG with transparency
- **Size**: 200x200 pixels (minimum)
- **Style**: Clean, modern, matches Docker catalog aesthetics

## Icons Needed

### PowerPlatform (Priority 1 - Pilot)

**File**: `powerplatform.png`

**Design Guidelines**:
- Primary colors: Purple (#742774) and Blue (#0078D4) - PowerPlatform/Dynamics brand
- Consider: Dataverse symbol, stylized "PP", or database/entity icon
- Must be visually distinct at small sizes (32x32 thumbnail)

**Status**: PENDING USER SIGN-OFF

---

### Future Icons (Phase 2)

| Package | Suggested Design | Status |
|---------|------------------|--------|
| `powerplatform-customization.png` | PowerPlatform icon + gear overlay | Pending |
| `powerplatform-data.png` | PowerPlatform icon + data/table overlay | Pending |
| `azure-devops.png` | Azure DevOps infinity symbol, blue | Pending |
| `figma.png` | Figma-inspired, design aesthetic | Pending |
| `application-insights.png` | Chart/graph, Azure purple | Pending |
| `log-analytics.png` | Terminal/logs, Azure blue | Pending |
| `azure-sql.png` | Database cylinder, Azure blue | Pending |
| `service-bus.png` | Message queue arrows, Azure orange | Pending |
| `sharepoint.png` | SharePoint 'S', green/teal | Pending |
| `github-enterprise.png` | Octocat variant, enterprise theme | Pending |
| `azure-b2c.png` | User/identity icon, Azure blue | Pending |
| `rest-api.png` | API endpoint brackets, neutral | Pending |

## Hosting

Icons are hosted via GitHub raw URLs:
```
https://raw.githubusercontent.com/klemensms/mcp-consultant-tools/main/assets/icons/{package}.png
```

## Sign-off Process

1. Design icon concept
2. Create 200x200 PNG
3. Get user approval
4. Commit to this directory
5. Verify raw URL works
