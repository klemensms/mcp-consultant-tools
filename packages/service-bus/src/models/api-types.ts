/**
 * Service Bus types and configuration interfaces
 */
import type { ServiceBusReceivedMessage } from '@azure/service-bus';

/**
 * Service Bus namespace resource configuration
 */
export interface ServiceBusResource {
  id: string;
  name: string;
  namespace: string;
  active: boolean;
  connectionString?: string;
  description?: string;
}

/**
 * Service Bus service configuration
 */
export interface ServiceBusConfig {
  resources: ServiceBusResource[];
  authMethod: 'entra-id' | 'connection-string';
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  sanitizeMessages?: boolean;
  peekTimeout?: number;
  retryMaxAttempts?: number;
  retryDelay?: number;
  maxSearchMessages?: number;
  maxPeekMessages?: number;
  cacheQueueListTTL?: number;
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
