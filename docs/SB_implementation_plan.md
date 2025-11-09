# Azure Service Bus Integration - Implementation Plan

## Overview

Add read-only Azure Service Bus queue and dead letter queue inspection capabilities to the MCP server. This integration enables AI assistants to troubleshoot message processing issues, analyze dead letter queues, and monitor queue health across multiple Service Bus namespaces.

**Status**: 📋 Planning Phase (Updated after Critical Review)

**Target Release**: 10.0

**Similar Implementation**: Log Analytics Workspace integration (release 8.0)

---

## Use Cases

### Primary Use Cases

1. **Dead Letter Queue Investigation**
   - Inspect messages that failed processing
   - Analyze failure reasons and exception details
   - Identify patterns in failed messages
   - Correlate with Application Insights exceptions

2. **Queue Health Monitoring**
   - Monitor active message counts across queues
   - Identify queues with growing backlogs
   - Check dead letter queue sizes
   - Detect processing bottlenecks

3. **Message Content Inspection**
   - Peek at message bodies without removing from queue
   - Inspect message properties and metadata
   - Search for specific message patterns
   - Verify message formats and schemas (JSON only in v10.0)

4. **Cross-Service Troubleshooting**
   - Correlate Service Bus messages with Azure Functions logs
   - Trace message flow through system components
   - Link failed messages to Application Insights exceptions
   - Connect messages to PowerPlatform plugin triggers

### Example Workflow

**Scenario**: Investigating why PowerPlatform data sync is failing

1. Check PowerPlatform plugin logs → Find sync errors
2. Query Service Bus dead letter queue → Find failed sync messages
3. Inspect message content → Identify malformed data
4. Search Application Insights → Find related exceptions
5. Query Azure Functions logs → Find processing errors
6. Generate troubleshooting report → Root cause analysis

---

## Architecture

### Service Class: `ServiceBusService`

**File**: `src/ServiceBusService.ts`

**Responsibilities**:
- Manage authentication to Azure Service Bus (Entra ID or Connection String)
- Provide read-only access to queues and dead letter queues
- Peek messages without removing from queues (non-destructive)
- List queues and retrieve queue properties
- Search messages by properties/content
- Handle session-enabled queues
- Optional message sanitization (disabled by default)

**Authentication Methods**:

1. **Microsoft Entra ID (OAuth 2.0)** - Recommended
   - Uses `@azure/identity` (DefaultAzureCredential or ClientSecretCredential)
   - Requires **TWO roles** for full functionality:
     - **"Azure Service Bus Data Receiver"** - Required for peeking messages
     - **"Reader" or "Monitoring Reader"** - Required for listing queues
   - Better security (token-based, automatic rotation)
   - Supports managed identities

2. **Connection String** - Per-Resource Fallback
   - Simpler configuration for single namespace
   - Contains namespace + SAS policy credentials
   - Less secure (static credentials)
   - Requires "Listen" permission
   - **Must be configured per resource** (no global connection string)

### Dependencies

**New npm packages**:
```json
{
  "@azure/service-bus": "^7.9.5",
  "@azure/identity": "^4.0.0"  // Already installed for App Insights/Log Analytics
}
```

### Configuration

**Multi-Namespace Configuration** (JSON array):
```json
SERVICEBUS_RESOURCES=[
  {
    "id": "prod-sb",
    "name": "Production Service Bus",
    "namespace": "mycompany-prod.servicebus.windows.net",
    "active": true,
    "connectionString": ""  // Optional: if not using Entra ID for this namespace
  },
  {
    "id": "dev-sb",
    "name": "Development Service Bus",
    "namespace": "mycompany-dev.servicebus.windows.net",
    "active": false
  }
]
```

**Single-Namespace Fallback**:
```bash
SERVICEBUS_NAMESPACE=mycompany-prod.servicebus.windows.net
# No global connection string - must be in resource config or use Entra ID
```

**Authentication Configuration**:
```bash
# Entra ID (Recommended)
SERVICEBUS_AUTH_METHOD=entra-id  # or "connection-string"
SERVICEBUS_TENANT_ID=your-tenant-id
SERVICEBUS_CLIENT_ID=your-client-id
SERVICEBUS_CLIENT_SECRET=your-client-secret
```

**Optional Configuration**:
```bash
# Sanitization (OFF by default - enable for production if needed)
SERVICEBUS_SANITIZE_MESSAGES=false  # Set to "true" to sanitize sensitive fields

# Performance Tuning
SERVICEBUS_PEEK_TIMEOUT=30000       # Timeout for peek operations (ms)
SERVICEBUS_RETRY_MAX_ATTEMPTS=3    # Max retries for transient failures
SERVICEBUS_RETRY_DELAY=1000        # Delay between retries (ms)

# Search Limits
SERVICEBUS_MAX_SEARCH_MESSAGES=500 # Max messages to search (default: 500)
SERVICEBUS_MAX_PEEK_MESSAGES=100   # Max messages to peek (default: 100)

# Caching
SERVICEBUS_CACHE_QUEUE_LIST_TTL=300  # Cache queue list for 5 minutes (seconds)
```

---

## Service Bus Client Architecture

### Azure Service Bus SDK Overview

**Package**: `@azure/service-bus`

**Key Concepts**:
- **ServiceBusClient**: Client for message operations (send/receive/peek)
- **ServiceBusAdministrationClient**: Client for management operations (list queues, get properties)
- **peekMessages()**: Non-destructive message inspection (always read-only, never locks or removes)
- **Dead Letter Queue**: Special sub-queue accessed via `subQueueType: 'deadLetter'`
- **Sessions**: For ordered message processing (FIFO within session)

**IMPORTANT**: The SDK has **two separate client classes** that must be managed independently:
```typescript
import { ServiceBusClient, ServiceBusAdministrationClient } from '@azure/service-bus';

// For message operations (peek, receive)
const client = new ServiceBusClient(namespace, credential);

// For management operations (list queues, get properties)
const adminClient = new ServiceBusAdministrationClient(namespace, credential);
```

**Message Structure**:
```typescript
interface ServiceBusReceivedMessage {
  body: any;                          // Message payload (JSON, string, binary)
  messageId: string;                  // Unique message ID
  contentType?: string;               // MIME type (e.g., "application/json")
  correlationId?: string;             // For message correlation
  subject?: string;                   // Message label/subject
  to?: string;                        // Destination address
  replyTo?: string;                   // Reply queue name
  timeToLive?: number;                // TTL in milliseconds
  scheduledEnqueueTimeUtc?: Date;     // Scheduled delivery time
  applicationProperties?: object;     // Custom key-value properties
  enqueuedTimeUtc?: Date;             // When message entered queue
  sequenceNumber?: number;            // Unique sequence number
  deliveryCount?: number;             // Delivery attempt count
  deadLetterReason?: string;          // Why message was dead-lettered
  deadLetterErrorDescription?: string; // Detailed error description
  sessionId?: string;                 // Session ID (if session-enabled)
}
```

**Queue Properties**:
```typescript
interface QueueRuntimeProperties {
  name: string;
  sizeInBytes: number;
  totalMessageCount: number;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  scheduledMessageCount: number;
  transferDeadLetterMessageCount: number;
  transferMessageCount: number;
}
```

**Namespace Properties**:
```typescript
interface NamespaceProperties {
  messagingSku: string;  // "Standard" or "Premium"
  // Available from Azure Resource Manager API
}
```

---

## Implementation Details

### ServiceBusService Class

**File**: `src/ServiceBusService.ts`

