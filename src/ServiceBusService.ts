/**
 * Azure Service Bus Integration
 *
 * Provides read-only access to Azure Service Bus queues and dead letter queues.
 * Supports Entra ID authentication and per-resource connection strings.
 *
 * CRITICAL DESIGN: Uses TWO separate client types:
 * - ServiceBusClient: For message operations (peek)
 * - ServiceBusAdministrationClient: For management operations (list queues, get properties)
 *
 * Read-only by design: Uses peekMessages() only, NEVER receiveMessages()
 */

import {
  ServiceBusClient,
  ServiceBusAdministrationClient,
  ServiceBusReceiver,
  ServiceBusReceivedMessage,
  QueueProperties,
  QueueRuntimeProperties,
} from '@azure/service-bus';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { ClientSecretCredential } from '@azure/identity';
import { auditLogger } from './utils/audit-logger.js';

// ============================================================================
// Interfaces and Types
// ============================================================================

/**
 * Service Bus namespace resource configuration
 */
export interface ServiceBusResource {
  id: string;                      // User-friendly ID (e.g., "prod-sb")
  name: string;                    // Display name (e.g., "Production Service Bus")
  namespace: string;               // Namespace FQDN (e.g., "mycompany.servicebus.windows.net")
  active: boolean;                 // Enable/disable toggle
  connectionString?: string;       // Optional: per-resource connection string
  description?: string;            // Optional: description
}

/**
 * Service Bus service configuration
 */
export interface ServiceBusConfig {
  resources: ServiceBusResource[];
  authMethod: 'entra-id' | 'connection-string';
  tenantId?: string;               // For Entra ID auth
  clientId?: string;               // For Entra ID auth
  clientSecret?: string;           // For Entra ID auth
  sanitizeMessages?: boolean;      // Default: false (OFF)
  peekTimeout?: number;            // Default: 30000ms
  retryMaxAttempts?: number;       // Default: 3
  retryDelay?: number;             // Default: 1000ms
  maxSearchMessages?: number;      // Default: 500
  maxPeekMessages?: number;        // Default: 100
  cacheQueueListTTL?: number;      // Default: 300s (5 minutes)
}

/**
 * Queue information
 */
export interface QueueInfo {
  name: string;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  scheduledMessageCount: number;
  sizeInBytes: number | undefined;
  totalMessageCount: number | undefined;
  requiresSession: boolean;
}

/**
 * Search result
 */
export interface SearchResult {
  messages: ServiceBusReceivedMessage[];
  totalPeeked: number;
  matchCount: number;
  limitReached: boolean;
}

/**
 * Search criteria
 */
export interface SearchCriteria {
  bodyContains?: string;
  propertyKey?: string;
  propertyValue?: any;
  correlationId?: string;
  messageId?: string;
  sessionId?: string;
}

// ============================================================================
// ServiceBusService Class
// ============================================================================

export class ServiceBusService {
  private config: ServiceBusConfig;

  // CRITICAL: Two separate client types
  private clients: Map<string, ServiceBusClient> = new Map();
  private adminClients: Map<string, ServiceBusAdministrationClient> = new Map();

  // Token caching for Entra ID
  private msalClient: ConfidentialClientApplication | null = null;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  // Cache for queue lists (reduces management API calls)
  private queueListCache: Map<string, { data: QueueInfo[]; expires: number }> = new Map();

  constructor(config: ServiceBusConfig) {
    // Apply defaults
    this.config = {
      sanitizeMessages: false,  // Default: OFF
      peekTimeout: 30000,
      retryMaxAttempts: 3,
      retryDelay: 1000,
      maxSearchMessages: 500,
      maxPeekMessages: 100,
      cacheQueueListTTL: 300,
      ...config,
    };

    // Initialize MSAL client if using Entra ID
    if (this.config.authMethod === 'entra-id') {
      if (!this.config.tenantId || !this.config.clientId || !this.config.clientSecret) {
        throw new Error(
          'Entra ID authentication requires tenantId, clientId, and clientSecret'
        );
      }

      this.msalClient = new ConfidentialClientApplication({
        auth: {
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
          authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
        },
      });
    }
  }

  // ==========================================================================
  // Authentication Methods
  // ==========================================================================

  /**
   * Get ServiceBusClient for message operations (peek)
   * CRITICAL: This is for message operations ONLY
   */
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

