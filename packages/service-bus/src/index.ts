#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { ServiceBusService } from "./ServiceBusService.js";
import type { ServiceBusConfig } from "./ServiceBusService.js";
import { z } from 'zod';
import { formatQueueListAsMarkdown, formatMessagesAsMarkdown, analyzeDeadLetterMessages, formatDeadLetterAnalysisAsMarkdown, generateServiceBusTroubleshootingGuide, formatNamespaceOverviewAsMarkdown, formatMessageInspectionAsMarkdown, getQueueHealthStatus } from './utils/servicebus-formatters.js';

export function registerServiceBusTools(server: any, servicebusService?: ServiceBusService) {
  let service: ServiceBusService | null = servicebusService || null;

  function getServiceBusService(): ServiceBusService {
    if (!service) {
      const missingConfig: string[] = [];
      let resources: any[] = [];

      if (process.env.SERVICEBUS_RESOURCES) {
        try {
          resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
        } catch (error) {
          throw new Error("Failed to parse SERVICEBUS_RESOURCES JSON");
        }
      } else if (process.env.SERVICEBUS_NAMESPACE) {
        resources = [{
          id: 'default',
          name: 'Default Service Bus',
          namespace: process.env.SERVICEBUS_NAMESPACE,
          active: true,
          connectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
        }];
      } else {
        missingConfig.push("SERVICEBUS_RESOURCES or SERVICEBUS_NAMESPACE");
      }

      if (missingConfig.length > 0) {
        throw new Error(`Missing Service Bus configuration: ${missingConfig.join(", ")}`);
      }

      const config: ServiceBusConfig = {
        resources,
        authMethod: (process.env.SERVICEBUS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'connection-string',
        tenantId: process.env.SERVICEBUS_TENANT_ID || '',
        clientId: process.env.SERVICEBUS_CLIENT_ID || '',
        clientSecret: process.env.SERVICEBUS_CLIENT_SECRET || '',
      };

      service = new ServiceBusService(config);
      console.error("Service Bus service initialized");
    }
    return service;
  }

  // ========================================
  // PROMPTS
  // ========================================

  server.prompt(
    "servicebus-namespace-overview",
    "Generate comprehensive overview of Service Bus namespace with all queues and health metrics",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
    },
    async ({ resourceId }: any) => {
      const service = getServiceBusService();
      const resource = service.getResourceById(resourceId);
  
      // Get namespace properties
      const namespaceProps = await service.getNamespaceProperties(resourceId);
  
      // Get all queues
      const queues = await service.listQueues(resourceId);
  
      // Format as markdown
      const output = formatNamespaceOverviewAsMarkdown({
        namespace: resource.namespace,
        tier: namespaceProps.tier,
        queues,
      });
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: output,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "servicebus-queue-health",
    "Generate detailed health report for a specific queue with recommendations",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
    },
    async ({ resourceId, queueName }: any) => {
      const service = getServiceBusService();
      const resource = service.getResourceById(resourceId);
  
      // Get queue info (runtime metrics)
      const queueInfo = await service.getQueueProperties(resourceId, queueName);
  
      // Get queue config (configuration properties)
      const queueConfig = await service.getQueueConfigProperties(resourceId, queueName);
  
      // Get health status
      const health = getQueueHealthStatus(queueInfo);
  
      // Peek recent messages
      const messages = await service.peekMessages(resourceId, queueName, 10);
  
      // Peek dead letter messages
      const deadLetterMessages = await service.peekDeadLetterMessages(resourceId, queueName, 10);
  
      let output = `# Queue Health Report: ${queueName}\n\n`;
      output += `**Namespace:** ${resource.namespace}\n`;
      output += `**Date:** ${new Date().toISOString()}\n\n`;
  
      output += `## Health Status\n\n`;
      output += `${health.icon} **${health.status.toUpperCase()}**\n\n`;
      output += `**Reason:** ${health.reason}\n\n`;
  
      output += `## Queue Metrics\n\n`;
      output += `| Metric | Value |\n`;
      output += `|--------|-------|\n`;
      output += `| Active Messages | ${queueInfo.activeMessageCount || 0} |\n`;
      output += `| Dead Letter Messages | ${queueInfo.deadLetterMessageCount || 0} |\n`;
      output += `| Scheduled Messages | ${queueInfo.scheduledMessageCount || 0} |\n`;
      output += `| Size (bytes) | ${queueInfo.sizeInBytes?.toLocaleString() || 0} |\n`;
      output += `| Max Size (MB) | ${queueConfig.maxSizeInMegabytes || 0} |\n\n`;
  
      output += `## Configuration\n\n`;
      output += `| Setting | Value |\n`;
      output += `|---------|-------|\n`;
      output += `| Lock Duration | ${queueConfig.lockDuration || 'N/A'} |\n`;
      output += `| Max Delivery Count | ${queueConfig.maxDeliveryCount || 0} |\n`;
      output += `| Duplicate Detection | ${queueConfig.requiresDuplicateDetection ? 'Yes' : 'No'} |\n`;
      output += `| Sessions Enabled | ${queueInfo.requiresSession ? 'Yes' : 'No'} |\n`;
      output += `| Partitioning Enabled | ${queueConfig.enablePartitioning ? 'Yes' : 'No'} |\n\n`;
  
      output += `## Recommendations\n\n`;
      if (health.status === 'critical') {
        output += `⚠️ **CRITICAL**: Immediate action required\n`;
        output += `- Investigate dead letter messages immediately\n`;
        output += `- Check consumer health and processing capacity\n`;
        output += `- Consider scaling out consumers\n\n`;
      } else if (health.status === 'warning') {
        output += `⚠️ **WARNING**: Monitor closely\n`;
        output += `- Review message processing times\n`;
        output += `- Check for processing bottlenecks\n`;
        output += `- Monitor dead letter queue growth\n\n`;
      } else {
        output += `✅ Queue is healthy\n`;
        output += `- Continue regular monitoring\n`;
        output += `- Maintain current processing capacity\n\n`;
      }
  
      if (messages.length > 0) {
        output += `## Recent Messages (${messages.length})\n\n`;
        output += formatMessagesAsMarkdown(messages, false);
      }
  
      if (deadLetterMessages.length > 0) {
        output += `\n## Dead Letter Messages (${deadLetterMessages.length})\n\n`;
        output += formatMessagesAsMarkdown(deadLetterMessages, false);
      }
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: output,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "servicebus-deadletter-analysis",
    "Analyze dead letter queue with pattern detection and actionable recommendations",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
      maxMessages: z.string().optional().describe("Maximum messages to analyze (default: 50)"),
    },
    async ({ resourceId, queueName, maxMessages }: any) => {
      const service = getServiceBusService();
      const resource = service.getResourceById(resourceId);
  
      // Parse maxMessages to number
      const maxMsgs = maxMessages ? parseInt(maxMessages, 10) : 50;
  
      // Peek dead letter messages
      const deadLetterMessages = await service.peekDeadLetterMessages(
        resourceId,
        queueName,
        maxMsgs
      );
  
      if (deadLetterMessages.length === 0) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `# Dead Letter Queue Analysis: ${queueName}\n\n✅ **No dead letter messages found**\n\nThe dead letter queue is empty. This indicates healthy message processing.`,
              },
            },
          ],
        };
      }
  
      // Analyze dead letter messages
      const { markdown } = formatDeadLetterAnalysisAsMarkdown(deadLetterMessages);
  
      let output = `# Dead Letter Queue Analysis: ${queueName}\n\n`;
      output += `**Namespace:** ${resource.namespace}\n`;
      output += `**Date:** ${new Date().toISOString()}\n`;
      output += `**Messages Analyzed:** ${deadLetterMessages.length}\n\n`;
      output += markdown;
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: output,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "servicebus-message-inspection",
    "Inspect a single message in detail with cross-service troubleshooting recommendations",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
      messageId: z.string().optional().describe("Message ID to inspect (if not provided, inspects first message)"),
      isDeadLetter: z.string().optional().describe("Inspect dead letter queue (default: false)"),
    },
    async ({ resourceId, queueName, messageId, isDeadLetter }: any) => {
      const service = getServiceBusService();
      const resource = service.getResourceById(resourceId);
  
      // Parse isDeadLetter to boolean
      const isDLQ = isDeadLetter === 'true';
  
      // Peek messages
      const messages = isDLQ
        ? await service.peekDeadLetterMessages(resourceId, queueName, 100)
        : await service.peekMessages(resourceId, queueName, 100);
  
      if (messages.length === 0) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `# Message Inspection: ${queueName}\n\n**No messages found** in ${isDLQ ? 'dead letter queue' : 'queue'}.`,
              },
            },
          ],
        };
      }
  
      // Find specific message or use first
      const message = messageId
        ? messages.find((m) => m.messageId === messageId)
        : messages[0];
  
      if (!message) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `# Message Inspection: ${queueName}\n\n**Message not found** with ID: ${messageId}\n\nAvailable message IDs:\n${messages.slice(0, 10).map((m: any) => `- ${m.messageId}`).join('\n')}`,
              },
            },
          ],
        };
      }
  
      // Format message inspection
      const output = formatMessageInspectionAsMarkdown(message, isDLQ);
  
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Message Inspection: ${queueName}\n\n**Namespace:** ${resource.namespace}\n**Queue:** ${queueName}\n**Date:** ${new Date().toISOString()}\n\n${output}`,
            },
          },
        ],
      };
    }
  );

  // ========================================
  // TOOLS
  // ========================================

  server.tool(
    "servicebus-list-namespaces",
    "List all configured Service Bus namespaces (active and inactive)",
    {},
    async () => {
      try {
        const service = getServiceBusService();
        const resources = service.getAllResources();
  
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
    "servicebus-test-connection",
    "Test connectivity to a Service Bus namespace and verify permissions (Data Receiver + Reader roles)",
    {
      resourceId: z.string().describe("Service Bus resource ID (use servicebus-list-namespaces to find IDs)"),
    },
    async ({ resourceId }: any) => {
      try {
        const service = getServiceBusService();
        const result = await service.testConnection(resourceId);
  
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
    "servicebus-list-queues",
    "List all queues in a Service Bus namespace with message counts and session info (cached for 5 minutes)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
    },
    async ({ resourceId }: any) => {
      try {
        const service = getServiceBusService();
        const queues = await service.listQueues(resourceId);
  
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
    "servicebus-peek-messages",
    "Peek messages in a queue without removing them (read-only, max 100 messages)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
      maxMessages: z.number().optional().describe("Maximum messages to peek (default: 10, max: 100)"),
      sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
    },
    async ({ resourceId, queueName, maxMessages, sessionId }: any) => {
      try {
        const service = getServiceBusService();
        const messages = await service.peekMessages(resourceId, queueName, maxMessages || 10, sessionId);
  
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
    "servicebus-peek-deadletter",
    "Peek dead letter queue messages with failure reasons (read-only, max 100 messages)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
      maxMessages: z.number().optional().describe("Maximum messages to peek (default: 10, max: 100)"),
      sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
    },
    async ({ resourceId, queueName, maxMessages, sessionId }: any) => {
      try {
        const service = getServiceBusService();
        const messages = await service.peekDeadLetterMessages(resourceId, queueName, maxMessages || 10, sessionId);
  
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
    "servicebus-get-queue-properties",
    "Get detailed queue properties, metrics, and configuration including session info",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
    },
    async ({ resourceId, queueName }: any) => {
      try {
        const service = getServiceBusService();
        const properties = await service.getQueueProperties(resourceId, queueName);
  
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
    "servicebus-search-messages",
    "Search messages by content or properties (loads into memory, max 500 messages)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
      bodyContains: z.string().optional().describe("Search for text in message body (case-insensitive)"),
      correlationId: z.string().optional().describe("Filter by correlation ID"),
      messageId: z.string().optional().describe("Filter by message ID"),
      propertyKey: z.string().optional().describe("Application property key to filter by"),
      propertyValue: z.any().optional().describe("Application property value to match"),
      sessionId: z.string().optional().describe("Session ID for session-enabled queues"),
      maxMessages: z.number().optional().describe("Maximum messages to search (default: 50, max: 500)"),
    },
    async ({ resourceId, queueName, bodyContains, correlationId, messageId, propertyKey, propertyValue, sessionId, maxMessages }: any) => {
      try {
        const service = getServiceBusService();
        const result = await service.searchMessages(
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
    "servicebus-get-namespace-properties",
    "Get namespace-level properties and quotas (tier, max message size)",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
    },
    async ({ resourceId }: any) => {
      try {
        const service = getServiceBusService();
        const properties = await service.getNamespaceProperties(resourceId);
  
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

  console.error("service-bus tools registered: 8 tools, 4 prompts");

  console.error("Service Bus tools registered: 8 tools, 4 prompts");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();
  const server = createMcpServer({
    name: "mcp-service-bus",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });
  registerServiceBusTools(server);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start Service Bus MCP server:", error);
    process.exit(1);
  });
  console.error("Service Bus MCP server running");
}