```typescript
import {
  ServiceBusClient,
  ServiceBusAdministrationClient,
  ServiceBusReceiver,
  ServiceBusReceivedMessage
} from '@azure/service-bus';
import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { auditLogger } from './utils/auditLogger';

export interface ServiceBusResource {
  id: string;
  name: string;
  namespace: string;  // e.g., "mycompany-prod.servicebus.windows.net"
  active: boolean;
  connectionString?: string;  // Optional: per-resource connection string
}

export interface ServiceBusConfig {
  resources: ServiceBusResource[];
  authMethod: 'entra-id' | 'connection-string';
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  sanitizeMessages?: boolean;  // Default: false
  peekTimeout?: number;        // Default: 30000ms
  retryMaxAttempts?: number;   // Default: 3
  retryDelay?: number;         // Default: 1000ms
  maxSearchMessages?: number;  // Default: 500
  maxPeekMessages?: number;    // Default: 100
  cacheQueueListTTL?: number;  // Default: 300s (5 minutes)
}

export class ServiceBusService {
  private config: ServiceBusConfig;

  // CRITICAL: Two separate client types
  private clients: Map<string, ServiceBusClient> = new Map();
  private adminClients: Map<string, ServiceBusAdministrationClient> = new Map();

  // Cache for queue lists (reduces management API calls)
  private queueListCache: Map<string, { data: any[]; expires: number }> = new Map();

  constructor(config: ServiceBusConfig) {
    this.config = {
      sanitizeMessages: false,  // Default: OFF
      peekTimeout: 30000,
      retryMaxAttempts: 3,
      retryDelay: 1000,
      maxSearchMessages: 500,
      maxPeekMessages: 100,
      cacheQueueListTTL: 300,
      ...config
    };
  }

  // Get or create ServiceBusClient for message operations
  private getClient(resourceId: string): ServiceBusClient {
    const resource = this.getResourceById(resourceId);

    if (!this.clients.has(resourceId)) {
      let client: ServiceBusClient;

      if (this.config.authMethod === 'entra-id') {
        // Use Entra ID authentication
        const credential = new ClientSecretCredential(
          this.config.tenantId!,
          this.config.clientId!,
          this.config.clientSecret!
        );
        client = new ServiceBusClient(resource.namespace, credential);
      } else {
        // Use per-resource connection string
        if (!resource.connectionString) {
          throw new Error(
            `No connection string configured for Service Bus resource '${resourceId}'. ` +
            `Either set connectionString in resource config or use Entra ID authentication.`
          );
        }
        client = new ServiceBusClient(resource.connectionString);
      }

      this.clients.set(resourceId, client);
    }

    return this.clients.get(resourceId)!;
  }

  // Get or create ServiceBusAdministrationClient for management operations
  private getAdminClient(resourceId: string): ServiceBusAdministrationClient {
    const resource = this.getResourceById(resourceId);

    if (!this.adminClients.has(resourceId)) {
      let adminClient: ServiceBusAdministrationClient;

      if (this.config.authMethod === 'entra-id') {
        // Use Entra ID authentication
        const credential = new ClientSecretCredential(
          this.config.tenantId!,
          this.config.clientId!,
          this.config.clientSecret!
        );
        adminClient = new ServiceBusAdministrationClient(resource.namespace, credential);
      } else {
        // Use per-resource connection string
        if (!resource.connectionString) {
          throw new Error(
            `No connection string configured for Service Bus resource '${resourceId}'. ` +
            `Either set connectionString in resource config or use Entra ID authentication.`
          );
        }
        adminClient = new ServiceBusAdministrationClient(resource.connectionString);
      }

      this.adminClients.set(resourceId, adminClient);
    }

    return this.adminClients.get(resourceId)!;
  }

  // Test connection to Service Bus namespace
  async testConnection(resourceId: string): Promise<{
    connected: boolean;
    namespace: string;
    canPeekMessages: boolean;
    canListQueues: boolean;
    authMethod: string;
    error?: string;
  }> {
    const timer = auditLogger.startTimer();
    const resource = this.getResourceById(resourceId);

    try {
      // Test management operations (list queues)
      let canListQueues = false;
      try {
        const adminClient = this.getAdminClient(resourceId);
        const queuesIterator = adminClient.listQueues();
        await queuesIterator.next();  // Try to get first queue
        canListQueues = true;
      } catch (error: any) {
        console.error(`Cannot list queues: ${error.message}`);
      }

      // Test message operations (peek from any queue)
      let canPeekMessages = false;
      if (canListQueues) {
        try {
          const adminClient = this.getAdminClient(resourceId);
          const queues = [];
          for await (const queue of adminClient.listQueues()) {
            queues.push(queue);
            break;  // Just get first queue
          }
          if (queues.length > 0) {
            const client = this.getClient(resourceId);
            const receiver = client.createReceiver(queues[0].name);
            await receiver.peekMessages(1);
            await receiver.close();
            canPeekMessages = true;
          }
        } catch (error: any) {
          console.error(`Cannot peek messages: ${error.message}`);
        }
      }

      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        resourceId: resource.id,
        componentType: 'Namespace',
        success: true,
        executionTimeMs: timer()
      });

      return {
        connected: canListQueues || canPeekMessages,
        namespace: resource.namespace,
        canPeekMessages,
        canListQueues,
        authMethod: this.config.authMethod
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        resourceId: resource.id,
        componentType: 'Namespace',
        success: false,
        error: error.message,
        executionTimeMs: timer()
      });

      return {
        connected: false,
        namespace: resource.namespace,
        canPeekMessages: false,
        canListQueues: false,
        authMethod: this.config.authMethod,
        error: error.message
      };
    }
  }

  // List all queues in a namespace (with caching)
  async listQueues(resourceId: string): Promise<QueueInfo[]> {
    const timer = auditLogger.startTimer();
    const resource = this.getResourceById(resourceId);

    // Check cache first
    const cacheKey = `queues:${resourceId}`;
    const cached = this.queueListCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      console.error(`Returning cached queue list for ${resourceId}`);
      return cached.data;
    }

    try {
      const adminClient = this.getAdminClient(resourceId);

      const queues: QueueInfo[] = [];
      for await (const queue of adminClient.listQueues()) {
        const runtimeProps = await adminClient.getQueueRuntimeProperties(queue.name);
        queues.push({
          name: queue.name,
          activeMessageCount: runtimeProps.activeMessageCount,
          deadLetterMessageCount: runtimeProps.deadLetterMessageCount,
          scheduledMessageCount: runtimeProps.scheduledMessageCount,
          sizeInBytes: runtimeProps.sizeInBytes,
          totalMessageCount: runtimeProps.totalMessageCount,
          requiresSession: queue.requiresSession || false
        });
      }

      // Cache the result
      this.queueListCache.set(cacheKey, {
        data: queues,
        expires: Date.now() + (this.config.cacheQueueListTTL! * 1000)
      });

      auditLogger.log({
        operation: 'list-queues',
        operationType: 'READ',
        resourceId: resource.id,
        componentType: 'Namespace',
        success: true,
        parameters: { queueCount: queues.length },
        executionTimeMs: timer()
      });

      return queues;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-queues',
        operationType: 'READ',
        resourceId: resource.id,
        componentType: 'Namespace',
        success: false,
        error: error.message,
        executionTimeMs: timer()
      });

      // Add helpful error message if permissions issue
      if (error.code === 'UnauthorizedAccessException' || error.statusCode === 401) {
        throw new Error(
          `Unauthorized to list queues in namespace '${resource.namespace}'. ` +
          `Requires 'Reader' or 'Monitoring Reader' role on the Service Bus namespace. ` +
          `Original error: ${error.message}`
        );
      }

      throw error;
    }
  }

  // Peek messages from queue (non-destructive, read-only)
  async peekMessages(
    resourceId: string,
    queueName: string,
    maxMessages: number = 10,
    sessionId?: string  // For session-enabled queues
  ): Promise<ServiceBusReceivedMessage[]> {
    const timer = auditLogger.startTimer();
    const resource = this.getResourceById(resourceId);

    // Enforce max limit
    const limit = Math.min(maxMessages, this.config.maxPeekMessages!);
    if (maxMessages > this.config.maxPeekMessages!) {
      console.error(
        `Requested ${maxMessages} messages but limit is ${this.config.maxPeekMessages}. ` +
        `Only returning first ${limit} messages.`
      );
    }

    try {
      const client = this.getClient(resourceId);

      let receiver: ServiceBusReceiver;
      if (sessionId) {
        // Session-enabled queue with specific session
        receiver = await client.acceptSession(queueName, sessionId);
      } else {
        // Regular queue (or session queue without specific session)
        receiver = client.createReceiver(queueName);
      }

      try {
        // peekMessages() is ALWAYS non-destructive (never locks or removes messages)
        const messages = await receiver.peekMessages(limit);

        // Sanitize if configured
        const processedMessages = this.config.sanitizeMessages
          ? messages.map(msg => this.sanitizeMessage(msg))
          : messages;

        auditLogger.log({
          operation: 'peek-messages',
          operationType: 'READ',
          resourceId: resource.id,
          componentType: 'Queue',
          success: true,
          parameters: {
            queueName,
            messageCount: messages.length,
            requested: maxMessages,
            limit,
            sessionId: sessionId || 'none'
          },
          executionTimeMs: timer()
        });

        return processedMessages;
      } finally {
        await receiver.close();
      }
    } catch (error: any) {
      auditLogger.log({
        operation: 'peek-messages',
        operationType: 'READ',
        resourceId: resource.id,
        componentType: 'Queue',
        success: false,
        error: error.message,
        parameters: { queueName },
        executionTimeMs: timer()
      });

      // Add helpful error messages
      if (error.code === 'MessagingEntityNotFound') {
        throw new Error(
          `Queue '${queueName}' not found in namespace '${resource.namespace}'. ` +
          `Use servicebus-list-queues to see available queues.`
        );
      }

      if (error.code === 'SessionCannotBeLockedError') {
        throw new Error(
          `Queue '${queueName}' requires sessions. ` +
          `Please provide a sessionId parameter or list available sessions first.`
        );
      }

      throw error;
    }
  }

  // Peek dead letter messages
  async peekDeadLetterMessages(
    resourceId: string,
    queueName: string,
    maxMessages: number = 10,
    sessionId?: string
  ): Promise<ServiceBusReceivedMessage[]> {
    const timer = auditLogger.startTimer();
    const resource = this.getResourceById(resourceId);

    // Enforce max limit
    const limit = Math.min(maxMessages, this.config.maxPeekMessages!);
    if (maxMessages > this.config.maxPeekMessages!) {
      console.error(
        `Requested ${maxMessages} messages but limit is ${this.config.maxPeekMessages}. ` +
        `Only returning first ${limit} messages.`
      );
    }

    try {
      const client = this.getClient(resourceId);

      let receiver: ServiceBusReceiver;
      if (sessionId) {
        // Session-enabled DLQ with specific session
        receiver = await client.acceptSession(queueName, sessionId, {
          subQueueType: 'deadLetter'
        });
      } else {
        // Regular DLQ
        receiver = client.createReceiver(queueName, {
          subQueueType: 'deadLetter'
        });
      }

      try {
        const messages = await receiver.peekMessages(limit);

        // Sanitize if configured
        const processedMessages = this.config.sanitizeMessages
          ? messages.map(msg => this.sanitizeMessage(msg))
          : messages;

        auditLogger.log({
          operation: 'peek-deadletter',
          operationType: 'READ',
          resourceId: resource.id,
          componentType: 'DeadLetterQueue',
          success: true,
          parameters: {
            queueName,
            messageCount: messages.length,
            requested: maxMessages,
            limit,
            sessionId: sessionId || 'none'
          },
          executionTimeMs: timer()
        });

        return processedMessages;
      } finally {
        await receiver.close();
      }
    } catch (error: any) {
      auditLogger.log({
        operation: 'peek-deadletter',
        operationType: 'READ',
        resourceId: resource.id,
        componentType: 'DeadLetterQueue',
        success: false,
        error: error.message,
        parameters: { queueName },
        executionTimeMs: timer()
      });

      throw error;
    }
  }

  // Get queue properties and metadata
  async getQueueProperties(
    resourceId: string,
    queueName: string
  ): Promise<QueueRuntimeProperties & { requiresSession: boolean }> {
    const timer = auditLogger.startTimer();
    const resource = this.getResourceById(resourceId);

    try {
      const adminClient = this.getAdminClient(resourceId);

      // Get runtime properties
      const runtimeProps = await adminClient.getQueueRuntimeProperties(queueName);

      // Get queue metadata for session info
      const queueProps = await adminClient.getQueue(queueName);

      auditLogger.log({
        operation: 'get-queue-properties',
        operationType: 'READ',
        resourceId: resource.id,
        componentType: 'Queue',
        success: true,
        parameters: { queueName },
        executionTimeMs: timer()
      });

      return {
        ...runtimeProps,
        requiresSession: queueProps.requiresSession || false
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-queue-properties',
        operationType: 'READ',
        resourceId: resource.id,
        componentType: 'Queue',
        success: false,
        error: error.message,
        parameters: { queueName },
        executionTimeMs: timer()
      });

      throw error;
    }
  }

  // Search messages by content/properties
  async searchMessages(
    resourceId: string,
    queueName: string,
    searchCriteria: {
      bodyContains?: string;
      propertyKey?: string;
      propertyValue?: any;
      correlationId?: string;
      messageId?: string;
      sessionId?: string;
    },
    maxMessages: number = 50
  ): Promise<{
    messages: ServiceBusReceivedMessage[];
    totalPeeked: number;
    matchCount: number;
    limitReached: boolean;
  }> {
    const timer = auditLogger.startTimer();

    // Enforce search limit
    const limit = Math.min(maxMessages, this.config.maxSearchMessages!);
    const limitReached = maxMessages > this.config.maxSearchMessages!;

    if (limitReached) {
      console.error(
        `Search limit enforced: requested ${maxMessages} messages but max is ${this.config.maxSearchMessages}. ` +
        `Searching first ${limit} messages only. ` +
        `If you need more, increase SERVICEBUS_MAX_SEARCH_MESSAGES.`
      );
    }

    try {
      const messages = await this.peekMessages(
        resourceId,
        queueName,
        limit,
        searchCriteria.sessionId
      );

      const filtered = messages.filter(msg => {
        // Filter by body content
        if (searchCriteria.bodyContains) {
          try {
            const body = JSON.stringify(msg.body).toLowerCase();
            if (!body.includes(searchCriteria.bodyContains.toLowerCase())) {
              return false;
            }
          } catch {
            return false;  // Skip non-JSON messages
          }
        }

        // Filter by correlation ID
        if (searchCriteria.correlationId && msg.correlationId !== searchCriteria.correlationId) {
          return false;
        }

        // Filter by message ID
        if (searchCriteria.messageId && msg.messageId !== searchCriteria.messageId) {
          return false;
        }

        // Filter by application property
        if (searchCriteria.propertyKey && msg.applicationProperties) {
          const propValue = msg.applicationProperties[searchCriteria.propertyKey];
          if (propValue !== searchCriteria.propertyValue) {
            return false;
          }
        }

        return true;
      });

      auditLogger.log({
        operation: 'search-messages',
        operationType: 'READ',
        resourceId: resourceId,
        componentType: 'Queue',
        success: true,
        parameters: {
          queueName,
          totalPeeked: messages.length,
          matchCount: filtered.length,
          limitReached
        },
        executionTimeMs: timer()
      });

      return {
        messages: filtered,
        totalPeeked: messages.length,
        matchCount: filtered.length,
        limitReached
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-messages',
        operationType: 'READ',
        resourceId: resourceId,
        componentType: 'Queue',
        success: false,
        error: error.message,
        executionTimeMs: timer()
      });

      throw error;
    }
  }

  // Get namespace properties (tier, quotas)
  // Note: This requires Azure Resource Manager API, not Service Bus SDK
  // For now, we'll just return basic info from the namespace
  async getNamespaceProperties(resourceId: string): Promise<{
    namespace: string;
    tier: string;  // "Standard" or "Premium" (detected from features)
    maxMessageSizeKB: number;
  }> {
    const resource = this.getResourceById(resourceId);

    // Standard tier: 256 KB, Premium tier: 1 MB
    // We can detect tier by trying to get namespace metadata
    // For v10.0, we'll assume Standard tier
    return {
      namespace: resource.namespace,
      tier: 'Standard',  // TODO: Detect from namespace properties
      maxMessageSizeKB: 256
    };
  }

  // Sanitize sensitive data from message (if enabled)
  private sanitizeMessage(message: ServiceBusReceivedMessage): ServiceBusReceivedMessage {
    const sanitized = { ...message };

    if (sanitized.body && typeof sanitized.body === 'object') {
      sanitized.body = this.sanitizeObject(sanitized.body);
    }

    return sanitized;
  }

  // Sanitize object recursively
  private sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    const sensitiveFields = [
      'password', 'pwd', 'passwd',
      'token', 'accesstoken', 'apitoken',
      'apikey', 'api_key', 'key',
      'secret', 'clientsecret', 'client_secret',
      'connectionstring', 'connection_string', 'connstr',
      'authorization', 'auth'
    ];

    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase().replace(/[_-]/g, '');

      if (sensitiveFields.includes(keyLower)) {
        sanitized[key] = '***';  // Redact sensitive fields
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);  // Recurse
      } else {
        sanitized[key] = value;  // Preserve
      }
    }

    return sanitized;
  }

  // Validate message is JSON
  private validateJsonMessage(message: ServiceBusReceivedMessage): void {
    if (message.contentType && message.contentType !== 'application/json') {
      throw new Error(
        `Unsupported message format: ${message.contentType}. ` +
        `Only 'application/json' is currently supported in v10.0. ` +
        `This message format can be added in a future release if needed.`
      );
    }

    // Try to parse body as JSON
    try {
      if (typeof message.body === 'string') {
        JSON.parse(message.body);
      } else {
        JSON.stringify(message.body);
      }
    } catch {
      throw new Error(
        `Message body is not valid JSON. ` +
        `Only JSON messages are supported in v10.0. ` +
        `Support for other formats can be added in future releases.`
      );
    }
  }

  // Cleanup
  async close(): Promise<void> {
    // Close all message clients
    for (const [resourceId, client] of this.clients.entries()) {
      await client.close();
      this.clients.delete(resourceId);
    }

    // Admin clients don't need explicit close
    this.adminClients.clear();

    // Clear cache
    this.queueListCache.clear();
  }

  private getResourceById(resourceId: string): ServiceBusResource {
    const resource = this.config.resources.find(r => r.id === resourceId);
    if (!resource) {
      const available = this.config.resources.map(r => r.id).join(', ');
      throw new Error(
        `Service Bus resource '${resourceId}' not found. ` +
        `Available resources: ${available}`
      );
    }
    if (!resource.active) {
      throw new Error(
        `Service Bus resource '${resourceId}' is inactive. ` +
        `Set active: true in configuration to use this resource.`
      );
    }
    return resource;
  }
}

interface QueueInfo {
  name: string;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  scheduledMessageCount: number;
  sizeInBytes: number;
  totalMessageCount: number;
  requiresSession: boolean;
}
```

