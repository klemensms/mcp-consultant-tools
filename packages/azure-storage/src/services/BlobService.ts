/**
 * Blob Service
 *
 * Handles all blob storage operations: containers and blobs.
 */

import {
  BlobServiceClient,
  ContainerClient,
  BlockBlobClient,
  BlobItem,
  ContainerItem,
} from '@azure/storage-blob';
import { auditLogger } from '@mcp-consultant-tools/core';

import type {
  ContainerInfo,
  BlobInfo,
  BlobListOptions,
  BlobUploadOptions,
  BlobCopyOptions,
  ListResult,
  OperationResult,
} from '../types/storage-types.js';

export class BlobService {
  private client: BlobServiceClient;
  private accountId: string;
  private maxBlobSizeMB: number;
  private maxListResults: number;

  constructor(
    client: BlobServiceClient,
    accountId: string,
    maxBlobSizeMB: number,
    maxListResults: number
  ) {
    this.client = client;
    this.accountId = accountId;
    this.maxBlobSizeMB = maxBlobSizeMB;
    this.maxListResults = maxListResults;
  }

  // ==========================================================================
  // Container Operations
  // ==========================================================================

  /**
   * List all containers
   */
  async listContainers(
    prefix?: string,
    maxResults?: number
  ): Promise<ListResult<ContainerInfo>> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(maxResults || this.maxListResults, this.maxListResults);

