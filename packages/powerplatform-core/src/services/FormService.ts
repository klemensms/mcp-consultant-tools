/**
 * FormService
 *
 * Service for form customization operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';

export class FormService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create a form (systemform)
   */
  async createForm(
    form: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    const headers: Record<string, string> | undefined = solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': solutionUniqueName }
      : undefined;

    return this.client.makeRequest(
      'api/data/v9.2/systemforms',
      'POST',
      form,
      headers
    );
  }

  /**
   * Update a form
   */
  async updateForm(
    formId: string,
    updates: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<void> {
    const headers: Record<string, string> | undefined = solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': solutionUniqueName }
      : undefined;

    await this.client.makeRequest(
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
    await this.client.makeRequest(
      `api/data/v9.2/systemforms(${formId})`,
      'DELETE'
    );
  }

  /**
   * Get forms for an entity
   */
  async getForms(entityLogicalName: string): Promise<unknown> {
    return this.client.makeRequest(
      `api/data/v9.2/systemforms?$filter=objecttypecode eq '${entityLogicalName}'&$orderby=type`
    );
  }

  /**
   * Activate a form (set statecode=1)
   */
  async activateForm(formId: string): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/systemforms(${formId})`,
      'PATCH',
      { statecode: 1, statuscode: 1 }
    );
  }

  /**
   * Deactivate a form (set statecode=0)
   */
  async deactivateForm(formId: string): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/systemforms(${formId})`,
      'PATCH',
      { statecode: 0, statuscode: 2 }
    );
  }
}
