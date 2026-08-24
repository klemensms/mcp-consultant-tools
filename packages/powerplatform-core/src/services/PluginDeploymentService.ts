/**
 * PluginDeploymentService
 *
 * Service for plugin deployment operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { auditLogger } from '../utils/auditLogger.js';

export interface PluginTypeInfo {
  pluginTypeId: string;
  typeName: string;
  friendlyName: string;
}

export interface CreatePluginAssemblyOptions {
  name: string;
  content: string; // Base64-encoded DLL
  version: string;
  isolationMode?: number; // 2 = Sandbox (default)
  sourceType?: number; // 0 = Database (default)
  description?: string;
  solutionUniqueName?: string;
}

export interface RegisterPluginStepOptions {
  pluginTypeId: string;
  name: string;
  messageName: string;
  primaryEntityName: string;
  stage: number; // 10=PreValidation, 20=PreOperation, 40=PostOperation
  executionMode: number; // 0=Sync, 1=Async
  rank?: number;
  filteringAttributes?: string; // Comma-separated
  configuration?: string;
  supportedDeployment?: number; // 0=Server, 1=Client, 2=Both
  solutionUniqueName?: string;
}

export interface RegisterPluginImageOptions {
  stepId: string;
  name: string;
  imageType: number; // 0=PreImage, 1=PostImage, 2=Both
  entityAlias: string;
  attributes?: string; // Comma-separated (empty = all)
  messagePropertyName?: string; // Default: "Target"
}

export interface PluginPackageInfo {
  pluginpackageid: string;
  uniquename: string;
  name: string;
  version: string;
  modifiedon: string;
  ismanaged: boolean;
}

export interface DeployPluginPackageOptions {
  content: string; // Base64-encoded .nupkg
  uniqueName: string;
  version: string;
  solutionUniqueName?: string;
}

export class PluginDeploymentService {
  constructor(
    private client: PowerPlatformClient,
    private addComponentToSolution: (
      solutionUniqueName: string,
      componentId: string,
      componentType: number
    ) => Promise<void>
  ) {}

  /**
   * Extract assembly version from .NET DLL
   */
  async extractAssemblyVersion(assemblyPath: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const normalizedPath = assemblyPath.replace(/\\/g, '/');
      const buffer = await fs.readFile(normalizedPath);

      // Validate DLL format
      const header = buffer.toString('utf8', 0, 2);
      if (header !== 'MZ') {
        return '1.0.0.0';
      }

      // Search for version pattern
      const bufferStr = buffer.toString('utf16le');
      const versionMatch = bufferStr.match(/\d+\.\d+\.\d+\.\d+/);

      return versionMatch ? versionMatch[0] : '1.0.0.0';
    } catch {
      return '1.0.0.0';
    }
  }

  /**
   * Query plugin type by typename
   */
  async queryPluginTypeByTypename(typename: string): Promise<string> {
    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/plugintypes?$filter=typename eq '${typename}'&$select=plugintypeid`
    );

    if (!response.value || response.value.length === 0) {
      throw new Error(
        `Plugin type '${typename}' not found. Did you upload the assembly first?`
      );
    }

    return response.value[0].plugintypeid as string;
  }

  /**
   * Query plugin assembly by name
   */
  async queryPluginAssemblyByName(assemblyName: string): Promise<string | null> {
    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/pluginassemblies?$filter=name eq '${assemblyName}'&$select=pluginassemblyid`
    );

    if (!response.value || response.value.length === 0) {
      return null;
    }

    return response.value[0].pluginassemblyid as string;
  }

  /**
   * Get plugin types for an assembly
   */
  async getPluginTypesForAssembly(assemblyId: string): Promise<PluginTypeInfo[]> {
    const types = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/plugintypes?$filter=_pluginassemblyid_value eq ${assemblyId}&$select=plugintypeid,typename,friendlyname`
    );

    return types.value.map((t) => ({
      pluginTypeId: t.plugintypeid as string,
      typeName: t.typename as string,
      friendlyName: t.friendlyname as string,
    }));
  }

  /**
   * Resolve SDK Message and Filter IDs
   */
  async resolveSdkMessageAndFilter(
    messageName: string,
    entityName: string
  ): Promise<{ messageId: string; filterId: string }> {
    const timer = auditLogger.startTimer();

    try {
      // Get SDK Message ID
      const messages = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/sdkmessages?$filter=name eq '${messageName}'&$select=sdkmessageid,name`
      );

      if (!messages.value || messages.value.length === 0) {
        throw new Error(
          `SDK message '${messageName}' not found. Common: Create, Update, Delete, SetState`
        );
      }

      const messageId = messages.value[0].sdkmessageid as string;

      // Get SDK Message Filter ID
      const filters = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/sdkmessagefilters?$filter=sdkmessageid/sdkmessageid eq ${messageId} and primaryobjecttypecode eq '${entityName}'&$select=sdkmessagefilterid`
      );

      if (!filters.value || filters.value.length === 0) {
        throw new Error(
          `SDK message filter not found for '${messageName}' on '${entityName}'`
        );
      }

      const filterId = filters.value[0].sdkmessagefilterid as string;

      auditLogger.log({
        operation: 'resolve-sdk-message-filter',
        operationType: 'READ',
        componentType: 'SdkMessage',
        success: true,
        parameters: { messageName, entityName, messageId, filterId },
        executionTimeMs: timer(),
      });

      return { messageId, filterId };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'resolve-sdk-message-filter',
        operationType: 'READ',
        componentType: 'SdkMessage',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Create a new plugin assembly
   */
  async createPluginAssembly(
    options: CreatePluginAssemblyOptions
  ): Promise<{ pluginAssemblyId: string; pluginTypes: PluginTypeInfo[] }> {
    const timer = auditLogger.startTimer();

    try {
      // Validate DLL size (16MB limit)
      const dllSize = Buffer.from(options.content, 'base64').length;
      const maxSize = 16 * 1024 * 1024;

      if (dllSize > maxSize) {
        throw new Error(
          `Assembly exceeds 16MB limit (current: ${(dllSize / 1024 / 1024).toFixed(2)}MB)`
        );
      }

      const assemblyData: Record<string, unknown> = {
        name: options.name,
        content: options.content,
        version: options.version,
        isolationmode: options.isolationMode ?? 2,
        sourcetype: options.sourceType ?? 0,
        culture: 'neutral',
      };

      if (options.description) {
        assemblyData.description = options.description;
      }

      const createResponse = await this.client.makeRequest<
        Record<string, unknown>
      >('api/data/v9.2/pluginassemblies', 'POST', assemblyData, {
        Prefer: 'return=representation',
      });

      const pluginAssemblyId =
        (createResponse.pluginassemblyid as string) ||
        (createResponse.id as string);

      if (!pluginAssemblyId) {
        throw new Error('Plugin assembly created but ID not returned');
      }

      // Add to solution if specified
      if (options.solutionUniqueName) {
        await this.addComponentToSolution(
          options.solutionUniqueName,
          pluginAssemblyId,
          91 // PluginAssembly
        );
      }

      // Poll for plugin types (async creation)
      const pluginTypes: PluginTypeInfo[] = [];
      const maxAttempts = 30;
      const pollInterval = 2000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        const types = await this.getPluginTypesForAssembly(pluginAssemblyId);
        if (types.length > 0) {
          pluginTypes.push(...types);
          break;
        }
      }

      if (pluginTypes.length === 0) {
        throw new Error(
          `Plugin types not created after ${(maxAttempts * pollInterval) / 1000} seconds`
        );
      }

      auditLogger.log({
        operation: 'create-plugin-assembly',
        operationType: 'CREATE',
        componentId: pluginAssemblyId,
        componentType: 'PluginAssembly',
        success: true,
        parameters: {
          name: options.name,
          version: options.version,
          size: dllSize,
          pluginTypeCount: pluginTypes.length,
        },
        executionTimeMs: timer(),
      });

      return { pluginAssemblyId, pluginTypes };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'create-plugin-assembly',
        operationType: 'CREATE',
        componentName: options.name,
        componentType: 'PluginAssembly',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Update an existing plugin assembly
   */
  async updatePluginAssembly(
    assemblyId: string,
    content: string,
    version: string,
    solutionUniqueName?: string
  ): Promise<void> {
    const timer = auditLogger.startTimer();

    try {
      const dllSize = Buffer.from(content, 'base64').length;
      const maxSize = 16 * 1024 * 1024;

      if (dllSize > maxSize) {
        throw new Error(
          `Assembly exceeds 16MB limit (current: ${(dllSize / 1024 / 1024).toFixed(2)}MB)`
        );
      }

      await this.client.makeRequest(
        `api/data/v9.2/pluginassemblies(${assemblyId})`,
        'PATCH',
        { content, version }
      );

      if (solutionUniqueName) {
        await this.addComponentToSolution(solutionUniqueName, assemblyId, 91);
      }

      auditLogger.log({
        operation: 'update-plugin-assembly',
        operationType: 'UPDATE',
        componentId: assemblyId,
        componentType: 'PluginAssembly',
        success: true,
        parameters: { assemblyId, version, size: dllSize },
        executionTimeMs: timer(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'update-plugin-assembly',
        operationType: 'UPDATE',
        componentId: assemblyId,
        componentType: 'PluginAssembly',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Delete a plugin assembly
   */
  async deletePluginAssembly(assemblyId: string): Promise<void> {
    const timer = auditLogger.startTimer();

    try {
      await this.client.makeRequest(
        `api/data/v9.2/pluginassemblies(${assemblyId})`,
        'DELETE'
      );

      auditLogger.log({
        operation: 'delete-plugin-assembly',
        operationType: 'DELETE',
        componentId: assemblyId,
        componentType: 'PluginAssembly',
        success: true,
        executionTimeMs: timer(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'delete-plugin-assembly',
        operationType: 'DELETE',
        componentId: assemblyId,
        componentType: 'PluginAssembly',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw new Error(`Failed to delete plugin assembly: ${errorMessage}`);
    }
  }

  /**
   * Delete a plugin step
   */
  async deletePluginStep(stepId: string): Promise<void> {
    const timer = auditLogger.startTimer();

    try {
      await this.client.makeRequest(
        `api/data/v9.2/sdkmessageprocessingsteps(${stepId})`,
        'DELETE'
      );

      auditLogger.log({
        operation: 'delete-plugin-step',
        operationType: 'DELETE',
        componentId: stepId,
        componentType: 'PluginStep',
        success: true,
        executionTimeMs: timer(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'delete-plugin-step',
        operationType: 'DELETE',
        componentId: stepId,
        componentType: 'PluginStep',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      // Log but don't throw - rollback should continue
    }
  }

  /**
   * Register a plugin step
   */
  async registerPluginStep(
    options: RegisterPluginStepOptions
  ): Promise<{ stepId: string }> {
    const timer = auditLogger.startTimer();

    try {
      const { messageId, filterId } = await this.resolveSdkMessageAndFilter(
        options.messageName,
        options.primaryEntityName
      );

      const stepData: Record<string, unknown> = {
        name: options.name,
        'plugintypeid@odata.bind': `/plugintypes(${options.pluginTypeId})`,
        'sdkmessageid@odata.bind': `/sdkmessages(${messageId})`,
        'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filterId})`,
        stage: options.stage,
        mode: options.executionMode,
        rank: options.rank ?? 1,
        supporteddeployment: options.supportedDeployment ?? 0,
        statuscode: 1,
      };

      if (options.filteringAttributes) {
        stepData.filteringattributes = options.filteringAttributes;
      }

      if (options.configuration) {
        stepData.configuration = options.configuration;
      }

      const createResponse = await this.client.makeRequest<
        Record<string, unknown>
      >('api/data/v9.2/sdkmessageprocessingsteps', 'POST', stepData, {
        Prefer: 'return=representation',
      });

      const stepId =
        (createResponse.sdkmessageprocessingstepid as string) ||
        (createResponse.id as string);

      if (!stepId) {
        throw new Error('Plugin step created but ID not returned');
      }

      if (options.solutionUniqueName) {
        await this.addComponentToSolution(
          options.solutionUniqueName,
          stepId,
          92 // SDKMessageProcessingStep
        );
      }

      auditLogger.log({
        operation: 'register-plugin-step',
        operationType: 'CREATE',
        componentId: stepId,
        componentType: 'PluginStep',
        success: true,
        parameters: {
          name: options.name,
          messageName: options.messageName,
          primaryEntity: options.primaryEntityName,
          stage: options.stage,
          mode: options.executionMode,
        },
        executionTimeMs: timer(),
      });

      return { stepId };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'register-plugin-step',
        operationType: 'CREATE',
        componentName: options.name,
        componentType: 'PluginStep',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Register a plugin image
   */
  async registerPluginImage(
    options: RegisterPluginImageOptions
  ): Promise<{ imageId: string }> {
    const timer = auditLogger.startTimer();

    try {
      const imageData: Record<string, unknown> = {
        name: options.name,
        'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${options.stepId})`,
        imagetype: options.imageType,
        entityalias: options.entityAlias,
        messagepropertyname: options.messagePropertyName || 'Target',
      };

      if (options.attributes !== undefined) {
        imageData.attributes = options.attributes;
      }

      const createResponse = await this.client.makeRequest<
        Record<string, unknown>
      >('api/data/v9.2/sdkmessageprocessingstepimages', 'POST', imageData, {
        Prefer: 'return=representation',
      });

      const imageId =
        (createResponse.sdkmessageprocessingstepimageid as string) ||
        (createResponse.id as string);

      if (!imageId) {
        throw new Error('Plugin image created but ID not returned');
      }

      auditLogger.log({
        operation: 'register-plugin-image',
        operationType: 'CREATE',
        componentId: imageId,
        componentType: 'PluginImage',
        success: true,
        parameters: {
          name: options.name,
          imageType: options.imageType,
          stepId: options.stepId,
        },
        executionTimeMs: timer(),
      });

      return { imageId };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'register-plugin-image',
        operationType: 'CREATE',
        componentName: options.name,
        componentType: 'PluginImage',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get all plugin packages in the environment
   */
  async getPluginPackages(
    includeManaged = false,
    maxRecords = 100
  ): Promise<PluginPackageInfo[]> {
    const timer = auditLogger.startTimer();

    try {
      let url =
        'api/data/v9.2/pluginpackages?$select=pluginpackageid,uniquename,name,version,modifiedon,ismanaged';
      if (!includeManaged) {
        url += '&$filter=ismanaged eq false';
      }
      url += `&$top=${maxRecords}&$orderby=modifiedon desc`;

      const response = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(url);

      auditLogger.log({
        operation: 'get-plugin-packages',
        operationType: 'READ',
        componentType: 'PluginPackage',
        success: true,
        parameters: { includeManaged, maxRecords, count: response.value.length },
        executionTimeMs: timer(),
      });

      return response.value.map((p) => ({
        pluginpackageid: p.pluginpackageid as string,
        uniquename: p.uniquename as string,
        name: (p.name as string) || '',
        version: (p.version as string) || '',
        modifiedon: (p.modifiedon as string) || '',
        ismanaged: (p.ismanaged as boolean) || false,
      }));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'get-plugin-packages',
        operationType: 'READ',
        componentType: 'PluginPackage',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Query a plugin package by unique name
   */
  async queryPluginPackageByName(
    uniqueName: string
  ): Promise<{ pluginpackageid: string; version: string } | null> {
    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/pluginpackages?$filter=uniquename eq '${uniqueName}'&$select=pluginpackageid,version`
    );

    if (!response.value || response.value.length === 0) {
      return null;
    }

    return {
      pluginpackageid: response.value[0].pluginpackageid as string,
      version: (response.value[0].version as string) || '',
    };
  }

  /**
   * Deploy a plugin package (.nupkg) - creates or updates
   */
  async deployPluginPackage(
    options: DeployPluginPackageOptions
  ): Promise<{ pluginpackageid: string; action: 'created' | 'updated' }> {
    const timer = auditLogger.startTimer();

    try {
      const existing = await this.queryPluginPackageByName(options.uniqueName);

      let pluginpackageid: string;
      let action: 'created' | 'updated';

      if (existing) {
        // Update existing package
        await this.client.makeRequest(
          `api/data/v9.2/pluginpackages(${existing.pluginpackageid})`,
          'PATCH',
          {
            content: options.content,
            version: options.version,
          }
        );
        pluginpackageid = existing.pluginpackageid;
        action = 'updated';
      } else {
        // Create new package
        const createResponse = await this.client.makeRequest<
          Record<string, unknown>
        >('api/data/v9.2/pluginpackages', 'POST', {
          uniquename: options.uniqueName,
          name: options.uniqueName,
          content: options.content,
          version: options.version,
        }, {
          Prefer: 'return=representation',
        });

        pluginpackageid =
          (createResponse.pluginpackageid as string) ||
          (createResponse.id as string);

        if (!pluginpackageid) {
          throw new Error('Plugin package created but ID not returned');
        }
        action = 'created';
      }

      // Add to solution only for new packages or when explicitly requested
      // For updates, the package is already in its solution - no need to re-add
      if (options.solutionUniqueName && action === 'created') {
        await this.addComponentToSolution(
          options.solutionUniqueName,
          pluginpackageid,
          10080 // PluginPackage component type
        );
      }

      auditLogger.log({
        operation: 'deploy-plugin-package',
        operationType: action === 'created' ? 'CREATE' : 'UPDATE',
        componentId: pluginpackageid,
        componentType: 'PluginPackage',
        success: true,
        parameters: {
          uniqueName: options.uniqueName,
          version: options.version,
          action,
        },
        executionTimeMs: timer(),
      });

      return { pluginpackageid, action };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      auditLogger.log({
        operation: 'deploy-plugin-package',
        operationType: 'CREATE',
        componentName: options.uniqueName,
        componentType: 'PluginPackage',
        success: false,
        error: errorMessage,
        executionTimeMs: timer(),
      });
      throw error;
    }
  }
}
