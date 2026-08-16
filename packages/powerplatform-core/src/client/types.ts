/**
 * Shared types and interfaces for PowerPlatform services
 */

import type { TruncationInfo } from '@mcp-consultant-tools/core';

/**
 * Configuration for PowerPlatform services
 */
export interface PowerPlatformConfig {
  /** PowerPlatform organization URL (e.g., https://org.crm.dynamics.com) */
  organizationUrl: string;
  /** Azure AD application (client) ID */
  clientId: string;
  /** Client secret (optional - if not provided, interactive auth will be used) */
  clientSecret?: string;
  /** Azure AD tenant ID */
  tenantId: string;
}

/**
 * Generic API response with value collection
 */
export interface ApiCollectionResponse<T> {
  value: T[];
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
  [key: string]: any;
}

// ========================================
// Best Practices Validation Types
// ========================================

export interface Violation {
  attributeLogicalName?: string;
  attributeType?: string;
  createdOn?: string;
  rule: string;
  severity: 'MUST' | 'SHOULD';
  message: string;
  currentValue: string;
  expectedValue: string;
  action: string;
  recommendation?: string;
}

export interface EntityValidationResult {
  logicalName: string;
  schemaName: string;
  displayName: string;
  isRefData: boolean;
  attributesChecked: number;
  violations: Violation[];
  isCompliant: boolean;
}

export interface ViolationSummaryByRule {
  rule: string;
  severity: 'MUST' | 'SHOULD';
  totalCount: number;
  affectedEntities: string[];
  affectedColumns: string[];
  action: string;
  recommendation?: string;
}

export interface BestPracticesValidationResult {
  metadata: {
    generatedAt: string;
    solutionName?: string;
    solutionUniqueName?: string;
    publisherPrefix: string;
    recentDays: number;
    executionTimeMs: number;
  };
  summary: {
    entitiesChecked: number;
    attributesChecked: number;
    totalViolations: number;
    criticalViolations: number;
    warnings: number;
    compliantEntities: number;
  };
  violationsSummary: ViolationSummaryByRule[];
  entities: EntityValidationResult[];
  statistics: {
    systemColumnsExcluded: number;
    oldColumnsExcluded: number;
    refDataTablesSkipped: number;
  };
}

// ========================================
// Flow Types
// ========================================

export interface FlowFilterOptions {
  activeOnly?: boolean;
  maxRecords?: number;
  excludeCustomerInsights?: boolean;
  excludeSystem?: boolean;
  excludeCopilotSales?: boolean;
  nameContains?: string;
}

export interface FlowListResult {
  /** Flows in this payload. Read `truncation.totalAvailable` for the population. */
  totalCount: number;
  /** Mirrors `truncation.hasMore`; kept at the top level for existing consumers. */
  hasMore: boolean;
  /** Mirrors `truncation.requestedMax`, with 0 meaning uncapped. */
  requestedMax: number;
  truncation: TruncationInfo;
  excluded: {
    customerInsights: number;
    system: number;
    copilotSales: number;
    total: number;
  };
  filterApplied: {
    excludeCustomerInsights: boolean;
    excludeSystem: boolean;
    excludeCopilotSales: boolean;
    nameContains?: string;
  };
  flows: FlowSummary[];
}

export interface FlowSummary {
  workflowid: string;
  name: string;
  description: string | null;
  state: string;
  statecode: number;
  statuscode: number;
  type: string;
  primaryEntity: string | null;
  isManaged: boolean;
  ownerId: string;
  modifiedOn: string;
  modifiedBy: string | null;
  createdOn: string;
}

// ========================================
// Entity Metadata Types
// ========================================

export interface EntityMetadata {
  LogicalName: string;
  SchemaName: string;
  DisplayName?: {
    UserLocalizedLabel?: {
      Label: string;
    };
  };
  EntitySetName: string;
  PrimaryIdAttribute: string;
  PrimaryNameAttribute?: string;
  MetadataId: string;
  [key: string]: any;
}

