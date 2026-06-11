/**
 * PowerPlatformService - Slim Data CRUD Facade
 *
 * This is a facade that delegates to services in @mcp-consultant-tools/powerplatform-core.
 * It provides DATA CRUD operations for PowerPlatform/Dataverse entities.
 *
 * For read-only operations, use @mcp-consultant-tools/powerplatform.
 * For customization operations, use @mcp-consultant-tools/powerplatform-customization.
 */

import {
  // Client and types
  PowerPlatformClient,
  type PowerPlatformConfig,
  type ApiCollectionResponse,
  type FlowRunFilterOptions,
  type FlowRunsResult,
  // Services for data operations
  DataService,
  MetadataService,
  FlowService,
  // Auth
  type AuthProvider,
  createAuthProvider,
} from '@mcp-consultant-tools/powerplatform-core';
import type {
  PiiProtectionPipeline,
  PipelineReport,
} from '@mcp-consultant-tools/core';

// Re-export types for backward compatibility
export type { PowerPlatformConfig, ApiCollectionResponse };

export class PowerPlatformService {
  private client: PowerPlatformClient;
  private data: DataService;
  private metadata: MetadataService;
  private flow: FlowService;
  private pii?: PiiProtectionPipeline;

  constructor(
    config: PowerPlatformConfig,
    authProvider?: AuthProvider,
    piiPipeline?: PiiProtectionPipeline
  ) {
    this.pii = piiPipeline;

    // Create auth provider if not provided
    const auth =
      authProvider ||
      createAuthProvider({
        organizationUrl: config.organizationUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tenantId: config.tenantId,
      });

    // Initialize client and services
    this.client = new PowerPlatformClient(config, auth);
    this.data = new DataService(this.client, piiPipeline);
    this.metadata = new MetadataService(this.client);
    this.flow = new FlowService(this.client);
  }

  // =====================================================
  // AUTH METHODS
  // =====================================================

  getAuthMode(): 'service-principal' | 'interactive' {
    return this.client.getAuthMode();
  }

  async getUserInfo(): Promise<{ name: string; email: string; oid: string } | null> {
    return this.client.getUserInfo();
  }

  async logout(): Promise<void> {
    return this.client.logout();
  }

  /** PII pipeline injected at construction. Exposed for callers (e.g. audit
   *  emit handlers) that need to redact tool inputs before recording.
   *  Returns undefined when PII protection was not configured. */
  get piiPipeline(): PiiProtectionPipeline | undefined {
    return this.pii;
  }

  // =====================================================
  // METADATA METHODS (for lookup resolution)
  // =====================================================

  async getEntityMetadata(entityName: string): Promise<unknown> {
    return this.metadata.getEntityMetadata(entityName);
  }

  async getEntityAttributes(
    entityName: string,
    options?: {
      prefix?: string;
      attributeType?: string;
      maxAttributes?: number;
    }
  ): Promise<{
    value: unknown[];
    hasMore: boolean;
    returnedCount: number;
    totalBeforeFilter?: number;
  }> {
    return this.metadata.getEntityAttributes(entityName, options);
  }

  async getEntityAttribute(entityName: string, attributeName: string): Promise<unknown> {
    return this.metadata.getEntityAttribute(entityName, attributeName);
  }

  // =====================================================
  // FLOW METHODS (FlowService)
  // =====================================================

  async getFlowRuns(flowId: string, options: FlowRunFilterOptions = {}): Promise<FlowRunsResult> {
    return this.flow.getFlowRuns(flowId, options);
  }

  async getFlowRunDetails(flowId: string, runId: string): Promise<unknown> {
    return this.flow.getFlowRunDetails(flowId, runId);
  }

  // =====================================================
  // DATA CRUD METHODS (DataService)
  // =====================================================

  async getRecord(entityNamePlural: string, recordId: string): Promise<Record<string, unknown>> {
    return this.data.getRecord(entityNamePlural, recordId);
  }

  async queryRecords(
    entityNamePlural: string,
    filter: string,
    maxRecords: number = 50,
    select?: string[]
  ): Promise<{
    value: unknown[];
    hasMore: boolean;
    returnedCount: number;
    requestedMax: number;
    piiReport?: PipelineReport;
  }> {
    return this.data.queryRecords(entityNamePlural, filter, maxRecords, select);
  }

  async createRecord(
    entityNamePlural: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.data.createRecord(entityNamePlural, data);
  }

  async updateRecord(
    entityNamePlural: string,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.data.updateRecord(entityNamePlural, recordId, data);
  }

  async deleteRecord(entityNamePlural: string, recordId: string): Promise<void> {
    return this.data.deleteRecord(entityNamePlural, recordId);
  }

  async lookupNavigationProperty(
    entityLogicalName: string,
    referencingAttribute: string,
    referencedEntity?: string
  ): Promise<string | null> {
    return this.data.lookupNavigationProperty(
      entityLogicalName,
      referencingAttribute,
      referencedEntity
    );
  }

  async associateRecords(
    entityNamePlural: string,
    recordId: string,
    navigationProperty: string,
    targetEntityNamePlural: string,
    targetRecordId: string
  ): Promise<void> {
    return this.data.associateRecords(entityNamePlural, recordId, navigationProperty, targetEntityNamePlural, targetRecordId);
  }

  async disassociateRecords(
    entityNamePlural: string,
    recordId: string,
    navigationProperty: string,
    targetRecordId: string
  ): Promise<void> {
    return this.data.disassociateRecords(entityNamePlural, recordId, navigationProperty, targetRecordId);
  }

  async executeAction(
    actionName: string,
    parameters?: Record<string, unknown>,
    boundTo?: {
      entityNamePlural: string;
      recordId: string;
    }
  ): Promise<Record<string, unknown>> {
    return this.data.executeAction(actionName, parameters, boundTo);
  }

  async countRecords(
    entityNamePlural: string,
    filter?: string
  ): Promise<number> {
    return this.data.countRecords(entityNamePlural, filter);
  }

  async countRecordsBatch(
    entities: Array<{ entityNamePlural: string; filter?: string }>
  ): Promise<Array<{ entityNamePlural: string; filter?: string; count: number; error?: string }>> {
    return this.data.countRecordsBatch(entities);
  }

  async getLookupNavigationPropertyName(
    entityLogicalName: string,
    lookupAttributeName: string,
    targetEntityLogicalName: string
  ): Promise<string | null> {
    return this.data.getLookupNavigationPropertyName(
      entityLogicalName,
      lookupAttributeName,
      targetEntityLogicalName
    );
  }
}
