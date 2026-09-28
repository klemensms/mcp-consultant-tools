/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
import type { SharePointService } from './services/sharepoint-service.js';
import type { ListService } from './services/list-service.js';
import type { FileOperationsService } from './services/file-operations-service.js';
import type { DiscoveryService } from './services/discovery-service.js';
import type { ContentService } from './services/content/content-service.js';

export interface ServiceContext {
  readonly sharepoint: SharePointService;
  readonly lists: ListService;
  readonly files: FileOperationsService;
  readonly discovery: DiscoveryService;
  /** Reading and editing file content in place (SHAREPOINT_CONTENT_READ / SHAREPOINT_CONTENT_WRITE). */
  readonly content: ContentService;
  readonly getPowerPlatformService: () => any;
  readonly checkWriteEnabled: () => void;
  readonly checkDeleteEnabled: () => void;
}