  /**
   * Get ServiceBusAdministrationClient for management operations (list queues, properties)
   * CRITICAL: This is for management operations ONLY
   */
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

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Test connection to Service Bus namespace
   * Verifies both message operations and management operations permissions
   */
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
        await queuesIterator.next(); // Try to get first queue
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
            break; // Just get first queue
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
        componentType: 'Namespace',
        componentName: resource.namespace,
        parameters: { resourceId: resource.id },
        success: true,
        executionTimeMs: timer(),
      });

      return {
        connected: canListQueues || canPeekMessages,
        namespace: resource.namespace,
        canPeekMessages,
        canListQueues,
        authMethod: this.config.authMethod,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'test-connection',
        operationType: 'READ',
        componentType: 'Namespace',
        componentName: resource.namespace,
        parameters: { resourceId: resource.id },
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      return {
        connected: false,
        namespace: resource.namespace,
        canPeekMessages: false,
        canListQueues: false,
        authMethod: this.config.authMethod,
        error: error.message,
      };
    }
  }

  /**
   * List all queues in a namespace (with caching)
   */
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
          requiresSession: queue.requiresSession || false,
        });
      }

      // Cache the result
      this.queueListCache.set(cacheKey, {
        data: queues,
        expires: Date.now() + this.config.cacheQueueListTTL! * 1000,
      });

      auditLogger.log({
        operation: 'list-queues',
        operationType: 'READ',
        componentType: 'Namespace',
        componentName: resource.namespace,
        parameters: {
          resourceId: resource.id,
          queueCount: queues.length
        },
        success: true,
        executionTimeMs: timer(),
      });

      return queues;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-queues',
        operationType: 'READ',
        parameters: { resourceId: resource.id },
        componentType: 'Namespace',
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      // Add helpful error message if permissions issue
      if (
        error.code === 'UnauthorizedAccessException' ||
        error.statusCode === 401 ||
        error.statusCode === 403
      ) {
        throw new Error(
          `Unauthorized to list queues in namespace '${resource.namespace}'. ` +
            `Requires 'Reader' or 'Monitoring Reader' role on the Service Bus namespace. ` +
            `Original error: ${error.message}`
        );
      }

      throw error;
    }
  }

  /**
   * Peek messages from queue (non-destructive, read-only)
   * CRITICAL: Uses peekMessages() which NEVER removes messages from queue
   */
  async peekMessages(
    resourceId: string,
    queueName: string,
    maxMessages: number = 10,
    sessionId?: string // For session-enabled queues
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
          ? messages.map((msg) => this.sanitizeMessage(msg))
          : messages;

        auditLogger.log({
          operation: 'peek-messages',
          operationType: 'READ',
          componentType: 'Queue',
          componentName: queueName,
          parameters: {
            resourceId: resource.id,
            messageCount: messages.length,
            requested: maxMessages,
            limit,
            sessionId: sessionId || 'none',
          },
          success: true,
          executionTimeMs: timer(),
        });

        return processedMessages;
      } finally {
        await receiver.close();
      }
    } catch (error: any) {
      auditLogger.log({
        operation: 'peek-messages',
        operationType: 'READ',
        parameters: { resourceId: resource.id },
        componentType: 'Queue',
        componentName: queueName,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      // Add helpful error messages
      if (error.code === 'MessagingEntityNotFound' || error.message?.includes('SubCode=40400')) {
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

  /**
   * Peek dead letter messages
   */
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

      // For dead letter queue, always use the DLQ path, not subQueueType
      const dlqPath = `${queueName}/$DeadLetterQueue`;

      let receiver: ServiceBusReceiver;
      if (sessionId) {
        // Session-enabled DLQ with specific session
        receiver = await client.acceptSession(dlqPath, sessionId);
      } else {
        // Regular DLQ (non-session)
        receiver = client.createReceiver(dlqPath);
      }

      try {
        const messages = await receiver.peekMessages(limit);

        // Sanitize if configured
        const processedMessages = this.config.sanitizeMessages
          ? messages.map((msg) => this.sanitizeMessage(msg))
          : messages;

        auditLogger.log({
          operation: 'peek-deadletter',
          operationType: 'READ',
          componentType: 'DeadLetterQueue',
          componentName: queueName,
          parameters: {
            resourceId: resource.id,
            messageCount: messages.length,
            requested: maxMessages,
            limit,
            sessionId: sessionId || 'none',
          },
          success: true,
          executionTimeMs: timer(),
        });

        return processedMessages;
      } finally {
        await receiver.close();
      }
    } catch (error: any) {
      auditLogger.log({
        operation: 'peek-deadletter',
        operationType: 'READ',
        parameters: { resourceId: resource.id },
        componentType: 'DeadLetterQueue',
        componentName: queueName,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw error;
    }
  }

  /**
   * Get queue configuration properties (lock duration, max delivery count, etc.)
   */
  async getQueueConfigProperties(
    resourceId: string,
    queueName: string
  ): Promise<QueueProperties> {
    const adminClient = this.getAdminClient(resourceId);
    return await adminClient.getQueue(queueName);
  }

  /**
   * Get queue information including both runtime metrics and configuration
   */
  async getQueueProperties(
    resourceId: string,
    queueName: string
  ): Promise<QueueInfo> {
    const timer = auditLogger.startTimer();
    const resource = this.getResourceById(resourceId);

    try {
      const adminClient = this.getAdminClient(resourceId);

      // Get runtime properties (message counts, size)
      const runtimeProps = await adminClient.getQueueRuntimeProperties(queueName);

      // Get configuration properties (requiresSession, etc.)
      const configProps = await adminClient.getQueue(queueName);

      auditLogger.log({
        operation: 'get-queue-properties',
        operationType: 'READ',
        parameters: { resourceId: resource.id },
        componentType: 'Queue',
        componentName: queueName,
        success: true,
        executionTimeMs: timer(),
      });

      // Combine runtime and configuration into QueueInfo
      return {
        name: runtimeProps.name,
        activeMessageCount: runtimeProps.activeMessageCount,
        deadLetterMessageCount: runtimeProps.deadLetterMessageCount,
        scheduledMessageCount: runtimeProps.scheduledMessageCount,
        sizeInBytes: runtimeProps.sizeInBytes,
        totalMessageCount: runtimeProps.totalMessageCount,
        requiresSession: configProps.requiresSession || false,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-queue-properties',
        operationType: 'READ',
        parameters: { resourceId: resource.id },
        componentType: 'Queue',
        componentName: queueName,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });

      throw error;
    }
  }

  /**
   * Search messages by content/properties
   * WARNING: Peeks messages into memory, then filters client-side
   */
  async searchMessages(
    resourceId: string,
    queueName: string,
    searchCriteria: SearchCriteria,
    maxMessages: number = 50
  ): Promise<SearchResult> {
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

      const filtered = messages.filter((msg) => {
        // Filter by body content
        if (searchCriteria.bodyContains) {
          try {
            const body = JSON.stringify(msg.body).toLowerCase();
            if (!body.includes(searchCriteria.bodyContains.toLowerCase())) {
              return false;
            }
          } catch {
            return false; // Skip non-JSON messages
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
        componentType: 'Queue',
        componentName: queueName,
        success: true,
        parameters: {
          resourceId,
          totalPeeked: messages.length,
          matchCount: filtered.length,
          limitReached,
        },
        executionTimeMs: timer(),
      });

      return {
        messages: filtered,
        totalPeeked: messages.length,
        matchCount: filtered.length,
        limitReached,
      };
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-messages',
        operationType: 'READ',
        componentType: 'Queue',
        componentName: queueName,
        success: false,
        error: error.message,
        parameters: { resourceId },
        executionTimeMs: timer(),
      });

      throw error;
    }
  }

  /**
   * Get namespace properties (tier, quotas)
   * Note: v10.0 assumes Standard tier (256 KB)
   */
  async getNamespaceProperties(resourceId: string): Promise<{
    namespace: string;
    tier: string; // "Standard" or "Premium"
    maxMessageSizeKB: number;
  }> {
    const resource = this.getResourceById(resourceId);

    // Standard tier: 256 KB, Premium tier: 1 MB
    // For v10.0, we assume Standard tier
    return {
      namespace: resource.namespace,
      tier: 'Standard', // TODO: Detect from namespace properties in future version
      maxMessageSizeKB: 256,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get all configured resources
   */
  getAllResources(): ServiceBusResource[] {
    return this.config.resources;
  }

  /**
   * Get active resources only
   */
  getActiveResources(): ServiceBusResource[] {
    return this.config.resources.filter((r) => r.active);
  }

  /**
   * Get resource by ID (with validation)
   */
  public getResourceById(resourceId: string): ServiceBusResource {
    const resource = this.config.resources.find((r) => r.id === resourceId);

    if (!resource) {
      const available = this.config.resources.map((r) => r.id).join(', ');
      throw new Error(
        `Service Bus resource '${resourceId}' not found. ` +
          `Available resources: ${available || 'none'}`
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

  /**
   * Sanitize sensitive data from message (if enabled)
   */
  private sanitizeMessage(message: ServiceBusReceivedMessage): ServiceBusReceivedMessage {
    const sanitized = { ...message };

    if (sanitized.body && typeof sanitized.body === 'object') {
      sanitized.body = this.sanitizeObject(sanitized.body);
    }

    return sanitized;
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    const sensitiveFields = [
      'password',
      'pwd',
      'passwd',
      'token',
      'accesstoken',
      'apitoken',
      'apikey',
      'api_key',
      'key',
      'secret',
      'clientsecret',
      'client_secret',
      'connectionstring',
      'connection_string',
      'connstr',
      'authorization',
      'auth',
    ];

    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase().replace(/[_-]/g, '');

      if (sensitiveFields.includes(keyLower)) {
        sanitized[key] = '***'; // Redact sensitive fields
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value); // Recurse
      } else {
        sanitized[key] = value; // Preserve
      }
    }

    return sanitized;
  }

  /**
   * Cleanup
   */
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
}
