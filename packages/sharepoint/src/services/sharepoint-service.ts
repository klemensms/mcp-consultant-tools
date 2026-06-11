/**
 * SharePoint Online Service - Core
 *
 * Authentication, caching, site/drive operations via Microsoft Graph API.
 * Item-level operations (list, search, folder structure, PP validation)
 * are in list-service.ts.
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { auditLogger } from '@mcp-consultant-tools/core';
import type {
  SharePointConfig,
  SharePointSiteConfig,
  SiteInfo,
  DriveInfo,
  ItemInfo,
  CacheEntry,
  ConnectionTestResult,
} from '../types/sharepoint-types.js';

// Re-export types for external use
export type {
  SharePointConfig,
  SharePointSiteConfig,
  SiteInfo,
  DriveInfo,
  ItemInfo,
  ConnectionTestResult,
};

export class SharePointService {
  private config: SharePointConfig;
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;
  private graphClient: Client | null = null;

  // Cache management (site info, drives, resolved site IDs)
  private cache: Map<string, CacheEntry<any>> = new Map();
  private siteIdCache: Map<string, string> = new Map();  // siteUrl → siteId

  constructor(config: SharePointConfig) {
    this.config = config;

    if (!config.tenantId || !config.clientId || !config.clientSecret) {
      throw new Error('SharePoint Entra ID authentication requires tenantId, clientId, and clientSecret');
    }

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
   * Implements 5-minute token buffer before expiry
   */
  private async getAccessToken(): Promise<string> {
    if (!this.msalClient) {
      throw new Error('MSAL client not initialized');
    }

    const currentTime = Date.now();
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      console.error(`[SharePoint] Acquiring token for tenant: ${this.config.tenantId}, client: ${this.config.clientId}`);

      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;
      console.error(`[SharePoint] Token acquired successfully, expires: ${result.expiresOn}`);

      if (result.expiresOn) {
        this.tokenExpirationTime = result.expiresOn.getTime() - (5 * 60 * 1000);
      } else {
        this.tokenExpirationTime = Date.now() + (55 * 60 * 1000);
      }

      return this.accessToken;
    } catch (error: any) {
      console.error('[SharePoint] Token acquisition failed:', error.message);
      console.error('[SharePoint] Error details:', JSON.stringify({
        errorCode: error.errorCode,
        errorMessage: error.errorMessage,
        subError: error.subError,
      }));
      throw new Error('SharePoint authentication failed: ' + error.message);
    }
  }

  /**
   * Get an authenticated Graph client for use by external services
   */
  async getAuthenticatedGraphClient(): Promise<Client> {
    return this.getGraphClient();
  }

  /**
   * Resolve a user-friendly site ID to a Graph API site ID for use by external services
   */
  async getGraphSiteId(siteId: string): Promise<string> {
    const site = this.getSiteById(siteId);
    return this.resolveSiteId(site.siteUrl);
  }

  /**
   * Initialize Graph Client with MSAL token provider
   */
  private async getGraphClient(): Promise<Client> {
    const token = await this.getAccessToken();
    this.graphClient = Client.init({
      authProvider: (done) => {
        done(null, token);
      },
    });
    return this.graphClient;
  }

  /** Get active sites */
  getActiveSites(): SharePointSiteConfig[] {
    return this.config.sites.filter(s => s.active);
  }

  /** Get all sites (including inactive) */
  getAllSites(): SharePointSiteConfig[] {
    return this.config.sites;
  }

  /** Get site configuration by ID */
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

  /** Get the raw config (for list-service access) */
  getConfig(): SharePointConfig {
    return this.config;
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  private getCacheKey(method: string, siteId: string, resource: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${method}:${siteId}:${resource}:${paramStr}`;
  }

  getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  setCached(key: string, data: any): void {
    const ttl = (this.config.cacheTTL || 300) * 1000;
    this.cache.set(key, { data, expires: Date.now() + ttl });
  }

  clearCache(pattern?: string, siteId?: string): number {
    let clearedCount = 0;

    if (!pattern && !siteId) {
      clearedCount = this.cache.size + this.siteIdCache.size;
      this.cache.clear();
      this.siteIdCache.clear();
    } else {
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        let shouldDelete = false;
        if (siteId && key.includes(`:${siteId}:`)) shouldDelete = true;
        if (pattern && key.includes(pattern)) shouldDelete = true;
        if (shouldDelete) keysToDelete.push(key);
      }
      keysToDelete.forEach(key => this.cache.delete(key));
      clearedCount = keysToDelete.length;

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

  // ============================================================================
  // Site ID Resolution
  // ============================================================================

  async resolveSiteId(siteUrl: string): Promise<string> {
    const timer = auditLogger.startTimer();

    const cached = this.siteIdCache.get(siteUrl);
    if (cached) return cached;

    try {
      const url = new URL(siteUrl);
      const hostname = url.hostname;
      const pathname = url.pathname.replace(/\/+$/, '');
      const graphPath = `/sites/${hostname}:${pathname}`;
      console.error(`[SharePoint] Resolving site: ${graphPath}`);

      const client = await this.getGraphClient();
      const response = await client.api(graphPath).get();

      if (!response || !response.id) {
        throw new Error('Site ID not found in response');
      }

      this.siteIdCache.set(siteUrl, response.id);

      auditLogger.log({
        operation: 'resolve-site-id',
        operationType: 'READ',
        componentType: 'Site',
        success: true,
        parameters: { siteUrl },
        executionTimeMs: timer(),
      });

      return response.id;
    } catch (error: any) {
      let errorDetail = error.message || 'Unknown error';
      if (error.code) errorDetail = `${error.code}: ${errorDetail}`;
      if (error.body) {
        try {
          const body = typeof error.body === 'string' ? JSON.parse(error.body) : error.body;
          if (body.error) errorDetail = `${body.error.code}: ${body.error.message}`;
        } catch { /* ignore */ }
      }
      if (error.statusCode) errorDetail = `HTTP ${error.statusCode}: ${errorDetail}`;

      console.error(`[SharePoint] resolveSiteId error details:`, JSON.stringify({
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        body: error.body,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      }, null, 2));

      auditLogger.log({
        operation: 'resolve-site-id',
        operationType: 'READ',
        componentType: 'Site',
        success: false,
        error: errorDetail,
        parameters: { siteUrl },
        executionTimeMs: timer(),
      });

      throw new Error(`Failed to resolve site ID for ${siteUrl}: ${errorDetail}`);
    }
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  sanitizeErrorMessage(error: any): string {
    let message = error.message || error.toString();
    message = message.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer ***');
    message = message.replace(/\b[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}\b/g, '***');
    if (error.response?.data?.error) {
      const graphError = error.response.data.error;
      message = `${graphError.code}: ${graphError.message}`;
    }
    return message;
  }

  handleError(error: any, context: string): Error {
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

  // ============================================================================
  // Site & Drive Operations
  // ============================================================================

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
      return { success: true, siteInfo, timestamp: new Date().toISOString() };
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
      return { success: false, error: this.sanitizeErrorMessage(error), timestamp: new Date().toISOString() };
    }
  }

  async getSiteInfo(siteId: string): Promise<SiteInfo> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);
    const cacheKey = this.getCacheKey('GET', siteId, 'site-info');
    const cached = this.getCached<SiteInfo>(cacheKey);
    if (cached) return cached;

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

  async listDrives(siteId: string): Promise<DriveInfo[]> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);
    const cacheKey = this.getCacheKey('GET', siteId, 'drives');
    const cached = this.getCached<DriveInfo[]>(cacheKey);
    if (cached) return cached;

    try {
      const graphSiteId = await this.resolveSiteId(site.siteUrl);
      const client = await this.getGraphClient();
      const response = await client
        .api(`/sites/${graphSiteId}/drives`)
        .select('id,name,description,webUrl,driveType,createdDateTime,lastModifiedDateTime,quota,owner')
        .get();

      const drives: DriveInfo[] = response.value || [];
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

  async getDriveInfo(siteId: string, driveId: string): Promise<DriveInfo> {
    const timer = auditLogger.startTimer();
    const site = this.getSiteById(siteId);
    const cacheKey = this.getCacheKey('GET', siteId, `drive:${driveId}`);
    const cached = this.getCached<DriveInfo>(cacheKey);
    if (cached) return cached;

    try {
      const client = await this.getGraphClient();
      const response = await client
        .api(`/drives/${driveId}`)
        .select('id,name,description,webUrl,driveType,createdDateTime,lastModifiedDateTime,quota,owner')
        .get();

      this.setCached(cacheKey, response);

      auditLogger.log({
        operation: 'get-drive-info',
        operationType: 'READ',
        componentType: 'Drive',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId },
        executionTimeMs: timer(),
      });
      return response;
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

  /** Close service and clear resources */
  async close(): Promise<void> {
    this.accessToken = null;
    this.tokenExpirationTime = 0;
    this.graphClient = null;
    this.cache.clear();
    this.siteIdCache.clear();
    console.error('SharePoint service closed');
  }
}
