/**
 * EntityService
 *
 * Service for entity (table) customization operations.
 * Note: This service should only be used by powerplatform-customization package.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { bestPracticesValidator } from '../utils/bestPractices.js';
import { iconManager } from '../utils/iconManager.js';
import { rateLimiter } from '../utils/rate-limiter.js';

export class EntityService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Create a new custom entity (table)
   */
  async createEntity(
    entityDefinition: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<unknown> {
    // Validate entity name against best practices
    const schemaName =
      (entityDefinition.SchemaName as string) ||
      (entityDefinition.LogicalName as string);
    const isRefData = schemaName?.toLowerCase().includes('ref_') || false;
    const nameValidation = bestPracticesValidator.validateEntityName(
      schemaName,
      isRefData
    );

    if (!nameValidation.isValid) {
      throw new Error(
        `Entity name validation failed: ${nameValidation.issues.join(', ')}`
      );
    }

    // Validate ownership type
    const ownershipType = entityDefinition.OwnershipType as string | undefined;
    if (ownershipType) {
      bestPracticesValidator.validateOwnershipType(ownershipType);
    }

    const headers: Record<string, string> = {};
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    // Execute with rate limiting
    return rateLimiter.execute(async () => {
      return this.client.makeRequest(
        'api/data/v9.2/EntityDefinitions',
        'POST',
        entityDefinition,
        headers
      );
    });
  }

  /**
   * Update an existing entity
   */
  async updateEntity(
    metadataId: string,
    updates: Record<string, unknown>,
    solutionUniqueName?: string
  ): Promise<void> {
    const headers: Record<string, string> = {
      'MSCRM.MergeLabels': 'true',
    };
    if (solutionUniqueName) {
      headers['MSCRM.SolutionUniqueName'] = solutionUniqueName;
    }

    await this.client.makeRequest(
      `api/data/v9.2/EntityDefinitions(${metadataId})`,
      'PUT',
      updates,
      headers
    );
  }

  /**
   * Delete a custom entity
   */
  async deleteEntity(metadataId: string): Promise<void> {
    await this.client.makeRequest(
      `api/data/v9.2/EntityDefinitions(${metadataId})`,
      'DELETE'
    );
  }

  /**
   * Update entity icon using Fluent UI System Icon
   */
  async updateEntityIcon(
    entityLogicalName: string,
    iconFileName: string,
    dependencies: {
      getEntityMetadata: (name: string) => Promise<Record<string, unknown>>;
      createWebResource: (
        resource: Record<string, unknown>,
        solution?: string
      ) => Promise<Record<string, unknown>>;
      updateWebResource: (
        id: string,
        updates: Record<string, unknown>,
        solution?: string
      ) => Promise<void>;
      publishComponent: (id: string, componentType: number) => Promise<void>;
    },
    solutionUniqueName?: string
  ): Promise<{
    success: boolean;
    entityLogicalName: string;
    entitySchemaName: string;
    iconFileName: string;
    webResourceId: string;
    webResourceName: string;
    iconVectorName: string;
    message: string;
  }> {
    // Step 1: Get entity metadata
    let entityMetadata: Record<string, unknown>;
    try {
      entityMetadata = await dependencies.getEntityMetadata(entityLogicalName);
    } catch (error) {
      throw new Error(
        `Step 1 failed (get entity metadata): ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const entitySchemaName = entityMetadata.SchemaName as string;
    const metadataId = entityMetadata.MetadataId as string;

    if (!metadataId) {
      throw new Error(
        `Could not find MetadataId for entity '${entityLogicalName}'`
      );
    }

    // Step 2: Fetch the icon SVG from Fluent UI GitHub
    const svgContent = await iconManager.fetchIcon(iconFileName);

    // Step 3: Validate the SVG
    const validation = iconManager.validateIconSvg(svgContent);
    if (!validation.valid) {
      throw new Error(`Invalid SVG: ${validation.error}`);
    }

    // Step 4: Convert SVG to base64
    const base64Content = Buffer.from(svgContent).toString('base64');

    // Step 5: Generate web resource name
    const webResourceName = iconManager.generateWebResourceName(
      entitySchemaName,
      iconFileName.replace('.svg', '')
    );

    // Step 6: Check if web resource already exists
    const existingResourcesResponse = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/webresourceset?$filter=name eq '${webResourceName}'&$select=webresourceid,name`
    );

    let webResourceId: string;
    const displayName =
      (entityMetadata.DisplayName as { UserLocalizedLabel?: { Label?: string } })
        ?.UserLocalizedLabel?.Label || entityLogicalName;

    if (
      existingResourcesResponse.value &&
      existingResourcesResponse.value.length > 0
    ) {
      // Web resource exists, update it
      const existing = existingResourcesResponse.value[0];
      webResourceId = existing.webresourceid as string;

      try {
        await dependencies.updateWebResource(
          webResourceId,
          {
            displayname: `Icon for ${displayName}`,
            content: base64Content,
            description: `Fluent UI icon (${iconFileName}) for ${entityLogicalName} entity`,
          },
          solutionUniqueName
        );
      } catch (error) {
        throw new Error(
          `Step 6 failed (update existing web resource '${webResourceName}'): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      // Web resource doesn't exist, create new
      let webResourceResult: Record<string, unknown>;
      try {
        webResourceResult = await dependencies.createWebResource(
          {
            name: webResourceName,
            displayname: `Icon for ${displayName}`,
            webresourcetype: 11, // SVG
            content: base64Content,
            description: `Fluent UI icon (${iconFileName}) for ${entityLogicalName} entity`,
          },
          solutionUniqueName
        );
      } catch (error) {
        throw new Error(
          `Step 6 failed (create web resource '${webResourceName}'): ${error instanceof Error ? error.message : String(error)}`
        );
      }
      webResourceId = webResourceResult.webresourceid as string;

      if (!webResourceId) {
        throw new Error(
          `Step 6 failed: web resource '${webResourceName}' was created but the server did not return a webresourceid. This is a bug - please report it.`
        );
      }
    }

    // Step 7: Generate icon vector name
    const iconVectorName = iconManager.generateIconVectorName(webResourceName);

    // Step 8: Publish the web resource BEFORE updating entity metadata.
    // Dataverse validates that IconVectorName references a published web resource.
    try {
      await dependencies.publishComponent(webResourceId, 61);
    } catch (error) {
      throw new Error(
        `Step 8 failed (publish web resource '${webResourceName}'): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 9: Update entity metadata with icon reference
    const entityUpdates = {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      IconVectorName: iconVectorName,
    };

    try {
      await this.updateEntity(metadataId, entityUpdates, solutionUniqueName);
    } catch (error) {
      throw new Error(
        `Step 9 failed (set IconVectorName='${iconVectorName}' on entity '${entityLogicalName}'): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 10: Publish the entity (component type 1)
    try {
      await dependencies.publishComponent(metadataId, 1);
    } catch (error) {
      throw new Error(
        `Step 10 failed (publish entity '${entityLogicalName}'): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return {
      success: true,
      entityLogicalName,
      entitySchemaName,
      iconFileName,
      webResourceId,
      webResourceName,
      iconVectorName,
      message:
        'Entity icon updated and published successfully. The icon should now be visible in the UI.',
    };
  }
}
