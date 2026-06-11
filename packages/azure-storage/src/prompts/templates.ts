import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  ACCOUNT_ID_EXAMPLES,
  CONTAINER_NAME_EXAMPLES,
  QUEUE_NAME_EXAMPLES,
  TABLE_NAME_EXAMPLES,
  SHARE_NAME_EXAMPLES,
} from '../utils/tool-examples.js';
import * as formatters from '../utils/storage-formatters.js';

export function registerStoragePrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "storage-account-overview",
    "Overview of storage account: containers, shares, queues, tables",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
    },
    async ({ accountId }: any) => {
      const account = ctx.storage.getAccountById(accountId);
      const connectionTest = await ctx.storage.testConnection(accountId);

      const blobSvc = ctx.storage.getBlobService(accountId);
      const queueSvc = ctx.storage.getQueueService(accountId);
      const tableSvc = ctx.storage.getTableService(accountId);
      const fileSvc = ctx.storage.getFileService(accountId);

      const [containers, queues, tables, shares] = await Promise.all([
        connectionTest.blobServiceAvailable ? blobSvc.listContainers() : { items: [] },
        connectionTest.queueServiceAvailable ? queueSvc.listQueues() : { items: [] },
        connectionTest.tableServiceAvailable ? tableSvc.listTables() : { items: [] },
        connectionTest.fileServiceAvailable ? fileSvc.listShares() : { items: [] },
      ]);

      const output = formatters.formatAccountOverviewAsMarkdown(
        account,
        connectionTest,
        containers.items,
        queues.items,
        tables.items,
        shares.items
      );

      return {
        messages: [{ role: "user", content: { type: "text", text: output } }],
      };
    }
  );

  server.prompt(
    "blob-container-analysis",
    "Analyze container: types, sizes, distribution",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      containerName: z.string().describe(descWithExamples("Container name", CONTAINER_NAME_EXAMPLES)),
    },
    async ({ accountId, containerName }: any) => {
      const blobSvc = ctx.storage.getBlobService(accountId);

      const container = await blobSvc.getContainer(containerName);
      const blobs = await blobSvc.listBlobs(containerName, { includeMetadata: true, includeTags: true });

      const output = formatters.formatContainerAnalysisAsMarkdown(container, blobs.items);

      return {
        messages: [{ role: "user", content: { type: "text", text: output } }],
      };
    }
  );

  server.prompt(
    "blob-search-guide",
    "Guide for finding blobs using various search methods",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
    },
    async ({ accountId }: any) => {
      const account = ctx.storage.getAccountById(accountId);

      let output = `# Blob Search Guide for ${account.name}\n\n`;

      output += `## Search Methods\n\n`;
      output += `### 1. List by Prefix\n`;
      output += `Use \`blob-list-blobs\` with a prefix to find blobs by path:\n`;
      output += `- Prefix \`reports/2024/\` - all blobs in that folder\n`;
      output += `- Prefix \`logs/app-\` - all blobs starting with "app-" in logs folder\n\n`;

      output += `### 2. Search by Tags\n`;
      output += `Use \`blob-search-tags\` with an OData filter:\n`;
      output += `- \`"Department"='Finance'\` - all blobs tagged with Finance\n`;
      output += `- \`"Year"='2024' AND "Type"='Report'\` - combined filter\n\n`;

      output += `### 3. Get Specific Blob\n`;
      output += `Use \`blob-get-blob\` with container and blob name:\n`;
      output += `- Returns metadata, tags, properties\n\n`;

      output += `## Tag Examples\n\n`;
      output += `| Use Case | Filter |\n`;
      output += `|----------|--------|\n`;
      output += `| By department | \`"Department"='HR'\` |\n`;
      output += `| By year | \`"Year"='2024'\` |\n`;
      output += `| By status | \`"Status"='Archived'\` |\n`;
      output += `| Combined | \`"Year"='2024' AND "Type"='Invoice'\` |\n`;

      return {
        messages: [{ role: "user", content: { type: "text", text: output } }],
      };
    }
  );

  server.prompt(
    "queue-health-check",
    "Queue health analysis and recommendations",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
    },
    async ({ accountId, queueName }: any) => {
      const queueSvc = ctx.storage.getQueueService(accountId);

      const queue = await queueSvc.getQueue(queueName);
      const messages = await queueSvc.peekMessages(queueName, 1);

      let oldestMessageAge: number | undefined;
      if (messages.length > 0 && messages[0].insertedOn) {
        oldestMessageAge = Date.now() - messages[0].insertedOn.getTime();
      }

      const output = formatters.formatQueueHealthAsMarkdown(
        queue,
        queue.approximateMessagesCount || 0,
        oldestMessageAge
      );

      return {
        messages: [{ role: "user", content: { type: "text", text: output } }],
      };
    }
  );

  server.prompt(
    "table-schema-discovery",
    "Discover entity structure by sampling table",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      tableName: z.string().describe(descWithExamples("Table name", TABLE_NAME_EXAMPLES)),
    },
    async ({ accountId, tableName }: any) => {
      const tableSvc = ctx.storage.getTableService(accountId);

      const entities = await tableSvc.queryEntities(tableName, { top: 10 });

      const output = formatters.formatTableSchemaAsMarkdown(tableName, entities.items);

      return {
        messages: [{ role: "user", content: { type: "text", text: output } }],
      };
    }
  );

  server.prompt(
    "file-share-audit",
    "Audit file share structure and contents",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      shareName: z.string().describe(descWithExamples("Share name", SHARE_NAME_EXAMPLES)),
    },
    async ({ accountId, shareName }: any) => {
      const fileSvc = ctx.storage.getFileService(accountId);

      const share = await fileSvc.getShare(shareName);
      const items = await fileSvc.listItems(shareName, { maxResults: 100 });

      // Calculate totals
      let totalSize = 0;
      let fileCount = 0;
      let dirCount = 0;

      for (const item of items.items) {
        if (item.kind === 'file') {
          fileCount++;
          totalSize += item.contentLength || 0;
        } else {
          dirCount++;
        }
      }

      const output = formatters.formatFileShareAuditAsMarkdown(
        share,
        items.items,
        totalSize,
        fileCount,
        dirCount
      );

      return {
        messages: [{ role: "user", content: { type: "text", text: output } }],
      };
    }
  );

  server.prompt(
    "storage-migration-verification",
    "Verify data migration between containers/shares",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      sourceContainer: z.string().describe("Source container name"),
      targetContainer: z.string().describe("Target container name"),
    },
    async ({ accountId, sourceContainer, targetContainer }: any) => {
      const blobSvc = ctx.storage.getBlobService(accountId);

      const [sourceBlobs, targetBlobs] = await Promise.all([
        blobSvc.listBlobs(sourceContainer, { maxResults: 500 }),
        blobSvc.listBlobs(targetContainer, { maxResults: 500 }),
      ]);

      const sourceNames = new Set(sourceBlobs.items.map(b => b.name));
      const targetNames = new Set(targetBlobs.items.map(b => b.name));

      const missing = [...sourceNames].filter(n => !targetNames.has(n));
      const extra = [...targetNames].filter(n => !sourceNames.has(n));

      let output = `# Migration Verification\n\n`;
      output += `**Source:** ${sourceContainer} (${sourceBlobs.items.length} blobs)\n`;
      output += `**Target:** ${targetContainer} (${targetBlobs.items.length} blobs)\n\n`;

      if (missing.length === 0 && extra.length === 0) {
        output += `✅ **Migration Complete** - All blobs accounted for\n`;
      } else {
        if (missing.length > 0) {
          output += `## Missing in Target (${missing.length})\n\n`;
          for (const name of missing.slice(0, 20)) {
            output += `- ${name}\n`;
          }
          if (missing.length > 20) {
            output += `- ... and ${missing.length - 20} more\n`;
          }
          output += '\n';
        }

        if (extra.length > 0) {
          output += `## Extra in Target (${extra.length})\n\n`;
          for (const name of extra.slice(0, 20)) {
            output += `- ${name}\n`;
          }
          if (extra.length > 20) {
            output += `- ... and ${extra.length - 20} more\n`;
          }
        }
      }

      return {
        messages: [{ role: "user", content: { type: "text", text: output } }],
      };
    }
  );

  server.prompt(
    "storage-troubleshooting-guide",
    "Troubleshooting guide for common storage issues",
    {},
    async () => {
      let output = `# Azure Storage Troubleshooting Guide\n\n`;

      output += `## Common Issues\n\n`;

      output += `### Authentication Errors\n`;
      output += `- **403 Forbidden**: Check RBAC roles (Storage Blob Data Contributor, etc.)\n`;
      output += `- **Invalid credentials**: Verify tenant ID, client ID, and secret\n`;
      output += `- **Connection string invalid**: Check format and access key\n\n`;

      output += `### Blob Issues\n`;
      output += `- **Blob not found**: Verify container and blob name (case-sensitive)\n`;
      output += `- **Lease conflict**: Blob is locked by another process\n`;
      output += `- **Size limit exceeded**: Check account type limits\n\n`;

      output += `### Queue Issues\n`;
      output += `- **Message not visible**: Check visibility timeout\n`;
      output += `- **Poison messages**: Check dead-letter handling\n`;
      output += `- **High latency**: Consider proximity and tier\n\n`;

      output += `### Table Issues\n`;
      output += `- **Entity too large**: Max 1MB per entity\n`;
      output += `- **Batch failed**: All operations must be same partition\n`;
      output += `- **Query timeout**: Add filters to reduce scope\n\n`;

      output += `### File Share Issues\n`;
      output += `- **Quota exceeded**: Increase share quota\n`;
      output += `- **Path not found**: Create parent directories first\n`;
      output += `- **SMB vs REST**: Different APIs for different access patterns\n\n`;

      output += `## Diagnostic Steps\n\n`;
      output += `1. Use \`blob-test-connection\` to verify access\n`;
      output += `2. Check \`storage-account-overview\` for service availability\n`;
      output += `3. Review Azure Portal metrics and logs\n`;

      return {
        messages: [{ role: "user", content: { type: "text", text: output } }],
      };
    }
  );
}