export interface AttributeMetadata {
  LogicalName: string;
  SchemaName: string;
  AttributeType: string;
  DisplayName?: {
    UserLocalizedLabel?: {
      Label: string;
    };
  };
  RequiredLevel?: {
    Value: string;
  };
  MetadataId: string;
  [key: string]: any;
}

// ========================================
// Plugin Types
// ========================================

export interface PluginAssembly {
  pluginassemblyid: string;
  name: string;
  version: string;
  publickeytoken: string;
  culture: string;
  ismanaged: boolean;
  description?: string;
  createdby?: string;
  modifiedon?: string;
}

export interface PluginType {
  plugintypeid: string;
  name: string;
  typename: string;
  friendlyname?: string;
  description?: string;
  assemblyname?: string;
}

export interface PluginStep {
  sdkmessageprocessingstepid: string;
  name: string;
  stage: number;
  mode: number;
  rank: number;
  statecode: number;
  filteringattributes?: string;
  configuration?: string;
  sdkmessageid?: {
    name: string;
  };
}

// ========================================
// Solution Types
// ========================================

export interface Solution {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  version: string;
  ismanaged: boolean;
  publisherid?: {
    customizationprefix: string;
    friendlyname: string;
  };
  description?: string;
  installedon?: string;
}

export interface SolutionComponent {
  solutioncomponentid: string;
  componenttype: number;
  objectid: string;
  rootcomponentbehavior?: number;
}

// ========================================
// App Types
// ========================================

export interface AppModule {
  appmoduleid: string;
  uniquename: string;
  name: string;
  description?: string;
  url?: string;
  ismanaged: boolean;
  statecode: number;
  statuscode: number;
}

// ========================================
// Form and View Types
// ========================================

export interface SystemForm {
  formid: string;
  name: string;
  type: number;
  objecttypecode: string;
  formxml?: string;
  description?: string;
  ismanaged: boolean;
  iscustomizable?: boolean;
}

export interface SavedQuery {
  savedqueryid: string;
  name: string;
  querytype: number;
  returnedtypecode: string;
  fetchxml?: string;
  layoutxml?: string;
  description?: string;
  isdefault?: boolean;
  ismanaged: boolean;
}

// ========================================
// Web Resource Types
// ========================================

export interface WebResource {
  webresourceid: string;
  name: string;
  displayname?: string;
  webresourcetype: number;
  content?: string;
  description?: string;
  ismanaged: boolean;
  iscustomizable?: boolean;
}

// ========================================
// Workflow Types
// ========================================

export interface Workflow {
  workflowid: string;
  name: string;
  type: number;
  category: number;
  statecode: number;
  statuscode: number;
  primaryentity?: string;
  scope?: number;
  mode?: number;
  xaml?: string;
  clientdata?: string;
  description?: string;
  ismanaged: boolean;
}

// ========================================
// Global Option Set Types
// ========================================

export interface GlobalOptionSet {
  MetadataId: string;
  Name: string;
  DisplayName?: {
    UserLocalizedLabel?: {
      Label: string;
    };
  };
  Options: OptionSetOption[];
  IsGlobal: boolean;
  OptionSetType: string;
}

export interface OptionSetOption {
  Value: number;
  Label: {
    UserLocalizedLabel?: {
      Label: string;
    };
  };
  Description?: {
    UserLocalizedLabel?: {
      Label: string;
    };
  };
}

// ========================================
// Relationship Types
// ========================================

export interface OneToManyRelationship {
  MetadataId: string;
  SchemaName: string;
  ReferencedEntity: string;
  ReferencedAttribute: string;
  ReferencingEntity: string;
  ReferencingAttribute: string;
  RelationshipType: string;
}

export interface ManyToManyRelationship {
  MetadataId: string;
  SchemaName: string;
  Entity1LogicalName: string;
  Entity2LogicalName: string;
  IntersectEntityName: string;
}
