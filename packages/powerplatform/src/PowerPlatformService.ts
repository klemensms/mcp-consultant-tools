/**
 * PowerPlatformService - Slim Read-Only Facade
 *
 * This is a facade that delegates to services in @mcp-consultant-tools/powerplatform-core.
 * It provides READ-ONLY access to PowerPlatform/Dataverse entities.
 *
 * For data CRUD operations, use @mcp-consultant-tools/powerplatform-data.
 * For customization operations, use @mcp-consultant-tools/powerplatform-customization.
 */

import { UNCAPPED, type TruncationInfo } from '@mcp-consultant-tools/core';
import {
  // Client and types
  PowerPlatformClient,
  type PowerPlatformConfig,
  type ApiCollectionResponse,
  type FlowFilterOptions,
  type FlowListResult,
  type FlowSummary,
  type FlowRunFilterOptions,
  type FlowRunsResult,
  type FlowHealthScanOptions,
  type FlowHealthScanResult,
  type FlowInventoryResult,
  type BestPracticesValidationResult,
  type DbmlGeneratorOptions,
  type DbmlResult,
  // Integration Audit types
  type ServiceEndpointsResult,
  type ServiceEndpointsValidatedResult,
  type EnvironmentVariablesResult,
  type WebhookRegistrationsResult,
  type FlowComplexityResult_Full,
  type IntegrationAuditReport,
  // Connection Reference types
  type ConnectionReferencesResult,
  // Security Role types
  type SecurityRolesResult,
  type SecurityRolePrivilegesResult,
  type SecurityRolesBySolutionResult,
  // Plugin types
  type PluginStepInventoryEntry,
  type PluginStepInventoryResult,
  type PluginAssembliesResult,
  // Read-only services
  MetadataService,
  PluginService,
  FlowService,
  WorkflowService,
  BusinessRuleService,
  AppService,
  ValidationService,
  DbmlGenerator,
  IntegrationAuditService,
  ConnectionReferenceService,
  SecurityRoleService,
  FieldSecurityService,
  type FieldSecurityProfileSummary,
  type FieldSecurityProfileDetail,
  type SecuredColumnInfo,
  // Additional services for read-only operations
  FormService,
  ViewService,
  WebResourceService,
  SolutionService,
  DependencyService,
  PublishingService,
  RelationshipService,
  // Auth
  type AuthProvider,
  createAuthProvider,
} from '@mcp-consultant-tools/powerplatform-core';

// Re-export types for backward compatibility
export type {
  PowerPlatformConfig,
  ApiCollectionResponse,
  FlowFilterOptions,
  FlowListResult,
  FlowSummary,
  BestPracticesValidationResult,
  DbmlGeneratorOptions,
  DbmlResult,
  // Integration Audit types
  ServiceEndpointsResult,
  ServiceEndpointsValidatedResult,
  EnvironmentVariablesResult,
  WebhookRegistrationsResult,
  FlowComplexityResult_Full,
  IntegrationAuditReport,
  // Connection Reference types
  ConnectionReferencesResult,
  // Security Role types
  SecurityRolesResult,
  SecurityRolePrivilegesResult,
  SecurityRolesBySolutionResult,
  // Field security types
  FieldSecurityProfileSummary,
  FieldSecurityProfileDetail,
  SecuredColumnInfo,
  // Plugin types
  PluginStepInventoryEntry,
  PluginStepInventoryResult,
  PluginAssembliesResult,
};

export class PowerPlatformService {
  private client: PowerPlatformClient;
  private metadata: MetadataService;
  private plugin: PluginService;
  private flow: FlowService;
  private workflow: WorkflowService;
  private businessRule: BusinessRuleService;
  private app: AppService;
  private validation: ValidationService;
  private dbmlGenerator: DbmlGenerator;
  private form: FormService;
  private view: ViewService;
  private webResource: WebResourceService;
  private solution: SolutionService;
  private dependency: DependencyService;
  private publishing: PublishingService;
  private relationship: RelationshipService;
  private integrationAudit: IntegrationAuditService;
  private connectionReference: ConnectionReferenceService;
  private securityRole: SecurityRoleService;
  private fieldSecurity: FieldSecurityService;

