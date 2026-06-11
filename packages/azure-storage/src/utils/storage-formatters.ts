/**
 * Storage Formatters
 *
 * Markdown formatters for prompt outputs.
 */

import type {
  StorageAccountConfig,
  ContainerInfo,
  BlobInfo,
  QueueInfo,
  TableInfo,
  FileShareInfo,
  FileItemInfo,
  TableEntity,
  ConnectionTestResult,
} from '../types/storage-types.js';

/**
 * Format storage account overview
 */
export function formatAccountOverviewAsMarkdown(
  account: StorageAccountConfig,
  connectionTest: ConnectionTestResult,
  containers: ContainerInfo[],
  queues: QueueInfo[],
  tables: TableInfo[],
  shares: FileShareInfo[]
): string {
  let output = `# Storage Account Overview: ${account.name}\n\n`;
  output += `**Account Name:** ${account.accountName}\n`;
  output += `**ID:** ${account.id}\n`;
  output += `**Status:** ${account.active ? '✅ Active' : '❌ Inactive'}\n`;
  output += `**Auth Method:** ${connectionTest.authMethod}\n\n`;

  output += `## Service Availability\n\n`;
  output += `| Service | Status |\n`;
  output += `|---------|--------|\n`;
  output += `| Blob Storage | ${connectionTest.blobServiceAvailable ? '✅ Available' : '❌ Unavailable'} |\n`;
  output += `| Queue Storage | ${connectionTest.queueServiceAvailable ? '✅ Available' : '❌ Unavailable'} |\n`;
  output += `| Table Storage | ${connectionTest.tableServiceAvailable ? '✅ Available' : '❌ Unavailable'} |\n`;
  output += `| File Storage | ${connectionTest.fileServiceAvailable ? '✅ Available' : '❌ Unavailable'} |\n\n`;

  output += `## Summary\n\n`;
  output += `| Resource Type | Count |\n`;
  output += `|---------------|-------|\n`;
  output += `| Containers | ${containers.length} |\n`;
  output += `| Queues | ${queues.length} |\n`;
  output += `| Tables | ${tables.length} |\n`;
  output += `| File Shares | ${shares.length} |\n\n`;

  if (containers.length > 0) {
    output += `## Blob Containers\n\n`;
    output += formatContainersAsMarkdown(containers);
  }

  if (queues.length > 0) {
    output += `## Queues\n\n`;
    output += formatQueuesAsMarkdown(queues);
  }

  if (tables.length > 0) {
    output += `## Tables\n\n`;
    output += formatTablesAsMarkdown(tables);
  }

  if (shares.length > 0) {
    output += `## File Shares\n\n`;
    output += formatSharesAsMarkdown(shares);
  }

  return output;
}

/**
 * Format containers list
 */
export function formatContainersAsMarkdown(containers: ContainerInfo[]): string {
  if (containers.length === 0) {
    return '*No containers found*\n\n';
  }

  let output = `| Container | Last Modified | Access |\n`;
  output += `|-----------|---------------|--------|\n`;

  for (const container of containers) {
    const lastMod = container.lastModified
      ? container.lastModified.toISOString().split('T')[0]
      : '-';
    const access = container.publicAccess || 'Private';
    output += `| ${container.name} | ${lastMod} | ${access} |\n`;
  }

  output += '\n';
  return output;
}

/**
 * Format blobs list
 */
export function formatBlobsAsMarkdown(blobs: BlobInfo[]): string {
  if (blobs.length === 0) {
    return '*No blobs found*\n\n';
  }

  let output = `| Name | Type | Size | Last Modified |\n`;
  output += `|------|------|------|---------------|\n`;

  for (const blob of blobs) {
    const size = blob.contentLength
      ? formatBytes(blob.contentLength)
      : '-';
    const lastMod = blob.lastModified
      ? blob.lastModified.toISOString().split('T')[0]
      : '-';
    output += `| ${blob.name} | ${blob.blobType || '-'} | ${size} | ${lastMod} |\n`;
  }

  output += '\n';
  return output;
}

/**
 * Format container analysis (for blob-container-analysis prompt)
 */
