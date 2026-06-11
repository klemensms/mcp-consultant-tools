/**
 * PowerPlatformService - Slim Customization Facade
 *
 * This is a facade that delegates to services in @mcp-consultant-tools/powerplatform-core.
 * It provides CUSTOMIZATION operations for PowerPlatform/Dataverse entities.
 *
 * For read-only operations, use @mcp-consultant-tools/powerplatform.
 * For data CRUD operations, use @mcp-consultant-tools/powerplatform-data.
 */

import {
  // Client and types
  PowerPlatformClient,
  type PowerPlatformConfig,
  type ApiCollectionResponse,
  type FlowRunFilterOptions,
  type FlowRunsResult,
  // Read-only services (needed for inspecting before customizing)
  MetadataService,
  PluginService,
  FlowService,
  WorkflowService,
  BusinessRuleService,
  AppService,
  ValidationService,
  // Customization services
  EntityService,
  AttributeService,
  RelationshipService,
  OptionSetService,
  FormService,
  ViewService,
  WebResourceService,
  SolutionService,
  PublishingService,
  DependencyService,
  PluginDeploymentService,
  AppManagementService,
  WorkflowManagementService,
  ServiceEndpointService,
  FieldSecurityService,
  type FieldPermissionValue,
  type FieldSecurityProfileSummary,
  type FieldSecurityProfileDetail,
  type FieldPermissionRecord,
  type SecuredColumnInfo,
  // Plugin deployment types
  type RegisterPluginStepOptions,
  type RegisterPluginImageOptions,
  // Service endpoint types
  type CreateServiceEndpointOptions,
  type UpdateServiceEndpointOptions,
  type ServiceEndpointCreateResult,
  type RegisterWebhookOptions,
  type RegisterWebhookResult,
  // Auth
  type AuthProvider,
  createAuthProvider,
} from '@mcp-consultant-tools/powerplatform-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, extname, dirname, join } from 'node:path';

// Re-export types for backward compatibility
export type { PowerPlatformConfig, ApiCollectionResponse };

// Form file workflow types
export type FormTypeName = 'Main' | 'QuickCreate' | 'QuickView' | 'Card';

export interface FormFileSidecarMeta {
  formId: string;
  entityLogicalName: string;
  formType: FormTypeName;
  name: string;
  versionNumber: string;
  downloadedAt: string;
  lastUploaded?: {
    at: string;
    previousVersionNumber: string;
    versionNumber: string;
  };
}

export interface DownloadFormResult {
  filePath: string;
  metaPath: string;
  historyPath: string;
  formId: string;
  entityLogicalName: string;
  formType: FormTypeName;
  name: string;
  versionNumber: string;
  byteCount: number;
}

export interface DeployFormResult {
  filePath: string;
  formId: string;
  action: 'updated';
  previousVersionNumber: string;
  newVersionNumber: string;
  byteCount: number;
  historyPath: string;
}

export interface DiffFormResult {
  formId: string;
  identical: boolean;
  localSize: number;
  remoteSize: number;
  localVersion?: string;
  remoteVersion: string;
}

export class PowerPlatformService {
  private client: PowerPlatformClient;
  // Read-only services
  private metadata: MetadataService;
  private plugin: PluginService;
  private flow: FlowService;
  private workflow: WorkflowService;
  private businessRule: BusinessRuleService;
  private app: AppService;
  private validation: ValidationService;
  // Customization services
  private entity: EntityService;
  private attribute: AttributeService;
  private relationship: RelationshipService;
  private optionSet: OptionSetService;
  private form: FormService;
  private view: ViewService;
  private webResource: WebResourceService;
  private solution: SolutionService;
  private publishing: PublishingService;
  private dependency: DependencyService;
  private pluginDeployment: PluginDeploymentService;
  private appManagement: AppManagementService;
  private workflowManagement: WorkflowManagementService;
  private serviceEndpoint: ServiceEndpointService;
  private fieldSecurity: FieldSecurityService;

