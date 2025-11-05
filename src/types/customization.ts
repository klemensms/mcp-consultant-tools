/**
 * TypeScript interfaces for Dynamics CRM customization operations
 */

// ===== Entity Definitions =====

export interface EntityDefinition {
  '@odata.type': string;
  SchemaName: string;
  DisplayName: Label;
  DisplayCollectionName: Label;
  Description?: Label;
  OwnershipType: 'UserOwned' | 'TeamOwned' | 'OrganizationOwned';
  IsActivity?: boolean;
  IsCustomEntity?: boolean;
  HasActivities?: boolean;
  HasNotes?: boolean;
  HasFeedback?: boolean;
  PrimaryNameAttribute?: string;
  PrimaryImageAttribute?: string;
  IconVectorName?: string;
}

export interface Label {
  '@odata.type'?: string;
  LocalizedLabels: LocalizedLabel[];
  UserLocalizedLabel?: LocalizedLabel;
}

export interface LocalizedLabel {
  '@odata.type'?: string;
  Label: string;
  LanguageCode: number;
  IsManaged?: boolean;
  MetadataId?: string;
  HasChanged?: boolean;
}

// ===== Attribute Definitions =====

export interface AttributeDefinition {
  '@odata.type': string;
  SchemaName: string;
  DisplayName: Label;
  Description?: Label;
  RequiredLevel: RequiredLevel;
  IsCustomAttribute?: boolean;
  IsValidForCreate?: boolean;
  IsValidForRead?: boolean;
  IsValidForUpdate?: boolean;
  CanModifyAdditionalSettings?: BooleanManagedProperty;
}

export interface RequiredLevel {
  Value: 'None' | 'SystemRequired' | 'ApplicationRequired' | 'Recommended';
  CanBeChanged: boolean;
  ManagedPropertyLogicalName: string;
}

export interface BooleanManagedProperty {
  Value: boolean;
  CanBeChanged: boolean;
  ManagedPropertyLogicalName: string;
}

// ===== Specific Attribute Types =====

export interface StringAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata';
  MaxLength: number;
  Format?: 'Email' | 'Text' | 'TextArea' | 'Url' | 'TickerSymbol' | 'PhoneticGuide' | 'VersionNumber' | 'Phone';
  FormulaDefinition?: string;
  SourceTypeMask?: number;
  AutoNumberFormat?: string;
}

export interface MemoAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata';
  MaxLength: number;
  Format?: 'Text' | 'TextArea';
}

export interface IntegerAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata';
  MinValue: number;
  MaxValue: number;
  Format?: 'None' | 'Duration' | 'TimeZone' | 'Language' | 'Locale';
}

export interface DecimalAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata';
  MinValue: number;
  MaxValue: number;
  Precision: number;
}

export interface MoneyAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata';
  MinValue: number;
  MaxValue: number;
  Precision: number;
  PrecisionSource?: number;
  ImeMode?: string;
}

export interface DateTimeAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata';
  Format: 'DateOnly' | 'DateAndTime';
  DateTimeBehavior?: DateTimeBehavior;
  ImeMode?: string;
}

export interface DateTimeBehavior {
  Value: 'UserLocal' | 'DateOnly' | 'TimeZoneIndependent';
}

export interface BooleanAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata';
  DefaultValue: boolean;
  OptionSet: BooleanOptionSet;
}

export interface BooleanOptionSet {
  TrueOption: OptionMetadata;
  FalseOption: OptionMetadata;
}

export interface PicklistAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata';
  OptionSet: OptionSetMetadata;
  DefaultFormValue?: number;
}

export interface MultiSelectPicklistAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata';
  OptionSet: OptionSetMetadata;
  DefaultFormValue?: number;
}

export interface LookupAttributeDefinition extends AttributeDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata';
  Targets?: string[];
}

// ===== Option Sets =====