---

## Tools to Implement

### Tool 1: `servicebus-list-namespaces`

**Description**: List all configured Service Bus namespaces (active and inactive)

**Parameters**: None

**Returns**:
```typescript
{
  namespaces: [
    {
      id: "prod-sb",
      name: "Production Service Bus",
      namespace: "mycompany-prod.servicebus.windows.net",
      active: true
    }
  ]
}
```

**Permissions Required**: None (reads configuration only)

---

### Tool 2: `servicebus-test-connection`

**Description**: Test connectivity to a Service Bus namespace and verify permissions

**Parameters**:
```typescript
{
  resourceId: string;  // "prod-sb"
}
```

**Returns**:
```typescript
{
  connected: true,
  namespace: "mycompany-prod.servicebus.windows.net",
  canPeekMessages: true,
  canListQueues: true,
  authMethod: "entra-id"
}
```

**Permissions Required**:
- "Azure Service Bus Data Receiver" (for `canPeekMessages`)
- "Reader" or "Monitoring Reader" (for `canListQueues`)

---

### Tool 3: `servicebus-list-queues`

**Description**: List all queues in a namespace with message counts and session info

**Parameters**:
```typescript
{
  resourceId: string;  // "prod-sb"
}
```

**Returns**:
```typescript
{
  queues: [
    {
      name: "order-processing",
      activeMessageCount: 42,
      deadLetterMessageCount: 3,
      scheduledMessageCount: 5,
      sizeInBytes: 1048576,
      totalMessageCount: 50,
      requiresSession: false
    }
  ]
}
```