    try {
      const containers: ContainerInfo[] = [];
      const iter = this.client.listContainers({
        prefix,
        includeMetadata: true,
      });

      for await (const container of iter) {
        containers.push(this.mapContainerItem(container));
        if (containers.length >= limit) break;
      }

      auditLogger.log({
        operation: 'list-containers',
        operationType: 'READ',
        componentType: 'BlobContainer',
        parameters: { accountId: this.accountId, prefix, count: containers.length },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        items: containers,
        hasMore: containers.length >= limit,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-containers',
        operationType: 'READ',
        componentType: 'BlobContainer',
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get container properties
   */
  async getContainer(containerName: string): Promise<ContainerInfo> {
    const timer = auditLogger.startTimer();

    try {
      const containerClient = this.client.getContainerClient(containerName);
      const properties = await containerClient.getProperties();

      const info: ContainerInfo = {
        name: containerName,
        lastModified: properties.lastModified,
        publicAccess: properties.blobPublicAccess,
        leaseState: properties.leaseState,
        leaseStatus: properties.leaseStatus,
        metadata: properties.metadata,
      };

      auditLogger.log({
        operation: 'get-container',
        operationType: 'READ',
        componentType: 'BlobContainer',
        componentName: containerName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return info;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-container',
        operationType: 'READ',
        componentType: 'BlobContainer',
        componentName: containerName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Create a new container
   */
  async createContainer(
    containerName: string,
    metadata?: Record<string, string>,
    publicAccess?: 'blob' | 'container'
  ): Promise<OperationResult<ContainerInfo>> {
    const timer = auditLogger.startTimer();

    try {
      const containerClient = this.client.getContainerClient(containerName);
      await containerClient.create({
        metadata,
        access: publicAccess,
      });

      const info = await this.getContainer(containerName);

      auditLogger.log({
        operation: 'create-container',
        operationType: 'CREATE',
        componentType: 'BlobContainer',
        componentName: containerName,
        parameters: { accountId: this.accountId, publicAccess },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: info };
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-container',
        operationType: 'CREATE',
        componentType: 'BlobContainer',
        componentName: containerName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a container
   */
  async deleteContainer(containerName: string): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const containerClient = this.client.getContainerClient(containerName);
      await containerClient.delete();

      auditLogger.log({
        operation: 'delete-container',
        operationType: 'DELETE',
        componentType: 'BlobContainer',
        componentName: containerName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-container',
        operationType: 'DELETE',
        componentType: 'BlobContainer',
        componentName: containerName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // Blob Operations
  // ==========================================================================

  /**
   * List blobs in a container
   */
  async listBlobs(
    containerName: string,
    options?: BlobListOptions
  ): Promise<ListResult<BlobInfo>> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(options?.maxResults || this.maxListResults, this.maxListResults);

    try {
      const containerClient = this.client.getContainerClient(containerName);
      const blobs: BlobInfo[] = [];

      const iter = containerClient.listBlobsFlat({
        prefix: options?.prefix,
        includeMetadata: options?.includeMetadata,
        includeTags: options?.includeTags,
        includeDeleted: options?.includeDeleted,
      });

      for await (const blob of iter) {
        blobs.push(this.mapBlobItem(blob, containerName));
        if (blobs.length >= limit) break;
      }

      auditLogger.log({
        operation: 'list-blobs',
        operationType: 'READ',
        componentType: 'Blob',
        componentName: containerName,
        parameters: { accountId: this.accountId, prefix: options?.prefix, count: blobs.length },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        items: blobs,
        hasMore: blobs.length >= limit,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-blobs',
        operationType: 'READ',
        componentType: 'Blob',
        componentName: containerName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get blob properties and metadata
   */
  async getBlob(containerName: string, blobName: string): Promise<BlobInfo> {
    const timer = auditLogger.startTimer();

    try {
      const containerClient = this.client.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobName);
      const properties = await blobClient.getProperties();

      // Get tags separately
      let tags: Record<string, string> | undefined;
      try {
        const tagsResponse = await blobClient.getTags();
        tags = tagsResponse.tags;
      } catch {
        // Tags might not be available (permissions or account type)
      }

      const info: BlobInfo = {
        name: blobName,
        containerName,
        contentType: properties.contentType,
        contentLength: properties.contentLength,
        lastModified: properties.lastModified,
        etag: properties.etag,
        blobType: properties.blobType,
        accessTier: properties.accessTier,
        leaseState: properties.leaseState,
        metadata: properties.metadata,
        tags,
      };

      auditLogger.log({
        operation: 'get-blob',
        operationType: 'READ',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return info;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-blob',
        operationType: 'READ',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Download blob content
   */
  async downloadBlob(containerName: string, blobName: string): Promise<string> {
    const timer = auditLogger.startTimer();

    try {
      const containerClient = this.client.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobName);

      // Check size before download
      const properties = await blobClient.getProperties();
      const sizeMB = (properties.contentLength || 0) / (1024 * 1024);
      if (sizeMB > this.maxBlobSizeMB) {
        throw new Error(
          `Blob size (${sizeMB.toFixed(2)} MB) exceeds maximum allowed (${this.maxBlobSizeMB} MB)`
        );
      }

      const downloadResponse = await blobClient.download();
      const content = await this.streamToString(downloadResponse.readableStreamBody!);

      auditLogger.log({
        operation: 'download-blob',
        operationType: 'READ',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId, sizeMB: sizeMB.toFixed(2) },
        success: true,
        executionTimeMs: timer(),
      });

      return content;
    } catch (error: any) {
      auditLogger.log({
        operation: 'download-blob',
        operationType: 'READ',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Upload content to a blob
   */
  async uploadBlob(
    containerName: string,
    blobName: string,
    content: string,
    options?: BlobUploadOptions
  ): Promise<OperationResult<BlobInfo>> {
    const timer = auditLogger.startTimer();

    try {
      // Check content size
      const sizeMB = Buffer.byteLength(content, 'utf8') / (1024 * 1024);
      if (sizeMB > this.maxBlobSizeMB) {
        throw new Error(
          `Content size (${sizeMB.toFixed(2)} MB) exceeds maximum allowed (${this.maxBlobSizeMB} MB)`
        );
      }

      const containerClient = this.client.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Check if blob exists and overwrite is not allowed
      if (!options?.overwrite) {
        const exists = await blockBlobClient.exists();
        if (exists) {
          throw new Error(
            `Blob '${blobName}' already exists. Set overwrite: true to replace.`
          );
        }
      }

      await blockBlobClient.upload(content, Buffer.byteLength(content, 'utf8'), {
        blobHTTPHeaders: {
          blobContentType: options?.contentType || 'application/octet-stream',
        },
        metadata: options?.metadata,
        tags: options?.tags,
      });

      const info = await this.getBlob(containerName, blobName);

      auditLogger.log({
        operation: 'upload-blob',
        operationType: 'CREATE',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId, sizeMB: sizeMB.toFixed(2) },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: info };
    } catch (error: any) {
      auditLogger.log({
        operation: 'upload-blob',
        operationType: 'CREATE',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a blob
   */
  async deleteBlob(containerName: string, blobName: string): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const containerClient = this.client.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobName);
      await blobClient.delete();

      auditLogger.log({
        operation: 'delete-blob',
        operationType: 'DELETE',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-blob',
        operationType: 'DELETE',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Copy a blob
   */
  async copyBlob(
    sourceContainer: string,
    sourceBlob: string,
    options: BlobCopyOptions
  ): Promise<OperationResult<BlobInfo>> {
    const timer = auditLogger.startTimer();

    try {
      const sourceContainerClient = this.client.getContainerClient(sourceContainer);
      const sourceBlobClient = sourceContainerClient.getBlobClient(sourceBlob);
      const sourceUrl = sourceBlobClient.url;

      const destContainerClient = this.client.getContainerClient(options.destinationContainer);
      const destBlobClient = destContainerClient.getBlobClient(options.destinationBlob);

      // Check if destination exists and overwrite is not allowed
      if (!options.overwrite) {
        const exists = await destBlobClient.exists();
        if (exists) {
          throw new Error(
            `Destination blob '${options.destinationBlob}' already exists. Set overwrite: true to replace.`
          );
        }
      }

      // Start copy operation
      const copyPoller = await destBlobClient.beginCopyFromURL(sourceUrl);
      await copyPoller.pollUntilDone();

      const info = await this.getBlob(options.destinationContainer, options.destinationBlob);

      auditLogger.log({
        operation: 'copy-blob',
        operationType: 'CREATE',
        componentType: 'Blob',
        componentName: `${sourceContainer}/${sourceBlob}`,
        parameters: {
          accountId: this.accountId,
          destination: `${options.destinationContainer}/${options.destinationBlob}`,
        },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: info };
    } catch (error: any) {
      auditLogger.log({
        operation: 'copy-blob',
        operationType: 'CREATE',
        componentType: 'Blob',
        componentName: `${sourceContainer}/${sourceBlob}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Set blob metadata
   */
  async setMetadata(
    containerName: string,
    blobName: string,
    metadata: Record<string, string>
  ): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const containerClient = this.client.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobName);
      await blobClient.setMetadata(metadata);

      auditLogger.log({
        operation: 'set-metadata',
        operationType: 'UPDATE',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId, metadataKeys: Object.keys(metadata) },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'set-metadata',
        operationType: 'UPDATE',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Set blob tags
   */
  async setTags(
    containerName: string,
    blobName: string,
    tags: Record<string, string>
  ): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const containerClient = this.client.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobName);
      await blobClient.setTags(tags);

      auditLogger.log({
        operation: 'set-tags',
        operationType: 'UPDATE',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId, tagKeys: Object.keys(tags) },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'set-tags',
        operationType: 'UPDATE',
        componentType: 'Blob',
        componentName: `${containerName}/${blobName}`,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Search blobs by tags (index tags query)
   */
  async searchByTags(tagFilter: string, maxResults?: number): Promise<ListResult<BlobInfo>> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(maxResults || this.maxListResults, this.maxListResults);

    try {
      const blobs: BlobInfo[] = [];
      const iter = this.client.findBlobsByTags(tagFilter);

      for await (const blob of iter) {
        blobs.push({
          name: blob.name,
          containerName: blob.containerName,
          tags: blob.tags,
        });
        if (blobs.length >= limit) break;
      }

      auditLogger.log({
        operation: 'search-tags',
        operationType: 'READ',
        componentType: 'Blob',
        parameters: { accountId: this.accountId, tagFilter, count: blobs.length },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        items: blobs,
        hasMore: blobs.length >= limit,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-tags',
        operationType: 'READ',
        componentType: 'Blob',
        parameters: { accountId: this.accountId, tagFilter },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private mapContainerItem(item: ContainerItem): ContainerInfo {
    return {
      name: item.name,
      lastModified: item.properties.lastModified,
      publicAccess: item.properties.publicAccess,
      leaseState: item.properties.leaseState,
      leaseStatus: item.properties.leaseStatus,
      metadata: item.metadata,
    };
  }

  private mapBlobItem(item: BlobItem, containerName: string): BlobInfo {
    return {
      name: item.name,
      containerName,
      contentType: item.properties.contentType,
      contentLength: item.properties.contentLength,
      lastModified: item.properties.lastModified,
      etag: item.properties.etag,
      blobType: item.properties.blobType,
      accessTier: item.properties.accessTier,
      leaseState: item.properties.leaseState,
      metadata: item.metadata,
      tags: item.tags,
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
}
