/**
 * RelationshipService
 *
 * Service for relationship customization operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';

export class RelationshipService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create a one-to-many relationship
   */
  async createOneToManyRelationship(
    relationshipDefinition: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    return this.client.makeRequest(
      'api/data/v9.2/RelationshipDefinitions',
      'POST',
      relationshipDefinition,
      headers
    );
  }

  /**
   * Create a many-to-many relationship
   */
  async createManyToManyRelationship(
    relationshipDefinition: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    return this.client.makeRequest(
      'api/data/v9.2/RelationshipDefinitions',
      'POST',
      relationshipDefinition,
      headers
    );
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(metadataId: string): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/RelationshipDefinitions(${metadataId})`,
      'DELETE'
    );
  }

  /**
   * Update a relationship
   * Note: Most relationship properties are immutable, only labels can be updated
   */
  async updateRelationship(
    metadataId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/RelationshipDefinitions(${metadataId})`,
      'PUT',
      updates,
      { 'MSCRM.MergeLabels': 'true' }
    );
  }
}