**Permissions Required**: "Reader" or "Monitoring Reader" on namespace

**Note**: Results are cached for 5 minutes (configurable with `SERVICEBUS_CACHE_QUEUE_LIST_TTL`)

---

### Tool 4: `servicebus-peek-messages`

**Description**: Peek messages in a queue (non-destructive, read-only, never removes messages)

**Parameters**:
```typescript
{
  resourceId: string;    // "prod-sb"
  queueName: string;     // "order-processing"
  maxMessages?: number;  // Default: 10, Max: 100 (configurable)
  sessionId?: string;    // Optional: for session-enabled queues
}
```

**Returns**:
```typescript
{
  messages: [
    {
      messageId: "msg-123",
      body: { orderId: 456, amount: 99.99 },
      enqueuedTimeUtc: "2025-01-09T10:30:00Z",
      deliveryCount: 1,
      contentType: "application/json",
      correlationId: "order-456",
      sessionId: null,
      applicationProperties: { customerId: "cust-789" }
    }
  ]
}
```

**Permissions Required**: "Azure Service Bus Data Receiver"

**Limits**:
- Default max: 10 messages
- Hard limit: 100 messages (configurable with `SERVICEBUS_MAX_PEEK_MESSAGES`)
- User is warned if requesting more than limit

**Format Support**: JSON only (throws helpful error for other formats)

---

### Tool 5: `servicebus-peek-deadletter`

**Description**: Peek dead letter messages with failure reasons

**Parameters**:
```typescript
{
  resourceId: string;    // "prod-sb"
  queueName: string;     // "order-processing"
  maxMessages?: number;  // Default: 10, Max: 100 (configurable)
  sessionId?: string;    // Optional: for session-enabled queues
}
```

**Returns**:
```typescript
{
  messages: [
    {
      messageId: "msg-456",
      body: { orderId: 789, amount: 199.99 },
      enqueuedTimeUtc: "2025-01-09T09:00:00Z",
      deliveryCount: 10,
      deadLetterReason: "MaxDeliveryCountExceeded",
      deadLetterErrorDescription: "Message failed after 10 delivery attempts",
      sessionId: null,
      applicationProperties: { customerId: "cust-999" }
    }
  ]
}
```

**Permissions Required**: "Azure Service Bus Data Receiver"

**Limits**: Same as `servicebus-peek-messages`

---

### Tool 6: `servicebus-get-queue-properties`

**Description**: Get detailed queue properties, metrics, and configuration

**Parameters**:
```typescript
{
  resourceId: string;  // "prod-sb"
  queueName: string;   // "order-processing"
}
```

**Returns**:
```typescript
{
  name: "order-processing",
  sizeInBytes: 1048576,
  totalMessageCount: 45,
  activeMessageCount: 42,
  deadLetterMessageCount: 3,
  scheduledMessageCount: 0,
  transferDeadLetterMessageCount: 0,
  transferMessageCount: 0,
  requiresSession: false
}
```

**Permissions Required**: "Reader" or "Monitoring Reader" on namespace

---

### Tool 7: `servicebus-search-messages`

**Description**: Search messages by content or properties (searches in memory after peeking)

**Parameters**:
```typescript
{
  resourceId: string;
  queueName: string;
  bodyContains?: string;      // Search in message body (case-insensitive)
  correlationId?: string;     // Filter by correlation ID
  messageId?: string;         // Filter by message ID
  propertyKey?: string;       // Application property key
  propertyValue?: any;        // Application property value
  sessionId?: string;         // Optional: for session-enabled queues
  maxMessages?: number;       // Default: 50, Max: 500 (configurable)
}
```

**Returns**:
```typescript
{
  messages: [...],       // Matching messages
  totalPeeked: 50,       // Total messages examined
  matchCount: 5,         // Messages matching criteria
  limitReached: false    // True if hit SERVICEBUS_MAX_SEARCH_MESSAGES limit
}
```

**Permissions Required**: "Azure Service Bus Data Receiver"

**Performance Warning**:
- Peeks `maxMessages` into memory, then filters
- Default limit: 50 messages
- Hard limit: 500 messages (configurable with `SERVICEBUS_MAX_SEARCH_MESSAGES`)
- User is warned if limit is reached
- For queues with 100K+ messages, search may be slow

---

### Tool 8: `servicebus-get-namespace-properties`

**Description**: Get namespace-level properties and quotas

**Parameters**:
```typescript
{
  resourceId: string;  // "prod-sb"
}
```

**Returns**:
```typescript
{
  namespace: "mycompany-prod.servicebus.windows.net",
  tier: "Standard",  // or "Premium"
  maxMessageSizeKB: 256
}
```

**Permissions Required**: "Reader" on namespace

**Note**: v10.0 assumes Standard tier (256KB). Premium tier detection can be added later.

---

## Prompts to Implement

### Prompt 1: `servicebus-namespace-overview`

**Description**: Overview of all queues with health metrics and session info

**Parameters**:
```typescript
{
  resourceId: string;  // "prod-sb"
}
```

**Output Format** (Markdown):
```markdown
# Service Bus Namespace Overview: Production Service Bus

**Namespace**: mycompany-prod.servicebus.windows.net
**Tier**: Standard (Max message size: 256 KB)
**Total Queues**: 12
**Total Messages**: 1,234
**Total Dead Letter Messages**: 15
**Total Scheduled Messages**: 8

## Queue Health Summary

| Queue Name | Active | DLQ | Scheduled | Size | Session | Status |
|------------|--------|-----|-----------|------|---------|--------|
| order-processing | 42 | 3 | 0 | 1 MB | No | ⚠️ DLQ has messages |
| payment-processing | 0 | 0 | 0 | 0 KB | No | ✅ Healthy |
| notification-sender | 156 | 12 | 5 | 5 MB | Yes | ❌ High DLQ count |

## Insights

- ⚠️ 3 queues have dead letter messages
- ✅ 9 queues are healthy (no DLQ messages)
- 🔍 Total dead letter messages: 15 across all queues
- 📅 Total scheduled messages: 8
- 🔐 1 queue requires sessions (notification-sender)

## Recommendations

- ❌ Investigate `notification-sender` queue (12 DLQ messages)
- ⚠️ Check message processing for `order-processing` queue (3 DLQ messages)
- 📊 Use `servicebus-peek-deadletter` to inspect failed messages
```

---

### Prompt 2: `servicebus-queue-health`

**Description**: Detailed health report for a specific queue

**Parameters**:
```typescript
{
  resourceId: string;
  queueName: string;
}
```

