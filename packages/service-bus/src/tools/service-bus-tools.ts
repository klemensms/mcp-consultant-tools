/**
 * Service Bus tool registrations
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples,
  QUEUE_NAME_EXAMPLES,
  MESSAGE_COUNT_EXAMPLES,
  BODY_CONTAINS_EXAMPLES,
  CORRELATION_ID_EXAMPLES,
} from '../tool-examples.js';

export function registerServiceBusTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "sb-list-namespaces",
    "List all configured Service Bus namespaces (active and inactive)",
    {},
    // Reads local namespace config only (no network call).
    { readOnlyHint: true },
    async () => {
      try {
        const resources = ctx.serviceBus.getAllResources();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(resources, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error listing Service Bus namespaces:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to list namespaces: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sb-test-connection",
    "Test connectivity to a Service Bus namespace and verify permissions (Data Receiver + Reader roles)",
    {
      resourceId: z.string().describe("Service Bus resource ID (use sb-list-namespaces to find IDs)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId }: any) => {
      try {
        const result = await ctx.serviceBus.testConnection(resourceId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error testing Service Bus connection:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to test connection: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sb-list-queues",
    "List all queues in a Service Bus namespace with message counts and session info (cached for 5 minutes)",
    {
      resourceId: z.string().describe("Service Bus resource ID (use sb-list-namespaces to find IDs)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId }: any) => {
      try {
        const queues = await ctx.serviceBus.listQueues(resourceId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(queues, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error listing Service Bus queues:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to list queues: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sb-peek-messages",
    "Peek messages in a queue without removing them (read-only, max 100 messages)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      maxMessages: z.number().optional().describe(descWithExamples("Maximum messages to peek (default: 10, max: 100)", MESSAGE_COUNT_EXAMPLES)),
      sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
    },
    // Peek does not consume/remove messages → read-only.
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, queueName, maxMessages, sessionId }: any) => {
      try {
        const messages = await ctx.serviceBus.peekMessages(resourceId, queueName, maxMessages || 10, sessionId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(messages, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error peeking messages:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to peek messages: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sb-peek-deadletter",
    "Peek dead letter queue messages with failure reasons (read-only, max 100 messages)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      maxMessages: z.number().optional().describe(descWithExamples("Maximum messages to peek (default: 10, max: 100)", MESSAGE_COUNT_EXAMPLES)),
      sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
    },
    // Peeks the DLQ without removing messages → read-only.
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, queueName, maxMessages, sessionId }: any) => {
      try {
        const messages = await ctx.serviceBus.peekDeadLetterMessages(resourceId, queueName, maxMessages || 10, sessionId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(messages, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error peeking dead letter messages:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to peek dead letter messages: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sb-get-queue-props",
    "Get detailed queue properties, metrics, and configuration including session info",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, queueName }: any) => {
      try {
        const properties = await ctx.serviceBus.getQueueProperties(resourceId, queueName);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(properties, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting queue properties:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get queue properties: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sb-search-messages",
    "Search messages by content or properties (loads into memory, max 500 messages)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe(descWithExamples("Queue name", QUEUE_NAME_EXAMPLES)),
      bodyContains: z.string().optional().describe(descWithExamples("Search for text in message body (case-insensitive)", BODY_CONTAINS_EXAMPLES)),
      correlationId: z.string().optional().describe(descWithExamples("Filter by correlation ID", CORRELATION_ID_EXAMPLES)),
      messageId: z.string().optional().describe("Filter by message ID"),
      propertyKey: z.string().optional().describe("Application property key to filter by"),
      propertyValue: z.any().optional().describe("Application property value to match"),
      sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
      maxMessages: z.number().optional().describe(descWithExamples("Maximum messages to search (default: 50, max: 500)", MESSAGE_COUNT_EXAMPLES)),
    },
    // Peek-based search; messages are not consumed/removed → read-only.
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId, queueName, bodyContains, correlationId, messageId, propertyKey, propertyValue, sessionId, maxMessages }: any) => {
      try {
        const result = await ctx.serviceBus.searchMessages(
          resourceId,
          queueName,
          { bodyContains, correlationId, messageId, propertyKey, propertyValue, sessionId },
          maxMessages || 50
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error searching messages:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to search messages: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "sb-get-ns-props",
    "Get namespace-level properties and quotas (tier, max message size)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ resourceId }: any) => {
      try {
        const properties = await ctx.serviceBus.getNamespaceProperties(resourceId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(properties, null, 2),
          }],
        };
      } catch (error: any) {
        console.error("Error getting namespace properties:", error);
        return {
          content: [{
            type: "text",
            text: `Failed to get namespace properties: ${error.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  console.error("service-bus tools registered: 8 tools");
}
