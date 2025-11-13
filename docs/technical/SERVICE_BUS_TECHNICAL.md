# Azure Service Bus Technical Documentation

> **Cross-References:**
> - User Guide: [docs/documentation/SERVICE_BUS.md](../documentation/SERVICE_BUS.md)
> - Service Implementation: [packages/service-bus/src/ServiceBusService.ts](../../packages/service-bus/src/ServiceBusService.ts)
> - Main Architecture: [CLAUDE.md](../../CLAUDE.md)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [Service Class](#service-class)
  - [Authentication Methods](#authentication-methods)
  - [Configuration](#configuration)
- [Dual Client Architecture](#dual-client-architecture)
  - [ServiceBusClient](#servicebusclient)
  - [ServiceBusAdministrationClient](#servicebusadministrationclient)
- [Available Tools](#available-tools)
- [Available Prompts](#available-prompts)
- [Service Implementation](#service-implementation)
  - [Core Architecture](#core-architecture)
  - [Token Management](#token-management)
  - [Queue List Caching](#queue-list-caching)
  - [Read-Only Message Inspection](#read-only-message-inspection)
  - [Dead Letter Queue Inspection](#dead-letter-queue-inspection)
  - [Message Search](#message-search)
  - [Queue Properties](#queue-properties)
- [Service Integration](#service-integration)
  - [Configuration Parsing](#configuration-parsing)
  - [Lazy Initialization Pattern](#lazy-initialization-pattern)
  - [Cleanup Handlers](#cleanup-handlers)
- [Formatting Utilities](#formatting-utilities)
  - [Key Formatters](#key-formatters)
  - [Queue Health Status](#queue-health-status)
  - [Dead Letter Analysis](#dead-letter-analysis)
  - [Message Format Detection](#message-format-detection)
- [Use Cases](#use-cases)
- [Security Considerations](#security-considerations)
- [Design Patterns](#design-patterns)
- [Error Handling](#error-handling)
- [Performance Optimization](#performance-optimization)

---

## Overview

The Azure Service Bus integration enables read-only inspection of Service Bus queues and dead letter queues for troubleshooting, monitoring, and message investigation. It provides comprehensive queue health monitoring, dead letter analysis, and cross-service correlation with Application Insights and Log Analytics.

## Architecture

The Azure Service Bus integration provides access to Service Bus namespaces through the Azure Service Bus SDK using a dual client architecture.

### Service Class

**Service Class:** `ServiceBusService` ([src/ServiceBusService.ts](src/ServiceBusService.ts))
- Manages authentication (Entra ID OAuth or connection string)
- Provides read-only message inspection using `peekMessages()` only
- Implements dual client architecture (ServiceBusClient + ServiceBusAdministrationClient)
- Supports queue health monitoring and dead letter analysis
- Supports multiple namespaces with active/inactive flags

### Authentication Methods

1. **Microsoft Entra ID (OAuth 2.0)** - Recommended for production
   - Token-based authentication with automatic refresh
   - Uses `@azure/identity` ClientSecretCredential
   - Requires "Azure Service Bus Data Receiver" role
   - Better security and RBAC-based access control

2. **Connection String** - Simpler for testing
   - Direct connection string authentication
   - Requires SharedAccessKey with Listen permissions
   - Less secure than Entra ID (stored secrets)

### Configuration

Supports two configuration modes:
1. Multi-namespace (JSON array in `SERVICEBUS_RESOURCES`)
2. Single-namespace fallback (`SERVICEBUS_NAMESPACE`)

Each namespace has an `active` flag for quick toggling without removing configuration.

## Dual Client Architecture

The service uses two separate clients for different operations:

### ServiceBusClient

**Message operations:**
- `peekMessages()` - Peek messages in queue (read-only)
- Session support with `sessionId` parameter
- Message search by correlation ID, message ID, or body content

### ServiceBusAdministrationClient

**Management operations:**
- `getQueueRuntimeProperties()` - Queue properties (message counts, size)
- `getNamespaceProperties()` - Namespace-level info (tier, capacity)
- List queues with metadata

This separation ensures:
- Clean separation of concerns (data vs. management)
- Better error handling (different authentication scopes)
- Compliance with Azure SDK best practices

## Available Tools

8 total tools:

1. **`servicebus-list-namespaces`** - List configured namespaces (active and inactive)
2. **`servicebus-test-connection`** - Test connectivity and return namespace info
3. **`servicebus-list-queues`** - List all queues with metadata and health status
4. **`servicebus-peek-messages`** - Peek messages without removal (max 100)
5. **`servicebus-peek-deadletter`** - Peek dead letter queue messages
6. **`servicebus-get-queue-properties`** - Get queue properties and configuration
7. **`servicebus-search-messages`** - Search messages by criteria (max 500)
8. **`servicebus-get-namespace-properties`** - Get namespace properties (tier, capacity)

## Available Prompts

5 total prompts:

1. **`servicebus-namespace-overview`** - Comprehensive namespace overview with all queues
2. **`servicebus-queue-health`** - Detailed queue health report with recommendations
3. **`servicebus-deadletter-analysis`** - DLQ investigation with pattern detection
4. **`servicebus-message-inspection`** - Single message inspection with cross-service recommendations
5. **`servicebus-cross-service-troubleshooting`** - Multi-service correlation report

## Service Implementation

### Core Architecture

```typescript
import {
  ServiceBusClient,
  ServiceBusAdministrationClient,
  ServiceBusReceivedMessage,
} from '@azure/service-bus';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { ClientSecretCredential } from '@azure/identity';

export class ServiceBusService {
  // Dual client architecture
  private clients: Map<string, ServiceBusClient> = new Map();
  private adminClients: Map<string, ServiceBusAdministrationClient> = new Map();

  // Token management (Entra ID)
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  // Queue list caching (5-minute TTL)
  private queueListCache: Map<string, { data: QueueInfo[]; expires: number }> = new Map();

  // Core methods
  async testConnection(resourceId: string): Promise<ConnectionTestResult>
  async listQueues(resourceId: string): Promise<QueueInfo[]>
  async peekMessages(resourceId: string, queueName: string, maxMessages?: number, sessionId?: string)
  async peekDeadLetterMessages(resourceId: string, queueName: string, maxMessages?: number, sessionId?: string)
  async getQueueProperties(resourceId: string, queueName: string)
  async searchMessages(resourceId: string, queueName: string, criteria: SearchCriteria, maxMessages?: number)
  async getNamespaceProperties(resourceId: string)
  async close(): Promise<void>
}
```

### Token Management

- Uses MSAL for OAuth 2.0 authentication with scope `https://servicebus.azure.net/.default`
- Implements token caching with 5-minute buffer before 1-hour expiry
- Automatic token refresh on expiration
- Connection string mode bypasses token management

### Queue List Caching

```typescript
// Cache queue list for 5 minutes (configurable)
private queueListCache: Map<string, { data: QueueInfo[]; expires: number }> = new Map();

async listQueues(resourceId: string): Promise<QueueInfo[]> {
  const cacheKey = `${resourceId}:queues`;
  const cached = this.queueListCache.get(cacheKey);

  if (cached && Date.now() < cached.expires) {
    return cached.data; // Return cached data
  }

  // Fetch fresh queue list
  const queues = await this.fetchQueuesFromServiceBus(resourceId);

  // Cache for TTL (default: 300 seconds)
  const ttl = this.config.cacheQueueListTTL || 300;
  this.queueListCache.set(cacheKey, {
    data: queues,
    expires: Date.now() + (ttl * 1000)
  });

  return queues;
}
```

### Read-Only Message Inspection

```typescript
async peekMessages(
  resourceId: string,
  queueName: string,
  maxMessages?: number,
  sessionId?: string
): Promise<ServiceBusReceivedMessage[]> {
  const timer = auditLogger.startTimer();
  const limit = Math.min(maxMessages || 10, this.config.maxPeekMessages || 100);

  const client = await this.getServiceBusClient(resourceId);
  const receiver = sessionId
    ? client.acceptSession(queueName, sessionId)
    : client.createReceiver(queueName);

  try {
    // CRITICAL: Use peekMessages() only - never receiveMessages()
    const messages = await receiver.peekMessages(limit, {
      timeout: this.config.peekTimeout || 30000
    });

    // Optional: Sanitize messages (default: OFF)
    const sanitized = this.config.sanitizeMessages
      ? messages.map(m => this.sanitizeMessage(m))
      : messages;

    auditLogger.log({
      operation: 'peek-messages',
      operationType: 'READ',
      resourceId,
      componentType: 'Queue',
      componentName: queueName,
      success: true,
      parameters: { maxMessages: limit, sessionId },
      executionTimeMs: timer()
    });

    return sanitized;
  } finally {
    await receiver.close();
  }
}
```

### Dead Letter Queue Inspection

```typescript
async peekDeadLetterMessages(
  resourceId: string,
  queueName: string,
  maxMessages?: number,
  sessionId?: string
): Promise<ServiceBusReceivedMessage[]> {
  // Dead letter queue path: queueName/$DeadLetterQueue
  const dlqPath = `${queueName}/$DeadLetterQueue`;

  const client = await this.getServiceBusClient(resourceId);
  const receiver = sessionId
    ? client.acceptSession(dlqPath, sessionId)
    : client.createReceiver(dlqPath);

  try {
    const messages = await receiver.peekMessages(
      Math.min(maxMessages || 10, this.config.maxPeekMessages || 100)
    );

    return this.config.sanitizeMessages
      ? messages.map(m => this.sanitizeMessage(m))
      : messages;
  } finally {
    await receiver.close();
  }
}
```

### Message Search

```typescript
async searchMessages(
  resourceId: string,
  queueName: string,
  criteria: SearchCriteria,
  maxMessages?: number
): Promise<ServiceBusReceivedMessage[]> {
  const limit = Math.min(maxMessages || 100, this.config.maxSearchMessages || 500);
  const client = await this.getServiceBusClient(resourceId);
  const receiver = client.createReceiver(queueName);

  try {
    const results: ServiceBusReceivedMessage[] = [];
    let peekedCount = 0;

    // Peek messages in batches until limit reached or no more messages
    while (results.length < limit && peekedCount < limit * 2) {
      const batchSize = Math.min(100, limit - results.length);
      const batch = await receiver.peekMessages(batchSize);

      if (batch.length === 0) break;

      peekedCount += batch.length;

      // Client-side filtering
      for (const msg of batch) {
        if (this.matchesCriteria(msg, criteria)) {
          results.push(msg);
          if (results.length >= limit) break;
        }
      }
    }

    return results;
  } finally {
    await receiver.close();
  }
}

private matchesCriteria(msg: ServiceBusReceivedMessage, criteria: SearchCriteria): boolean {
  if (criteria.correlationId && msg.correlationId !== criteria.correlationId) return false;
  if (criteria.messageId && msg.messageId !== criteria.messageId) return false;
  if (criteria.sessionId && msg.sessionId !== criteria.sessionId) return false;

  if (criteria.bodyContains) {
    const bodyStr = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
    if (!bodyStr.includes(criteria.bodyContains)) return false;
  }

  if (criteria.propertyKey && criteria.propertyValue) {
    const propValue = msg.applicationProperties?.[criteria.propertyKey];
    if (propValue !== criteria.propertyValue) return false;
  }

  return true;
}
```

### Queue Properties

```typescript
async getQueueProperties(resourceId: string, queueName: string) {
  const adminClient = await this.getAdminClient(resourceId);

  // Get runtime properties (message counts, size)
  const runtimeProps = await adminClient.getQueueRuntimeProperties(queueName);

  // Get queue properties (configuration)
  const queueProps = await adminClient.getQueue(queueName);

  return {
    name: queueName,
    activeMessageCount: runtimeProps.activeMessageCount,
    deadLetterMessageCount: runtimeProps.deadLetterMessageCount,
    scheduledMessageCount: runtimeProps.scheduledMessageCount,
    sizeInBytes: runtimeProps.sizeInBytes,
    maxSizeInMegabytes: queueProps.maxSizeInMegabytes,
    lockDuration: queueProps.lockDuration,
    maxDeliveryCount: queueProps.maxDeliveryCount,
    requiresDuplicateDetection: queueProps.requiresDuplicateDetection,
    requiresSession: queueProps.requiresSession,
    enablePartitioning: queueProps.enablePartitioning,
    status: queueProps.status,
    // ... more properties
  };
}
```

## Service Integration

### Configuration Parsing

```typescript
const SERVICEBUS_CONFIG: ServiceBusConfig = {
  resources: [],
  authMethod: (process.env.SERVICEBUS_AUTH_METHOD || 'entra-id') as 'entra-id' | 'connection-string',
  tenantId: process.env.SERVICEBUS_TENANT_ID || '',
  clientId: process.env.SERVICEBUS_CLIENT_ID || '',
  clientSecret: process.env.SERVICEBUS_CLIENT_SECRET || '',
  sanitizeMessages: process.env.SERVICEBUS_SANITIZE_MESSAGES === 'true',
  maxPeekMessages: parseInt(process.env.SERVICEBUS_MAX_PEEK_MESSAGES || '100'),
  maxSearchMessages: parseInt(process.env.SERVICEBUS_MAX_SEARCH_MESSAGES || '500'),
  peekTimeout: parseInt(process.env.SERVICEBUS_PEEK_TIMEOUT || '30000'),
  retryMaxAttempts: parseInt(process.env.SERVICEBUS_RETRY_MAX_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.SERVICEBUS_RETRY_DELAY || '1000'),
  cacheQueueListTTL: parseInt(process.env.SERVICEBUS_CACHE_QUEUE_LIST_TTL || '300'),
};

// Multi-namespace configuration (JSON array)
if (process.env.SERVICEBUS_RESOURCES) {
  SERVICEBUS_CONFIG.resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
}
// Single-namespace fallback
else if (process.env.SERVICEBUS_NAMESPACE) {
  SERVICEBUS_CONFIG.resources = [{
    id: 'default',
    name: 'Default Service Bus',
    namespace: process.env.SERVICEBUS_NAMESPACE,
    active: true,
    connectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
    description: 'Default Service Bus namespace',
  }];
}
```

### Lazy Initialization Pattern

```typescript
let serviceBusService: ServiceBusService | null = null;

function getServiceBusService(): ServiceBusService {
  if (!serviceBusService) {
    const missingConfig: string[] = [];

    if (!SERVICEBUS_CONFIG.resources || SERVICEBUS_CONFIG.resources.length === 0) {
      missingConfig.push('SERVICEBUS_RESOURCES or SERVICEBUS_NAMESPACE');
    }

    if (SERVICEBUS_CONFIG.authMethod === 'entra-id') {
      if (!SERVICEBUS_CONFIG.tenantId) missingConfig.push('SERVICEBUS_TENANT_ID');
      if (!SERVICEBUS_CONFIG.clientId) missingConfig.push('SERVICEBUS_CLIENT_ID');
      if (!SERVICEBUS_CONFIG.clientSecret) missingConfig.push('SERVICEBUS_CLIENT_SECRET');
    }

    if (missingConfig.length > 0) {
      throw new Error(`Missing Service Bus configuration: ${missingConfig.join(', ')}`);
    }

    serviceBusService = new ServiceBusService(SERVICEBUS_CONFIG);
    console.error('Service Bus service initialized');
  }

  return serviceBusService;
}
```

### Cleanup Handlers

```typescript
process.on('SIGINT', async () => {
  console.error('Shutting down gracefully (SIGINT)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  if (serviceBusService) {
    await serviceBusService.close(); // Close all clients
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down gracefully (SIGTERM)...');
  if (azureSqlService) {
    await azureSqlService.close();
  }
  if (serviceBusService) {
    await serviceBusService.close(); // Close all clients
  }
  process.exit(0);
});
```

## Formatting Utilities

The Service Bus formatters transform raw message data into human-readable analysis.

**File:** [src/utils/servicebus-formatters.ts](src/utils/servicebus-formatters.ts)

### Key Formatters

- `formatQueueListAsMarkdown()` - Queue table with health status indicators
- `formatMessagesAsMarkdown()` - Message list with metadata
- `formatMessageInspectionAsMarkdown()` - Detailed single message inspection
- `analyzeDeadLetterMessages()` - Pattern detection and failure analysis
- `formatDeadLetterAnalysisAsMarkdown()` - DLQ report with insights
- `formatNamespaceOverviewAsMarkdown()` - Complete namespace overview
- `detectMessageFormat()` - Detect message format (JSON/XML/text/binary)
- `generateServiceBusTroubleshootingGuide()` - Comprehensive troubleshooting report
- `generateCrossServiceReport()` - Multi-service correlation report
- `getQueueHealthStatus()` - Health status calculation (healthy/warning/critical)

### Queue Health Status

```typescript
export function getQueueHealthStatus(queue: QueueInfo): {
  status: 'healthy' | 'warning' | 'critical';
  icon: string;
  reason: string;
} {
  const dlqCount = queue.deadLetterMessageCount || 0;
  const activeCount = queue.activeMessageCount || 0;
  const size = queue.sizeInBytes || 0;
  const maxSize = (queue.maxSizeInMegabytes || 0) * 1024 * 1024;

  // Critical: DLQ has messages or queue is nearly full
  if (dlqCount > 0) {
    return {
      status: 'critical',
      icon: '🔴',
      reason: `${dlqCount} messages in dead letter queue`
    };
  }

  if (size > maxSize * 0.9) {
    return {
      status: 'critical',
      icon: '🔴',
      reason: `Queue is ${Math.round((size / maxSize) * 100)}% full`
    };
  }

  // Warning: High message backlog
  if (activeCount > 1000) {
    return {
      status: 'warning',
      icon: '⚠️',
      reason: `High message backlog (${activeCount} messages)`
    };
  }

  // Healthy
  return {
    status: 'healthy',
    icon: '✅',
    reason: 'Queue is operating normally'
  };
}
```

### Dead Letter Analysis

```typescript
export function analyzeDeadLetterMessages(messages: ServiceBusReceivedMessage[]): {
  insights: string[];
  recommendations: string[];
  reasonSummary: Array<{ reason: string; count: number }>;
  timeline: Array<{ hour: string; count: number }>;
} {
  // Group by dead letter reason
  const reasonCounts = new Map<string, number>();
  messages.forEach(msg => {
    const reason = msg.deadLetterReason || 'Unknown';
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  });

  // Build insights
  const insights: string[] = [
    `- Total dead letter messages: ${messages.length}`,
    `- Unique failure reasons: ${reasonCounts.size}`
  ];

  // Top reasons
  const sortedReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  sortedReasons.forEach(([reason, count]) => {
    insights.push(`- ${count} messages failed due to ${reason}`);
  });

  // Timeline analysis (hourly)
  const hourCounts = new Map<string, number>();
  messages.forEach(msg => {
    const hour = new Date(msg.enqueuedTimeUtc).toISOString().substring(0, 13);
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });

  // Recommendations
  const recommendations: string[] = [];
  if (reasonCounts.has('MaxDeliveryCountExceeded')) {
    recommendations.push('⚠️ Review message processing logic - messages failing after max retries');
    recommendations.push('🔍 Consider increasing max delivery count or implementing retry with backoff');
  }
  if (reasonCounts.has('MessageLockLostException')) {
    recommendations.push('⚠️ Processing taking too long - increase lock duration or optimize processing');
  }

  return {
    insights,
    recommendations,
    reasonSummary: sortedReasons.map(([reason, count]) => ({ reason, count })),
    timeline: Array.from(hourCounts.entries()).map(([hour, count]) => ({ hour, count }))
  };
}
```

### Message Format Detection

```typescript
export function detectMessageFormat(message: ServiceBusReceivedMessage): {
  format: 'json' | 'xml' | 'text' | 'binary' | 'unknown';
  isValid: boolean;
  error?: string;
} {
  const body = message.body;
  const contentType = message.contentType;

  // Check content type hint
  if (contentType?.includes('json')) {
    try {
      JSON.parse(typeof body === 'string' ? body : JSON.stringify(body));
      return { format: 'json', isValid: true };
    } catch (e: any) {
      return { format: 'json', isValid: false, error: e.message };
    }
  }

  if (contentType?.includes('xml')) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyStr.trim().startsWith('<')) {
      return { format: 'xml', isValid: true };
    }
  }

  // Auto-detect
  if (typeof body === 'object') {
    return { format: 'json', isValid: true };
  }

  if (typeof body === 'string') {
    // Try JSON
    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
      try {
        JSON.parse(body);
        return { format: 'json', isValid: true };
      } catch {
        return { format: 'text', isValid: true };
      }
    }

    // Try XML
    if (body.trim().startsWith('<')) {
      return { format: 'xml', isValid: true };
    }

    // Plain text
    return { format: 'text', isValid: true };
  }

  // Binary
  if (Buffer.isBuffer(body) || body instanceof ArrayBuffer) {
    return { format: 'binary', isValid: true };
  }

  return { format: 'unknown', isValid: false };
}
```

## Use Cases

**Queue Health Monitoring:**
- Monitor all queues for backlog and failures
- Track dead letter queue growth
- Identify queues approaching size limits
- Generate health reports with actionable recommendations

**Dead Letter Queue Investigation:**
- Analyze failure patterns and reasons
- Identify common error scenarios
- Track failure timeline
- Generate recommendations for fixes

**Message Tracing:**
- Search messages by correlation ID
- Trace message flow across queues
- Correlate with Application Insights and Log Analytics
- Investigate specific order/transaction

**Cross-Service Troubleshooting:**
- Combine Service Bus, Application Insights, and Log Analytics data
- Correlation by correlation ID
- Timeline analysis across services
- Root cause identification

**Session-Enabled Queue Management:**
- Inspect messages by session ID
- FIFO ordering verification
- Session-specific troubleshooting

## Security Considerations

**Read-Only by Design:**
- Uses `peekMessages()` only - never `receiveMessages()`
- Messages remain in queue after inspection
- No message deletion or modification
- Safe for production troubleshooting

**Credential Management:**
- Never log tokens or connection strings
- Store tokens in memory only (never persist)
- Clear tokens on service disposal
- Automatic token refresh (Entra ID)

**Data Sanitization (Optional):**
- Disabled by default (`SERVICEBUS_SANITIZE_MESSAGES=false`)
- When enabled, redacts:
  - Message bodies containing potential PII
  - Application properties matching sensitive patterns
  - Connection strings in error messages
- Use when sharing message data externally

**RBAC and Permissions:**
For Entra ID authentication, the service principal must have:
- "Azure Service Bus Data Receiver" role on namespace
- Role can be assigned at namespace or resource group level
- Read-only access only (no send/delete permissions)

## Design Patterns

**Dual Client Architecture:**
- ServiceBusClient for message operations
- ServiceBusAdministrationClient for management operations
- Separation of concerns (data vs. config)
- Independent error handling

**Lazy Initialization:**
- Service initialized on first tool/prompt invocation
- Validates configuration before initialization
- Caches clients for reuse

**Queue List Caching:**
- 5-minute TTL cache (configurable)
- Reduces API calls to Service Bus
- Automatic invalidation on errors

**Message Sanitization:**
- Optional feature (OFF by default)
- Client-side sanitization after peek
- Configurable via environment variable

**Session Support:**
- Optional `sessionId` parameter
- Automatic session acceptance
- FIFO ordering within session

**Audit Logging:**
All operations are logged with execution time:
```typescript
auditLogger.log({
  operation: 'peek-messages',
  operationType: 'READ',
  resourceId: 'prod',
  componentType: 'Queue',
  componentName: 'orders-queue',
  success: true,
  parameters: { maxMessages: 10, sessionId: null },
  executionTimeMs: 156
});
```

## Error Handling

The service implements comprehensive error handling:

**Authentication Errors (401/403):**
- Clear messages about missing/invalid credentials
- Token expiration detection with refresh retry
- Permission requirements (Data Receiver role)

**Connection Errors:**
- Network connectivity detection
- Firewall rule suggestions
- Namespace validation
- Queue not found with queue list

**Peek Errors:**
- Timeout handling (30-second default)
- Empty queue detection
- Session ID validation
- Lock lost exceptions

**Queue Errors:**
- Queue not found with available queues
- Session-enabled queue without session ID
- Message lock lost (processing too slow)
- Queue disabled or inactive

## Performance Optimization

**Caching:**
- Queue list cached for 5 minutes
- Reduces API calls by 95%+
- Configurable TTL via `SERVICEBUS_CACHE_QUEUE_LIST_TTL`

**Batching:**
- Peek operations use batching internally
- Search operations peek in batches (100 at a time)
- Reduces network round-trips

**Limits:**
- Default peek limit: 10 messages (max: 100)
- Default search limit: 100 messages (max: 500)
- Configurable via environment variables
- Prevents large response sizes

**Client Reuse:**
- Clients cached per namespace
- Automatic client creation on first use
- Graceful client disposal on shutdown