**Output Format** (Markdown):
```markdown
# Queue Health Report: order-processing

**Namespace**: Production Service Bus
**Queue**: order-processing
**Report Time**: 2025-01-09 10:45:00 UTC
**Session Enabled**: No

## Metrics

- **Active Messages**: 42
- **Dead Letter Messages**: 3 ⚠️
- **Scheduled Messages**: 5 📅
- **Total Size**: 1.2 MB
- **Total Messages**: 50

## Recent Messages (Last 10)

| Message ID | Enqueued | Delivery Count | Correlation ID | Session |
|------------|----------|----------------|----------------|---------|
| msg-123 | 10:30:00 | 1 | order-456 | - |
| msg-124 | 10:31:00 | 1 | order-457 | - |

## Dead Letter Messages (Last 10)

| Message ID | Reason | Error Description | Delivery Count |
|------------|--------|-------------------|----------------|
| msg-456 | MaxDeliveryCountExceeded | Failed after 10 attempts | 10 |
| msg-457 | Processing error | Invalid JSON format | 5 |

## Scheduled Messages (Next 5)

| Message ID | Scheduled For | Correlation ID |
|------------|---------------|----------------|
| msg-789 | 2025-01-09 11:00:00 | order-800 |

## Recommendations

- ⚠️ 3 messages in dead letter queue - investigate failures
- 🔍 Check processing logic for messages with high delivery counts
- 📅 5 messages scheduled for future delivery
- 📊 Use `servicebus-deadletter-analysis` for detailed DLQ investigation
```

---

### Prompt 3: `servicebus-deadletter-analysis`

**Description**: Comprehensive dead letter queue investigation with pattern detection

**Parameters**:
```typescript
{
  resourceId: string;
  queueName: string;
  maxMessages?: number;  // Default: 50
}
```

**Output Format** (Markdown):
```markdown
# Dead Letter Queue Analysis: order-processing

**Namespace**: Production Service Bus
**Queue**: order-processing
**Dead Letter Count**: 3
**Analysis Time**: 2025-01-09 10:45:00 UTC

## Failure Reasons Summary

| Reason | Count | Percentage |
|--------|-------|------------|
| MaxDeliveryCountExceeded | 2 | 66.7% |
| Processing error | 1 | 33.3% |

## Dead Letter Messages

### Message 1: msg-456
- **Dead Letter Reason**: MaxDeliveryCountExceeded
- **Error Description**: Message failed after 10 delivery attempts
- **Delivery Count**: 10
- **Enqueued**: 2025-01-09 09:00:00 UTC
- **Correlation ID**: order-789
- **Session ID**: (none)
- **Body**:
  ```json
  {
    "orderId": 789,
    "amount": 199.99
  }
  ```
- **Properties**:
  ```json
  {
    "customerId": "cust-999"
  }
  ```

### Message 2: msg-457
- **Dead Letter Reason**: Processing error
- **Error Description**: Invalid JSON format
- **Delivery Count**: 5
- **Enqueued**: 2025-01-09 09:15:00 UTC
- **Body**: `{"orderId": 790, "amount": null}`

## Insights

- 66.7% of failures are due to max delivery count exceeded
- Average delivery count: 7.5 attempts
- Failures span 1.5 hours (09:00 - 10:30)
- No session-enabled messages

## Recommendations

- 🔍 Investigate why messages are failing after multiple retries
- ⚠️ Check message processing logic for validation errors
- 🛠️ Consider implementing poison message handling
- 📊 Cross-reference with Application Insights exceptions using correlation IDs
- 🔗 Use `appinsights-get-exceptions` to find related errors
```

---

### Prompt 4: `servicebus-message-inspection`

**Description**: Detailed message inspection with cross-service troubleshooting recommendations

**Parameters**:
```typescript
{
  resourceId: string;
  queueName: string;
  messageId: string;
  isDeadLetter?: boolean;  // Default: false
}
```

**Output Format** (Markdown):
```markdown
# Message Inspection: msg-456

**Namespace**: Production Service Bus
**Queue**: order-processing
**Queue Type**: Dead Letter
**Inspection Time**: 2025-01-09 10:45:00 UTC

## Message Properties

| Property | Value |
|----------|-------|
| Message ID | msg-456 |
| Correlation ID | order-789 |
| Content Type | application/json |
| Enqueued Time | 2025-01-09 09:00:00 UTC |
| Delivery Count | 10 |
| Sequence Number | 123456 |
| Session ID | (none) |

## Dead Letter Information

- **Reason**: MaxDeliveryCountExceeded
- **Error Description**: Message failed after 10 delivery attempts
- **Original Queue**: order-processing

## Message Body

```json
{
  "orderId": 789,
  "customerId": "cust-999",
  "amount": 199.99,
  "items": [
    { "productId": "prod-001", "quantity": 2 }
  ]
}
```

## Application Properties

```json
{
  "customerId": "cust-999",
  "priority": "high",
  "source": "web-api"
}
```

## Cross-Service Troubleshooting

### Recommended Next Steps:

1. **Search Application Insights for exceptions**:
   ```
   Use tool: appinsights-get-exceptions
   Filter by: correlationId = "order-789"
   Timespan: PT24H
   ```

2. **Check Azure Functions logs**:
   ```
   Use tool: loganalytics-get-function-errors
   Search for: orderId 789
   ```

3. **Verify customer data in PowerPlatform**:
   ```
   Use tool: query-records
   Entity: contact
   Filter: customerId eq 'cust-999'
   ```

4. **Check GitHub for recent code changes**:
   ```
   Use tool: ghe-search-commits
   Query: "order processing"
   ```

## Recommendations

- 🔍 Message failed 10 times - indicates systemic processing issue
- ⚠️ Check if orderId 789 exists in database
- 🛠️ Verify customer cust-999 has valid data
- 📊 Search Application Insights using correlation ID "order-789"
```

---

### Prompt 5: `servicebus-cross-service-troubleshooting`

**Description**: Comprehensive troubleshooting combining Service Bus + App Insights + Log Analytics + GitHub

**Parameters**:
```typescript
{
  resourceId: string;
  queueName: string;
  correlationId?: string;  // Optional: focus on specific correlation
  timespan?: string;       // Default: "PT24H"
}
```

**Output Format** (Markdown):
```markdown
# Cross-Service Troubleshooting Report

**Service Bus Namespace**: Production Service Bus
**Queue**: order-processing
**Correlation ID**: order-789 (if provided)
**Time Range**: Last 24 hours
**Generated**: 2025-01-09 10:45:00 UTC

---

## 1. Service Bus Analysis

### Dead Letter Messages: 3

| Message ID | Reason | Correlation ID | Enqueued |
|------------|--------|----------------|----------|
| msg-456 | MaxDeliveryCountExceeded | order-789 | 09:00:00 |
| msg-457 | Processing error | order-790 | 09:15:00 |

**Insights**:
- 66% failures due to max delivery exceeded
- Average 7.5 delivery attempts before dead-lettering

---

## 2. Application Insights Exceptions

(Auto-query using correlation IDs from DLQ messages)

| Timestamp | Exception Type | Message | Operation ID |
|-----------|----------------|---------|--------------|
| 09:00:05 | NullReferenceException | Object reference not set | order-789 |
| 09:15:10 | JsonException | Invalid JSON format | order-790 |

**Correlation**: 100% of DLQ messages have matching exceptions in App Insights

---

## 3. Azure Functions Logs

(Auto-query using timespan)

| Timestamp | Function | Severity | Message |
|-----------|----------|----------|---------|
| 09:00:04 | ProcessOrder | Error | Failed to deserialize order |
| 09:15:09 | ProcessOrder | Error | Amount cannot be null |

**Correlation**: Function errors occurred 1-2 seconds before messages dead-lettered

---

## 4. Recent Code Changes

(Auto-search GitHub commits in timespan)

| Commit | Author | Message | Date |
|--------|--------|---------|------|
| abc123 | John Doe | Fix order validation | 2025-01-08 |
| def456 | Jane Smith | Update amount handling | 2025-01-07 |

**Potential Cause**: Recent commit "Update amount handling" may have introduced null handling bug

---

## Root Cause Analysis

### Timeline Correlation:

1. **2025-01-07**: Code change deployed (commit def456)
2. **2025-01-09 09:00**: First failure (NullReferenceException)
3. **2025-01-09 09:15**: Second failure (JsonException)

### Evidence:

- ✅ DLQ messages correlate with App Insights exceptions
- ✅ Function errors occur immediately before dead-lettering
- ⚠️ Recent code change may have introduced regression

---

## Recommendations

1. **Immediate**: Review commit def456 for null handling bugs
2. **Investigation**: Check if amount validation was changed
3. **Rollback**: Consider rolling back to commit abc123
4. **Testing**: Add unit tests for null amount scenarios
5. **Monitoring**: Set up alerts for DLQ message count > 5

---

## Next Steps

1. Get commit diff: `ghe-get-commit-details` (def456)
2. Review current code: `ghe-get-file` (src/ProcessOrder.cs)
3. Check test coverage: `ghe-search-code` ("amount validation")
4. Deploy fix and monitor DLQ count
```

---

## Integration with Existing Services

### Cross-Service Troubleshooting Scenarios

