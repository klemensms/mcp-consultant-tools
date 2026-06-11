/**
 * DependencyService
 *
 * Service for checking component dependencies.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';

export class DependencyService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Check component dependencies using RetrieveDependenciesForDelete function.
   * This is a Dataverse function (GET), not an action (POST).
   */
  async checkDependencies(
    componentId: string,
    componentType: number
  ): Promise<unknown> {
    const endpoint =
      `api/data/v9.2/RetrieveDependenciesForDelete(ObjectId=@oid,ComponentType=@ct)` +
      `?@oid=${encodeURIComponent(componentId)}&@ct=${componentType}`;
    return this.client.makeRequest(endpoint, 'GET');
  }

  /**
   * Check if component can be deleted
   */
  async checkDeleteEligibility(
    componentId: string,
    componentType: number
  ): Promise<{ canDelete: boolean; dependencies: unknown[]; error?: string }> {
    try {
      const result = (await this.checkDependencies(
        componentId,
        componentType
      )) as { value?: unknown[]; EntityCollection?: { Entities?: unknown[] } };
      // Web API returns { value: [...] }; Organization Service returns { EntityCollection: { Entities: [...] } }
      const dependencies = result.value || result.EntityCollection?.Entities || [];

      return {
        canDelete: dependencies.length === 0,
        dependencies: dependencies,
      };
    } catch (err: any) {
      return {
        canDelete: false,
        dependencies: [],
        error: err.message || 'Failed to retrieve dependencies',
      };
    }
  }

  /**
   * Check dependencies for a specific component (alias for checkDependencies)
   */
  async checkComponentDependencies(
    componentId: string,
    componentType: number
  ): Promise<unknown> {
    return this.checkDependencies(componentId, componentType);
  }
}
