/**
 * PowerPlatform Core Package
 *
 * Shared infrastructure for PowerPlatform MCP packages:
 * - powerplatform (read-only)
 * - powerplatform-data (CRUD)
 * - powerplatform-customization (schema changes)
 */

// Client
export { PowerPlatformClient } from './client/PowerPlatformClient.js';
export * from './client/types.js';
export { setRequestCallerObjectId, getRequestCallerObjectId } from './client/request-context.js';

// Authentication
export {
  createAuthProvider,
  ServicePrincipalAuth,
  InteractiveAuth,
  TokenCache,
  type AuthProvider,
  type PowerPlatformAuthConfig,
} from './auth/index.js';

// Read-only services
export { AppService } from './services/AppService.js';
export { BusinessRuleService } from './services/BusinessRuleService.js';
export { ConnectionReferenceService } from './services/ConnectionReferenceService.js';
export type {
  ConnectionReference,
  ConnectionReferencesResult,
} from './services/ConnectionReferenceService.js';
export { DbmlGenerator } from './services/DbmlGenerator.js';
export type {
  DbmlGeneratorOptions,
  DbmlResult,
} from './services/DbmlGenerator.js';
export { FlowService } from './services/FlowService.js';
export type {
  CancelFlowRunResult,
  ResubmitFlowRunResult,
  FlowRunFilterOptions,
  FlowRunSummary,
  FlowRunsResult,
  FlowHealthScanOptions,
  FlowHealthScanResult,
  FlowInventoryResult,
} from './services/FlowService.js';
export type {
  FlowHealthEntry,
  FlowHealthSummary,
  FlowInventoryEntry,
} from './services/flow-health.js';
export { MetadataService } from './services/MetadataService.js';
export { PluginService } from './services/PluginService.js';
export type {
  PluginStepInventoryEntry,
  PluginStepInventoryResult,
  PluginAssembliesResult,
} from './services/PluginService.js';
export { SecurityRoleService } from './services/SecurityRoleService.js';
export type {
  SecurityRole,
  SecurityRolesResult,
  RolePrivilege,
  SecurityRolePrivilegesResult,
  SecurityRoleBySolution,
  SecurityRolesBySolutionResult,
} from './services/SecurityRoleService.js';
export { ValidationService } from './services/ValidationService.js';
export { WorkflowService } from './services/WorkflowService.js';
export { IntegrationAuditService } from './services/IntegrationAuditService.js';
export type {
  ServiceEndpoint,
  ServiceEndpointsResult,
  ServiceEndpointSlim,
  ServiceEndpointValidation,
  ServiceEndpointsValidatedResult,
  EnvironmentVariable,
  DivergingVariable,
  EnvironmentVariablesResult,
  WebhookRegistration,
  WebhookRegistrationsResult,
  FlowComplexityAnalysis,
  FlowComplexityResult_Full,
  IntegrationAuditSummary,
  OutboundIntegration,
  InboundIntegration,
  IntegrationAuditReport,
} from './services/IntegrationAuditService.js';

// Data services
export { DataService } from './services/DataService.js';

// Customization services
export { AttributeService } from './services/AttributeService.js';
export { DependencyService } from './services/DependencyService.js';
export { EntityService } from './services/EntityService.js';
export { FormService } from './services/FormService.js';
export { OptionSetService } from './services/OptionSetService.js';
export { PublishingService } from './services/PublishingService.js';
export { RelationshipService } from './services/RelationshipService.js';
export { SolutionService } from './services/SolutionService.js';
export { ViewService } from './services/ViewService.js';
export { WebResourceService } from './services/WebResourceService.js';

// Field security
export { FieldSecurityService } from './services/FieldSecurityService.js';
export type {
  FieldPermissionValue,
  FieldSecurityProfileSummary,
  FieldSecurityProfileDetail,
  FieldPermissionRecord,
  SecuredColumnInfo,
} from './services/FieldSecurityService.js';

// Plugin deployment and app management services
export { PluginDeploymentService } from './services/PluginDeploymentService.js';
export type {
  PluginTypeInfo,
  CreatePluginAssemblyOptions,
  RegisterPluginStepOptions,
  RegisterPluginImageOptions,
  PluginPackageInfo,
  DeployPluginPackageOptions,
} from './services/PluginDeploymentService.js';

export { AppManagementService } from './services/AppManagementService.js';

export { WorkflowManagementService } from './services/WorkflowManagementService.js';
export type {
  WorkflowStateResult,
  DescriptionUpdateResult,
  AutomationAnalysis,
  DocumentWorkflowSafeResult,
  CreateFlowFromDefinitionOptions,
  CreateFlowFromDefinitionResult,
  FlowClientDataValidation,
  FlowTemplateType,
  FlowDefinitionTemplate,
  UpdateFlowDefinitionResult,
  UpdateFlowDefinitionOptions,
} from './services/WorkflowManagementService.js';

// Service endpoint management
export { ServiceEndpointService } from './services/ServiceEndpointService.js';
export type {
  CreateServiceEndpointOptions,
  UpdateServiceEndpointOptions,
  ServiceEndpointCreateResult,
  RegisterWebhookOptions,
  RegisterWebhookResult,
} from './services/ServiceEndpointService.js';

// Utilities
export {
  // Audit logging
  AuditLogger,
  auditLogger,
  type AuditLogEntry,
  type AuditLogOptions,
  // Best practices
  BEST_PRACTICES,
  BestPracticesValidator,
  bestPracticesValidator,
  type RequiredColumn,
  type ValidationResult,
  // Formatters
  formatBestPracticesReport,
  formatCompliantEntities,
  formatExecutionStats,
  formatQuickSummary,
  formatViolationsBySeverity,
  validationFanOutSuffix,
  // Icon management
  IconManager,
  iconManager,
  type IconSuggestion,
  type IconUploadResult,
  // Rate limiting
  batchExecute,
  RateLimiter,
  rateLimiter,
  type RateLimiterOptions,
  type RequestQueueItem,
  withRateLimit,
  // Prompt templates
  ATTRIBUTE_DETAILS,
  ENTITY_OVERVIEW,
  QUERY_TEMPLATE,
  RELATIONSHIP_MAP,
  // Publisher configuration
  getPublisherPrefix,
  initializePublisherPrefix,
  isPublisherPrefixConfigured,
  normalizePrefix,
  resetPublisherPrefix,
  // Flow URL extraction and secret detection
  extractUrlsFromFlowDefinition,
  detectHardcodedSecrets,
  type FlowUrlReference,
  type SecretWarning,
  // Audit report formatter
  generateAuditMarkdownReport,
  type AuditReportData,
} from './utils/index.js';
