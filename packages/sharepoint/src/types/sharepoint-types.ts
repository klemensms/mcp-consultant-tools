/**
 * SharePoint Online Integration - Type Definitions
 *
 * TypeScript interfaces for SharePoint sites, drives, items, and configuration.
 * Based on Microsoft Graph API response shapes.
 */

/**
 * SharePoint Site Configuration
 */
export interface SharePointSiteConfig {
  id: string;                    // User-friendly ID (e.g., "main-site")
  name: string;                  // Display name (e.g., "Main SharePoint Site")
  siteUrl: string;               // Full site URL (e.g., "https://contoso.sharepoint.com/sites/main")
  active: boolean;               // Enable/disable toggle
  description?: string;          // Optional description
  defaultDriveId?: string;       // Optional default library ID
}

/**
 * SharePoint Service Configuration
 */
export interface SharePointConfig {
  sites: SharePointSiteConfig[];
  authMethod: 'entra-id';        // Only Entra ID supported (Graph API requirement)
  tenantId: string;
  clientId: string;
  clientSecret: string;
  cacheTTL?: number;             // Cache TTL in seconds (default: 300)
  maxSearchResults?: number;     // Max search results (default: 100)
}

/**
 * Site Information (from Graph API /sites/{site-id})
 */
export interface SiteInfo {
  id: string;                    // Site ID (GUID format: hostname,siteId,webId)
  webUrl: string;                // Site URL
  displayName: string;           // Site title
  name?: string;                 // Site name
  description?: string;          // Site description
  createdDateTime: string;       // ISO 8601 date
  lastModifiedDateTime: string;  // ISO 8601 date
  siteCollection?: {
    hostname: string;            // SharePoint hostname
  };
}

/**
 * Drive (Document Library) Information (from Graph API /drives/{drive-id})
 */
export interface DriveInfo {
  id: string;                    // Drive ID (GUID)
  name: string;                  // Library name
  description?: string;          // Library description
  webUrl: string;                // Library URL
  driveType: string;             // 'documentLibrary', 'personal', etc.
  createdDateTime: string;       // ISO 8601 date
  lastModifiedDateTime: string;  // ISO 8601 date
  quota?: {
    total: number;               // Total bytes
    used: number;                // Used bytes
    remaining: number;           // Remaining bytes
    state: string;               // 'normal', 'nearing', 'critical', 'exceeded'
  };
  owner?: {
    user?: {
      displayName: string;
      email?: string;
    };
  };
}

/**
 * Item (File/Folder) Information (from Graph API /drives/{drive-id}/items/{item-id})
 */
export interface ItemInfo {
  id: string;                    // Item ID (GUID)
  name: string;                  // File/folder name
  webUrl: string;                // Item URL
  size?: number;                 // Size in bytes
  createdDateTime: string;       // ISO 8601 date
  lastModifiedDateTime: string;  // ISO 8601 date
  createdBy?: {
    user?: {
      displayName: string;
      email?: string;
    };
  };
  lastModifiedBy?: {
    user?: {
      displayName: string;
      email?: string;
    };
  };
  file?: {                       // Present if item is a file
    mimeType: string;
    hashes?: {
      sha256Hash?: string;
    };
  };
  folder?: {                     // Present if item is a folder
    childCount: number;
  };
  parentReference?: {
    driveId: string;
    id: string;
    path: string;
  };
}

/**
 * Folder Tree Structure (for recursive folder listing)
 */
export interface FolderTree {
  item: ItemInfo;
  children?: FolderTree[];
}

/**
 * Search Result
 */
export interface SearchResult {
  items: ItemInfo[];
  totalCount?: number;
}

/**
 * SharePoint Document Location (from PowerPlatform CRM)
 */
export interface SharePointDocumentLocation {
  sharepointdocumentlocationid: string;  // GUID
  name: string;                           // Display name
  absoluteurl: string;                    // Full URL to folder
  relativeurl: string;                    // Relative path (e.g., 'account_12345')
  regardingobjectid?: {                   // Related entity record
    id: string;
    logicalName: string;                  // e.g., 'account', 'contact'
  };
  parentsiteorlocation?: {                // Parent location
    id: string;
    logicalName: string;                  // 'sharepointdocumentlocation' or 'sharepointsite'
  };
  sitecollectionid?: string;              // Site collection GUID
  statecode: number;                      // 0 = Active, 1 = Inactive
  statuscode: number;                     // Status reason
}

/**
 * Document Location Validation Result
 */
export interface ValidationResult {
  documentLocationId: string;
  documentLocationName: string;
  crmConfig: {
    absoluteUrl: string;
    relativeUrl: string;
    regardingEntity?: string;
    regardingRecordId?: string;
    isActive: boolean;
  };
  spoValidation: {
    siteExists: boolean;
    folderExists: boolean;
    folderAccessible: boolean;
    fileCount: number;
    isEmpty: boolean;
  };
  status: 'valid' | 'warning' | 'error';
  issues: string[];
  recommendations: string[];
}

/**
 * Migration Verification Result
 */
export interface MigrationVerification {
  source: {
    path: string;
    fileCount: number;
    totalSize: number;
    files: ItemInfo[];
  };
  target: {
    path: string;
    fileCount: number;
    totalSize: number;
    files: ItemInfo[];
  };
  comparison: {
    missingFiles: string[];
    extraFiles: string[];
    sizeMismatches: Array<{ name: string; sourceSize: number; targetSize: number }>;
    modifiedDateMismatches: Array<{ name: string; sourceDate: string; targetDate: string }>;
  };
  successRate: number;  // Percentage (0-100)
  status: 'complete' | 'incomplete' | 'failed';
}

/**
 * Cache Entry
 */
export interface CacheEntry<T> {
  data: T;
  expires: number;  // Timestamp (ms since epoch)
}

/**
 * Connection Test Result
 */
export interface ConnectionTestResult {
  success: boolean;
  siteInfo?: SiteInfo;
  error?: string;
  timestamp: string;
}
