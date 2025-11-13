import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';
import { bestPracticesValidator } from './utils/bestPractices.js';
import { iconManager } from './utils/iconManager.js';
import { auditLogger } from '@mcp-consultant-tools/core';
import { rateLimiter } from './utils/rate-limiter.js';

export interface PowerPlatformConfig {
  organizationUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

// Interface for API responses with value collections
export interface ApiCollectionResponse<T> {
  value: T[];
  [key: string]: any; // For any additional properties
}

// Best Practices Validation Interfaces
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
  affectedEntities: string[];  // Complete list of entity logical names
  affectedColumns: string[];   // Complete list of entity.column pairs
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
  violationsSummary: ViolationSummaryByRule[];  // NEW: Complete lists grouped by rule
  entities: EntityValidationResult[];
  statistics: {
    systemColumnsExcluded: number;
    oldColumnsExcluded: number;
    refDataTablesSkipped: number;
  };
}

export class PowerPlatformService {
  private config: PowerPlatformConfig;
  private msalClient: ConfidentialClientApplication;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  constructor(config: PowerPlatformConfig) {
    this.config = config;
    
    // Initialize MSAL client
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
      }
    });
  }

  /**
   * Get an access token for the PowerPlatform API
   */
  private async getAccessToken(): Promise<string> {
    const currentTime = Date.now();
    
    // If we have a token that isn't expired, return it
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      // Get a new token
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: [`${this.config.organizationUrl}/.default`],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;
      
      // Set expiration time (subtract 5 minutes to refresh early)
      if (result.expiresOn) {
        this.tokenExpirationTime = result.expiresOn.getTime() - (5 * 60 * 1000);
      }

      return this.accessToken;
    } catch (error) {
      console.error('Error acquiring access token:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Make an authenticated request to the PowerPlatform API
   * Extended to support all HTTP methods for write operations
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    data?: any,
    additionalHeaders?: Record<string, string>
  ): Promise<T> {
    try {
      const token = await this.getAccessToken();

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...additionalHeaders
      };

      // Add Content-Type for POST/PUT/PATCH requests
      if (method !== 'GET' && method !== 'DELETE' && data) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await axios({
        method,
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers,
        data
      });

      return response.data as T;
    } catch (error: any) {
      const errorDetails = error.response?.data?.error || error.response?.data || error.message;
      console.error('PowerPlatform API request failed:', {
        endpoint,
        method,
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: errorDetails
      });
      throw new Error(`PowerPlatform API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }

  /**
   * Get metadata about an entity
   * @param entityName The logical name of the entity
   */
  async getEntityMetadata(entityName: string): Promise<any> {
    const response = await this.makeRequest(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')`);
    
    // Remove Privileges property if it exists
    if (response && typeof response === 'object' && 'Privileges' in response) {
      delete response.Privileges;
    }
    
    return response;
  }

  /**
   * Get metadata about entity attributes/fields
   * @param entityName The logical name of the entity
   */
  async getEntityAttributes(entityName: string): Promise<ApiCollectionResponse<any>> {
    const selectProperties = [
      'LogicalName',
    ].join(',');
    
    // Make the request to get attributes
    const response = await this.makeRequest<ApiCollectionResponse<any>>(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes?$select=${selectProperties}&$filter=AttributeType ne 'Virtual'`);
    
    if (response && response.value) {
      // First pass: Filter out attributes that end with 'yominame'
      response.value = response.value.filter((attribute: any) => {
        const logicalName = attribute.LogicalName || '';
        return !logicalName.endsWith('yominame');
      });
      
      // Filter out attributes that end with 'name' if there is another attribute with the same name without the 'name' suffix
      const baseNames = new Set<string>();
      const namesAttributes = new Map<string, any>();
      
      for (const attribute of response.value) {
        const logicalName = attribute.LogicalName || '';
      
        if (logicalName.endsWith('name') && logicalName.length > 4) {
          const baseName = logicalName.slice(0, -4); // Remove 'name' suffix
          namesAttributes.set(baseName, attribute);
        } else {
          // This is a potential base attribute
          baseNames.add(logicalName);
        }
      }
      
      // Find attributes to remove that match the pattern
      const attributesToRemove = new Set<any>();
      for (const [baseName, nameAttribute] of namesAttributes.entries()) {
        if (baseNames.has(baseName)) {
          attributesToRemove.add(nameAttribute);
        }
      }

      response.value = response.value.filter(attribute => !attributesToRemove.has(attribute));
    }
    
    return response;
  }

  /**
   * Get metadata about a specific entity attribute/field
   * @param entityName The logical name of the entity
   * @param attributeName The logical name of the attribute
   */
  async getEntityAttribute(entityName: string, attributeName: string): Promise<any> {
    return this.makeRequest(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${attributeName}')`);
  }

  /**
   * Get one-to-many relationships for an entity
   * @param entityName The logical name of the entity
   */
  async getEntityOneToManyRelationships(entityName: string): Promise<ApiCollectionResponse<any>> {
    const selectProperties = [
      'SchemaName',
      'RelationshipType',
      'ReferencedAttribute',
      'ReferencedEntity',
      'ReferencingAttribute',
      'ReferencingEntity',
      'ReferencedEntityNavigationPropertyName',
      'ReferencingEntityNavigationPropertyName'
    ].join(',');
    
    // Only filter by ReferencingAttribute in the OData query since startswith isn't supported
    const response = await this.makeRequest<ApiCollectionResponse<any>>(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/OneToManyRelationships?$select=${selectProperties}&$filter=ReferencingAttribute ne 'regardingobjectid'`);
    
    // Filter the response to exclude relationships with ReferencingEntity starting with 'msdyn_' or 'adx_'
    if (response && response.value) {
      response.value = response.value.filter((relationship: any) => {
        const referencingEntity = relationship.ReferencingEntity || '';
        return !(referencingEntity.startsWith('msdyn_') || referencingEntity.startsWith('adx_'));
      });
    }
    
    return response;
  }

  /**
   * Get many-to-many relationships for an entity
   * @param entityName The logical name of the entity
   */
  async getEntityManyToManyRelationships(entityName: string): Promise<ApiCollectionResponse<any>> {
    const selectProperties = [
      'SchemaName',
      'RelationshipType',
      'Entity1LogicalName',
      'Entity2LogicalName',
      'Entity1IntersectAttribute',
      'Entity2IntersectAttribute',
      'Entity1NavigationPropertyName',
      'Entity2NavigationPropertyName'
    ].join(',');
    
    return this.makeRequest<ApiCollectionResponse<any>>(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/ManyToManyRelationships?$select=${selectProperties}`);
  }

  /**
   * Get all relationships (one-to-many and many-to-many) for an entity
   * @param entityName The logical name of the entity
   */
  async getEntityRelationships(entityName: string): Promise<{oneToMany: ApiCollectionResponse<any>, manyToMany: ApiCollectionResponse<any>}> {
    const [oneToMany, manyToMany] = await Promise.all([
      this.getEntityOneToManyRelationships(entityName),
      this.getEntityManyToManyRelationships(entityName)
    ]);
    
    return {
      oneToMany,
      manyToMany
    };
  }

  /**
   * Get a global option set definition by name
   * @param optionSetName The name of the global option set
   * @returns The global option set definition
   */
  async getGlobalOptionSet(optionSetName: string): Promise<any> {
    return this.makeRequest(`api/data/v9.2/GlobalOptionSetDefinitions(Name='${optionSetName}')`);
  }

  /**
   * Get a specific record by entity name (plural) and ID
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param recordId The GUID of the record
   * @returns The record data
   */
  async getRecord(entityNamePlural: string, recordId: string): Promise<any> {
    return this.makeRequest(`api/data/v9.2/${entityNamePlural}(${recordId})`);
  }

  /**
   * Query records using entity name (plural) and a filter expression
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param filter OData filter expression (e.g., "name eq 'test'")
   * @param maxRecords Maximum number of records to retrieve (default: 50)
   * @returns Filtered list of records
   */
  async queryRecords(entityNamePlural: string, filter: string, maxRecords: number = 50): Promise<ApiCollectionResponse<any>> {
    return this.makeRequest<ApiCollectionResponse<any>>(`api/data/v9.2/${entityNamePlural}?$filter=${encodeURIComponent(filter)}&$top=${maxRecords}`);
  }

  /**
   * Create a new record in Dataverse
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param data Record data as JSON object (field names must match logical names)
   * @returns Created record with ID and OData context
   */
  async createRecord(entityNamePlural: string, data: Record<string, any>): Promise<any> {
    const timer = auditLogger.startTimer();

    try {
      // Validate data is not empty
      if (!data || Object.keys(data).length === 0) {
        throw new Error('Record data cannot be empty');
      }

      // Make POST request to create record
      const response = await this.makeRequest(
        `api/data/v9.2/${entityNamePlural}`,
        'POST',
        data,
        {
          'Prefer': 'return=representation', // Return the created record
        }
      );

      // Audit logging
      auditLogger.log({
        operation: 'create-record',
        operationType: 'CREATE',
        componentType: 'Record',
        componentName: entityNamePlural,
        success: true,
        executionTimeMs: timer(),
      });

      return response;
    } catch (error: any) {
      // Audit failed operation
      auditLogger.log({
        operation: 'create-record',
        operationType: 'CREATE',
        componentType: 'Record',
        componentName: entityNamePlural,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Update an existing record in Dataverse
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param recordId The GUID of the record to update
   * @param data Partial record data to update (only fields being changed)
   * @returns Updated record (if Prefer header used) or void
   */
  async updateRecord(
    entityNamePlural: string,
    recordId: string,
    data: Record<string, any>
  ): Promise<any> {
    const timer = auditLogger.startTimer();

    try {
      // Validate data is not empty
      if (!data || Object.keys(data).length === 0) {
        throw new Error('Update data cannot be empty');
      }

      // Validate recordId is a valid GUID
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!guidRegex.test(recordId)) {
        throw new Error(`Invalid record ID format: ${recordId}. Must be a valid GUID.`);
      }

      // Make PATCH request to update record
      const response = await this.makeRequest(
        `api/data/v9.2/${entityNamePlural}(${recordId})`,
        'PATCH',
        data,
        {
          'Prefer': 'return=representation', // Return the updated record
        }
      );

      // Audit logging
      auditLogger.log({
        operation: 'update-record',
        operationType: 'UPDATE',
        componentType: 'Record',
        componentName: `${entityNamePlural}(${recordId})`,
        success: true,
        executionTimeMs: timer(),
      });

      return response;
    } catch (error: any) {
      // Audit failed operation
      auditLogger.log({
        operation: 'update-record',
        operationType: 'UPDATE',
        componentType: 'Record',
        componentName: `${entityNamePlural}(${recordId})`,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Delete a record from Dataverse
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param recordId The GUID of the record to delete
   * @returns Void (successful deletion returns 204 No Content)
   */
  async deleteRecord(entityNamePlural: string, recordId: string): Promise<void> {
    const timer = auditLogger.startTimer();

    try {
      // Validate recordId is a valid GUID
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!guidRegex.test(recordId)) {
        throw new Error(`Invalid record ID format: ${recordId}. Must be a valid GUID.`);
      }

      // Make DELETE request
      await this.makeRequest(
        `api/data/v9.2/${entityNamePlural}(${recordId})`,
        'DELETE'
      );

      // Audit logging
      auditLogger.log({
        operation: 'delete-record',
        operationType: 'DELETE',
        componentType: 'Record',
        componentName: `${entityNamePlural}(${recordId})`,
        success: true,
        executionTimeMs: timer(),
      });
    } catch (error: any) {
      // Audit failed operation
      auditLogger.log({
        operation: 'delete-record',
        operationType: 'DELETE',
        componentType: 'Record',
        componentName: `${entityNamePlural}(${recordId})`,
        success: false,
        error: error.message,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get all plugin assemblies in the environment
   * @param includeManaged Include managed assemblies (default: false)
   * @param maxRecords Maximum number of assemblies to return (default: 100)
   * @returns List of plugin assemblies with basic information
   */
  async getPluginAssemblies(includeManaged: boolean = false, maxRecords: number = 100): Promise<any> {
    const managedFilter = includeManaged ? '' : '$filter=ismanaged eq false&';

    const assemblies = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/pluginassemblies?${managedFilter}$select=pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,major,minor,createdon,modifiedon,ismanaged,ishidden&$expand=modifiedby($select=fullname)&$orderby=name&$top=${maxRecords}`
    );

    // Filter out hidden assemblies and format the results with more readable properties
    // Note: ishidden is a ManagedProperty object with a Value property
    const formattedAssemblies = assemblies.value
      .filter((assembly: any) => {
        const isHidden = assembly.ishidden?.Value !== undefined ? assembly.ishidden.Value : assembly.ishidden;
        return !isHidden;
      })
      .map((assembly: any) => ({
        pluginassemblyid: assembly.pluginassemblyid,
        name: assembly.name,
        version: assembly.version,
        isolationMode: assembly.isolationmode === 1 ? 'None' : assembly.isolationmode === 2 ? 'Sandbox' : 'External',
        isManaged: assembly.ismanaged,
        modifiedOn: assembly.modifiedon,
        modifiedBy: assembly.modifiedby?.fullname,
        major: assembly.major,
        minor: assembly.minor
      }));

    return {
      totalCount: formattedAssemblies.length,
      assemblies: formattedAssemblies
    };
  }

  /**
   * Get a plugin assembly by name with all related plugin types, steps, and images
   * @param assemblyName The name of the plugin assembly
   * @param includeDisabled Include disabled steps (default: false)
   * @returns Complete plugin assembly information with validation
   */
  async getPluginAssemblyComplete(assemblyName: string, includeDisabled: boolean = false): Promise<any> {
    // Get the plugin assembly (excluding content_binary which is large and not useful for review)
    const assemblies = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/pluginassemblies?$filter=name eq '${assemblyName}'&$select=pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,major,minor,createdon,modifiedon,ismanaged,ishidden,description&$expand=modifiedby($select=fullname)`
    );

    if (!assemblies.value || assemblies.value.length === 0) {
      throw new Error(`Plugin assembly '${assemblyName}' not found`);
    }

    const assembly = assemblies.value[0];
    const assemblyId = assembly.pluginassemblyid;

    // Get plugin types for this assembly
    const pluginTypes = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/plugintypes?$filter=_pluginassemblyid_value eq ${assemblyId}&$select=plugintypeid,typename,friendlyname,name,assemblyname,description,workflowactivitygroupname`
    );

    // Get all steps for each plugin type
    const pluginTypeIds = pluginTypes.value.map((pt: any) => pt.plugintypeid);
    let allSteps: any[] = [];

    if (pluginTypeIds.length > 0) {
      const statusFilter = includeDisabled ? '' : ' and statuscode eq 1';
      // Build filter for all plugin type IDs
      const typeFilter = pluginTypeIds.map((id: string) => `_plugintypeid_value eq ${id}`).join(' or ');
      const steps = await this.makeRequest<ApiCollectionResponse<any>>(
        `api/data/v9.2/sdkmessageprocessingsteps?$filter=(${typeFilter})${statusFilter}&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,asyncautodelete,filteringattributes,supporteddeployment,configuration,description,invocationsource,_plugintypeid_value,_sdkmessagefilterid_value,_impersonatinguserid_value,_eventhandler_value&$expand=sdkmessageid($select=name),plugintypeid($select=typename),impersonatinguserid($select=fullname),modifiedby($select=fullname),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=stage,rank`
      );
      allSteps = steps.value;
    }

    // Get all images for these steps
    const stepIds = allSteps.map((s: any) => s.sdkmessageprocessingstepid);
    let allImages: any[] = [];

    if (stepIds.length > 0) {
      // Build filter for all step IDs
      const imageFilter = stepIds.map((id: string) => `_sdkmessageprocessingstepid_value eq ${id}`).join(' or ');
      const images = await this.makeRequest<ApiCollectionResponse<any>>(
        `api/data/v9.2/sdkmessageprocessingstepimages?$filter=${imageFilter}&$select=sdkmessageprocessingstepimageid,name,imagetype,messagepropertyname,entityalias,attributes,_sdkmessageprocessingstepid_value`
      );
      allImages = images.value;
    }

    // Attach images to their respective steps
    const stepsWithImages = allSteps.map((step: any) => ({
      ...step,
      images: allImages.filter((img: any) => img._sdkmessageprocessingstepid_value === step.sdkmessageprocessingstepid)
    }));

    // Validation checks
    const validation = {
      hasDisabledSteps: allSteps.some((s: any) => s.statuscode !== 1),
      hasAsyncSteps: allSteps.some((s: any) => s.mode === 1),
      hasSyncSteps: allSteps.some((s: any) => s.mode === 0),
      stepsWithoutFilteringAttributes: stepsWithImages
        .filter((s: any) => (s.sdkmessageid?.name === 'Update' || s.sdkmessageid?.name === 'Delete') && !s.filteringattributes)
        .map((s: any) => s.name),
      stepsWithoutImages: stepsWithImages
        .filter((s: any) => s.images.length === 0 && (s.sdkmessageid?.name === 'Update' || s.sdkmessageid?.name === 'Delete'))
        .map((s: any) => s.name),
      potentialIssues: [] as string[]
    };

    // Add potential issues
    if (validation.stepsWithoutFilteringAttributes.length > 0) {
      validation.potentialIssues.push(`${validation.stepsWithoutFilteringAttributes.length} Update/Delete steps without filtering attributes (performance concern)`);
    }
    if (validation.stepsWithoutImages.length > 0) {
      validation.potentialIssues.push(`${validation.stepsWithoutImages.length} Update/Delete steps without images (may need entity data)`);
    }

    return {
      assembly,
      pluginTypes: pluginTypes.value,
      steps: stepsWithImages,
      validation
    };
  }

  /**
   * Get all plugins that execute on a specific entity, organized by message and execution order
   * @param entityName The logical name of the entity
   * @param messageFilter Optional filter by message name (e.g., "Create", "Update")
   * @param includeDisabled Include disabled steps (default: false)
   * @returns Complete plugin pipeline for the entity
   */
  async getEntityPluginPipeline(entityName: string, messageFilter?: string, includeDisabled: boolean = false): Promise<any> {
    const statusFilter = includeDisabled ? '' : ' and statuscode eq 1';
    const msgFilter = messageFilter ? ` and sdkmessageid/name eq '${messageFilter}'` : '';

    // Get all steps for this entity
    const steps = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/sdkmessageprocessingsteps?$filter=sdkmessagefilterid/primaryobjecttypecode eq '${entityName}'${statusFilter}${msgFilter}&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,asyncautodelete,filteringattributes,supporteddeployment,configuration,description,_plugintypeid_value,_sdkmessagefilterid_value,_impersonatinguserid_value&$expand=sdkmessageid($select=name),plugintypeid($select=typename),impersonatinguserid($select=fullname),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=stage,rank`
    );

    // Get assembly information for each plugin type (filter out nulls)
    const pluginTypeIds = [...new Set(steps.value.map((s: any) => s._plugintypeid_value).filter((id: any) => id != null))];
    const assemblyMap = new Map();

    for (const typeId of pluginTypeIds) {
      const pluginType = await this.makeRequest<any>(
        `api/data/v9.2/plugintypes(${typeId})?$expand=pluginassemblyid($select=name,version)`
      );
      assemblyMap.set(typeId, pluginType.pluginassemblyid);
    }

    // Get images for all steps
    const stepIds = steps.value.map((s: any) => s.sdkmessageprocessingstepid);
    let allImages: any[] = [];

    if (stepIds.length > 0) {
      const imageFilter = stepIds.map((id: string) => `_sdkmessageprocessingstepid_value eq ${id}`).join(' or ');
      const images = await this.makeRequest<ApiCollectionResponse<any>>(
        `api/data/v9.2/sdkmessageprocessingstepimages?$filter=${imageFilter}&$select=sdkmessageprocessingstepimageid,name,imagetype,messagepropertyname,entityalias,attributes,_sdkmessageprocessingstepid_value`
      );
      allImages = images.value;
    }

    // Format steps with all information
    const formattedSteps = steps.value.map((step: any) => {
      const assembly = assemblyMap.get(step._plugintypeid_value);
      const images = allImages.filter((img: any) => img._sdkmessageprocessingstepid_value === step.sdkmessageprocessingstepid);

      return {
        sdkmessageprocessingstepid: step.sdkmessageprocessingstepid,
        name: step.name,
        stage: step.stage,
        stageName: step.stage === 10 ? 'PreValidation' : step.stage === 20 ? 'PreOperation' : 'PostOperation',
        mode: step.mode,
        modeName: step.mode === 0 ? 'Synchronous' : 'Asynchronous',
        rank: step.rank,
        message: step.sdkmessageid?.name,
        pluginType: step.plugintypeid?.typename,
        assemblyName: assembly?.name,
        assemblyVersion: assembly?.version,
        filteringAttributes: step.filteringattributes ? step.filteringattributes.split(',') : [],
        statuscode: step.statuscode,
        enabled: step.statuscode === 1,
        deployment: step.supporteddeployment === 0 ? 'Server' : step.supporteddeployment === 1 ? 'Offline' : 'Both',
        impersonatingUser: step.impersonatinguserid?.fullname,
        hasPreImage: images.some((img: any) => img.imagetype === 0 || img.imagetype === 2),
        hasPostImage: images.some((img: any) => img.imagetype === 1 || img.imagetype === 2),
        images: images
      };
    });

    // Organize by message
    const messageGroups = new Map();
    formattedSteps.forEach((step: any) => {
      if (!messageGroups.has(step.message)) {
        messageGroups.set(step.message, {
          messageName: step.message,
          stages: {
            preValidation: [],
            preOperation: [],
            postOperation: []
          }
        });
      }
      const msg = messageGroups.get(step.message);
      if (step.stage === 10) msg.stages.preValidation.push(step);
      else if (step.stage === 20) msg.stages.preOperation.push(step);
      else if (step.stage === 40) msg.stages.postOperation.push(step);
    });

    return {
      entity: entityName,
      messages: Array.from(messageGroups.values()),
      steps: formattedSteps,
      executionOrder: formattedSteps.map((s: any) => s.name)
    };
  }

  /**
   * Get plugin trace logs with filtering
   * @param options Filtering options for trace logs
   * @returns Filtered trace logs with parsed exception details
   */
  async getPluginTraceLogs(options: {
    entityName?: string;
    messageName?: string;
    correlationId?: string;
    pluginStepId?: string;
    exceptionOnly?: boolean;
    hoursBack?: number;
    maxRecords?: number;
  }): Promise<any> {
    const {
      entityName,
      messageName,
      correlationId,
      pluginStepId,
      exceptionOnly = false,
      hoursBack = 24,
      maxRecords = 50
    } = options;

    // Build filter
    const filters: string[] = [];

    // Date filter
    const dateThreshold = new Date();
    dateThreshold.setHours(dateThreshold.getHours() - hoursBack);
    filters.push(`createdon gt ${dateThreshold.toISOString()}`);

    if (entityName) filters.push(`primaryentity eq '${entityName}'`);
    if (messageName) filters.push(`messagename eq '${messageName}'`);
    if (correlationId) filters.push(`correlationid eq '${correlationId}'`);
    if (pluginStepId) filters.push(`_sdkmessageprocessingstepid_value eq ${pluginStepId}`);
    if (exceptionOnly) filters.push(`exceptiondetails ne null`);

    const filterString = filters.join(' and ');

    const logs = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/plugintracelogs?$filter=${filterString}&$orderby=createdon desc&$top=${maxRecords}`
    );

    // Parse logs for better readability
    const parsedLogs = logs.value.map((log: any) => ({
      ...log,
      modeName: log.mode === 0 ? 'Synchronous' : 'Asynchronous',
      operationTypeName: this.getOperationTypeName(log.operationtype),
      parsed: {
        hasException: !!log.exceptiondetails,
        exceptionType: log.exceptiondetails ? this.extractExceptionType(log.exceptiondetails) : null,
        exceptionMessage: log.exceptiondetails ? this.extractExceptionMessage(log.exceptiondetails) : null,
        stackTrace: log.exceptiondetails
      }
    }));

    return {
      totalCount: parsedLogs.length,
      logs: parsedLogs
    };
  }

  // Helper methods for trace log parsing
  private getOperationTypeName(operationType: number): string {
    const types: { [key: number]: string } = {
      0: 'None',
      1: 'Create',
      2: 'Update',
      3: 'Delete',
      4: 'Retrieve',
      5: 'RetrieveMultiple',
      6: 'Associate',
      7: 'Disassociate'
    };
    return types[operationType] || 'Unknown';
  }

  private extractExceptionType(exceptionDetails: string): string | null {
    const match = exceptionDetails.match(/^([^:]+):/);
    return match ? match[1].trim() : null;
  }

  private extractExceptionMessage(exceptionDetails: string): string | null {
    const lines = exceptionDetails.split('\n');
    if (lines.length > 0) {
      const firstLine = lines[0];
      const colonIndex = firstLine.indexOf(':');
      if (colonIndex > 0) {
        return firstLine.substring(colonIndex + 1).trim();
      }
    }
    return null;
  }

  /**
   * Get all Power Automate flows (cloud flows) in the environment
   * @param activeOnly Only return activated flows (default: false)
   * @param maxRecords Maximum number of flows to return (default: 100)
   * @returns List of Power Automate flows with basic information
   */
  async getFlows(activeOnly: boolean = false, maxRecords: number = 100): Promise<any> {
    // Category 5 = Modern Flow (Power Automate cloud flows)
    // StateCode: 0=Draft, 1=Activated, 2=Suspended
    // Type: 1=Definition, 2=Activation
    const stateFilter = activeOnly ? ' and statecode eq 1' : '';

    const flows = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/workflows?$filter=category eq 5${stateFilter}&$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,ismanaged,iscrmuiworkflow,primaryentity,clientdata&$expand=modifiedby($select=fullname)&$orderby=modifiedon desc&$top=${maxRecords}`
    );

    // Format the results for better readability
    const formattedFlows = flows.value.map((flow: any) => ({
      workflowid: flow.workflowid,
      name: flow.name,
      description: flow.description,
      state: flow.statecode === 0 ? 'Draft' : flow.statecode === 1 ? 'Activated' : 'Suspended',
      statecode: flow.statecode,
      statuscode: flow.statuscode,
      type: flow.type === 1 ? 'Definition' : flow.type === 2 ? 'Activation' : 'Template',
      primaryEntity: flow.primaryentity,
      isManaged: flow.ismanaged,
      ownerId: flow._ownerid_value,
      modifiedOn: flow.modifiedon,
      modifiedBy: flow.modifiedby?.fullname,
      createdOn: flow.createdon,
      hasDefinition: !!flow.clientdata
    }));

    return {
      totalCount: formattedFlows.length,
      flows: formattedFlows
    };
  }

  /**
   * Get a specific Power Automate flow with its complete definition
   * @param flowId The GUID of the flow (workflowid)
   * @returns Complete flow information including the flow definition JSON
   */
  async getFlowDefinition(flowId: string): Promise<any> {
    const flow = await this.makeRequest<any>(
      `api/data/v9.2/workflows(${flowId})?$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,category,ismanaged,iscrmuiworkflow,primaryentity,clientdata,xaml&$expand=modifiedby($select=fullname),createdby($select=fullname)`
    );

    // Parse the clientdata (flow definition) if it exists
    let flowDefinition = null;
    if (flow.clientdata) {
      try {
        flowDefinition = JSON.parse(flow.clientdata);
      } catch (error) {
        console.error('Failed to parse flow definition JSON:', error);
        flowDefinition = { parseError: 'Failed to parse flow definition', raw: flow.clientdata };
      }
    }

    return {
      workflowid: flow.workflowid,
      name: flow.name,
      description: flow.description,
      state: flow.statecode === 0 ? 'Draft' : flow.statecode === 1 ? 'Activated' : 'Suspended',
      statecode: flow.statecode,
      statuscode: flow.statuscode,
      type: flow.type === 1 ? 'Definition' : flow.type === 2 ? 'Activation' : 'Template',
      category: flow.category,
      primaryEntity: flow.primaryentity,
      isManaged: flow.ismanaged,
      ownerId: flow._ownerid_value,
      createdOn: flow.createdon,
      createdBy: flow.createdby?.fullname,
      modifiedOn: flow.modifiedon,
      modifiedBy: flow.modifiedby?.fullname,
      flowDefinition: flowDefinition
    };
  }

  /**
   * Get flow run history for a specific Power Automate flow
   * @param flowId The GUID of the flow (workflowid)
   * @param maxRecords Maximum number of runs to return (default: 100)
   * @returns List of flow runs with status, start time, duration, and error details
   */
  async getFlowRuns(flowId: string, maxRecords: number = 100): Promise<any> {
    // Flow runs are stored in the flowruns entity (not flowsession)
    // Status: "Succeeded", "Failed", "Faulted", "TimedOut", "Cancelled", "Running", etc.

    const flowRuns = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/flowruns?$filter=_workflow_value eq ${flowId}&$select=flowrunid,name,status,starttime,endtime,duration,errormessage,errorcode,triggertype&$orderby=starttime desc&$top=${maxRecords}`
    );

    // Format the results for better readability
    const formattedRuns = flowRuns.value.map((run: any) => {
      // Parse error message if it's JSON
      let parsedError = run.errormessage;
      if (run.errormessage) {
        try {
          parsedError = JSON.parse(run.errormessage);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }

      return {
        flowrunid: run.flowrunid,
        name: run.name,
        status: run.status,
        startedOn: run.starttime,
        completedOn: run.endtime,
        duration: run.duration,
        errorMessage: parsedError || null,
        errorCode: run.errorcode || null,
        triggerType: run.triggertype || null
      };
    });

    return {
      flowId: flowId,
      totalCount: formattedRuns.length,
      runs: formattedRuns
    };
  }

  /**
   * Get all classic Dynamics workflows in the environment
   * @param activeOnly Only return activated workflows (default: false)
   * @param maxRecords Maximum number of workflows to return (default: 100)
   * @returns List of classic workflows with basic information
   */
  async getWorkflows(activeOnly: boolean = false, maxRecords: number = 100): Promise<any> {
    // Category 0 = Classic Workflow
    // StateCode: 0=Draft, 1=Activated, 2=Suspended
    // Type: 1=Definition, 2=Activation
    const stateFilter = activeOnly ? ' and statecode eq 1' : '';

    const workflows = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/workflows?$filter=category eq 0${stateFilter}&$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,ismanaged,iscrmuiworkflow,primaryentity,mode,subprocess,ondemand,triggeroncreate,triggerondelete,syncworkflowlogonfailure&$expand=ownerid($select=fullname),modifiedby($select=fullname)&$orderby=modifiedon desc&$top=${maxRecords}`
    );

    // Format the results for better readability
    const formattedWorkflows = workflows.value.map((workflow: any) => ({
      workflowid: workflow.workflowid,
      name: workflow.name,
      description: workflow.description,
      state: workflow.statecode === 0 ? 'Draft' : workflow.statecode === 1 ? 'Activated' : 'Suspended',
      statecode: workflow.statecode,
      statuscode: workflow.statuscode,
      type: workflow.type === 1 ? 'Definition' : workflow.type === 2 ? 'Activation' : 'Template',
      mode: workflow.mode === 0 ? 'Background' : 'Real-time',
      primaryEntity: workflow.primaryentity,
      isManaged: workflow.ismanaged,
      isOnDemand: workflow.ondemand,
      triggerOnCreate: workflow.triggeroncreate,
      triggerOnDelete: workflow.triggerondelete,
      isSubprocess: workflow.subprocess,
      owner: workflow.ownerid?.fullname,
      modifiedOn: workflow.modifiedon,
      modifiedBy: workflow.modifiedby?.fullname,
      createdOn: workflow.createdon
    }));

    return {
      totalCount: formattedWorkflows.length,
      workflows: formattedWorkflows
    };
  }

  /**
   * Get a specific classic workflow with its complete XAML definition
   * @param workflowId The GUID of the workflow (workflowid)
   * @returns Complete workflow information including the XAML definition
   */
  async getWorkflowDefinition(workflowId: string): Promise<any> {
    const workflow = await this.makeRequest<any>(
      `api/data/v9.2/workflows(${workflowId})?$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,category,ismanaged,iscrmuiworkflow,primaryentity,mode,subprocess,ondemand,triggeroncreate,triggerondelete,triggeronupdateattributelist,syncworkflowlogonfailure,xaml&$expand=ownerid($select=fullname),modifiedby($select=fullname),createdby($select=fullname)`
    );

    return {
      workflowid: workflow.workflowid,
      name: workflow.name,
      description: workflow.description,
      state: workflow.statecode === 0 ? 'Draft' : workflow.statecode === 1 ? 'Activated' : 'Suspended',
      statecode: workflow.statecode,
      statuscode: workflow.statuscode,
      type: workflow.type === 1 ? 'Definition' : workflow.type === 2 ? 'Activation' : 'Template',
      category: workflow.category,
      mode: workflow.mode === 0 ? 'Background' : 'Real-time',
      primaryEntity: workflow.primaryentity,
      isManaged: workflow.ismanaged,
      isOnDemand: workflow.ondemand,
      triggerOnCreate: workflow.triggeroncreate,
      triggerOnDelete: workflow.triggerondelete,
      triggerOnUpdateAttributes: workflow.triggeronupdateattributelist ? workflow.triggeronupdateattributelist.split(',') : [],
      isSubprocess: workflow.subprocess,
      syncWorkflowLogOnFailure: workflow.syncworkflowlogonfailure,
      owner: workflow.ownerid?.fullname,
      createdOn: workflow.createdon,
      createdBy: workflow.createdby?.fullname,
      modifiedOn: workflow.modifiedon,
      modifiedBy: workflow.modifiedby?.fullname,
      xaml: workflow.xaml
    };
  }

  /**
   * Get all business rules in the environment
   * @param activeOnly Only return activated business rules (default: false)
   * @param maxRecords Maximum number of business rules to return (default: 100)
   * @returns List of business rules with basic information
   */
  async getBusinessRules(activeOnly: boolean = false, maxRecords: number = 100): Promise<any> {
    // Category 2 = Business Rule
    // StateCode: 0=Draft, 1=Activated, 2=Suspended
    // Type: 1=Definition
    const stateFilter = activeOnly ? ' and statecode eq 1' : '';

    const businessRules = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/workflows?$filter=category eq 2${stateFilter}&$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,ismanaged,primaryentity&$expand=ownerid($select=fullname),modifiedby($select=fullname)&$orderby=modifiedon desc&$top=${maxRecords}`
    );

    // Format the results for better readability
    const formattedBusinessRules = businessRules.value.map((rule: any) => ({
      workflowid: rule.workflowid,
      name: rule.name,
      description: rule.description,
      state: rule.statecode === 0 ? 'Draft' : rule.statecode === 1 ? 'Activated' : 'Suspended',
      statecode: rule.statecode,
      statuscode: rule.statuscode,
      type: rule.type === 1 ? 'Definition' : rule.type === 2 ? 'Activation' : 'Template',
      primaryEntity: rule.primaryentity,
      isManaged: rule.ismanaged,
      owner: rule.ownerid?.fullname,
      modifiedOn: rule.modifiedon,
      modifiedBy: rule.modifiedby?.fullname,
      createdOn: rule.createdon
    }));

    return {
      totalCount: formattedBusinessRules.length,
      businessRules: formattedBusinessRules
    };
  }

  /**
   * Get a specific business rule with its complete XAML definition
   * @param workflowId The GUID of the business rule (workflowid)
   * @returns Complete business rule information including the XAML definition
   */
  async getBusinessRule(workflowId: string): Promise<any> {
    const businessRule = await this.makeRequest<any>(
      `api/data/v9.2/workflows(${workflowId})?$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,category,ismanaged,primaryentity,xaml&$expand=ownerid($select=fullname),modifiedby($select=fullname),createdby($select=fullname)`
    );

    // Verify it's actually a business rule
    if (businessRule.category !== 2) {
      throw new Error(`Workflow ${workflowId} is not a business rule (category: ${businessRule.category})`);
    }

    return {
      workflowid: businessRule.workflowid,
      name: businessRule.name,
      description: businessRule.description,
      state: businessRule.statecode === 0 ? 'Draft' : businessRule.statecode === 1 ? 'Activated' : 'Suspended',
      statecode: businessRule.statecode,
      statuscode: businessRule.statuscode,
      type: businessRule.type === 1 ? 'Definition' : businessRule.type === 2 ? 'Activation' : 'Template',
      category: businessRule.category,
      primaryEntity: businessRule.primaryentity,
      isManaged: businessRule.ismanaged,
      owner: businessRule.ownerid?.fullname,
      createdOn: businessRule.createdon,
      createdBy: businessRule.createdby?.fullname,
      modifiedOn: businessRule.modifiedon,
      modifiedBy: businessRule.modifiedby?.fullname,
      xaml: businessRule.xaml
    };
  }

  // ==================== MODEL-DRIVEN APP OPERATIONS ====================

  /**
   * Get all model-driven apps in the environment
   * @param activeOnly Only return active apps (default: false)
   * @param maxRecords Maximum number of apps to return (default: 100)
   * @returns List of model-driven apps with basic information
   */
  async getApps(
    activeOnly: boolean = false,
    maxRecords: number = 100,
    includeUnpublished: boolean = true,
    solutionUniqueName?: string
  ): Promise<any> {
    // Build filter conditions
    const filters: string[] = [];

    // StateCode: 0=Active, 1=Inactive
    if (activeOnly) {
      filters.push('statecode eq 0');
    }

    // Published status: publishedon null = unpublished
    if (!includeUnpublished) {
      filters.push('publishedon ne null');
    }

    const filterString = filters.length > 0 ? `&$filter=${filters.join(' and ')}` : '';

    const apps = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/appmodules?$select=appmoduleid,name,uniquename,description,webresourceid,clienttype,formfactor,navigationtype,url,isfeatured,isdefault,publishedon,statecode,statuscode,_publisherid_value,createdon,modifiedon&$orderby=modifiedon desc&$top=${maxRecords}${filterString}`
    );

    // If solution filter specified, filter results by solution
    let filteredApps = apps.value;
    if (solutionUniqueName) {
      // Query solution components to find apps in the specified solution
      const solution = await this.makeRequest<ApiCollectionResponse<any>>(
        `api/data/v9.2/solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid`
      );

      if (solution.value.length > 0) {
        const solutionId = solution.value[0].solutionid;

        // Query solution components for app modules
        const solutionComponents = await this.makeRequest<ApiCollectionResponse<any>>(
          `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solutionId} and componenttype eq 80&$select=objectid`
        );

        const appIdsInSolution = new Set(solutionComponents.value.map((c: any) => c.objectid.toLowerCase()));
        filteredApps = apps.value.filter((app: any) => appIdsInSolution.has(app.appmoduleid.toLowerCase()));
      }
    }

    // Format the results for better readability
    const formattedApps = filteredApps.map((app: any) => ({
      appmoduleid: app.appmoduleid,
      name: app.name,
      uniquename: app.uniquename,
      description: app.description,
      webresourceid: app.webresourceid,
      clienttype: app.clienttype,
      formfactor: app.formfactor,
      navigationtype: app.navigationtype,
      url: app.url,
      isfeatured: app.isfeatured,
      isdefault: app.isdefault,
      state: app.statecode === 0 ? 'Active' : 'Inactive',
      statecode: app.statecode,
      statuscode: app.statuscode,
      publishedon: app.publishedon,
      published: app.publishedon ? true : false,
      publisherid: app._publisherid_value || null,
      createdon: app.createdon,
      modifiedon: app.modifiedon
    }));

    return {
      totalCount: formattedApps.length,
      apps: formattedApps,
      filters: {
        activeOnly,
        includeUnpublished,
        solutionUniqueName: solutionUniqueName || 'all'
      }
    };
  }

  /**
   * Get a specific model-driven app by ID
   * @param appId The GUID of the app (appmoduleid)
   * @returns Complete app information including publisher details
   */
  async getApp(appId: string): Promise<any> {
    const app = await this.makeRequest<any>(
      `api/data/v9.2/appmodules(${appId})?$select=appmoduleid,name,uniquename,description,webresourceid,clienttype,formfactor,navigationtype,url,isfeatured,isdefault,publishedon,statecode,statuscode,configxml,createdon,modifiedon,_publisherid_value,_createdby_value,_modifiedby_value`
    );

    return {
      appmoduleid: app.appmoduleid,
      name: app.name,
      uniquename: app.uniquename,
      description: app.description,
      webresourceid: app.webresourceid,
      clienttype: app.clienttype,
      formfactor: app.formfactor,
      navigationtype: app.navigationtype === 0 ? 'Single Session' : 'Multi Session',
      url: app.url,
      isfeatured: app.isfeatured,
      isdefault: app.isdefault,
      state: app.statecode === 0 ? 'Active' : 'Inactive',
      statecode: app.statecode,
      statuscode: app.statuscode,
      publishedon: app.publishedon,
      createdon: app.createdon,
      modifiedon: app.modifiedon,
      createdBy: app._createdby_value || null,
      modifiedBy: app._modifiedby_value || null,
      publisherid: app._publisherid_value || null
    };
  }

  /**
   * Get all components (entities, forms, views, sitemaps) associated with an app
   * @param appId The GUID of the app (appmoduleid)
   * @returns List of app components with type information
   */
  async getAppComponents(appId: string): Promise<any> {
    const components = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/appmodulecomponents?$filter=_appmoduleidunique_value eq ${appId}&$select=appmodulecomponentid,objectid,componenttype,rootappmodulecomponentid,createdon,modifiedon&$orderby=componenttype asc`
    );

    // Map component type numbers to friendly names
    const componentTypeMap: { [key: number]: string } = {
      1: 'Entity',
      24: 'Form',
      26: 'View',
      29: 'Business Process Flow',
      48: 'Ribbon Command',
      59: 'Chart/Dashboard',
      60: 'System Form',
      62: 'SiteMap'
    };

    const formattedComponents = components.value.map((component: any) => ({
      appmodulecomponentid: component.appmodulecomponentid,
      objectid: component.objectid,
      componenttype: component.componenttype,
      componenttypeName: componentTypeMap[component.componenttype] || `Unknown (${component.componenttype})`,
      rootappmodulecomponentid: component.rootappmodulecomponentid,
      createdon: component.createdon,
      modifiedon: component.modifiedon
    }));

    // Group by component type for easier reading
    const groupedByType: { [key: string]: any[] } = {};
    formattedComponents.forEach((comp: any) => {
      const typeName = comp.componenttypeName;
      if (!groupedByType[typeName]) {
        groupedByType[typeName] = [];
      }
      groupedByType[typeName].push(comp);
    });

    return {
      totalCount: formattedComponents.length,
      components: formattedComponents,
      groupedByType
    };
  }

  /**
   * Get the sitemap for a specific app
   * @param appId The GUID of the app (appmoduleid)
   * @returns Sitemap information including XML
   */
  async getAppSitemap(appId: string): Promise<any> {
    // First get the app components to find the sitemap
    const components = await this.makeRequest<ApiCollectionResponse<any>>(
      `api/data/v9.2/appmodulecomponents?$filter=_appmoduleidunique_value eq ${appId} and componenttype eq 62&$select=objectid`
    );

    if (components.value.length === 0) {
      return {
        hasSitemap: false,
        message: 'No sitemap found for this app'
      };
    }

    // Get the sitemap details
    const sitemapId = components.value[0].objectid;
    const sitemap = await this.makeRequest<any>(
      `api/data/v9.2/sitemaps(${sitemapId})?$select=sitemapid,sitemapname,sitemapnameunique,sitemapxml,isappaware,enablecollapsiblegroups,showhome,showpinned,showrecents,ismanaged,createdon,modifiedon`
    );

    return {
      hasSitemap: true,
      sitemapid: sitemap.sitemapid,
      sitemapname: sitemap.sitemapname,
      sitemapnameunique: sitemap.sitemapnameunique,
      sitemapxml: sitemap.sitemapxml,
      isappaware: sitemap.isappaware,
      enablecollapsiblegroups: sitemap.enablecollapsiblegroups,
      showhome: sitemap.showhome,
      showpinned: sitemap.showpinned,
      showrecents: sitemap.showrecents,
      ismanaged: sitemap.ismanaged,
      createdon: sitemap.createdon,
      modifiedon: sitemap.modifiedon
    };
  }

  /**
   * Create a new model-driven app
   * @param appDefinition The app definition object
   * @param solutionUniqueName Optional solution to add the app to
   * @returns The created app information including ID
   */
  async createApp(appDefinition: any, solutionUniqueName?: string): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate uniquename format (English chars/numbers only, no spaces)
      const uniquename = appDefinition.uniquename;
      if (!/^[a-zA-Z0-9_]+$/.test(uniquename)) {
        throw new Error('App uniquename must contain only English letters, numbers, and underscores (no spaces)');
      }

      // Set defaults
      const appRequest = {
        name: appDefinition.name,
        uniquename: appDefinition.uniquename,
        description: appDefinition.description || '',
        webresourceid: appDefinition.webresourceid || '953b9fac-1e5e-e611-80d6-00155ded156f', // Default icon
        welcomepageid: '00000000-0000-0000-0000-000000000000', // Required: empty GUID for no welcome page
        clienttype: appDefinition.clienttype || 4, // UCI
        formfactor: appDefinition.formfactor || 1, // Unknown/All
        navigationtype: appDefinition.navigationtype !== undefined ? appDefinition.navigationtype : 0, // Single session
        isfeatured: appDefinition.isfeatured || false,
        isdefault: appDefinition.isdefault || false,
        url: appDefinition.url || ''
      };

      // Headers with solution context and return representation
      const headers: Record<string, string> = {
        'Prefer': 'return=representation'
      };
      if (solutionUniqueName) {
        headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
      }

      // Execute with rate limiting
      const response = await rateLimiter.execute(async () => {
        return await this.makeRequest<any>(
          'api/data/v9.2/appmodules',
          'POST',
          appRequest,
          headers
        );
      });

      // Extract app ID from response (now returned due to Prefer header)
      const appId = response.appmoduleid;

      if (!appId) {
        throw new Error('App creation response missing appmoduleid. Full response: ' + JSON.stringify(response));
      }

      // Verify the app is queryable (retry with delay if needed)
      let appVerified = false;
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelayMs = 2000;

      while (!appVerified && retryCount < maxRetries) {
        try {
          await this.makeRequest<any>(
            `api/data/v9.2/appmodules(${appId})?$select=appmoduleid,name,uniquename`
          );
          appVerified = true;
        } catch (error: any) {
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          }
        }
      }

      // Audit log success
      auditLogger.log({
        operation: 'createApp',
        operationType: 'CREATE',
        componentType: 'AppModule',
        componentName: appDefinition.name,
        componentId: appId,
        success: true,
        executionTimeMs: Date.now() - startTime
      });

      return {
        appId,
        name: appDefinition.name,
        uniquename: appDefinition.uniquename,
        verified: appVerified,
        message: appVerified
          ? 'App created successfully and verified. Remember to add entities, validate, and publish.'
          : `App created successfully (ID: ${appId}) but verification timed out. The app may need time to propagate in the system. Use get-app with the returned appId to check status.`
      };

    } catch (error: any) {
      // Audit log failure
      auditLogger.log({
        operation: 'createApp',
        operationType: 'CREATE',
        componentType: 'AppModule',
        componentName: appDefinition.name,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });

      throw new Error(`Failed to create app: ${error.message}`);
    }
  }

  /**
   * Create a sitemap from simplified configuration (no XML knowledge required)
   * @param config Simplified sitemap configuration
   * @param solutionUniqueName Optional solution to add the sitemap to
   * @returns The created sitemap information including ID and XML
   */
  async createSimpleSitemap(config: any, solutionUniqueName?: string): Promise<any> {
    const startTime = Date.now();

    try {
      // Generate sitemap XML from simplified configuration
      let xml = '<SiteMap>';

      config.areas.forEach((area: any) => {
        xml += `<Area Id="${area.id}"`;
        if (area.icon) {
          xml += ` Icon="${area.icon}"`;
        }
        if (area.showGroups !== undefined) {
          xml += ` ShowGroups="${area.showGroups}"`;
        }
        xml += '>';
        xml += `<Titles><Title LCID="1033" Title="${this.escapeXml(area.title)}" /></Titles>`;
        if (area.description) {
          xml += `<Descriptions><Description LCID="1033" Description="${this.escapeXml(area.description)}" /></Descriptions>`;
        }

        area.groups.forEach((group: any) => {
          xml += `<Group Id="${group.id}"`;
          if (group.isProfile !== undefined) {
            xml += ` IsProfile="${group.isProfile}"`;
          }
          xml += '>';
          xml += `<Titles><Title LCID="1033" Title="${this.escapeXml(group.title)}" /></Titles>`;
          if (group.description) {
            xml += `<Descriptions><Description LCID="1033" Description="${this.escapeXml(group.description)}" /></Descriptions>`;
          }

          group.subareas.forEach((subarea: any) => {
            xml += `<SubArea Id="${subarea.id}"`;
            if (subarea.entity) {
              xml += ` Entity="${subarea.entity}"`;
            }
            if (subarea.url) {
              xml += ` Url="${subarea.url}"`;
            }
            if (subarea.icon) {
              xml += ` Icon="${subarea.icon}"`;
            }
            if (subarea.availableOffline !== undefined) {
              xml += ` AvailableOffline="${subarea.availableOffline}"`;
            }
            if (subarea.passParams !== undefined) {
              xml += ` PassParams="${subarea.passParams}"`;
            }
            xml += '>';
            xml += `<Titles><Title LCID="1033" Title="${this.escapeXml(subarea.title)}" /></Titles>`;
            if (subarea.description) {
              xml += `<Descriptions><Description LCID="1033" Description="${this.escapeXml(subarea.description)}" /></Descriptions>`;
            }
            xml += '</SubArea>';
          });

          xml += '</Group>';
        });

        xml += '</Area>';
      });

      xml += '</SiteMap>';

      // Create sitemap entity
      const sitemapRequest = {
        sitemapname: config.name,
        sitemapxml: xml,
        isappaware: true,
        enablecollapsiblegroups: config.enableCollapsibleGroups !== undefined ? config.enableCollapsibleGroups : false,
        showhome: config.showHome !== undefined ? config.showHome : true,
        showpinned: config.showPinned !== undefined ? config.showPinned : true,
        showrecents: config.showRecents !== undefined ? config.showRecents : true
      };

      // Headers with solution context
      const headers: Record<string, string> = {};
      if (solutionUniqueName) {
        headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
      }

      // Execute with rate limiting
      const response = await rateLimiter.execute(async () => {
        return await this.makeRequest<any>(
          'api/data/v9.2/sitemaps',
          'POST',
          sitemapRequest,
          headers
        );
      });

      // Extract sitemap ID from response
      const sitemapId = response.sitemapid;

      // Audit log success
      auditLogger.log({
        operation: 'createSimpleSitemap',
        operationType: 'CREATE',
        componentType: 'SiteMap',
        componentName: config.name,
        componentId: sitemapId,
        success: true,
        executionTimeMs: Date.now() - startTime
      });

      return {
        sitemapId,
        sitemapName: config.name,
        sitemapXml: xml,
        message: 'Sitemap created successfully. Add it to your app using add-entities-to-app or add specific components.'
      };

    } catch (error: any) {
      // Audit log failure
      auditLogger.log({
        operation: 'createSimpleSitemap',
        operationType: 'CREATE',
        componentType: 'SiteMap',
        componentName: config.name,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });

      throw new Error(`Failed to create sitemap: ${error.message}`);
    }
  }

  /**
   * Add entities to an app by modifying the sitemap XML
   * @param appId The GUID of the app
   * @param entityNames Array of entity logical names to add
   * @returns Result of the operation
   */
  async addEntitiesToApp(appId: string, entityNames: string[]): Promise<any> {
    const startTime = Date.now();

    try {
      // Get app details
      const app = await this.makeRequest<any>(
        `api/data/v9.2/appmodules(${appId})?$select=appmoduleid,name,uniquename`
      );

      // Validate entities exist and get their display names
      const entityPromises = entityNames.map(name =>
        this.makeRequest<any>(`api/data/v9.2/EntityDefinitions(LogicalName='${name}')?$select=LogicalName,DisplayName,MetadataId`)
      );
      const entities = await Promise.all(entityPromises);

      // Try to get the app's sitemap via components first
      let sitemapInfo = await this.getAppSitemap(appId);

      // If not found via components, try to find by matching name
      if (!sitemapInfo.hasSitemap) {
        const sitemapQuery = await this.makeRequest<ApiCollectionResponse<any>>(
          `api/data/v9.2/sitemaps?$filter=sitemapnameunique eq '${app.uniquename}'&$select=sitemapid,sitemapname,sitemapnameunique,sitemapxml`
        );

        if (sitemapQuery.value.length > 0) {
          const sitemap = sitemapQuery.value[0];
          sitemapInfo = {
            hasSitemap: true,
            sitemapid: sitemap.sitemapid,
            sitemapname: sitemap.sitemapname,
            sitemapnameunique: sitemap.sitemapnameunique,
            sitemapxml: sitemap.sitemapxml
          };
        } else {
          throw new Error(`App '${app.name}' does not have a sitemap. Cannot add entities without a sitemap.`);
        }
      }

      // Parse sitemap XML
      let sitemapXml = sitemapInfo.sitemapxml;

      // Find or create a "Tables" area and group
      // Check if <Area> with Id="Area_Tables" exists
      const areaRegex = /<Area[^>]+Id="Area_Tables"[^>]*>/;
      const hasTablesArea = areaRegex.test(sitemapXml);

      if (!hasTablesArea) {
        // Add a new Area for tables before the closing </SiteMap>
        const newArea = `
  <Area Id="Area_Tables" Title="Tables" ShowGroups="true">
    <Group Id="Group_Tables" Title="Custom Tables">
    </Group>
  </Area>`;
        sitemapXml = sitemapXml.replace('</SiteMap>', newArea + '\n</SiteMap>');
      }

      // Add SubArea elements for each entity within Group_Tables
      for (const entity of entities) {
        const displayName = entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName;
        const subAreaId = `SubArea_${entity.LogicalName}`;

        // Check if SubArea already exists
        const subAreaRegex = new RegExp(`<SubArea[^>]+Id="${subAreaId}"[^>]*>`);
        if (subAreaRegex.test(sitemapXml)) {
          continue; // Skip if already exists
        }

        // Add SubArea within Group_Tables
        const newSubArea = `
      <SubArea Id="${subAreaId}" Entity="${entity.LogicalName}" Title="${displayName}" />`;

        // Find the Group_Tables closing tag and add before it
        sitemapXml = sitemapXml.replace(
          /<\/Group>/,
          newSubArea + '\n    </Group>'
        );
      }

      // Update the sitemap
      await rateLimiter.execute(async () => {
        return await this.makeRequest<any>(
          `api/data/v9.2/sitemaps(${sitemapInfo.sitemapid})`,
          'PATCH',
          {
            sitemapxml: sitemapXml
          }
        );
      });

      // CRITICAL: Also add entity components to app for Advanced Find/Search
      // Use deep insert via appmodule_appmodulecomponent collection navigation property
      for (const entity of entities) {
        try {
          await rateLimiter.execute(async () => {
            return await this.makeRequest<any>(
              `api/data/v9.2/appmodules(${appId})/appmodule_appmodulecomponent`,
              'POST',
              {
                componenttype: 1, // Entity
                objectid: entity.MetadataId
              }
            );
          });
        } catch (componentError: any) {
          // If deep insert fails, try to continue with other entities
          auditLogger.log({
            operation: 'addEntitiesToApp',
            operationType: 'CREATE',
            componentType: 'AppModuleComponent',
            componentName: entity.LogicalName,
            success: false,
            error: `Failed to add ${entity.LogicalName} as app component: ${componentError.message}`,
            executionTimeMs: Date.now() - startTime
          });
        }
      }

      // Audit log success
      auditLogger.log({
        operation: 'addEntitiesToApp',
        operationType: 'UPDATE',
        componentType: 'AppModule',
        componentId: appId,
        success: true,
        executionTimeMs: Date.now() - startTime
      });

      return {
        appId,
        sitemapId: sitemapInfo.sitemapid,
        entitiesAdded: entityNames,
        message: `Successfully added ${entityNames.length} entities to app sitemap. Remember to publish the app.`
      };

    } catch (error: any) {
      // Audit log failure
      auditLogger.log({
        operation: 'addEntitiesToApp',
        operationType: 'UPDATE',
        componentType: 'AppModule',
        componentId: appId,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });

      throw new Error(`Failed to add entities to app: ${error.message}`);
    }
  }

  /**
   * Validate an app before publishing
   * @param appId The GUID of the app
   * @returns Validation result with any issues found
   */
  async validateApp(appId: string): Promise<any> {
    try {
      const response = await this.makeRequest<any>(
        `api/data/v9.2/ValidateApp(AppModuleId=${appId})`
      );

      const validationResponse = response.AppValidationResponse;
      const isValid = validationResponse.ValidationSuccess;
      const issues = validationResponse.ValidationIssueList || [];

      return {
        appId,
        isValid,
        issueCount: issues.length,
        issues: issues.map((issue: any) => ({
          errorType: issue.ErrorType,
          message: issue.Message,
          componentId: issue.ComponentId,
          componentType: issue.ComponentType
        })),
        message: isValid
          ? 'App validation passed. Ready to publish.'
          : `App validation found ${issues.length} issue(s). Fix them before publishing.`
      };

    } catch (error: any) {
      throw new Error(`Failed to validate app: ${error.message}`);
    }
  }

  /**
   * Publish an app to make it available to users
   * @param appId The GUID of the app
   * @returns Result of the publish operation
   */
  async publishApp(appId: string): Promise<any> {
    const startTime = Date.now();

    try {
      // First validate the app
      const validation = await this.validateApp(appId);
      if (!validation.isValid) {
        throw new Error(`Cannot publish app with validation errors: ${JSON.stringify(validation.issues)}`);
      }

      // Publish using PublishXml with app parameter
      const parameterXml = `<importexportxml><appmodules><appmodule>${appId}</appmodule></appmodules></importexportxml>`;

      await rateLimiter.execute(async () => {
        return await this.publishXml(parameterXml);
      });

      // Audit log success
      auditLogger.log({
        operation: 'publishApp',
        operationType: 'PUBLISH',
        componentType: 'AppModule',
        componentId: appId,
        success: true,
        executionTimeMs: Date.now() - startTime
      });

      return {
        appId,
        message: 'App published successfully. It is now available to users with appropriate security roles.'
      };

    } catch (error: any) {
      // Audit log failure
      auditLogger.log({
        operation: 'publishApp',
        operationType: 'PUBLISH',
        componentType: 'AppModule',
        componentId: appId,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });

      throw new Error(`Failed to publish app: ${error.message}`);
    }
  }

  /**
   * Helper to escape XML special characters
   */
  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  // ==================== CUSTOMIZATION WRITE OPERATIONS ====================

  /**
   * Create a new custom entity (table)
   * @param entityDefinition The entity definition object
   * @param solutionUniqueName Optional solution to add the entity to
   * @returns The created entity metadata
   */
  async createEntity(entityDefinition: any, solutionUniqueName?: string): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate entity name against best practices
      const schemaName = entityDefinition.SchemaName || entityDefinition.LogicalName;
      const isRefData = schemaName?.toLowerCase().includes('ref_') || false;
      const nameValidation = bestPracticesValidator.validateEntityName(schemaName, isRefData);

      if (!nameValidation.isValid) {
        const error = `Entity name validation failed: ${nameValidation.issues.join(', ')}`;
        auditLogger.log({
          operation: 'createEntity',
          operationType: 'CREATE',
          componentType: 'Entity',
          componentName: schemaName,
          success: false,
          error,
          executionTimeMs: Date.now() - startTime
        });
        throw new Error(error);
      }

      // Log warnings if any
      if (nameValidation.warnings.length > 0) {
        console.error(`[WARNING] Entity name warnings: ${nameValidation.warnings.join(', ')}`);
      }

      // Validate ownership type
      const ownershipType = entityDefinition.OwnershipType;
      if (ownershipType) {
        const ownershipValidation = bestPracticesValidator.validateOwnershipType(ownershipType);
        if (!ownershipValidation.isValid) {
          console.error(`[WARNING] ${ownershipValidation.issues.join(', ')}`);
        }
      }

      // Check for required columns
      const requiredColumnsValidation = bestPracticesValidator.validateRequiredColumns([], isRefData);
      if (requiredColumnsValidation.missingColumns && requiredColumnsValidation.missingColumns.length > 0) {
        console.error('[WARNING] Entity will need required columns added after creation:',
          requiredColumnsValidation.missingColumns.map(c => c.schemaName).join(', '));
      }

      const headers: Record<string, string> = {};
      if (solutionUniqueName) {
        headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
      }

      // Execute with rate limiting
      const response = await rateLimiter.execute(async () => {
        return await this.makeRequest<any>(
          'api/data/v9.2/EntityDefinitions',
          'POST',
          entityDefinition,
          headers
        );
      });

      // Log success
      auditLogger.log({
        operation: 'createEntity',
        operationType: 'CREATE',
        componentType: 'Entity',
        componentName: schemaName,
        success: true,
        executionTimeMs: Date.now() - startTime
      });

      return response;
    } catch (error: any) {
      // Log failure
      auditLogger.log({
        operation: 'createEntity',
        operationType: 'CREATE',
        componentType: 'Entity',
        componentName: entityDefinition.SchemaName || entityDefinition.LogicalName,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Update an existing entity
   * @param metadataId The MetadataId of the entity
   * @param updates The properties to update
   * @param solutionUniqueName Optional solution context
   */
  async updateEntity(metadataId: string, updates: any, solutionUniqueName?: string): Promise<void> {
    const headers: Record<string, string> = {
      'MSCRM.MergeLabels': 'true'
    };
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    await this.makeRequest<void>(
      `api/data/v9.2/EntityDefinitions(${metadataId})`,
      'PUT',
      updates,
      headers
    );
  }

  /**
   * Delete a custom entity
   * @param metadataId The MetadataId of the entity to delete
   */
  async deleteEntity(metadataId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/EntityDefinitions(${metadataId})`,
      'DELETE'
    );
  }

  /**
   * Update entity icon using Fluent UI System Icon
   * @param entityLogicalName The logical name of the entity
   * @param iconFileName The Fluent UI icon file name (e.g., 'people_community_24_filled.svg')
   * @param solutionUniqueName Optional solution to add the web resource to
   * @returns Result with web resource ID and icon vector name
   */
  async updateEntityIcon(
    entityLogicalName: string,
    iconFileName: string,
    solutionUniqueName?: string
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Step 1: Get entity metadata to retrieve schema name and metadata ID
      const entityMetadata = await this.getEntityMetadata(entityLogicalName);
      const entitySchemaName = entityMetadata.SchemaName;
      const metadataId = entityMetadata.MetadataId;

      if (!metadataId) {
        throw new Error(`Could not find MetadataId for entity '${entityLogicalName}'`);
      }

      // Note: No need to clear existing IconVectorName - PowerPlatform will override it
      // when we set the new icon. This avoids potential API errors from setting null values.

      // Step 2: Fetch the icon SVG from Fluent UI GitHub
      const svgContent = await iconManager.fetchIcon(iconFileName);

      // Step 3: Validate the SVG
      const validation = iconManager.validateIconSvg(svgContent);
      if (!validation.valid) {
        throw new Error(`Invalid SVG: ${validation.error}`);
      }

      // Step 4: Convert SVG to base64
      const base64Content = Buffer.from(svgContent).toString('base64');

      // Step 5: Generate web resource name
      const webResourceName = iconManager.generateWebResourceName(entitySchemaName, iconFileName.replace('.svg', ''));

      // Step 6: Check if web resource already exists (use exact name match)
      const existingResourcesResponse = await this.makeRequest<any>(
        `api/data/v9.2/webresourceset?$filter=name eq '${webResourceName}'&$select=webresourceid,name`
      );

      let webResourceId: string;

      if (existingResourcesResponse.value && existingResourcesResponse.value.length > 0) {
        // Web resource exists, update it
        const existing = existingResourcesResponse.value[0];
        webResourceId = existing.webresourceid;

        const webResourceUpdates = {
          displayname: `Icon for ${entityMetadata.DisplayName?.UserLocalizedLabel?.Label || entityLogicalName}`,
          content: base64Content,
          description: `Fluent UI icon (${iconFileName}) for ${entityLogicalName} entity`
        };

        await this.updateWebResource(webResourceId, webResourceUpdates, solutionUniqueName);
      } else {
        // Web resource doesn't exist, create new
        const webResource = {
          name: webResourceName,
          displayname: `Icon for ${entityMetadata.DisplayName?.UserLocalizedLabel?.Label || entityLogicalName}`,
          webresourcetype: 11, // SVG
          content: base64Content,
          description: `Fluent UI icon (${iconFileName}) for ${entityLogicalName} entity`
        };

        const webResourceResult = await this.createWebResource(webResource, solutionUniqueName);
        webResourceId = webResourceResult.webresourceid;
      }

      // Step 7: Generate icon vector name
      const iconVectorName = iconManager.generateIconVectorName(webResourceName);

      // Step 8: Update entity metadata with icon reference
      const entityUpdates = {
        '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
        IconVectorName: iconVectorName
      };

      await this.updateEntity(metadataId, entityUpdates, solutionUniqueName);

      // Step 9: Publish the web resource (component type 61)
      await this.publishComponent(webResourceId, 61);

      // Step 10: Publish the entity (component type 1)
      await this.publishComponent(metadataId, 1);

      // Log success
      auditLogger.log({
        operation: 'updateEntityIcon',
        operationType: 'UPDATE',
        componentType: 'Entity',
        componentName: entityLogicalName,
        success: true,
        parameters: {
          iconFileName,
          webResourceName,
          webResourceId,
          iconVectorName
        },
        executionTimeMs: Date.now() - startTime
      });

      return {
        success: true,
        entityLogicalName,
        entitySchemaName,
        iconFileName,
        webResourceId,
        webResourceName,
        iconVectorName,
        message: 'Entity icon updated and published successfully. The icon should now be visible in the UI.'
      };
    } catch (error: any) {
      // Log failure
      auditLogger.log({
        operation: 'updateEntityIcon',
        operationType: 'UPDATE',
        componentType: 'Entity',
        componentName: entityLogicalName,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Create a new attribute on an entity
   * @param entityLogicalName The logical name of the entity
   * @param attributeDefinition The attribute definition object
   * @param solutionUniqueName Optional solution to add the attribute to
   * @returns The created attribute metadata
   */
  async createAttribute(
    entityLogicalName: string,
    attributeDefinition: any,
    solutionUniqueName?: string
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate attribute name against best practices
      const schemaName = attributeDefinition.SchemaName || attributeDefinition.LogicalName;
      const isLookup = attributeDefinition['@odata.type'] === 'Microsoft.Dynamics.CRM.LookupAttributeMetadata';
      const nameValidation = bestPracticesValidator.validateAttributeName(schemaName, isLookup);

      if (!nameValidation.isValid) {
        const error = `Attribute name validation failed: ${nameValidation.issues.join(', ')}`;
        auditLogger.log({
          operation: 'createAttribute',
          operationType: 'CREATE',
          componentType: 'Attribute',
          componentName: `${entityLogicalName}.${schemaName}`,
          success: false,
          error,
          executionTimeMs: Date.now() - startTime
        });
        throw new Error(error);
      }

      // Log warnings if any
      if (nameValidation.warnings.length > 0) {
        console.error(`[WARNING] Attribute name warnings: ${nameValidation.warnings.join(', ')}`);
      }

      // Validate boolean usage (best practice is to avoid booleans)
      const isBoolean = attributeDefinition['@odata.type'] === 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata';
      if (isBoolean) {
        const booleanValidation = bestPracticesValidator.validateBooleanUsage('Boolean', schemaName);
        if (!booleanValidation.isValid) {
          console.error(`[WARNING] ${booleanValidation.warnings.join(', ')}`);
        }
      }

      const headers: Record<string, string> = {};
      if (solutionUniqueName) {
        headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
      }

      // Execute with rate limiting
      const response = await rateLimiter.execute(async () => {
        return await this.makeRequest<any>(
          `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
          'POST',
          attributeDefinition,
          headers
        );
      });

      // Log success
      auditLogger.log({
        operation: 'createAttribute',
        operationType: 'CREATE',
        componentType: 'Attribute',
        componentName: `${entityLogicalName}.${schemaName}`,
        success: true,
        executionTimeMs: Date.now() - startTime
      });

      return response;
    } catch (error: any) {
      // Log failure
      const schemaName = attributeDefinition.SchemaName || attributeDefinition.LogicalName;
      auditLogger.log({
        operation: 'createAttribute',
        operationType: 'CREATE',
        componentType: 'Attribute',
        componentName: `${entityLogicalName}.${schemaName}`,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Update an existing attribute
   * @param entityLogicalName The logical name of the entity
   * @param attributeLogicalName The logical name of the attribute
   * @param updates The properties to update
   * @param solutionUniqueName Optional solution context
   */
  async updateAttribute(
    entityLogicalName: string,
    attributeLogicalName: string,
    updates: any,
    solutionUniqueName?: string
  ): Promise<void> {
    const headers: Record<string, string> = {
      'MSCRM.MergeLabels': 'true'
    };
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    // First, get the existing attribute to retrieve its @odata.type and merge updates
    const existingAttribute = await this.getEntityAttribute(entityLogicalName, attributeLogicalName);

    // Merge the updates with required fields
    const payload = {
      ...updates,
      '@odata.type': existingAttribute['@odata.type'],
      LogicalName: attributeLogicalName,
      AttributeType: existingAttribute.AttributeType
    };

    await this.makeRequest<void>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')`,
      'PUT',
      payload,
      headers
    );
  }

  /**
   * Delete an attribute
   * @param entityLogicalName The logical name of the entity
   * @param attributeMetadataId The MetadataId of the attribute to delete
   */
  async deleteAttribute(entityLogicalName: string, attributeMetadataId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(${attributeMetadataId})`,
      'DELETE'
    );
  }

  /**
   * Create a picklist attribute using a global option set
   * @param entityLogicalName The logical name of the entity
   * @param attributeDefinition The attribute definition (must reference a global option set)
   * @param solutionUniqueName Optional solution to add the attribute to
   * @returns The created attribute metadata
   */
  async createGlobalOptionSetAttribute(
    entityLogicalName: string,
    attributeDefinition: any,
    solutionUniqueName?: string
  ): Promise<any> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    // Ensure the attribute is of type PicklistAttributeMetadata with GlobalOptionSet
    if (!attributeDefinition['@odata.type']) {
      attributeDefinition['@odata.type'] = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata';
    }

    return await this.makeRequest<any>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
      'POST',
      attributeDefinition,
      headers
    );
  }

  /**
   * Create a one-to-many relationship
   * @param relationshipDefinition The relationship definition
   * @param solutionUniqueName Optional solution to add the relationship to
   */
  async createOneToManyRelationship(
    relationshipDefinition: any,
    solutionUniqueName?: string
  ): Promise<any> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.makeRequest<any>(
      'api/data/v9.2/RelationshipDefinitions',
      'POST',
      relationshipDefinition,
      headers
    );

    return response;
  }

  /**
   * Create a many-to-many relationship
   * @param relationshipDefinition The relationship definition
   * @param solutionUniqueName Optional solution to add the relationship to
   */
  async createManyToManyRelationship(
    relationshipDefinition: any,
    solutionUniqueName?: string
  ): Promise<any> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.makeRequest<any>(
      'api/data/v9.2/RelationshipDefinitions',
      'POST',
      relationshipDefinition,
      headers
    );

    return response;
  }

  /**
   * Delete a relationship
   * @param metadataId The MetadataId of the relationship to delete
   */
  async deleteRelationship(metadataId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/RelationshipDefinitions(${metadataId})`,
      'DELETE'
    );
  }

  /**
   * Update a relationship
   * Note: Most relationship properties are immutable, only labels can be updated
   * @param metadataId The MetadataId of the relationship
   * @param updates The properties to update (typically labels)
   */
  async updateRelationship(metadataId: string, updates: any): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/RelationshipDefinitions(${metadataId})`,
      'PUT',
      updates,
      { 'MSCRM.MergeLabels': 'true' }
    );
  }

  /**
   * Get detailed information about a relationship
   * @param metadataId The MetadataId of the relationship
   * @returns The relationship metadata
   */
  async getRelationshipDetails(metadataId: string): Promise<any> {
    return await this.makeRequest<any>(
      `api/data/v9.2/RelationshipDefinitions(${metadataId})`
    );
  }

  /**
   * Publish all customizations
   */
  async publishAllCustomizations(): Promise<void> {
    await this.makeRequest<void>(
      'api/data/v9.2/PublishAllXml',
      'POST',
      {}
    );
  }

  /**
   * Publish specific customizations
   * @param parameterXml The ParameterXml specifying what to publish
   */
  async publishXml(parameterXml: string): Promise<void> {
    await this.makeRequest<void>(
      'api/data/v9.2/PublishXml',
      'POST',
      { ParameterXml: parameterXml }
    );
  }

  /**
   * Create a global option set
   * @param optionSetDefinition The option set definition
   * @param solutionUniqueName Optional solution to add the option set to
   */
  async createGlobalOptionSet(
    optionSetDefinition: any,
    solutionUniqueName?: string
  ): Promise<any> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    const response = await this.makeRequest<any>(
      'api/data/v9.2/GlobalOptionSetDefinitions',
      'POST',
      optionSetDefinition,
      headers
    );

    return response;
  }

  /**
   * Delete a global option set
   * @param metadataId The MetadataId of the option set to delete
   */
  async deleteGlobalOptionSet(metadataId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/GlobalOptionSetDefinitions(${metadataId})`,
      'DELETE'
    );
  }

  // ===== Phase 2: UI Components (Forms, Views, Option Sets) =====

  /**
   * Update a global option set
   */
  async updateGlobalOptionSet(metadataId: string, updates: any, solutionUniqueName?: string): Promise<void> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    await this.makeRequest<void>(
      `api/data/v9.2/GlobalOptionSetDefinitions(${metadataId})`,
      'PUT',
      updates,
      headers
    );
  }

  /**
   * Add a value to a global option set
   */
  async addOptionSetValue(optionSetName: string, value: number, label: string, solutionUniqueName?: string): Promise<any> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    return await this.makeRequest<any>(
      `api/data/v9.2/InsertOptionValue`,
      'POST',
      {
        OptionSetName: optionSetName,
        Value: value,
        Label: {
          LocalizedLabels: [{ Label: label, LanguageCode: 1033 }]
        }
      },
      headers
    );
  }

  /**
   * Update an option set value
   */
  async updateOptionSetValue(optionSetName: string, value: number, label: string, solutionUniqueName?: string): Promise<void> {
    const headers: Record<string, string> = { 'MSCRM.MergeLabels': 'true' };
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }
    await this.makeRequest<void>(
      `api/data/v9.2/UpdateOptionValue`,
      'POST',
      {
        OptionSetName: optionSetName,
        Value: value,
        Label: {
          LocalizedLabels: [{ Label: label, LanguageCode: 1033 }]
        },
        MergeLabels: true
      },
      headers
    );
  }

  /**
   * Delete an option set value
   */
  async deleteOptionSetValue(optionSetName: string, value: number): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/DeleteOptionValue`,
      'POST',
      {
        OptionSetName: optionSetName,
        Value: value
      }
    );
  }

  /**
   * Reorder option set values
   */
  async reorderOptionSetValues(optionSetName: string, values: number[], solutionUniqueName?: string): Promise<void> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    await this.makeRequest<void>(
      `api/data/v9.2/OrderOption`,
      'POST',
      {
        OptionSetName: optionSetName,
        Values: values
      },
      headers
    );
  }

  /**
   * Create a form (systemform)
   */
  async createForm(form: any, solutionUniqueName?: string): Promise<any> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    return await this.makeRequest<any>(
      'api/data/v9.2/systemforms',
      'POST',
      form,
      headers
    );
  }

  /**
   * Update a form
   */
  async updateForm(formId: string, updates: any, solutionUniqueName?: string): Promise<void> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    await this.makeRequest<void>(
      `api/data/v9.2/systemforms(${formId})`,
      'PATCH',
      updates,
      headers
    );
  }

  /**
   * Delete a form
   */
  async deleteForm(formId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/systemforms(${formId})`,
      'DELETE'
    );
  }

  /**
   * Get forms for an entity
   */
  async getForms(entityLogicalName: string): Promise<any> {
    return await this.makeRequest<any>(
      `api/data/v9.2/systemforms?$filter=objecttypecode eq '${entityLogicalName}'&$orderby=type`
    );
  }

  /**
   * Create a view (savedquery)
   */
  async createView(view: any, solutionUniqueName?: string): Promise<any> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    return await this.makeRequest<any>(
      'api/data/v9.2/savedqueries',
      'POST',
      view,
      headers
    );
  }

  /**
   * Update a view
   */
  async updateView(viewId: string, updates: any, solutionUniqueName?: string): Promise<void> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    await this.makeRequest<void>(
      `api/data/v9.2/savedqueries(${viewId})`,
      'PATCH',
      updates,
      headers
    );
  }

  /**
   * Delete a view
   */
  async deleteView(viewId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/savedqueries(${viewId})`,
      'DELETE'
    );
  }

  /**
   * Get views for an entity
   */
  async getViews(entityLogicalName: string): Promise<any> {
    return await this.makeRequest<any>(
      `api/data/v9.2/savedqueries?$filter=returnedtypecode eq '${entityLogicalName}'&$orderby=querytype`
    );
  }

  /**
   * Activate a form (set statecode=1)
   * @param formId The systemformid (GUID)
   */
  async activateForm(formId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/systemforms(${formId})`,
      'PATCH',
      { statecode: 1, statuscode: 1 }
    );
  }

  /**
   * Deactivate a form (set statecode=0)
   * @param formId The systemformid (GUID)
   */
  async deactivateForm(formId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/systemforms(${formId})`,
      'PATCH',
      { statecode: 0, statuscode: 2 }
    );
  }

  /**
   * Set a view as the default view for its entity
   * @param viewId The savedqueryid (GUID)
   */
  async setDefaultView(viewId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/savedqueries(${viewId})`,
      'PATCH',
      { isdefault: true }
    );
  }

  /**
   * Get the FetchXML from a view
   * @param viewId The savedqueryid (GUID)
   * @returns The view with FetchXML
   */
  async getViewFetchXml(viewId: string): Promise<any> {
    return await this.makeRequest<any>(
      `api/data/v9.2/savedqueries(${viewId})?$select=fetchxml,name,returnedtypecode,querytype`
    );
  }

  // ===== Phase 3: Advanced Customizations (Web Resources) =====

  /**
   * Create a web resource
   */
  async createWebResource(webResource: any, solutionUniqueName?: string): Promise<any> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    return await this.makeRequest<any>(
      'api/data/v9.2/webresourceset',
      'POST',
      webResource,
      headers
    );
  }

  /**
   * Update a web resource
   */
  async updateWebResource(webResourceId: string, updates: any, solutionUniqueName?: string): Promise<void> {
    const headers = solutionUniqueName ? { 'MSCRM.SolutionUniqueName': solutionUniqueName } : undefined;
    await this.makeRequest<void>(
      `api/data/v9.2/webresourceset(${webResourceId})`,
      'PATCH',
      updates,
      headers
    );
  }

  /**
   * Delete a web resource
   */
  async deleteWebResource(webResourceId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/webresourceset(${webResourceId})`,
      'DELETE'
    );
  }

  /**
   * Get web resource
   */
  async getWebResource(webResourceId: string): Promise<any> {
    return await this.makeRequest<any>(
      `api/data/v9.2/webresourceset(${webResourceId})`
    );
  }

  /**
   * Get web resources by name pattern
   */
  async getWebResources(nameFilter?: string): Promise<any> {
    const filter = nameFilter ? `?$filter=contains(name,'${nameFilter}')` : '';
    return await this.makeRequest<any>(
      `api/data/v9.2/webresourceset${filter}`
    );
  }

  /**
   * Get web resource content (base64 encoded)
   * @param webResourceId The webresourceid (GUID)
   * @returns The web resource with content field
   */
  async getWebResourceContent(webResourceId: string): Promise<any> {
    return await this.makeRequest<any>(
      `api/data/v9.2/webresourceset(${webResourceId})?$select=content,name,webresourcetype`
    );
  }

  /**
   * Get web resource dependencies
   * @param webResourceId The webresourceid (GUID)
   * @returns List of dependencies
   */
  async getWebResourceDependencies(webResourceId: string): Promise<any> {
    return await this.makeRequest<any>(
      `api/data/v9.2/webresourceset(${webResourceId})/dependencies`
    );
  }

  // ===== Phase 4: Solution Management =====

  /**
   * Create a publisher
   */
  async createPublisher(publisher: any): Promise<any> {
    return await this.makeRequest<any>(
      'api/data/v9.2/publishers',
      'POST',
      publisher
    );
  }

  /**
   * Get publishers
   */
  async getPublishers(): Promise<any> {
    return await this.makeRequest<any>(
      'api/data/v9.2/publishers?$filter=isreadonly eq false'
    );
  }

  /**
   * Create a solution
   */
  async createSolution(solution: any): Promise<any> {
    return await this.makeRequest<any>(
      'api/data/v9.2/solutions',
      'POST',
      solution
    );
  }

  /**
   * Get solutions
   */
  async getSolutions(): Promise<any> {
    return await this.makeRequest<any>(
      'api/data/v9.2/solutions?$filter=isvisible eq true&$orderby=createdon desc'
    );
  }

  /**
   * Get solution by unique name
   */
  async getSolution(uniqueName: string): Promise<any> {
    const result = await this.makeRequest<any>(
      `api/data/v9.2/solutions?$filter=uniquename eq '${uniqueName}'&$top=1`
    );
    return result.value && result.value.length > 0 ? result.value[0] : null;
  }

  /**
   * Add component to solution
   */
  async addComponentToSolution(
    solutionUniqueName: string,
    componentId: string,
    componentType: number,
    addRequiredComponents: boolean = true,
    includedComponentSettingsValues?: string
  ): Promise<void> {
    await this.makeRequest<void>(
      'api/data/v9.2/AddSolutionComponent',
      'POST',
      {
        SolutionUniqueName: solutionUniqueName,
        ComponentId: componentId,
        ComponentType: componentType,
        AddRequiredComponents: addRequiredComponents,
        IncludedComponentSettingsValues: includedComponentSettingsValues
      }
    );
  }

  /**
   * Remove component from solution
   */
  async removeComponentFromSolution(
    solutionUniqueName: string,
    componentId: string,
    componentType: number
  ): Promise<void> {
    await this.makeRequest<void>(
      'api/data/v9.2/RemoveSolutionComponent',
      'POST',
      {
        SolutionUniqueName: solutionUniqueName,
        ComponentId: componentId,
        ComponentType: componentType
      }
    );
  }

  /**
   * Get solution components
   */
  async getSolutionComponents(solutionUniqueName: string): Promise<any> {
    const solution = await this.getSolution(solutionUniqueName);
    if (!solution) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }

    return await this.makeRequest<any>(
      `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solution.solutionid}&$orderby=componenttype`
    );
  }

  /**
   * Export solution
   */
  async exportSolution(solutionName: string, managed: boolean = false): Promise<any> {
    return await this.makeRequest<any>(
      'api/data/v9.2/ExportSolution',
      'POST',
      {
        SolutionName: solutionName,
        Managed: managed,
        ExportAutoNumberingSettings: true,
        ExportCalendarSettings: true,
        ExportCustomizationSettings: true,
        ExportEmailTrackingSettings: true,
        ExportGeneralSettings: true,
        ExportMarketingSettings: true,
        ExportOutlookSynchronizationSettings: true,
        ExportRelationshipRoles: true,
        ExportIsvConfig: true,
        ExportSales: true,
        ExportExternalApplications: true
      }
    );
  }

  /**
   * Import solution
   */
  async importSolution(
    customizationFile: string,
    publishWorkflows: boolean = true,
    overwriteUnmanagedCustomizations: boolean = false
  ): Promise<any> {
    return await this.makeRequest<any>(
      'api/data/v9.2/ImportSolution',
      'POST',
      {
        CustomizationFile: customizationFile,
        PublishWorkflows: publishWorkflows,
        OverwriteUnmanagedCustomizations: overwriteUnmanagedCustomizations,
        SkipProductUpdateDependencies: false,
        HoldingSolution: false,
        ImportJobId: this.generateGuid()
      }
    );
  }

  /**
   * Delete a solution
   */
  async deleteSolution(solutionId: string): Promise<void> {
    await this.makeRequest<void>(
      `api/data/v9.2/solutions(${solutionId})`,
      'DELETE'
    );
  }

  // ===== Phase 5: Publishing & Validation =====

  /**
   * Publish specific entity
   */
  async publishEntity(entityLogicalName: string): Promise<void> {
    const parameterXml = `<importexportxml><entities><entity>${entityLogicalName}</entity></entities></importexportxml>`;
    await this.publishXml(parameterXml);
  }

  /**
   * Publish specific component
   */
  async publishComponent(componentId: string, componentType: number): Promise<void> {
    const typeMap: Record<number, string> = {
      1: 'entity',
      2: 'attribute',
      9: 'optionset',
      24: 'form',
      26: 'savedquery',
      29: 'workflow',
      60: 'systemform',
      61: 'webresource'
    };

    const componentTypeName = typeMap[componentType] || 'component';
    const parameterXml = `<importexportxml><${componentTypeName}s><${componentTypeName}>${componentId}</${componentTypeName}></${componentTypeName}s></importexportxml>`;
    await this.publishXml(parameterXml);
  }

  /**
   * Check for unpublished customizations
   */
  async checkUnpublishedChanges(): Promise<any> {
    // Query for unpublished customizations using RetrieveUnpublished
    return await this.makeRequest<any>(
      'api/data/v9.2/RetrieveUnpublished',
      'POST',
      {}
    );
  }

  /**
   * Check component dependencies
   */
  async checkDependencies(componentId: string, componentType: number): Promise<any> {
    return await this.makeRequest<any>(
      'api/data/v9.2/RetrieveDependenciesForDelete',
      'POST',
      {
        ObjectId: componentId,
        ComponentType: componentType
      }
    );
  }

  /**
   * Check if component can be deleted
   */
  async checkDeleteEligibility(componentId: string, componentType: number): Promise<{ canDelete: boolean; dependencies: any[] }> {
    try {
      const result = await this.checkDependencies(componentId, componentType);
      const dependencies = result.EntityCollection?.Entities || [];

      return {
        canDelete: dependencies.length === 0,
        dependencies: dependencies
      };
    } catch (error) {
      return {
        canDelete: false,
        dependencies: []
      };
    }
  }

  /**
   * Preview unpublished changes
   * Returns all components that have unpublished customizations
   */
  async previewUnpublishedChanges(): Promise<any> {
    // Use RetrieveUnpublished action to get unpublished changes
    return await this.makeRequest<any>(
      'api/data/v9.2/RetrieveUnpublished',
      'POST',
      {}
    );
  }

  /**
   * Check dependencies for a specific component
   * @param componentId The component ID (GUID)
   * @param componentType The component type code
   * @returns Dependency information
   */
  async checkComponentDependencies(componentId: string, componentType: number): Promise<any> {
    // This is an alias for checkDependencies for consistency
    return await this.checkDependencies(componentId, componentType);
  }

  /**
   * Validate solution integrity
   * Checks for missing dependencies and other issues
   * @param solutionUniqueName The unique name of the solution
   * @returns Validation results
   */
  async validateSolutionIntegrity(solutionUniqueName: string): Promise<any> {
    // Get solution components
    const components = await this.getSolutionComponents(solutionUniqueName);

    const issues: any[] = [];
    const warnings: any[] = [];

    // Check each component for dependencies
    for (const component of components.value || []) {
      try {
        const deps = await this.checkDependencies(
          component.objectid,
          component.componenttype
        );

        const dependencies = deps.EntityCollection?.Entities || [];
        const missingDeps = dependencies.filter((d: any) => d.Attributes?.ismissing === true);

        if (missingDeps.length > 0) {
          issues.push({
            componentId: component.objectid,
            componentType: component.componenttype,
            missingDependencies: missingDeps
          });
        }
      } catch (error) {
        warnings.push({
          componentId: component.objectid,
          componentType: component.componenttype,
          error: 'Could not check dependencies'
        });
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Validate schema name
   */
  validateSchemaName(schemaName: string, prefix: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if starts with prefix
    if (!schemaName.startsWith(prefix)) {
      errors.push(`Schema name must start with prefix '${prefix}'`);
    }

    // Check for invalid characters
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      errors.push('Schema name must start with a letter or underscore and contain only letters, numbers, and underscores');
    }

    // Check length (max 64 characters for most components)
    if (schemaName.length > 64) {
      errors.push('Schema name must be 64 characters or less');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get entity customization information
   */
  async getEntityCustomizationInfo(entityLogicalName: string): Promise<any> {
    return await this.makeRequest<any>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=IsCustomizable,IsManaged,IsCustomEntity`
    );
  }

  /**
   * Check if entity has dependencies
   */
  async checkEntityDependencies(entityLogicalName: string): Promise<any> {
    // First get the metadata ID
    const entityMetadata = await this.getEntityMetadata(entityLogicalName);
    if (!entityMetadata.MetadataId) {
      throw new Error(`Could not find MetadataId for entity '${entityLogicalName}'`);
    }

    // Component type 1 = Entity
    return await this.checkDependencies(entityMetadata.MetadataId, 1);
  }

  /**
   * Helper to generate GUID
   */
  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Validate Dataverse entities against best practices
   * @param solutionUniqueName - Solution unique name (mutually exclusive with entityLogicalNames)
   * @param entityLogicalNames - Explicit list of entities to validate (mutually exclusive with solutionUniqueName)
   * @param publisherPrefix - Publisher prefix to validate against (e.g., 'sic_')
   * @param recentDays - Only validate columns created in last N days (0 = all columns)
   * @param includeRefDataTables - Include RefData tables in validation
   * @param rules - Specific rules to validate
   * @param maxEntities - Maximum number of entities to validate (0 = unlimited)
   * @returns Structured validation results with violations
   */
  async validateBestPractices(
    solutionUniqueName: string | undefined,
    entityLogicalNames: string[] | undefined,
    publisherPrefix: string,
    recentDays: number = 30,
    includeRefDataTables: boolean = true,
    rules: string[] = ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'],
    maxEntities: number = 0
  ): Promise<BestPracticesValidationResult> {
    const timer = auditLogger.startTimer();
    const statisticsCounters = {
      systemColumns: 0,
      oldColumns: 0,
    };

    try {
      let entities: string[] = [];
      let solutionFriendlyName: string | undefined;

      // STEP 1: Discover entities
      if (solutionUniqueName) {
        // Get solution ID
        const solutionResponse = await this.makeRequest<ApiCollectionResponse<any>>(
          `api/data/v9.2/solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,friendlyname,uniquename`
        );

        if (!solutionResponse.value || solutionResponse.value.length === 0) {
          throw new Error(`Solution not found: ${solutionUniqueName}`);
        }

        const solution = solutionResponse.value[0];
        const solutionId = solution.solutionid;
        solutionFriendlyName = solution.friendlyname;

        // Get solution components (entities only, componenttype = 1)
        const componentsResponse = await this.makeRequest<ApiCollectionResponse<any>>(
          `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solutionId} and componenttype eq 1&$select=objectid`
        );

        // Get entity metadata for each component
        for (const component of componentsResponse.value || []) {
          const metadataId = component.objectid;

          try {
            // Query entity by MetadataId
            const entityResponse = await this.makeRequest<any>(
              `api/data/v9.2/EntityDefinitions(${metadataId})?$select=LogicalName,SchemaName`
            );

            const logicalName = entityResponse.LogicalName;

            // Filter: Only entities with publisher prefix
            if (logicalName.startsWith(publisherPrefix)) {
              // Filter: Optionally exclude RefData tables
              if (includeRefDataTables || !logicalName.startsWith(`${publisherPrefix}ref_`)) {
                entities.push(logicalName);
              }
            }
          } catch (error) {
            // Skip entities that can't be queried (managed/system entities)
            console.error(`Could not query entity with MetadataId ${metadataId}:`, error);
          }
        }

        // Apply max entities limit
        if (maxEntities > 0 && entities.length > maxEntities) {
          entities = entities.slice(0, maxEntities);
        }
      } else if (entityLogicalNames) {
        // Use explicit entity list
        entities = entityLogicalNames.filter(name => name.startsWith(publisherPrefix));
      } else {
        throw new Error('Either solutionUniqueName or entityLogicalNames must be provided');
      }

      // STEP 2: Validate each entity
      const results: EntityValidationResult[] = [];

      for (const entityLogicalName of entities) {
        try {
          // Get entity metadata (including icon information)
          const entityMetadata = await this.makeRequest<any>(
            `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=LogicalName,SchemaName,DisplayName,MetadataId,IconVectorName,IsCustomEntity`
          );

          // Get all attributes for entity
          const attributesResponse = await this.makeRequest<ApiCollectionResponse<any>>(
            `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,AttributeType,DisplayName,CreatedOn,IsCustomAttribute,AttributeTypeName`
          );

          const attributes = attributesResponse.value || [];

          // Apply filtering
          const filteredAttributes = attributes.filter((attr: any) => {
            // Rule: Must have publisher prefix
            if (!attr.LogicalName.startsWith(publisherPrefix)) {
              statisticsCounters.systemColumns++;
              return false; // Exclude system columns
            }

            // Rule: Must be custom attribute (additional safety)
            if (!attr.IsCustomAttribute) {
              statisticsCounters.systemColumns++;
              return false;
            }

            // Rule: Must be within time threshold
            if (recentDays > 0 && attr.CreatedOn) {
              const createdDate = new Date(attr.CreatedOn);
              const daysAgo = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

              if (daysAgo > recentDays) {
                statisticsCounters.oldColumns++;
                return false; // Too old
              }
            }

            return true;
          });

          // Validate entity-level properties and attributes
          const violations = await this.validateEntityAndAttributes(
            entityMetadata,
            filteredAttributes,
            attributes, // Pass all attributes for required column check
            publisherPrefix,
            rules
          );

          const displayName = entityMetadata.DisplayName?.UserLocalizedLabel?.Label || entityMetadata.LogicalName;

          results.push({
            logicalName: entityMetadata.LogicalName,
            schemaName: entityMetadata.SchemaName,
            displayName: displayName,
            isRefData: entityMetadata.LogicalName.startsWith(`${publisherPrefix}ref_`),
            attributesChecked: filteredAttributes.length,
            violations: violations,
            isCompliant: violations.length === 0
          });
        } catch (error: any) {
          console.error(`Error validating entity ${entityLogicalName}:`, error);
          // Skip entities that fail validation
        }
      }

      // STEP 3: Calculate summary statistics
      const summary = {
        entitiesChecked: results.length,
        attributesChecked: results.reduce((sum, e) => sum + e.attributesChecked, 0),
        totalViolations: results.reduce((sum, e) => sum + e.violations.length, 0),
        criticalViolations: results.reduce((sum, e) =>
          sum + e.violations.filter(v => v.severity === 'MUST').length, 0
        ),
        warnings: results.reduce((sum, e) =>
          sum + e.violations.filter(v => v.severity === 'SHOULD').length, 0
        ),
        compliantEntities: results.filter(e => e.isCompliant).length
      };

      const executionTimeMs = timer();

      // STEP 4: Build violations summary with complete lists
      const violationsSummary = this.buildViolationsSummary(results);

      // Audit logging
      auditLogger.log({
        operation: 'validate-best-practices',
        operationType: 'READ',
        componentType: 'Solution',
        componentName: solutionUniqueName || 'Custom Entities',
        success: true,
        parameters: {
          solutionUniqueName,
          entityCount: entities.length,
          publisherPrefix,
          recentDays,
          totalViolations: summary.totalViolations
        },
        executionTimeMs
      });

      // Build final result
      return {
        metadata: {
          generatedAt: new Date().toISOString(),
          solutionName: solutionFriendlyName,
          solutionUniqueName: solutionUniqueName,
          publisherPrefix,
          recentDays,
          executionTimeMs
        },
        summary,
        violationsSummary,
        entities: results,
        statistics: {
          systemColumnsExcluded: statisticsCounters.systemColumns,
          oldColumnsExcluded: statisticsCounters.oldColumns,
          refDataTablesSkipped: results.filter(e => e.isRefData).length
        }
      };
    } catch (error: any) {
      console.error('Error in validateBestPractices:', error);
      auditLogger.log({
        operation: 'validate-best-practices',
        operationType: 'READ',
        componentType: 'Solution',
        componentName: solutionUniqueName || 'Custom Entities',
        success: false,
        error: error.message,
        executionTimeMs: timer()
      });
      throw error;
    }
  }

  /**
   * Helper method to validate entity-level properties and attributes against best practice rules
   */
  private async validateEntityAndAttributes(
    entityMetadata: any,
    filteredAttributes: any[],
    allAttributes: any[],
    publisherPrefix: string,
    rules: string[]
  ): Promise<Violation[]> {
    const violations: Violation[] = [];

    // ENTITY-LEVEL VALIDATION: Check if entity has an icon
    if (rules.includes('entity-icon')) {
      // Only check custom entities (IsCustomEntity = true)
      if (entityMetadata.IsCustomEntity) {
        const hasIcon = entityMetadata.IconVectorName &&
                        entityMetadata.IconVectorName.length > 0 &&
                        entityMetadata.IconVectorName !== null;

        if (!hasIcon) {
          violations.push({
            attributeLogicalName: undefined, // Entity-level violation
            rule: 'Entity Icon',
            severity: 'SHOULD',
            message: `Entity "${entityMetadata.LogicalName}" does not have a custom icon assigned`,
            currentValue: 'No icon',
            expectedValue: 'Custom icon (SVG web resource)',
            action: `Assign a Fluent UI icon using the update-entity-icon tool. Example: update-entity-icon with entityLogicalName="${entityMetadata.LogicalName}" and an appropriate icon file.`,
            recommendation: 'Custom icons improve entity recognition in Model-Driven Apps and enhance user experience. Use Fluent UI System Icons for consistency with Microsoft design language.'
          });
        }
      }
    }

    // RULE 1: Publisher Prefix Check
    if (rules.includes('prefix')) {
      for (const attr of filteredAttributes) {
        if (!attr.LogicalName.startsWith(publisherPrefix)) {
          violations.push({
            attributeLogicalName: attr.LogicalName,
            attributeType: attr.AttributeTypeName?.Value || attr.AttributeType,
            createdOn: attr.CreatedOn,
            rule: 'Publisher Prefix',
            severity: 'MUST',
            message: `Column "${attr.LogicalName}" does not have required prefix "${publisherPrefix}"`,
            currentValue: attr.LogicalName,
            expectedValue: `${publisherPrefix}${attr.LogicalName}`,
            action: `Rename column to add "${publisherPrefix}" prefix`
          });
        }
      }
    }

    // RULE 2: Schema Name Lowercase Check
    if (rules.includes('lowercase')) {
      for (const attr of filteredAttributes) {
        if (attr.LogicalName !== attr.LogicalName.toLowerCase()) {
          violations.push({
            attributeLogicalName: attr.LogicalName,
            attributeType: attr.AttributeTypeName?.Value || attr.AttributeType,
            createdOn: attr.CreatedOn,
            rule: 'Schema Name Lowercase',
            severity: 'MUST',
            message: `Column "${attr.LogicalName}" contains uppercase letters`,
            currentValue: attr.LogicalName,
            expectedValue: attr.LogicalName.toLowerCase(),
            action: `Rename column to use all lowercase: ${attr.LogicalName.toLowerCase()}`
          });
        }
      }
    }

    // RULE 3: Lookup Naming Convention
    if (rules.includes('lookup')) {
      for (const attr of filteredAttributes) {
        // Check if it's a Lookup type
        const isLookup = attr.AttributeType === 'Lookup' ||
                         attr.AttributeTypeName?.Value === 'LookupType';

        if (isLookup && !attr.LogicalName.endsWith('id')) {
          violations.push({
            attributeLogicalName: attr.LogicalName,
            attributeType: 'Lookup',
            createdOn: attr.CreatedOn,
            rule: 'Lookup Naming Convention',
            severity: 'MUST',
            message: `Lookup column "${attr.LogicalName}" does not end with "id"`,
            currentValue: attr.LogicalName,
            expectedValue: `${attr.LogicalName}id`,
            action: `Rename column to add "id" suffix: ${attr.LogicalName}id`
          });
        }
      }
    }

    // RULE 4: Option Set Scope Check
    if (rules.includes('optionset')) {
      for (const attr of filteredAttributes) {
        // Check if it's a Picklist type
        const isPicklist = attr.AttributeType === 'Picklist' ||
                          attr.AttributeTypeName?.Value === 'PicklistType';

        if (isPicklist) {
          try {
            // Need to get full attribute details to check OptionSet.IsGlobal
            const attrDetails = await this.makeRequest<any>(
              `api/data/v9.2/EntityDefinitions(LogicalName='${entityMetadata.LogicalName}')/Attributes(LogicalName='${attr.LogicalName}')?$select=LogicalName&$expand=OptionSet($select=IsGlobal)`
            );

            if (attrDetails.OptionSet && !attrDetails.OptionSet.IsGlobal) {
              violations.push({
                attributeLogicalName: attr.LogicalName,
                attributeType: 'Picklist',
                createdOn: attr.CreatedOn,
                rule: 'Option Set Scope',
                severity: 'SHOULD',
                message: `Option set "${attr.LogicalName}" is local, should be global`,
                currentValue: 'Local Option Set',
                expectedValue: 'Global Option Set',
                action: 'Convert to global option set for reusability',
                recommendation: 'Use global option sets to enable reuse across entities and reduce maintenance'
              });
            }
          } catch (error) {
            // Skip if we can't get option set details
            console.error(`Could not check option set for ${attr.LogicalName}:`, error);
          }
        }
      }
    }

    // RULE 5: Required Column Existence (sic_updatedbyprocess)
    if (rules.includes('required-column')) {
      // Skip for RefData tables
      if (!entityMetadata.LogicalName.startsWith(`${publisherPrefix}ref_`)) {
        const hasUpdatedByProcess = allAttributes.some(
          (attr: any) => attr.LogicalName === `${publisherPrefix}updatedbyprocess`
        );

        if (!hasUpdatedByProcess) {
          violations.push({
            attributeLogicalName: undefined, // Entity-level violation
            rule: 'Required Column Existence',
            severity: 'MUST',
            message: `Entity "${entityMetadata.LogicalName}" is missing required column "${publisherPrefix}updatedbyprocess"`,
            currentValue: 'Missing',
            expectedValue: `Column "${publisherPrefix}updatedbyprocess" of type Text (4000 chars)`,
            action: `Create column with Display Name "Updated by process", Schema Name "${publisherPrefix}updatedbyprocess", Type: Text (4000 chars), Description: "This field is updated, each time an automated process updates this record."`
          });
        }
      }
    }

    return violations;
  }

  /**
   * Build violations summary with complete lists of affected entities and columns grouped by rule
   * @private
   */
  private buildViolationsSummary(entities: EntityValidationResult[]): ViolationSummaryByRule[] {
    // Group violations by rule
    const grouped = new Map<string, Array<Violation & { entityLogicalName: string }>>();

    for (const entity of entities) {
      for (const violation of entity.violations) {
        if (!grouped.has(violation.rule)) {
          grouped.set(violation.rule, []);
        }

        grouped.get(violation.rule)!.push({
          ...violation,
          entityLogicalName: entity.logicalName
        });
      }
    }

    // Build summary for each rule
    const summary: ViolationSummaryByRule[] = [];

    for (const [rule, items] of grouped.entries()) {
      if (items.length === 0) continue;

      // Separate entity-level violations (no attributeLogicalName) from column-level
      const entityLevelViolations = items.filter(v => !v.attributeLogicalName);
      const columnLevelViolations = items.filter(v => v.attributeLogicalName);

      // Get unique affected entities
      const affectedEntities = [...new Set(entityLevelViolations.map(v => v.entityLogicalName))];

      // Get unique affected columns (entity.column format)
      const affectedColumns = [...new Set(
        columnLevelViolations.map(v => `${v.entityLogicalName}.${v.attributeLogicalName}`)
      )];

      // Get severity, action, and recommendation from first violation
      const firstViolation = items[0];

      summary.push({
        rule,
        severity: firstViolation.severity,
        totalCount: items.length,
        affectedEntities,
        affectedColumns,
        action: firstViolation.action,
        recommendation: firstViolation.recommendation
      });
    }

    // Sort by severity (MUST first) then by count (descending)
    summary.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'MUST' ? -1 : 1;
      }
      return b.totalCount - a.totalCount;
    });

    return summary;
  }
}