export function formatContainerAnalysisAsMarkdown(
  container: ContainerInfo,
  blobs: BlobInfo[]
): string {
  let output = `# Container Analysis: ${container.name}\n\n`;

  // Container info
  output += `## Container Properties\n\n`;
  output += `- **Public Access:** ${container.publicAccess || 'None (Private)'}\n`;
  output += `- **Lease State:** ${container.leaseState || 'Available'}\n`;
  if (container.lastModified) {
    output += `- **Last Modified:** ${container.lastModified.toISOString()}\n`;
  }
  if (container.metadata && Object.keys(container.metadata).length > 0) {
    output += `- **Metadata:** ${JSON.stringify(container.metadata)}\n`;
  }
  output += '\n';

  // Blob statistics
  output += `## Blob Statistics\n\n`;
  output += `- **Total Blobs:** ${blobs.length}\n`;

  const totalSize = blobs.reduce((sum, b) => sum + (b.contentLength || 0), 0);
  output += `- **Total Size:** ${formatBytes(totalSize)}\n\n`;

  // Distribution by type
  const byType: Record<string, number> = {};
  for (const blob of blobs) {
    const ext = blob.name.includes('.') ? blob.name.split('.').pop()!.toLowerCase() : 'no-extension';
    byType[ext] = (byType[ext] || 0) + 1;
  }

  if (Object.keys(byType).length > 0) {
    output += `## File Type Distribution\n\n`;
    output += `| Extension | Count |\n`;
    output += `|-----------|-------|\n`;
    for (const [ext, count] of Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      output += `| .${ext} | ${count} |\n`;
    }
    output += '\n';
  }

  // Distribution by access tier
  const byTier: Record<string, number> = {};
  for (const blob of blobs) {
    const tier = blob.accessTier || 'Unknown';
    byTier[tier] = (byTier[tier] || 0) + 1;
  }

  if (Object.keys(byTier).length > 0) {
    output += `## Access Tier Distribution\n\n`;
    output += `| Tier | Count |\n`;
    output += `|------|-------|\n`;
    for (const [tier, count] of Object.entries(byTier)) {
      output += `| ${tier} | ${count} |\n`;
    }
    output += '\n';
  }

  // Recent blobs
  const recentBlobs = blobs
    .filter((b) => b.lastModified)
    .sort((a, b) => (b.lastModified!.getTime() - a.lastModified!.getTime()))
    .slice(0, 10);

  if (recentBlobs.length > 0) {
    output += `## Recent Blobs (Last 10 Modified)\n\n`;
    output += formatBlobsAsMarkdown(recentBlobs);
  }

  return output;
}

/**
 * Format queues list
 */
export function formatQueuesAsMarkdown(queues: QueueInfo[]): string {
  if (queues.length === 0) {
    return '*No queues found*\n\n';
  }

  let output = `| Queue Name | Message Count |\n`;
  output += `|------------|---------------|\n`;

  for (const queue of queues) {
    const count = queue.approximateMessagesCount ?? '-';
    output += `| ${queue.name} | ${count} |\n`;
  }

  output += '\n';
  return output;
}

/**
 * Format queue health check
 */
export function formatQueueHealthAsMarkdown(
  queue: QueueInfo,
  messageCount: number,
  oldestMessageAge?: number
): string {
  let output = `# Queue Health: ${queue.name}\n\n`;

  output += `## Queue Status\n\n`;
  output += `- **Message Count:** ${messageCount}\n`;

  // Determine health status
  let healthStatus = '✅ Healthy';
  let healthReason = 'Queue is operating normally';

  if (messageCount > 10000) {
    healthStatus = '🔴 Critical';
    healthReason = 'Very high message backlog';
  } else if (messageCount > 1000) {
    healthStatus = '🟡 Warning';
    healthReason = 'High message backlog';
  } else if (messageCount > 100) {
    healthStatus = '🟢 Normal';
    healthReason = 'Moderate queue depth';
  }

  output += `- **Health Status:** ${healthStatus}\n`;
  output += `- **Reason:** ${healthReason}\n\n`;

  if (oldestMessageAge !== undefined) {
    const ageMinutes = Math.floor(oldestMessageAge / 60000);
    output += `- **Oldest Message Age:** ${ageMinutes} minutes\n`;

    if (ageMinutes > 60) {
      output += `  ⚠️ Messages may be stuck or processing is slow\n`;
    }
  }

  output += '\n## Recommendations\n\n';

  if (messageCount > 1000) {
    output += `- Scale up consumers to process backlog\n`;
    output += `- Check for processing errors\n`;
  }

  if (messageCount === 0) {
    output += `- Queue is empty - verify producers are active\n`;
  }

  if (oldestMessageAge && oldestMessageAge > 3600000) {
    output += `- Investigate why messages are not being processed\n`;
    output += `- Check consumer health and logs\n`;
  }

  return output;
}

/**
 * Format tables list
 */
