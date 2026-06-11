/**
 * SharePoint Formatting Utilities
 *
 * Transforms SharePoint Graph API responses into human-readable markdown reports
 * with insights, analysis, and recommendations for PowerPlatform integration validation.
 */

import type {
  SiteInfo,
  DriveInfo,
  ItemInfo,
  ValidationResult,
  MigrationVerification,
  SharePointDocumentLocation,
} from '../types/sharepoint-types.js';

// ============================================================================
// Site Formatting
// ============================================================================

/**
 * Format site list as markdown table
 */
export function formatSitesAsMarkdown(sites: SiteInfo[]): string {
  if (!sites || sites.length === 0) {
    return '*No sites found*';
  }

  const header = '| Site Name | URL | Created | Last Modified |';
  const separator = '|-----------|-----|---------|---------------|';

  const rows = sites.map((site) => {
    const created = new Date(site.createdDateTime).toLocaleDateString();
    const modified = new Date(site.lastModifiedDateTime).toLocaleDateString();

    return `| ${site.displayName} | ${site.webUrl} | ${created} | ${modified} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format site overview with details
 */
export function formatSiteOverviewAsMarkdown(site: SiteInfo): string {
  const sections: string[] = [];

  sections.push(`# ${site.displayName}`);
  sections.push('');
  sections.push(`**URL:** ${site.webUrl}`);
  sections.push(`**Site ID:** ${site.id}`);

  if (site.description) {
    sections.push(`**Description:** ${site.description}`);
  }

  if (site.siteCollection?.hostname) {
    sections.push(`**Hostname:** ${site.siteCollection.hostname}`);
  }

  sections.push('');
  sections.push('## Metadata');
  sections.push(`- **Created:** ${new Date(site.createdDateTime).toLocaleString()}`);
  sections.push(`- **Last Modified:** ${new Date(site.lastModifiedDateTime).toLocaleString()}`);

  return sections.join('\n');
}

// ============================================================================
// Drive (Document Library) Formatting
// ============================================================================

/**
 * Format drive list as markdown table
 */
export function formatDrivesAsMarkdown(drives: DriveInfo[]): string {
  if (!drives || drives.length === 0) {
    return '*No document libraries found*';
  }

  const header = '| Library Name | Type | Items | Size Used | Quota | Status |';
  const separator = '|--------------|------|-------|-----------|-------|--------|';

  const rows = drives.map((drive) => {
    const quota = drive.quota;
    const usedGB = quota ? (quota.used / (1024 ** 3)).toFixed(2) : '0';
    const totalGB = quota ? (quota.total / (1024 ** 3)).toFixed(2) : 'N/A';
    const quotaStr = quota ? `${usedGB} GB / ${totalGB} GB` : 'N/A';
    const statusIcon = quota?.state === 'normal' ? '✅' : quota?.state === 'nearing' ? '⚠️' : quota?.state === 'exceeded' ? '❌' : 'ℹ️';

    return (
      `| ${drive.name} | ${drive.driveType} | - | ${usedGB} GB | ${quotaStr} | ${statusIcon} ${quota?.state || 'Unknown'} |`
    );
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format drive details with quota information
 */
export function formatDriveDetailsAsMarkdown(drive: DriveInfo): string {
  const sections: string[] = [];

  sections.push(`# ${drive.name}`);
  sections.push('');
  sections.push(`**Library ID:** ${drive.id}`);
  sections.push(`**Type:** ${drive.driveType}`);
  sections.push(`**URL:** ${drive.webUrl}`);

  if (drive.description) {
    sections.push(`**Description:** ${drive.description}`);
  }

  sections.push('');
  sections.push('## Quota Information');

  if (drive.quota) {
    const usedGB = (drive.quota.used / (1024 ** 3)).toFixed(2);
    const totalGB = (drive.quota.total / (1024 ** 3)).toFixed(2);
    const remainingGB = (drive.quota.remaining / (1024 ** 3)).toFixed(2);
    const percentUsed = ((drive.quota.used / drive.quota.total) * 100).toFixed(1);

    sections.push(`- **Used:** ${usedGB} GB (${percentUsed}%)`);
    sections.push(`- **Total:** ${totalGB} GB`);
    sections.push(`- **Remaining:** ${remainingGB} GB`);
    sections.push(`- **Status:** ${drive.quota.state}`);
  } else {
    sections.push('*Quota information not available*');
  }

  sections.push('');
  sections.push('## Metadata');
  sections.push(`- **Created:** ${new Date(drive.createdDateTime).toLocaleString()}`);
  sections.push(`- **Last Modified:** ${new Date(drive.lastModifiedDateTime).toLocaleString()}`);

  if (drive.owner?.user?.displayName) {
    sections.push(`- **Owner:** ${drive.owner.user.displayName}${drive.owner.user.email ? ` (${drive.owner.user.email})` : ''}`);
  }

  return sections.join('\n');
}

// ============================================================================
// Item (File/Folder) Formatting
// ============================================================================

/**
 * Format item list as markdown table
 */
export function formatItemsAsMarkdown(items: ItemInfo[]): string {
  if (!items || items.length === 0) {
    return '*No items found*';
  }

  const header = '| Name | Type | Size | Modified | Modified By |';
  const separator = '|------|------|------|----------|-------------|';

  const rows = items.map((item) => {
    const type = item.folder ? '📁 Folder' : '📄 File';
    const size = item.size ? formatFileSize(item.size) : '-';
    const modified = new Date(item.lastModifiedDateTime).toLocaleDateString();
    const modifiedBy = item.lastModifiedBy?.user?.displayName || 'Unknown';

    return `| ${item.name} | ${type} | ${size} | ${modified} | ${modifiedBy} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format item details with metadata
 */
export function formatItemDetailsAsMarkdown(item: ItemInfo): string {
  const sections: string[] = [];
  const isFolder = !!item.folder;
  const icon = isFolder ? '📁' : '📄';

  sections.push(`# ${icon} ${item.name}`);
  sections.push('');
  sections.push(`**Type:** ${isFolder ? 'Folder' : 'File'}`);
  sections.push(`**Item ID:** ${item.id}`);
  sections.push(`**URL:** ${item.webUrl}`);

  if (item.file) {
    sections.push(`**MIME Type:** ${item.file.mimeType}`);
  }

  if (item.size) {
    sections.push(`**Size:** ${formatFileSize(item.size)}`);
  }

  if (item.folder) {
    sections.push(`**Child Count:** ${item.folder.childCount}`);
  }

  sections.push('');
  sections.push('## Metadata');
  sections.push(`- **Created:** ${new Date(item.createdDateTime).toLocaleString()}`);
  sections.push(`- **Last Modified:** ${new Date(item.lastModifiedDateTime).toLocaleString()}`);

  if (item.createdBy?.user?.displayName) {
    sections.push(`- **Created By:** ${item.createdBy.user.displayName}${item.createdBy.user.email ? ` (${item.createdBy.user.email})` : ''}`);
  }

  if (item.lastModifiedBy?.user?.displayName) {
    sections.push(`- **Modified By:** ${item.lastModifiedBy.user.displayName}${item.lastModifiedBy.user.email ? ` (${item.lastModifiedBy.user.email})` : ''}`);
  }

  if (item.parentReference) {
    sections.push('');
    sections.push('## Parent Reference');
    sections.push(`- **Drive ID:** ${item.parentReference.driveId}`);
    sections.push(`- **Parent ID:** ${item.parentReference.id}`);
    sections.push(`- **Path:** ${item.parentReference.path}`);
  }

  return sections.join('\n');
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

// ============================================================================
// PowerPlatform Validation Formatting
// ============================================================================

/**
 * Format validation result as detailed markdown report
 */
export function formatValidationResultAsMarkdown(result: ValidationResult): string {
  const sections: string[] = [];

  // Header
  const statusIcon = result.status === 'valid' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
  sections.push(`# ${statusIcon} Document Location Validation`);
  sections.push('');
  sections.push(`**Status:** ${result.status.toUpperCase()}`);
  sections.push(`**Document Location:** ${result.documentLocationName} (${result.documentLocationId})`);
  sections.push('');

  // CRM Configuration
  sections.push('## CRM Configuration');
  sections.push(`- **Absolute URL:** ${result.crmConfig.absoluteUrl || '*Not configured*'}`);
  sections.push(`- **Relative URL:** ${result.crmConfig.relativeUrl || '*Not configured*'}`);
  sections.push(`- **Active:** ${result.crmConfig.isActive ? 'Yes' : 'No'}`);

  if (result.crmConfig.regardingEntity) {
    sections.push(`- **Regarding Entity:** ${result.crmConfig.regardingEntity}`);
  }

  if (result.crmConfig.regardingRecordId) {
    sections.push(`- **Regarding Record ID:** ${result.crmConfig.regardingRecordId}`);
  }

  sections.push('');

  // SharePoint Validation
  sections.push('## SharePoint Validation');
  sections.push(`- **Site Exists:** ${result.spoValidation.siteExists ? '✅ Yes' : '❌ No'}`);
  sections.push(`- **Folder Exists:** ${result.spoValidation.folderExists ? '✅ Yes' : '❌ No'}`);
  sections.push(`- **Folder Accessible:** ${result.spoValidation.folderAccessible ? '✅ Yes' : '❌ No'}`);
  sections.push(`- **File Count:** ${result.spoValidation.fileCount}`);
  sections.push(`- **Is Empty:** ${result.spoValidation.isEmpty ? 'Yes' : 'No'}`);
  sections.push('');

  // Issues
  if (result.issues.length > 0) {
    sections.push('## Issues Found');
    result.issues.forEach((issue) => {
      sections.push(`- ❌ ${issue}`);
    });
    sections.push('');
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    sections.push('## Recommendations');
    result.recommendations.forEach((rec) => {
      sections.push(`- 💡 ${rec}`);
    });
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Analyze validation results and generate insights
 */
export function analyzeValidationResults(results: ValidationResult[]): {
  insights: string[];
  recommendations: string[];
} {
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (results.length === 0) {
    insights.push('No document locations to validate');
    return { insights, recommendations };
  }

  const validCount = results.filter(r => r.status === 'valid').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  insights.push(`**Total document locations:** ${results.length}`);
  insights.push(`- ✅ Valid: ${validCount}`);
  insights.push(`- ⚠️ Warnings: ${warningCount}`);
  insights.push(`- ❌ Errors: ${errorCount}`);

  // Common issues
  const siteNotFoundCount = results.filter(r => !r.spoValidation.siteExists).length;
  const folderNotFoundCount = results.filter(r => !r.spoValidation.folderExists).length;
  const emptyFolderCount = results.filter(r => r.spoValidation.isEmpty).length;

  if (siteNotFoundCount > 0) {
    insights.push(`- ${siteNotFoundCount} location(s) point to inaccessible sites`);
    recommendations.push('Verify SharePoint site URLs and service principal permissions');
  }

  if (folderNotFoundCount > 0) {
    insights.push(`- ${folderNotFoundCount} location(s) have missing or inaccessible folders`);
    recommendations.push('Check folder paths and permissions in SharePoint');
  }

  if (emptyFolderCount > 0) {
    insights.push(`- ${emptyFolderCount} location(s) have empty folders`);
    recommendations.push('Upload documents or verify correct folder paths');
  }

  return { insights, recommendations };
}

// ============================================================================
// Migration Verification Formatting
// ============================================================================

/**
 * Format migration verification result as detailed markdown report
 */
export function formatMigrationReportAsMarkdown(result: MigrationVerification): string {
  const sections: string[] = [];

  // Header
  const statusIcon = result.status === 'complete' ? '✅' : result.status === 'incomplete' ? '⚠️' : '❌';
  sections.push(`# ${statusIcon} Document Migration Verification`);
  sections.push('');
  sections.push(`**Status:** ${result.status.toUpperCase()}`);
  sections.push(`**Success Rate:** ${result.successRate}%`);
  sections.push('');

  // Source Summary
  sections.push('## Source');
  sections.push(`- **Path:** ${result.source.path}`);
  sections.push(`- **File Count:** ${result.source.fileCount}`);
  sections.push(`- **Total Size:** ${formatFileSize(result.source.totalSize)}`);
  sections.push('');

  // Target Summary
  sections.push('## Target');
  sections.push(`- **Path:** ${result.target.path}`);
  sections.push(`- **File Count:** ${result.target.fileCount}`);
  sections.push(`- **Total Size:** ${formatFileSize(result.target.totalSize)}`);
  sections.push('');

  // Comparison
  sections.push('## Comparison');

  if (result.comparison.missingFiles.length > 0) {
    sections.push('');
    sections.push('### ❌ Missing Files (in source but not in target)');
    result.comparison.missingFiles.forEach((file) => {
      sections.push(`- ${file}`);
    });
  }

  if (result.comparison.extraFiles.length > 0) {
    sections.push('');
    sections.push('### ➕ Extra Files (in target but not in source)');
    result.comparison.extraFiles.forEach((file) => {
      sections.push(`- ${file}`);
    });
  }

  if (result.comparison.sizeMismatches.length > 0) {
    sections.push('');
    sections.push('### ⚠️ Size Mismatches');
    result.comparison.sizeMismatches.forEach((mismatch) => {
      sections.push(
        `- **${mismatch.name}**: Source ${formatFileSize(mismatch.sourceSize)} → Target ${formatFileSize(mismatch.targetSize)}`
      );
    });
  }

  if (
    result.comparison.missingFiles.length === 0 &&
    result.comparison.extraFiles.length === 0 &&
    result.comparison.sizeMismatches.length === 0
  ) {
    sections.push('');
    sections.push('✅ **All files migrated successfully with matching sizes**');
  }

  sections.push('');

  return sections.join('\n');
}

/**
 * Analyze migration verification and generate insights
 */
export function analyzeMigrationVerification(result: MigrationVerification): {
  insights: string[];
  recommendations: string[];
} {
  const insights: string[] = [];
  const recommendations: string[] = [];

  insights.push(`Migration status: **${result.status}**`);
  insights.push(`Success rate: **${result.successRate}%**`);

  const missingCount = result.comparison.missingFiles.length;
  const extraCount = result.comparison.extraFiles.length;
  const sizeMismatchCount = result.comparison.sizeMismatches.length;

  if (missingCount > 0) {
    insights.push(`${missingCount} file(s) missing from target`);
    recommendations.push('Re-run migration for missing files');
    recommendations.push('Verify source files still exist');
  }

  if (extraCount > 0) {
    insights.push(`${extraCount} extra file(s) in target`);
    recommendations.push('Review extra files - may be from previous migrations');
  }

  if (sizeMismatchCount > 0) {
    insights.push(`${sizeMismatchCount} file(s) have size mismatches`);
    recommendations.push('Verify file integrity for size mismatches');
    recommendations.push('Check for partial uploads or corruption');
  }

  if (result.status === 'complete') {
    recommendations.push('✅ Migration completed successfully');
  } else if (result.status === 'incomplete') {
    recommendations.push('⚠️ Migration is incomplete - review missing files');
  } else {
    recommendations.push('❌ Migration failed - review errors and retry');
  }

  return { insights, recommendations };
}

// ============================================================================
// CRM Document Location Formatting
// ============================================================================

/**
 * Format CRM document locations as markdown table
 */
export function formatCrmDocumentLocationsAsMarkdown(
  locations: SharePointDocumentLocation[]
): string {
  if (!locations || locations.length === 0) {
    return '*No document locations found*';
  }

  const header = '| Name | Absolute URL | Relative URL | Regarding | Status |';
  const separator = '|------|--------------|--------------|-----------|--------|';

  const rows = locations.map((loc) => {
    const regarding = loc.regardingobjectid
      ? `${loc.regardingobjectid.logicalName}`
      : '-';
    const statusIcon = loc.statecode === 0 ? '✅ Active' : '❌ Inactive';

    return (
      `| ${loc.name} | ${loc.absoluteurl || '-'} | ${loc.relativeurl || '-'} | ${regarding} | ${statusIcon} |`
    );
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Analyze CRM document locations
 */
export function analyzeCrmDocumentLocations(
  locations: SharePointDocumentLocation[]
): {
  insights: string[];
  recommendations: string[];
} {
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (locations.length === 0) {
    insights.push('No document locations found');
    return { insights, recommendations };
  }

  insights.push(`**Total document locations:** ${locations.length}`);

  const activeCount = locations.filter(l => l.statecode === 0).length;
  const inactiveCount = locations.filter(l => l.statecode === 1).length;

  insights.push(`- ✅ Active: ${activeCount}`);
  insights.push(`- ❌ Inactive: ${inactiveCount}`);

  const missingUrlCount = locations.filter(l => !l.absoluteurl).length;
  if (missingUrlCount > 0) {
    insights.push(`- ⚠️ ${missingUrlCount} location(s) missing absolute URL`);
    recommendations.push('Configure absolute URLs for document locations');
  }

  // Group by entity
  const entityGroups = new Map<string, number>();
  locations.forEach(loc => {
    const entity = loc.regardingobjectid?.logicalName || 'Unknown';
    entityGroups.set(entity, (entityGroups.get(entity) || 0) + 1);
  });

  if (entityGroups.size > 0) {
    insights.push('');
    insights.push('**Locations by entity:**');
    Array.from(entityGroups.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([entity, count]) => {
        insights.push(`- ${entity}: ${count}`);
      });
  }

  return { insights, recommendations };
}
