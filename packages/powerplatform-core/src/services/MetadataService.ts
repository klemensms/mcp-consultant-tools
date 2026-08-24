/**
 * MetadataService
 *
 * Read-only service for entity metadata, attributes, relationships, and option sets.
 */

import { buildTruncation, type TruncationInfo } from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { paginateDataverse } from './paginate.js';

export class MetadataService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get metadata about an entity
   */
  async getEntityMetadata(entityName: string): Promise<unknown> {
    const response = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')`
    );

    // Remove Privileges property if it exists
    if (response && typeof response === 'object' && 'Privileges' in response) {
      delete response.Privileges;
    }

    return response;
  }

  /**
   * Get metadata about entity attributes/fields
   */
  async getEntityAttributes(
    entityName: string,
    options?: {
      prefix?: string;
      attributeType?: string;
      maxAttributes?: number;
    }
  ): Promise<{
    value: unknown[];
    hasMore: boolean;
    returnedCount: number;
    totalBeforeFilter?: number;
  }> {
    const selectProperties = [
      'LogicalName',
      'AttributeType',
      'DisplayName',
      'RequiredLevel',
    ].join(',');

    const filters: string[] = ["AttributeType ne 'Virtual'"];
    if (options?.attributeType) {
      filters.push(`AttributeType eq '${options.attributeType}'`);
    }
    const filterString = filters.join(' and ');

    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes?$select=${selectProperties}&$filter=${filterString}`
    );

    let attributes = response.value || [];

    // Filter out yominame attributes
    attributes = attributes.filter((attr) => {
      const logicalName = (attr.LogicalName as string) || '';
      return !logicalName.endsWith('yominame');
    });

    // Filter out *name attributes when base attribute exists
    const baseNames = new Set<string>();
    const namesAttributes = new Map<string, unknown>();

    for (const attribute of attributes) {
      const logicalName = (attribute.LogicalName as string) || '';

      if (logicalName.endsWith('name') && logicalName.length > 4) {
        const baseName = logicalName.slice(0, -4);
        namesAttributes.set(baseName, attribute);
      } else {
        baseNames.add(logicalName);
      }
    }

    const attributesToRemove = new Set<unknown>();
    for (const [baseName, nameAttribute] of namesAttributes.entries()) {
      if (baseNames.has(baseName)) {
        attributesToRemove.add(nameAttribute);
      }
    }

    attributes = attributes.filter((attr) => !attributesToRemove.has(attr));

    // Apply prefix filter
    if (options?.prefix) {
      const prefix = options.prefix.toLowerCase();
      attributes = attributes.filter((attr) =>
        ((attr.LogicalName as string) || '').toLowerCase().startsWith(prefix)
      );
    }

    const totalBeforeLimit = attributes.length;

    // Apply maxAttributes limit
    let hasMore = false;
    if (options?.maxAttributes && attributes.length > options.maxAttributes) {
      hasMore = true;
      attributes = attributes.slice(0, options.maxAttributes);
    }

    // Format the response
    const formattedAttributes = attributes.map((attr) => ({
      logicalName: attr.LogicalName,
      attributeType: attr.AttributeType,
      displayName:
        (attr.DisplayName as { UserLocalizedLabel?: { Label?: string } })
          ?.UserLocalizedLabel?.Label || attr.LogicalName,
      requiredLevel:
        (attr.RequiredLevel as { Value?: string })?.Value || 'None',
    }));

    return {
      value: formattedAttributes,
      hasMore,
      returnedCount: formattedAttributes.length,
      totalBeforeFilter: totalBeforeLimit,
    };
  }

  /**
   * Get metadata about a specific entity attribute/field.
   * For Picklist/Status/State attributes, automatically fetches option set values.
   */
  async getEntityAttribute(
    entityName: string,
    attributeName: string
  ): Promise<unknown> {
    // First, fetch the basic attribute metadata
    const attribute = await this.client.makeRequest(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${attributeName}')`
    ) as any;

    // For Picklist, Status, and State attributes, fetch option set values
    const picklistTypes = [
      'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      'Microsoft.Dynamics.CRM.StatusAttributeMetadata',
      'Microsoft.Dynamics.CRM.StateAttributeMetadata',
    ];

    // Dataverse returns the annotation with a leading '#', e.g.
    // "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata" - strip it before comparing
    const castType = ((attribute?.['@odata.type'] as string) || '').replace('#', '');

    if (picklistTypes.includes(castType)) {
      const castUrl = `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${attributeName}')/${castType}`;

      let optionSet: any;
      try {
        const expanded = await this.client.makeRequest(`${castUrl}?$expand=OptionSet`) as any;
        optionSet = expanded?.OptionSet;
      } catch {
        // fall through to the attribute-scoped fallback requests below
      }

      // $expand=OptionSet can fail (observed with local picklists) or come back
      // empty (global picklists expose options via GlobalOptionSet). Fall back to
      // reading the navigation properties directly - no option-set name needed.
      if (!optionSet?.Options) {
        for (const navProperty of ['OptionSet', 'GlobalOptionSet']) {
          try {
            const direct = await this.client.makeRequest(`${castUrl}/${navProperty}`) as any;
            if (direct?.Options) {
              optionSet = direct;
              break;
            }
          } catch {
            // try the next navigation property
          }
        }
      }

      if (optionSet?.Options) {
        attribute.OptionSet = {
          Name: optionSet.Name,
          IsGlobal: optionSet.IsGlobal,
          Options: optionSet.Options.map((opt: any) => ({
            Value: opt.Value,
            Label: opt.Label?.UserLocalizedLabel?.Label ?? opt.Label?.LocalizedLabels?.[0]?.Label ?? '',
            Description: opt.Description?.UserLocalizedLabel?.Label ?? '',
          })),
        };
      } else {
        // Never drop the options silently - a picklist always has an option set.
        attribute.optionSetWarning = `OptionSet lookup failed for '${attributeName}' - option values omitted. For local picklists, query the attribute-scoped option-set metadata; for global picklists, query the global option-set metadata (e.g. 'metadata option-set <name>').`;
      }
    }

    return attribute;
  }

  /**
   * Get one-to-many relationships for an entity
   */
  async getEntityOneToManyRelationships(
    entityName: string
  ): Promise<ApiCollectionResponse<unknown>> {
    const selectProperties = [
      'SchemaName',
      'RelationshipType',
      'ReferencedAttribute',
      'ReferencedEntity',
      'ReferencingAttribute',
      'ReferencingEntity',
      'ReferencedEntityNavigationPropertyName',
      'ReferencingEntityNavigationPropertyName',
    ].join(',');

    const response = await this.client.makeRequest<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/OneToManyRelationships?$select=${selectProperties}&$filter=ReferencingAttribute ne 'regardingobjectid'`
    );

    // Filter out msdyn_ and adx_ prefixed entities
    if (response?.value) {
      response.value = response.value.filter((relationship) => {
        const referencingEntity =
          (relationship.ReferencingEntity as string) || '';
        return !(
          referencingEntity.startsWith('msdyn_') ||
          referencingEntity.startsWith('adx_')
        );
      });
    }

    return response;
  }

  /**
   * Get many-to-many relationships for an entity
   */
  async getEntityManyToManyRelationships(
    entityName: string
  ): Promise<ApiCollectionResponse<unknown>> {
    const selectProperties = [
      'SchemaName',
      'RelationshipType',
      'Entity1LogicalName',
      'Entity2LogicalName',
      'Entity1IntersectAttribute',
      'Entity2IntersectAttribute',
      'Entity1NavigationPropertyName',
      'Entity2NavigationPropertyName',
    ].join(',');

    return this.client.makeRequest<ApiCollectionResponse<unknown>>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/ManyToManyRelationships?$select=${selectProperties}`
    );
  }

  /**
   * Get all relationships for an entity
   */
  async getEntityRelationships(entityName: string): Promise<{
    oneToMany: ApiCollectionResponse<unknown>;
    manyToMany: ApiCollectionResponse<unknown>;
  }> {
    const [oneToMany, manyToMany] = await Promise.all([
      this.getEntityOneToManyRelationships(entityName),
      this.getEntityManyToManyRelationships(entityName),
    ]);

    return { oneToMany, manyToMany };
  }

  /**
   * Get a global option set definition by name
   */
  async getGlobalOptionSet(optionSetName: string): Promise<unknown> {
    return this.client.makeRequest(
      `api/data/v9.2/GlobalOptionSetDefinitions(Name='${optionSetName}')`
    );
  }

  /**
   * Get all global option sets.
   *
   * Paged via `paginateDataverse`, so `hasMore` comes from the source and not from
   * comparing the returned row count against a `$top`. The old form asked for
   * `$top = maxRecords + 1` and read the sentinel row back, which cannot work once
   * `maxRecords` reaches Dataverse's 5,000-row response cap: the server returns
   * exactly 5,000, the sentinel never arrives, and a truncated list is reported as
   * complete.
   *
   * `GlobalOptionSetDefinitions` is a metadata endpoint, and metadata endpoints
   * ignore both `$top` and `Prefer: odata.maxpagesize` and never offer an
   * `@odata.nextLink`. The paginator still answers correctly there, because it also
   * treats a fetched-but-unreturned surplus row as proof of more, independently of
   * any continuation token. Do not "optimise" the `$top` back in.
   */
  async getGlobalOptionSets(options?: {
    maxRecords?: number;
    prefix?: string;
  }): Promise<{
    value: unknown[];
    hasMore: boolean;
    totalCount: number;
    requestedMax: number;
    truncation: TruncationInfo;
  }> {
    const maxRecords = options?.maxRecords ?? 100;

    let filter = '';
    if (options?.prefix) {
      filter = `&$filter=startswith(Name,'${options.prefix}')`;
    }

    const { rows, hasMore, truncationReason } = await paginateDataverse<unknown>(
      this.client,
      {
        endpoint: `api/data/v9.2/GlobalOptionSetDefinitions?$select=Name,DisplayName,MetadataId,OptionSetType${filter}`,
        maxRecords,
      }
    );

    return {
      value: rows,
      hasMore,
      totalCount: rows.length,
      requestedMax: maxRecords,
      truncation: buildTruncation({
        returnedCount: rows.length,
        requestedMax: maxRecords,
        hasMore,
        truncationReason,
      }),
    };
  }
}