#### Scenario 1: PowerPlatform → Service Bus → Azure Functions

**Workflow**:
1. PowerPlatform plugin sends message to Service Bus queue
2. Azure Function processes message
3. Message fails and ends up in dead letter queue

**Investigation**:
```typescript
// 1. Check PowerPlatform plugin logs
const pluginLogs = await getPluginTraceLogs({
  entityName: 'order',
  messageFilter: 'SendToServiceBus'
});

// 2. Find message in dead letter queue
const deadLetterMessages = await peekDeadLetterMessages({
  resourceId: 'prod-sb',
  queueName: 'order-processing',
  maxMessages: 50
});

// 3. Get Azure Functions error logs
const functionErrors = await getFunctionErrors({
  resourceId: 'prod-logs',
  functionName: 'ProcessOrder',
  timespan: 'PT24H'
});

// 4. Correlate with Application Insights exceptions
const exceptions = await getExceptions({
  resourceId: 'prod-api',
  timespan: 'PT24H'
});

// 5. Generate troubleshooting report
const report = generateTroubleshootingReport({
  pluginLogs,
  deadLetterMessages,
  functionErrors,
  exceptions
});
```

#### Scenario 2: Service Bus → Application Insights Correlation

**Use Case**: Find which Azure Function exception caused a message to dead letter

```typescript
// 1. Get dead letter message with correlation ID
const dlqResult = await peekDeadLetterMessages({
  resourceId: 'prod-sb',
  queueName: 'order-processing'
});

const correlationId = dlqResult.messages[0].correlationId;

// 2. Search Application Insights by correlation ID
const exceptions = await executeQuery({
  resourceId: 'prod-api',
  query: `exceptions | where operation_Id == '${correlationId}' | top 10 by timestamp desc`
});

// 3. Generate correlation report
const report = formatCorrelationReport(dlqResult.messages[0], exceptions);
```

#### Scenario 3: Service Bus → GitHub Code Investigation

**Use Case**: Find which code change caused messages to start failing

```typescript
// 1. Analyze DLQ messages for failure timeframe
const dlqMessages = await peekDeadLetterMessages({
  resourceId: 'prod-sb',
  queueName: 'order-processing',
  maxMessages: 50
});

const firstFailure = dlqMessages.messages[0].enqueuedTimeUtc;

// 2. Search GitHub commits around that time
const commits = await getCommits({
  repoId: 'azure-functions',
  since: new Date(firstFailure - 24*60*60*1000).toISOString(),  // 24h before
  until: firstFailure
});

// 3. Search for related code
const relevantCode = await searchCode({
  repoId: 'azure-functions',
  query: 'ProcessOrder',
  extension: 'cs'
});

// 4. Generate code change analysis
const report = analyzeCodeChanges(commits, dlqMessages, relevantCode);
```

---

## Security Considerations

### Authentication & Authorization

**Entra ID Roles Required**:

For **full functionality**, the service principal needs **TWO roles**:

1. **Azure Service Bus Data Receiver** (Data Plane)
   - Scope: Service Bus namespace
   - Permissions: Peek messages from queues and dead letter queues
   - Required for: `peek-messages`, `peek-deadletter`, `search-messages`

2. **Reader** or **Monitoring Reader** (Management Plane)
   - Scope: Service Bus namespace
   - Permissions: List queues, get queue properties
   - Required for: `list-queues`, `get-queue-properties`, `get-namespace-properties`

**RBAC Assignment** (Azure CLI):
```bash
# Get Service Bus namespace resource ID
NAMESPACE_ID="/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.ServiceBus/namespaces/<namespace>"

# Assign Data Receiver role (for message operations)
az role assignment create \
  --role "Azure Service Bus Data Receiver" \
  --assignee <service-principal-id> \
  --scope $NAMESPACE_ID

# Assign Reader role (for management operations)
az role assignment create \
  --role "Reader" \
  --assignee <service-principal-id> \
  --scope $NAMESPACE_ID
```

**Connection String Security**:
- Store in environment variables (never in code)
- Use "Listen" permission only (not "Manage" or "Send")
- Rotate regularly (recommended: 90 days)
- Use Entra ID instead of connection strings in production
- Must be configured per resource (no global connection string)

### Data Sanitization

**Configuration** (OFF by default):
```bash
# Enable sanitization for production
SERVICEBUS_SANITIZE_MESSAGES=true
```

**Sanitization Behavior**:

**Without Sanitization (Default - for dev/UAT)**:
```json
{
  "orderId": 12345,
  "customerEmail": "john.doe@example.com",
  "paymentToken": "sk_live_abc123xyz789",
  "apiKey": "ghp_xyzABC123",
  "connectionString": "Server=prod-db;Password=SuperSecret123"
}
```

**With Sanitization Enabled (for PROD)**:
```json
{
  "orderId": 12345,              // ✅ Business data preserved
  "customerEmail": "***",         // ❌ Hidden
  "paymentToken": "***",          // ❌ Hidden
  "apiKey": "***",                // ❌ Hidden
  "connectionString": "***"       // ❌ Hidden
}
```

**Sensitive Fields Redacted**:
- password, pwd, passwd
- token, accesstoken, apitoken
- apikey, api_key, key
- secret, clientsecret, client_secret
- connectionstring, connection_string, connstr
- authorization, auth

**When to Enable**:
- ✅ Enable for PROD (protect credentials)
- ❌ Disable for DEV/UAT (full visibility for debugging)
- ⚠️ Temporarily disable in PROD if troubleshooting requires full message visibility

**Audit Logging**:
```typescript
auditLogger.log({
  operation: 'peek-messages',
  operationType: 'READ',
  resourceId: resource.id,
  componentType: 'Queue',
  success: true,
  parameters: {
    queueName,
    messageCount: messages.length,
    sanitized: this.config.sanitizeMessages
    // Do NOT log message contents in audit log
  },
  executionTimeMs: timer()
});
```

### Read-Only Guarantees

**Peek vs Receive**:
- **peekMessages()**: Non-destructive, read-only (ALWAYS use this) ✅
- **receiveMessages()**: Removes message from queue (NEVER use this) ❌

**Implementation**:
```typescript
// ✅ CORRECT: peekMessages() is always non-destructive
const receiver = client.createReceiver(queueName);
const messages = await receiver.peekMessages(10);  // Never locks or removes
await receiver.close();

// ❌ FORBIDDEN: receiveMessages() removes from queue
// const messages = await receiver.receiveMessages(10);  // NEVER USE THIS
// await receiver.completeMessage(message);  // NEVER USE THIS
```

**No Write Operations**:
- ❌ No message sending
- ❌ No message completion
- ❌ No dead letter message resubmission (future feature)
- ✅ Only peek operations (read-only)

---

## Error Handling

### Common Errors

**Authentication Errors (401/403)**:
```
Error: Unauthorized - Missing or invalid credentials
```
**Solutions**:
- Verify Entra ID credentials (tenant ID, client ID, secret)
- Check "Azure Service Bus Data Receiver" role assignment (for message operations)
- Check "Reader" role assignment (for list operations)
- Verify connection string is valid (if using connection strings)
- Ensure service principal has permissions on correct namespace

**Resource Not Found (404)**:
```
Error: Queue 'order-processing' not found in namespace 'prod-sb'
```
**Solutions**:
- List queues first: `servicebus-list-queues`
- Verify queue name spelling (case-sensitive)
- Check if queue exists in correct namespace
- Verify resource ID matches configured namespaces

**Inactive Resource**:
```
Error: Service Bus resource 'prod-sb' is inactive. Set active: true in configuration to use this resource.
```
**Solutions**:
- Set `active: true` in resource configuration
- Use `servicebus-list-namespaces` to see all resources
- Check environment variable configuration

**Message Limit Exceeded**:
```
Requested 200 messages but limit is 100. Only returning first 100 messages.
```
**Solutions**:
- Reduce maxMessages parameter
- Increase limit: `SERVICEBUS_MAX_PEEK_MESSAGES=200`
- Use search/filter criteria to narrow results
- Peek in batches

**Search Limit Warning**:
```
Search limit enforced: requested 1000 messages but max is 500. Searching first 500 messages only.
```
**Solutions**:
- Reduce search scope
- Increase limit: `SERVICEBUS_MAX_SEARCH_MESSAGES=1000`
- Use more specific search criteria
- Note: Searching large queues is slow (in-memory filtering)

**Session Required Error**:
```
Error: Queue 'order-processing' requires sessions. Please provide a sessionId parameter.
```
**Solutions**:
- Check queue properties: `servicebus-get-queue-properties`
- Provide `sessionId` parameter if known
- List available sessions (future feature)
- Contact queue owner for session details

**Unsupported Format Error**:
```
Error: Unsupported message format: application/xml. Only 'application/json' is currently supported in v10.0. This message format can be added in a future release if needed.
```
**Solutions**:
- Verify message content type
- Only JSON messages supported in v10.0
- Report need for other formats (will be added in future releases)
- Use raw Service Bus API for non-JSON messages