  constructor(config: PowerPlatformConfig, authProvider?: AuthProvider) {
    const auth =
      authProvider ||
      createAuthProvider({
        organizationUrl: config.organizationUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tenantId: config.tenantId,
      });

    this.client = new PowerPlatformClient(config, auth);

    // Initialize read-only services
    this.metadata = new MetadataService(this.client);
    this.plugin = new PluginService(this.client);
    this.flow = new FlowService(this.client);
    this.workflow = new WorkflowService(this.client);
    this.businessRule = new BusinessRuleService(this.client);
    this.app = new AppService(this.client);
    this.validation = new ValidationService(this.client);

    // Initialize customization services
    this.entity = new EntityService(this.client);
    this.attribute = new AttributeService(this.client);
    this.relationship = new RelationshipService(this.client);
    this.optionSet = new OptionSetService(this.client);
    this.form = new FormService(this.client);
    this.view = new ViewService(this.client);
    this.webResource = new WebResourceService(this.client);
    this.solution = new SolutionService(this.client);
    this.publishing = new PublishingService(this.client);
    this.dependency = new DependencyService(this.client);
    // These services need cross-service dependencies
    this.pluginDeployment = new PluginDeploymentService(
      this.client,
      (solutionUniqueName, componentId, componentType) =>
        this.solution.addComponentToSolution(solutionUniqueName, componentId, componentType)
    );
    this.appManagement = new AppManagementService(
      this.client,
      async (appId) => this.app.getAppSitemap(appId) as Promise<{
        hasSitemap: boolean;
        sitemapid?: string;
        sitemapxml?: string;
      }>
    );
    this.workflowManagement = new WorkflowManagementService(this.client);
    this.serviceEndpoint = new ServiceEndpointService(
      this.client,
      (solutionUniqueName: string, componentId: string, componentType: number) =>
        this.solution.addComponentToSolution(solutionUniqueName, componentId, componentType),
      (messageName: string, entityName: string) =>
        this.pluginDeployment.resolveSdkMessageAndFilter(messageName, entityName)
    );
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
  // METADATA METHODS (Read-only)
  // =====================================================

  async getEntityMetadata(entityName: string): Promise<unknown> {
    return this.metadata.getEntityMetadata(entityName);
  }

  async getEntityAttributes(
    entityName: string,
    options?: { prefix?: string; attributeType?: string; maxAttributes?: number }
  ): Promise<{ value: unknown[]; hasMore: boolean; returnedCount: number; totalBeforeFilter?: number }> {
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

  async getGlobalOptionSets(options?: { maxRecords?: number; prefix?: string }): Promise<{
    value: unknown[];
    hasMore: boolean;
    totalCount: number;
  }> {
    return this.metadata.getGlobalOptionSets(options);
  }

  // =====================================================
  // PLUGIN METHODS (Read-only)
  // =====================================================

  async getPluginAssemblies(includeManaged?: boolean, maxRecords?: number): Promise<{
    totalCount: number;
    assemblies: unknown[];
  }> {
    return this.plugin.getPluginAssemblies(includeManaged, maxRecords);
  }

  async getPluginAssemblyComplete(assemblyName: string, includeDisabled?: boolean): Promise<unknown> {
    return this.plugin.getPluginAssemblyComplete(assemblyName, includeDisabled);
  }

  async getEntityPluginPipeline(entityName: string, messageFilter?: string, includeDisabled?: boolean): Promise<unknown> {
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
  }): Promise<{ totalCount: number; logs: unknown[] }> {
    return this.plugin.getPluginTraceLogs(options);
  }

  // =====================================================
  // FLOW METHODS (Read-only)
  // =====================================================

  async getFlows(options?: { activeOnly?: boolean; maxRecords?: number }): Promise<unknown> {
    return this.flow.getFlows(options);
  }

  async getFlowDefinition(flowId: string, summary?: boolean): Promise<unknown> {
    return this.flow.getFlowDefinition(flowId, summary);
  }

  async getFlowRuns(flowId: string, options: FlowRunFilterOptions = {}): Promise<FlowRunsResult> {
    return this.flow.getFlowRuns(flowId, options);
  }

  // =====================================================
  // WORKFLOW METHODS (Read-only)
  // =====================================================

  async getWorkflows(activeOnly?: boolean, maxRecords?: number): Promise<unknown> {
    return this.workflow.getWorkflows(activeOnly, maxRecords);
  }

  async getWorkflowDefinition(workflowId: string, summary?: boolean): Promise<unknown> {
    return this.workflow.getWorkflowDefinition(workflowId, summary);
  }

  // =====================================================
  // BUSINESS RULE METHODS (Read-only)
  // =====================================================

  async getBusinessRules(activeOnly?: boolean, maxRecords?: number): Promise<{
    totalCount: number;
    businessRules: unknown[];
  }> {
    return this.businessRule.getBusinessRules(activeOnly, maxRecords);
  }

  async getBusinessRule(workflowId: string): Promise<unknown> {
    return this.businessRule.getBusinessRule(workflowId);
  }

  // =====================================================
  // APP METHODS (Read-only)
  // =====================================================

  async getApps(
    activeOnly?: boolean,
    maxRecords?: number,
    includeUnpublished?: boolean,
    solutionUniqueName?: string
  ): Promise<unknown> {
    return this.app.getApps(activeOnly, maxRecords, includeUnpublished, solutionUniqueName);
  }

  async getApp(appId: string): Promise<unknown> {
    return this.app.getApp(appId);
  }

  async getAppComponents(appId: string): Promise<unknown> {
    return this.app.getAppComponents(appId);
  }

  async getAppSitemap(appId: string): Promise<unknown> {
    return this.app.getAppSitemap(appId);
  }

  // =====================================================
  // ENTITY CUSTOMIZATION METHODS
  // =====================================================

  async createEntity(entityDefinition: unknown, solutionUniqueName?: string): Promise<unknown> {
    return this.entity.createEntity(entityDefinition as Record<string, unknown>, solutionUniqueName);
  }

  async updateEntity(metadataId: string, updates: unknown, solutionUniqueName?: string): Promise<void> {
    return this.entity.updateEntity(metadataId, updates as Record<string, unknown>, solutionUniqueName);
  }

  async deleteEntity(metadataId: string): Promise<void> {
    return this.entity.deleteEntity(metadataId);
  }

  async updateEntityIcon(entityLogicalName: string, iconFileName: string, solutionUniqueName?: string): Promise<unknown> {
    return this.entity.updateEntityIcon(
      entityLogicalName,
      iconFileName,
      {
        getEntityMetadata: (name: string) => this.metadata.getEntityMetadata(name) as Promise<Record<string, unknown>>,
        createWebResource: (resource: Record<string, unknown>, solution?: string) =>
          this.webResource.createWebResource(resource, solution) as Promise<Record<string, unknown>>,
        updateWebResource: (id: string, updates: Record<string, unknown>, solution?: string) =>
          this.webResource.updateWebResource(id, updates, solution),
        publishComponent: (id: string, componentType: number) =>
          this.publishing.publishComponent(id, componentType),
      },
      solutionUniqueName
    );
  }

  // =====================================================
  // ATTRIBUTE CUSTOMIZATION METHODS
  // =====================================================

  async createAttribute(entityLogicalName: string, attributeDefinition: unknown, solutionUniqueName?: string): Promise<unknown> {
    return this.attribute.createAttribute(entityLogicalName, attributeDefinition as Record<string, unknown>, solutionUniqueName);
  }

  async updateAttribute(entityLogicalName: string, attributeLogicalName: string, updates: unknown, solutionUniqueName?: string): Promise<void> {
    return this.attribute.updateAttribute(
      entityLogicalName,
      attributeLogicalName,
      updates as Record<string, unknown>,
      (entityName, attrName) => this.metadata.getEntityAttribute(entityName, attrName) as Promise<Record<string, unknown>>,
      solutionUniqueName
    );
  }

  async deleteAttribute(entityLogicalName: string, attributeMetadataId: string): Promise<void> {
    return this.attribute.deleteAttribute(entityLogicalName, attributeMetadataId);
  }

  async createGlobalOptionSetAttribute(
    entityLogicalName: string,
    schemaName: string,
    displayName: string,
    globalOptionSetName: string,
    options?: { description?: string; requiredLevel?: string; solutionUniqueName?: string }
  ): Promise<unknown> {
    const attributeDefinition: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [
          {
            '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
            Label: displayName,
            LanguageCode: 1033,
          },
        ],
      },
      RequiredLevel: {
        Value: options?.requiredLevel || 'None',
      },
      GlobalOptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
        Name: globalOptionSetName,
      },
    };
    if (options?.description) {
      attributeDefinition.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [
          {
            '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
            Label: options.description,
            LanguageCode: 1033,
          },
        ],
      };
    }
    return this.attribute.createGlobalOptionSetAttribute(
      entityLogicalName, attributeDefinition, options?.solutionUniqueName
    );
  }

  // =====================================================
  // RELATIONSHIP CUSTOMIZATION METHODS
  // =====================================================

  async createOneToManyRelationship(definition: unknown, solutionUniqueName?: string): Promise<unknown> {
    return this.relationship.createOneToManyRelationship(definition as Record<string, unknown>, solutionUniqueName);
  }

  async createManyToManyRelationship(definition: unknown, solutionUniqueName?: string): Promise<unknown> {
    return this.relationship.createManyToManyRelationship(definition as Record<string, unknown>, solutionUniqueName);
  }

  async deleteRelationship(metadataId: string): Promise<void> {
    return this.relationship.deleteRelationship(metadataId);
  }

  async updateRelationship(metadataId: string, updates: unknown): Promise<void> {
    return this.relationship.updateRelationship(metadataId, updates as Record<string, unknown>);
  }

  // =====================================================
  // OPTION SET CUSTOMIZATION METHODS
  // =====================================================

  async createGlobalOptionSet(definition: unknown, solutionUniqueName?: string): Promise<unknown> {
    return this.optionSet.createGlobalOptionSet(definition as Record<string, unknown>, solutionUniqueName);
  }

  async updateGlobalOptionSet(metadataId: string, updates: unknown, solutionUniqueName?: string): Promise<void> {
    return this.optionSet.updateGlobalOptionSet(metadataId, updates as Record<string, unknown>, solutionUniqueName);
  }

  async addOptionSetValue(optionSetName: string, value: number, label: string, solutionUniqueName?: string): Promise<unknown> {
    return this.optionSet.addOptionSetValue(optionSetName, value, label, solutionUniqueName);
  }

  async updateOptionSetValue(optionSetName: string, value: number, label: string, solutionUniqueName?: string): Promise<void> {
    return this.optionSet.updateOptionSetValue(optionSetName, value, label, solutionUniqueName);
  }

  async deleteOptionSetValue(optionSetName: string, value: number): Promise<void> {
    return this.optionSet.deleteOptionSetValue(optionSetName, value);
  }

  async reorderOptionSetValues(optionSetName: string, values: number[], solutionUniqueName?: string): Promise<void> {
    return this.optionSet.reorderOptionSetValues(optionSetName, values, solutionUniqueName);
  }

  // =====================================================
  // FORM CUSTOMIZATION METHODS
  // =====================================================

  async getForms(entityLogicalName: string): Promise<unknown> {
    return this.form.getForms(entityLogicalName);
  }

  async createForm(name: string, entityLogicalName: string, formType: string, formXml: string, options?: { description?: string; solutionUniqueName?: string }): Promise<unknown> {
    const formData: Record<string, unknown> = {
      name,
      objecttypecode: entityLogicalName,
      type: this.getFormTypeCode(formType),
      formxml: formXml,
    };
    if (options?.description) {
      formData.description = options.description;
    }
    return this.form.createForm(formData, options?.solutionUniqueName);
  }

  private getFormTypeCode(formType: string): number {
    const typeMap: Record<string, number> = {
      Main: 2,
      QuickCreate: 7,
      QuickView: 6,
      Card: 11,
    };
    return typeMap[formType] || 2;
  }

  async updateForm(formId: string, updates: unknown, solutionUniqueName?: string): Promise<void> {
    return this.form.updateForm(formId, updates as Record<string, unknown>, solutionUniqueName);
  }

  async deleteForm(formId: string): Promise<void> {
    return this.form.deleteForm(formId);
  }

  async activateForm(formId: string): Promise<void> {
    return this.form.activateForm(formId);
  }

  async deactivateForm(formId: string): Promise<void> {
    return this.form.deactivateForm(formId);
  }

  // =====================================================
  // FORM FILE WORKFLOW METHODS (download / deploy / diff)
  // =====================================================

  /**
   * Fetch a single systemform by id (returns formid, objecttypecode, name, type, formxml, versionnumber).
   */
  private async fetchSystemFormById(formId: string): Promise<Record<string, unknown>> {
    return this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/systemforms(${formId})?$select=formid,objecttypecode,name,type,formxml,versionnumber,description`
    );
  }

  /**
   * Resolve a form by (entity + name + formType) to a single systemform record.
   * Throws if zero or multiple matches.
   */
  private async resolveFormByName(
    entityLogicalName: string,
    formName?: string,
    formType?: FormTypeName
  ): Promise<Record<string, unknown>> {
    const filters: string[] = [`objecttypecode eq '${entityLogicalName}'`];
    if (formName) {
      filters.push(`name eq '${formName.replace(/'/g, "''")}'`);
    }
    if (formType) {
      filters.push(`type eq ${this.getFormTypeCode(formType)}`);
    }
    const url = `api/data/v9.2/systemforms?$filter=${encodeURIComponent(filters.join(' and '))}&$select=formid,objecttypecode,name,type,formxml,versionnumber,description`;
    const response = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(url);
    const matches = response.value || [];
    if (matches.length === 0) {
      const criteria = `entity='${entityLogicalName}'${formName ? `, name='${formName}'` : ''}${formType ? `, type='${formType}'` : ''}`;
      throw new Error(`No form found for ${criteria}. Verify entity, name, and type (Main/QuickCreate/QuickView/Card).`);
    }
    if (matches.length > 1) {
      const listed = matches
        .map((m) => `  - ${m.name} (${this.getFormTypeName(m.type as number)}, id=${m.formid})`)
        .join('\n');
      throw new Error(
        `Multiple forms match the criteria. Provide formId or narrow by formType/formName:\n${listed}`
      );
    }
    return matches[0];
  }

  private getFormTypeName(typeCode: number): FormTypeName {
    const map: Record<number, FormTypeName> = { 2: 'Main', 7: 'QuickCreate', 6: 'QuickView', 11: 'Card' };
    return map[typeCode] || 'Main';
  }

  /**
   * Download a form's XML to a local file, writing a sidecar .meta.json and a history snapshot.
   * Overwrites the target file — Dataverse is the source of truth.
   *
   * Resolution: provide either `formId`, or (`entityLogicalName` + `formName` + optional `formType`),
   * or (`entityLogicalName` + `formType`) when exactly one form of that type exists on the entity.
   */
  async downloadFormToFile(
    filePath: string,
    options: {
      formId?: string;
      entityLogicalName?: string;
      formName?: string;
      formType?: FormTypeName;
    }
  ): Promise<DownloadFormResult> {
    const resolvedPath = resolve(filePath.replace(/\\/g, '/'));

    let form: Record<string, unknown>;
    if (options.formId) {
      form = await this.fetchSystemFormById(options.formId);
    } else {
      if (!options.entityLogicalName) {
        throw new Error("Provide 'formId', or 'entityLogicalName' with 'formName' and/or 'formType'.");
      }
      form = await this.resolveFormByName(options.entityLogicalName, options.formName, options.formType);
    }

    const formXml = (form.formxml as string) ?? '';
    if (!formXml) {
      throw new Error(`Form '${form.formid}' has empty formxml — nothing to download.`);
    }
    const byteCount = Buffer.byteLength(formXml, 'utf8');
    const formTypeName = this.getFormTypeName(form.type as number);
    const entityLogicalName = form.objecttypecode as string;
    const formName = form.name as string;
    const formId = form.formid as string;
    const versionNumber = String(form.versionnumber ?? '');

    // Ensure target directory exists
    await mkdir(dirname(resolvedPath), { recursive: true });

    // Write formxml verbatim — NEVER re-serialize
    await writeFile(resolvedPath, formXml, { encoding: 'utf8' });

    // Sidecar meta
    const metaPath = `${resolvedPath}.meta.json`;
    const downloadedAt = new Date().toISOString();
    const meta = {
      formId,
      entityLogicalName,
      formType: formTypeName,
      name: formName,
      versionNumber,
      downloadedAt,
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', { encoding: 'utf8' });

    // History snapshot
    const historyDir = `${resolvedPath}.history`;
    await mkdir(historyDir, { recursive: true });
    const stamp = downloadedAt.replace(/[:.]/g, '-');
    const historyXmlPath = join(historyDir, `${stamp}-download.xml`);
    const historyMetaPath = join(historyDir, `${stamp}-download.meta.json`);
    await writeFile(historyXmlPath, formXml, { encoding: 'utf8' });
    await writeFile(historyMetaPath, JSON.stringify(meta, null, 2) + '\n', { encoding: 'utf8' });

    return {
      filePath: resolvedPath,
      metaPath,
      historyPath: historyXmlPath,
      formId,
      entityLogicalName,
      formType: formTypeName,
      name: formName,
      versionNumber,
      byteCount,
    };
  }

  /**
   * Read a local form XML file and PATCH it to Dataverse. Preserves bytes verbatim — never re-parses.
   * Resolves the target formId from the sidecar .meta.json unless overridden.
   */
  async deployFormFromFile(
    filePath: string,
    options: {
      formId?: string;
      expectedVersionNumber?: string;
      solutionUniqueName?: string;
    }
  ): Promise<DeployFormResult> {
    const resolvedPath = resolve(filePath.replace(/\\/g, '/'));
    const metaPath = `${resolvedPath}.meta.json`;

    // Read file bytes
    let fileContent: string;
    try {
      fileContent = await readFile(resolvedPath, { encoding: 'utf8' });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: '${resolvedPath}'`);
      }
      throw new Error(`Failed to read file '${resolvedPath}': ${error.message}`);
    }
    if (!fileContent || fileContent.trim().length === 0) {
      throw new Error(`File is empty: '${resolvedPath}'`);
    }

    // Minimal sanity check — must contain a <form> element. Deep well-formedness
    // is enforced by Dataverse on PATCH; local check keeps changes observable.
    if (!/<form(\s|>)/.test(fileContent)) {
      throw new Error(
        `File '${resolvedPath}' does not appear to contain a <form> element. Aborting before upload.`
      );
    }

    // Load sidecar meta (if any)
    let sidecarMeta: FormFileSidecarMeta | undefined;
    try {
      const metaRaw = await readFile(metaPath, { encoding: 'utf8' });
      sidecarMeta = JSON.parse(metaRaw) as FormFileSidecarMeta;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to read sidecar '${metaPath}': ${error.message}`);
      }
    }

    const targetFormId = options.formId || sidecarMeta?.formId;
    if (!targetFormId) {
      throw new Error(
        `No formId provided and no sidecar at '${metaPath}'. Run download-form-to-file first, or pass --form-id.`
      );
    }

    // Fetch current remote form to capture the pre-upload version
    const remoteBefore = await this.fetchSystemFormById(targetFormId);
    const remoteVersionBefore = String(remoteBefore.versionnumber ?? '');

    // Optimistic concurrency check
    if (options.expectedVersionNumber && remoteVersionBefore !== options.expectedVersionNumber) {
      throw new Error(
        `Remote form has moved since expected version. expected=${options.expectedVersionNumber}, actual=${remoteVersionBefore}. Re-download before deploying.`
      );
    }

    // PATCH formxml
    await this.form.updateForm(targetFormId, { formxml: fileContent }, options.solutionUniqueName);

    // Fetch again to capture the new version
    const remoteAfter = await this.fetchSystemFormById(targetFormId);
    const remoteVersionAfter = String(remoteAfter.versionnumber ?? '');

    // Update sidecar
    const uploadedAt = new Date().toISOString();
    const newMeta: FormFileSidecarMeta = {
      formId: targetFormId,
      entityLogicalName: (remoteAfter.objecttypecode as string) ?? sidecarMeta?.entityLogicalName ?? '',
      formType: this.getFormTypeName(remoteAfter.type as number),
      name: (remoteAfter.name as string) ?? sidecarMeta?.name ?? '',
      versionNumber: remoteVersionAfter,
      downloadedAt: sidecarMeta?.downloadedAt ?? uploadedAt,
      lastUploaded: {
        at: uploadedAt,
        previousVersionNumber: remoteVersionBefore,
        versionNumber: remoteVersionAfter,
      },
    };
    await writeFile(metaPath, JSON.stringify(newMeta, null, 2) + '\n', { encoding: 'utf8' });

    // History snapshot of what was uploaded
    const historyDir = `${resolvedPath}.history`;
    await mkdir(historyDir, { recursive: true });
    const stamp = uploadedAt.replace(/[:.]/g, '-');
    const historyXmlPath = join(historyDir, `${stamp}-upload.xml`);
    const historyMetaPath = join(historyDir, `${stamp}-upload.meta.json`);
    await writeFile(historyXmlPath, fileContent, { encoding: 'utf8' });
    await writeFile(historyMetaPath, JSON.stringify(newMeta, null, 2) + '\n', { encoding: 'utf8' });

    return {
      filePath: resolvedPath,
      formId: targetFormId,
      action: 'updated',
      previousVersionNumber: remoteVersionBefore,
      newVersionNumber: remoteVersionAfter,
      byteCount: Buffer.byteLength(fileContent, 'utf8'),
      historyPath: historyXmlPath,
    };
  }

  /**
   * Compare a local form file to the current remote form. Returns whether they're identical
   * and basic metrics — does NOT modify anything.
   */
  async diffFormWithFile(
    filePath: string,
    options: { formId?: string }
  ): Promise<DiffFormResult> {
    const resolvedPath = resolve(filePath.replace(/\\/g, '/'));
    const metaPath = `${resolvedPath}.meta.json`;

    const localContent = await readFile(resolvedPath, { encoding: 'utf8' });

    let sidecarMeta: FormFileSidecarMeta | undefined;
    try {
      const metaRaw = await readFile(metaPath, { encoding: 'utf8' });
      sidecarMeta = JSON.parse(metaRaw) as FormFileSidecarMeta;
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }

    const targetFormId = options.formId || sidecarMeta?.formId;
    if (!targetFormId) {
      throw new Error(`No formId provided and no sidecar at '${metaPath}'.`);
    }

    const remote = await this.fetchSystemFormById(targetFormId);
    const remoteXml = (remote.formxml as string) ?? '';

    return {
      formId: targetFormId,
      identical: localContent === remoteXml,
      localSize: Buffer.byteLength(localContent, 'utf8'),
      remoteSize: Buffer.byteLength(remoteXml, 'utf8'),
      localVersion: sidecarMeta?.versionNumber,
      remoteVersion: String(remote.versionnumber ?? ''),
    };
  }

  // =====================================================
  // VIEW CUSTOMIZATION METHODS
  // =====================================================

  async getViews(entityLogicalName: string): Promise<unknown> {
    return this.view.getViews(entityLogicalName);
  }

  async getViewFetchXml(viewId: string): Promise<unknown> {
    return this.view.getViewFetchXml(viewId);
  }

  async createView(name: string, entityLogicalName: string, fetchXml: string, layoutXml: string, options?: { description?: string; isDefault?: boolean; queryType?: number; solutionUniqueName?: string }): Promise<unknown> {
    const viewData: Record<string, unknown> = {
      name,
      returnedtypecode: entityLogicalName,
      fetchxml: fetchXml,
      layoutxml: layoutXml,
      querytype: options?.queryType ?? 0,
    };
    if (options?.description) {
      viewData.description = options.description;
    }
    if (options?.isDefault !== undefined) {
      viewData.isdefault = options.isDefault;
    }
    return this.view.createView(viewData, options?.solutionUniqueName);
  }

  async updateView(viewId: string, updates: unknown, solutionUniqueName?: string): Promise<void> {
    return this.view.updateView(viewId, updates as Record<string, unknown>, solutionUniqueName);
  }

  async deleteView(viewId: string): Promise<void> {
    return this.view.deleteView(viewId);
  }

  async setDefaultView(viewId: string): Promise<void> {
    return this.view.setDefaultView(viewId);
  }

  // =====================================================
  // WEB RESOURCE CUSTOMIZATION METHODS
  // =====================================================

  async getWebResource(webResourceId: string): Promise<unknown> {
    return this.webResource.getWebResource(webResourceId);
  }

  async getWebResources(nameFilter?: string): Promise<unknown> {
    return this.webResource.getWebResources(nameFilter);
  }

  async createWebResource(name: string, displayName: string, webResourceType: number, content: string, options?: { description?: string; solutionUniqueName?: string }): Promise<unknown> {
    const webResourceData: Record<string, unknown> = {
      name,
      displayname: displayName,
      webresourcetype: webResourceType,
      content,
    };
    if (options?.description) {
      webResourceData.description = options.description;
    }
    return this.webResource.createWebResource(webResourceData, options?.solutionUniqueName);
  }

  async updateWebResource(webResourceId: string, updates: unknown, solutionUniqueName?: string): Promise<void> {
    return this.webResource.updateWebResource(webResourceId, updates as Record<string, unknown>, solutionUniqueName);
  }

  async deleteWebResource(webResourceId: string): Promise<void> {
    return this.webResource.deleteWebResource(webResourceId);
  }

  private static readonly EXTENSION_TO_TYPE: Record<string, number> = {
    '.html': 1, '.htm': 1, '.css': 2, '.js': 3, '.xml': 4,
    '.png': 5, '.jpg': 6, '.jpeg': 6, '.gif': 7,
    '.xsl': 9, '.ico': 10, '.svg': 11, '.resx': 12,
  };

  async deployWebResourceFromFile(
    filePath: string,
    options: {
      webResourceId?: string;
      name?: string;
      displayName?: string;
      webResourceType?: number;
      description?: string;
      solutionUniqueName?: string;
    }
  ): Promise<{ success: true; action: 'created' | 'updated'; webResourceId?: string; message: string }> {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const resolvedPath = resolve(normalizedPath);

    // Validate extension
    const ext = extname(resolvedPath).toLowerCase();
    const autoType = PowerPlatformService.EXTENSION_TO_TYPE[ext];
    if (!autoType && !options.webResourceType) {
      const supported = Object.keys(PowerPlatformService.EXTENSION_TO_TYPE).join(', ');
      throw new Error(`Unsupported file extension '${ext}'. Supported: ${supported}. Or provide webResourceType explicitly.`);
    }
    const webResourceType = options.webResourceType ?? autoType;

    // Read file as buffer (works for both text and binary)
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(resolvedPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: '${resolvedPath}'`);
      }
      throw new Error(`Failed to read file '${resolvedPath}': ${error.message}`);
    }
    if (fileBuffer.length === 0) {
      throw new Error(`File is empty: '${resolvedPath}'`);
    }

    const base64Content = fileBuffer.toString('base64');
    const fileName = basename(resolvedPath);

    // Update existing web resource
    if (options.webResourceId) {
      const updates: Record<string, unknown> = { content: base64Content };
      if (options.displayName) updates.displayname = options.displayName;
      if (options.description) updates.description = options.description;
      await this.updateWebResource(options.webResourceId, updates, options.solutionUniqueName);
      return {
        success: true,
        action: 'updated',
        webResourceId: options.webResourceId,
        message: `Updated web resource '${options.webResourceId}' from file '${fileName}'.`,
      };
    }

    // Create new web resource
    if (!options.name) {
      throw new Error("'name' is required when creating a new web resource (no webResourceId provided).");
    }
    if (!options.displayName) {
      throw new Error("'displayName' is required when creating a new web resource (no webResourceId provided).");
    }
    const result = await this.createWebResource(
      options.name, options.displayName, webResourceType, base64Content,
      { description: options.description, solutionUniqueName: options.solutionUniqueName }
    ) as any;
    return {
      success: true,
      action: 'created',
      webResourceId: result.webresourceid,
      message: `Created web resource '${options.name}' from file '${fileName}'.`,
    };
  }

  // =====================================================
  // SOLUTION CUSTOMIZATION METHODS
  // =====================================================

  async getPublishers(): Promise<unknown> {
    return this.solution.getPublishers();
  }

  async createPublisher(uniqueName: string, friendlyName: string, customizationPrefix: string, customizationOptionValuePrefix: number, description?: string): Promise<unknown> {
    const publisherData: Record<string, unknown> = {
      uniquename: uniqueName,
      friendlyname: friendlyName,
      customizationprefix: customizationPrefix,
      customizationoptionvalueprefix: customizationOptionValuePrefix,
    };
    if (description) {
      publisherData.description = description;
    }
    return this.solution.createPublisher(publisherData);
  }

  async getSolutions(): Promise<unknown> {
    return this.solution.getSolutions();
  }

  async getSolution(uniqueName: string): Promise<unknown> {
    return this.solution.getSolution(uniqueName);
  }

  async createSolution(uniqueName: string, friendlyName: string, version: string, publisherId: string, description?: string): Promise<unknown> {
    const solutionData: Record<string, unknown> = {
      uniquename: uniqueName,
      friendlyname: friendlyName,
      version: version,
      'publisherid@odata.bind': `/publishers(${publisherId})`,
    };
    if (description) {
      solutionData.description = description;
    }
    return this.solution.createSolution(solutionData);
  }

  async getSolutionComponents(solutionUniqueName: string): Promise<unknown> {
    return this.solution.getSolutionComponents(solutionUniqueName);
  }

  async addComponentToSolution(solutionUniqueName: string, componentId: string, componentType: number, addRequiredComponents?: boolean): Promise<void> {
    return this.solution.addComponentToSolution(solutionUniqueName, componentId, componentType, addRequiredComponents);
  }

  async removeComponentFromSolution(solutionUniqueName: string, componentId: string, componentType: number): Promise<void> {
    return this.solution.removeComponentFromSolution(solutionUniqueName, componentId, componentType);
  }

  async exportSolution(solutionName: string, managed?: boolean): Promise<unknown> {
    return this.solution.exportSolution(solutionName, managed ?? false);
  }

  async importSolution(customizationFile: string, overwriteUnmanagedCustomizations?: boolean, publishWorkflows?: boolean): Promise<unknown> {
    return this.solution.importSolution(customizationFile, overwriteUnmanagedCustomizations, publishWorkflows);
  }

  // =====================================================
  // PUBLISHING METHODS
  // =====================================================

  async publishAllCustomizations(): Promise<void> {
    return this.publishing.publishAllCustomizations();
  }

  async publishEntity(entityLogicalName: string): Promise<void> {
    return this.publishing.publishEntity(entityLogicalName);
  }

  // =====================================================
  // DEPENDENCY METHODS
  // =====================================================

  async checkDependencies(componentId: string, componentType: number): Promise<unknown> {
    return this.dependency.checkDependencies(componentId, componentType);
  }

  async checkDeleteEligibility(componentId: string, componentType: number): Promise<{
    canDelete: boolean;
    dependencies: unknown[];
    error?: string;
  }> {
    return this.dependency.checkDeleteEligibility(componentId, componentType);
  }

  // =====================================================
  // PLUGIN DEPLOYMENT METHODS
  // =====================================================

  async extractAssemblyVersion(assemblyPath: string): Promise<string> {
    return this.pluginDeployment.extractAssemblyVersion(assemblyPath);
  }

  async queryPluginTypeByTypename(typename: string): Promise<string> {
    return this.pluginDeployment.queryPluginTypeByTypename(typename);
  }

  async queryPluginAssemblyByName(assemblyName: string): Promise<string | null> {
    return this.pluginDeployment.queryPluginAssemblyByName(assemblyName);
  }

  async getPluginTypesForAssembly(assemblyId: string): Promise<unknown[]> {
    return this.pluginDeployment.getPluginTypesForAssembly(assemblyId);
  }

  async resolveSdkMessageAndFilter(messageName: string, primaryEntity: string): Promise<unknown> {
    return this.pluginDeployment.resolveSdkMessageAndFilter(messageName, primaryEntity);
  }

  async createPluginAssembly(options: { name: string; content: string; version: string; description?: string; isolationMode?: number; solutionUniqueName?: string }): Promise<unknown> {
    return this.pluginDeployment.createPluginAssembly({
      name: options.name,
      content: options.content,
      version: options.version,
      description: options.description,
      isolationMode: options.isolationMode,
      solutionUniqueName: options.solutionUniqueName,
    });
  }

  async updatePluginAssembly(assemblyId: string, content: string, version: string, solutionUniqueName?: string): Promise<void> {
    return this.pluginDeployment.updatePluginAssembly(assemblyId, content, version, solutionUniqueName);
  }

  async deletePluginAssembly(assemblyId: string): Promise<void> {
    return this.pluginDeployment.deletePluginAssembly(assemblyId);
  }

  async deletePluginStep(stepId: string): Promise<void> {
    return this.pluginDeployment.deletePluginStep(stepId);
  }

  async registerPluginStep(config: RegisterPluginStepOptions): Promise<unknown> {
    return this.pluginDeployment.registerPluginStep(config);
  }

  async registerPluginImage(config: RegisterPluginImageOptions): Promise<unknown> {
    return this.pluginDeployment.registerPluginImage(config);
  }

  async getPluginPackages(includeManaged?: boolean, maxRecords?: number): Promise<unknown[]> {
    return this.pluginDeployment.getPluginPackages(includeManaged, maxRecords);
  }

  async deployPluginPackage(options: { content: string; uniqueName: string; version: string; solutionUniqueName?: string }): Promise<unknown> {
    return this.pluginDeployment.deployPluginPackage(options);
  }

  // =====================================================
  // APP MANAGEMENT METHODS
  // =====================================================

  async createSimpleSitemap(config: unknown, solutionUniqueName?: string): Promise<unknown> {
    // Cast config to the expected type - caller is responsible for correct structure
    return this.appManagement.createSimpleSitemap(config as Parameters<typeof this.appManagement.createSimpleSitemap>[0], solutionUniqueName);
  }

  async addEntitiesToApp(appId: string, entityNames: string[]): Promise<unknown> {
    return this.appManagement.addEntitiesToApp(appId, entityNames);
  }

  async validateApp(appId: string): Promise<unknown> {
    return this.appManagement.validateApp(appId);
  }

  async publishApp(appId: string): Promise<unknown> {
    // publishApp needs a callback for publishXml
    return this.appManagement.publishApp(appId, (parameterXml: string) =>
      this.publishing.publishXml(parameterXml)
    );
  }

  // =====================================================
  // WORKFLOW MANAGEMENT METHODS
  // =====================================================

  async deactivateWorkflow(workflowId: string): Promise<unknown> {
    return this.workflowManagement.deactivateWorkflow(workflowId);
  }

  async activateWorkflow(workflowId: string): Promise<unknown> {
    return this.workflowManagement.activateWorkflow(workflowId);
  }

  async updateWorkflowDescription(workflowId: string, description: string): Promise<unknown> {
    return this.workflowManagement.updateWorkflowDescription(workflowId, description);
  }

  async updateFlowDescription(flowId: string, description: string): Promise<unknown> {
    return this.workflowManagement.updateFlowDescription(flowId, description);
  }

  /**
   * Adapter function to convert FlowService.parseFlowSummary output to expected format
   */
  private adaptFlowSummary(flowDef: unknown): {
    tablesModified: string[];
    triggerInfo: string;
    triggerFields: string[];
    actions: unknown[];
    customApisCalled?: string[];
  } {
    const summary = this.flow.parseFlowSummary(flowDef as Record<string, unknown>);
    return {
      tablesModified: Array.from((summary.tablesModified as Set<string>) || []),
      triggerInfo: (summary.triggerInfo as string) || 'manual',
      triggerFields: (summary.triggerFields as string[]) || [],
      actions: (summary.actions as unknown[]) || [],
      customApisCalled: Array.from((summary.customApisCalled as Set<string>) || []),
    };
  }

  /**
   * Adapter function to convert WorkflowService.parseWorkflowXamlSummary output to expected format
   */
  private adaptWorkflowSummary(xaml: string): {
    tablesModified: string[];
    triggerInfo: string;
    triggerFields: string[];
    createEntityCount: number;
    updateEntityCount: number;
    assignEntityCount: number;
    setStateCount: number;
  } {
    const summary = this.workflow.parseWorkflowXamlSummary(xaml);
    const activities = (summary.activities as Array<{ type: string; count: number }>) || [];

    const getCount = (type: string): number => {
      const activity = activities.find(a => a.type === type);
      return activity?.count || 0;
    };

    return {
      tablesModified: Array.from((summary.tablesModified as Set<string>) || []),
      triggerInfo: (summary.triggerInfo as string) || 'manual',
      triggerFields: (summary.triggerFields as string[]) || [],
      createEntityCount: getCount('CreateEntity'),
      updateEntityCount: getCount('UpdateEntity'),
      assignEntityCount: getCount('AssignEntity'),
      setStateCount: getCount('SetState'),
    };
  }

  async documentAutomation(automationId: string, type?: 'flow' | 'workflow'): Promise<unknown> {
    return this.workflowManagement.documentAutomation(
      automationId,
      type,
      (def: unknown) => this.adaptFlowSummary(def),
      (xaml: string) => this.adaptWorkflowSummary(xaml)
    );
  }

  async documentWorkflowSafe(workflowId: string, type?: 'flow' | 'workflow'): Promise<unknown> {
    return this.workflowManagement.documentWorkflowSafe(
      workflowId,
      type,
      (def: unknown) => this.adaptFlowSummary(def),
      (xaml: string) => this.adaptWorkflowSummary(xaml)
    );
  }

  /**
   * Create a new Power Automate flow from an existing template flow
   */
  async createFlow(
    name: string,
    templateFlowId: string,
    options?: { description?: string; state?: 'draft' | 'activated'; connectionReferenceMappings?: Record<string, string> }
  ): Promise<unknown> {
    return this.workflowManagement.createFlow(name, templateFlowId, options);
  }

  /**
   * Delete a Power Automate flow (permanent operation)
   */
  async deleteFlow(flowId: string): Promise<unknown> {
    return this.workflowManagement.deleteFlow(flowId);
  }

  /**
   * Clone an existing flow with a new name
   */
  async cloneFlow(
    sourceFlowId: string,
    newName: string,
    options?: { description?: string; updateConnectionReferences?: boolean; connectionReferenceMappings?: Record<string, string> }
  ): Promise<unknown> {
    return this.workflowManagement.cloneFlow(sourceFlowId, newName, options);
  }

  /**
   * Activate a Power Automate flow (alias for activateWorkflow)
   */
  async activateFlow(flowId: string): Promise<unknown> {
    return this.activateWorkflow(flowId);
  }

  /**
   * Deactivate a Power Automate flow (alias for deactivateWorkflow)
   */
  async deactivateFlow(flowId: string): Promise<unknown> {
    return this.deactivateWorkflow(flowId);
  }

  /**
   * Create a new Power Automate flow from a clientdata definition (no template required)
   */
  async createFlowFromDefinition(
    name: string,
    clientData: string | object,
    options?: { description?: string; primaryEntity?: string; state?: 'draft' | 'activated' }
  ): Promise<unknown> {
    return this.workflowManagement.createFlowFromDefinition(name, clientData, options);
  }

  /**
   * Get a pre-built flow definition template
   */
  getFlowDefinitionTemplate(
    templateType: 'dataverse-on-create' | 'dataverse-on-update' | 'dataverse-on-delete' | 'dataverse-on-create-with-condition-and-update' | 'scheduled-recurrence' | 'manual-trigger' | 'http-request'
  ): unknown {
    return this.workflowManagement.getFlowDefinitionTemplate(templateType);
  }

  /**
   * Update an existing Power Automate flow's clientdata definition
   */
  async updateFlowDefinition(
    flowId: string,
    clientData: string | object,
    options?: { reactivate?: boolean; validateDefinition?: boolean }
  ): Promise<unknown> {
    return this.workflowManagement.updateFlowDefinition(flowId, clientData, options);
  }

  /**
   * Cancel a running or waiting flow run
   */
  async cancelFlowRun(flowId: string, runId: string): Promise<unknown> {
    return this.flow.cancelFlowRun(flowId, runId);
  }

  /**
   * Resubmit/retry a failed flow run using the original trigger inputs
   */
  async resubmitFlowRun(flowId: string, runId: string): Promise<unknown> {
    return this.flow.resubmitFlowRun(flowId, runId);
  }

  // =====================================================
  // SERVICE ENDPOINT METHODS
  // =====================================================

  async createServiceEndpoint(options: CreateServiceEndpointOptions): Promise<ServiceEndpointCreateResult> {
    return this.serviceEndpoint.createServiceEndpoint(options);
  }

  async updateServiceEndpoint(options: UpdateServiceEndpointOptions): Promise<void> {
    return this.serviceEndpoint.updateServiceEndpoint(options);
  }

  async deleteServiceEndpoint(serviceEndpointId: string): Promise<void> {
    return this.serviceEndpoint.deleteServiceEndpoint(serviceEndpointId);
  }

  async registerWebhook(options: RegisterWebhookOptions): Promise<RegisterWebhookResult> {
    return this.serviceEndpoint.registerWebhook(options);
  }

  // =====================================================
  // FIELD SECURITY METHODS
  // =====================================================

  /**
   * Set the IsSecured flag on a column. Reuses AttributeService.updateAttribute
   * (which fetches the current attribute to recover the correct @odata.type)
   * and PublishingService.publishEntity for the post-update publish.
   */
  async setColumnSecured(
    entityLogicalName: string,
    attributeLogicalName: string,
    isSecured: boolean,
    publishAfter: boolean = true
  ): Promise<{ entityLogicalName: string; attributeLogicalName: string; isSecured: boolean; previousValue: boolean }> {
    const existing = (await this.metadata.getEntityAttribute(
      entityLogicalName,
      attributeLogicalName
    )) as Record<string, unknown>;
    const previousValue = Boolean(existing.IsSecured);

    if (previousValue === isSecured) {
      return { entityLogicalName, attributeLogicalName, isSecured, previousValue };
    }

    await this.attribute.updateAttribute(
      entityLogicalName,
      attributeLogicalName,
      { IsSecured: isSecured },
      (entityName, attrName) => this.metadata.getEntityAttribute(entityName, attrName) as Promise<Record<string, unknown>>
    );

    if (publishAfter) {
      await this.publishing.publishEntity(entityLogicalName);
    }

    return { entityLogicalName, attributeLogicalName, isSecured, previousValue };
  }

  /**
   * Batch wrapper — secure or unsecure multiple columns on the same entity in
   * one logical operation, with a single publish at the end.
   */
  async setColumnsSecured(
    entityLogicalName: string,
    attributeLogicalNames: string[],
    isSecured: boolean,
    publishAfter: boolean = true
  ): Promise<Array<{ attributeLogicalName: string; isSecured: boolean; previousValue: boolean; changed: boolean }>> {
    const results: Array<{ attributeLogicalName: string; isSecured: boolean; previousValue: boolean; changed: boolean }> = [];
    for (const attr of attributeLogicalNames) {
      const r = await this.setColumnSecured(entityLogicalName, attr, isSecured, false);
      results.push({
        attributeLogicalName: attr,
        isSecured: r.isSecured,
        previousValue: r.previousValue,
        changed: r.previousValue !== r.isSecured,
      });
    }
    if (publishAfter && results.some((r) => r.changed)) {
      await this.publishing.publishEntity(entityLogicalName);
    }
    return results;
  }

  async createFieldSecurityProfile(
    name: string,
    description?: string,
    solutionUniqueName?: string
  ): Promise<FieldSecurityProfileSummary> {
    return this.fieldSecurity.createFieldSecurityProfile(name, description, solutionUniqueName);
  }

  async updateFieldSecurityProfile(
    fieldSecurityProfileId: string,
    updates: { name?: string; description?: string }
  ): Promise<void> {
    return this.fieldSecurity.updateFieldSecurityProfile(fieldSecurityProfileId, updates);
  }

  async deleteFieldSecurityProfile(fieldSecurityProfileId: string): Promise<void> {
    return this.fieldSecurity.deleteFieldSecurityProfile(fieldSecurityProfileId);
  }

  async listFieldSecurityProfiles(namePattern?: string): Promise<FieldSecurityProfileSummary[]> {
    return this.fieldSecurity.listFieldSecurityProfiles(namePattern);
  }

  async getFieldSecurityProfile(fieldSecurityProfileId: string): Promise<FieldSecurityProfileDetail> {
    return this.fieldSecurity.getFieldSecurityProfile(fieldSecurityProfileId);
  }

  async addFieldPermission(options: {
    fieldSecurityProfileId: string;
    entityLogicalName: string;
    attributeLogicalName: string;
    canCreate: FieldPermissionValue;
    canRead: FieldPermissionValue;
    canUpdate: FieldPermissionValue;
    upsert?: boolean;
  }): Promise<FieldPermissionRecord> {
    return this.fieldSecurity.addFieldPermission(options);
  }

  async addFieldPermissions(
    fieldSecurityProfileId: string,
    permissions: Array<{
      entityLogicalName: string;
      attributeLogicalName: string;
      canCreate: FieldPermissionValue;
      canRead: FieldPermissionValue;
      canUpdate: FieldPermissionValue;
    }>,
    upsert: boolean = true
  ): Promise<FieldPermissionRecord[]> {
    const results: FieldPermissionRecord[] = [];
    for (const p of permissions) {
      results.push(
        await this.fieldSecurity.addFieldPermission({
          fieldSecurityProfileId,
          ...p,
          upsert,
        })
      );
    }
    return results;
  }

  async removeFieldPermission(fieldPermissionId: string): Promise<void> {
    return this.fieldSecurity.removeFieldPermission(fieldPermissionId);
  }

  async assignFspToTeam(
    fieldSecurityProfileId: string,
    teamId: string
  ): Promise<{ alreadyAssigned: boolean }> {
    return this.fieldSecurity.assignProfileToTeam(fieldSecurityProfileId, teamId);
  }

  async unassignFspFromTeam(
    fieldSecurityProfileId: string,
    teamId: string
  ): Promise<void> {
    return this.fieldSecurity.unassignProfileFromTeam(fieldSecurityProfileId, teamId);
  }

  async assignFspToUser(
    fieldSecurityProfileId: string,
    systemUserId: string
  ): Promise<{ alreadyAssigned: boolean }> {
    return this.fieldSecurity.assignProfileToUser(fieldSecurityProfileId, systemUserId);
  }

  async unassignFspFromUser(
    fieldSecurityProfileId: string,
    systemUserId: string
  ): Promise<void> {
    return this.fieldSecurity.unassignProfileFromUser(fieldSecurityProfileId, systemUserId);
  }

  async getSecuredColumns(entityLogicalName: string): Promise<SecuredColumnInfo[]> {
    return this.fieldSecurity.getSecuredColumns(entityLogicalName);
  }
}
