/**
 * ServiceEndpointService
 *
 * Service for CRUD operations on service endpoints (webhooks, Service Bus, Event Hub, etc.).
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { auditLogger } from '../utils/auditLogger.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateServiceEndpointOptions {
  name: string;
  url: string;
  contract: 'Webhook' | 'Queue' | 'Topic' | 'EventHub' | 'EventGrid' | 'REST' | 'OneWay' | 'TwoWay';
  authType: 'Anonymous' | 'HttpHeader' | 'HttpQueryString' | 'WebKey' | 'SASKey' | 'AzureKey' | 'Certificate';
  authValue?: string;
  description?: string;
  messageFormat?: 'Json' | 'BinaryXML' | 'TextXML';
  /** Service Bus queue/topic path */
  path?: string;
  /** Service Bus SAS key name */
  saskeyname?: string;
  /** Service Bus SAS key value */
  saskey?: string;
  solutionUniqueName?: string;
}

export interface UpdateServiceEndpointOptions {
  serviceEndpointId: string;
  name?: string;
  url?: string;
  authType?: 'Anonymous' | 'HttpHeader' | 'HttpQueryString' | 'WebKey' | 'SASKey' | 'AzureKey' | 'Certificate';
  authValue?: string;
  description?: string;
  messageFormat?: 'Json' | 'BinaryXML' | 'TextXML';
  /** Service Bus queue/topic path */
  path?: string;
  /** Service Bus namespace URI (sb://) */
  namespaceAddress?: string;
  /** Service Bus SAS key value (sensitive) */
  sasKey?: string;
  /** Service Bus SAS key name */
  saskeyname?: string;
  solutionUniqueName?: string;
}

export interface ServiceEndpointCreateResult {
  serviceEndpointId: string;
  name: string;
  url: string;
  contractType: string;
  authType: string;
}

export interface RegisterWebhookOptions {
  name: string;
  url: string;
  authType: 'Anonymous' | 'HttpHeader' | 'HttpQueryString' | 'WebKey';
  authValue?: string;
  entityName: string;
  messageName: string;
  stage?: number; // 40 = PostOperation (default)
  executionMode?: number; // 1 = Async (default)
  filteringAttributes?: string;
  description?: string;
  solutionUniqueName?: string;
}

export interface RegisterWebhookResult {
  serviceEndpointId: string;
  stepId: string;
  endpointName: string;
  endpointUrl: string;
  messageName: string;
  entityName: string;
  stage: number;
  executionMode: number;
}

// ============================================================================
// Enum mappings (label → Dataverse integer value)
// ============================================================================

const CONTRACT_TYPE_VALUES: Record<string, number> = {
  OneWay: 1,
  TwoWay: 4,
  Queue: 2,
  REST: 3,
  Topic: 5,
  EventHub: 7,
  Webhook: 8,
  EventGrid: 9,
};

const AUTH_TYPE_VALUES: Record<string, number> = {
  Anonymous: 1,
  HttpHeader: 2,
  HttpQueryString: 3,
  WebKey: 4,
  SASKey: 5,
  AzureKey: 6,
  Certificate: 7,
};

const MESSAGE_FORMAT_VALUES: Record<string, number> = {
  BinaryXML: 1,
  Json: 2,
  TextXML: 3,
};

// ============================================================================
// Service
// ============================================================================

export class ServiceEndpointService {
  constructor(
    private client: PowerPlatformClient,
    private addComponentToSolution?: (
      solutionUniqueName: string,
      componentId: string,
      componentType: number
    ) => Promise<void>,
    private resolveSdkMessageAndFilter?: (
      messageName: string,
      entityName: string
    ) => Promise<{ messageId: string; filterId: string }>
  ) {}