export interface OptionSetMetadata {
  '@odata.type'?: string;
  OptionSetType?: 'Picklist' | 'State' | 'Status' | 'Boolean' | 'MultiSelectPicklist';
  IsGlobal?: boolean;
  IsCustomOptionSet?: boolean;
  IsManaged?: boolean;
  Name?: string;
  DisplayName?: Label;
  Description?: Label;
  Options: OptionMetadata[];
  IntroducedVersion?: string;
}

export interface OptionMetadata {
  Value: number;
  Label: Label;
  Description?: Label;
  Color?: string;
  IsManaged?: boolean;
  ExternalValue?: string;
}

// ===== Relationships =====

export interface OneToManyRelationshipDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata';
  SchemaName: string;
  ReferencedEntity: string;
  ReferencedAttribute: string;
  ReferencingEntity: string;
  ReferencingAttribute: string;
  RelationshipBehavior?: RelationshipBehavior;
  CascadeConfiguration?: CascadeConfiguration;
  AssociatedMenuConfiguration?: AssociatedMenuConfiguration;
  IsCustomRelationship?: boolean;
  IsValidForAdvancedFind?: boolean;
  IsManaged?: boolean;
}

export interface ManyToManyRelationshipDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata';
  SchemaName: string;
  Entity1LogicalName: string;
  Entity1AssociatedMenuConfiguration: AssociatedMenuConfiguration;
  Entity2LogicalName: string;
  Entity2AssociatedMenuConfiguration: AssociatedMenuConfiguration;
  IntersectEntityName?: string;
  IsCustomRelationship?: boolean;
  IsValidForAdvancedFind?: boolean;
  IsManaged?: boolean;
}

export interface RelationshipBehavior {
  Value: 'Referential' | 'Parental' | 'Configurable';
}

export interface CascadeConfiguration {
  Assign?: 'NoCascade' | 'Cascade' | 'Active' | 'UserOwned';
  Delete?: 'RemoveLink' | 'Restrict' | 'Cascade';
  Merge?: 'NoCascade' | 'Cascade';
  Reparent?: 'NoCascade' | 'Cascade' | 'Active' | 'UserOwned';
  Share?: 'NoCascade' | 'Cascade' | 'Active' | 'UserOwned';
  Unshare?: 'NoCascade' | 'Cascade' | 'Active' | 'UserOwned';
}

export interface AssociatedMenuConfiguration {
  Behavior?: 'UseCollectionName' | 'UseLabel' | 'DoNotDisplay';
  Group?: 'Details' | 'Sales' | 'Service' | 'Marketing';
  Label?: Label;
  Order?: number;
}

// ===== Forms =====

export interface SystemForm {
  formid?: string;
  name: string;
  objecttypecode: string;
  type: 2 | 7 | 8 | 10; // Main, QuickCreate, QuickView, Card
  formxml: string;
  description?: string;
  formactivationstate?: 0 | 1; // Inactive, Active
  iscustomizable?: BooleanManagedProperty;
}

// ===== Views (Saved Queries) =====

export interface SavedQuery {
  savedqueryid?: string;
  name: string;
  returnedtypecode: string;
  fetchxml: string;
  layoutxml: string;
  querytype: 0 | 2 | 4 | 8 | 16 | 64 | 128 | 256 | 512 | 1024; // View types
  description?: string;
  isdefault?: boolean;
  iscustomizable?: BooleanManagedProperty;
}

// ===== Business Rules (Workflows) =====

export interface Workflow {
  workflowid?: string;
  name: string;
  category: 2; // Business Rule
  primaryentity: string;
  description?: string;
  xaml?: string;
  type: 1; // Definition
  statecode?: 0 | 1; // Draft, Activated
  statuscode?: 1 | 2; // Draft, Activated
  iscustomizable?: BooleanManagedProperty;
}

// ===== Web Resources =====