**Network/Timeout Errors**:
```
Error: Service Bus operation timed out after 30 seconds
```
**Solutions**:
- Check network connectivity
- Verify firewall rules allow Service Bus access (port 5671 for AMQP)
- Queue may be experiencing high load
- Increase timeout: `SERVICEBUS_PEEK_TIMEOUT=60000`
- Retry operation (automatic retry up to 3 attempts)

**Connection String Missing**:
```
Error: No connection string configured for Service Bus resource 'dev-sb'. Either set connectionString in resource config or use Entra ID authentication.
```
**Solutions**:
- Add `connectionString` to resource configuration
- Or switch to Entra ID authentication (`SERVICEBUS_AUTH_METHOD=entra-id`)
- Check environment variable configuration

---

## Formatting Utilities

**File**: `src/utils/servicebus-formatters.ts`

```typescript
import { ServiceBusReceivedMessage } from '@azure/service-bus';

// Format queue list as markdown table
export function formatQueueListAsMarkdown(
  queues: QueueInfo[],
  includeSession?: boolean
): string;

// Format messages as markdown with message details
export function formatMessagesAsMarkdown(
  messages: ServiceBusReceivedMessage[],
  showBody?: boolean
): string;

// Format dead letter analysis with insights
export function formatDeadLetterAnalysisAsMarkdown(
  messages: ServiceBusReceivedMessage[]
): {
  markdown: string;
  insights: string[];
  recommendations: string[];
};

// Analyze dead letter patterns
export function analyzeDeadLetterMessages(messages: ServiceBusReceivedMessage[]): {
  insights: string[];
  recommendations: string[];
  reasonSummary: { reason: string; count: number; percentage: number }[];
  averageDeliveryCount: number;
  timespan: { first: Date; last: Date; duration: string };
};

// Format message body with syntax highlighting
export function formatMessageBody(body: any, contentType?: string): string;

// Format single message inspection
export function formatMessageInspectionAsMarkdown(
  message: ServiceBusReceivedMessage,
  isDeadLetter: boolean
): string;

// Generate troubleshooting guide combining multiple sources
export function generateServiceBusTroubleshootingGuide(data: {
  queue: QueueInfo;
  deadLetterMessages: ServiceBusReceivedMessage[];
  functionErrors?: any[];
  exceptions?: any[];
  commits?: any[];
}): string;

// Generate cross-service correlation report
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
}): string;

// Detect message format and validate JSON
export function detectMessageFormat(message: ServiceBusReceivedMessage): {
  format: 'json' | 'xml' | 'text' | 'binary' | 'unknown';
  isValid: boolean;
  error?: string;
};

// Format namespace overview
export function formatNamespaceOverviewAsMarkdown(data: {
  namespace: string;
  tier: string;
  queues: QueueInfo[];
}): string;

// Generate queue health status
export function getQueueHealthStatus(queue: QueueInfo): {
  status: 'healthy' | 'warning' | 'critical';
  icon: string;  // ✅ ⚠️ ❌
  reason: string;
};
```

---

## Documentation Requirements

### Files to Update (ALL REQUIRED)

✅ **[README.md](../README.md)**:
- Add "Azure Service Bus" to supported services list
- Update tool count (138 → 146 tools: +8 tools)
- Update prompt count (28 → 33 prompts: +5 prompts)
- Add Service Bus configuration example to main config block
- Add to features list
- Update package description

✅ **[SETUP.md](../SETUP.md)**:
- Add "Azure Service Bus Setup" section
- Document Entra ID setup (service principal, role assignments for BOTH roles)
- Document connection string setup (SAS policy creation with Listen permission)
- Add environment variable reference (including all optional configs)
- Add troubleshooting section (permissions, sessions, limits)
- Include complete configuration example (multi-namespace + single-namespace)
- Document sanitization configuration and use cases

✅ **[TOOLS.md](../TOOLS.md)**:
- Document all 8 new tools with parameters, examples, and permission requirements
- Document all 5 new prompts with output formats and cross-service correlation
- Update tool count (138 → 146)
- Update prompt count (28 → 33)
- Update table of contents
- Include limit warnings and configuration options

✅ **[USAGE.md](../USAGE.md)**:
- Add "Service Bus Troubleshooting" section
- Include practical workflows (DLQ investigation, message inspection, cross-service correlation)
- Show cross-service correlation examples (SB + App Insights + Log Analytics + GitHub)
- Add common use cases with complete examples
- Document sanitization use cases (DEV vs PROD)
- Add session-enabled queue examples

✅ **[CLAUDE.md](../CLAUDE.md)** (this file):
- Add "Azure Service Bus Integration" architecture section
- Document service design patterns (two client types, caching, retry logic)
- Document security considerations (RBAC, sanitization, read-only guarantees)
- Update tool/prompt counts in overview (138 → 146 tools, 28 → 33 prompts)
- Document session handling and format validation

---

## Testing Strategy

### Unit Tests

**File**: `src/__tests__/ServiceBusService.test.ts`

```typescript
describe('ServiceBusService', () => {
  describe('Client Management', () => {
    test('should create separate ServiceBusClient and ServiceBusAdministrationClient', async () => {
      // Verify two client types are maintained
    });

    test('should cache clients per resource', async () => {
      // Verify clients are reused
    });
  });

  describe('Connection Testing', () => {
    test('should test connection and verify permissions', async () => {
      // Test both message and management permissions
    });
  });

  describe('Queue Operations', () => {
    test('should list queues in namespace', async () => {
      // Mock ServiceBusAdministrationClient
      // Test queue listing with caching
    });

    test('should cache queue list for configured TTL', async () => {
      // Verify cache behavior
    });

    test('should detect session-enabled queues', async () => {
      // Test requiresSession flag
    });
  });

  describe('Message Operations', () => {
    test('should peek messages without removing them', async () => {
      // Verify peekMessages() is used (read-only)
    });

    test('should enforce max peek limit', async () => {
      // Test limit enforcement and warnings
    });

    test('should peek dead letter messages', async () => {
      // Test dead letter queue access
    });

    test('should handle session-enabled queues', async () => {
      // Test sessionId parameter
    });
  });

  describe('Search Operations', () => {
    test('should search messages by correlation ID', async () => {
      // Test message filtering
    });

    test('should enforce search limit with warning', async () => {
      // Test search limit and limitReached flag
    });

    test('should search by application properties', async () => {
      // Test property-based filtering
    });
  });

  describe('Sanitization', () => {
    test('should NOT sanitize by default', async () => {
      // Verify sanitization is OFF by default
    });

    test('should sanitize sensitive data when enabled', async () => {
      // Test sanitization with SERVICEBUS_SANITIZE_MESSAGES=true
    });

    test('should preserve business data while sanitizing credentials', async () => {
      // Test selective sanitization
    });
  });

  describe('Format Validation', () => {
    test('should accept JSON messages', async () => {
      // Test JSON format validation
    });

    test('should throw helpful error for non-JSON messages', async () => {
      // Test error message for XML, binary, etc.
    });
  });

  describe('Error Handling', () => {
    test('should handle authentication errors gracefully', async () => {
      // Test 401/403 error handling
    });

    test('should provide helpful error for missing queue', async () => {
      // Test 404 error handling
    });

    test('should handle session-required error', async () => {
      // Test session error handling
    });

    test('should retry transient errors', async () => {
      // Test retry logic for 503, timeouts
    });
  });

  describe('Configuration', () => {
    test('should require connection string per resource', async () => {
      // Test no global connection string
    });

    test('should validate Entra ID credentials', async () => {
      // Test Entra ID auth configuration
    });
  });
});
```

### Integration Tests

**File**: `src/__tests__/integration/servicebus.integration.test.ts`

**Note**: Integration tests will be implemented after core functionality is complete. Tests require a development Service Bus namespace with test queues.

```typescript
describe('Service Bus Integration Tests', () => {
  // These tests require:
  // - Development Service Bus namespace
  // - Test queues with sample messages
  // - SERVICEBUS_* environment variables

  test('should connect to real Service Bus namespace', async () => {
    // Test connection with real credentials
  });

  test('should list queues from real namespace', async () => {
    // Test against development namespace
  });

  test('should peek messages from real queue', async () => {
    // Test message peeking (non-destructive)
  });

  test('should handle dead letter queue access', async () => {
    // Test DLQ operations
  });

  test('should handle session-enabled queues', async () => {
    // Test session operations
  });
});
```

### Manual Testing Checklist

