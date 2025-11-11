/**
 * SharePoint Online Service
 *
 * Provides read-only access to SharePoint Online sites, document libraries, and files
 * through Microsoft Graph API with comprehensive PowerPlatform validation capabilities.
 *
 * Authentication: Microsoft Entra ID (OAuth 2.0) via MSAL
 * API: Microsoft Graph API v1.0
 * Primary Use Case: PowerPlatform-SharePoint integration validation
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import axios from 'axios';
import { auditLogger } from '@mcp-consultant-tools/core';
import type {
  SharePointConfig,
  SharePointSiteConfig,
  SiteInfo,
  DriveInfo,
  ItemInfo,
  FolderTree,
  SearchResult,
  CacheEntry,
  ConnectionTestResult,
  ValidationResult,
  MigrationVerification,
  SharePointDocumentLocation,
} from './types/sharepoint-types.js';

// Re-export types for external use
export type {
  SharePointConfig,
  SharePointSiteConfig,
  SiteInfo,
  DriveInfo,
  ItemInfo,
  FolderTree,
  SearchResult,
  ConnectionTestResult,
  ValidationResult,
  MigrationVerification,
  SharePointDocumentLocation,
};

/**
 * SharePoint Online Service
 *
 * Manages authentication, caching, and API requests to SharePoint Online via Graph API.
 * Follows established patterns from ApplicationInsightsService and LogAnalyticsService.
 */
export class SharePointService {
  private config: SharePointConfig;
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;
  private graphClient: Client | null = null;

  // Cache management (site info, drives, resolved site IDs)
  private cache: Map<string, CacheEntry<any>> = new Map();
  private siteIdCache: Map<string, string> = new Map();  // siteUrl → siteId

  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';

