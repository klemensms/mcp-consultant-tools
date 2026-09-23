/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { SharePointService } from './services/sharepoint-service.js';
import { loadSharePointConfig } from './config.js';
import { ListService } from './services/list-service.js';
import { FileOperationsService } from './services/file-operations-service.js';
import { DiscoveryService } from './services/discovery-service.js';
import { resolveDownloadDir } from '@mcp-consultant-tools/m365-core';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: SharePointService | null = null;
  let listService: ListService | null = null;
  let fileOps: FileOperationsService | null = null;
  let discovery: DiscoveryService | null = null;

  function getSharePointService(): SharePointService {
    if (!service) {
      const config = loadSharePointConfig();

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
        downloadDir: resolveDownloadDir(process.env.SHAREPOINT_DOWNLOAD_DIR, 'mcp-sharepoint'),
      });
    }
    return fileOps;
  }

  return {
    get sharepoint() { return getSharePointService(); },
    get lists() { return getListService(); },
    get files() { return getFileOperationsService(); },
    get discovery() {
      if (!discovery) {
        discovery = new DiscoveryService(getSharePointService());
      }
      return discovery;
    },
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
