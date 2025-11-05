/**
 * TypeScript interfaces for Model-Driven App (MDA) operations
 */

import { Label, BooleanManagedProperty } from './customization.js';

// ===== App Module =====

/**
 * App Module entity - represents a model-driven app
 */
export interface AppModule {
  appmoduleid?: string;
  name: string;
  uniquename: string;
  description?: string;
  webresourceid?: string; // Default: '953b9fac-1e5e-e611-80d6-00155ded156f'
  publisherid?: string;
  clienttype?: number; // 1-31, commonly 4 for UCI (Unified Client Interface)
  formfactor?: number; // 1-8, commonly 1 for Unknown/All
  navigationtype?: number; // 0=Single session, 1=Multi session
  url?: string;
  isfeatured?: boolean;
  isdefault?: boolean;
  configxml?: string;
  publishedon?: string; // Read-only timestamp
  statecode?: number; // 0=Active, 1=Inactive
  statuscode?: number; // 1=Active, 2=Inactive, 3=Deleted
  _publisherid_value?: string; // OData lookup value
  'publisherid@OData.Community.Display.V1.FormattedValue'?: string;
}

/**
 * Request to create a new app module
 */
export interface CreateAppRequest {
  name: string;
  uniquename: string;
  description?: string;
  webresourceid?: string;
  clienttype?: number;
  formfactor?: number;
  navigationtype?: number;
  isfeatured?: boolean;
  isdefault?: boolean;
  url?: string;
}

/**
 * Request to update an existing app module
 */
export interface UpdateAppRequest {
  name?: string;
  description?: string;
  webresourceid?: string;
  clienttype?: number;
  formfactor?: number;
  navigationtype?: number;
  isfeatured?: boolean;
  isdefault?: boolean;
  url?: string;
}

// ===== App Module Component =====

/**
 * App Module Component - links components (entities, forms, views, sitemaps) to apps
 */
export interface AppModuleComponent {
  appmodulecomponentid?: string;
  appmoduleidunique: string; // Links to parent app module
  objectid: string; // ID of the component being added
  componenttype: ComponentType;
  rootappmodulecomponentid?: string; // Parent-child relationships
  createdon?: string;
  modifiedon?: string;
}

/**
 * Component type enumeration for app module components
 */
export enum ComponentType {
  Entity = 1,
  Form = 24,
  SavedQuery = 26, // View
  BusinessProcessFlow = 29,
  RibbonCommand = 48,
  SavedQueryVisualization = 59, // Chart/Dashboard
  SystemForm = 60,
  SiteMap = 62,
  AppModule = 80
}

/**
 * Component to add to an app
 */
export interface AppComponent {
  '@odata.type'?: string; // 'Microsoft.Dynamics.CRM.crmbaseentity'
  componentId: string;
  componentType: ComponentType | number;
}

/**
 * Request to add components to an app (AddAppComponents action)
 */
export interface AddAppComponentsRequest {
  AppId: string;
  Components: AppComponent[];
}

// ===== SiteMap =====

/**
 * SiteMap entity - stores XML configuration for app navigation
 */
export interface SiteMap {
  sitemapid?: string;
  sitemapname: string;
  sitemapxml: string;
  isappaware?: boolean;
  enablecollapsiblegroups?: boolean;
  showhome?: boolean;
  showpinned?: boolean;
  showrecents?: boolean;
  sitemapnameunique?: string;
  ismanaged?: boolean;
  componentstate?: number;
  overwritetime?: string;
  createdon?: string;
  modifiedon?: string;
}

/**
 * Simplified sitemap configuration (no XML knowledge required)
 */
export interface SimpleSitemapConfig {
  name: string;
  areas: SitemapArea[];
  enableCollapsibleGroups?: boolean;
  showHome?: boolean;
  showPinned?: boolean;
  showRecents?: boolean;
}

/**
 * SiteMap Area - top-level section (Sales, Service, Marketing, etc.)
 */
export interface SitemapArea {
  id: string;
  title: string;
  description?: string;
  icon?: string; // Path to icon web resource (85x71px, white, 18% opacity)
  showGroups?: boolean;
  groups: SitemapGroup[];
}

