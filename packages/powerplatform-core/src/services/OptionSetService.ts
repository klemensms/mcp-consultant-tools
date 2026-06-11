/**
 * OptionSetService
 *
 * Service for option set customization operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';

export class OptionSetService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create a global option set
   */
  async createGlobalOptionSet(
    optionSetDefinition: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    return this.client.makeRequest(
      'api/data/v9.2/GlobalOptionSetDefinitions',
      'POST',
      optionSetDefinition,
      headers
    );
  }

  /**
   * Update a global option set
   */
  async updateGlobalOptionSet(
    metadataId: string,
    updates: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<void> {
    const headers: Record<string, string> | undefined = solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': solutionUniqueName }
      : undefined;

    await this.client.makeRequest(
      `api/data/v9.2/GlobalOptionSetDefinitions(${metadataId})`,
      'PUT',
      updates,
      headers
    );
  }

  /**
   * Delete a global option set
   */
  async deleteGlobalOptionSet(metadataId: string): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/GlobalOptionSetDefinitions(${metadataId})`,
      'DELETE'
    );
  }

  /**
   * Add a value to a global option set
   */
  async addOptionSetValue(
    optionSetName: string,
    value: number,
    label: string,
    solutionUniqueName?: string
  ): Promise<unknown> {
    const headers: Record<string, string> | undefined = solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': solutionUniqueName }
      : undefined;

    return this.client.makeRequest(
      'api/data/v9.2/InsertOptionValue',
      'POST',
      {
        OptionSetName: optionSetName,
        Value: value,
        Label: {
          LocalizedLabels: [{ Label: label, LanguageCode: 1033 }],
        },
      },
      headers
    );
  }

  /**
   * Update an option set value
   */
  async updateOptionSetValue(
    optionSetName: string,
    value: number,
    label: string,
    solutionUniqueName?: string
  ): Promise<void> {
    const headers: Record<string, string> = { 'MSCRM.MergeLabels': 'true' };
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    await this.client.makeRequest(
      'api/data/v9.2/UpdateOptionValue',
      'POST',
      {
        OptionSetName: optionSetName,
        Value: value,
        Label: {
          LocalizedLabels: [{ Label: label, LanguageCode: 1033 }],
        },
        MergeLabels: true,
      },
      headers
    );
  }

  /**
   * Delete an option set value
   */
  async deleteOptionSetValue(
    optionSetName: string,
    value: number
  ): Promise<void> {
    await this.client.makeRequest('api/data/v9.2/DeleteOptionValue', 'POST', {
      OptionSetName: optionSetName,
      Value: value,
    });
  }

  /**
   * Reorder option set values
   */
  async reorderOptionSetValues(
    optionSetName: string,
    values: number[],
    solutionUniqueName?: string
  ): Promise<void> {
    const headers: Record<string, string> | undefined = solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': solutionUniqueName }
      : undefined;

    await this.client.makeRequest(
      'api/data/v9.2/OrderOption',
      'POST',
      {
        OptionSetName: optionSetName,
        Values: values,
      },
      headers
    );
  }
}
