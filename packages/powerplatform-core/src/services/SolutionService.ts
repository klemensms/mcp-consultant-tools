/**
 * SolutionService
 *
 * Service for solution management operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';

export class SolutionService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create a publisher
   */
  async createPublisher(publisher: Record<string, unknown>): Promise<unknown> {
    return this.client.makeRequest(
      'api/data/v9.2/publishers',
      'POST',
      publisher
    );
  }

  /**
   * Get publishers
   */
  async getPublishers(): Promise<unknown> {
    return this.client.makeRequest(
      'api/data/v9.2/publishers?$filter=isreadonly eq false'
    );
  }

  /**
   * Create a solution
   */
  async createSolution(solution: Record<string, unknown>): Promise<unknown> {
    return this.client.makeRequest(
      'api/data/v9.2/solutions',
      'POST',
      solution
    );
  }

  /**
   * Get solutions
   */
  async getSolutions(): Promise<unknown> {
    return this.client.makeRequest(
      'api/data/v9.2/solutions?$filter=isvisible eq true&$orderby=createdon desc'
    );
  }

  /**
   * Get solution by unique name
   */
  async getSolution(uniqueName: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(`api/data/v9.2/solutions?$filter=uniquename eq '${uniqueName}'&$top=1`);
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
    await this.client.makeRequest(
      'api/data/v9.2/AddSolutionComponent',
      'POST',
      {
        SolutionUniqueName: solutionUniqueName,
        ComponentId: componentId,
        ComponentType: componentType,
        AddRequiredComponents: addRequiredComponents,
        IncludedComponentSettingsValues: includedComponentSettingsValues,
      }
    );
  }

  /**
   * Remove component from solution using RemoveSolutionComponent action.
   *
   * KNOWN ISSUE: This action has inconsistent behavior in the Dataverse Web API.
   * The API documentation shows different parameter formats (SolutionComponent entity vs SDK-style),
   * but neither works reliably for all component types.
   *
   * Tested parameter formats that DO NOT work:
   * - SDK-style: { ComponentId, ComponentType, SolutionUniqueName } -> "ComponentId is not a valid parameter"
   * - SolutionComponent with objectid only -> "key property value not set"
   * - SolutionComponent with solutioncomponentid -> misinterprets as objectid
   * - @odata.bind syntax -> "parameter payloads do not support OData property annotations"
   * - Direct DELETE on solutioncomponent record -> "Delete method does not support solutioncomponent"
   *
   * WORKAROUND: Use the Power Apps maker portal UI to remove components, especially Workflows (type 29).
   *
   * @see https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/removesolutioncomponent
   */
  async removeComponentFromSolution(
    solutionUniqueName: string,
    componentId: string,
    componentType: number
  ): Promise<void> {
    const cleanId = componentId.replace(/[{}]/g, '');

    // First, get the solution to find its ID
    const solution = await this.getSolution(solutionUniqueName);
    if (!solution) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }

    // Find the solutioncomponent record
    const result = await this.client.makeRequest<{
      value: Array<{ solutioncomponentid: string }>;
    }>(
      `api/data/v9.2/solutioncomponents?$filter=objectid eq ${cleanId} and _solutionid_value eq ${solution.solutionid} and componenttype eq ${componentType}&$select=solutioncomponentid`
    );

    if (!result.value || result.value.length === 0) {
      throw new Error(
        `Component ${cleanId} (type ${componentType}) not found in solution '${solutionUniqueName}'`
      );
    }

    const solutionComponentId = result.value[0].solutioncomponentid;

    // Use the documented Web API format with SolutionComponent entity
    // Note: This may not work for all component types (known issue with Workflows/type 29)
    await this.client.makeRequest(
      'api/data/v9.2/RemoveSolutionComponent',
      'POST',
      {
        SolutionComponent: {
          solutioncomponentid: solutionComponentId,
          objectid: cleanId,
          componenttype: componentType
        },
        ComponentType: componentType,
        SolutionUniqueName: solutionUniqueName
      }
    );
  }

  /**
   * Get solution components
   */
  async getSolutionComponents(solutionUniqueName: string): Promise<unknown> {
    const solution = await this.getSolution(solutionUniqueName);
    if (!solution) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }

    return this.client.makeRequest(
      `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solution.solutionid}&$orderby=componenttype`
    );
  }

  /**
   * Export solution
   */
  async exportSolution(
    solutionName: string,
    managed: boolean = false
  ): Promise<unknown> {
    return this.client.makeRequest('api/data/v9.2/ExportSolution', 'POST', {
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
      ExportExternalApplications: true,
    });
  }

  /**
   * Import solution
   */
  async importSolution(
    customizationFile: string,
    publishWorkflows: boolean = true,
    overwriteUnmanagedCustomizations: boolean = false
  ): Promise<unknown> {
    return this.client.makeRequest('api/data/v9.2/ImportSolution', 'POST', {
      CustomizationFile: customizationFile,
      PublishWorkflows: publishWorkflows,
      OverwriteUnmanagedCustomizations: overwriteUnmanagedCustomizations,
      SkipProductUpdateDependencies: false,
      HoldingSolution: false,
      ImportJobId: this.generateGuid(),
    });
  }

  /**
   * Delete a solution
   */
  async deleteSolution(solutionId: string): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/solutions(${solutionId})`,
      'DELETE'
    );
  }

  /**
   * Generate a GUID
   */
  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
