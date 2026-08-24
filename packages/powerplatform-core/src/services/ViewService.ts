/**
 * ViewService
 *
 * Service for view (saved query) customization operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';

export class ViewService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create a view (savedquery)
   */
  async createView(
    view: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    const headers: Record<string, string> | undefined = solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': solutionUniqueName }
      : undefined;

    return this.client.makeRequest(
      'api/data/v9.2/savedqueries',
      'POST',
      view,
      headers
    );
  }

  /**
   * Update a view.
   *
   * Quick Find views (querytype=4) have platform-enforced Web API restrictions:
   * writes to `fetchxml` hard-fail with 0x80040216, and writes to `name` /
   * `layoutxml` return 204 but are silently discarded. `description` and
   * `isdefault` are the only fields the Web API actually persists. We
   * pre-flight the querytype whenever an unsupported field is in the payload
   * and fail fast so callers don't think a no-op PATCH succeeded.
   */
  async updateView(
    viewId: string,
    updates: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<void> {
    const restrictedOnQuickFind = ['fetchxml', 'name', 'layoutxml', 'layoutjson'] as const;
    const touched = restrictedOnQuickFind.filter((f) => Object.prototype.hasOwnProperty.call(updates, f));
    if (touched.length > 0) {
      const existing = await this.client.makeRequest<{ querytype?: number; returnedtypecode?: string }>(
        `api/data/v9.2/savedqueries(${viewId})?$select=querytype,returnedtypecode`
      );
      if (existing?.querytype === 4) {
        const fields = touched.join(', ');
        const entity = existing.returnedtypecode ? ` for entity '${existing.returnedtypecode}'` : '';
        throw new Error(
          `Quick Find views (querytype=4) cannot be updated via the Dataverse Web API - ` +
          `fetchxml PATCH hard-fails with 0x80040216, and name/layoutxml PATCH return 204 but are silently discarded. ` +
          `Rejected fields in this update: ${fields}. ` +
          `Allowed fields on a Quick Find view: description, isdefault. ` +
          `Workaround: edit the Quick Find view${entity} in the maker portal (Solutions → your solution → the table → Views → "Quick Find Active ..."), then Save & Publish. ` +
          `This is a Dataverse platform limitation, not an MCP-side issue - same 400 occurs on any direct savedqueries PATCH.`
        );
      }
    }

    const headers: Record<string, string> | undefined = solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': solutionUniqueName }
      : undefined;

    await this.client.makeRequest(
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
    await this.client.makeRequest(
      `api/data/v9.2/savedqueries(${viewId})`,
      'DELETE'
    );
  }

  /**
   * Get views for an entity
   */
  async getViews(entityLogicalName: string): Promise<unknown> {
    return this.client.makeRequest(
      `api/data/v9.2/savedqueries?$filter=returnedtypecode eq '${entityLogicalName}'&$orderby=querytype`
    );
  }

  /**
   * Set a view as the default view for its entity
   */
  async setDefaultView(viewId: string): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/savedqueries(${viewId})`,
      'PATCH',
      { isdefault: true }
    );
  }

  /**
   * Get the FetchXML from a view
   */
  async getViewFetchXml(viewId: string): Promise<unknown> {
    return this.client.makeRequest(
      `api/data/v9.2/savedqueries(${viewId})?$select=fetchxml,name,returnedtypecode,querytype`
    );
  }
}
