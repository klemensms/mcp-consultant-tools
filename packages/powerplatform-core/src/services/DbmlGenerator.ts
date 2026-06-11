/**
 * DbmlGenerator
 *
 * Generates DBML (Database Markup Language) schema from Dataverse entities.
 * Supports solution-based discovery or explicit entity lists.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';

// System columns to exclude by default
const SYSTEM_COLUMNS = new Set([
  'createdon',
  'createdby',
  'createdonbehalfby',
  'modifiedon',
  'modifiedby',
  'modifiedonbehalfby',
  'overriddencreatedon',
  'ownerid',
  'owningbusinessunit',
  'owningteam',
  'owninguser',
  'versionnumber',
  'importsequencenumber',
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'transactioncurrencyid',
  'exchangerate',
]);

// State/status columns to exclude by default
const STATE_STATUS_COLUMNS = new Set(['statecode', 'statuscode']);

// Type mapping from Dataverse to DBML
const TYPE_MAP: Record<string, string> = {
  Uniqueidentifier: 'uniqueidentifier',
  String: 'nvarchar',
  Memo: 'nvarchar(max)',
  Integer: 'int',
  BigInt: 'bigint',
  Decimal: 'decimal',
  Double: 'float',
  Money: 'money',
  Boolean: 'bit',
  DateTime: 'datetime2',
  Lookup: 'lookup',
  Customer: 'lookup',
  Owner: 'lookup',
  PartyList: 'lookup',
  Picklist: 'int',
  State: 'int',
  Status: 'int',
  MultiSelectPicklist: 'nvarchar',
  ManagedProperty: 'bit',
  Virtual: 'virtual',
  EntityName: 'nvarchar',
  CalendarRules: 'nvarchar',
};

// URL length threshold - beyond this, browsers may truncate
const MAX_URL_LENGTH = 8000;

export interface DbmlGeneratorOptions {
  solutions?: string[];
  entities?: string[];
  includeSystemColumns?: boolean;
  includeStateStatus?: boolean;
  prefix?: string;
  depth?: number;
  includePolymorphicLookups?: boolean;
}

export interface DbmlResult {
  dbml: string;
  diagramUrl: string;
  entityCount: number;
  relationshipCount: number;
  entities: string[];
  sources: Record<string, string>;
  warnings: string[];
}

interface EntityInfo {
  logicalName: string;
  primaryIdAttribute: string;
  displayName: string;
  attributes: AttributeInfo[];
}

interface AttributeInfo {
  logicalName: string;
  schemaName: string;
  attributeType: string;
  isPrimaryId: boolean;
  targets?: string[];
}

export class DbmlGenerator {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Generate DBML schema from entities
   */
  async generate(options: DbmlGeneratorOptions): Promise<DbmlResult> {
    const warnings: string[] = [];

    // Validate input
    if (
      (!options.solutions || options.solutions.length === 0) &&
      (!options.entities || options.entities.length === 0)
    ) {
      throw new Error(
        'At least one of solutions or entities must be provided'
      );
    }

    // Step 1: Resolve entity list from solutions and/or explicit entities
    const { entities: entityNames, sources } =
      await this.resolveEntityList(options, warnings);

    if (entityNames.length === 0) {
      throw new Error('No entities found in the specified solutions or list');
    }

    // Step 2: Apply depth traversal if requested
    let finalEntities = entityNames;
    let finalSources = sources;
    if (options.depth && options.depth > 0) {
      const { entities: expanded, sources: expandedSources } =
        await this.discoverRelatedEntities(
          entityNames,
          sources,
          options.depth,
          options,
          warnings
        );
      finalEntities = expanded;
      finalSources = expandedSources;
    }

    // Step 3: Collect metadata for all entities
    const entityInfos = await this.collectEntityMetadata(
      finalEntities,
      options,
      warnings
    );

    // Step 4: Build DBML and result
    return this.buildDbml(entityInfos, finalSources, options, warnings);
  }

  /**
   * Resolve entity list from solutions and/or explicit entities
   */
  private async resolveEntityList(
    options: DbmlGeneratorOptions,
    warnings: string[]
  ): Promise<{
    entities: string[];
    sources: Record<string, string>;
  }> {
    const sources: Record<string, string> = {};

    // Add entities from all specified solutions (in parallel)
    if (options.solutions && options.solutions.length > 0) {
      const solutionResults = await Promise.all(
        options.solutions.map(async (solutionName) => ({
          solution: solutionName,
          entities: await this.getEntitiesFromSolution(solutionName, warnings),
        }))
      );

      for (const { solution, entities } of solutionResults) {
        for (const entity of entities) {
          // First solution wins if entity appears in multiple
          if (!sources[entity]) {
            sources[entity] = solution;
          }
        }
      }
    }

    // Add explicitly listed entities
    if (options.entities && options.entities.length > 0) {
      for (const entity of options.entities) {
        if (!sources[entity]) {
          sources[entity] = 'explicit';
        }
      }
    }

    return {
      entities: Object.keys(sources),
      sources,
    };
  }

  /**
   * Get entity logical names from a solution
   */
  private async getEntitiesFromSolution(
    solutionUniqueName: string,
    warnings: string[]
  ): Promise<string[]> {
    // Get solution ID
    const solutionResponse = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,friendlyname,uniquename`
    );

    if (!solutionResponse.value || solutionResponse.value.length === 0) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }

    const solution = solutionResponse.value[0];
    const solutionId = solution.solutionid as string;

    // Get solution components (entities only, componenttype = 1)
    const componentsResponse = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solutionId} and componenttype eq 1&$select=objectid`
    );

    const entities: string[] = [];

    // Get entity logical name for each component
    for (const component of componentsResponse.value || []) {
      const metadataId = component.objectid;

      try {
        const entityResponse = await this.client.makeRequest<
          Record<string, unknown>
        >(
          `api/data/v9.2/EntityDefinitions(${metadataId})?$select=LogicalName,SchemaName`
        );

        const logicalName = entityResponse.LogicalName as string;
        entities.push(logicalName);
      } catch (error: unknown) {
        // Skip entities that can't be queried
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        warnings.push(
          `Could not get entity from component ${metadataId}: ${message}`
        );
      }
    }

    return entities;
  }

  /**
   * Discover related entities through lookup relationships
   */
  private async discoverRelatedEntities(
    seedEntities: string[],
    seedSources: Record<string, string>,
    depth: number,
    options: DbmlGeneratorOptions,
    warnings: string[]
  ): Promise<{
    entities: string[];
    sources: Record<string, string>;
  }> {
    const discovered = new Set(seedEntities);
    const sources = { ...seedSources };
    let frontier = [...seedEntities];

    for (let d = 0; d < depth; d++) {
      const nextFrontier: string[] = [];

      for (const entityName of frontier) {
        try {
          const lookups = await this.getLookupAttributes(entityName);

          for (const lookup of lookups) {
            if (lookup.targets) {
              for (const target of lookup.targets) {
                if (!discovered.has(target)) {
                  discovered.add(target);
                  sources[target] = `discovered (depth ${d + 1})`;
                  nextFrontier.push(target);
                }
              }
            }
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          warnings.push(
            `Could not discover relationships for ${entityName}: ${message}`
          );
        }
      }

      frontier = nextFrontier;

      if (frontier.length === 0) {
        break; // No more entities to discover
      }
    }

    return {
      entities: Array.from(discovered),
      sources,
    };
  }

  /**
   * Get lookup attributes for an entity
   */
  private async getLookupAttributes(
    entityName: string
  ): Promise<{ logicalName: string; targets: string[] }[]> {
    const response = await this.client.makeRequest<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`
    );

    return (response.value || []).map((attr) => ({
      logicalName: attr.LogicalName as string,
      targets: (attr.Targets as string[]) || [],
    }));
  }

  /**
   * Collect metadata for all entities
   */
  private async collectEntityMetadata(
    entityNames: string[],
    options: DbmlGeneratorOptions,
    warnings: string[]
  ): Promise<EntityInfo[]> {
    const results: EntityInfo[] = [];

    // Fetch metadata in parallel with batching
    const batchSize = 10;
    for (let i = 0; i < entityNames.length; i += batchSize) {
      const batch = entityNames.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map((entityName) =>
          this.getEntityInfo(entityName, options, warnings)
        )
      );

      for (const result of batchResults) {
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Get full entity info including attributes
   */
  private async getEntityInfo(
    entityName: string,
    options: DbmlGeneratorOptions,
    warnings: string[]
  ): Promise<EntityInfo | null> {
    try {
      // Get entity metadata
      const entityMeta = await this.client.makeRequest<Record<string, unknown>>(
        `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')?$select=LogicalName,PrimaryIdAttribute,DisplayName`
      );

      const primaryIdAttribute = entityMeta.PrimaryIdAttribute as string;
      const displayName =
        (
          entityMeta.DisplayName as {
            UserLocalizedLabel?: { Label?: string };
          }
        )?.UserLocalizedLabel?.Label || entityName;

      // Get all attributes
      const attrsResponse = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes?$select=LogicalName,SchemaName,AttributeType&$filter=AttributeType ne 'Virtual'`
      );

      // Get lookup attributes with targets
      const lookupResponse = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,SchemaName,Targets`
      );

      // Build lookup targets map
      const lookupTargets = new Map<string, string[]>();
      for (const lookup of lookupResponse.value || []) {
        const logicalName = lookup.LogicalName as string;
        const targets = (lookup.Targets as string[]) || [];
        lookupTargets.set(logicalName, targets);
      }

      // Process attributes
      const attributes: AttributeInfo[] = [];

      for (const attr of attrsResponse.value || []) {
        const logicalName = attr.LogicalName as string;
        const schemaName = attr.SchemaName as string;
        const attributeType = attr.AttributeType as string;

        // Skip system columns unless explicitly included
        if (!options.includeSystemColumns && SYSTEM_COLUMNS.has(logicalName)) {
          continue;
        }

        // Skip state/status columns unless explicitly included
        if (
          !options.includeStateStatus &&
          STATE_STATUS_COLUMNS.has(logicalName)
        ) {
          continue;
        }

        // Skip yominame attributes
        if (logicalName.endsWith('yominame')) {
          continue;
        }

        // Apply prefix filter (but always include primary key and lookups)
        const isPrimaryId = logicalName === primaryIdAttribute;
        const isLookup = ['Lookup', 'Customer', 'Owner', 'PartyList'].includes(
          attributeType
        );

        if (options.prefix) {
          const prefix = options.prefix.toLowerCase();
          if (
            !isPrimaryId &&
            !isLookup &&
            !logicalName.toLowerCase().startsWith(prefix)
          ) {
            continue;
          }
        }

        // Skip polymorphic lookups if not wanted
        if (
          options.includePolymorphicLookups === false &&
          ['Customer', 'Owner', 'PartyList'].includes(attributeType)
        ) {
          continue;
        }

        const attrInfo: AttributeInfo = {
          logicalName,
          schemaName,
          attributeType,
          isPrimaryId,
        };

        // Add targets for lookup attributes
        if (isLookup && lookupTargets.has(logicalName)) {
          attrInfo.targets = lookupTargets.get(logicalName);
        }

        attributes.push(attrInfo);
      }

      return {
        logicalName: entityName,
        primaryIdAttribute,
        displayName,
        attributes,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(`Could not get metadata for entity ${entityName}: ${message}`);
      return null;
    }
  }

  /**
   * Build DBML text and result
   */
  private buildDbml(
    entities: EntityInfo[],
    sources: Record<string, string>,
    options: DbmlGeneratorOptions,
    warnings: string[]
  ): DbmlResult {
    const tables: string[] = [];
    const refs: string[] = [];
    const entitySet = new Set(entities.map((e) => e.logicalName));

    for (const entity of entities) {
      // Build column definitions
      const columns: string[] = [];

      for (const attr of entity.attributes) {
        const dbmlType = this.mapToDbmlType(attr.attributeType);
        const pkMarker = attr.isPrimaryId ? ' [pk]' : '';
        columns.push(`    ${attr.logicalName} ${dbmlType}${pkMarker}`);

        // Generate Ref statements for lookups
        if (attr.targets && attr.targets.length > 0) {
          for (const target of attr.targets) {
            if (entitySet.has(target)) {
              // Find target entity to get its primary ID
              const targetEntity = entities.find(
                (e) => e.logicalName === target
              );
              if (targetEntity) {
                refs.push(
                  `Ref: ${entity.logicalName}.${attr.logicalName} > ${target}.${targetEntity.primaryIdAttribute}`
                );
              }
            } else {
              // Target not in our entity set
              warnings.push(
                `Lookup target '${target}' for ${entity.logicalName}.${attr.logicalName} not included in schema`
              );
            }
          }
        }
      }

      tables.push(
        `Table ${entity.logicalName} {\n${columns.join('\n')}\n}`
      );
    }

    // Combine tables and refs
    const dbml = [...tables, '', ...refs].join('\n');

    // Generate diagram URL
    const { url: diagramUrl, warning: urlWarning } =
      this.generateDiagramUrl(dbml);
    if (urlWarning) {
      warnings.push(urlWarning);
    }

    return {
      dbml,
      diagramUrl,
      entityCount: entities.length,
      relationshipCount: refs.length,
      entities: entities.map((e) => e.logicalName),
      sources,
      warnings,
    };
  }

  /**
   * Map Dataverse type to DBML type
   */
  private mapToDbmlType(dataverseType: string): string {
    return TYPE_MAP[dataverseType] || dataverseType.toLowerCase();
  }

  /**
   * Generate dbdiagram.io URL
   * Uses the /d/ editor format with base64-encoded DBML for direct editing/export
   */
  private generateDiagramUrl(dbml: string): { url: string; warning?: string } {
    // Use base64url encoding (URL-safe base64)
    const base64 = Buffer.from(dbml, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const fullUrl = `https://dbdiagram.io/d?definition=${base64}`;

    if (fullUrl.length > MAX_URL_LENGTH) {
      return {
        url: 'https://dbdiagram.io/d',
        warning: `DBML too large for URL encoding (${fullUrl.length} chars). Use https://dbdiagram.io/d and paste the DBML manually.`,
      };
    }

    return { url: fullUrl };
  }
}
