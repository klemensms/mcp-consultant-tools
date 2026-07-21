/**
 * Services module exports
 *
 * Services for the powerplatform-core package.
 */

// Read-only services
export { AppService } from './AppService.js';
export { BusinessRuleService } from './BusinessRuleService.js';
export { ConnectionReferenceService } from './ConnectionReferenceService.js';
export type {
  ConnectionReference,
  ConnectionReferencesResult,
} from './ConnectionReferenceService.js';
export { FlowService } from './FlowService.js';
export { MetadataService } from './MetadataService.js';
export { PluginService } from './PluginService.js';
export type {
  PluginStepInventoryEntry,
  PluginStepInventoryResult,
} from './PluginService.js';
export { SecurityRoleService } from './SecurityRoleService.js';
export type {
  SecurityRole,
  SecurityRolesResult,
  RolePrivilege,
  SecurityRolePrivilegesResult,
  SecurityRoleBySolution,
  SecurityRolesBySolutionResult,
} from './SecurityRoleService.js';
export { ValidationService } from './ValidationService.js';
export { WorkflowService } from './WorkflowService.js';

// Data services (for powerplatform-data package)
export { DataService } from './DataService.js';

// Customization services (for powerplatform-customization package)
export { AttributeService } from './AttributeService.js';
export { DependencyService } from './DependencyService.js';
export { EntityService } from './EntityService.js';
export { FormService } from './FormService.js';
export { OptionSetService } from './OptionSetService.js';
export { PublishingService } from './PublishingService.js';
export { RelationshipService } from './RelationshipService.js';
export { SolutionService } from './SolutionService.js';
export { ViewService } from './ViewService.js';
export { WebResourceService } from './WebResourceService.js';

// Plugin deployment and app management services (for powerplatform-customization package)
export { PluginDeploymentService } from './PluginDeploymentService.js';
export type {
  PluginTypeInfo,
  CreatePluginAssemblyOptions,
  RegisterPluginStepOptions,
  RegisterPluginImageOptions,
  PluginPackageInfo,
  DeployPluginPackageOptions,
} from './PluginDeploymentService.js';

export { AppManagementService } from './AppManagementService.js';

export { WorkflowManagementService } from './WorkflowManagementService.js';
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
} from './WorkflowManagementService.js';

// Field Security (for powerplatform + powerplatform-customization packages)
export { FieldSecurityService } from './FieldSecurityService.js';
export type {
  FieldPermissionValue,
  FieldSecurityProfileSummary,
  FieldSecurityProfileDetail,
  FieldPermissionRecord,
  SecuredColumnInfo,
} from './FieldSecurityService.js';

// Service Endpoint Management (for powerplatform-customization package)
export { ServiceEndpointService } from './ServiceEndpointService.js';
export type {
  CreateServiceEndpointOptions,
  UpdateServiceEndpointOptions,
  ServiceEndpointCreateResult,
  RegisterWebhookOptions,
  RegisterWebhookResult,
} from './ServiceEndpointService.js';

// Integration Audit Service
export { IntegrationAuditService } from './IntegrationAuditService.js';
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
} from './IntegrationAuditService.js';