/**
 * SiteMap Group - collection of related navigation items
 */
export interface SitemapGroup {
  id: string;
  title: string;
  description?: string;
  isProfile?: boolean;
  subareas: SitemapSubArea[];
}

/**
 * SiteMap SubArea - individual navigation item
 */
export interface SitemapSubArea {
  id: string;
  title: string;
  description?: string;
  entity?: string; // Logical name of entity to display (mutually exclusive with url)
  url?: string; // Custom page URL (mutually exclusive with entity)
  icon?: string; // Path to icon web resource
  availableOffline?: boolean;
  passParams?: boolean;
}

// ===== Validation =====

/**
 * App validation result from ValidateApp function
 */
export interface AppValidationResult {
  ValidationSuccess: boolean;
  ValidationIssueList: AppValidationIssue[];
}

/**
 * Individual validation issue
 */
export interface AppValidationIssue {
  ErrorType: 'Error' | 'Warning';
  Message: string;
  ComponentId?: string;
  ComponentType?: number;
}

/**
 * Response from ValidateApp API
 */
export interface ValidateAppResponse {
  '@odata.context': string;
  AppValidationResponse: AppValidationResult;
}

// ===== Security Roles =====

/**
 * Security Role entity
 */
export interface SecurityRole {
  roleid: string;
  name: string;
  businessunitid?: string;
  _businessunitid_value?: string;
}

/**
 * Association reference for many-to-many relationships
 */
export interface AssociationReference {
  '@odata.id': string;
}

// ===== Publisher =====

/**
 * Publisher entity (already defined in customization.ts, extended here)
 */
export interface PublisherInfo {
  publisherid: string;
  uniquename: string;
  friendlyname: string;
  customizationprefix: string;
  customizationoptionvalueprefix: number;
  description?: string;
}

// ===== Utility Types =====

/**
 * Extract ID from OData-EntityId header response
 * Format: [Org URI]/api/data/v9.2/appmodules(00aa00aa-bb11-cc22-dd33-44ee44ee44ee)
 */
export interface ODataEntityIdResponse {
  'OData-EntityId': string;
}

/**
 * Result from creating an app
 */
export interface CreateAppResult {
  appId: string;
  name: string;
  uniquename: string;
  publishedon?: string;
}

/**
 * Result from creating a sitemap
 */
export interface CreateSitemapResult {
  sitemapId: string;
  sitemapName: string;
  sitemapXml: string;
}

/**
 * App query options
 */
export interface GetAppsOptions {
  activeOnly?: boolean;
  maxRecords?: number;
  includePublisher?: boolean;
  includeComponents?: boolean;
}

/**
 * App with expanded relationships
 */
export interface AppModuleWithRelations extends Omit<AppModule, 'publisherid'> {
  publisherid?: PublisherInfo;
  components?: AppModuleComponent[];
  sitemap?: SiteMap;
}

// ===== Default Values =====

/**
 * Default values for app creation
 */
export const APP_MODULE_DEFAULTS = {
  webresourceid: '953b9fac-1e5e-e611-80d6-00155ded156f', // System default icon
  clienttype: 4, // UCI (Unified Client Interface)
  formfactor: 1, // Unknown/All
  navigationtype: 0, // Single session
  isfeatured: false,
  isdefault: false,
  url: ''
};

/**
 * Client type enumeration
 */
export enum ClientType {
  Web = 1,
  Outlook = 2,
  Mobile = 4,
  UCI = 4, // Unified Client Interface
  All = 31
}

/**
 * Form factor enumeration
 */
export enum FormFactor {
  Unknown = 1,
  Desktop = 2,
  Tablet = 3,
  Phone = 4,
  All = 8
}

/**
 * Navigation type enumeration
 */
export enum NavigationType {
  SingleSession = 0,
  MultiSession = 1
}

/**
 * App state enumeration
 */
export enum AppState {
  Active = 0,
  Inactive = 1
}

/**
 * App status enumeration
 */
export enum AppStatus {
  Active = 1,
  Inactive = 2,
  Deleted = 3
}