export interface WebResource {
  webresourceid?: string;
  name: string;
  displayname: string;
  webresourcetype: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; // HTML, CSS, JS, XML, PNG, JPG, GIF, XAP, XSL, ICO
  content: string; // Base64 encoded
  description?: string;
  iscustomizable?: BooleanManagedProperty;
  isenabledformobileclient?: boolean;
  ishidden?: boolean;
  silverlightversion?: string;
}

// ===== Solutions =====

export interface Solution {
  solutionid?: string;
  uniquename: string;
  friendlyname: string;
  version: string;
  publisherid: string;
  description?: string;
  ismanaged?: boolean;
  installedon?: string;
  modifiedon?: string;
}

export interface Publisher {
  publisherid?: string;
  uniquename: string;
  friendlyname: string;
  customizationprefix: string;
  customizationoptionvalueprefix: number;
  description?: string;
}

export interface SolutionComponent {
  solutioncomponentid?: string;
  solutionid: string;
  objectid: string;
  componenttype: number;
  rootcomponentbehavior?: 0 | 1 | 2; // Include Subcomponents, Do Not Include Subcomponents, Include As Shell Only
}

// ===== Publishing =====

export interface PublishXmlRequest {
  ParameterXml: string;
}

// ===== Dependency Checking =====

export interface Dependency {
  dependencyid?: string;
  dependentcomponentobjectid: string;
  dependentcomponenttype: number;
  dependentcomponentnodeid?: string;
  requiredcomponentobjectid: string;
  requiredcomponenttype: number;
  requiredcomponentnodeid?: string;
}

// ===== Component Types (for dependencies and solution components) =====

export enum ComponentType {
  Entity = 1,
  Attribute = 2,
  Relationship = 3,
  AttributePicklistValue = 4,
  AttributeLookupValue = 5,
  ViewAttribute = 6,
  LocalizedLabel = 7,
  RelationshipExtraCondition = 8,
  OptionSet = 9,
  EntityRelationship = 10,
  EntityRelationshipRole = 11,
  EntityRelationshipRelationships = 12,
  ManagedProperty = 13,
  EntityKey = 14,
  Role = 20,
  RolePrivilege = 21,
  DisplayString = 22,
  DisplayStringMap = 23,
  Form = 24,
  Organization = 25,
  SavedQuery = 26,
  Workflow = 29,
  Report = 31,
  ReportEntity = 32,
  ReportCategory = 33,
  ReportVisibility = 34,
  Attachment = 35,
  EmailTemplate = 36,
  ContractTemplate = 37,
  KBArticleTemplate = 38,
  MailMergeTemplate = 39,
  DuplicateRule = 44,
  DuplicateRuleCondition = 45,
  EntityMap = 46,
  AttributeMap = 47,
  RibbonCommand = 48,
  RibbonContextGroup = 49,
  RibbonCustomization = 50,
  RibbonRule = 52,
  RibbonTabToCommandMap = 53,
  RibbonDiff = 55,
  SavedQueryVisualization = 59,
  SystemForm = 60,
  WebResource = 61,
  SiteMap = 62,
  ConnectionRole = 63,
  ComplexControl = 64,
  FieldSecurityProfile = 70,
  FieldPermission = 71,
  PluginType = 90,
  PluginAssembly = 91,
  SDKMessageProcessingStep = 92,
  SDKMessageProcessingStepImage = 93,
  ServiceEndpoint = 95,
  RoutingRule = 150,
  RoutingRuleItem = 151,
  SLA = 152,
  SLAItem = 153,
  ConvertRule = 154,
  ConvertRuleItem = 155,
  HierarchyRule = 65,
  MobileOfflineProfile = 161,
  MobileOfflineProfileItem = 162,
  SimilarityRule = 165,
  CustomControl = 66,
  CustomControlDefaultConfig = 68,
  DataSourceMapping = 166
}

// ===== Validation Results =====

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ===== Dry Run Results =====

export interface DryRunResult {
  operation: string;
  componentType: string;
  componentName: string;
  wouldSucceed: boolean;
  estimatedChanges: string[];
  potentialIssues: string[];
  dependencies?: Dependency[];
}
