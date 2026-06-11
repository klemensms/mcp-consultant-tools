/**
 * Blob CLI Commands - 16 commands for blob storage operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerBlobCommands(program: Command, ctx: ServiceContext): void {
  const blob = program.command('blob').description('Blob storage operations');

  blob
    .command('list-accounts')
    .description('List all configured storage accounts')
    .action(async () => {
      try {
        const accounts = ctx.storage.getAllAccounts();
        outputResult(
          { fileName: 'storage-accounts', data: accounts, summary: `Found ${accounts.length} configured account(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list storage accounts'); }
    });

  blob
    .command('test-connection')
    .description('Test connectivity and verify permissions')
    .argument('<accountId>', 'Storage account ID')
    .action(async (accountId: string) => {
      try {
        const result = await ctx.storage.testConnection(accountId);
        outputResult(
          { fileName: `connection-test-${accountId}`, data: result, summary: `Connection test: ${result.connected ? 'OK' : 'FAILED'}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'test connection'); }
    });

  blob
    .command('list-containers')
    .description('List containers with metadata')
    .argument('<accountId>', 'Storage account ID')
    .option('-p, --prefix <prefix>', 'Filter by container name prefix')
    .option('-m, --max-results <n>', 'Maximum results (default: 1000)')
    .action(async (accountId: string, opts: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const maxResults = opts.maxResults ? parseInt(opts.maxResults) : undefined;
        const result = await blobSvc.listContainers(opts.prefix, maxResults);
        outputResult(
          { fileName: `containers-${accountId}`, data: result, summary: `Found ${result.items.length} container(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list containers'); }
    });

  blob
    .command('get-container')
    .description('Get container properties and metadata')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .action(async (accountId: string, containerName: string) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.getContainer(containerName);
        outputResult(
          { fileName: `container-${containerName}`, data: result, summary: `Container: ${containerName}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get container'); }
    });

  blob
    .command('create-container')
    .description('Create new container (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .option('--public-access <level>', 'Public access level: blob or container')
    .option('--metadata <json>', 'Metadata JSON string')
    .action(async (accountId: string, containerName: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const blobSvc = ctx.storage.getBlobService(accountId);
        const metadata = opts.metadata ? JSON.parse(opts.metadata) : undefined;
        const result = await blobSvc.createContainer(containerName, metadata, opts.publicAccess);
        outputResult(
          { fileName: `create-container-${containerName}`, data: result, summary: `Container '${containerName}' created: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create container'); }
    });

  blob
    .command('delete-container')
    .description('Delete container (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .action(async (accountId: string, containerName: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.deleteContainer(containerName);
        outputResult(
          { fileName: `delete-container-${containerName}`, data: result, summary: `Container '${containerName}' deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete container'); }
    });

  blob
    .command('list')
    .description('List blobs with prefix filter')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .option('-p, --prefix <prefix>', 'Filter by blob name prefix')
    .option('-m, --max-results <n>', 'Maximum results (default: 1000)')
    .option('--include-metadata', 'Include blob metadata')
    .option('--include-tags', 'Include blob tags')
    .action(async (accountId: string, containerName: string, opts: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.listBlobs(containerName, {
          prefix: opts.prefix,
          maxResults: opts.maxResults ? parseInt(opts.maxResults) : undefined,
          includeMetadata: opts.includeMetadata,
          includeTags: opts.includeTags,
        });
        outputResult(
          { fileName: `blobs-${containerName}`, data: result, summary: `Found ${result.items.length} blob(s) in '${containerName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list blobs'); }
    });

  blob
    .command('get')
    .description('Get blob properties, metadata, and tags')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .argument('<blobName>', 'Blob name (path)')
    .action(async (accountId: string, containerName: string, blobName: string) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.getBlob(containerName, blobName);
        outputResult(
          { fileName: `blob-${blobName.replace(/\//g, '-')}`, data: result, summary: `Blob: ${containerName}/${blobName}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get blob'); }
    });

  blob
    .command('download')
    .description('Download blob content')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .argument('<blobName>', 'Blob name (path)')
    .action(async (accountId: string, containerName: string, blobName: string) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const content = await blobSvc.downloadBlob(containerName, blobName);
        outputResult(
          { fileName: `download-${blobName.replace(/\//g, '-')}`, data: content, summary: `Downloaded: ${containerName}/${blobName} (${content.length} chars)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'download blob'); }
    });

  blob
    .command('upload')
    .description('Upload content to blob (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .argument('<blobName>', 'Blob name (path)')
    .argument('<content>', 'Content to upload')
    .option('--content-type <type>', 'Content type (e.g., text/plain, application/json)')
    .option('--metadata <json>', 'Metadata JSON string')
    .option('--tags <json>', 'Tags JSON string')
    .option('--overwrite', 'Overwrite if exists')
    .action(async (accountId: string, containerName: string, blobName: string, content: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.uploadBlob(containerName, blobName, content, {
          contentType: opts.contentType,
          metadata: opts.metadata ? JSON.parse(opts.metadata) : undefined,
          tags: opts.tags ? JSON.parse(opts.tags) : undefined,
          overwrite: opts.overwrite,
        });
        outputResult(
          { fileName: `upload-${blobName.replace(/\//g, '-')}`, data: result, summary: `Upload '${blobName}': ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'upload blob'); }
    });

  blob
    .command('delete')
    .description('Delete blob (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .argument('<blobName>', 'Blob name (path)')
    .action(async (accountId: string, containerName: string, blobName: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.deleteBlob(containerName, blobName);
        outputResult(
          { fileName: `delete-blob-${blobName.replace(/\//g, '-')}`, data: result, summary: `Blob '${blobName}' deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete blob'); }
    });

  blob
    .command('copy')
    .description('Copy blob within/between containers (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .requiredOption('--source-container <name>', 'Source container name')
    .requiredOption('--source-blob <name>', 'Source blob name')
    .requiredOption('--dest-container <name>', 'Destination container name')
    .requiredOption('--dest-blob <name>', 'Destination blob name')
    .option('--overwrite', 'Overwrite if exists')
    .action(async (accountId: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.copyBlob(opts.sourceContainer, opts.sourceBlob, {
          destinationContainer: opts.destContainer,
          destinationBlob: opts.destBlob,
          overwrite: opts.overwrite,
        });
        outputResult(
          { fileName: `copy-blob`, data: result, summary: `Copy blob: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'copy blob'); }
    });

  blob
    .command('set-metadata')
    .description('Set/update blob metadata (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .argument('<blobName>', 'Blob name (path)')
    .argument('<metadata>', 'Metadata JSON string')
    .action(async (accountId: string, containerName: string, blobName: string, metadata: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.setMetadata(containerName, blobName, JSON.parse(metadata));
        outputResult(
          { fileName: `set-metadata-${blobName.replace(/\//g, '-')}`, data: result, summary: `Metadata set for '${blobName}': ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'set blob metadata'); }
    });

  blob
    .command('set-tags')
    .description('Set/update blob index tags (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<containerName>', 'Container name')
    .argument('<blobName>', 'Blob name (path)')
    .argument('<tags>', 'Tags JSON string')
    .action(async (accountId: string, containerName: string, blobName: string, tags: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const blobSvc = ctx.storage.getBlobService(accountId);
        const result = await blobSvc.setTags(containerName, blobName, JSON.parse(tags));
        outputResult(
          { fileName: `set-tags-${blobName.replace(/\//g, '-')}`, data: result, summary: `Tags set for '${blobName}': ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'set blob tags'); }
    });

  blob
    .command('search-tags')
    .description('Search blobs by index tags (OData filter)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<tagFilter>', 'Tag filter expression')
    .option('-m, --max-results <n>', 'Maximum results (default: 1000)')
    .action(async (accountId: string, tagFilter: string, opts: any) => {
      try {
        const blobSvc = ctx.storage.getBlobService(accountId);
        const maxResults = opts.maxResults ? parseInt(opts.maxResults) : undefined;
        const result = await blobSvc.searchByTags(tagFilter, maxResults);
        outputResult(
          { fileName: `tag-search`, data: result, summary: `Found ${result.items.length} blob(s) matching tag filter` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'search blob tags'); }
    });
}