  constructor(config: PowerPlatformConfig, authProvider?: AuthProvider) {
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
    this.metadata = new MetadataService(this.client);
    this.plugin = new PluginService(this.client);
    this.flow = new FlowService(this.client);
    this.workflow = new WorkflowService(this.client);
    this.businessRule = new BusinessRuleService(this.client);
    this.app = new AppService(this.client);
    this.validation = new ValidationService(this.client);
    this.dbmlGenerator = new DbmlGenerator(this.client);
    this.form = new FormService(this.client);
    this.view = new ViewService(this.client);
    this.webResource = new WebResourceService(this.client);
    this.solution = new SolutionService(this.client);
    this.dependency = new DependencyService(this.client);
    this.publishing = new PublishingService(this.client);
    this.relationship = new RelationshipService(this.client);
    this.integrationAudit = new IntegrationAuditService(this.client);
    this.connectionReference = new ConnectionReferenceService(this.client);
    this.securityRole = new SecurityRoleService(this.client);
    this.fieldSecurity = new FieldSecurityService(this.client);
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

  // =====================================================
  // METADATA METHODS (MetadataService)
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

  async getEntityRelationships(entityName: string): Promise<{
    oneToMany: ApiCollectionResponse<unknown>;
    manyToMany: ApiCollectionResponse<unknown>;
  }> {
    return this.metadata.getEntityRelationships(entityName);
  }

  async getGlobalOptionSet(optionSetName: string): Promise<unknown> {
    return this.metadata.getGlobalOptionSet(optionSetName);
  }

  async getGlobalOptionSets(options?: {
    maxRecords?: number;
    prefix?: string;
  }): Promise<{
    value: unknown[];
    hasMore: boolean;
    totalCount: number;
    requestedMax: number;
    truncation: TruncationInfo;
  }> {
    return this.metadata.getGlobalOptionSets(options);
  }

  // =====================================================
  // PLUGIN METHODS (PluginService)
  // =====================================================

  async getPluginAssemblies(
    includeManaged: boolean = false,
    maxRecords: number = UNCAPPED
  ): Promise<PluginAssembliesResult> {
    return this.plugin.getPluginAssemblies(includeManaged, maxRecords);
  }

  async getPluginAssemblyComplete(
    assemblyName: string,
    includeDisabled: boolean = false
  ): Promise<{
    assembly: unknown;
    pluginTypes: unknown[];
    steps: unknown[];
    validation: {
      hasDisabledSteps: boolean;
      hasAsyncSteps: boolean;
      hasSyncSteps: boolean;
      stepsWithoutFilteringAttributes: string[];
      stepsWithoutImages: string[];
      potentialIssues: string[];
    };
  }> {
    return this.plugin.getPluginAssemblyComplete(assemblyName, includeDisabled);
  }

  async getEntityPluginPipeline(
    entityName: string,
    messageFilter?: string,
    includeDisabled: boolean = false
  ): Promise<{
    entity: string;
    messages: unknown[];
    steps: unknown[];
    executionOrder: string[];
  }> {
    return this.plugin.getEntityPluginPipeline(entityName, messageFilter, includeDisabled);
  }

  async getPluginTraceLogs(options: {
    entityName?: string;
    messageName?: string;
    correlationId?: string;
    pluginStepId?: string;
    exceptionOnly?: boolean;
    hoursBack?: number;
    maxRecords?: number;
  }): Promise<{ totalCount: number; exceptionCount: number; logs: unknown[] }> {
    return this.plugin.getPluginTraceLogs(options);
  }

  async getAllPluginSteps(options?: {
    includeDisabled?: boolean;
    maxRecords?: number;
  }): Promise<PluginStepInventoryResult> {
    return this.plugin.getAllPluginSteps(options);
  }

  // =====================================================
  // FLOW METHODS (FlowService)
  // =====================================================

  async getFlows(options: FlowFilterOptions = {}): Promise<FlowListResult> {
    return this.flow.getFlows(options);
  }

  async searchWorkflows(options?: {
    name?: string;
    primaryEntity?: string;
    description?: string;
    category?: number;
    statecode?: number;
    includeDescription?: boolean;
    maxResults?: number;
  }): Promise<{
    totalCount: number;
    hasMore: boolean;
    requestedMax: number;
    truncation: TruncationInfo;
    workflows: unknown[];
  }> {
    return this.flow.searchWorkflows(options);
  }

  async getFlowDefinition(flowId: string, summary: boolean = false): Promise<unknown> {
    return this.flow.getFlowDefinition(flowId, summary);
  }

  async getFlowRuns(
    flowId: string,
    options: FlowRunFilterOptions = {}
  ): Promise<FlowRunsResult> {
    return this.flow.getFlowRuns(flowId, options);
  }

  async getFlowRunDetails(flowId: string, runId: string): Promise<unknown> {
    return this.flow.getFlowRunDetails(flowId, runId);
  }

  async scanFlowHealth(
    options: FlowHealthScanOptions = {}
  ): Promise<FlowHealthScanResult> {
    return this.flow.scanFlowHealth(options);
  }

  async getFlowInventory(
    options: { maxRecords?: number } = {}
  ): Promise<FlowInventoryResult> {
    return this.flow.getFlowInventory(options);
  }

  // =====================================================
  // WORKFLOW METHODS (WorkflowService)
  // =====================================================

  async getWorkflows(
    activeOnly: boolean = false,
    maxRecords: number = 25
  ): Promise<{
    totalCount: number;
    hasMore: boolean;
    requestedMax: number;
    truncation: TruncationInfo;
    workflows: unknown[];
  }> {
    return this.workflow.getWorkflows(activeOnly, maxRecords);
  }

  async getWorkflowDefinition(workflowId: string, summary: boolean = false): Promise<unknown> {
    return this.workflow.getWorkflowDefinition(workflowId, summary);
  }

  // =====================================================
  // BUSINESS RULE METHODS (BusinessRuleService)
  // =====================================================

  async getBusinessRules(
    activeOnly: boolean = false,
    maxRecords: number = 100
  ): Promise<{
    totalCount: number;
    businessRules: unknown[];
  }> {
    return this.businessRule.getBusinessRules(activeOnly, maxRecords);
  }

  async getBusinessRule(workflowId: string): Promise<unknown> {
    return this.businessRule.getBusinessRule(workflowId);
  }

  // =====================================================
  // APP METHODS (AppService)
  // =====================================================

  async getApps(
    activeOnly: boolean = false,
    maxRecords: number = 100,
    includeUnpublished: boolean = true,
    solutionUniqueName?: string
  ): Promise<{
    totalCount: number;
    apps: unknown[];
    filters: {
      activeOnly: boolean;
      includeUnpublished: boolean;
      solutionUniqueName: string;
    };
  }> {
    return this.app.getApps(activeOnly, maxRecords, includeUnpublished, solutionUniqueName);
  }

  async getApp(appId: string): Promise<unknown> {
    return this.app.getApp(appId);
  }

  async getAppComponents(appId: string): Promise<{
    totalCount: number;
    components: unknown[];
    groupedByType: Record<string, unknown[]>;
  }> {
    return this.app.getAppComponents(appId);
  }

  async getAppSitemap(appId: string): Promise<unknown> {
    return this.app.getAppSitemap(appId);
  }

  // =====================================================
  // FORM METHODS (FormService) - Read-only
  // =====================================================

  async getForms(entityLogicalName: string): Promise<unknown> {
    return this.form.getForms(entityLogicalName);
  }

  // =====================================================
  // VIEW METHODS (ViewService) - Read-only
  // =====================================================

  async getViews(entityLogicalName: string): Promise<unknown> {
    return this.view.getViews(entityLogicalName);
  }

  async getViewFetchXml(viewId: string): Promise<unknown> {
    return this.view.getViewFetchXml(viewId);
  }

  // =====================================================
  // WEB RESOURCE METHODS (WebResourceService) - Read-only
  // =====================================================

  async getWebResource(webResourceId: string): Promise<unknown> {
    return this.webResource.getWebResource(webResourceId);
  }

  async getWebResources(nameFilter?: string): Promise<unknown> {
    return this.webResource.getWebResources(nameFilter);
  }

  async getWebResourceDependencies(webResourceId: string): Promise<unknown> {
    return this.webResource.getWebResourceDependencies(webResourceId);
  }

  // =====================================================
  // SOLUTION METHODS (SolutionService) - Read-only
  // =====================================================

  async getPublishers(): Promise<unknown> {
    return this.solution.getPublishers();
  }

  async getSolutions(): Promise<unknown> {
    return this.solution.getSolutions();
  }

  async getSolution(uniqueName: string): Promise<unknown> {
    return this.solution.getSolution(uniqueName);
  }

  async getSolutionComponents(solutionUniqueName: string): Promise<unknown> {
    return this.solution.getSolutionComponents(solutionUniqueName);
  }

  // =====================================================
  // DEPENDENCY METHODS (DependencyService) - Read-only
  // =====================================================

  async checkDependencies(
    componentId: string,
    componentType: number
  ): Promise<unknown> {
    return this.dependency.checkDependencies(componentId, componentType);
  }

  async checkDeleteEligibility(
    componentId: string,
    componentType: number
  ): Promise<{ canDelete: boolean; dependencies: unknown[]; error?: string }> {
    return this.dependency.checkDeleteEligibility(componentId, componentType);
  }

  async checkComponentDependencies(
    componentId: string,
    componentType: number
  ): Promise<unknown> {
    return this.dependency.checkComponentDependencies(componentId, componentType);
  }

  // =====================================================
  // PUBLISHING METHODS (PublishingService) - Read-only
  // =====================================================

  async checkUnpublishedChanges(): Promise<unknown> {
    return this.publishing.checkUnpublishedChanges();
  }

  async previewUnpublishedChanges(): Promise<unknown> {
    return this.publishing.previewUnpublishedChanges();
  }

  // =====================================================
  // VALIDATION METHODS (ValidationService)
  // =====================================================

  async validateBestPractices(
    solutionUniqueName: string | undefined,
    entityLogicalNames: string[] | undefined,
    publisherPrefix: string,
    recentDays: number = 30,
    includeRefDataTables: boolean = true,
    rules: string[] = [
      'prefix',
      'lowercase',
      'lookup',
      'optionset',
      'required-column',
      'entity-icon',
    ],
    maxEntities: number = 0,
    requiredColumns: string[] = ['{prefix}updatedbyprocess']
  ): Promise<BestPracticesValidationResult> {
    return this.validation.validateBestPractices(
      solutionUniqueName,
      entityLogicalNames,
      publisherPrefix,
      recentDays,
      includeRefDataTables,
      rules,
      maxEntities,
      requiredColumns
    );
  }

  validateSchemaName(
    schemaName: string,
    prefix: string
  ): { valid: boolean; errors: string[] } {
    return this.validation.validateSchemaName(schemaName, prefix);
  }

  // =====================================================
  // DBML GENERATION METHODS (DbmlGenerator)
  // =====================================================

  async generateDbmlSchema(options: DbmlGeneratorOptions): Promise<DbmlResult> {
    return this.dbmlGenerator.generate(options);
  }

  // =====================================================
  // INTEGRATION AUDIT METHODS (IntegrationAuditService)
  // =====================================================

  async getServiceEndpoints(maxRecords: number = 100, excludeOotb: boolean = true): Promise<ServiceEndpointsResult> {
    return this.integrationAudit.getServiceEndpoints(maxRecords, excludeOotb);
  }

  async getServiceEndpointsValidated(
    maxRecords: number = 100,
    requiredUrlStrings?: string[],
    excludeOotb: boolean = true
  ): Promise<ServiceEndpointsValidatedResult> {
    return this.integrationAudit.getServiceEndpointsValidated(maxRecords, requiredUrlStrings, excludeOotb);
  }

  async getEnvironmentVariables(
    maxRecords: number = 500,
    requiredUrlStrings?: string[],
    excludeOotb: boolean = true
  ): Promise<EnvironmentVariablesResult> {
    return this.integrationAudit.getEnvironmentVariables(maxRecords, requiredUrlStrings, excludeOotb);
  }

  async getWebhookRegistrations(maxRecords: number = 100, excludeOotb: boolean = true): Promise<WebhookRegistrationsResult> {
    return this.integrationAudit.getWebhookRegistrations(maxRecords, excludeOotb);
  }

  async analyzeFlowComplexity(flowId?: string, maxFlows: number = 0, excludeOotb: boolean = true): Promise<FlowComplexityResult_Full> {
    return this.integrationAudit.analyzeFlowComplexity(flowId, maxFlows, excludeOotb);
  }

  async generateIntegrationAuditReport(
    maxFlows: number = 0,
    requiredUrlStrings?: string[],
    outputFormat?: 'summary' | 'full',
    excludeOotb: boolean = true,
    maxRecords: number = 100
  ): Promise<IntegrationAuditReport> {
    return this.integrationAudit.generateAuditReport(maxFlows, requiredUrlStrings, outputFormat, excludeOotb, maxRecords);
  }

  // =====================================================
  // CONNECTION REFERENCE METHODS (ConnectionReferenceService)
  // =====================================================

  async getConnectionReferences(options?: {
    maxRecords?: number;
    managedOnly?: boolean;
    hasConnection?: boolean;
  }): Promise<ConnectionReferencesResult> {
    return this.connectionReference.getConnectionReferences(options);
  }

  // =====================================================
  // SECURITY ROLE METHODS (SecurityRoleService)
  // =====================================================

  async getSecurityRoles(options?: {
    solutionUniqueName?: string;
    excludeSystemRoles?: boolean;
    maxRecords?: number;
  }): Promise<SecurityRolesResult> {
    return this.securityRole.getSecurityRoles(options);
  }

  async getSecurityRolePrivileges(options: {
    roleId: string;
    entityFilter?: string;
    accessRightFilter?: string;
  }): Promise<SecurityRolePrivilegesResult> {
    return this.securityRole.getSecurityRolePrivileges(options);
  }

  async getSecurityRolesBySolution(options: {
    solutionUniqueName: string;
    includePrivileges?: boolean;
  }): Promise<SecurityRolesBySolutionResult> {
    return this.securityRole.getSecurityRolesBySolution(options);
  }

  // =====================================================
  // FIELD SECURITY METHODS (read-only)
  // =====================================================

  async listFieldSecurityProfiles(namePattern?: string): Promise<FieldSecurityProfileSummary[]> {
    return this.fieldSecurity.listFieldSecurityProfiles(namePattern);
  }

  async getFieldSecurityProfile(fieldSecurityProfileId: string): Promise<FieldSecurityProfileDetail> {
    return this.fieldSecurity.getFieldSecurityProfile(fieldSecurityProfileId);
  }

  async getSecuredColumns(entityLogicalName: string): Promise<SecuredColumnInfo[]> {
    return this.fieldSecurity.getSecuredColumns(entityLogicalName);
  }
}
