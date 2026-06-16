import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  ACCOUNT_ID_EXAMPLES,
  QUEUE_NAME_EXAMPLES,
  MESSAGE_TEXT_EXAMPLES,
  VISIBILITY_TIMEOUT_EXAMPLES,
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

export function registerQueueTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "queue-list-queues",
    "List queues",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      prefix: z.string().optional().describe("Filter by queue name prefix"),
      maxResults: z.number().optional().describe("Maximum results (default: 1000)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ accountId, prefix, maxResults }: any) => {
      try {
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.listQueues(prefix, maxResults);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error listing queues:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-get-queue",
    "Get queue properties and message count",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ accountId, queueName }: any) => {
      try {
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.getQueue(queueName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error getting queue:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-create-queue",
    "Create queue. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      metadata: z.string().optional().describe(descWithExamples("Metadata JSON", METADATA_EXAMPLES)),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ accountId, queueName, metadata }: any) => {
      try {
        checkWriteEnabled();
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.createQueue(
          queueName,
          metadata ? JSON.parse(metadata) : undefined
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error creating queue:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-delete-queue",
    "Delete queue. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ accountId, queueName }: any) => {
      try {
        checkDeleteEnabled();
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.deleteQueue(queueName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting queue:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-send-message",
    "Send message to queue. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      messageText: z.string().describe(descWithExamples("Message content", MESSAGE_TEXT_EXAMPLES)),
      visibilityTimeout: z.number().optional().describe(descWithExamples("Seconds before visible", VISIBILITY_TIMEOUT_EXAMPLES)),
      timeToLive: z.number().optional().describe("Seconds until expiration (default: 7 days)"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ accountId, queueName, messageText, visibilityTimeout, timeToLive }: any) => {
      try {
        checkWriteEnabled();
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.sendMessage(queueName, messageText, {
          visibilityTimeout,
          timeToLive,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error sending message:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-peek-messages",
    "Peek messages (read-only, doesn't hide)",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      maxMessages: z.number().optional().describe("Number of messages (default: 1, max: 32)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ accountId, queueName, maxMessages }: any) => {
      try {
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.peekMessages(queueName, maxMessages);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error peeking messages:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-receive-messages",
    "Receive and hide messages (for processing). Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      maxMessages: z.number().optional().describe("Number of messages (default: 1, max: 32)"),
      visibilityTimeout: z.number().optional().describe(descWithExamples("Seconds to hide", VISIBILITY_TIMEOUT_EXAMPLES)),
    },
    // Mutates message visibility state (hides for processing); not destructive.
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ accountId, queueName, maxMessages, visibilityTimeout }: any) => {
      try {
        checkWriteEnabled();
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.receiveMessages(queueName, {
          numberOfMessages: maxMessages,
          visibilityTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error receiving messages:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-delete-message",
    "Delete processed message. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      messageId: z.string().describe("Message ID from receive"),
      popReceipt: z.string().describe("Pop receipt from receive"),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ accountId, queueName, messageId, popReceipt }: any) => {
      try {
        checkDeleteEnabled();
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.deleteMessage(queueName, messageId, popReceipt);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error deleting message:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-update-message",
    "Update message content or visibility. Requires AZURE_STORAGE_ENABLE_WRITE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      messageId: z.string().describe("Message ID from receive"),
      popReceipt: z.string().describe("Pop receipt from receive"),
      messageText: z.string().describe("New message content"),
      visibilityTimeout: z.number().optional().describe("New visibility timeout in seconds"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ accountId, queueName, messageId, popReceipt, messageText, visibilityTimeout }: any) => {
      try {
        checkWriteEnabled();
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.updateMessage(
          queueName,
          messageId,
          popReceipt,
          messageText,
          visibilityTimeout
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error updating message:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "queue-clear-messages",
    "Clear all messages from queue. Requires AZURE_STORAGE_ENABLE_DELETE=true.",
    {
      accountId: z.string().describe(descWithExamples("Storage account ID", ACCOUNT_ID_EXAMPLES)),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
    },
    // Empties the queue contents → destructive.
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ accountId, queueName }: any) => {
      try {
        checkDeleteEnabled();
        const queueSvc = ctx.storage.getQueueService(accountId);
        const result = await queueSvc.clearMessages(queueName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error("Error clearing messages:", error);
        return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
      }
    }
  );
}
