/**
 * SharePoint Write Tools
 *
 * 6 write tools that require feature flags:
 * - SHAREPOINT_ENABLE_WRITE: upload, create folder, move, copy, rename
 * - SHAREPOINT_ENABLE_DELETE: delete (separate, more dangerous)
 */

import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, UPLOAD_PATH_EXAMPLES, FOLDER_NAME_EXAMPLES, FILE_PATH_EXAMPLES } from '../utils/tool-examples.js';

/**
 * Register all write SharePoint tools with the MCP server
 */
export function registerWriteTools(server: any, ctx: ServiceContext): void {

  server.tool(
    "spo-upload-file",
    "Upload a file to a SharePoint document library. Requires SHAREPOINT_ENABLE_WRITE=true. For text content use encoding 'utf-8' (default), for binary content use 'base64'. Files up to SHAREPOINT_MAX_UPLOAD_SIZE_MB (default 100MB) are supported.",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      path: z.string().describe(
        descWithExamples("Target file path relative to drive root (including filename)", UPLOAD_PATH_EXAMPLES)
      ),
      content: z.string().describe("File content (text string or base64-encoded binary)"),
      encoding: z.enum(['utf-8', 'base64']).optional().describe("Content encoding: 'utf-8' for text (default), 'base64' for binary"),
      overwrite: z.boolean().optional().describe("Overwrite if file exists (default: false, will fail if file exists)"),
    },
    async ({ siteId, driveId, path, content, encoding, overwrite }: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.uploadFile(siteId, driveId, path, content, encoding || 'utf-8', overwrite || false);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error uploading file:", error);
        return { content: [{ type: "text", text: `Failed to upload file: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-create-folder",
    "Create a new folder in a SharePoint document library. Requires SHAREPOINT_ENABLE_WRITE=true.",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      parentPath: z.string().describe(
        descWithExamples("Parent folder path (use '/' for drive root)", [
          { label: "Drive root", value: "/" },
          { label: "Subfolder", value: "/Projects/2024" },
        ])
      ),
      folderName: z.string().describe(
        descWithExamples("Name for the new folder", FOLDER_NAME_EXAMPLES)
      ),
    },
    async ({ siteId, driveId, parentPath, folderName }: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.createFolder(siteId, driveId, parentPath, folderName);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error creating folder:", error);
        return { content: [{ type: "text", text: `Failed to create folder: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-delete-item",
    "Delete a file or folder from SharePoint. Requires SHAREPOINT_ENABLE_DELETE=true AND confirm=true. This action is IRREVERSIBLE - the item is moved to the site recycle bin.",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      itemId: z.string().describe("ID of the file or folder to delete"),
      confirm: z.boolean().describe("Must be set to true to confirm deletion. Safety mechanism to prevent accidental deletions."),
    },
    async ({ siteId, driveId, itemId, confirm }: any) => {
      try {
        ctx.checkDeleteEnabled();

        if (!confirm) {
          return {
            content: [{ type: "text", text: "Deletion cancelled: 'confirm' must be set to true. This is a safety mechanism - set confirm=true to proceed with deletion." }],
            isError: true,
          };
        }

        const result = await ctx.files.deleteItem(siteId, driveId, itemId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error deleting item:", error);
        return { content: [{ type: "text", text: `Failed to delete item: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-move-item",
    "Move a file or folder to a new location within or across document libraries. Requires SHAREPOINT_ENABLE_WRITE=true.",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Source drive ID"),
      itemId: z.string().describe("ID of the file or folder to move"),
      targetDriveId: z.string().describe("Target drive ID (can be same as source for moves within a library)"),
      targetParentPath: z.string().describe(
        descWithExamples("Target parent folder path in the target drive", [
          { label: "Drive root", value: "/" },
          { label: "Subfolder", value: "/Archive/2024" },
        ])
      ),
    },
    async ({ siteId, driveId, itemId, targetDriveId, targetParentPath }: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.moveItem(siteId, driveId, itemId, targetDriveId, targetParentPath);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error moving item:", error);
        return { content: [{ type: "text", text: `Failed to move item: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-copy-item",
    "Copy a file or folder to a new location. Requires SHAREPOINT_ENABLE_WRITE=true. Copy is asynchronous - the operation may take a moment to complete for large files.",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Source drive ID"),
      itemId: z.string().describe("ID of the file or folder to copy"),
      targetDriveId: z.string().describe("Target drive ID"),
      targetParentPath: z.string().describe(
        descWithExamples("Target parent folder path in the target drive", [
          { label: "Drive root", value: "/" },
          { label: "Subfolder", value: "/Backup/Latest" },
        ])
      ),
      newName: z.string().optional().describe("Optional new name for the copy (defaults to original name)"),
    },
    async ({ siteId, driveId, itemId, targetDriveId, targetParentPath, newName }: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.copyItem(siteId, driveId, itemId, targetDriveId, targetParentPath, newName);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error copying item:", error);
        return { content: [{ type: "text", text: `Failed to copy item: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "spo-rename-item",
    "Rename a file or folder in SharePoint. Requires SHAREPOINT_ENABLE_WRITE=true.",
    {
      siteId: z.string().describe("Site ID from configuration"),
      driveId: z.string().describe("Drive ID"),
      itemId: z.string().describe("ID of the file or folder to rename"),
      newName: z.string().describe("New name for the file or folder (include file extension for files)"),
    },
    async ({ siteId, driveId, itemId, newName }: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.renameItem(siteId, driveId, itemId, newName);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        console.error("Error renaming item:", error);
        return { content: [{ type: "text", text: `Failed to rename item: ${error.message}` }], isError: true };
      }
    }
  );
}
