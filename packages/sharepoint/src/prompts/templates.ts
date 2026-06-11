/**
 * SharePoint MCP Prompts
 *
 * All prompt registrations for SharePoint tools.
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import * as spoFormatters from '../utils/sharepoint-formatters.js';

/**
 * Register all SharePoint prompts with the MCP server
 */
export function registerSharePointPrompts(server: any, ctx: ServiceContext): void {

  server.prompt(
    "spo-site-overview",
    {
      siteId: z.string().describe("Site ID from configuration"),
    },
    async ({ siteId }: any) => {
      try {
        const site = await ctx.sharepoint.getSiteInfo(siteId);
        const drives = await ctx.sharepoint.listDrives(siteId);

        const sections: string[] = [];
        sections.push(spoFormatters.formatSiteOverviewAsMarkdown(site));
        sections.push('');
        sections.push('## Document Libraries');
        sections.push(spoFormatters.formatDrivesAsMarkdown(drives));

        return {
          description: `SharePoint site overview: ${site.displayName}`,
          messages: [
            { role: "user", content: { type: "text", text: `Show overview of SharePoint site ${siteId}` } },
            { role: "assistant", content: { type: "text", text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error("Error generating site overview:", error);
        throw error;
      }
    }
  );

  server.prompt(
    "spo-library-details",
    {
      siteId: z.string().describe("Site ID"),
      driveId: z.string().describe("Drive (library) ID"),
    },
    async ({ siteId, driveId }: any) => {
      try {
        const drive = await ctx.sharepoint.getDriveInfo(siteId, driveId);
        const recentItems = await ctx.lists.getRecentItems(siteId, driveId, 10, 30);

        const sections: string[] = [];
        sections.push(spoFormatters.formatDriveDetailsAsMarkdown(drive));
        sections.push('');
        sections.push('## Recent Activity (Last 30 days)');
        sections.push(spoFormatters.formatItemsAsMarkdown(recentItems));

        return {
          description: `Document library details: ${drive.name}`,
          messages: [
            { role: "user", content: { type: "text", text: `Show details for document library ${driveId} in site ${siteId}` } },
            { role: "assistant", content: { type: "text", text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error("Error generating library details:", error);
        throw error;
      }
    }
  );

  server.prompt(
    "spo-document-search",
    {
      siteId: z.string().describe("Site ID"),
      driveId: z.string().describe("Drive ID"),
      query: z.string().describe("Search query (filename or keywords)"),
    },
    async ({ siteId, driveId, query }: any) => {
      try {
        const searchResults = await ctx.lists.searchItems(siteId, driveId, query);

        const sections: string[] = [];
        sections.push(`# Search Results: "${query}"`);
        sections.push('');
        sections.push(`Found ${searchResults.items.length} result(s)`);
        sections.push('');
        sections.push(spoFormatters.formatItemsAsMarkdown(searchResults.items));

        return {
          description: `Search results for "${query}"`,
          messages: [
            { role: "user", content: { type: "text", text: `Search for "${query}" in drive ${driveId} of site ${siteId}` } },
            { role: "assistant", content: { type: "text", text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error("Error generating search results:", error);
        throw error;
      }
    }
  );

  server.prompt(
    "spo-recent-activity",
    {
      siteId: z.string().describe("Site ID"),
      driveId: z.string().describe("Drive ID"),
      days: z.string().optional().describe("Number of days to look back (default: 7)"),
    },
    async ({ siteId, driveId, days }: any) => {
      try {
        const daysBack = days ? parseInt(days) : 7;
        const recentItems = await ctx.lists.getRecentItems(siteId, driveId, 50, daysBack);

        const sections: string[] = [];
        sections.push(`# Recent Activity (Last ${daysBack} days)`);
        sections.push('');
        sections.push(`**Document Library:** ${driveId}`);
        sections.push(`**Total Changes:** ${recentItems.length}`);
        sections.push('');
        sections.push(spoFormatters.formatItemsAsMarkdown(recentItems));

        return {
          description: `Recent activity for last ${daysBack} days`,
          messages: [
            { role: "user", content: { type: "text", text: `Show recent activity in drive ${driveId} for last ${daysBack} days` } },
            { role: "assistant", content: { type: "text", text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error("Error generating recent activity report:", error);
        throw error;
      }
    }
  );

  server.prompt(
    "spo-validate-crm-integration",
    {
      documentLocationId: z.string().describe("Document location ID from PowerPlatform"),
    },
    async ({ documentLocationId }: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const result = await ctx.lists.validateDocumentLocation(ppService, documentLocationId);

        const sections: string[] = [];
        sections.push(spoFormatters.formatValidationResultAsMarkdown(result));

        return {
          description: `Validation result for document location ${documentLocationId}`,
          messages: [
            { role: "user", content: { type: "text", text: `Validate PowerPlatform document location ${documentLocationId}` } },
            { role: "assistant", content: { type: "text", text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error("Error validating CRM integration:", error);
        throw error;
      }
    }
  );

  server.prompt(
    "spo-document-location-audit",
    {
      entityName: z.string().optional().describe("Entity logical name (e.g., 'account')"),
      recordId: z.string().optional().describe("Record ID (GUID)"),
    },
    async ({ entityName, recordId }: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const locations = await ctx.lists.getCrmDocumentLocations(ppService, entityName, recordId);
        const analysis = spoFormatters.analyzeCrmDocumentLocations(locations);

        const sections: string[] = [];
        sections.push('# Document Location Audit');
        sections.push('');
        if (entityName) sections.push(`**Entity:** ${entityName}`);
        if (recordId) sections.push(`**Record ID:** ${recordId}`);
        sections.push('');
        sections.push('## Insights');
        analysis.insights.forEach(insight => sections.push(insight));
        sections.push('');
        sections.push('## Document Locations');
        sections.push(spoFormatters.formatCrmDocumentLocationsAsMarkdown(locations));
        if (analysis.recommendations.length > 0) {
          sections.push('');
          sections.push('## Recommendations');
          analysis.recommendations.forEach(rec => sections.push(`- ${rec}`));
        }

        return {
          description: `Document location audit${entityName ? ` for ${entityName}` : ''}`,
          messages: [
            { role: "user", content: { type: "text", text: `Audit document locations${entityName ? ` for entity ${entityName}` : ''}${recordId ? ` record ${recordId}` : ''}` } },
            { role: "assistant", content: { type: "text", text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error("Error generating document location audit:", error);
        throw error;
      }
    }
  );

  server.prompt(
    "spo-migration-verification-report",
    {
      sourceSiteId: z.string().describe("Source site ID"),
      sourcePath: z.string().describe("Source folder path"),
      targetSiteId: z.string().describe("Target site ID"),
      targetPath: z.string().describe("Target folder path"),
    },
    async ({ sourceSiteId, sourcePath, targetSiteId, targetPath }: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const result = await ctx.lists.verifyDocumentMigration(ppService, sourceSiteId, sourcePath, targetSiteId, targetPath);
        const analysis = spoFormatters.analyzeMigrationVerification(result);

        const sections: string[] = [];
        sections.push(spoFormatters.formatMigrationReportAsMarkdown(result));
        sections.push('');
        sections.push('## Analysis');
        analysis.insights.forEach(insight => sections.push(`- ${insight}`));
        sections.push('');
        sections.push('## Recommendations');
        analysis.recommendations.forEach(rec => sections.push(`- ${rec}`));

        return {
          description: `Migration verification: ${result.status} (${result.successRate}% success)`,
          messages: [
            { role: "user", content: { type: "text", text: `Verify document migration from ${sourcePath} to ${targetPath}` } },
            { role: "assistant", content: { type: "text", text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error("Error generating migration verification report:", error);
        throw error;
      }
    }
  );

  server.prompt(
    "spo-setup-validation-guide",
    {},
    async () => {
      const guide = `# SharePoint Integration Setup Validation Guide

## Prerequisites Checklist

### 1. Azure AD App Registration
- App registered in Azure Active Directory
- Client ID and Client Secret generated
- Tenant ID noted

### 2. API Permissions
Required Microsoft Graph API permissions (Application permissions):
- Sites.Read.All or Sites.ReadWrite.All
- Files.Read.All or Files.ReadWrite.All
- Admin consent granted

### 3. SharePoint Site Access
- Service principal added to site(s) as Site Collection Admin
- Site URLs accessible and correct

### 4. Configuration
Environment variables configured:
- SHAREPOINT_TENANT_ID
- SHAREPOINT_CLIENT_ID
- SHAREPOINT_CLIENT_SECRET
- SHAREPOINT_SITES (JSON array) or SHAREPOINT_SITE_URL

## Testing Steps

### Step 1: Test Connection
\`\`\`
Use tool: spo-test-connection
Parameters: { siteId: "your-site-id" }
Expected: Site information returned with no errors
\`\`\`

### Step 2: List Document Libraries
\`\`\`
Use tool: spo-list-drives
Parameters: { siteId: "your-site-id" }
Expected: List of document libraries with quota info
\`\`\`

### Step 3: List Files
\`\`\`
Use tool: spo-list-items
Parameters: { siteId: "your-site-id", driveId: "library-id" }
Expected: List of files and folders
\`\`\`

### Step 4: Test PowerPlatform Integration (Optional)
\`\`\`
Use tool: spo-get-crm-doc-locs
Expected: List of document locations from Dataverse
\`\`\`

## Common Issues

### Issue: "Access denied" error
**Solution:**
1. Verify API permissions are granted
2. Ensure admin consent is granted
3. Check service principal is Site Collection Admin

### Issue: "Site not found"
**Solution:**
1. Verify site URL is correct (use full URL)
2. Check site exists and is accessible
3. Ensure site is in SHAREPOINT_SITES configuration

### Issue: "Authentication failed"
**Solution:**
1. Verify tenant ID, client ID, and client secret
2. Check client secret hasn't expired
3. Ensure app registration is active

## Next Steps

Once setup is validated:
1. Configure additional sites in SHAREPOINT_SITES
2. Set up PowerPlatform integration for document location validation
3. Use validation tools to audit document locations
4. Set up migration verification workflows

For more help, refer to SETUP.md documentation.
`;

      return {
        description: "SharePoint integration setup validation guide",
        messages: [
          { role: "user", content: { type: "text", text: "Show SharePoint integration setup validation guide" } },
          { role: "assistant", content: { type: "text", text: guide } },
        ],
      };
    }
  );

  server.prompt(
    "spo-troubleshooting-guide",
    {
      errorType: z.string().optional().describe("Type of error (e.g., 'access-denied', 'site-not-found')"),
    },
    async ({ errorType }: any) => {
      const guide = `# SharePoint Integration Troubleshooting Guide

## Common Error Scenarios

### 1. Access Denied (403 Forbidden)

**Symptoms:**
- "Access denied" errors when accessing sites or files
- "Insufficient permissions" messages

**Causes:**
- Missing API permissions
- Admin consent not granted
- Service principal not added to site

**Solutions:**
1. Verify Microsoft Graph API permissions:
   - Sites.Read.All (or Sites.ReadWrite.All)
   - Files.Read.All (or Files.ReadWrite.All)
2. Grant admin consent in Azure AD
3. Add service principal as Site Collection Admin

### 2. Site Not Found (404 Not Found)

**Symptoms:**
- "Site not found" errors
- "Resource does not exist" messages

**Causes:**
- Incorrect site URL
- Site not in SHAREPOINT_SITES configuration
- Site deleted or moved

**Solutions:**
1. Verify site URL format: https://tenant.sharepoint.com/sites/sitename
2. Check site exists by visiting in browser
3. Add site to SHAREPOINT_SITES configuration

### 3. Authentication Failed (401 Unauthorized)

**Symptoms:**
- "Authentication failed" errors
- "Invalid credentials" messages

**Causes:**
- Incorrect tenant ID, client ID, or client secret
- Client secret expired
- App registration disabled

**Solutions:**
1. Verify credentials in environment variables
2. Check client secret expiration in Azure AD
3. Generate new client secret if expired

### 4. Token Acquisition Failed

**Symptoms:**
- "Failed to acquire access token" errors
- MSAL errors

**Causes:**
- Network connectivity issues
- Firewall blocking Azure AD
- Incorrect tenant ID

**Solutions:**
1. Verify network connectivity to login.microsoftonline.com
2. Check firewall rules
3. Verify tenant ID is correct

### 5. Folder Not Found

**Symptoms:**
- "Folder not accessible" in validation results
- "Item not found" errors

**Solutions:**
1. Verify folder path format: /LibraryName/Folder1/Folder2
2. Check folder exists in SharePoint
3. Ensure service principal has access

### 6. Document Location Validation Fails

**Symptoms:**
- Validation status: "error" or "warning"
- Missing or inaccessible folders

**Solutions:**
1. Verify absolute URL in PowerPlatform
2. Add site to SHAREPOINT_SITES configuration
3. Check folder path matches SharePoint structure

## Diagnostic Tools

- spo-test-connection: Verify site accessibility and permissions
- spo-list-sites: Verify configured sites and status
- spo-validate-doc-loc: Check PowerPlatform integration

## Getting Help

If issues persist:
1. Check application logs for detailed error messages
2. Review audit logs in Azure AD
3. Test permissions using Microsoft Graph Explorer
`;

      return {
        description: `SharePoint troubleshooting guide${errorType ? ` for ${errorType}` : ''}`,
        messages: [
          { role: "user", content: { type: "text", text: `Show SharePoint troubleshooting guide${errorType ? ` for ${errorType}` : ''}` } },
          { role: "assistant", content: { type: "text", text: guide } },
        ],
      };
    }
  );

  server.prompt(
    "spo-powerplatform-integration-health",
    {
      entityName: z.string().optional().describe("Entity to check (e.g., 'account')"),
    },
    async ({ entityName }: any) => {
      try {
        const ppService = ctx.getPowerPlatformService();
        const locations = await ctx.lists.getCrmDocumentLocations(ppService, entityName);
        const analysis = spoFormatters.analyzeCrmDocumentLocations(locations);

        const sections: string[] = [];
        sections.push('# PowerPlatform-SharePoint Integration Health Check');
        sections.push('');
        if (entityName) {
          sections.push(`**Entity:** ${entityName}`);
          sections.push('');
        }
        sections.push('## Health Summary');
        sections.push('');
        analysis.insights.forEach(insight => sections.push(insight));
        sections.push('');
        sections.push('## Configured Document Locations');
        sections.push(spoFormatters.formatCrmDocumentLocationsAsMarkdown(locations));
        if (analysis.recommendations.length > 0) {
          sections.push('');
          sections.push('## Recommendations');
          analysis.recommendations.forEach(rec => sections.push(`- ${rec}`));
        }
        sections.push('');
        sections.push('## Next Steps');
        sections.push('');
        sections.push('1. Use `spo-validate-doc-loc` to validate individual locations');
        sections.push('2. Check for missing or inaccessible folders');
        sections.push('3. Verify service principal has access to all sites');
        sections.push('4. Review empty folders and upload documents');

        return {
          description: `Integration health check${entityName ? ` for ${entityName}` : ''}`,
          messages: [
            { role: "user", content: { type: "text", text: `Check PowerPlatform-SharePoint integration health${entityName ? ` for ${entityName}` : ''}` } },
            { role: "assistant", content: { type: "text", text: sections.join('\n') } },
          ],
        };
      } catch (error: any) {
        console.error("Error checking integration health:", error);
        throw error;
      }
    }
  );
}
