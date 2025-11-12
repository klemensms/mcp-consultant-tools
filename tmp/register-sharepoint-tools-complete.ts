  // ========================================
  // PROMPTS
  // ========================================

  server.prompt(
    "spo-site-overview",
    {
      siteId: z.string().describe("Site ID from configuration"),
    },
    async ({ siteId }) => {
      try {
        const service = getSharePointService();
  
        // Get site info
        const site = await service.getSiteInfo(siteId);
  
        // Get drives (document libraries)
        const drives = await service.listDrives(siteId);
  
        // Build report
        const sections: string[] = [];
  
        sections.push(spoFormatters.formatSiteOverviewAsMarkdown(site));
        sections.push('');
        sections.push('## Document Libraries');
        sections.push(spoFormatters.formatDrivesAsMarkdown(drives));
  
        return {
          description: `SharePoint site overview: ${site.displayName}`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Show overview of SharePoint site ${siteId}`,
              },
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: sections.join('\n'),
              },
            },
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
    async ({ siteId, driveId }) => {
      try {
        const service = getSharePointService();
  
        // Get drive info
        const drive = await service.getDriveInfo(siteId, driveId);
  
        // Get recent items
        const recentItems = await service.getRecentItems(siteId, driveId, 10, 30);
  
        // Build report
        const sections: string[] = [];
  
        sections.push(spoFormatters.formatDriveDetailsAsMarkdown(drive));
        sections.push('');
        sections.push('## Recent Activity (Last 30 days)');
        sections.push(spoFormatters.formatItemsAsMarkdown(recentItems));
  
        return {
          description: `Document library details: ${drive.name}`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Show details for document library ${driveId} in site ${siteId}`,
              },
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: sections.join('\n'),
              },
            },
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
    async ({ siteId, driveId, query }) => {
      try {
        const service = getSharePointService();
  
        // Search items
        const searchResults = await service.searchItems(siteId, driveId, query);
  
        // Build report
        const sections: string[] = [];
  
        sections.push(`# 🔍 Search Results: "${query}"`);
        sections.push('');
        sections.push(`Found ${searchResults.items.length} result(s)`);
        sections.push('');
        sections.push(spoFormatters.formatItemsAsMarkdown(searchResults.items));
  
        return {
          description: `Search results for "${query}"`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Search for "${query}" in drive ${driveId} of site ${siteId}`,
              },
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: sections.join('\n'),
              },
            },
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
    async ({ siteId, driveId, days }) => {
      try {
        const service = getSharePointService();
  
        const daysBack = days ? parseInt(days) : 7;
        const recentItems = await service.getRecentItems(siteId, driveId, 50, daysBack);
  
        // Build report
        const sections: string[] = [];
  
        sections.push(`# 📅 Recent Activity (Last ${daysBack} days)`);
        sections.push('');
        sections.push(`**Document Library:** ${driveId}`);
        sections.push(`**Total Changes:** ${recentItems.length}`);
        sections.push('');
        sections.push(spoFormatters.formatItemsAsMarkdown(recentItems));
  
        return {
          description: `Recent activity for last ${daysBack} days`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Show recent activity in drive ${driveId} for last ${daysBack} days`,
              },
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: sections.join('\n'),
              },
            },
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
    async ({ documentLocationId }) => {
      try {
        const spoService = getSharePointService();
        const ppService = getPowerPlatformService();
  
        // Validate document location
        const result = await spoService.validateDocumentLocation(ppService, documentLocationId);
  
        // Generate analysis
        const sections: string[] = [];
  
        sections.push(spoFormatters.formatValidationResultAsMarkdown(result));
  
        return {
          description: `Validation result for document location ${documentLocationId}`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Validate PowerPlatform document location ${documentLocationId}`,
              },
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: sections.join('\n'),
              },
            },
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
    async ({ entityName, recordId }) => {
      try {
        const spoService = getSharePointService();
        const ppService = getPowerPlatformService();
  
        // Get document locations
        const locations = await spoService.getCrmDocumentLocations(ppService, entityName, recordId);
  
        // Analyze
        const analysis = spoFormatters.analyzeCrmDocumentLocations(locations);
  
        // Build report
        const sections: string[] = [];
  
        sections.push('# 📋 Document Location Audit');
        sections.push('');
  
        if (entityName) {
          sections.push(`**Entity:** ${entityName}`);
        }
  
        if (recordId) {
          sections.push(`**Record ID:** ${recordId}`);
        }
  
        sections.push('');
        sections.push('## Insights');
        analysis.insights.forEach(insight => {
          sections.push(insight);
        });
  
        sections.push('');
        sections.push('## Document Locations');
        sections.push(spoFormatters.formatCrmDocumentLocationsAsMarkdown(locations));
  
        if (analysis.recommendations.length > 0) {
          sections.push('');
          sections.push('## Recommendations');
          analysis.recommendations.forEach(rec => {
            sections.push(`- ${rec}`);
          });
        }
  
        return {
          description: `Document location audit${entityName ? ` for ${entityName}` : ''}`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Audit document locations${entityName ? ` for entity ${entityName}` : ''}${recordId ? ` record ${recordId}` : ''}`,
              },
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: sections.join('\n'),
              },
            },
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
    async ({ sourceSiteId, sourcePath, targetSiteId, targetPath }) => {
      try {
        const spoService = getSharePointService();
        const ppService = getPowerPlatformService();
  
        // Verify migration
        const result = await spoService.verifyDocumentMigration(
          ppService,
          sourceSiteId,
          sourcePath,
          targetSiteId,
          targetPath
        );
  
        // Analyze
        const analysis = spoFormatters.analyzeMigrationVerification(result);
  
        // Build report
        const sections: string[] = [];
  
        sections.push(spoFormatters.formatMigrationReportAsMarkdown(result));
        sections.push('');
        sections.push('## Analysis');
        analysis.insights.forEach(insight => {
          sections.push(`- ${insight}`);
        });
  
        sections.push('');
        sections.push('## Recommendations');
        analysis.recommendations.forEach(rec => {
          sections.push(`- ${rec}`);
        });
  
        return {
          description: `Migration verification: ${result.status} (${result.successRate}% success)`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Verify document migration from ${sourcePath} to ${targetPath}`,
              },
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: sections.join('\n'),
              },
            },
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
  - ✅ App registered in Azure Active Directory
  - ✅ Client ID and Client Secret generated
  - ✅ Tenant ID noted
  
  ### 2. API Permissions
  Required Microsoft Graph API permissions (Application permissions):
  - ✅ Sites.Read.All or Sites.ReadWrite.All
  - ✅ Files.Read.All or Files.ReadWrite.All
  - ✅ Admin consent granted
  
  ### 3. SharePoint Site Access
  - ✅ Service principal added to site(s) as Site Collection Admin
  - ✅ Site URLs accessible and correct
  
  ### 4. Configuration
  Environment variables configured:
  - ✅ SHAREPOINT_TENANT_ID
  - ✅ SHAREPOINT_CLIENT_ID
  - ✅ SHAREPOINT_CLIENT_SECRET
  - ✅ SHAREPOINT_SITES (JSON array) or SHAREPOINT_SITE_URL
  
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
  Use tool: spo-get-crm-document-locations
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
          {
            role: "user",
            content: {
              type: "text",
              text: "Show SharePoint integration setup validation guide",
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: guide,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "spo-troubleshooting-guide",
    {
      errorType: z.string().optional().describe("Type of error (e.g., 'access-denied', 'site-not-found')"),
    },
    async ({ errorType }) => {
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
  3. Add service principal as Site Collection Admin:
     - Go to site settings → Site permissions
     - Add app with client ID
     - Grant Full Control or Read permissions
  
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
  4. Ensure site is not archived or deleted
  
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
  4. Ensure app registration is active
  
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
  4. Test authentication manually
  
  ### 5. Folder Not Found
  
  **Symptoms:**
  - "Folder not accessible" in validation results
  - "Item not found" errors
  
  **Causes:**
  - Incorrect folder path
  - Folder deleted or moved
  - Permissions issue
  
  **Solutions:**
  1. Verify folder path format: /LibraryName/Folder1/Folder2
  2. Check folder exists in SharePoint
  3. Ensure service principal has access
  4. Use spo-list-items to browse folder structure
  
  ### 6. Document Location Validation Fails
  
  **Symptoms:**
  - Validation status: "error" or "warning"
  - Missing or inaccessible folders
  
  **Causes:**
  - CRM absolute URL incorrect
  - Site not configured
  - Folder path mismatch
  
  **Solutions:**
  1. Verify absolute URL in PowerPlatform
  2. Add site to SHAREPOINT_SITES configuration
  3. Check folder path matches SharePoint structure
  4. Use spo-validate-document-location tool
  
  ## Diagnostic Tools
  
  ### Test Connection
  \`\`\`
  Use: spo-test-connection
  Purpose: Verify site accessibility and permissions
  \`\`\`
  
  ### List Sites
  \`\`\`
  Use: spo-list-sites
  Purpose: Verify configured sites and status
  \`\`\`
  
  ### Validate Document Location
  \`\`\`
  Use: spo-validate-document-location
  Purpose: Check PowerPlatform integration
  \`\`\`
  
  ## Getting Help
  
  If issues persist:
  1. Check application logs for detailed error messages
  2. Review audit logs in Azure AD
  3. Test permissions using Microsoft Graph Explorer
  4. Refer to SETUP.md for detailed configuration steps
  
  For API-specific errors, refer to Microsoft Graph API documentation.
  `;
  
      return {
        description: `SharePoint troubleshooting guide${errorType ? ` for ${errorType}` : ''}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Show SharePoint troubleshooting guide${errorType ? ` for ${errorType}` : ''}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: guide,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "spo-powerplatform-integration-health",
    {
      entityName: z.string().optional().describe("Entity to check (e.g., 'account')"),
    },
    async ({ entityName }) => {
      try {
        const spoService = getSharePointService();
        const ppService = getPowerPlatformService();
  
        // Get all document locations for entity
        const locations = await spoService.getCrmDocumentLocations(ppService, entityName);
  
        // Analyze
        const analysis = spoFormatters.analyzeCrmDocumentLocations(locations);
  
        // Build health report
        const sections: string[] = [];
  
        sections.push('# 🏥 PowerPlatform-SharePoint Integration Health Check');
        sections.push('');
  
        if (entityName) {
          sections.push(`**Entity:** ${entityName}`);
          sections.push('');
        }
  
        sections.push('## Health Summary');
        sections.push('');
        analysis.insights.forEach(insight => {
          sections.push(insight);
        });
  
        sections.push('');
        sections.push('## Configured Document Locations');
        sections.push(spoFormatters.formatCrmDocumentLocationsAsMarkdown(locations));
  
        if (analysis.recommendations.length > 0) {
          sections.push('');
          sections.push('## Recommendations');
          analysis.recommendations.forEach(rec => {
            sections.push(`- 💡 ${rec}`);
          });
        }
  
        sections.push('');
        sections.push('## Next Steps');
        sections.push('');
        sections.push('1. Use `spo-validate-document-location` to validate individual locations');
        sections.push('2. Check for missing or inaccessible folders');
        sections.push('3. Verify service principal has access to all sites');
        sections.push('4. Review empty folders and upload documents');
  
        return {
          description: `Integration health check${entityName ? ` for ${entityName}` : ''}`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Check PowerPlatform-SharePoint integration health${entityName ? ` for ${entityName}` : ''}`,
              },
            },
            {
              role: "assistant",
              content: {
                type: "text",
                text: sections.join('\n'),
              },
            },
          ],
        };
      } catch (error: any) {
        console.error("Error checking integration health:", error);
        throw error;
      }
    }
  );

  // ========================================
  // TOOLS
  // ========================================

  server.tool(
    "spo-list-sites",
    "List all configured SharePoint sites (active and inactive)",
    {},
    async () => {
      try {
        const service = getSharePointService();
        const sites = service.getAllSites();
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(sites, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error listing SharePoint sites:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to list sites: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-get-site-info",
    "Get detailed site information including metadata, created/modified dates, and owner info",
    {
      siteId: z.string().describe("Site ID from configuration (use spo-list-sites to find IDs)"),
    },
    async ({ siteId }) => {
      try {
        const service = getSharePointService();
        const siteInfo = await service.getSiteInfo(siteId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(siteInfo, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting SharePoint site info:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get site info: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-test-connection",
    "Test connectivity to a SharePoint site and verify permissions (Sites.Read.All and Files.Read.All required)",
    {
      siteId: z.string().describe("Site ID from configuration"),
    },
    async ({ siteId }) => {
      try {
        const service = getSharePointService();
        const result = await service.testConnection(siteId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error testing SharePoint connection:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to test connection: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-list-drives",
    "List all document libraries (drives) in a SharePoint site with metadata",
    {
      siteId: z.string().describe("Site ID from configuration"),
    },
    async ({ siteId }) => {
      try {
        const service = getSharePointService();
        const drives = await service.listDrives(siteId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(drives, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error listing SharePoint drives:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to list drives: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-get-drive-info",
    "Get detailed document library information including quota, owner, and created/modified dates",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID (use spo-list-drives to find IDs)"),
    },
    async ({ siteId, driveId }) => {
      try {
        const service = getSharePointService();
        const driveInfo = await service.getDriveInfo(siteId, driveId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(driveInfo, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting SharePoint drive info:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get drive info: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-clear-cache",
    "Clear cached SharePoint responses (useful after site changes or for troubleshooting)",
    {
      siteId: z.string().optional().describe("Clear cache for specific site only (optional)"),
      pattern: z.string().optional().describe("Clear only cache entries matching this pattern (optional)"),
    },
    async ({ siteId, pattern }) => {
      try {
        const service = getSharePointService();
        const clearedCount = service.clearCache(pattern, siteId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ clearedCount, message: `Cleared ${clearedCount} cache entries` }, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error clearing SharePoint cache:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to clear cache: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-list-items",
    "List all files and folders in a document library or folder",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      folderId: z.string().optional().describe("Folder ID (optional, defaults to root)"),
    },
    async ({ siteId, driveId, folderId }) => {
      try {
        const service = getSharePointService();
        const items = await service.listItems(siteId, driveId, folderId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(items, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error listing SharePoint items:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to list items: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-get-item",
    "Get detailed file or folder metadata by ID",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      itemId: z.string().describe("Item ID"),
    },
    async ({ siteId, driveId, itemId }) => {
      try {
        const service = getSharePointService();
        const item = await service.getItem(siteId, driveId, itemId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(item, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting SharePoint item:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get item: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-get-item-by-path",
    "Get file or folder metadata by path (relative to drive root)",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      path: z.string().describe("Item path (e.g., '/folder/file.docx' or 'folder/subfolder')"),
    },
    async ({ siteId, driveId, path }) => {
      try {
        const service = getSharePointService();
        const item = await service.getItemByPath(siteId, driveId, path);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(item, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting SharePoint item by path:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get item by path: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-search-items",
    "Search for files by filename or metadata (filename and metadata search only, not full-text)",
    {
      siteId: z.string().describe("Site ID from configuration"),
      query: z.string().describe("Search query"),
      driveId: z.string().optional().describe("Limit search to specific drive (optional)"),
      limit: z.number().optional().describe("Maximum results (default: 100, max configured in SHAREPOINT_MAX_SEARCH_RESULTS)"),
    },
    async ({ siteId, query, driveId, limit }) => {
      try {
        const service = getSharePointService();
        const result = await service.searchItems(siteId, query, driveId, limit);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error searching SharePoint items:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to search items: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-get-recent-items",
    "Get recently modified items in a document library",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      limit: z.number().optional().describe("Maximum results (default: 20, max: 100)"),
      days: z.number().optional().describe("Days back to search (default: 30)"),
    },
    async ({ siteId, driveId, limit, days }) => {
      try {
        const service = getSharePointService();
        const items = await service.getRecentItems(siteId, driveId, limit, days);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(items, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting recent SharePoint items:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get recent items: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-get-folder-structure",
    "Get recursive folder tree structure (useful for understanding site organization)",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      folderId: z.string().optional().describe("Root folder ID (optional, defaults to drive root)"),
      depth: z.number().optional().describe("Recursion depth (default: 3, max: 10)"),
    },
    async ({ siteId, driveId, folderId, depth }) => {
      try {
        const service = getSharePointService();
        const tree = await service.getFolderStructure(siteId, driveId, folderId, depth);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(tree, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting SharePoint folder structure:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get folder structure: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-get-crm-document-locations",
    "Get SharePoint document locations configured in PowerPlatform Dataverse (sharepointdocumentlocation entity)",
    {
      entityName: z.string().optional().describe("Filter by entity logical name (e.g., 'account', 'contact')"),
      recordId: z.string().optional().describe("Filter by specific record ID (GUID)"),
    },
    async ({ entityName, recordId }) => {
      try {
        const spoService = getSharePointService();
        const ppService = getPowerPlatformService();
  
        const locations = await spoService.getCrmDocumentLocations(ppService, entityName, recordId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(locations, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting CRM document locations:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get CRM document locations: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-validate-document-location",
    "Validate that a PowerPlatform document location configuration matches the actual SharePoint site structure. Checks site accessibility, folder existence, and file counts. Returns validation status (valid/warning/error) with issues and recommendations.",
    {
      documentLocationId: z.string().describe("GUID of the sharepointdocumentlocation record in PowerPlatform"),
    },
    async ({ documentLocationId }) => {
      try {
        const spoService = getSharePointService();
        const ppService = getPowerPlatformService();
  
        const result = await spoService.validateDocumentLocation(ppService, documentLocationId);
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error validating document location:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to validate document location: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spo-verify-document-migration",
    "Verify that documents were successfully migrated from source to target SharePoint folder. Compares file counts, sizes, names, and modified dates. Returns migration status (complete/incomplete/failed) with success rate and detailed comparison.",
    {
      sourceSiteId: z.string().describe("Source SharePoint site ID"),
      sourcePath: z.string().describe("Source folder path (e.g., '/Documents/Archive')"),
      targetSiteId: z.string().describe("Target SharePoint site ID"),
      targetPath: z.string().describe("Target folder path (e.g., '/NewLibrary/Archive')"),
    },
    async ({ sourceSiteId, sourcePath, targetSiteId, targetPath }) => {
      try {
        const spoService = getSharePointService();
        const ppService = getPowerPlatformService();
  
        const result = await spoService.verifyDocumentMigration(
          ppService,
          sourceSiteId,
          sourcePath,
          targetSiteId,
          targetPath
        );
  
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error verifying document migration:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to verify document migration: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  console.error("sharepoint tools registered: 15 tools, 10 prompts");
