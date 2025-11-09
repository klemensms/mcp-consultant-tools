/**
 * Service Bus Formatting Utilities
 *
 * Transforms Service Bus API responses into human-readable markdown reports
 * with insights, analysis, and recommendations.
 */

import { ServiceBusReceivedMessage } from '@azure/service-bus';
import type { QueueInfo } from '../ServiceBusService.js';

// ============================================================================
// Queue Formatting
// ============================================================================

/**
 * Format queue list as markdown table with session info
 */
export function formatQueueListAsMarkdown(
  queues: QueueInfo[],
  includeHealthStatus: boolean = true
): string {
  if (!queues || queues.length === 0) {
    return '*No queues found*';
  }

  const header =
    '| Queue Name | Active | DLQ | Scheduled | Size | Session | Status |';
  const separator =
    '|------------|--------|-----|-----------|------|---------|--------|';

  const rows = queues.map((queue) => {
    const sizeMB = ((queue.sizeInBytes || 0) / (1024 * 1024)).toFixed(2);
    const sessionIcon = queue.requiresSession ? 'Yes' : 'No';

    let statusIcon = '✅ Healthy';
    if (includeHealthStatus) {
      const health = getQueueHealthStatus(queue);
      statusIcon = `${health.icon} ${health.reason}`;
    }

    return (
      `| ${queue.name} | ${queue.activeMessageCount} | ${queue.deadLetterMessageCount} | ` +
      `${queue.scheduledMessageCount} | ${sizeMB} MB | ${sessionIcon} | ${statusIcon} |`
    );
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Get queue health status based on metrics
 */
export function getQueueHealthStatus(queue: QueueInfo): {
  status: 'healthy' | 'warning' | 'critical';
  icon: string;
  reason: string;
} {
  if (queue.deadLetterMessageCount > 10) {
    return {
      status: 'critical',
      icon: '❌',
      reason: `High DLQ count (${queue.deadLetterMessageCount})`,
    };
  }

  if (queue.deadLetterMessageCount > 0) {
    return {
      status: 'warning',
      icon: '⚠️',
      reason: 'DLQ has messages',
    };
  }

  if (queue.activeMessageCount > 1000) {
    return {
      status: 'warning',
      icon: '⚠️',
      reason: 'High message count',
    };
  }

  return {
    status: 'healthy',
    icon: '✅',
    reason: 'Healthy',
  };
}

// ============================================================================
// Message Formatting
// ============================================================================

/**
 * Format messages as markdown with message details
 */
export function formatMessagesAsMarkdown(
  messages: ServiceBusReceivedMessage[],
  showBody: boolean = false
): string {
  if (!messages || messages.length === 0) {
    return '*No messages found*';
  }

  const header =
    '| Message ID | Enqueued | Delivery Count | Correlation ID | Session |';
  const separator =
    '|------------|----------|----------------|----------------|---------|';

  const rows = messages.map((msg) => {
    const enqueuedTime = msg.enqueuedTimeUtc
      ? new Date(msg.enqueuedTimeUtc).toISOString()
      : 'N/A';
    const correlationId = msg.correlationId || '-';
    const sessionId = msg.sessionId || '-';

    return (
      `| ${msg.messageId} | ${enqueuedTime} | ${msg.deliveryCount || 0} | ` +
      `${correlationId} | ${sessionId} |`
    );
  });

  let result = [header, separator, ...rows].join('\n');

  if (showBody && messages.length > 0) {
    result += '\n\n## Message Bodies\n\n';
    messages.forEach((msg, idx) => {
      result += `### Message ${idx + 1}: ${msg.messageId}\n\n`;
      result += '```json\n';
      result += JSON.stringify(msg.body, null, 2);
      result += '\n```\n\n';
    });
  }

  return result;
}

/**
 * Format message body with syntax highlighting
 */
export function formatMessageBody(body: any, contentType?: string): string {
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
    } catch {
      return '```\n' + body + '\n```';
    }
  } else if (typeof body === 'object') {
    return '```json\n' + JSON.stringify(body, null, 2) + '\n```';
  } else {
    return '```\n' + String(body) + '\n```';
  }
}

/**
 * Format single message inspection
 */
export function formatMessageInspectionAsMarkdown(
  message: ServiceBusReceivedMessage,
  isDeadLetter: boolean
): string {
  let result = `# Message Inspection: ${message.messageId}\n\n`;

  result += `**Queue Type**: ${isDeadLetter ? 'Dead Letter' : 'Active'}\n`;
  result += `**Inspection Time**: ${new Date().toISOString()}\n\n`;

  result += '## Message Properties\n\n';
  result += '| Property | Value |\n';
  result += '|----------|-------|\n';
  result += `| Message ID | ${message.messageId} |\n`;
  result += `| Correlation ID | ${message.correlationId || '(none)'} |\n`;
  result += `| Content Type | ${message.contentType || '(none)'} |\n`;
  result += `| Enqueued Time | ${message.enqueuedTimeUtc ? new Date(message.enqueuedTimeUtc).toISOString() : 'N/A'} |\n`;
  result += `| Delivery Count | ${message.deliveryCount || 0} |\n`;
  result += `| Sequence Number | ${message.sequenceNumber ? message.sequenceNumber.toString() : 'N/A'} |\n`;
  result += `| Session ID | ${message.sessionId || '(none)'} |\n\n`;

  if (isDeadLetter) {
    result += '## Dead Letter Information\n\n';
    result += `- **Reason**: ${message.deadLetterReason || 'Unknown'}\n`;
    result += `- **Error Description**: ${message.deadLetterErrorDescription || 'N/A'}\n\n`;
  }

  result += '## Message Body\n\n';
  result += formatMessageBody(message.body, message.contentType) + '\n\n';

  if (message.applicationProperties && Object.keys(message.applicationProperties).length > 0) {
    result += '## Application Properties\n\n';
    result += '```json\n';
    result += JSON.stringify(message.applicationProperties, null, 2);
    result += '\n```\n\n';
  }

  return result;
}

// ============================================================================
// Dead Letter Queue Analysis
// ============================================================================

/**
 * Analyze dead letter messages and extract patterns
 */
export function analyzeDeadLetterMessages(messages: ServiceBusReceivedMessage[]): {
  insights: string[];
  recommendations: string[];
  reasonSummary: { reason: string; count: number; percentage: number }[];
  averageDeliveryCount: number;
  timespan: { first?: Date; last?: Date; duration?: string };
} {
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (messages.length === 0) {
    return {
      insights: ['No dead letter messages found'],
      recommendations: ['✅ Queue is healthy - no messages in dead letter queue'],
      reasonSummary: [],
      averageDeliveryCount: 0,
      timespan: {},
    };
  }

  // Analyze failure reasons
  const reasonCounts: Record<string, number> = {};
  messages.forEach((msg) => {
    const reason = msg.deadLetterReason || 'Unknown';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  });

  const reasonSummary = Object.entries(reasonCounts)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: (count / messages.length) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  // Calculate average delivery count
  const totalDeliveryCount = messages.reduce((sum, msg) => sum + (msg.deliveryCount || 0), 0);
  const averageDeliveryCount = totalDeliveryCount / messages.length;

  // Analyze timespan
  const times = messages
    .map((msg) => msg.enqueuedTimeUtc)
    .filter((t) => t !== undefined)
    .sort();

  let timespan: { first?: Date; last?: Date; duration?: string } = {};
  if (times.length > 0) {
    const first = new Date(times[0]!);
    const last = new Date(times[times.length - 1]!);
    const durationMs = last.getTime() - first.getTime();
    const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(1);

    timespan = {
      first,
      last,
      duration: `${durationHours} hours`,
    };
  }

  // Generate insights
  insights.push(`Total dead letter messages: ${messages.length}`);
  insights.push(`Average delivery count: ${averageDeliveryCount.toFixed(1)} attempts`);

  if (reasonSummary.length > 0) {
    const topReason = reasonSummary[0];
    insights.push(
      `Most common failure: ${topReason.reason} (${topReason.percentage.toFixed(1)}%)`
    );
  }

  if (timespan.duration) {
    insights.push(`Failures span ${timespan.duration}`);
  }

  const sessionMessages = messages.filter((msg) => msg.sessionId);
  if (sessionMessages.length > 0) {
    insights.push(`${sessionMessages.length} messages have session IDs`);
  } else {
    insights.push('No session-enabled messages');
  }

  // Generate recommendations
  if (averageDeliveryCount > 5) {
    recommendations.push(
      '🔍 Investigate why messages are failing after multiple retries (avg ' +
        averageDeliveryCount.toFixed(1) +
        ' attempts)'
    );
  }

  if (reasonSummary.some((r) => r.reason === 'MaxDeliveryCountExceeded')) {
    recommendations.push(
      '⚠️ Check message processing logic for validation errors or external dependencies'
    );
    recommendations.push('🛠️ Consider implementing poison message handling');
  }

  if (messages.length > 10) {
    recommendations.push(
      '❌ High number of dead letter messages - investigate root cause immediately'
    );
  }

  recommendations.push('📊 Cross-reference with Application Insights exceptions using correlation IDs');
  recommendations.push("🔗 Use 'servicebus-cross-service-troubleshooting' for deeper analysis");

  return {
    insights,
    recommendations,
    reasonSummary,
    averageDeliveryCount,
    timespan,
  };
}

/**
 * Format dead letter analysis as markdown
 */
export function formatDeadLetterAnalysisAsMarkdown(
  messages: ServiceBusReceivedMessage[]
): {
  markdown: string;
  insights: string[];
  recommendations: string[];
} {
  const analysis = analyzeDeadLetterMessages(messages);

  let result = `# Dead Letter Queue Analysis\n\n`;
  result += `**Dead Letter Count**: ${messages.length}\n`;
  result += `**Analysis Time**: ${new Date().toISOString()}\n\n`;

  if (messages.length === 0) {
    result += '✅ **No dead letter messages found** - Queue is healthy!\n\n';
    return {
      markdown: result,
      insights: analysis.insights,
      recommendations: analysis.recommendations,
    };
  }

  // Failure reasons summary
  result += '## Failure Reasons Summary\n\n';
  if (analysis.reasonSummary.length > 0) {
    result += '| Reason | Count | Percentage |\n';
    result += '|--------|-------|------------|\n';
    analysis.reasonSummary.forEach((item) => {
      result += `| ${item.reason} | ${item.count} | ${item.percentage.toFixed(1)}% |\n`;
    });
    result += '\n';
  }

  // Dead letter messages table
  result += '## Dead Letter Messages\n\n';
  result += '| Message ID | Reason | Error Description | Delivery Count | Enqueued |\n';
  result += '|------------|--------|-------------------|----------------|----------|\n';

  messages.slice(0, 10).forEach((msg) => {
    const reason = msg.deadLetterReason || 'Unknown';
    const errorDesc = msg.deadLetterErrorDescription || 'N/A';
    const deliveryCount = msg.deliveryCount || 0;
    const enqueued = msg.enqueuedTimeUtc
      ? new Date(msg.enqueuedTimeUtc).toISOString()
      : 'N/A';

    // Truncate long error descriptions
    const truncatedDesc = errorDesc.length > 50 ? errorDesc.substring(0, 47) + '...' : errorDesc;

    result += `| ${msg.messageId} | ${reason} | ${truncatedDesc} | ${deliveryCount} | ${enqueued} |\n`;
  });

  if (messages.length > 10) {
    result += `\n*Showing first 10 of ${messages.length} messages*\n`;
  }

  result += '\n';

  // Insights
  result += '## Insights\n\n';
  analysis.insights.forEach((insight) => {
    result += `- ${insight}\n`;
  });
  result += '\n';

  // Recommendations
  result += '## Recommendations\n\n';
  analysis.recommendations.forEach((rec) => {
    result += `- ${rec}\n`;
  });
  result += '\n';

  return {
    markdown: result,
    insights: analysis.insights,
    recommendations: analysis.recommendations,
  };
}

// ============================================================================
// Namespace Overview
// ============================================================================

/**
 * Format namespace overview as markdown
 */
export function formatNamespaceOverviewAsMarkdown(data: {
  namespace: string;
  tier: string;
  queues: QueueInfo[];
}): string {
  let result = `# Service Bus Namespace Overview\n\n`;
  result += `**Namespace**: ${data.namespace}\n`;
  result += `**Tier**: ${data.tier} (Max message size: 256 KB)\n`;
  result += `**Total Queues**: ${data.queues.length}\n`;

  const totalMessages = data.queues.reduce((sum, q) => sum + (q.totalMessageCount || 0), 0);
  const totalDLQ = data.queues.reduce((sum, q) => sum + q.deadLetterMessageCount, 0);
  const totalScheduled = data.queues.reduce((sum, q) => sum + q.scheduledMessageCount, 0);

  result += `**Total Messages**: ${totalMessages}\n`;
  result += `**Total Dead Letter Messages**: ${totalDLQ}\n`;
  result += `**Total Scheduled Messages**: ${totalScheduled}\n\n`;

  result += '## Queue Health Summary\n\n';
  result += formatQueueListAsMarkdown(data.queues, true);
  result += '\n\n';

  // Insights
  result += '## Insights\n\n';

  const unhealthyQueues = data.queues.filter((q) => q.deadLetterMessageCount > 0);
  const healthyQueues = data.queues.filter((q) => q.deadLetterMessageCount === 0);
  const sessionQueues = data.queues.filter((q) => q.requiresSession);

  if (unhealthyQueues.length > 0) {
    result += `- ⚠️ ${unhealthyQueues.length} queue(s) have dead letter messages\n`;
  }

  if (healthyQueues.length > 0) {
    result += `- ✅ ${healthyQueues.length} queue(s) are healthy (no DLQ messages)\n`;
  }

  result += `- 🔍 Total dead letter messages: ${totalDLQ} across all queues\n`;

  if (totalScheduled > 0) {
    result += `- 📅 Total scheduled messages: ${totalScheduled}\n`;
  }

  if (sessionQueues.length > 0) {
    result += `- 🔐 ${sessionQueues.length} queue(s) require sessions\n`;
  }

  result += '\n';

  // Recommendations
  result += '## Recommendations\n\n';

  if (unhealthyQueues.length === 0) {
    result += '- ✅ All queues are healthy - no action required\n';
  } else {
    unhealthyQueues
      .sort((a, b) => b.deadLetterMessageCount - a.deadLetterMessageCount)
      .slice(0, 3)
      .forEach((queue) => {
        if (queue.deadLetterMessageCount > 10) {
          result += `- ❌ Investigate \`${queue.name}\` queue (${queue.deadLetterMessageCount} DLQ messages)\n`;
        } else {
          result += `- ⚠️ Check message processing for \`${queue.name}\` queue (${queue.deadLetterMessageCount} DLQ messages)\n`;
        }
      });

    result += `- 📊 Use \`servicebus-peek-deadletter\` to inspect failed messages\n`;
    result += `- 🔗 Use \`servicebus-deadletter-analysis\` for detailed investigation\n`;
  }

  result += '\n';

  return result;
}

// ============================================================================
// Message Format Detection
// ============================================================================

/**
 * Detect message format and validate JSON
 */
export function detectMessageFormat(message: ServiceBusReceivedMessage): {
  format: 'json' | 'xml' | 'text' | 'binary' | 'unknown';
  isValid: boolean;
  error?: string;
} {
  // Check content type
  if (message.contentType === 'application/json') {
    try {
      if (typeof message.body === 'string') {
        JSON.parse(message.body);
      } else {
        JSON.stringify(message.body);
      }
      return { format: 'json', isValid: true };
    } catch (error: any) {
      return {
        format: 'json',
        isValid: false,
        error: 'Invalid JSON: ' + error.message,
      };
    }
  }

  if (message.contentType === 'application/xml' || message.contentType === 'text/xml') {
    return {
      format: 'xml',
      isValid: false,
      error: 'XML messages not supported in v10.0',
    };
  }

  // Try to detect by body content
  try {
    if (typeof message.body === 'string') {
      JSON.parse(message.body);
      return { format: 'json', isValid: true };
    } else if (typeof message.body === 'object') {
      JSON.stringify(message.body);
      return { format: 'json', isValid: true };
    }
  } catch {
    // Not JSON
  }

  if (typeof message.body === 'string') {
    if (message.body.trim().startsWith('<')) {
      return {
        format: 'xml',
        isValid: false,
        error: 'XML messages not supported in v10.0',
      };
    }
    return { format: 'text', isValid: true };
  }

  return {
    format: 'unknown',
    isValid: false,
    error: 'Unknown message format',
  };
}

// ============================================================================
// Cross-Service Troubleshooting
// ============================================================================

/**
 * Generate Service Bus troubleshooting guide combining multiple sources
 */
export function generateServiceBusTroubleshootingGuide(data: {
  queue: QueueInfo;
  deadLetterMessages: ServiceBusReceivedMessage[];
  functionErrors?: any[];
  exceptions?: any[];
  commits?: any[];
}): string {
  let result = `# Service Bus Troubleshooting Guide\n\n`;
  result += `**Queue**: ${data.queue.name}\n`;
  result += `**Generated**: ${new Date().toISOString()}\n\n`;

  // Queue Health
  result += '## Queue Health\n\n';
  const health = getQueueHealthStatus(data.queue);
  result += `- **Status**: ${health.icon} ${health.reason}\n`;
  result += `- **Active Messages**: ${data.queue.activeMessageCount}\n`;
  result += `- **Dead Letter Messages**: ${data.queue.deadLetterMessageCount}\n`;
  result += `- **Scheduled Messages**: ${data.queue.scheduledMessageCount}\n`;
  result += `- **Requires Session**: ${data.queue.requiresSession ? 'Yes' : 'No'}\n\n`;

  // Dead Letter Analysis
  if (data.deadLetterMessages.length > 0) {
    const dlqAnalysis = formatDeadLetterAnalysisAsMarkdown(data.deadLetterMessages);
    result += dlqAnalysis.markdown;
  } else {
    result += '## Dead Letter Queue\n\n';
    result += '✅ No messages in dead letter queue - queue is healthy!\n\n';
  }

  return result;
}

/**
 * Generate cross-service correlation report
 */
export function generateCrossServiceReport(data: {
  serviceBus: {
    namespace: string;
    queue: string;
    deadLetterMessages: ServiceBusReceivedMessage[];
  };
  appInsights?: {
    exceptions: any[];
    requests: any[];
  };
  logAnalytics?: {
    functionLogs: any[];
    functionErrors: any[];
  };
  github?: {
    commits: any[];
    recentChanges: any[];
  };
  timespan: string;
}): string {
  let result = `# Cross-Service Troubleshooting Report\n\n`;
  result += `**Service Bus Namespace**: ${data.serviceBus.namespace}\n`;
  result += `**Queue**: ${data.serviceBus.queue}\n`;
  result += `**Time Range**: ${data.timespan}\n`;
  result += `**Generated**: ${new Date().toISOString()}\n\n`;

  result += '---\n\n';

  // Service Bus Analysis
  result += '## 1. Service Bus Analysis\n\n';
  result += `### Dead Letter Messages: ${data.serviceBus.deadLetterMessages.length}\n\n`;

  if (data.serviceBus.deadLetterMessages.length > 0) {
    const analysis = analyzeDeadLetterMessages(data.serviceBus.deadLetterMessages);
    result += '**Insights**:\n';
    analysis.insights.forEach((insight) => {
      result += `- ${insight}\n`;
    });
    result += '\n';
  } else {
    result += '✅ No dead letter messages found\n\n';
  }

  result += '---\n\n';

  // Application Insights
  if (data.appInsights) {
    result += '## 2. Application Insights Exceptions\n\n';
    if (data.appInsights.exceptions && data.appInsights.exceptions.length > 0) {
      result += `Found ${data.appInsights.exceptions.length} exceptions\n\n`;
      result += '*Use Application Insights tools for detailed exception analysis*\n\n';
    } else {
      result += 'No exceptions found in timespan\n\n';
    }
    result += '---\n\n';
  }

  // Log Analytics
  if (data.logAnalytics) {
    result += '## 3. Azure Functions Logs\n\n';
    if (data.logAnalytics.functionErrors && data.logAnalytics.functionErrors.length > 0) {
      result += `Found ${data.logAnalytics.functionErrors.length} function errors\n\n`;
      result += '*Use Log Analytics tools for detailed log analysis*\n\n';
    } else {
      result += 'No function errors found in timespan\n\n';
    }
    result += '---\n\n';
  }

  // GitHub
  if (data.github) {
    result += '## 4. Recent Code Changes\n\n';
    if (data.github.commits && data.github.commits.length > 0) {
      result += `Found ${data.github.commits.length} recent commits\n\n`;
      result += '*Use GitHub tools for commit details*\n\n';
    } else {
      result += 'No recent commits found\n\n';
    }
    result += '---\n\n';
  }

  // Recommendations
  result += '## Recommendations\n\n';
  result += '1. Review dead letter messages for common patterns\n';
  result += '2. Correlate message correlation IDs with Application Insights exceptions\n';
  result += '3. Check Azure Functions logs for processing errors\n';
  result += '4. Review recent code changes for potential regressions\n';
  result += '5. Set up monitoring alerts for DLQ message count thresholds\n\n';

  return result;
}
