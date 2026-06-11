import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  ACCOUNT_ID_EXAMPLES,
  SHARE_NAME_EXAMPLES,
  FILE_PATH_EXAMPLES,
  FILE_NAME_EXAMPLES,
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

export function registerFileTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "file-list-shares",
    "List file shares",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      prefix: z.string().optional().describe("Filter by share name prefix"),
      maxResults: z.number().optional().describe("Maximum results (default: 1000)"),
    },
    async ({ accountId, prefix, maxResults }: any) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.listShares(prefix, maxResults);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing shares:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-get-share",
    "Get share properties and quota",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
    },
    async ({ accountId, shareName }: any) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.getShare(shareName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting share:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-create-share",
    "Create file share. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
      quota: z.number().optional().describe("Quota in GB"),
      metadata: z.string().optional().describe(descWithExamples("Metadata JSON", METADATA_EXAMPLES)),
    },
    async ({ accountId, shareName, quota, metadata }: any) => {
      try {
        checkWriteEnabled();
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.createShare(
          shareName,
          quota,
          metadata ? JSON.parse(metadata) : undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error creating share:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-delete-share",
    "Delete file share. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
    },
    async ({ accountId, shareName }: any) => {
      try {
        checkDeleteEnabled();
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.deleteShare(shareName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting share:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-list-items",
    "List files and directories in path",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
      path: z.string().optional().describe(descWithExamples("Directory path (empty for root)", FILE_PATH_EXAMPLES)),
      maxResults: z.number().optional().describe("Maximum results (default: 1000)"),
    },
    async ({ accountId, shareName, path, maxResults }: any) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.listItems(shareName, { path, maxResults });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing items:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-create-directory",
    "Create directory. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
      directoryPath: z.string().describe(descWithExamples("Directory path", FILE_PATH_EXAMPLES)),
      metadata: z.string().optional().describe(descWithExamples("Metadata JSON", METADATA_EXAMPLES)),
    },
    async ({ accountId, shareName, directoryPath, metadata }: any) => {
      try {
        checkWriteEnabled();
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.createDirectory(
          shareName,
          directoryPath,
          metadata ? JSON.parse(metadata) : undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error creating directory:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-delete-directory",
    "Delete directory. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
      directoryPath: z.string().describe(descWithExamples("Directory path", FILE_PATH_EXAMPLES)),
    },
    async ({ accountId, shareName, directoryPath }: any) => {
      try {
        checkDeleteEnabled();
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.deleteDirectory(shareName, directoryPath);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting directory:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-get-file",
    "Get file properties",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
      filePath: z.string().describe(descWithExamples("File path", FILE_NAME_EXAMPLES)),
    },
    async ({ accountId, shareName, filePath }: any) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.getFile(shareName, filePath);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting file:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-download-file",
    "Download file content",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
      filePath: z.string().describe(descWithExamples("File path", FILE_NAME_EXAMPLES)),
    },
    async ({ accountId, shareName, filePath }: any) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const content = await fileSvc.downloadFile(shareName, filePath);
        return {
          content: [{ type: "text", text: content }],
        };
      } catch (error: any) {
        console.error("Error downloading file:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-upload-file",
    "Upload file content. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
      filePath: z.string().describe(descWithExamples("File path", FILE_NAME_EXAMPLES)),
      content: z.string().describe("File content to upload"),
      contentType: z.string().optional().describe(descWithExamples("Content type", CONTENT_TYPE_EXAMPLES)),
      metadata: z.string().optional().describe(descWithExamples("Metadata JSON", METADATA_EXAMPLES)),
      overwrite: z.boolean().optional().describe("Overwrite if exists (default: false)"),
    },
    async ({ accountId, shareName, filePath, content, contentType, metadata, overwrite }: any) => {
      try {
        checkWriteEnabled();
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.uploadFile(shareName, filePath, content, {
          contentType,
          metadata: metadata ? JSON.parse(metadata) : undefined,
          overwrite,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error uploading file:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-delete-file",
    "Delete file. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
      filePath: z.string().describe(descWithExamples("File path", FILE_NAME_EXAMPLES)),
    },
    async ({ accountId, shareName, filePath }: any) => {
      try {
        checkDeleteEnabled();
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.deleteFile(shareName, filePath);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting file:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "file-copy-file",
    "Copy file within/between shares. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      sourceShare: z.string().describe("Source share name"),
      sourceFile: z.string().describe("Source file path"),
      destShare: z.string().describe("Destination share name"),
      destFile: z.string().describe("Destination file path"),
      overwrite: z.boolean().optional().describe("Overwrite if exists (default: false)"),
    },
    async ({ accountId, sourceShare, sourceFile, destShare, destFile, overwrite }: any) => {
      try {
        checkWriteEnabled();
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.copyFile(sourceShare, sourceFile, destShare, destFile, overwrite);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error copying file:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );
}