export function formatTablesAsMarkdown(tables: TableInfo[]): string {
  if (tables.length === 0) {
    return '*No tables found*\n\n';
  }

  let output = `| Table Name |\n`;
  output += `|------------|\n`;

  for (const table of tables) {
    output += `| ${table.name} |\n`;
  }

  output += '\n';
  return output;
}

/**
 * Format table schema discovery
 */
export function formatTableSchemaAsMarkdown(
  tableName: string,
  entities: TableEntity[]
): string {
  let output = `# Table Schema: ${tableName}\n\n`;

  if (entities.length === 0) {
    output += '*Table is empty - no schema to discover*\n';
    return output;
  }

  // Collect all unique property names and sample values
  const properties: Record<string, { types: Set<string>; sample: any }> = {};

  for (const entity of entities) {
    for (const [key, value] of Object.entries(entity)) {
      if (!properties[key]) {
        properties[key] = { types: new Set(), sample: value };
      }
      properties[key].types.add(typeof value);
    }
  }

  output += `## Discovered Properties\n\n`;
  output += `| Property | Type(s) | Sample |\n`;
  output += `|----------|---------|--------|\n`;

  for (const [name, info] of Object.entries(properties)) {
    const types = Array.from(info.types).join(', ');
    let sample = String(info.sample);
    if (sample.length > 50) sample = sample.substring(0, 47) + '...';
    output += `| ${name} | ${types} | \`${sample}\` |\n`;
  }

  output += `\n## Entity Sample (${entities.length} sampled)\n\n`;
  output += '```json\n';
  output += JSON.stringify(entities[0], null, 2);
  output += '\n```\n';

  return output;
}

/**
 * Format file shares list
 */
export function formatSharesAsMarkdown(shares: FileShareInfo[]): string {
  if (shares.length === 0) {
    return '*No file shares found*\n\n';
  }

  let output = `| Share Name | Quota (GB) | Tier |\n`;
  output += `|------------|------------|------|\n`;

  for (const share of shares) {
    const quota = share.quota ? `${share.quota} GB` : '-';
    output += `| ${share.name} | ${quota} | ${share.accessTier || '-'} |\n`;
  }

  output += '\n';
  return output;
}

/**
 * Format file items list
 */
export function formatFileItemsAsMarkdown(items: FileItemInfo[]): string {
  if (items.length === 0) {
    return '*No items found*\n\n';
  }

  let output = `| Name | Type | Size | Last Modified |\n`;
  output += `|------|------|------|---------------|\n`;

  for (const item of items) {
    const icon = item.kind === 'directory' ? '📁' : '📄';
    const size = item.contentLength ? formatBytes(item.contentLength) : '-';
    const lastMod = item.lastModified
      ? item.lastModified.toISOString().split('T')[0]
      : '-';
    output += `| ${icon} ${item.name} | ${item.kind} | ${size} | ${lastMod} |\n`;
  }

  output += '\n';
  return output;
}

/**
 * Format file share audit
 */
export function formatFileShareAuditAsMarkdown(
  share: FileShareInfo,
  items: FileItemInfo[],
  totalSize: number,
  fileCount: number,
  dirCount: number
): string {
  let output = `# File Share Audit: ${share.name}\n\n`;

  output += `## Share Properties\n\n`;
  output += `- **Quota:** ${share.quota ? `${share.quota} GB` : 'Not set'}\n`;
  output += `- **Access Tier:** ${share.accessTier || 'TransactionOptimized'}\n`;
  if (share.lastModified) {
    output += `- **Last Modified:** ${share.lastModified.toISOString()}\n`;
  }
  output += '\n';

  output += `## Content Summary\n\n`;
  output += `- **Total Files:** ${fileCount}\n`;
  output += `- **Total Directories:** ${dirCount}\n`;
  output += `- **Total Size:** ${formatBytes(totalSize)}\n`;

  if (share.quota) {
    const usedPercent = ((totalSize / (share.quota * 1024 * 1024 * 1024)) * 100).toFixed(1);
    output += `- **Quota Used:** ${usedPercent}%\n`;
  }
  output += '\n';

  // Recent files
  const recentFiles = items
    .filter((i) => i.kind === 'file' && i.lastModified)
    .sort((a, b) => (b.lastModified!.getTime() - a.lastModified!.getTime()))
    .slice(0, 10);

  if (recentFiles.length > 0) {
    output += `## Recent Files (Last 10 Modified)\n\n`;
    output += formatFileItemsAsMarkdown(recentFiles);
  }

  return output;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
