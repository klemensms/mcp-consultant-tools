/**
 * SharePoint File Operations Service
 *
 * Handles file management operations: download, upload, create folder,
 * delete, move, copy, and rename via Microsoft Graph API.
 */

import { Client, ResponseType } from '@microsoft/microsoft-graph-client';
import { auditLogger } from '@mcp-consultant-tools/core';
import type { SharePointService } from './sharepoint-service.js';
import type {
  FileDownloadResult,
  FileUploadResult,
  FileOperationResult,
} from '../types/sharepoint-types.js';

/** MIME types considered text (content returned as UTF-8 string) */
const TEXT_MIME_PREFIXES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/csv',
  'application/x-yaml',
  'application/yaml',
  'application/sql',
];

function isTextMime(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return TEXT_MIME_PREFIXES.some(prefix => lower.startsWith(prefix));
}

export interface FileOperationsConfig {
  maxDownloadSizeMB: number;
  maxUploadSizeMB: number;
}

export class FileOperationsService {
  private spoService: SharePointService;
  private config: FileOperationsConfig;

  constructor(spoService: SharePointService, config: FileOperationsConfig) {
    this.spoService = spoService;
    this.config = config;
  }

  /**
   * Download file content from SharePoint
   * Text files returned as UTF-8, binary files as base64
   */
  async downloadFile(
    siteId: string,
    driveId: string,
    itemIdOrPath: string,
    byPath: boolean = false
  ): Promise<FileDownloadResult> {
    const timer = auditLogger.startTimer();

    try {
      const client = await this.spoService.getAuthenticatedGraphClient();

      // First get item metadata to check size and type
      const metaPath = byPath
        ? `/drives/${driveId}/root:${itemIdOrPath.startsWith('/') ? itemIdOrPath : '/' + itemIdOrPath}`
        : `/drives/${driveId}/items/${itemIdOrPath}`;

      const meta = await client
        .api(metaPath)
        .select('id,name,webUrl,size,file')
        .get();

      if (!meta.file) {
        throw new Error(`Item '${meta.name}' is a folder, not a file. Use spo-list-items to browse folder contents.`);
      }

      const maxBytes = this.config.maxDownloadSizeMB * 1024 * 1024;
      if (meta.size > maxBytes) {
        throw new Error(
          `File size ${(meta.size / (1024 * 1024)).toFixed(1)} MB exceeds download limit of ${this.config.maxDownloadSizeMB} MB. ` +
          `Adjust SHAREPOINT_MAX_DOWNLOAD_SIZE_MB to increase the limit.`
        );
      }

      // Download content
      const contentPath = byPath
        ? `/drives/${driveId}/root:${itemIdOrPath.startsWith('/') ? itemIdOrPath : '/' + itemIdOrPath}:/content`
        : `/drives/${driveId}/items/${meta.id}/content`;

      const response = await client
        .api(contentPath)
        .responseType(ResponseType.ARRAYBUFFER)
        .get();

      const buffer = Buffer.from(response as ArrayBuffer);
      const mimeType: string = meta.file.mimeType || 'application/octet-stream';
      const isText = isTextMime(mimeType);

      auditLogger.log({
        operation: 'download-file',
        operationType: 'READ',
        componentType: 'File',
        componentName: meta.name,
        success: true,
        parameters: { siteId, driveId, itemIdOrPath, size: meta.size, mimeType },
        executionTimeMs: timer(),
      });

      return {
        content: isText ? buffer.toString('utf-8') : buffer.toString('base64'),
        encoding: isText ? 'utf-8' : 'base64',
        mimeType,
        fileName: meta.name,
        size: meta.size,
        itemId: meta.id,
        webUrl: meta.webUrl,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'download-file',
        operationType: 'READ',
        componentType: 'File',
        success: false,
        error: error.message,
        parameters: { siteId, driveId, itemIdOrPath },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Upload file content to SharePoint
   * For files <4MB uses simple PUT, for larger files uses upload session
   */
  async uploadFile(
    siteId: string,
    driveId: string,
    path: string,
    content: string,
    encoding: 'utf-8' | 'base64' = 'utf-8',
    overwrite: boolean = false
  ): Promise<FileUploadResult> {
    const timer = auditLogger.startTimer();

    try {
      const client = await this.spoService.getAuthenticatedGraphClient();
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;

      const buffer = encoding === 'base64'
        ? Buffer.from(content, 'base64')
        : Buffer.from(content, 'utf-8');

      const maxBytes = this.config.maxUploadSizeMB * 1024 * 1024;
      if (buffer.length > maxBytes) {
        throw new Error(
          `Content size ${(buffer.length / (1024 * 1024)).toFixed(1)} MB exceeds upload limit of ${this.config.maxUploadSizeMB} MB. ` +
          `Adjust SHAREPOINT_MAX_UPLOAD_SIZE_MB to increase the limit.`
        );
      }

      const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4MB

      let response: any;

      if (buffer.length <= SIMPLE_UPLOAD_LIMIT) {
        const apiPath = `/drives/${driveId}/root:${normalizedPath}:/content`;
        const conflictBehavior = overwrite ? 'replace' : 'fail';

        response = await client
          .api(apiPath)
          .header('Content-Type', 'application/octet-stream')
          .header('@microsoft.graph.conflictBehavior', conflictBehavior)
          .put(buffer);
      } else {
        response = await this.uploadLargeFile(client, driveId, normalizedPath, buffer, overwrite);
      }

      auditLogger.log({
        operation: 'upload-file',
        operationType: 'CREATE',
        componentType: 'File',
        componentName: response.name,
        success: true,
        parameters: { siteId, driveId, path: normalizedPath, size: buffer.length },
        executionTimeMs: timer(),
      });

      return {
        itemId: response.id,
        name: response.name,
        webUrl: response.webUrl,
        size: response.size,
        createdDateTime: response.createdDateTime,
        lastModifiedDateTime: response.lastModifiedDateTime,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'upload-file',
        operationType: 'CREATE',
        componentType: 'File',
        success: false,
        error: error.message,
        parameters: { siteId, driveId, path },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Upload large file using upload session (chunked upload)
   */
  private async uploadLargeFile(
    client: Client,
    driveId: string,
    path: string,
    buffer: Buffer,
    overwrite: boolean
  ): Promise<any> {
    const conflictBehavior = overwrite ? 'replace' : 'fail';

    const sessionResponse = await client
      .api(`/drives/${driveId}/root:${path}:/createUploadSession`)
      .post({
        item: {
          '@microsoft.graph.conflictBehavior': conflictBehavior,
        },
      });

    const uploadUrl = sessionResponse.uploadUrl;
    const CHUNK_SIZE = 320 * 1024 * 10; // 3.2MB chunks (must be multiple of 320KB)
    let offset = 0;
    let lastResponse: any;

    while (offset < buffer.length) {
      const end = Math.min(offset + CHUNK_SIZE, buffer.length);
      const chunk = buffer.subarray(offset, end);

      const fetchResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': chunk.length.toString(),
          'Content-Range': `bytes ${offset}-${end - 1}/${buffer.length}`,
        },
        body: chunk,
      });

      if (!fetchResponse.ok && fetchResponse.status !== 202) {
        const errorText = await fetchResponse.text();
        throw new Error(`Upload chunk failed (${fetchResponse.status}): ${errorText}`);
      }

      lastResponse = await fetchResponse.json().catch(() => null);
      offset = end;
    }

    return lastResponse;
  }

  /**
   * Create a folder in a document library
   */
  async createFolder(
    siteId: string,
    driveId: string,
    parentPath: string,
    folderName: string
  ): Promise<FileOperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const client = await this.spoService.getAuthenticatedGraphClient();
      const normalizedParent = parentPath === '/' || parentPath === ''
        ? ''
        : (parentPath.startsWith('/') ? parentPath : `/${parentPath}`);

      const apiPath = normalizedParent
        ? `/drives/${driveId}/root:${normalizedParent}:/children`
        : `/drives/${driveId}/root/children`;

      const response = await client
        .api(apiPath)
        .post({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        });

      auditLogger.log({
        operation: 'create-folder',
        operationType: 'CREATE',
        componentType: 'Folder',
        componentName: folderName,
        success: true,
        parameters: { siteId, driveId, parentPath, folderName },
        executionTimeMs: timer(),
      });

      return {
        success: true,
        operation: 'createFolder',
        itemId: response.id,
        name: response.name,
        webUrl: response.webUrl,
        message: `Folder '${folderName}' created successfully`,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-folder',
        operationType: 'CREATE',
        componentType: 'Folder',
        success: false,
        error: error.message,
        parameters: { siteId, driveId, parentPath, folderName },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Delete a file or folder
   */
  async deleteItem(
    siteId: string,
    driveId: string,
    itemId: string
  ): Promise<FileOperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const client = await this.spoService.getAuthenticatedGraphClient();

      const meta = await client
        .api(`/drives/${driveId}/items/${itemId}`)
        .select('id,name')
        .get();

      await client
        .api(`/drives/${driveId}/items/${itemId}`)
        .delete();

      auditLogger.log({
        operation: 'delete-item',
        operationType: 'DELETE',
        componentType: 'Item',
        componentName: meta.name,
        success: true,
        parameters: { siteId, driveId, itemId },
        executionTimeMs: timer(),
      });

      return {
        success: true,
        operation: 'delete',
        itemId,
        name: meta.name,
        message: `Item '${meta.name}' deleted successfully`,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-item',
        operationType: 'DELETE',
        componentType: 'Item',
        success: false,
        error: error.message,
        parameters: { siteId, driveId, itemId },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Move a file or folder to a new location
   */
  async moveItem(
    siteId: string,
    driveId: string,
    itemId: string,
    targetDriveId: string,
    targetParentPath: string
  ): Promise<FileOperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const client = await this.spoService.getAuthenticatedGraphClient();

      const normalizedPath = targetParentPath.startsWith('/') ? targetParentPath : `/${targetParentPath}`;
      const targetParent = targetParentPath === '/' || targetParentPath === ''
        ? await client.api(`/drives/${targetDriveId}/root`).select('id').get()
        : await client.api(`/drives/${targetDriveId}/root:${normalizedPath}`).select('id').get();

      const patchBody: any = {
        parentReference: {
          driveId: targetDriveId,
          id: targetParent.id,
        },
      };

      const response = await client
        .api(`/drives/${driveId}/items/${itemId}`)
        .patch(patchBody);

      auditLogger.log({
        operation: 'move-item',
        operationType: 'UPDATE',
        componentType: 'Item',
        componentName: response.name,
        success: true,
        parameters: { siteId, driveId, itemId, targetDriveId, targetParentPath },
        executionTimeMs: timer(),
      });

      return {
        success: true,
        operation: 'move',
        itemId: response.id,
        name: response.name,
        webUrl: response.webUrl,
        message: `Item '${response.name}' moved successfully`,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'move-item',
        operationType: 'UPDATE',
        componentType: 'Item',
        success: false,
        error: error.message,
        parameters: { siteId, driveId, itemId, targetDriveId, targetParentPath },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Copy a file or folder
   */
  async copyItem(
    siteId: string,
    driveId: string,
    itemId: string,
    targetDriveId: string,
    targetParentPath: string,
    newName?: string
  ): Promise<FileOperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const client = await this.spoService.getAuthenticatedGraphClient();

      const normalizedPath = targetParentPath.startsWith('/') ? targetParentPath : `/${targetParentPath}`;
      const targetParent = targetParentPath === '/' || targetParentPath === ''
        ? await client.api(`/drives/${targetDriveId}/root`).select('id').get()
        : await client.api(`/drives/${targetDriveId}/root:${normalizedPath}`).select('id').get();

      const copyBody: any = {
        parentReference: {
          driveId: targetDriveId,
          id: targetParent.id,
        },
      };
      if (newName) {
        copyBody.name = newName;
      }

      await client
        .api(`/drives/${driveId}/items/${itemId}/copy`)
        .post(copyBody);

      const meta = await client
        .api(`/drives/${driveId}/items/${itemId}`)
        .select('name')
        .get();

      auditLogger.log({
        operation: 'copy-item',
        operationType: 'UPDATE',
        componentType: 'Item',
        componentName: meta.name,
        success: true,
        parameters: { siteId, driveId, itemId, targetDriveId, targetParentPath, newName },
        executionTimeMs: timer(),
      });

      return {
        success: true,
        operation: 'copy',
        name: newName || meta.name,
        message: `Item '${meta.name}' copy initiated successfully. Copy may take a moment to complete.`,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'copy-item',
        operationType: 'UPDATE',
        componentType: 'Item',
        success: false,
        error: error.message,
        parameters: { siteId, driveId, itemId, targetDriveId, targetParentPath, newName },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Rename a file or folder
   */
  async renameItem(
    siteId: string,
    driveId: string,
    itemId: string,
    newName: string
  ): Promise<FileOperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const client = await this.spoService.getAuthenticatedGraphClient();

      const response = await client
        .api(`/drives/${driveId}/items/${itemId}`)
        .patch({ name: newName });

      auditLogger.log({
        operation: 'rename-item',
        operationType: 'UPDATE',
        componentType: 'Item',
        componentName: newName,
        success: true,
        parameters: { siteId, driveId, itemId, newName },
        executionTimeMs: timer(),
      });

      return {
        success: true,
        operation: 'rename',
        itemId: response.id,
        name: response.name,
        webUrl: response.webUrl,
        message: `Item renamed to '${newName}' successfully`,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'rename-item',
        operationType: 'UPDATE',
        componentType: 'Item',
        success: false,
        error: error.message,
        parameters: { siteId, driveId, itemId, newName },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }
}
