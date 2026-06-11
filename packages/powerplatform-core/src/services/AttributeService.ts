/**
 * AttributeService
 *
 * Service for attribute (column) customization operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import { bestPracticesValidator } from '../utils/bestPractices.js';
import { rateLimiter } from '../utils/rate-limiter.js';

export class AttributeService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create a new attribute on an entity
   */
  async createAttribute(
    entityLogicalName: string,
    attributeDefinition: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    // Validate attribute name against best practices
    const schemaName =
      (attributeDefinition.SchemaName as string) ||
      (attributeDefinition.LogicalName as string);
    const isLookup =
      attributeDefinition['@odata.type'] ===
      'Microsoft.Dynamics.CRM.LookupAttributeMetadata';
    const nameValidation = bestPracticesValidator.validateAttributeName(
      schemaName,
      isLookup
    );

    if (!nameValidation.isValid) {
      throw new Error(
        `Attribute name validation failed: ${nameValidation.issues.join(', ')}`
      );
    }

    // Validate boolean usage (best practice is to avoid booleans)
    const isBoolean =
      attributeDefinition['@odata.type'] ===
      'Microsoft.Dynamics.CRM.BooleanAttributeMetadata';
    if (isBoolean) {
      bestPracticesValidator.validateBooleanUsage('Boolean', schemaName);
    }

    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    // Execute with rate limiting
    return rateLimiter.execute(async () => {
      return this.client.makeRequest(
        `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
        'POST',
        attributeDefinition,
        headers
      );
    });
  }

  /**
   * Update an existing attribute
   */
  async updateAttribute(
    entityLogicalName: string,
    attributeLogicalName: string,
    updates: Record<string, unknown>,
    getEntityAttribute: (
      entityName: string,
      attrName: string
    ) => Promise<Record<string, unknown>>,
    solutionUniqueName?: string
  ): Promise<void> {
    const headers: Record<string, string> = {
      'MSCRM.MergeLabels': 'true',
    };
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    // First, get the existing attribute to retrieve its @odata.type and merge updates
    const existingAttribute = await getEntityAttribute(
      entityLogicalName,
      attributeLogicalName
    );

    // Merge the updates with required fields
    const payload = {
      ...updates,
      '@odata.type': existingAttribute['@odata.type'],
      LogicalName: attributeLogicalName,
      AttributeType: existingAttribute.AttributeType,
    };

    await this.client.makeRequest(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')`,
      'PUT',
      payload,
      headers
    );
  }

  /**
   * Delete an attribute
   */
  async deleteAttribute(
    entityLogicalName: string,
    attributeMetadataId: string
  ): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(${attributeMetadataId})`,
      'DELETE'
    );
  }

  /**
   * Create a picklist attribute using a global option set
   */
  async createGlobalOptionSetAttribute(
    entityLogicalName: string,
    attributeDefinition: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    // Ensure the attribute is of type PicklistAttributeMetadata with GlobalOptionSet
    const definition = { ...attributeDefinition };
    if (!definition['@odata.type']) {
      definition['@odata.type'] =
        'Microsoft.Dynamics.CRM.PicklistAttributeMetadata';
    }

    return this.client.makeRequest(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
      'POST',
      definition,
      headers
    );
  }
}