- [ ] List namespaces shows all configured resources
- [ ] Test connection verifies both permissions
- [ ] List queues returns queues with accurate counts and session info
- [ ] Peek messages returns messages without removing
- [ ] Peek limit warning is shown when exceeded
- [ ] Peek dead letter messages includes failure reasons
- [ ] Search messages filters correctly and shows limit warnings
- [ ] Queue properties returns accurate metrics and session info
- [ ] Namespace properties returns tier info
- [ ] Prompts generate readable markdown reports
- [ ] Cross-service correlation works (SB + App Insights + Log Analytics + GitHub)
- [ ] Authentication works with Entra ID (both roles)
- [ ] Authentication works with per-resource connection strings
- [ ] Sanitization disabled by default
- [ ] Sanitization works when enabled
- [ ] Session-enabled queues are handled correctly
- [ ] Non-JSON messages throw helpful errors
- [ ] Error handling provides clear messages
- [ ] Audit logging captures all operations
- [ ] Cache reduces redundant API calls
- [ ] Retry logic handles transient failures

---

## Implementation Checklist

### Phase 1: Core Service (Week 1)

- [ ] Install dependencies (`@azure/service-bus@^7.9.5`)
- [ ] Create `ServiceBusService.ts` with core methods
- [ ] Implement dual client management (ServiceBusClient + ServiceBusAdministrationClient)
- [ ] Implement Entra ID authentication (ClientSecretCredential)
- [ ] Implement per-resource connection string authentication
- [ ] Add configuration parsing in `index.ts` (remove shared credentials pattern)
- [ ] Implement lazy initialization pattern
- [ ] Add audit logging for all operations
- [ ] Implement queue list caching with configurable TTL
- [ ] Implement retry logic for transient failures
- [ ] Add session-enabled queue support
- [ ] Add format validation (JSON only)
- [ ] Implement optional sanitization (OFF by default)

### Phase 2: Tools (Week 1-2)

- [ ] Implement `servicebus-list-namespaces` tool
- [ ] Implement `servicebus-test-connection` tool
- [ ] Implement `servicebus-list-queues` tool (with caching)
- [ ] Implement `servicebus-peek-messages` tool (with limits)
- [ ] Implement `servicebus-peek-deadletter` tool
- [ ] Implement `servicebus-get-queue-properties` tool (with session info)
- [ ] Implement `servicebus-search-messages` tool (with limit warnings)
- [ ] Implement `servicebus-get-namespace-properties` tool
- [ ] Add Zod schemas for parameter validation
- [ ] Register all tools in MCP server
- [ ] Add comprehensive error handling with helpful messages

### Phase 3: Prompts (Week 2)

- [ ] Create `servicebus-formatters.ts` utility
- [ ] Implement `servicebus-namespace-overview` prompt
- [ ] Implement `servicebus-queue-health` prompt
- [ ] Implement `servicebus-deadletter-analysis` prompt
- [ ] Implement `servicebus-message-inspection` prompt
- [ ] Implement `servicebus-cross-service-troubleshooting` prompt
- [ ] Register all prompts in MCP server
- [ ] Add cross-service correlation logic

### Phase 4: Documentation (Week 2)

- [ ] Update README.md (overview, config, tool count: 138→146, prompt count: 28→33)
- [ ] Update SETUP.md (Azure setup, RBAC for both roles, credentials, troubleshooting, sanitization)
- [ ] Update TOOLS.md (document all 8 tools + 5 prompts, limits, permissions)
- [ ] Update USAGE.md (workflows, examples, use cases, cross-service correlation, sanitization)
- [ ] Update CLAUDE.md (architecture, security, patterns, dual client design)
- [ ] Update .env.example (all Service Bus variables including optional configs)
- [ ] Create examples in docs/examples/ (cross-service troubleshooting)

### Phase 5: Testing (Week 2-3)

- [ ] Write unit tests for ServiceBusService (dual clients, caching, retry, sanitization)
- [ ] Write unit tests for formatters
- [ ] Manual testing against development environment
- [ ] Test cross-service correlation scenarios
- [ ] Test error handling and edge cases
- [ ] Test with Entra ID authentication (both roles)
- [ ] Test with per-resource connection strings
- [ ] Test session-enabled queues
- [ ] Test sanitization (ON and OFF)
- [ ] Test format validation (JSON only)
- [ ] Test limits and warnings
- [ ] Verify read-only guarantees (peekMessages only)

### Phase 6: Release (Week 3)

- [ ] Update package.json (version 10.0.0, dependencies)
- [ ] Update .env.example with all Service Bus variables
- [ ] Create release notes (highlight: read-only, cross-service troubleshooting, sanitization)
- [ ] Build and publish to npm
- [ ] Tag release in Git (release/10.0)
- [ ] Merge to main branch
- [ ] Update CHANGELOG.md

---

## Dependencies & Compatibility

**npm packages**:
```json
{
  "@azure/service-bus": "^7.9.5",        // NEW - Service Bus SDK
  "@azure/identity": "^4.0.0",           // Already installed
  "@azure/msal-node": "^2.14.0",         // Already installed
  "zod": "^3.24.1"                        // Already installed
}
```

**Minimum Node.js version**: 18.x (for Azure SDK compatibility)

**Azure Services Required**:
- Azure Service Bus namespace (Standard tier)
- Azure AD app registration (for Entra ID auth)
- RBAC role assignments:
  - "Azure Service Bus Data Receiver" (for message operations)
  - "Reader" or "Monitoring Reader" (for management operations)

**Optional Azure Services** (for cross-service troubleshooting):
- Application Insights (correlation via correlation IDs)
- Log Analytics Workspace (Azure Functions logs)
- GitHub Enterprise Cloud (code change correlation)

---

## Known Limitations (v10.0)

### Message Format Support
- ✅ JSON messages fully supported
- ❌ XML messages not supported (throws helpful error)
- ❌ Binary messages not supported (throws helpful error)
- ❌ Plain text messages not supported (throws helpful error)

**Workaround**: Use Azure Portal or Service Bus Explorer for non-JSON messages in v10.0

### Tier Support
- ✅ Standard tier (256 KB messages) fully supported
- ⚠️ Premium tier (1 MB messages) works but tier detection not implemented
- Large messages (>256 KB) will work but may not have size warnings

### Topic/Subscription Support
- ❌ Topics not supported in v10.0 (only queues)
- ❌ Subscriptions not supported in v10.0

**Future Enhancement**: v10.1 can add topic/subscription support if needed

### Session Operations
- ✅ Session-enabled queues supported with `sessionId` parameter
- ❌ Cannot list available sessions
- ❌ Cannot peek all messages across all sessions

**Workaround**: Provide known `sessionId` or work with queue owner

### Message Operations
- ✅ Peek messages (read-only)
- ❌ Cannot send messages
- ❌ Cannot resubmit dead letter messages (no write operations)
- ❌ Cannot complete/abandon messages

**Design Decision**: Read-only by design for safety

### Performance
- ⚠️ Search operations load messages into memory (slow for large queues)
- ⚠️ Limited to 500 messages per search (configurable)
- ⚠️ Queue list cached for 5 minutes (may be stale)

---

## Summary

This implementation plan provides a comprehensive roadmap for adding Azure Service Bus integration to the MCP server. The integration follows established patterns from Log Analytics and Application Insights, providing read-only access to queues and dead letter queues with comprehensive troubleshooting capabilities.

**Key Features**:
- ✅ Read-only by design (peekMessages only, no risk of message loss)
- ✅ Multi-namespace support with active/inactive toggles
- ✅ Dual RBAC roles (Data Receiver + Reader for full functionality)
- ✅ Entra ID authentication with per-resource connection string fallback
- ✅ Cross-service correlation (SB + App Insights + Log Analytics + GitHub)
- ✅ Comprehensive dead letter queue investigation
- ✅ AI-assisted troubleshooting prompts with cross-service correlation
- ✅ Session-enabled queue support
- ✅ Optional message sanitization (OFF by default, configurable for PROD)
- ✅ JSON format validation with helpful errors
- ✅ Configurable limits and warnings
- ✅ Queue list caching and retry logic
- ✅ Follows established MCP server patterns

**Updated After Critical Review**:
- ✅ Fixed ServiceBusAdministrationClient architecture (separate client)
- ✅ Clarified RBAC permissions (two roles required)
- ✅ Added test connection tool
- ✅ Enforced peekMessages() only (read-only guarantee)
- ✅ Added search limits with user warnings
- ✅ Clarified sanitization (OFF by default, configurable)
- ✅ Removed global connection string (per-resource only)
- ✅ Standard tier only (256KB limit)
- ✅ JSON only with helpful errors
- ✅ Removed shared credentials pattern
- ✅ Added session-enabled queue support
- ✅ Added configurable timeouts and retry logic
- ✅ Added namespace properties tool
- ✅ Added cross-service troubleshooting prompt

**Estimated Timeline**: 3 weeks (including documentation and testing)

**Target Release**: 10.0.0

**Total Tools Added**: 8 (138 → 146)
**Total Prompts Added**: 5 (28 → 33)
