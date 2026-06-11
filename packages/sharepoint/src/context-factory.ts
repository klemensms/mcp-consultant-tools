/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { SharePointService } from './services/sharepoint-service.js';
import type { SharePointConfig } from './services/sharepoint-service.js';
import { ListService } from './services/list-service.js';
import { FileOperationsService } from './services/file-operations-service.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: SharePointService | null = null;
  let listService: ListService | null = null;
  let fileOps: FileOperationsService | null = null;

  function getSharePointService(): SharePointService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.SHAREPOINT_SITES) {
        try {
          resources = JSON.parse(process.env.SHAREPOINT_SITES);
        } catch {
          throw new Error('Failed to parse SHAREPOINT_SITES JSON');
        }
      } else if (process.env.SHAREPOINT_SITE_URL) {
        resources = [{
          id: 'default',
          name: 'Default SharePoint Site',
          siteUrl: process.env.SHAREPOINT_SITE_URL,
          active: true,
        }];
      } else {
        missingConfig.push('SHAREPOINT_SITES or SHAREPOINT_SITE_URL');
      }

      if (!process.env.SHAREPOINT_TENANT_ID) missingConfig.push('SHAREPOINT_TENANT_ID');
      if (!process.env.SHAREPOINT_CLIENT_ID) missingConfig.push('SHAREPOINT_CLIENT_ID');
      if (!process.env.SHAREPOINT_CLIENT_SECRET) missingConfig.push('SHAREPOINT_CLIENT_SECRET');

      if (missingConfig.length > 0) {
        throw new Error(`Missing SharePoint configuration: ${missingConfig.join(', ')}`);
      }

      const config: SharePointConfig = {
        sites: resources,
        authMethod: 'entra-id',
        tenantId: process.env.SHAREPOINT_TENANT_ID!,
        clientId: process.env.SHAREPOINT_CLIENT_ID!,
        clientSecret: process.env.SHAREPOINT_CLIENT_SECRET!,
      };

      service = new SharePointService(config);
      console.error('SharePoint service initialized');
    }
    return service;
  }

  function getListService(): ListService {
    if (!listService) {
      listService = new ListService(getSharePointService());
    }
    return listService;
  }

  function getFileOperationsService(): FileOperationsService {
    if (!fileOps) {
      fileOps = new FileOperationsService(getSharePointService(), {
        maxDownloadSizeMB: parseInt(process.env.SHAREPOINT_MAX_DOWNLOAD_SIZE_MB || '50', 10),
        maxUploadSizeMB: parseInt(process.env.SHAREPOINT_MAX_UPLOAD_SIZE_MB || '100', 10),
      });
    }
    return fileOps;
  }

  return {
    get sharepoint() { return getSharePointService(); },
    get lists() { return getListService(); },
    get files() { return getFileOperationsService(); },
    getPowerPlatformService() {
      throw new Error(
        'PowerPlatform integration not available in standalone SharePoint package.'
      );
    },
    checkWriteEnabled() {
      if (process.env.SHAREPOINT_ENABLE_WRITE !== 'true') {
        throw new Error('Write operations are disabled. Set SHAREPOINT_ENABLE_WRITE=true to enable.');
      }
    },
    checkDeleteEnabled() {
      if (process.env.SHAREPOINT_ENABLE_DELETE !== 'true') {
        throw new Error('Delete operations are disabled. Set SHAREPOINT_ENABLE_DELETE=true to enable.');
      }
    },
  };
}
