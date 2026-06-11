/**
 * Queue Service
 *
 * Handles all queue storage operations: queues and messages.
 */

import {
  QueueServiceClient,
  QueueClient,
  DequeuedMessageItem,
  PeekedMessageItem,
  QueueItem,
} from '@azure/storage-queue';
import { auditLogger } from '@mcp-consultant-tools/core';

import type {
  QueueInfo,
  QueueMessage,
  SendMessageOptions,
  ReceiveMessageOptions,
  ListResult,
  OperationResult,
} from '../types/storage-types.js';

export class QueueService {
  private client: QueueServiceClient;
  private accountId: string;
  private maxListResults: number;

  constructor(client: QueueServiceClient, accountId: string, maxListResults: number) {
    this.client = client;
    this.accountId = accountId;
    this.maxListResults = maxListResults;
  }

  // ==========================================================================
  // Queue Operations
  // ==========================================================================

  /**
   * List all queues
   */
  async listQueues(prefix?: string, maxResults?: number): Promise<ListResult<QueueInfo>> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(maxResults || this.maxListResults, this.maxListResults);

    try {
      const queues: QueueInfo[] = [];
      const iter = this.client.listQueues({
        prefix,
        includeMetadata: true,
      });

      for await (const queue of iter) {
        queues.push(this.mapQueueItem(queue));
        if (queues.length >= limit) break;
      }

      auditLogger.log({
        operation: 'list-queues',
        operationType: 'READ',
        componentType: 'Queue',
        parameters: { accountId: this.accountId, prefix, count: queues.length },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        items: queues,
        hasMore: queues.length >= limit,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-queues',
        operationType: 'READ',
        componentType: 'Queue',
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get queue properties
   */
  async getQueue(queueName: string): Promise<QueueInfo> {
    const timer = auditLogger.startTimer();

    try {
      const queueClient = this.client.getQueueClient(queueName);
      const properties = await queueClient.getProperties();

      const info: QueueInfo = {
        name: queueName,
        approximateMessagesCount: properties.approximateMessagesCount,
        metadata: properties.metadata,
      };

      auditLogger.log({
        operation: 'get-queue',
        operationType: 'READ',
        componentType: 'Queue',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return info;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-queue',
        operationType: 'READ',
        componentType: 'Queue',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Create a new queue
   */
  async createQueue(
    queueName: string,
    metadata?: Record<string, string>
  ): Promise<OperationResult<QueueInfo>> {
    const timer = auditLogger.startTimer();

    try {
      const queueClient = this.client.getQueueClient(queueName);
      await queueClient.create({ metadata });

      const info = await this.getQueue(queueName);

      auditLogger.log({
        operation: 'create-queue',
        operationType: 'CREATE',
        componentType: 'Queue',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: info };
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-queue',
        operationType: 'CREATE',
        componentType: 'Queue',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a queue
   */
  async deleteQueue(queueName: string): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const queueClient = this.client.getQueueClient(queueName);
      await queueClient.delete();

      auditLogger.log({
        operation: 'delete-queue',
        operationType: 'DELETE',
        componentType: 'Queue',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-queue',
        operationType: 'DELETE',
        componentType: 'Queue',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  /**
   * Send a message to a queue
   */
  async sendMessage(
    queueName: string,
    messageText: string,
    options?: SendMessageOptions
  ): Promise<OperationResult<QueueMessage>> {
    const timer = auditLogger.startTimer();

    try {
      const queueClient = this.client.getQueueClient(queueName);
      const response = await queueClient.sendMessage(messageText, {
        visibilityTimeout: options?.visibilityTimeout,
        messageTimeToLive: options?.timeToLive,
      });

      const message: QueueMessage = {
        messageId: response.messageId,
        popReceipt: response.popReceipt,
        messageText,
        insertedOn: response.insertedOn,
        expiresOn: response.expiresOn,
        nextVisibleOn: response.nextVisibleOn,
      };

      auditLogger.log({
        operation: 'send-message',
        operationType: 'CREATE',
        componentType: 'QueueMessage',
        componentName: queueName,
        componentId: response.messageId,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: message };
    } catch (error: any) {
      auditLogger.log({
        operation: 'send-message',
        operationType: 'CREATE',
        componentType: 'QueueMessage',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Peek messages (read-only, doesn't hide them)
   */
  async peekMessages(queueName: string, maxMessages?: number): Promise<QueueMessage[]> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(maxMessages || 32, 32); // Azure max is 32

    try {
      const queueClient = this.client.getQueueClient(queueName);
      const response = await queueClient.peekMessages({ numberOfMessages: limit });

      const messages = response.peekedMessageItems.map((item) =>
        this.mapPeekedMessage(item)
      );

      auditLogger.log({
        operation: 'peek-messages',
        operationType: 'READ',
        componentType: 'QueueMessage',
        componentName: queueName,
        parameters: { accountId: this.accountId, count: messages.length },
        success: true,
        executionTimeMs: timer(),
      });

      return messages;
    } catch (error: any) {
      auditLogger.log({
        operation: 'peek-messages',
        operationType: 'READ',
        componentType: 'QueueMessage',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Receive messages (hides them from other consumers)
   */
  async receiveMessages(
    queueName: string,
    options?: ReceiveMessageOptions
  ): Promise<QueueMessage[]> {
    const timer = auditLogger.startTimer();
    const limit = Math.min(options?.numberOfMessages || 1, 32); // Azure max is 32

    try {
      const queueClient = this.client.getQueueClient(queueName);
      const response = await queueClient.receiveMessages({
        numberOfMessages: limit,
        visibilityTimeout: options?.visibilityTimeout || 30,
      });

      const messages = response.receivedMessageItems.map((item) =>
        this.mapDequeuedMessage(item)
      );

      auditLogger.log({
        operation: 'receive-messages',
        operationType: 'READ',
        componentType: 'QueueMessage',
        componentName: queueName,
        parameters: {
          accountId: this.accountId,
          count: messages.length,
          visibilityTimeout: options?.visibilityTimeout || 30,
        },
        success: true,
        executionTimeMs: timer(),
      });

      return messages;
    } catch (error: any) {
      auditLogger.log({
        operation: 'receive-messages',
        operationType: 'READ',
        componentType: 'QueueMessage',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    queueName: string,
    messageId: string,
    popReceipt: string
  ): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const queueClient = this.client.getQueueClient(queueName);
      await queueClient.deleteMessage(messageId, popReceipt);

      auditLogger.log({
        operation: 'delete-message',
        operationType: 'DELETE',
        componentType: 'QueueMessage',
        componentName: queueName,
        componentId: messageId,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'delete-message',
        operationType: 'DELETE',
        componentType: 'QueueMessage',
        componentName: queueName,
        componentId: messageId,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a message
   */
  async updateMessage(
    queueName: string,
    messageId: string,
    popReceipt: string,
    messageText: string,
    visibilityTimeout?: number
  ): Promise<OperationResult<QueueMessage>> {
    const timer = auditLogger.startTimer();

    try {
      const queueClient = this.client.getQueueClient(queueName);
      const response = await queueClient.updateMessage(
        messageId,
        popReceipt,
        messageText,
        visibilityTimeout || 0
      );

      const message: QueueMessage = {
        messageId,
        popReceipt: response.popReceipt,
        messageText,
        nextVisibleOn: response.nextVisibleOn,
      };

      auditLogger.log({
        operation: 'update-message',
        operationType: 'UPDATE',
        componentType: 'QueueMessage',
        componentName: queueName,
        componentId: messageId,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true, data: message };
    } catch (error: any) {
      auditLogger.log({
        operation: 'update-message',
        operationType: 'UPDATE',
        componentType: 'QueueMessage',
        componentName: queueName,
        componentId: messageId,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all messages from a queue
   */
  async clearMessages(queueName: string): Promise<OperationResult> {
    const timer = auditLogger.startTimer();

    try {
      const queueClient = this.client.getQueueClient(queueName);
      await queueClient.clearMessages();

      auditLogger.log({
        operation: 'clear-messages',
        operationType: 'DELETE',
        componentType: 'QueueMessage',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: true,
        executionTimeMs: timer(),
      });

      return { success: true };
    } catch (error: any) {
      auditLogger.log({
        operation: 'clear-messages',
        operationType: 'DELETE',
        componentType: 'QueueMessage',
        componentName: queueName,
        parameters: { accountId: this.accountId },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      return { success: false, error: error.message };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private mapQueueItem(item: QueueItem): QueueInfo {
    return {
      name: item.name,
      metadata: item.metadata,
    };
  }

  private mapPeekedMessage(item: PeekedMessageItem): QueueMessage {
    return {
      messageId: item.messageId,
      messageText: item.messageText,
      insertedOn: item.insertedOn,
      expiresOn: item.expiresOn,
      dequeueCount: item.dequeueCount,
    };
  }

  private mapDequeuedMessage(item: DequeuedMessageItem): QueueMessage {
    return {
      messageId: item.messageId,
      popReceipt: item.popReceipt,
      messageText: item.messageText,
      insertedOn: item.insertedOn,
      expiresOn: item.expiresOn,
      nextVisibleOn: item.nextVisibleOn,
      dequeueCount: item.dequeueCount,
    };
  }
}