  constructor(config: SharePointConfig) {
    this.config = config;

    // Validate configuration
    if (!config.tenantId || !config.clientId || !config.clientSecret) {
      throw new Error('SharePoint Entra ID authentication requires tenantId, clientId, and clientSecret');
    }

    // Initialize MSAL client for Entra ID authentication
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });

    console.error('SharePoint service created (authentication not initialized until first use)');
  }

  /**
   * Get an access token for Microsoft Graph API (Entra ID auth)
   * Implements 5-minute token buffer before expiry (follows ApplicationInsightsService pattern)
   */
  private async getAccessToken(): Promise<string> {
    if (!this.msalClient) {
      throw new Error('MSAL client not initialized');
    }

    const currentTime = Date.now();

    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;

      // Set expiration time (subtract 5 minutes to refresh early)
      if (result.expiresOn) {
        this.tokenExpirationTime = result.expiresOn.getTime() - (5 * 60 * 1000);
      } else {
        // Default to 1 hour expiry if not provided
        this.tokenExpirationTime = Date.now() + (55 * 60 * 1000);
      }

      return this.accessToken;
    } catch (error: any) {
      console.error('Error acquiring access token:', error);
      throw new Error('SharePoint authentication failed: ' + error.message);
    }
  }

  /**
   * Initialize Graph Client with MSAL token provider
   */
  private async getGraphClient(): Promise<Client> {
    const token = await this.getAccessToken();

    // Create a simple auth provider that returns the token
    const authProvider = {
      getAccessToken: async () => token,
    };

    // Initialize Graph Client with auth provider
    this.graphClient = Client.init({
      authProvider: authProvider as any,
    });

    return this.graphClient;
  }

  /**
   * Get active sites
   */
  getActiveSites(): SharePointSiteConfig[] {
    return this.config.sites.filter(s => s.active);
  }

  /**
   * Get all sites (including inactive)
   */
  getAllSites(): SharePointSiteConfig[] {
    return this.config.sites;
  }

  /**
   * Get site configuration by ID
   */
  getSiteById(siteId: string): SharePointSiteConfig {
    const site = this.config.sites.find(s => s.id === siteId);
    if (!site) {
      const availableSites = this.getActiveSites().map(s => s.id).join(', ');
      throw new Error(
        `SharePoint site '${siteId}' not found. Available sites: ${availableSites}`
      );
    }
    if (!site.active) {
      throw new Error(
        `SharePoint site '${siteId}' is inactive. Set active=true in configuration to enable.`
      );
    }
    return site;
  }

  /**
   * Generate cache key for caching API responses
   * Format: {method}:{siteId}:{resource}:{params}
   */
  private getCacheKey(method: string, siteId: string, resource: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${method}:${siteId}:${resource}:${paramStr}`;
  }

  /**
   * Get cached value if not expired
   */
  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached value with TTL
   */
  private setCached(key: string, data: any): void {
    const ttl = (this.config.cacheTTL || 300) * 1000;  // Default: 5 minutes
    const expires = Date.now() + ttl;
    this.cache.set(key, { data, expires });
  }

  /**
   * Clear cache (all entries or by pattern/siteId)
   */
  clearCache(pattern?: string, siteId?: string): number {
    let clearedCount = 0;

    if (!pattern && !siteId) {
      // Clear all cache
      clearedCount = this.cache.size + this.siteIdCache.size;
      this.cache.clear();
      this.siteIdCache.clear();
    } else {
      // Clear matching entries
      const keysToDelete: string[] = [];

      for (const key of this.cache.keys()) {
        let shouldDelete = false;

        if (siteId && key.includes(`:${siteId}:`)) {
          shouldDelete = true;
        }

        if (pattern && key.includes(pattern)) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.cache.delete(key));
      clearedCount = keysToDelete.length;

      // Clear site ID cache if siteId specified
      if (siteId) {
        for (const [url, id] of this.siteIdCache.entries()) {
          if (id === siteId) {
            this.siteIdCache.delete(url);
            clearedCount++;
          }
        }
      }
    }

    console.error(`Cleared ${clearedCount} cache entries`);
    return clearedCount;
  }

  /**
   * Resolve SharePoint site URL to Graph API site ID
   * Format: {hostname},{site-collection-id},{web-id}
   * Example: contoso.sharepoint.com,00000000-0000-0000-0000-000000000000,11111111-1111-1111-1111-111111111111
   */
  private async resolveSiteId(siteUrl: string): Promise<string> {
    const timer = auditLogger.startTimer();

    // Check cache first
    const cached = this.siteIdCache.get(siteUrl);
    if (cached) {
      return cached;
    }

    try {
      // Parse site URL: https://contoso.sharepoint.com/sites/sitename
      const url = new URL(siteUrl);
      const hostname = url.hostname;
      const pathname = url.pathname;

      // Construct Graph API path: /sites/{hostname}:{path}
      const graphPath = `/sites/${hostname}:${pathname}`;

      const client = await this.getGraphClient();
      const response = await client.api(graphPath).get();

      if (!response || !response.id) {
        throw new Error('Site ID not found in response');
      }

      const siteId = response.id;

      // Cache for future use
      this.siteIdCache.set(siteUrl, siteId);

      auditLogger.log({
        operation: 'resolve-site-id',
        operationType: 'READ',
        componentType: 'Site',
        success: true,
        parameters: { siteUrl },
        executionTimeMs: timer(),
      });

      return siteId;
    } catch (error: any) {
      auditLogger.log({
        operation: 'resolve-site-id',
        operationType: 'READ',
        componentType: 'Site',
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteUrl },
        executionTimeMs: timer(),
      });

      throw new Error(`Failed to resolve site ID for ${siteUrl}: ${this.sanitizeErrorMessage(error)}`);
    }
  }

  /**
   * Sanitize error messages (remove sensitive information like tokens)
   */
  private sanitizeErrorMessage(error: any): string {
    let message = error.message || error.toString();

    // Remove tokens
    message = message.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer ***');
    message = message.replace(/\b[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}\b/g, '***');

    // Handle Graph API errors
    if (error.response?.data?.error) {
      const graphError = error.response.data.error;
      message = `${graphError.code}: ${graphError.message}`;
    }

    return message;
  }

  /**
   * Handle errors with user-friendly messages
   */
  private handleError(error: any, context: string): Error {
    let errorMessage = `SharePoint ${context} failed`;

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 401:
          errorMessage = 'Authentication failed. Check credentials and permissions.';
          break;
        case 403:
          errorMessage = 'Access denied. Ensure service principal has Sites.Read.All and Files.Read.All permissions.';
          break;
        case 404:
          errorMessage = 'Resource not found. Check site URL or item path.';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded. Reduce request frequency.';
          if (error.response.headers['retry-after']) {
            errorMessage += ` Retry after ${error.response.headers['retry-after']} seconds.`;
          }
          break;
        default:
          if (data?.error) {
            errorMessage = `${data.error.code}: ${data.error.message}`;
          } else {
            errorMessage = `HTTP ${status}: ${error.message}`;
          }
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Network error: Unable to reach SharePoint/Graph API.';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Request timeout. Try again later.';
    } else {
      errorMessage = this.sanitizeErrorMessage(error);
    }

    return new Error(errorMessage);
  }

  /**
   * Test connection to a SharePoint site
   */
  async testConnection(siteId: string): Promise<ConnectionTestResult> {
    const timer = auditLogger.startTimer();

    try {
      const site = this.getSiteById(siteId);
      const siteInfo = await this.getSiteInfo(siteId);

      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        componentType: 'Site',
        componentName: site.name,
        success: true,
        parameters: { siteId },
        executionTimeMs: timer(),
      });

      return {
        success: true,
        siteInfo,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        componentType: 'Site',
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId },
        executionTimeMs: timer(),
      });

      return {
        success: false,
        error: this.sanitizeErrorMessage(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get site information
   */
  async getSiteInfo(siteId: string): Promise<SiteInfo> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);

    // Check cache
    const cacheKey = this.getCacheKey('GET', siteId, 'site-info');
    const cached = this.getCached<SiteInfo>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const graphSiteId = await this.resolveSiteId(site.siteUrl);
      const client = await this.getGraphClient();

      const response = await client
        .api(`/sites/${graphSiteId}`)
        .select('id,webUrl,displayName,name,description,createdDateTime,lastModifiedDateTime,siteCollection')
        .get();

      const siteInfo: SiteInfo = {
        id: response.id,
        webUrl: response.webUrl,
        displayName: response.displayName,
        name: response.name,
        description: response.description,
        createdDateTime: response.createdDateTime,
        lastModifiedDateTime: response.lastModifiedDateTime,
        siteCollection: response.siteCollection,
      };

      // Cache result
      this.setCached(cacheKey, siteInfo);

      auditLogger.log({
        operation: 'get-site-info',
        operationType: 'READ',
        componentType: 'Site',
        componentName: site.name,
        success: true,
        parameters: { siteId },
        executionTimeMs: timer(),
      });

      return siteInfo;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-site-info',
        operationType: 'READ',
        componentType: 'Site',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'get site info');
    }
  }

  /**
   * List drives (document libraries) in a site
   */
  async listDrives(siteId: string): Promise<DriveInfo[]> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);

    // Check cache
    const cacheKey = this.getCacheKey('GET', siteId, 'drives');
    const cached = this.getCached<DriveInfo[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const graphSiteId = await this.resolveSiteId(site.siteUrl);
      const client = await this.getGraphClient();

      const response = await client
        .api(`/sites/${graphSiteId}/drives`)
        .select('id,name,description,webUrl,driveType,createdDateTime,lastModifiedDateTime,quota,owner')
        .get();

      const drives: DriveInfo[] = response.value || [];

      // Cache result
      this.setCached(cacheKey, drives);

      auditLogger.log({
        operation: 'list-drives',
        operationType: 'READ',
        componentType: 'Site',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveCount: drives.length },
        executionTimeMs: timer(),
      });

      return drives;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-drives',
        operationType: 'READ',
        componentType: 'Site',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'list drives');
    }
  }

  /**
   * Get drive (document library) information
   */
  async getDriveInfo(siteId: string, driveId: string): Promise<DriveInfo> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);

    // Check cache
    const cacheKey = this.getCacheKey('GET', siteId, `drive:${driveId}`);
    const cached = this.getCached<DriveInfo>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const client = await this.getGraphClient();

      const response = await client
        .api(`/drives/${driveId}`)
        .select('id,name,description,webUrl,driveType,createdDateTime,lastModifiedDateTime,quota,owner')
        .get();

      const driveInfo: DriveInfo = response;

      // Cache result
      this.setCached(cacheKey, driveInfo);

      auditLogger.log({
        operation: 'get-drive-info',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId },
        executionTimeMs: timer(),
      });

      return driveInfo;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-drive-info',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId, driveId },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'get drive info');
    }
  }

  /**
   * List items (files/folders) in a drive or folder
   */
  async listItems(siteId: string, driveId: string, folderId?: string): Promise<ItemInfo[]> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);

    try {
      const client = await this.getGraphClient();

      const path = folderId
        ? `/drives/${driveId}/items/${folderId}/children`
        : `/drives/${driveId}/root/children`;

      const response = await client
        .api(path)
        .select('id,name,webUrl,size,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,parentReference')
        .get();

      const items: ItemInfo[] = response.value || [];

      auditLogger.log({
        operation: 'list-items',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId, folderId, itemCount: items.length },
        executionTimeMs: timer(),
      });

      return items;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-items',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, folderId },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'list items');
    }
  }

  /**
   * Get item (file/folder) by ID
   */
  async getItem(siteId: string, driveId: string, itemId: string): Promise<ItemInfo> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);

    try {
      const client = await this.getGraphClient();

      const response = await client
        .api(`/drives/${driveId}/items/${itemId}`)
        .select('id,name,webUrl,size,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,parentReference')
        .get();

      const item: ItemInfo = response;

      auditLogger.log({
        operation: 'get-item',
        operationType: 'READ',
        componentType: 'Item',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId, itemId },
        executionTimeMs: timer(),
      });

      return item;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-item',
        operationType: 'READ',
        componentType: 'Item',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, itemId },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'get item');
    }
  }

  /**
   * Get item by path (relative to drive root)
   */
  async getItemByPath(siteId: string, driveId: string, path: string): Promise<ItemInfo> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);

    try {
      const client = await this.getGraphClient();

      // Ensure path starts with /
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;

      const response = await client
        .api(`/drives/${driveId}/root:${normalizedPath}`)
        .select('id,name,webUrl,size,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,parentReference')
        .get();

      const item: ItemInfo = response;

      auditLogger.log({
        operation: 'get-item-by-path',
        operationType: 'READ',
        componentType: 'Item',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId, path },
        executionTimeMs: timer(),
      });

      return item;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-item-by-path',
        operationType: 'READ',
        componentType: 'Item',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, path },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'get item by path');
    }
  }

  /**
   * Search items in a drive or site
   */
  async searchItems(siteId: string, query: string, driveId?: string, limit?: number): Promise<SearchResult> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);
    const maxResults = Math.min(limit || 100, this.config.maxSearchResults || 100);

    try {
      const graphSiteId = await this.resolveSiteId(site.siteUrl);
      const client = await this.getGraphClient();

      const path = driveId
        ? `/drives/${driveId}/root/search(q='${encodeURIComponent(query)}')`
        : `/sites/${graphSiteId}/drive/root/search(q='${encodeURIComponent(query)}')`;

      const response = await client
        .api(path)
        .top(maxResults)
        .select('id,name,webUrl,size,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,parentReference')
        .get();

      const items: ItemInfo[] = response.value || [];

      auditLogger.log({
        operation: 'search-items',
        operationType: 'READ',
        componentType: 'Search',
        componentName: site.name,
        success: true,
        parameters: { siteId, query, driveId, resultCount: items.length },
        executionTimeMs: timer(),
      });

      return {
        items,
        totalCount: items.length,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-items',
        operationType: 'READ',
        componentType: 'Search',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId, query, driveId },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'search items');
    }
  }

  /**
   * Get recent items in a drive
   */
  async getRecentItems(siteId: string, driveId: string, limit?: number, days?: number): Promise<ItemInfo[]> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);
    const maxResults = Math.min(limit || 20, 100);
    const daysBack = days || 30;

    try {
      const client = await this.getGraphClient();

      // Calculate date threshold
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - daysBack);
      const dateFilter = dateThreshold.toISOString();

      const response = await client
        .api(`/drives/${driveId}/root/children`)
        .select('id,name,webUrl,size,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,parentReference')
        .filter(`lastModifiedDateTime gt ${dateFilter}`)
        .orderby('lastModifiedDateTime desc')
        .top(maxResults)
        .get();

      const items: ItemInfo[] = response.value || [];

      auditLogger.log({
        operation: 'get-recent-items',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId, limit: maxResults, days: daysBack, resultCount: items.length },
        executionTimeMs: timer(),
      });

      return items;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-recent-items',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, limit: maxResults, days: daysBack },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'get recent items');
    }
  }

  /**
   * Get folder structure (recursive)
   */
  async getFolderStructure(siteId: string, driveId: string, folderId?: string, depth?: number): Promise<FolderTree> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);
    const maxDepth = Math.min(depth || 3, 10);  // Limit to 10 levels max

    try {
      // Get root folder or specified folder
      const rootItem = folderId
        ? await this.getItem(siteId, driveId, folderId)
        : await this.getItemByPath(siteId, driveId, '/');

      // Build tree recursively
      const tree = await this.buildFolderTree(siteId, driveId, rootItem, 0, maxDepth);

      auditLogger.log({
        operation: 'get-folder-structure',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId, folderId, depth: maxDepth },
        executionTimeMs: timer(),
      });

      return tree;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-folder-structure',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, folderId, depth: maxDepth },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'get folder structure');
    }
  }

  /**
   * Build folder tree recursively
   */
  private async buildFolderTree(
    siteId: string,
    driveId: string,
    item: ItemInfo,
    currentDepth: number,
    maxDepth: number
  ): Promise<FolderTree> {
    const tree: FolderTree = { item };

    // Stop if max depth reached or item is a file
    if (currentDepth >= maxDepth || !item.folder) {
      return tree;
    }

    // Get children
    const children = await this.listItems(siteId, driveId, item.id);

    // Recursively build tree for folders
    tree.children = await Promise.all(
      children
        .filter(child => child.folder)
        .map(child => this.buildFolderTree(siteId, driveId, child, currentDepth + 1, maxDepth))
    );

    return tree;
  }

  // ============================================================================
  // POWERPLATFORM VALIDATION METHODS (HIGH PRIORITY)
  // ============================================================================
  // These methods integrate SharePoint with PowerPlatform Dataverse to validate
  // document location configurations and migrations.
  // ============================================================================

  /**
   * Get CRM document locations from PowerPlatform
   *
   * Queries the sharepointdocumentlocation entity in Dataverse to retrieve
   * document location configurations for validation.
   *
   * @param powerPlatformService PowerPlatformService instance for querying Dataverse
   * @param entityName Optional entity logical name to filter by (e.g., 'account', 'contact')
   * @param recordId Optional record ID to filter by specific record
   * @returns Array of SharePoint document location records
   */
  async getCrmDocumentLocations(
    powerPlatformService: any,
    entityName?: string,
    recordId?: string
  ): Promise<SharePointDocumentLocation[]> {
    const timer = auditLogger.startTimer();

    try {
      // Build OData filter
      let filter = 'statecode eq 0';  // Active only

      if (entityName && recordId) {
        // Filter by specific record
        filter += ` and _regardingobjectid_value eq ${recordId}`;
      } else if (entityName) {
        // Filter by entity type (need to query by logical name)
        // This requires a join which is complex in OData, so we'll fetch all and filter client-side
      }

      // Query sharepointdocumentlocation entity
      const response = await powerPlatformService.queryRecords(
        'sharepointdocumentlocations',
        filter,
        1000  // Max records
      );

      // Parse response
      const locations: SharePointDocumentLocation[] = [];

      for (const record of response.value || []) {
        const location: SharePointDocumentLocation = {
          sharepointdocumentlocationid: record.sharepointdocumentlocationid,
          name: record.name || '',
          absoluteurl: record.absoluteurl || '',
          relativeurl: record.relativeurl || '',
          statecode: record.statecode || 0,
          statuscode: record.statuscode || 1,
        };

        // Parse regarding object (related entity)
        if (record._regardingobjectid_value) {
          location.regardingobjectid = {
            id: record._regardingobjectid_value,
            logicalName: record['_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] || '',
          };
        }

        // Parse parent site or location
        if (record._parentsiteorlocation_value) {
          location.parentsiteorlocation = {
            id: record._parentsiteorlocation_value,
            logicalName: record['_parentsiteorlocation_value@Microsoft.Dynamics.CRM.lookuplogicalname'] || '',
          };
        }

        // Site collection ID
        if (record.sitecollectionid) {
          location.sitecollectionid = record.sitecollectionid;
        }

        locations.push(location);
      }

      // Client-side filtering by entity name if needed
      let filtered = locations;
      if (entityName && !recordId) {
        filtered = locations.filter(
          loc => loc.regardingobjectid?.logicalName === entityName
        );
      }

      auditLogger.log({
        operation: 'get-crm-document-locations',
        operationType: 'READ',
        componentType: 'DocumentLocation',
        success: true,
        parameters: { entityName, recordId, resultCount: filtered.length },
        executionTimeMs: timer(),
      });

      return filtered;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-crm-document-locations',
        operationType: 'READ',
        componentType: 'DocumentLocation',
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { entityName, recordId },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'get CRM document locations');
    }
  }

  /**
   * Validate a document location configuration
   *
   * Validates that a PowerPlatform document location configuration matches
   * the actual SharePoint site structure. Checks:
   * - Site exists and is accessible
   * - Folder exists at the specified path
   * - Folder is accessible
   * - File count and empty folder detection
   *
   * @param powerPlatformService PowerPlatformService instance
   * @param documentLocationId GUID of the sharepointdocumentlocation record
   * @returns Validation result with status, issues, and recommendations
   */
  async validateDocumentLocation(
    powerPlatformService: any,
    documentLocationId: string
  ): Promise<ValidationResult> {
    const timer = auditLogger.startTimer();

    try {
      // Get document location from CRM
      const record = await powerPlatformService.getRecord(
        'sharepointdocumentlocations',
        documentLocationId
      );

      if (!record) {
        throw new Error(`Document location ${documentLocationId} not found`);
      }

      // Parse CRM configuration
      const absoluteUrl = record.absoluteurl || '';
      const relativeUrl = record.relativeurl || '';
      const regardingEntityName = record['_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] || '';
      const regardingRecordId = record._regardingobjectid_value || '';
      const isActive = record.statecode === 0;

      // Initialize validation result
      const result: ValidationResult = {
        documentLocationId,
        documentLocationName: record.name || '',
        crmConfig: {
          absoluteUrl,
          relativeUrl,
          regardingEntity: regardingEntityName,
          regardingRecordId,
          isActive,
        },
        spoValidation: {
          siteExists: false,
          folderExists: false,
          folderAccessible: false,
          fileCount: 0,
          isEmpty: true,
        },
        status: 'error',
        issues: [],
        recommendations: [],
      };

      // Check if absolute URL is configured
      if (!absoluteUrl) {
        result.issues.push('Absolute URL is not configured in CRM');
        result.recommendations.push('Configure the absoluteurl field in the document location record');

        auditLogger.log({
          operation: 'validate-document-location',
          operationType: 'READ',
          componentType: 'DocumentLocation',
          componentName: result.documentLocationName,
          success: true,
          parameters: { documentLocationId, status: result.status },
          executionTimeMs: timer(),
        });

        return result;
      }

      // Parse site URL and folder path from absolute URL
      // Format: https://contoso.sharepoint.com/sites/sitename/DocumentLibrary/folder1/folder2
      let siteUrl: string;
      let folderPath: string;

      try {
        const url = new URL(absoluteUrl);
        const pathParts = url.pathname.split('/').filter(p => p);

        // Find /sites/ index
        const sitesIndex = pathParts.indexOf('sites');
        if (sitesIndex === -1) {
          throw new Error('URL does not contain /sites/ path');
        }

        // Site URL: https://contoso.sharepoint.com/sites/sitename
        const siteName = pathParts[sitesIndex + 1];
        siteUrl = `${url.protocol}//${url.hostname}/sites/${siteName}`;

        // Folder path: /DocumentLibrary/folder1/folder2
        const libraryAndFolder = pathParts.slice(sitesIndex + 2);
        folderPath = '/' + libraryAndFolder.join('/');
      } catch (parseError: any) {
        result.issues.push(`Failed to parse absolute URL: ${parseError.message}`);
        result.recommendations.push('Verify the absolute URL format in CRM');

        auditLogger.log({
          operation: 'validate-document-location',
          operationType: 'READ',
          componentType: 'DocumentLocation',
          componentName: result.documentLocationName,
          success: true,
          parameters: { documentLocationId, status: result.status },
          executionTimeMs: timer(),
        });

        return result;
      }

      // Validate site exists
      try {
        const siteId = await this.resolveSiteId(siteUrl);
        const siteInfo = await this.getSiteInfo(siteId);
        result.spoValidation.siteExists = true;
      } catch (siteError: any) {
        result.issues.push(`SharePoint site not found: ${siteUrl}`);
        result.recommendations.push('Verify the site URL is correct and accessible');
        result.recommendations.push('Check that the service principal has access to the site');

        auditLogger.log({
          operation: 'validate-document-location',
          operationType: 'READ',
          componentType: 'DocumentLocation',
          componentName: result.documentLocationName,
          success: true,
          parameters: { documentLocationId, status: result.status },
          executionTimeMs: timer(),
        });

        return result;
      }

      // Find the site in configured sites
      const configuredSite = this.config.sites.find(s => s.siteUrl === siteUrl);
      if (!configuredSite) {
        result.issues.push(`Site ${siteUrl} is not configured in SHAREPOINT_SITES`);
        result.recommendations.push('Add the site to SHAREPOINT_SITES configuration');
        result.status = 'warning';

        auditLogger.log({
          operation: 'validate-document-location',
          operationType: 'READ',
          componentType: 'DocumentLocation',
          componentName: result.documentLocationName,
          success: true,
          parameters: { documentLocationId, status: result.status },
          executionTimeMs: timer(),
        });

        return result;
      }

      const siteId = configuredSite.id;

      // Validate folder exists and is accessible
      try {
        // Get drives (document libraries)
        const drives = await this.listDrives(siteId);

        // Parse library name from folder path
        const libraryName = folderPath.split('/').filter(p => p)[0];
        const drive = drives.find(d => d.name === libraryName);

        if (!drive) {
          result.issues.push(`Document library '${libraryName}' not found in site`);
          result.recommendations.push('Verify the library name in the absolute URL');
          result.status = 'warning';

          auditLogger.log({
            operation: 'validate-document-location',
            operationType: 'READ',
            componentType: 'DocumentLocation',
            componentName: result.documentLocationName,
            success: true,
            parameters: { documentLocationId, status: result.status },
            executionTimeMs: timer(),
          });

          return result;
        }

        result.spoValidation.folderExists = true;

        // Get folder contents
        try {
          const items = await this.getItemByPath(siteId, drive.id, folderPath);
          result.spoValidation.folderAccessible = true;

          // Count files in folder
          if (items.folder) {
            const folderContents = await this.listItems(siteId, drive.id, items.id);
            result.spoValidation.fileCount = folderContents.length;
            result.spoValidation.isEmpty = folderContents.length === 0;
          }

          // Determine overall status
          if (result.spoValidation.isEmpty) {
            result.status = 'warning';
            result.issues.push('Folder is empty (no files found)');
            result.recommendations.push('Upload documents to the folder or verify the folder path');
          } else {
            result.status = 'valid';
          }
        } catch (folderError: any) {
          result.spoValidation.folderExists = false;
          result.issues.push(`Folder not accessible at path: ${folderPath}`);
          result.recommendations.push('Verify the folder path is correct');
          result.recommendations.push('Check that the folder exists in SharePoint');
          result.status = 'error';
        }
      } catch (driveError: any) {
        result.issues.push(`Failed to access document libraries: ${driveError.message}`);
        result.recommendations.push('Verify service principal has Read permissions on the site');
        result.status = 'error';
      }

      auditLogger.log({
        operation: 'validate-document-location',
        operationType: 'READ',
        componentType: 'DocumentLocation',
        componentName: result.documentLocationName,
        success: true,
        parameters: { documentLocationId, status: result.status },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'validate-document-location',
        operationType: 'READ',
        componentType: 'DocumentLocation',
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { documentLocationId },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'validate document location');
    }
  }

  /**
   * Verify document migration between two SharePoint locations
   *
   * Compares file counts, sizes, and names between source and target folders
   * to verify successful migration.
   *
   * @param powerPlatformService PowerPlatformService instance (unused but kept for consistency)
   * @param sourceSiteId Source SharePoint site ID
   * @param sourcePath Source folder path
   * @param targetSiteId Target SharePoint site ID
   * @param targetPath Target folder path
   * @returns Migration verification result with comparison details
   */
  async verifyDocumentMigration(
    powerPlatformService: any,
    sourceSiteId: string,
    sourcePath: string,
    targetSiteId: string,
    targetPath: string
  ): Promise<MigrationVerification> {
    const timer = auditLogger.startTimer();

    try {
      const sourceSite = this.getSiteById(sourceSiteId);
      const targetSite = this.getSiteById(targetSiteId);

      // Get source folder contents
      const sourceDrives = await this.listDrives(sourceSiteId);
      const sourceLibraryName = sourcePath.split('/').filter(p => p)[0];
      const sourceDrive = sourceDrives.find(d => d.name === sourceLibraryName);

      if (!sourceDrive) {
        throw new Error(`Source library '${sourceLibraryName}' not found`);
      }

      const sourceFolder = await this.getItemByPath(sourceSiteId, sourceDrive.id, sourcePath);
      const sourceItems = await this.listItems(sourceSiteId, sourceDrive.id, sourceFolder.id);

      // Get target folder contents
      const targetDrives = await this.listDrives(targetSiteId);
      const targetLibraryName = targetPath.split('/').filter(p => p)[0];
      const targetDrive = targetDrives.find(d => d.name === targetLibraryName);

      if (!targetDrive) {
        throw new Error(`Target library '${targetLibraryName}' not found`);
      }

      const targetFolder = await this.getItemByPath(targetSiteId, targetDrive.id, targetPath);
      const targetItems = await this.listItems(targetSiteId, targetDrive.id, targetFolder.id);

      // Calculate totals
      const sourceTotalSize = sourceItems.reduce((sum, item) => sum + (item.size || 0), 0);
      const targetTotalSize = targetItems.reduce((sum, item) => sum + (item.size || 0), 0);

      // Compare files
      const sourceFileNames = new Set(sourceItems.map(i => i.name));
      const targetFileNames = new Set(targetItems.map(i => i.name));

      const missingFiles = sourceItems
        .filter(i => !targetFileNames.has(i.name))
        .map(i => i.name);

      const extraFiles = targetItems
        .filter(i => !sourceFileNames.has(i.name))
        .map(i => i.name);

      // Compare sizes
      const sizeMismatches: Array<{ name: string; sourceSize: number; targetSize: number }> = [];
      const modifiedDateMismatches: Array<{ name: string; sourceDate: string; targetDate: string }> = [];

      for (const sourceItem of sourceItems) {
        const targetItem = targetItems.find(t => t.name === sourceItem.name);
        if (targetItem) {
          if (sourceItem.size !== targetItem.size) {
            sizeMismatches.push({
              name: sourceItem.name,
              sourceSize: sourceItem.size || 0,
              targetSize: targetItem.size || 0,
            });
          }

          if (sourceItem.lastModifiedDateTime !== targetItem.lastModifiedDateTime) {
            modifiedDateMismatches.push({
              name: sourceItem.name,
              sourceDate: sourceItem.lastModifiedDateTime,
              targetDate: targetItem.lastModifiedDateTime,
            });
          }
        }
      }

      // Calculate success rate
      const expectedFileCount = sourceItems.length;
      const actualFileCount = targetItems.length - extraFiles.length;
      const successRate = expectedFileCount > 0
        ? Math.round((actualFileCount / expectedFileCount) * 100)
        : 100;

      // Determine status
      let status: 'complete' | 'incomplete' | 'failed';
      if (missingFiles.length === 0 && sizeMismatches.length === 0) {
        status = 'complete';
      } else if (missingFiles.length > 0 || sizeMismatches.length > 0) {
        if (successRate < 50) {
          status = 'failed';
        } else {
          status = 'incomplete';
        }
      } else {
        status = 'complete';
      }

      const result: MigrationVerification = {
        source: {
          path: sourcePath,
          fileCount: sourceItems.length,
          totalSize: sourceTotalSize,
          files: sourceItems,
        },
        target: {
          path: targetPath,
          fileCount: targetItems.length,
          totalSize: targetTotalSize,
          files: targetItems,
        },
        comparison: {
          missingFiles,
          extraFiles,
          sizeMismatches,
          modifiedDateMismatches,
        },
        successRate,
        status,
      };

      auditLogger.log({
        operation: 'verify-document-migration',
        operationType: 'READ',
        componentType: 'Migration',
        success: true,
        parameters: {
          sourceSiteId,
          sourcePath,
          targetSiteId,
          targetPath,
          status,
          successRate,
        },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'verify-document-migration',
        operationType: 'READ',
        componentType: 'Migration',
        success: false,
        error: this.sanitizeErrorMessage(error),
        parameters: { sourceSiteId, sourcePath, targetSiteId, targetPath },
        executionTimeMs: timer(),
      });

      throw this.handleError(error, 'verify document migration');
    }
  }

  /**
   * Close service and clear resources
   */
  async close(): Promise<void> {
    this.accessToken = null;
    this.tokenExpirationTime = 0;
    this.graphClient = null;
    this.cache.clear();
    this.siteIdCache.clear();
    console.error('SharePoint service closed');
  }
}
