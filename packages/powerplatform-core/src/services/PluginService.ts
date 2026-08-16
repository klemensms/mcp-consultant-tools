/**
 * PluginService
 *
 * Read-only service for plugin assemblies, types, steps, images, and trace logs.
 */

import {
  buildTruncation,
  UNCAPPED,
  type TruncationInfo,
} from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { paginateDataverse } from './paginate.js';

/** One SDK message processing step in the environment-wide inventory. */
export interface PluginStepInventoryEntry {
  stepId: string;
  name: string;
  messageName: string;
  stage: number;
  stageName: string;
  mode: number;
  modeName: string;
  statuscode: number;
  enabled: boolean;
  rank: number;
  filteringAttributes: string | null;
  pluginTypeName: string | null;
  assemblyName: string | null;
  isManaged: boolean;
  modifiedOn: string;
}

export interface PluginStepInventoryResult {
  /** Steps in this payload. Read `truncation.totalAvailable` for the population. */
  totalCount: number;
  truncation: TruncationInfo;
  steps: PluginStepInventoryEntry[];
}

export interface PluginAssembliesResult {
  /** Assemblies in this payload. Read `truncation.totalAvailable` for the population. */
  totalCount: number;
  truncation: TruncationInfo;
  /**
   * Assemblies dropped because Dataverse marks them hidden. Reported for the same
   * reason `integration endpoints` reports its own exclusions: a filtered list that
   * declares no filter is indistinguishable from an unfiltered one.
   */
  ootbExcluded: number;
  assemblies: unknown[];
}

