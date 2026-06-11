/**
 * Service Bus prompt templates
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatNamespaceOverviewAsMarkdown,
  formatMessagesAsMarkdown,
  formatDeadLetterAnalysisAsMarkdown,
  formatMessageInspectionAsMarkdown,
  getQueueHealthStatus,
} from '../utils/servicebus-formatters.js';

export function registerServiceBusPrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "sb-namespace-overview",
    "Generate comprehensive overview of Service Bus namespace with all queues and health metrics",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
    },
    async ({ resourceId }: any) => {
      const resource = ctx.serviceBus.getResourceById(resourceId);
      const namespaceProps = await ctx.serviceBus.getNamespaceProperties(resourceId);
      const queues = await ctx.serviceBus.listQueues(resourceId);

      const output = formatNamespaceOverviewAsMarkdown({
        namespace: resource.namespace,
        tier: namespaceProps.tier,
        queues,
      });

      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: output },
          },
        ],
      };
    }
  );

  server.prompt(
    "sb-queue-health",
    "Generate detailed health report for a specific queue with recommendations",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
    },
    async ({ resourceId, queueName }: any) => {
      const resource = ctx.serviceBus.getResourceById(resourceId);
      const queueInfo = await ctx.serviceBus.getQueueProperties(resourceId, queueName);
      const queueConfig = await ctx.serviceBus.getQueueConfigProperties(resourceId, queueName);
      const health = getQueueHealthStatus(queueInfo);
      const messages = await ctx.serviceBus.peekMessages(resourceId, queueName, 10);
      const deadLetterMessages = await ctx.serviceBus.peekDeadLetterMessages(resourceId, queueName, 10);

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
            content: { type: "text", text: output },
          },
        ],
      };
    }
  );

  server.prompt(
    "sb-deadletter-analysis",
    "Analyze dead letter queue with pattern detection and actionable recommendations",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
      maxMessages: z.string().optional().describe("Maximum messages to analyze (default: 50)"),
    },
    async ({ resourceId, queueName, maxMessages }: any) => {
      const resource = ctx.serviceBus.getResourceById(resourceId);
      const maxMsgs = maxMessages ? parseInt(maxMessages, 10) : 50;
      const deadLetterMessages = await ctx.serviceBus.peekDeadLetterMessages(
        resourceId, queueName, maxMsgs
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
            content: { type: "text", text: output },
          },
        ],
      };
    }
  );

  server.prompt(
    "sb-message-inspection",
    "Inspect a single message in detail with cross-service troubleshooting recommendations",
    {
      resourceId: z.string().describe("Service Bus resource ID"),
      queueName: z.string().describe("Queue name"),
      messageId: z.string().optional().describe("Message ID to inspect (if not provided, inspects first message)"),
      isDeadLetter: z.string().optional().describe("Inspect dead letter queue (default: false)"),
    },
    async ({ resourceId, queueName, messageId, isDeadLetter }: any) => {
      const resource = ctx.serviceBus.getResourceById(resourceId);
      const isDLQ = isDeadLetter === 'true';

      const messages = isDLQ
        ? await ctx.serviceBus.peekDeadLetterMessages(resourceId, queueName, 100)
        : await ctx.serviceBus.peekMessages(resourceId, queueName, 100);

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

  console.error("service-bus prompts registered: 4 prompts");
}
