/**
 * WebResourceService
 *
 * Service for web resource customization operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';

export class WebResourceService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create a web resource
   */
  async createWebResource(
    webResource: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Prefer: 'return=representation',
    };
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    return this.client.makeRequest(
      'api/data/v9.2/webresourceset',
      'POST',
      webResource,
      headers
    );
  }

  /**
   * Update a web resource
   */
  async updateWebResource(
    webResourceId: string,
    updates: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<void> {
    const headers: Record<string, string> | undefined = solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': solutionUniqueName }
      : undefined;

    await this.client.makeRequest(
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
    await this.client.makeRequest(
      `api/data/v9.2/webresourceset(${webResourceId})`,
      'DELETE'
    );
  }

  /**
   * Get web resource
   */
  async getWebResource(webResourceId: string): Promise<unknown> {
    return this.client.makeRequest(
      `api/data/v9.2/webresourceset(${webResourceId})`
    );
  }

  /**
   * Get web resources by name pattern
   */
  async getWebResources(nameFilter?: string): Promise<unknown> {
    const filter = nameFilter
      ? `?$filter=contains(name,'${nameFilter}')`
      : '';
    return this.client.makeRequest(`api/data/v9.2/webresourceset${filter}`);
  }

  /**
   * Get web resource content (base64 encoded)
   */
  async getWebResourceContent(webResourceId: string): Promise<unknown> {
    return this.client.makeRequest(
      `api/data/v9.2/webresourceset(${webResourceId})?$select=content,name,webresourcetype`
    );
  }

  /**
   * Get web resource dependencies
   */
  async getWebResourceDependencies(webResourceId: string): Promise<unknown> {
    return this.client.makeRequest(
      `api/data/v9.2/webresourceset(${webResourceId})/dependencies`
    );
  }
}
