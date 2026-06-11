import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  ACCOUNT_ID_EXAMPLES,
  CONTAINER_NAME_EXAMPLES,
  BLOB_NAME_EXAMPLES,
  BLOB_PREFIX_EXAMPLES,
  BLOB_TAG_FILTER_EXAMPLES,
  CONTENT_TYPE_EXAMPLES,
  METADATA_EXAMPLES,
} from '../utils/tool-examples.js';

function checkWriteEnabled(): void {
  if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
    throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
  }
}

function checkDeleteEnabled(): void {
  if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
    throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
  }
}

export function registerBlobTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "blob-list-accounts",
    "List all configured storage accounts",
    {},
    async () => {
      try {
        const accounts = ctx.storage.getAllAccounts();
        return {
          content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing storage accounts:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-test-connection",
    "Test connectivity and verify permissions for all storage services",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
    },
    async ({ accountId }: any) => {
      try {
        const result = await ctx.storage.testConnection(accountId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error testing connection:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-list-containers",
    "List containers with metadata",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      prefix: z.string().optional().describe("Filter by container name prefix"),
      maxResults: z.number().optional().describe("Maximum results (default: 1000)"),
    },
    async ({ accountId, prefix, maxResults }: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.listContainers(prefix, maxResults);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing containers:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-get-container",
    "Get container properties and metadata",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
    },
    async ({ accountId, containerName }: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.getContainer(containerName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting container:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-create-container",
    "Create new container. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
      publicAccess: z.enum(['blob', 'container']).optional().describe("Public access level (default: none/private)"),
      metadata: z.string().optional().describe(descWithExamples("Metadata JSON", METADATA_EXAMPLES)),
    },
    async ({ accountId, containerName, publicAccess, metadata }: any) => {
      try {
        checkWriteEnabled();
        const blobSvc = ctx.storage.getBlobService(accountId);
        const metadataObj = metadata ? JSON.parse(metadata) : undefined;
        const result = await blobSvc.createContainer(containerName, metadataObj, publicAccess);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error creating container:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-delete-container",
    "Delete container. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
    },
    async ({ accountId, containerName }: any) => {
      try {
        checkDeleteEnabled();
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.deleteContainer(containerName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting container:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-list-blobs",
    "List blobs with prefix filter",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
      prefix: z.string().optional().describe(descWithExamples("Filter by blob name prefix", BLOB_PREFIX_EXAMPLES)),
      maxResults: z.number().optional().describe("Maximum results (default: 1000)"),
      includeMetadata: z.boolean().optional().describe("Include blob metadata (default: false)"),
      includeTags: z.boolean().optional().describe("Include blob tags (default: false)"),
    },
    async ({ accountId, containerName, prefix, maxResults, includeMetadata, includeTags }: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.listBlobs(containerName, {
          prefix,
          maxResults,
          includeMetadata,
          includeTags,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing blobs:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-get-blob",
    "Get blob properties, metadata, and tags",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
      blobName: z.string().describe(descWithExamples("Blob name (path)", BLOB_NAME_EXAMPLES)),
    },
    async ({ accountId, containerName, blobName }: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.getBlob(containerName, blobName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting blob:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-download-blob",
    "Download blob content (text/binary as string)",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
      blobName: z.string().describe(descWithExamples("Blob name (path)", BLOB_NAME_EXAMPLES)),
    },
    async ({ accountId, containerName, blobName }: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const content = await blobSvc.downloadBlob(containerName, blobName);
        return {
          content: [{ type: "text", text: content }],
        };
      } catch (error: any) {
        console.error("Error downloading blob:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-upload-blob",
    "Upload content to blob. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
      blobName: z.string().describe(descWithExamples("Blob name (path)", BLOB_NAME_EXAMPLES)),
      content: z.string().describe("Content to upload"),
      contentType: z.string().optional().describe(descWithExamples("Content type", CONTENT_TYPE_EXAMPLES)),
      metadata: z.string().optional().describe(descWithExamples("Metadata JSON", METADATA_EXAMPLES)),
      tags: z.string().optional().describe("Tags JSON (e.g., {\"key\": \"value\"})"),
      overwrite: z.boolean().optional().describe("Overwrite if exists (default: false)"),
    },
    async ({ accountId, containerName, blobName, content, contentType, metadata, tags, overwrite }: any) => {
      try {
        checkWriteEnabled();
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.uploadBlob(containerName, blobName, content, {
          contentType,
          metadata: metadata ? JSON.parse(metadata) : undefined,
          tags: tags ? JSON.parse(tags) : undefined,
          overwrite,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error uploading blob:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-delete-blob",
    "Delete blob. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
      blobName: z.string().describe(descWithExamples("Blob name (path)", BLOB_NAME_EXAMPLES)),
    },
    async ({ accountId, containerName, blobName }: any) => {
      try {
        checkDeleteEnabled();
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.deleteBlob(containerName, blobName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting blob:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-copy-blob",
    "Copy blob within/between containers. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      sourceContainer: z.string().describe("Source container name"),
      sourceBlob: z.string().describe("Source blob name"),
      destContainer: z.string().describe("Destination container name"),
      destBlob: z.string().describe("Destination blob name"),
      overwrite: z.boolean().optional().describe("Overwrite if exists (default: false)"),
    },
    async ({ accountId, sourceContainer, sourceBlob, destContainer, destBlob, overwrite }: any) => {
      try {
        checkWriteEnabled();
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.copyBlob(sourceContainer, sourceBlob, {
          destinationContainer: destContainer,
          destinationBlob: destBlob,
          overwrite,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error copying blob:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-set-metadata",
    "Set/update blob metadata. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
      blobName: z.string().describe(descWithExamples("Blob name (path)", BLOB_NAME_EXAMPLES)),
      metadata: z.string().describe(descWithExamples("Metadata JSON", METADATA_EXAMPLES)),
    },
    async ({ accountId, containerName, blobName, metadata }: any) => {
      try {
        checkWriteEnabled();
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.setMetadata(containerName, blobName, JSON.parse(metadata));
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error setting metadata:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-set-tags",
    "Set/update blob index tags. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
      blobName: z.string().describe(descWithExamples("Blob name (path)", BLOB_NAME_EXAMPLES)),
      tags: z.string().describe("Tags JSON (e.g., {\"Department\": \"Finance\", \"Year\": \"2024\"})"),
    },
    async ({ accountId, containerName, blobName, tags }: any) => {
      try {
        checkWriteEnabled();
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.setTags(containerName, blobName, JSON.parse(tags));
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error setting tags:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "blob-search-tags",
    "Search blobs by index tags (OData filter)",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tagFilter: z.string().describe(descWithExamples("Tag filter expression", BLOB_TAG_FILTER_EXAMPLES)),
      maxResults: z.number().optional().describe("Maximum results (default: 1000)"),
    },
    async ({ accountId, tagFilter, maxResults }: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.searchByTags(tagFilter, maxResults);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error searching tags:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );
}
