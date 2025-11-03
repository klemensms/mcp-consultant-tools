import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

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
   */
  private async makeRequest<T>(endpoint: string): Promise<T> {
    try {
      const token = await this.getAccessToken();

      const response = await axios({
        method: 'GET',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        }
      });

      return response.data as T;
    } catch (error: any) {
      const errorDetails = error.response?.data?.error || error.response?.data || error.message;
      console.error('PowerPlatform API request failed:', {
        endpoint,
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
}