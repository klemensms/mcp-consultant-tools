/**
 * Queue CLI Commands - 5 commands for queue operations
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerQueueCommands(program: Command, ctx: ServiceContext): void {
  const queue = program.command('queue').description('Queue operations');

  queue
    .command('list')
    .description('List all queues in a Service Bus namespace with message counts and session info')
    .argument('<resourceId>', 'Service Bus resource ID')
    .action(async (resourceId: string) => {
      try {
        const queues = await ctx.serviceBus.listQueues(resourceId);
        outputResult(
          { fileName: `sb-queues-${resourceId}`, data: queues, summary: `Found ${queues.length} queue(s) in '${resourceId}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list queues'); }
    });

  queue
    .command('props')
    .description('Get detailed queue properties, metrics, and configuration')
    .argument('<resourceId>', 'Service Bus resource ID')
    .argument('<queueName>', 'Queue name')
    .action(async (resourceId: string, queueName: string) => {
      try {
        const properties = await ctx.serviceBus.getQueueProperties(resourceId, queueName);
        outputResult(
          { fileName: `sb-queue-${queueName}`, data: properties, summary: `Queue '${queueName}': active=${(properties as any).activeMessageCount}, dlq=${(properties as any).deadLetterMessageCount}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get queue properties'); }
    });

  queue
    .command('peek')
    .description('Peek messages in a queue without removing them (read-only)')
    .argument('<resourceId>', 'Service Bus resource ID')
    .argument('<queueName>', 'Queue name')
    .option('-n, --max-messages <n>', 'Maximum messages to peek (default: 10, max: 100)', '10')
    .option('-s, --session-id <id>', 'Session ID for session-enabled queues')
    .action(async (resourceId: string, queueName: string, opts: any) => {
      try {
        const messages = await ctx.serviceBus.peekMessages(resourceId, queueName, parseInt(opts.maxMessages), opts.sessionId);
        outputResult(
          { fileName: `sb-peek-${queueName}`, data: messages, summary: `Peeked ${messages.length} message(s) from '${queueName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'peek messages'); }
    });

  queue
    .command('peek-dlq')
    .description('Peek dead letter queue messages with failure reasons (read-only)')
    .argument('<resourceId>', 'Service Bus resource ID')
    .argument('<queueName>', 'Queue name')
    .option('-n, --max-messages <n>', 'Maximum messages to peek (default: 10, max: 100)', '10')
    .option('-s, --session-id <id>', 'Session ID for session-enabled queues')
    .action(async (resourceId: string, queueName: string, opts: any) => {
      try {
        const messages = await ctx.serviceBus.peekDeadLetterMessages(resourceId, queueName, parseInt(opts.maxMessages), opts.sessionId);
        outputResult(
          { fileName: `sb-dlq-${queueName}`, data: messages, summary: `Peeked ${messages.length} dead letter message(s) from '${queueName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'peek dead letter messages'); }
    });

  queue
    .command('search')
    .description('Search messages by content or properties (max 500 messages)')
    .argument('<resourceId>', 'Service Bus resource ID')
    .argument('<queueName>', 'Queue name')
    .option('-b, --body-contains <text>', 'Search for text in message body (case-insensitive)')
    .option('-c, --correlation-id <id>', 'Filter by correlation ID')
    .option('-m, --message-id <id>', 'Filter by message ID')
    .option('-k, --property-key <key>', 'Application property key to filter by')
    .option('-v, --property-value <value>', 'Application property value to match')
    .option('-s, --session-id <id>', 'Session ID for session-enabled queues')
    .option('-n, --max-messages <n>', 'Maximum messages to search (default: 50, max: 500)', '50')
    .action(async (resourceId: string, queueName: string, opts: any) => {
      try {
        const result = await ctx.serviceBus.searchMessages(
          resourceId,
          queueName,
          {
            bodyContains: opts.bodyContains,
            correlationId: opts.correlationId,
            messageId: opts.messageId,
            propertyKey: opts.propertyKey,
            propertyValue: opts.propertyValue,
            sessionId: opts.sessionId,
          },
          parseInt(opts.maxMessages)
        );
        outputResult(
          { fileName: `sb-search-${queueName}`, data: result, summary: `Found ${(result as any).matchCount} match(es) out of ${(result as any).totalPeeked} peeked message(s) in '${queueName}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'search messages'); }
    });
}
