/**
 * SharePoint List Service
 *
 * Item-level operations: list, get, search, folder structure, and
 * PowerPlatform document location validation/migration verification.
 * Depends on SharePointService for auth, cache, and site/drive resolution.
 */

import { auditLogger } from '@mcp-consultant-tools/core';
import type { SharePointService } from './sharepoint-service.js';
import type {
  ItemInfo,
  FolderTree,
  SearchResult,
  ValidationResult,
  MigrationVerification,
  SharePointDocumentLocation,
} from '../types/sharepoint-types.js';

export class ListService {
  private spo: SharePointService;

  constructor(spo: SharePointService) {
    this.spo = spo;
  }

  // ============================================================================
  // Item Operations
  // ============================================================================

  async listItems(siteId: string, driveId: string, folderId?: string): Promise<ItemInfo[]> {
    const timer = auditLogger.startTimer();
    const site = this.spo.getSiteById(siteId);

    try {
      const client = await this.spo.getAuthenticatedGraphClient();
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
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, folderId },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'list items');
    }
  }

  async getItem(siteId: string, driveId: string, itemId: string): Promise<ItemInfo> {
    const timer = auditLogger.startTimer();
    const site = this.spo.getSiteById(siteId);

    try {
      const client = await this.spo.getAuthenticatedGraphClient();
      const response = await client
        .api(`/drives/${driveId}/items/${itemId}`)
        .select('id,name,webUrl,size,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,parentReference')
        .get();

      auditLogger.log({
        operation: 'get-item',
        operationType: 'READ',
        componentType: 'Item',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId, itemId },
        executionTimeMs: timer(),
      });
      return response;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-item',
        operationType: 'READ',
        componentType: 'Item',
        componentName: site.name,
        success: false,
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, itemId },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'get item');
    }
  }

  async getItemByPath(siteId: string, driveId: string, path: string): Promise<ItemInfo> {
    const timer = auditLogger.startTimer();
    const site = this.spo.getSiteById(siteId);

    try {
      const client = await this.spo.getAuthenticatedGraphClient();
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;

      const response = await client
        .api(`/drives/${driveId}/root:${normalizedPath}`)
        .select('id,name,webUrl,size,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,parentReference')
        .get();

      auditLogger.log({
        operation: 'get-item-by-path',
        operationType: 'READ',
        componentType: 'Item',
        componentName: site.name,
        success: true,
        parameters: { siteId, driveId, path },
        executionTimeMs: timer(),
      });
      return response;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-item-by-path',
        operationType: 'READ',
        componentType: 'Item',
        componentName: site.name,
        success: false,
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, path },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'get item by path');
    }
  }

  async searchItems(siteId: string, query: string, driveId?: string, limit?: number): Promise<SearchResult> {
    const timer = auditLogger.startTimer();
    const site = this.spo.getSiteById(siteId);
    const config = this.spo.getConfig();
    const maxResults = Math.min(limit || 100, config.maxSearchResults || 100);

    try {
      const graphSiteId = await this.spo.resolveSiteId(site.siteUrl);
      const client = await this.spo.getAuthenticatedGraphClient();

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
      return { items, totalCount: items.length };
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-items',
        operationType: 'READ',
        componentType: 'Search',
        componentName: site.name,
        success: false,
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { siteId, query, driveId },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'search items');
    }
  }

  async getRecentItems(siteId: string, driveId: string, limit?: number, days?: number): Promise<ItemInfo[]> {
    const timer = auditLogger.startTimer();
    const site = this.spo.getSiteById(siteId);
    const maxResults = Math.min(limit || 20, 100);
    const daysBack = days || 30;

    try {
      const client = await this.spo.getAuthenticatedGraphClient();
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
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, limit: maxResults, days: daysBack },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'get recent items');
    }
  }

  // ============================================================================
  // Folder Structure
  // ============================================================================

  async getFolderStructure(siteId: string, driveId: string, folderId?: string, depth?: number): Promise<FolderTree> {
    const timer = auditLogger.startTimer();
    const site = this.spo.getSiteById(siteId);
    const maxDepth = Math.min(depth || 3, 10);

    try {
      const rootItem = folderId
        ? await this.getItem(siteId, driveId, folderId)
        : await this.getItemByPath(siteId, driveId, '/');

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
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { siteId, driveId, folderId, depth: maxDepth },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'get folder structure');
    }
  }

  private async buildFolderTree(
    siteId: string,
    driveId: string,
    item: ItemInfo,
    currentDepth: number,
    maxDepth: number
  ): Promise<FolderTree> {
    const tree: FolderTree = { item };
    if (currentDepth >= maxDepth || !item.folder) return tree;

    const children = await this.listItems(siteId, driveId, item.id);
    tree.children = await Promise.all(
      children
        .filter(child => child.folder)
        .map(child => this.buildFolderTree(siteId, driveId, child, currentDepth + 1, maxDepth))
    );
    return tree;
  }

  // ============================================================================
  // PowerPlatform Validation
  // ============================================================================

  async getCrmDocumentLocations(
    powerPlatformService: any,
    entityName?: string,
    recordId?: string
  ): Promise<SharePointDocumentLocation[]> {
    const timer = auditLogger.startTimer();

    try {
      let filter = 'statecode eq 0';
      if (entityName && recordId) {
        filter += ` and _regardingobjectid_value eq ${recordId}`;
      }

      const response = await powerPlatformService.queryRecords(
        'sharepointdocumentlocations',
        filter,
        1000
      );

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

        if (record._regardingobjectid_value) {
          location.regardingobjectid = {
            id: record._regardingobjectid_value,
            logicalName: record['_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] || '',
          };
        }
        if (record._parentsiteorlocation_value) {
          location.parentsiteorlocation = {
            id: record._parentsiteorlocation_value,
            logicalName: record['_parentsiteorlocation_value@Microsoft.Dynamics.CRM.lookuplogicalname'] || '',
          };
        }
        if (record.sitecollectionid) {
          location.sitecollectionid = record.sitecollectionid;
        }
        locations.push(location);
      }

      let filtered = locations;
      if (entityName && !recordId) {
        filtered = locations.filter(loc => loc.regardingobjectid?.logicalName === entityName);
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
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { entityName, recordId },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'get CRM document locations');
    }
  }

  async validateDocumentLocation(
    powerPlatformService: any,
    documentLocationId: string
  ): Promise<ValidationResult> {
    const timer = auditLogger.startTimer();

    try {
      const record = await powerPlatformService.getRecord(
        'sharepointdocumentlocations',
        documentLocationId
      );

      if (!record) {
        throw new Error(`Document location ${documentLocationId} not found`);
      }

      const absoluteUrl = record.absoluteurl || '';
      const relativeUrl = record.relativeurl || '';
      const regardingEntityName = record['_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] || '';
      const regardingRecordId = record._regardingobjectid_value || '';
      const isActive = record.statecode === 0;

      const result: ValidationResult = {
        documentLocationId,
        documentLocationName: record.name || '',
        crmConfig: {
          absoluteUrl, relativeUrl,
          regardingEntity: regardingEntityName,
          regardingRecordId, isActive,
        },
        spoValidation: {
          siteExists: false, folderExists: false,
          folderAccessible: false, fileCount: 0, isEmpty: true,
        },
        status: 'error',
        issues: [],
        recommendations: [],
      };

      if (!absoluteUrl) {
        result.issues.push('Absolute URL is not configured in CRM');
        result.recommendations.push('Configure the absoluteurl field in the document location record');
        this.logValidation(timer, documentLocationId, result);
        return result;
      }

      let siteUrl: string;
      let folderPath: string;

      try {
        const url = new URL(absoluteUrl);
        const pathParts = url.pathname.split('/').filter(p => p);
        const sitesIndex = pathParts.indexOf('sites');
        if (sitesIndex === -1) throw new Error('URL does not contain /sites/ path');

        const siteName = pathParts[sitesIndex + 1];
        siteUrl = `${url.protocol}//${url.hostname}/sites/${siteName}`;
        const libraryAndFolder = pathParts.slice(sitesIndex + 2);
        folderPath = '/' + libraryAndFolder.join('/');
      } catch (parseError: any) {
        result.issues.push(`Failed to parse absolute URL: ${parseError.message}`);
        result.recommendations.push('Verify the absolute URL format in CRM');
        this.logValidation(timer, documentLocationId, result);
        return result;
      }

      try {
        await this.spo.resolveSiteId(siteUrl);
        result.spoValidation.siteExists = true;
      } catch {
        result.issues.push(`SharePoint site not found: ${siteUrl}`);
        result.recommendations.push('Verify the site URL is correct and accessible');
        result.recommendations.push('Check that the service principal has access to the site');
        this.logValidation(timer, documentLocationId, result);
        return result;
      }

      const config = this.spo.getConfig();
      const configuredSite = config.sites.find(s => s.siteUrl === siteUrl);
      if (!configuredSite) {
        result.issues.push(`Site ${siteUrl} is not configured in SHAREPOINT_SITES`);
        result.recommendations.push('Add the site to SHAREPOINT_SITES configuration');
        result.status = 'warning';
        this.logValidation(timer, documentLocationId, result);
        return result;
      }

      const siteId = configuredSite.id;

      try {
        const drives = await this.spo.listDrives(siteId);
        const libraryName = folderPath.split('/').filter(p => p)[0];
        const drive = drives.find(d => d.name === libraryName);

        if (!drive) {
          result.issues.push(`Document library '${libraryName}' not found in site`);
          result.recommendations.push('Verify the library name in the absolute URL');
          result.status = 'warning';
          this.logValidation(timer, documentLocationId, result);
          return result;
        }

        result.spoValidation.folderExists = true;

        try {
          const items = await this.getItemByPath(siteId, drive.id, folderPath);
          result.spoValidation.folderAccessible = true;

          if (items.folder) {
            const folderContents = await this.listItems(siteId, drive.id, items.id);
            result.spoValidation.fileCount = folderContents.length;
            result.spoValidation.isEmpty = folderContents.length === 0;
          }

          if (result.spoValidation.isEmpty) {
            result.status = 'warning';
            result.issues.push('Folder is empty (no files found)');
            result.recommendations.push('Upload documents to the folder or verify the folder path');
          } else {
            result.status = 'valid';
          }
        } catch {
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

      this.logValidation(timer, documentLocationId, result);
      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'validate-document-location',
        operationType: 'READ',
        componentType: 'DocumentLocation',
        success: false,
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { documentLocationId },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'validate document location');
    }
  }

  private logValidation(timer: () => number, documentLocationId: string, result: ValidationResult): void {
    auditLogger.log({
      operation: 'validate-document-location',
      operationType: 'READ',
      componentType: 'DocumentLocation',
      componentName: result.documentLocationName,
      success: true,
      parameters: { documentLocationId, status: result.status },
      executionTimeMs: timer(),
    });
  }

  async verifyDocumentMigration(
    powerPlatformService: any,
    sourceSiteId: string,
    sourcePath: string,
    targetSiteId: string,
    targetPath: string
  ): Promise<MigrationVerification> {
    const timer = auditLogger.startTimer();

    try {
      // Get source folder contents
      const sourceDrives = await this.spo.listDrives(sourceSiteId);
      const sourceLibraryName = sourcePath.split('/').filter(p => p)[0];
      const sourceDrive = sourceDrives.find(d => d.name === sourceLibraryName);
      if (!sourceDrive) throw new Error(`Source library '${sourceLibraryName}' not found`);

      const sourceFolder = await this.getItemByPath(sourceSiteId, sourceDrive.id, sourcePath);
      const sourceItems = await this.listItems(sourceSiteId, sourceDrive.id, sourceFolder.id);

      // Get target folder contents
      const targetDrives = await this.spo.listDrives(targetSiteId);
      const targetLibraryName = targetPath.split('/').filter(p => p)[0];
      const targetDrive = targetDrives.find(d => d.name === targetLibraryName);
      if (!targetDrive) throw new Error(`Target library '${targetLibraryName}' not found`);

      const targetFolder = await this.getItemByPath(targetSiteId, targetDrive.id, targetPath);
      const targetItems = await this.listItems(targetSiteId, targetDrive.id, targetFolder.id);

      // Calculate totals
      const sourceTotalSize = sourceItems.reduce((sum, item) => sum + (item.size || 0), 0);
      const targetTotalSize = targetItems.reduce((sum, item) => sum + (item.size || 0), 0);

      // Compare files
      const sourceFileNames = new Set(sourceItems.map(i => i.name));
      const targetFileNames = new Set(targetItems.map(i => i.name));

      const missingFiles = sourceItems.filter(i => !targetFileNames.has(i.name)).map(i => i.name);
      const extraFiles = targetItems.filter(i => !sourceFileNames.has(i.name)).map(i => i.name);

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

      const expectedFileCount = sourceItems.length;
      const actualFileCount = targetItems.length - extraFiles.length;
      const successRate = expectedFileCount > 0
        ? Math.round((actualFileCount / expectedFileCount) * 100)
        : 100;

      let status: 'complete' | 'incomplete' | 'failed';
      if (missingFiles.length === 0 && sizeMismatches.length === 0) {
        status = 'complete';
      } else if (successRate < 50) {
        status = 'failed';
      } else {
        status = 'incomplete';
      }

      const result: MigrationVerification = {
        source: { path: sourcePath, fileCount: sourceItems.length, totalSize: sourceTotalSize, files: sourceItems },
        target: { path: targetPath, fileCount: targetItems.length, totalSize: targetTotalSize, files: targetItems },
        comparison: { missingFiles, extraFiles, sizeMismatches, modifiedDateMismatches },
        successRate,
        status,
      };

      auditLogger.log({
        operation: 'verify-document-migration',
        operationType: 'READ',
        componentType: 'Migration',
        success: true,
        parameters: { sourceSiteId, sourcePath, targetSiteId, targetPath, status, successRate },
        executionTimeMs: timer(),
      });
      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'verify-document-migration',
        operationType: 'READ',
        componentType: 'Migration',
        success: false,
        error: this.spo.sanitizeErrorMessage(error),
        parameters: { sourceSiteId, sourcePath, targetSiteId, targetPath },
        executionTimeMs: timer(),
      });
      throw this.spo.handleError(error, 'verify document migration');
    }
  }
}