export class PluginService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all plugin assemblies in the environment
   */
  async getPluginAssemblies(
    includeManaged: boolean = false,
    maxRecords: number = UNCAPPED
  ): Promise<PluginAssembliesResult> {
    const managedFilter = includeManaged ? '' : '$filter=ismanaged eq false&';

    let ootbExcluded = 0;

    const { rows, hasMore, truncationReason } = await paginateDataverse<
      Record<string, unknown>
    >(this.client, {
      endpoint: `api/data/v9.2/pluginassemblies?${managedFilter}$select=pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,major,minor,createdon,modifiedon,ismanaged,ishidden&$expand=modifiedby($select=fullname)&$orderby=name`,
      maxRecords,
      keep: (assembly) => {
        const isHidden =
          (assembly.ishidden as { Value?: boolean })?.Value !== undefined
            ? (assembly.ishidden as { Value: boolean }).Value
            : assembly.ishidden;
        if (isHidden) {
          ootbExcluded++;
          return false;
        }
        return true;
      },
    });

    const formattedAssemblies = rows.map((assembly) => ({
      pluginassemblyid: assembly.pluginassemblyid,
        name: assembly.name,
      version: assembly.version,
      isolationMode:
        assembly.isolationmode === 1
          ? 'None'
          : assembly.isolationmode === 2
            ? 'Sandbox'
            : 'External',
      isManaged: assembly.ismanaged,
      modifiedOn: assembly.modifiedon,
      modifiedBy: (assembly.modifiedby as { fullname?: string })?.fullname,
      major: assembly.major,
      minor: assembly.minor,
    }));

    return {
      totalCount: formattedAssemblies.length,
      truncation: buildTruncation({
        returnedCount: formattedAssemblies.length,
        requestedMax: maxRecords,
        hasMore,
        truncationReason,
      }),
      ootbExcluded,
      assemblies: formattedAssemblies,
    };
  }

  /**
   * Get a plugin assembly by name with all related plugin types, steps, and images
   */
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
    // Get the plugin assembly
    const assemblies = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/pluginassemblies?$filter=name eq '${assemblyName}'&$select=pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,major,minor,createdon,modifiedon,ismanaged,ishidden,description&$expand=modifiedby($select=fullname)`
    );

    if (!assemblies.value || assemblies.value.length === 0) {
      throw new Error(`Plugin assembly '${assemblyName}' not found`);
    }

    const assembly = assemblies.value[0];
    const assemblyId = assembly.pluginassemblyid as string;

    // Get plugin types
    const pluginTypes = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/plugintypes?$filter=_pluginassemblyid_value eq ${assemblyId}&$select=plugintypeid,typename,friendlyname,name,assemblyname,description,workflowactivitygroupname`
    );

    // Get all steps for each plugin type
    const pluginTypeIds = pluginTypes.value.map((pt) => pt.plugintypeid as string);
    let allSteps: Record<string, unknown>[] = [];

    if (pluginTypeIds.length > 0) {
      const statusFilter = includeDisabled ? '' : ' and statuscode eq 1';
      const typeFilter = pluginTypeIds
        .map((id) => `_plugintypeid_value eq ${id}`)
        .join(' or ');
      const steps = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
        `api/data/v9.2/sdkmessageprocessingsteps?$filter=(${typeFilter})${statusFilter}&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,asyncautodelete,filteringattributes,supporteddeployment,configuration,description,invocationsource,_plugintypeid_value,_sdkmessagefilterid_value,_impersonatinguserid_value,_eventhandler_value&$expand=sdkmessageid($select=name),plugintypeid($select=typename),impersonatinguserid($select=fullname),modifiedby($select=fullname),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=stage,rank`
      );
      allSteps = steps.value;
    }

    // Get all images for these steps
    const stepIds = allSteps.map((s) => s.sdkmessageprocessingstepid as string);
    let allImages: Record<string, unknown>[] = [];

    if (stepIds.length > 0) {
      const imageFilter = stepIds
        .map((id) => `_sdkmessageprocessingstepid_value eq ${id}`)
        .join(' or ');
      const images = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
        `api/data/v9.2/sdkmessageprocessingstepimages?$filter=${imageFilter}&$select=sdkmessageprocessingstepimageid,name,imagetype,messagepropertyname,entityalias,attributes,_sdkmessageprocessingstepid_value`
      );
      allImages = images.value;
    }

    // Attach images to their respective steps
    const stepsWithImages: Array<
      Record<string, unknown> & { images: Record<string, unknown>[] }
    > = allSteps.map((step) => ({
      ...step,
      images: allImages.filter(
        (img) =>
          img._sdkmessageprocessingstepid_value ===
          step.sdkmessageprocessingstepid
      ),
    }));

    // Validation checks
    const validation = {
      hasDisabledSteps: allSteps.some((s) => s.statuscode !== 1),
      hasAsyncSteps: allSteps.some((s) => s.mode === 1),
      hasSyncSteps: allSteps.some((s) => s.mode === 0),
      stepsWithoutFilteringAttributes: stepsWithImages
        .filter((s) => {
          const sdkmsg = s.sdkmessageid as { name?: string } | undefined;
          const msgName = sdkmsg?.name;
          return (
            (msgName === 'Update' || msgName === 'Delete') &&
            !s.filteringattributes
          );
        })
        .map((s) => s.name as string),
      stepsWithoutImages: stepsWithImages
        .filter((s) => {
          const sdkmsg = s.sdkmessageid as { name?: string } | undefined;
          const msgName = sdkmsg?.name;
          return (
            s.images.length === 0 &&
            (msgName === 'Update' || msgName === 'Delete')
          );
        })
        .map((s) => s.name as string),
      potentialIssues: [] as string[],
    };

    if (validation.stepsWithoutFilteringAttributes.length > 0) {
      validation.potentialIssues.push(
        `${validation.stepsWithoutFilteringAttributes.length} Update/Delete steps without filtering attributes (performance concern)`
      );
    }
    if (validation.stepsWithoutImages.length > 0) {
      validation.potentialIssues.push(
        `${validation.stepsWithoutImages.length} Update/Delete steps without images (may need entity data)`
      );
    }

    return {
      assembly,
      pluginTypes: pluginTypes.value,
      steps: stepsWithImages,
      validation,
    };
  }

  /**
   * Get all plugins that execute on a specific entity
   */
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
    const statusFilter = includeDisabled ? '' : ' and statuscode eq 1';
    const msgFilter = messageFilter
      ? ` and sdkmessageid/name eq '${messageFilter}'`
      : '';

    const steps = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/sdkmessageprocessingsteps?$filter=sdkmessagefilterid/primaryobjecttypecode eq '${entityName}'${statusFilter}${msgFilter}&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,asyncautodelete,filteringattributes,supporteddeployment,configuration,description,_plugintypeid_value,_sdkmessagefilterid_value,_impersonatinguserid_value&$expand=sdkmessageid($select=name),plugintypeid($select=typename),impersonatinguserid($select=fullname),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=stage,rank`
    );

    // Get assembly information for each plugin type
    const pluginTypeIds = [
      ...new Set(
        steps.value
          .map((s) => s._plugintypeid_value as string)
          .filter((id) => id != null)
      ),
    ];
    const assemblyMap = new Map<string, unknown>();

    for (const typeId of pluginTypeIds) {
      const pluginType = await this.client.makeRequest<Record<string, unknown>>(
        `api/data/v9.2/plugintypes(${typeId})?$expand=pluginassemblyid($select=name,version)`
      );
      assemblyMap.set(typeId, pluginType.pluginassemblyid);
    }

    // Get images for all steps
    const stepIds = steps.value.map(
      (s) => s.sdkmessageprocessingstepid as string
    );
    let allImages: Record<string, unknown>[] = [];

    if (stepIds.length > 0) {
      const imageFilter = stepIds
        .map((id) => `_sdkmessageprocessingstepid_value eq ${id}`)
        .join(' or ');
      const images = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
        `api/data/v9.2/sdkmessageprocessingstepimages?$filter=${imageFilter}&$select=sdkmessageprocessingstepimageid,name,imagetype,messagepropertyname,entityalias,attributes,_sdkmessageprocessingstepid_value`
      );
      allImages = images.value;
    }

    // Format steps
    const formattedSteps = steps.value.map((step) => {
      const assembly = assemblyMap.get(step._plugintypeid_value as string) as {
        name?: string;
        version?: string;
      };
      const images = allImages.filter(
        (img) =>
          img._sdkmessageprocessingstepid_value ===
          step.sdkmessageprocessingstepid
      );

      return {
        sdkmessageprocessingstepid: step.sdkmessageprocessingstepid,
        name: step.name,
        stage: step.stage,
        stageName:
          step.stage === 10
            ? 'PreValidation'
            : step.stage === 20
              ? 'PreOperation'
              : 'PostOperation',
        mode: step.mode,
        modeName: step.mode === 0 ? 'Synchronous' : 'Asynchronous',
        rank: step.rank,
        message: (step.sdkmessageid as { name?: string })?.name,
        pluginType: (step.plugintypeid as { typename?: string })?.typename,
        assemblyName: assembly?.name,
        assemblyVersion: assembly?.version,
        filteringAttributes: step.filteringattributes
          ? (step.filteringattributes as string).split(',')
          : [],
        statuscode: step.statuscode,
        enabled: step.statuscode === 1,
        deployment:
          step.supporteddeployment === 0
            ? 'Server'
            : step.supporteddeployment === 1
              ? 'Offline'
              : 'Both',
        impersonatingUser: (step.impersonatinguserid as { fullname?: string })
          ?.fullname,
        hasPreImage: images.some(
          (img) => img.imagetype === 0 || img.imagetype === 2
        ),
        hasPostImage: images.some(
          (img) => img.imagetype === 1 || img.imagetype === 2
        ),
        images,
      };
    });

    // Organize by message
    const messageGroups = new Map<
      string,
      {
        messageName: string;
        stages: {
          preValidation: unknown[];
          preOperation: unknown[];
          postOperation: unknown[];
        };
      }
    >();

    formattedSteps.forEach((step) => {
      if (!messageGroups.has(step.message as string)) {
        messageGroups.set(step.message as string, {
          messageName: step.message as string,
          stages: {
            preValidation: [],
            preOperation: [],
            postOperation: [],
          },
        });
      }
      const msg = messageGroups.get(step.message as string)!;
      if (step.stage === 10) msg.stages.preValidation.push(step);
      else if (step.stage === 20) msg.stages.preOperation.push(step);
      else if (step.stage === 40) msg.stages.postOperation.push(step);
    });

    return {
      entity: entityName,
      messages: Array.from(messageGroups.values()),
      steps: formattedSteps,
      executionOrder: formattedSteps.map((s) => s.name as string),
    };
  }

  /**
   * Get plugin trace logs with filtering
   */
  async getPluginTraceLogs(options: {
    entityName?: string;
    messageName?: string;
    correlationId?: string;
    pluginStepId?: string;
    exceptionOnly?: boolean;
    hoursBack?: number;
    maxRecords?: number;
  }): Promise<{ totalCount: number; logs: unknown[] }> {
    const {
      entityName,
      messageName,
      correlationId,
      pluginStepId,
      exceptionOnly = false,
      hoursBack = 24,
      maxRecords = 50,
    } = options;

    // Build filter
    const filters: string[] = [];

    const dateThreshold = new Date();
    dateThreshold.setHours(dateThreshold.getHours() - hoursBack);
    filters.push(`createdon gt ${dateThreshold.toISOString()}`);

    if (entityName) filters.push(`primaryentity eq '${entityName}'`);
    if (messageName) filters.push(`messagename eq '${messageName}'`);
    if (correlationId) filters.push(`correlationid eq '${correlationId}'`);
    if (pluginStepId)
      filters.push(`_sdkmessageprocessingstepid_value eq ${pluginStepId}`);
    if (exceptionOnly) filters.push(`exceptiondetails ne null`);

    const filterString = filters.join(' and ');

    const logs = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/plugintracelogs?$filter=${filterString}&$orderby=createdon desc&$top=${maxRecords}`
    );

    // Parse logs for better readability
    const parsedLogs = logs.value.map((log) => ({
      ...log,
      modeName: log.mode === 0 ? 'Synchronous' : 'Asynchronous',
      operationTypeName: this.getOperationTypeName(log.operationtype as number),
      parsed: {
        hasException: !!log.exceptiondetails,
        exceptionType: log.exceptiondetails
          ? this.extractExceptionType(log.exceptiondetails as string)
          : null,
        exceptionMessage: log.exceptiondetails
          ? this.extractExceptionMessage(log.exceptiondetails as string)
          : null,
        stackTrace: log.exceptiondetails,
      },
    }));

    return {
      totalCount: parsedLogs.length,
      logs: parsedLogs,
    };
  }

  /**
   * Get every SDK message processing step in the environment, across all assemblies.
   *
   * Entity-scoped inspection is `getEntityPluginPipeline`; this is the environment-wide
   * inventory used for cross-environment registration comparison, so disabled steps are
   * included by default: a step enabled in one environment and disabled in another is
   * exactly the drift this is meant to surface.
   *
   * Returns every step by default. A cap is opt-in via `maxRecords`, and when one bites
   * `truncation.hasMore` says so.
   */
  async getAllPluginSteps(options?: {
    includeDisabled?: boolean;
    maxRecords?: number;
  }): Promise<PluginStepInventoryResult> {
    const { includeDisabled = true, maxRecords = UNCAPPED } = options ?? {};
    const statusFilter = includeDisabled ? '' : 'statuscode eq 1 and ';

    const { rows, hasMore, truncationReason } = await paginateDataverse<
      Record<string, unknown>
    >(this.client, {
      endpoint: `api/data/v9.2/sdkmessageprocessingsteps?$filter=${statusFilter}ishidden/Value eq false&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,filteringattributes,ismanaged,modifiedon&$expand=sdkmessageid($select=name),plugintypeid($select=typename,assemblyname)&$orderby=name`,
      maxRecords,
    });

    const steps: PluginStepInventoryEntry[] = rows.map((step) => {
      const sdkmsg = step.sdkmessageid as { name?: string } | null;
      const pluginType = step.plugintypeid as {
        typename?: string;
        assemblyname?: string;
      } | null;

      return {
        stepId: step.sdkmessageprocessingstepid as string,
        name: step.name as string,
        messageName: sdkmsg?.name ?? 'Unknown',
        stage: step.stage as number,
        stageName:
          step.stage === 10
            ? 'PreValidation'
            : step.stage === 20
              ? 'PreOperation'
              : 'PostOperation',
        mode: step.mode as number,
        modeName: step.mode === 0 ? 'Synchronous' : 'Asynchronous',
        statuscode: step.statuscode as number,
        enabled: step.statuscode === 1,
        rank: step.rank as number,
        filteringAttributes: (step.filteringattributes as string) ?? null,
        pluginTypeName: pluginType?.typename ?? null,
        assemblyName: pluginType?.assemblyname ?? null,
        isManaged: step.ismanaged as boolean,
        modifiedOn: step.modifiedon as string,
      };
    });

    return {
      totalCount: steps.length,
      truncation: buildTruncation({
        returnedCount: steps.length,
        requestedMax: maxRecords,
        hasMore,
        truncationReason,
      }),
      steps,
    };
  }

  private getOperationTypeName(operationType: number): string {
    const types: { [key: number]: string } = {
      0: 'None',
      1: 'Create',
      2: 'Update',
      3: 'Delete',
      4: 'Retrieve',
      5: 'RetrieveMultiple',
      6: 'Associate',
      7: 'Disassociate',
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
}
