/**
 * File Service
 *
 * Handles all file share operations: shares, directories, and files.
 */

import {
  ShareServiceClient,
  ShareClient,
  ShareDirectoryClient,
  ShareFileClient,
  FileItem,
  DirectoryItem,
  ShareItem,
} from '@azure/storage-file-share';
import { auditLogger } from '@mcp-consultant-tools/core';

import type {
  FileShareInfo,
  FileItemInfo,
  FileListOptions,
  FileUploadOptions,
  ListResult,
  OperationResult,
} from '../types/storage-types.js';

export class FileService {
  private client: ShareServiceClient;
  private accountId: string;
  private maxListResults: number;

  constructor(client: ShareServiceClient, accountId: string, maxListResults: number) {
    this.client = client;
    this.accountId = accountId;
    this.maxListResults = maxListResults;
  }

  // ==========================================================================
  // Share Operations
  // ==========================================================================

  /**
   * List all file shares
   */
  async listShares(prefix?: string, maxResults?: number): Promise<ListResult<FileShareInfo>> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(maxResults || this.maxListResults, this.maxListResults);

    try {
      const shares: FileShareInfo[] = [];
      const iter = this.client.listShares({
        prefix,
        includeMetadata: true,
      });

      for await (const share of iter) {
        shares.push(this.mapShareItem(share));
        if (shares.length >= limit) break;
      }

      auditLogger.log({
        operation: 'list-shares',
        operationType: 'READ',
        componentType: 'FileShare',
        parameters: { accountId: this.accountId, prefix, count: shares.length },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        items: shares,
        hasMore: shares.length >= limit,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-shares',
        operationType: 'READ',
        componentType: 'FileShare',
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get share properties
   */
  async getShare(shareName: string): Promise<FileShareInfo> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      const properties = await shareClient.getProperties();

      const info: FileShareInfo = {
        name: shareName,
        lastModified: properties.lastModified,
        quota: properties.quota,
        accessTier: properties.accessTier,
        metadata: properties.metadata,
      };

      auditLogger.log({
        operation: 'get-share',
        operationType: 'READ',
        componentType: 'FileShare',
        componentName: shareName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return info;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-share',
        operationType: 'READ',
        componentType: 'FileShare',
        componentName: shareName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Create a new file share
   */
  async createShare(
    shareName: string,
    quota?: number,
    metadata?: Record<string, string>
  ): Promise<OperationResult<FileShareInfo>> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      await shareClient.create({
        quota,
        metadata,
      });

      const info = await this.getShare(shareName);

      auditLogger.log({
        operation: 'create-share',
        operationType: 'CREATE',
        componentType: 'FileShare',
        componentName: shareName,
        parameters: { accountId: this.accountId, quota },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: info };
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-share',
        operationType: 'CREATE',
        componentType: 'FileShare',
        componentName: shareName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file share
   */
  async deleteShare(shareName: string): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      await shareClient.delete();

      auditLogger.log({
        operation: 'delete-share',
        operationType: 'DELETE',
        componentType: 'FileShare',
        componentName: shareName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-share',
        operationType: 'DELETE',
        componentType: 'FileShare',
        componentName: shareName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // Directory Operations
  // ==========================================================================

  /**
   * List items (files and directories) in a path
   */
  async listItems(
    shareName: string,
    options?: FileListOptions
  ): Promise<ListResult<FileItemInfo>> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(options?.maxResults || this.maxListResults, this.maxListResults);

    try {
      const shareClient = this.client.getShareClient(shareName);
      const directoryClient = shareClient.getDirectoryClient(options?.path || '');
      const items: FileItemInfo[] = [];

      const iter = directoryClient.listFilesAndDirectories();

      for await (const item of iter) {
        if (item.kind === 'file') {
          items.push({
            name: item.name,
            kind: 'file',
            path: options?.path ? `${options.path}/${item.name}` : item.name,
            contentLength: (item as FileItem).properties?.contentLength,
            lastModified: (item as FileItem).properties?.lastModified,
          });
        } else {
          items.push({
            name: item.name,
            kind: 'directory',
            path: options?.path ? `${options.path}/${item.name}` : item.name,
          });
        }

        if (items.length >= limit) break;
      }

      auditLogger.log({
        operation: 'list-items',
        operationType: 'READ',
        componentType: 'FileItem',
        componentName: shareName,
        parameters: { accountId: this.accountId, path: options?.path, count: items.length },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        items,
        hasMore: items.length >= limit,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-items',
        operationType: 'READ',
        componentType: 'FileItem',
        componentName: shareName,
        parameters: { accountId: this.accountId, path: options?.path },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Create a directory
   */
  async createDirectory(
    shareName: string,
    directoryPath: string,
    metadata?: Record<string, string>
  ): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      const directoryClient = shareClient.getDirectoryClient(directoryPath);
      await directoryClient.create({ metadata });

      auditLogger.log({
        operation: 'create-directory',
        operationType: 'CREATE',
        componentType: 'FileDirectory',
        componentName: `${shareName}/${directoryPath}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-directory',
        operationType: 'CREATE',
        componentType: 'FileDirectory',
        componentName: `${shareName}/${directoryPath}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a directory
   */
  async deleteDirectory(shareName: string, directoryPath: string): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      const directoryClient = shareClient.getDirectoryClient(directoryPath);
      await directoryClient.delete();

      auditLogger.log({
        operation: 'delete-directory',
        operationType: 'DELETE',
        componentType: 'FileDirectory',
        componentName: `${shareName}/${directoryPath}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-directory',
        operationType: 'DELETE',
        componentType: 'FileDirectory',
        componentName: `${shareName}/${directoryPath}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  /**
   * Get file properties
   */
  async getFile(shareName: string, filePath: string): Promise<FileItemInfo> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      const fileClient = shareClient.rootDirectoryClient.getFileClient(filePath);
      const properties = await fileClient.getProperties();

      const info: FileItemInfo = {
        name: filePath.split('/').pop() || filePath,
        kind: 'file',
        path: filePath,
        contentLength: properties.contentLength,
        lastModified: properties.lastModified,
        contentType: properties.contentType,
        metadata: properties.metadata,
      };

      auditLogger.log({
        operation: 'get-file',
        operationType: 'READ',
        componentType: 'File',
        componentName: `${shareName}/${filePath}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return info;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-file',
        operationType: 'READ',
        componentType: 'File',
        componentName: `${shareName}/${filePath}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Download file content
   */
  async downloadFile(shareName: string, filePath: string): Promise<string> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      const fileClient = shareClient.rootDirectoryClient.getFileClient(filePath);

      const downloadResponse = await fileClient.download();
      const content = await this.streamToString(downloadResponse.readableStreamBody!);

      auditLogger.log({
        operation: 'download-file',
        operationType: 'READ',
        componentType: 'File',
        componentName: `${shareName}/${filePath}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return content;
    } catch (error: any) {
      auditLogger.log({
        operation: 'download-file',
        operationType: 'READ',
        componentType: 'File',
        componentName: `${shareName}/${filePath}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Upload file content
   */
  async uploadFile(
    shareName: string,
    filePath: string,
    content: string,
    options?: FileUploadOptions
  ): Promise<OperationResult<FileItemInfo>> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      const fileClient = shareClient.rootDirectoryClient.getFileClient(filePath);

      // Check if file exists and overwrite is not allowed
      if (!options?.overwrite) {
        try {
          await fileClient.getProperties();
          throw new Error(
            `File '${filePath}' already exists. Set overwrite: true to replace.`
          );
        } catch (error: any) {
          if (error.statusCode !== 404) {
            throw error;
          }
          // File doesn't exist, continue with upload
        }
      }

      // Ensure parent directory exists
      const parentPath = filePath.split('/').slice(0, -1).join('/');
      if (parentPath) {
        await this.ensureDirectoryExists(shareName, parentPath);
      }

      // Upload the file
      const contentBuffer = Buffer.from(content, 'utf8');
      await fileClient.create(contentBuffer.length);
      await fileClient.uploadRange(content, 0, contentBuffer.length);

      // Set metadata if provided
      if (options?.metadata) {
        await fileClient.setMetadata(options.metadata);
      }

      const info = await this.getFile(shareName, filePath);

      auditLogger.log({
        operation: 'upload-file',
        operationType: 'CREATE',
        componentType: 'File',
        componentName: `${shareName}/${filePath}`,
        parameters: { accountId: this.accountId, size: contentBuffer.length },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: info };
    } catch (error: any) {
      auditLogger.log({
        operation: 'upload-file',
        operationType: 'CREATE',
        componentType: 'File',
        componentName: `${shareName}/${filePath}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(shareName: string, filePath: string): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const shareClient = this.client.getShareClient(shareName);
      const fileClient = shareClient.rootDirectoryClient.getFileClient(filePath);
      await fileClient.delete();

      auditLogger.log({
        operation: 'delete-file',
        operationType: 'DELETE',
        componentType: 'File',
        componentName: `${shareName}/${filePath}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-file',
        operationType: 'DELETE',
        componentType: 'File',
        componentName: `${shareName}/${filePath}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Copy a file
   */
  async copyFile(
    sourceShare: string,
    sourceFile: string,
    destShare: string,
    destFile: string,
    overwrite: boolean = false
  ): Promise<OperationResult<FileItemInfo>> {
    const timer = auditLogger.startTimer();

    try {
      const sourceShareClient = this.client.getShareClient(sourceShare);
      const sourceFileClient = sourceShareClient.rootDirectoryClient.getFileClient(sourceFile);
      const sourceUrl = sourceFileClient.url;

      const destShareClient = this.client.getShareClient(destShare);
      const destFileClient = destShareClient.rootDirectoryClient.getFileClient(destFile);

      // Check if destination exists and overwrite is not allowed
      if (!overwrite) {
        try {
          await destFileClient.getProperties();
          throw new Error(
            `Destination file '${destFile}' already exists. Set overwrite: true to replace.`
          );
        } catch (error: any) {
          if (error.statusCode !== 404) {
            throw error;
          }
          // File doesn't exist, continue with copy
        }
      }

      // Ensure parent directory exists for destination
      const parentPath = destFile.split('/').slice(0, -1).join('/');
      if (parentPath) {
        await this.ensureDirectoryExists(destShare, parentPath);
      }

      // Get source size and create destination file
      const sourceProps = await sourceFileClient.getProperties();
      await destFileClient.create(sourceProps.contentLength || 0);

      // Start copy operation (file share copy doesn't use poller)
      await destFileClient.startCopyFromURL(sourceUrl);

      // Wait for copy to complete by checking copy status
      let copyStatus = 'pending';
      while (copyStatus === 'pending') {
        const props = await destFileClient.getProperties();
        copyStatus = props.copyStatus || 'success';
        if (copyStatus === 'pending') {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (copyStatus !== 'success') {
        throw new Error(`Copy failed with status: ${copyStatus}`);
      }

      const info = await this.getFile(destShare, destFile);

      auditLogger.log({
        operation: 'copy-file',
        operationType: 'CREATE',
        componentType: 'File',
        componentName: `${sourceShare}/${sourceFile}`,
        parameters: {
          accountId: this.accountId,
          destination: `${destShare}/${destFile}`,
        },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: info };
    } catch (error: any) {
      auditLogger.log({
        operation: 'copy-file',
        operationType: 'CREATE',
        componentType: 'File',
        componentName: `${sourceShare}/${sourceFile}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private mapShareItem(item: ShareItem): FileShareInfo {
    return {
      name: item.name,
      lastModified: item.properties.lastModified,
      quota: item.properties.quota,
      accessTier: item.properties.accessTier,
      metadata: item.metadata,
    };
  }

  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (data) => {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      readableStream.on('error', reject);
    });
  }

  /**
   * Ensure a directory path exists, creating it if necessary
   */
  private async ensureDirectoryExists(shareName: string, directoryPath: string): Promise<void> {
    const shareClient = this.client.getShareClient(shareName);
    const parts = directoryPath.split('/').filter((p) => p);

    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const directoryClient = shareClient.getDirectoryClient(currentPath);

      try {
        await directoryClient.getProperties();
      } catch (error: any) {
        if (error.statusCode === 404) {
          await directoryClient.create();
        } else {
          throw error;
        }
      }
    }
  }
}