  /**
   * Create a new service endpoint
   */
  async createServiceEndpoint(
    options: CreateServiceEndpointOptions
  ): Promise<ServiceEndpointCreateResult> {
    const timer = auditLogger.startTimer();

    try {
      // Validation
      if (options.contract === 'Webhook' && options.url && !options.url.startsWith('https://')) {
        throw new Error('Webhook endpoints must use HTTPS');
      }

      if (options.authType !== 'Anonymous' && !options.authValue) {
        throw new Error(`authValue is required when authType is '${options.authType}'`);
      }

      if ((options.contract === 'Queue' || options.contract === 'Topic') && !options.path) {
        throw new Error(`path is required for ${options.contract} contract type`);
      }

      const endpointData: Record<string, unknown> = {
        name: options.name,
        url: options.url,
        contract: CONTRACT_TYPE_VALUES[options.contract],
        authtype: AUTH_TYPE_VALUES[options.authType],
        connectionmode: 1, // Normal
      };

      if (options.authValue) {
        endpointData.authvalue = options.authValue;
      }

      if (options.description) {
        endpointData.description = options.description;
      }

      if (options.messageFormat) {
        endpointData.messageformat = MESSAGE_FORMAT_VALUES[options.messageFormat];
      }

      if (options.path) {
        endpointData.path = options.path;
      }

      if (options.saskeyname) {
        endpointData.saskeyname = options.saskeyname;
      }

      if (options.saskey) {
        endpointData.saskey = options.saskey;
      }

      // For Service Bus contracts, auto-set namespaceaddress to keep in sync with url
      if (['Queue', 'Topic', 'EventHub'].includes(options.contract)) {
        endpointData.namespaceaddress = options.url;
      }

      const response = await this.client.makeRequest<Record<string, unknown>>(
        'api/data/v9.2/serviceendpoints',
        'POST',
        endpointData,
        { Prefer: 'return=representation' }
      );

      const serviceEndpointId =
        (response.serviceendpointid as string) || (response.id as string);

      if (!serviceEndpointId) {
        throw new Error('Service endpoint created but ID not returned');
      }

      // Add to solution if specified (component type 95 = ServiceEndpoint)
      if (options.solutionUniqueName && this.addComponentToSolution) {
        await this.addComponentToSolution(options.solutionUniqueName, serviceEndpointId, 95);
      }

      auditLogger.log({
        operation: 'create-service-endpoint',
        operationType: 'CREATE',
        componentId: serviceEndpointId,
        componentType: 'ServiceEndpoint',
        success: true,
        parameters: {
          name: options.name,
          url: options.url,
          contract: options.contract,
          authType: options.authType,
          authValue: options.authValue ? '***' : undefined,
          saskey: options.saskey ? '***' : undefined,
        },
        executionTimeMs: timer(),
      });

      return {
        serviceEndpointId,
        name: options.name,
        url: options.url,
        contractType: options.contract,
        authType: options.authType,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'create-service-endpoint',
        operationType: 'CREATE',
        componentName: options.name,
        componentType: 'ServiceEndpoint',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Update an existing service endpoint
   */
  async updateServiceEndpoint(options: UpdateServiceEndpointOptions): Promise<void> {
    const timer = auditLogger.startTimer();

    try {
      const updates: Record<string, unknown> = {};

      if (options.name !== undefined) updates.name = options.name;
      if (options.url !== undefined) updates.url = options.url;
      if (options.authType !== undefined) updates.authtype = AUTH_TYPE_VALUES[options.authType];
      if (options.authValue !== undefined) updates.authvalue = options.authValue;
      if (options.description !== undefined) updates.description = options.description;
      if (options.messageFormat !== undefined) updates.messageformat = MESSAGE_FORMAT_VALUES[options.messageFormat];
      if (options.path !== undefined) updates.path = options.path;
      if (options.namespaceAddress !== undefined) updates.namespaceaddress = options.namespaceAddress;
      if (options.sasKey !== undefined) updates.saskey = options.sasKey;
      if (options.saskeyname !== undefined) updates.saskeyname = options.saskeyname;

      if (Object.keys(updates).length === 0) {
        throw new Error('No fields to update');
      }

      await this.client.makeRequest(
        `api/data/v9.2/serviceendpoints(${options.serviceEndpointId})`,
        'PATCH',
        updates
      );

      // Add to solution if specified
      if (options.solutionUniqueName && this.addComponentToSolution) {
        await this.addComponentToSolution(options.solutionUniqueName, options.serviceEndpointId, 95);
      }

      auditLogger.log({
        operation: 'update-service-endpoint',
        operationType: 'UPDATE',
        componentId: options.serviceEndpointId,
        componentType: 'ServiceEndpoint',
        success: true,
        parameters: {
          ...updates,
          authvalue: updates.authvalue ? '***' : undefined,
          saskey: updates.saskey ? '***' : undefined,
        },
        executionTimeMs: timer(),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'update-service-endpoint',
        operationType: 'UPDATE',
        componentId: options.serviceEndpointId,
        componentType: 'ServiceEndpoint',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Delete a service endpoint
   */
  async deleteServiceEndpoint(serviceEndpointId: string): Promise<void> {
    const timer = auditLogger.startTimer();

    try {
      await this.client.makeRequest(
        `api/data/v9.2/serviceendpoints(${serviceEndpointId})`,
        'DELETE'
      );

      auditLogger.log({
        operation: 'delete-service-endpoint',
        operationType: 'DELETE',
        componentId: serviceEndpointId,
        componentType: 'ServiceEndpoint',
        success: true,
        executionTimeMs: timer(),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'delete-service-endpoint',
        operationType: 'DELETE',
        componentId: serviceEndpointId,
        componentType: 'ServiceEndpoint',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to delete service endpoint: ${errorMessage}`);
    }
  }

  /**
   * Register a webhook endpoint with an SDK message processing step (atomic orchestration).
   * Creates the service endpoint, then registers the step. Rolls back on failure.
   */
  async registerWebhook(options: RegisterWebhookOptions): Promise<RegisterWebhookResult> {
    const timer = auditLogger.startTimer();

    if (!this.resolveSdkMessageAndFilter) {
      throw new Error('resolveSdkMessageAndFilter callback is required for registerWebhook');
    }

    let serviceEndpointId: string | null = null;

    try {
      // Step 1: Create the service endpoint
      const endpoint = await this.createServiceEndpoint({
        name: options.name,
        url: options.url,
        contract: 'Webhook',
        authType: options.authType,
        authValue: options.authValue,
        description: options.description,
        messageFormat: 'Json',
        solutionUniqueName: options.solutionUniqueName,
      });

      serviceEndpointId = endpoint.serviceEndpointId;

      // Step 2: Resolve SDK message and filter
      const { messageId, filterId } = await this.resolveSdkMessageAndFilter(
        options.messageName,
        options.entityName
      );

      // Step 3: Register SDK message processing step bound to the service endpoint
      const stage = options.stage ?? 40; // PostOperation
      const executionMode = options.executionMode ?? 1; // Async

      const stepData: Record<string, unknown> = {
        name: `${options.name}: ${options.messageName} of ${options.entityName}`,
        'eventhandler_serviceendpoint@odata.bind': `/serviceendpoints(${serviceEndpointId})`,
        'sdkmessageid@odata.bind': `/sdkmessages(${messageId})`,
        'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filterId})`,
        stage,
        mode: executionMode,
        rank: 1,
        supporteddeployment: 0,
        statuscode: 1,
      };

      if (options.filteringAttributes) {
        stepData.filteringattributes = options.filteringAttributes;
      }

      const stepResponse = await this.client.makeRequest<Record<string, unknown>>(
        'api/data/v9.2/sdkmessageprocessingsteps',
        'POST',
        stepData,
        { Prefer: 'return=representation' }
      );

      const stepId =
        (stepResponse.sdkmessageprocessingstepid as string) || (stepResponse.id as string);

      if (!stepId) {
        throw new Error('SDK message processing step created but ID not returned');
      }

      // Add step to solution if specified (component type 92 = SDKMessageProcessingStep)
      if (options.solutionUniqueName && this.addComponentToSolution) {
        await this.addComponentToSolution(options.solutionUniqueName, stepId, 92);
      }

      auditLogger.log({
        operation: 'register-webhook',
        operationType: 'CREATE',
        componentId: serviceEndpointId,
        componentType: 'ServiceEndpoint',
        success: true,
        parameters: {
          name: options.name,
          url: options.url,
          authType: options.authType,
          authValue: options.authValue ? '***' : undefined,
          entityName: options.entityName,
          messageName: options.messageName,
          stage,
          executionMode,
          stepId,
        },
        executionTimeMs: timer(),
      });

      return {
        serviceEndpointId,
        stepId,
        endpointName: options.name,
        endpointUrl: options.url,
        messageName: options.messageName,
        entityName: options.entityName,
        stage,
        executionMode,
      };
    } catch (error: unknown) {
      // Rollback: delete the endpoint if step registration failed
      if (serviceEndpointId) {
        try {
          await this.deleteServiceEndpoint(serviceEndpointId);
          console.error(`Rollback: deleted service endpoint ${serviceEndpointId}`);
        } catch (rollbackError) {
          console.error(`Rollback failed: could not delete service endpoint ${serviceEndpointId}`, rollbackError);
        }
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'register-webhook',
        operationType: 'CREATE',
        componentName: options.name,
        componentType: 'ServiceEndpoint',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }
}
