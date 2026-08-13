/**
 * File Share CLI Commands - 12 commands for file share operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerFileCommands(program: Command, ctx: ServiceContext): void {
  const file = program.command('file').description('File share operations');

  file
    .command('list-shares')
    .description('List file shares')
    .argument('<accountId>', 'Storage account ID')
    .option('-p, --prefix <prefix>', 'Filter by share name prefix')
    .option('-m, --max-results <n>', 'Maximum results (default: 1000)')
    .action(async (accountId: string, opts: any) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const maxResults = opts.maxResults ? parseInt(opts.maxResults) : undefined;
        const result = await fileSvc.listShares(opts.prefix, maxResults);
        outputResult(
          { fileName: `shares-${accountId}`, data: result, summary: `Found ${result.items.length} share(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list shares'); }
    });

  file
    .command('get-share')
    .description('Get share properties and quota')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .action(async (accountId: string, shareName: string) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.getShare(shareName);
        outputResult(
          { fileName: `share-${shareName}`, data: result, summary: `Share: ${shareName}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get share'); }
    });

  file
    .command('create-share')
    .description('Create file share (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .option('-q, --quota <gb>', 'Quota in GB')
    .option('--metadata <json>', 'Metadata JSON string')
    .action(async (accountId: string, shareName: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const fileSvc = ctx.storage.getFileService(accountId);
        const quota = opts.quota ? parseInt(opts.quota) : undefined;
        const metadata = opts.metadata ? JSON.parse(opts.metadata) : undefined;
        const result = await fileSvc.createShare(shareName, quota, metadata);
        outputResult(
          { persist: false, fileName: `create-share-${shareName}`, data: result, summary: `Share '${shareName}' created: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create share'); }
    });

  file
    .command('delete-share')
    .description('Delete file share (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .action(async (accountId: string, shareName: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.deleteShare(shareName);
        outputResult(
          { persist: false, fileName: `delete-share-${shareName}`, data: result, summary: `Share '${shareName}' deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete share'); }
    });

  file
    .command('list-items')
    .description('List files and directories in path')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .option('-p, --path <path>', 'Directory path (empty for root)')
    .option('-m, --max-results <n>', 'Maximum results (default: 1000)')
    .action(async (accountId: string, shareName: string, opts: any) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.listItems(shareName, {
          path: opts.path,
          maxResults: opts.maxResults ? parseInt(opts.maxResults) : undefined,
        });
        outputResult(
          { fileName: `items-${shareName}`, data: result, summary: `Found ${result.items.length} item(s) in '${shareName}/${opts.path || ''}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list items'); }
    });

  file
    .command('create-directory')
    .description('Create directory (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .argument('<directoryPath>', 'Directory path')
    .option('--metadata <json>', 'Metadata JSON string')
    .action(async (accountId: string, shareName: string, directoryPath: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const fileSvc = ctx.storage.getFileService(accountId);
        const metadata = opts.metadata ? JSON.parse(opts.metadata) : undefined;
        const result = await fileSvc.createDirectory(shareName, directoryPath, metadata);
        outputResult(
          { persist: false, fileName: `create-dir-${directoryPath.replace(/\//g, '-')}`, data: result, summary: `Directory '${directoryPath}' created: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create directory'); }
    });

  file
    .command('delete-directory')
    .description('Delete directory (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .argument('<directoryPath>', 'Directory path')
    .action(async (accountId: string, shareName: string, directoryPath: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.deleteDirectory(shareName, directoryPath);
        outputResult(
          { persist: false, fileName: `delete-dir-${directoryPath.replace(/\//g, '-')}`, data: result, summary: `Directory '${directoryPath}' deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete directory'); }
    });

  file
    .command('get')
    .description('Get file properties')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .argument('<filePath>', 'File path')
    .action(async (accountId: string, shareName: string, filePath: string) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.getFile(shareName, filePath);
        outputResult(
          { fileName: `file-${filePath.replace(/\//g, '-')}`, data: result, summary: `File: ${shareName}/${filePath}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get file'); }
    });

  file
    .command('download')
    .description('Download file content')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .argument('<filePath>', 'File path')
    .action(async (accountId: string, shareName: string, filePath: string) => {
      try {
        const fileSvc = ctx.storage.getFileService(accountId);
        const content = await fileSvc.downloadFile(shareName, filePath);
        outputResult(
          { fileName: `download-${filePath.replace(/\//g, '-')}`, data: content, summary: `Downloaded: ${shareName}/${filePath} (${content.length} chars)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'download file'); }
    });

  file
    .command('upload')
    .description('Upload file content (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .argument('<filePath>', 'File path')
    .argument('<content>', 'File content to upload')
    .option('--content-type <type>', 'Content type')
    .option('--metadata <json>', 'Metadata JSON string')
    .option('--overwrite', 'Overwrite if exists')
    .action(async (accountId: string, shareName: string, filePath: string, content: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.uploadFile(shareName, filePath, content, {
          contentType: opts.contentType,
          metadata: opts.metadata ? JSON.parse(opts.metadata) : undefined,
          overwrite: opts.overwrite,
        });
        outputResult(
          { persist: false, fileName: `upload-${filePath.replace(/\//g, '-')}`, data: result, summary: `Upload '${filePath}': ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'upload file'); }
    });

  file
    .command('delete')
    .description('Delete file (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<shareName>', 'Share name')
    .argument('<filePath>', 'File path')
    .action(async (accountId: string, shareName: string, filePath: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.deleteFile(shareName, filePath);
        outputResult(
          { persist: false, fileName: `delete-file-${filePath.replace(/\//g, '-')}`, data: result, summary: `File '${filePath}' deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete file'); }
    });

  file
    .command('copy')
    .description('Copy file within/between shares (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .requiredOption('--source-share <name>', 'Source share name')
    .requiredOption('--source-file <path>', 'Source file path')
    .requiredOption('--dest-share <name>', 'Destination share name')
    .requiredOption('--dest-file <path>', 'Destination file path')
    .option('--overwrite', 'Overwrite if exists')
    .action(async (accountId: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const fileSvc = ctx.storage.getFileService(accountId);
        const result = await fileSvc.copyFile(
          opts.sourceShare,
          opts.sourceFile,
          opts.destShare,
          opts.destFile,
          opts.overwrite
        );
        outputResult(
          { fileName: `copy-file`, data: result, summary: `Copy file: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'copy file'); }
    });
}
