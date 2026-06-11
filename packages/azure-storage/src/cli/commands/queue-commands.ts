/**
 * Queue CLI Commands - 10 commands for queue storage operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerQueueCommands(program: Command, ctx: ServiceContext): void {
  const queue = program.command('queue').description('Queue storage operations');

  queue
    .command('list')
    .description('List queues')
    .argument('<accountId>', 'Storage account ID')
    .option('-p, --prefix <prefix>', 'Filter by queue name prefix')
    .option('-m, --max-results <n>', 'Maximum results (default: 1000)')
    .action(async (accountId: string, opts: any) => {
      try {
        const queueSvc = ctx.storage.getQueueService(accountId);
        const maxResults = opts.maxResults ? parseInt(opts.maxResults) : undefined;
        const result = await queueSvc.listQueues(opts.prefix, maxResults);
        outputResult(
          { fileName: `queues-${accountId}`, data: result, summary: `Found ${result.items.length} queue(s)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list queues'); }
    });

  queue
    .command('get')
    .description('Get queue properties and message count')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .action(async (accountId: string, queueName: string) => {
      try {
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.getQueue(queueName);
        outputResult(
          { fileName: `queue-${queueName}`, data: result, summary: `Queue: ${queueName} (${(result as any).approximateMessagesCount ?? '?'} messages)` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get queue'); }
    });

  queue
    .command('create')
    .description('Create queue (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .option('--metadata <json>', 'Metadata JSON string')
    .action(async (accountId: string, queueName: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const queueSvc = ctx.storage.getQueueService(accountId);
        const metadata = opts.metadata ? JSON.parse(opts.metadata) : undefined;
        const result = await queueSvc.createQueue(queueName, metadata);
        outputResult(
          { fileName: `create-queue-${queueName}`, data: result, summary: `Queue '${queueName}' created: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create queue'); }
    });

  queue
    .command('delete')
    .description('Delete queue (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .action(async (accountId: string, queueName: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.deleteQueue(queueName);
        outputResult(
          { fileName: `delete-queue-${queueName}`, data: result, summary: `Queue '${queueName}' deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete queue'); }
    });

  queue
    .command('send')
    .description('Send message to queue (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .argument('<messageText>', 'Message content')
    .option('-v, --visibility-timeout <seconds>', 'Seconds before visible')
    .option('-t, --time-to-live <seconds>', 'Seconds until expiration (default: 7 days)')
    .action(async (accountId: string, queueName: string, messageText: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.sendMessage(queueName, messageText, {
          visibilityTimeout: opts.visibilityTimeout ? parseInt(opts.visibilityTimeout) : undefined,
          timeToLive: opts.timeToLive ? parseInt(opts.timeToLive) : undefined,
        });
        outputResult(
          { fileName: `send-message-${queueName}`, data: result, summary: `Message sent to '${queueName}': ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'send message'); }
    });

  queue
    .command('peek')
    .description('Peek messages (read-only, does not hide)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .option('-n, --max-messages <n>', 'Number of messages (default: 1, max: 32)')
    .action(async (accountId: string, queueName: string, opts: any) => {
      try {
        const queueSvc = ctx.storage.getQueueService(accountId);
        const maxMessages = opts.maxMessages ? parseInt(opts.maxMessages) : undefined;
        const result = await queueSvc.peekMessages(queueName, maxMessages);
        outputResult(
          { fileName: `peek-${queueName}`, data: result, summary: `Peeked ${result.length} message(s) from '${queueName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'peek messages'); }
    });

  queue
    .command('receive')
    .description('Receive and hide messages for processing (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .option('-n, --max-messages <n>', 'Number of messages (default: 1, max: 32)')
    .option('-v, --visibility-timeout <seconds>', 'Seconds to hide')
    .action(async (accountId: string, queueName: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.receiveMessages(queueName, {
          numberOfMessages: opts.maxMessages ? parseInt(opts.maxMessages) : undefined,
          visibilityTimeout: opts.visibilityTimeout ? parseInt(opts.visibilityTimeout) : undefined,
        });
        outputResult(
          { fileName: `receive-${queueName}`, data: result, summary: `Received ${result.length} message(s) from '${queueName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'receive messages'); }
    });

  queue
    .command('delete-message')
    .description('Delete processed message (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .argument('<messageId>', 'Message ID from receive')
    .argument('<popReceipt>', 'Pop receipt from receive')
    .action(async (accountId: string, queueName: string, messageId: string, popReceipt: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.deleteMessage(queueName, messageId, popReceipt);
        outputResult(
          { fileName: `delete-message-${messageId}`, data: result, summary: `Message '${messageId}' deleted: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete message'); }
    });

  queue
    .command('update-message')
    .description('Update message content or visibility (requires AZURE_STORAGE_ENABLE_WRITE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .argument('<messageId>', 'Message ID from receive')
    .argument('<popReceipt>', 'Pop receipt from receive')
    .argument('<messageText>', 'New message content')
    .option('-v, --visibility-timeout <seconds>', 'New visibility timeout in seconds')
    .action(async (accountId: string, queueName: string, messageId: string, popReceipt: string, messageText: string, opts: any) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_WRITE !== 'true') {
          throw new Error('Write operations are disabled. Set AZURE_STORAGE_ENABLE_WRITE=true to enable.');
        }
        const queueSvc = ctx.storage.getQueueService(accountId);
        const visibilityTimeout = opts.visibilityTimeout ? parseInt(opts.visibilityTimeout) : undefined;
        const result = await queueSvc.updateMessage(queueName, messageId, popReceipt, messageText, visibilityTimeout);
        outputResult(
          { fileName: `update-message-${messageId}`, data: result, summary: `Message '${messageId}' updated: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update message'); }
    });

  queue
    .command('clear')
    .description('Clear all messages from queue (requires AZURE_STORAGE_ENABLE_DELETE=true)')
    .argument('<accountId>', 'Storage account ID')
    .argument('<queueName>', 'Queue name')
    .action(async (accountId: string, queueName: string) => {
      try {
        if (process.env.AZURE_STORAGE_ENABLE_DELETE !== 'true') {
          throw new Error('Delete operations are disabled. Set AZURE_STORAGE_ENABLE_DELETE=true to enable.');
        }
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.clearMessages(queueName);
        outputResult(
          { fileName: `clear-queue-${queueName}`, data: result, summary: `Queue '${queueName}' cleared: ${result.success}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'clear messages'); }
    });
}
