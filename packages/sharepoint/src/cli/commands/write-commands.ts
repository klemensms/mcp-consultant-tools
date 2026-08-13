/**
 * SharePoint Write CLI Commands
 *
 * Maps 6 write MCP tools to Commander CLI commands under the `write` subcommand group.
 * Requires SHAREPOINT_ENABLE_WRITE=true for upload/create-folder/move/copy/rename.
 * Requires SHAREPOINT_ENABLE_DELETE=true for delete.
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerWriteCommands(program: Command, ctx: ServiceContext): void {

  const write = program.command('write').description('Write operations (upload, create folder, move, copy, rename, delete)');

  // spo-upload-file
  write
    .command('upload')
    .description('Upload a file to a SharePoint document library. Requires SHAREPOINT_ENABLE_WRITE=true.')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .requiredOption('--path <path>', 'Target file path relative to drive root (including filename)')
    .requiredOption('--content <content>', 'File content (text string or base64-encoded binary)')
    .option('--encoding <encoding>', "Content encoding: 'utf-8' for text (default), 'base64' for binary", 'utf-8')
    .option('--overwrite', 'Overwrite if file exists (default: false)')
    .action(async (opts: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.uploadFile(
          opts.siteId,
          opts.driveId,
          opts.path,
          opts.content,
          opts.encoding || 'utf-8',
          opts.overwrite || false
        );
        outputResult({ persist: false,
          fileName: `upload-${(result as any).name || 'file'}`,
          data: result,
          summary: `Uploaded: ${(result as any).name}\nSize: ${(result as any).size} bytes\nURL: ${(result as any).webUrl || 'N/A'}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-create-folder
  write
    .command('create-folder')
    .description('Create a new folder in a SharePoint document library. Requires SHAREPOINT_ENABLE_WRITE=true.')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .requiredOption('--parent-path <parentPath>', "Parent folder path (use '/' for drive root)")
    .requiredOption('--folder-name <folderName>', 'Name for the new folder')
    .action(async (opts: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.createFolder(
          opts.siteId,
          opts.driveId,
          opts.parentPath,
          opts.folderName
        );
        outputResult({ persist: false,
          fileName: `create-folder-${opts.folderName}`,
          data: result,
          summary: `Folder created: ${(result as any).name}\nURL: ${(result as any).webUrl || 'N/A'}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-move-item
  write
    .command('move')
    .description('Move a file or folder to a new location. Requires SHAREPOINT_ENABLE_WRITE=true.')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Source drive ID')
    .requiredOption('--item-id <itemId>', 'ID of the file or folder to move')
    .requiredOption('--target-drive-id <targetDriveId>', 'Target drive ID (can be same as source)')
    .requiredOption('--target-parent-path <targetParentPath>', 'Target parent folder path in the target drive')
    .action(async (opts: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.moveItem(
          opts.siteId,
          opts.driveId,
          opts.itemId,
          opts.targetDriveId,
          opts.targetParentPath
        );
        outputResult({ persist: false,
          fileName: `move-${opts.itemId}`,
          data: result,
          summary: `Moved: ${(result as any).name}\n${(result as any).message || ''}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-copy-item
  write
    .command('copy')
    .description('Copy a file or folder to a new location. Requires SHAREPOINT_ENABLE_WRITE=true.')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Source drive ID')
    .requiredOption('--item-id <itemId>', 'ID of the file or folder to copy')
    .requiredOption('--target-drive-id <targetDriveId>', 'Target drive ID')
    .requiredOption('--target-parent-path <targetParentPath>', 'Target parent folder path in the target drive')
    .option('--new-name <newName>', 'Optional new name for the copy (defaults to original name)')
    .action(async (opts: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.copyItem(
          opts.siteId,
          opts.driveId,
          opts.itemId,
          opts.targetDriveId,
          opts.targetParentPath,
          opts.newName
        );
        outputResult({
          fileName: `copy-${opts.itemId}`,
          data: result,
          summary: `Copy initiated: ${(result as any).name}\n${(result as any).message || ''}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-rename-item
  write
    .command('rename')
    .description('Rename a file or folder in SharePoint. Requires SHAREPOINT_ENABLE_WRITE=true.')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .requiredOption('--item-id <itemId>', 'ID of the file or folder to rename')
    .requiredOption('--new-name <newName>', 'New name for the file or folder (include file extension for files)')
    .action(async (opts: any) => {
      try {
        ctx.checkWriteEnabled();
        const result = await ctx.files.renameItem(
          opts.siteId,
          opts.driveId,
          opts.itemId,
          opts.newName
        );
        outputResult({ persist: false,
          fileName: `rename-${opts.itemId}`,
          data: result,
          summary: `Renamed to: ${(result as any).name}\n${(result as any).message || ''}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });

  // spo-delete-item
  write
    .command('delete')
    .description('Delete a file or folder from SharePoint. Requires SHAREPOINT_ENABLE_DELETE=true. Item is moved to recycle bin.')
    .requiredOption('--site-id <siteId>', 'Site ID from configuration')
    .requiredOption('--drive-id <driveId>', 'Drive ID')
    .requiredOption('--item-id <itemId>', 'ID of the file or folder to delete')
    .option('--confirm', 'Confirm deletion (required for safety)')
    .action(async (opts: any) => {
      try {
        ctx.checkDeleteEnabled();

        if (!opts.confirm) {
          handleCliError(new Error('Deletion requires --confirm flag. This is a safety mechanism to prevent accidental deletions.'));
          return;
        }

        const result = await ctx.files.deleteItem(
          opts.siteId,
          opts.driveId,
          opts.itemId
        );
        outputResult({ persist: false,
          fileName: `delete-${opts.itemId}`,
          data: result,
          summary: `Deleted: ${(result as any).name}\n${(result as any).message || ''}`,
        });
      } catch (error) {
        handleCliError(error);
      }
    });
}
