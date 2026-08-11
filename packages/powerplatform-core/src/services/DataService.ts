/**
 * DataService
 *
 * Service for data CRUD operations in Dataverse.
 * Note: This service should only be used by powerplatform-data package for security isolation.
 */

import {
  combineReports,
  type LayerReport,
  type PiiProtectionPipeline,
  type PipelineReport,
} from '@mcp-consultant-tools/core';
import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../client/types.js';
import { nextRelativeUrl } from './flow-health.js';

/** Dataverse never returns more than 5,000 rows in a single response, whatever `$top` asks for. */
const DATAVERSE_MAX_PAGE_SIZE = 5000;

/** Resolved N:N intersect entity metadata */
interface IntersectEntityInfo {
  intersectEntityName: string;
  entity1LogicalName: string;
  entity1EntitySetName: string;
  entity1IntersectAttribute: string;
  entity2IntersectAttribute: string;
}

export class DataService {
  /** Cache: entity set name (plural) → logical name (singular) */
  private entityNameCache = new Map<string, string>();
  /** Cache: intersect entity name → resolved info (or null if not an intersect entity) */
  private intersectEntityCache = new Map<string, IntersectEntityInfo | null>();

  constructor(
    private client: PowerPlatformClient,
    private piiPipeline?: PiiProtectionPipeline
  ) {}

  private toEntityLogicalName(entityNamePlural: string): string {
    return entityNamePlural.replace(/s$/, '');
  }

  /**
   * Get a specific record by entity name (plural) and ID.
   * When redaction runs, the resulting object includes a `piiReport` sibling
   * key so callers can surface the audit footer alongside the record body.
   */
  async getRecord(
    entityNamePlural: string,
    recordId: string
  ): Promise<Record<string, unknown>> {
    const response = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/${entityNamePlural}(${recordId})`,
      'GET',
      undefined,
      { Prefer: 'odata.include-annotations="*"' }
    );

    if (!this.piiPipeline?.isEnabled) return response;

    const entityLogicalName = this.toEntityLogicalName(entityNamePlural);
    const redacted = this.piiPipeline.redactResponse(entityLogicalName, response);
    return { ...redacted.data, piiReport: redacted.report };
  }

  /**
   * Query records using entity name (plural) and a filter expression.
   *
   * Pages via `Prefer: odata.maxpagesize` + `@odata.nextLink` rather than `$top`.
   * Dataverse caps every response at 5,000 rows and ignores `$top` when a page-size
   * preference is present, so a returned-row count can't distinguish "capped" from
   * "exhausted" — only the continuation token can. `hasMore` is therefore derived
   * from `@odata.nextLink`, never from `value.length`.
   */
  async queryRecords(
    entityNamePlural: string,
    filter: string,
    maxRecords: number = 50,
    select?: string[]
  ): Promise<{
    value: unknown[];
    hasMore: boolean;
    returnedCount: number;
    requestedMax: number;
    piiReport?: PipelineReport;
  }> {
    const entityLogicalName = this.toEntityLogicalName(entityNamePlural);

    let effectiveSelect = select;
    let l1Report: LayerReport | null = null;
    if (this.piiPipeline?.isEnabled) {
      const l1 = this.piiPipeline.applyQueryTimeExclusions(
        entityLogicalName,
        select
      );
      effectiveSelect = l1.filteredSelect;
      l1Report = l1.report;
    }

    let url = `api/data/v9.2/${entityNamePlural}?$filter=${encodeURIComponent(filter)}`;
    if (effectiveSelect && effectiveSelect.length > 0) {
      url += `&$select=${effectiveSelect.join(',')}`;
    }

    // No `$orderby`: Dataverse falls back to primary-key order, which is deterministic
    // enough for stable paging. Add one here if a caller ever needs a specific order.
    const pageSize = Math.min(Math.max(maxRecords, 1), DATAVERSE_MAX_PAGE_SIZE);
    const prefer = `odata.include-annotations="*",odata.maxpagesize=${pageSize}`;

    const rows: unknown[] = [];
    let hasMore = false;
    let endpoint: string | null = url;

    while (endpoint) {
      const page: ApiCollectionResponse<unknown> =
        await this.client.makeRequest<ApiCollectionResponse<unknown>>(
          endpoint,
          'GET',
          undefined,
          { Prefer: prefer }
        );
      rows.push(...page.value);

      const next: string | undefined = page['@odata.nextLink'];
      if (rows.length >= maxRecords) {
        hasMore = Boolean(next);
        break;
      }
      endpoint = next ? nextRelativeUrl(next, this.client.getOrganizationUrl()) : null;
    }

    const trimmedValue = rows.slice(0, maxRecords);

    if (!this.piiPipeline?.isEnabled) {
      return {
        value: trimmedValue,
        hasMore,
        returnedCount: trimmedValue.length,
        requestedMax: maxRecords,
      };
    }

    const redacted = this.piiPipeline.redactResponse(
      entityLogicalName,
      trimmedValue
    );

    const layerReports: LayerReport[] = [];
    if (l1Report) layerReports.push(l1Report);
    layerReports.push(...redacted.report.layers);

    return {
      value: redacted.data,
      hasMore,
      returnedCount: redacted.data.length,
      requestedMax: maxRecords,
      piiReport: combineReports(layerReports),
    };
  }

  /**
   * Create a new record in Dataverse
   */
  async createRecord(
    entityNamePlural: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Validate data is not empty
    if (!data || Object.keys(data).length === 0) {
      throw new Error('Record data cannot be empty');
    }

    const transformedData = await this.convertLookupNamesToNavProperties(
      entityNamePlural,
      data
    );

    const response = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/${entityNamePlural}`,
      'POST',
      transformedData,
      {
        Prefer: 'return=representation, odata.include-annotations="*"',
      }
    );

    if (!this.piiPipeline?.isEnabled) return response;

    const entityLogicalName = this.toEntityLogicalName(entityNamePlural);
    const redacted = this.piiPipeline.redactResponse(entityLogicalName, response);
    return { ...redacted.data, piiReport: redacted.report };
  }

  /**
   * Update an existing record in Dataverse
   */
  async updateRecord(
    entityNamePlural: string,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Validate data is not empty
    if (!data || Object.keys(data).length === 0) {
      throw new Error('Update data cannot be empty');
    }

    // Validate recordId is a valid GUID
    const guidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(recordId)) {
      throw new Error(
        `Invalid record ID format: ${recordId}. Must be a valid GUID.`
      );
    }

    const transformedData = await this.convertLookupNamesToNavProperties(
      entityNamePlural,
      data
    );

    const response = await this.client.makeRequest<Record<string, unknown>>(
      `api/data/v9.2/${entityNamePlural}(${recordId})`,
      'PATCH',
      transformedData,
      {
        Prefer: 'return=representation, odata.include-annotations="*"',
      }
    );

    if (!this.piiPipeline?.isEnabled) return response;

    const entityLogicalName = this.toEntityLogicalName(entityNamePlural);
    const redacted = this.piiPipeline.redactResponse(entityLogicalName, response);
    return { ...redacted.data, piiReport: redacted.report };
  }

  /**
   * Delete a record from Dataverse
   */
  async deleteRecord(entityNamePlural: string, recordId: string): Promise<void> {
    // Validate recordId is a valid GUID
    const guidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(recordId)) {
      throw new Error(
        `Invalid record ID format: ${recordId}. Must be a valid GUID.`
      );
    }

    // Make DELETE request
    await this.client.makeRequest(
      `api/data/v9.2/${entityNamePlural}(${recordId})`,
      'DELETE'
    );
  }

  /**
   * Associate two records via an N:N (or 1:N) navigation property.
   * POST /{entityNamePlural}({recordId})/{navigationProperty}/$ref
   */
  async associateRecords(
    entityNamePlural: string,
    recordId: string,
    navigationProperty: string,
    targetEntityNamePlural: string,
    targetRecordId: string
  ): Promise<void> {
    const guidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(recordId)) {
      throw new Error(
        `Invalid record ID format: ${recordId}. Must be a valid GUID.`
      );
    }
    if (!guidRegex.test(targetRecordId)) {
      throw new Error(
        `Invalid target record ID format: ${targetRecordId}. Must be a valid GUID.`
      );
    }
    if (!entityNamePlural || !entityNamePlural.trim()) {
      throw new Error('entityNamePlural cannot be empty');
    }
    if (!navigationProperty || !navigationProperty.trim()) {
      throw new Error('navigationProperty cannot be empty');
    }
    if (!targetEntityNamePlural || !targetEntityNamePlural.trim()) {
      throw new Error('targetEntityNamePlural cannot be empty');
    }

    const orgUrl = this.client.getOrganizationUrl();
    const body = {
      '@odata.id': `${orgUrl}/api/data/v9.2/${targetEntityNamePlural}(${targetRecordId})`,
    };

    await this.client.makeRequestNoContent(
      `api/data/v9.2/${entityNamePlural}(${recordId})/${navigationProperty}/$ref`,
      'POST',
      body
    );
  }

  /**
   * Disassociate two records by removing an N:N (or 1:N) relationship link.
   * DELETE /{entityNamePlural}({recordId})/{navigationProperty}({targetRecordId})/$ref
   */
  async disassociateRecords(
    entityNamePlural: string,
    recordId: string,
    navigationProperty: string,
    targetRecordId: string
  ): Promise<void> {
    const guidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(recordId)) {
      throw new Error(
        `Invalid record ID format: ${recordId}. Must be a valid GUID.`
      );
    }
    if (!guidRegex.test(targetRecordId)) {
      throw new Error(
        `Invalid target record ID format: ${targetRecordId}. Must be a valid GUID.`
      );
    }
    if (!entityNamePlural || !entityNamePlural.trim()) {
      throw new Error('entityNamePlural cannot be empty');
    }
    if (!navigationProperty || !navigationProperty.trim()) {
      throw new Error('navigationProperty cannot be empty');
    }

    await this.client.makeRequestNoContent(
      `api/data/v9.2/${entityNamePlural}(${recordId})/${navigationProperty}(${targetRecordId})/$ref`,
      'DELETE'
    );
  }

  /**
   * Execute a Custom API or Action in Dataverse
   */
  async executeAction(
    actionName: string,
    parameters?: Record<string, unknown>,
    boundTo?: { entityNamePlural: string; recordId: string }
  ): Promise<Record<string, unknown>> {
    // Validate action name
    if (!actionName || actionName.trim().length === 0) {
      throw new Error('Action name cannot be empty');
    }

    // If bound action, validate the bound parameters
    if (boundTo) {
      if (!boundTo.entityNamePlural || boundTo.entityNamePlural.trim().length === 0) {
        throw new Error('Bound action requires entityNamePlural');
      }
      if (!boundTo.recordId || boundTo.recordId.trim().length === 0) {
        throw new Error('Bound action requires recordId');
      }

      // Validate recordId is a valid GUID
      const guidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!guidRegex.test(boundTo.recordId)) {
        throw new Error(
          `Invalid record ID format: ${boundTo.recordId}. Must be a valid GUID.`
        );
      }
    }

    // Build endpoint URL
    // Unbound: POST api/data/v9.2/actionName
    // Bound: POST api/data/v9.2/entityNamePlural(recordId)/Microsoft.Dynamics.CRM.actionName
    let endpoint: string;
    if (boundTo) {
      // For bound actions, need to use fully qualified name with Microsoft.Dynamics.CRM prefix
      const qualifiedActionName = actionName.startsWith('Microsoft.Dynamics.CRM.')
        ? actionName
        : `Microsoft.Dynamics.CRM.${actionName}`;
      endpoint = `api/data/v9.2/${boundTo.entityNamePlural}(${boundTo.recordId})/${qualifiedActionName}`;
    } else {
      endpoint = `api/data/v9.2/${actionName}`;
    }

    // Make POST request to execute action
    const response = await this.client.makeRequest<Record<string, unknown>>(
      endpoint,
      'POST',
      parameters || {}
    );

    if (!this.piiPipeline?.isEnabled) return response;

    // Custom Action results have no fixed entity type — L3+L4 still scan strings.
    const redacted = this.piiPipeline.redactResponse('action-result', response);
    return { ...redacted.data, piiReport: redacted.report };
  }

  /**
   * Resolve an entity set name (plural, e.g. "accounts") to a logical name
   * (singular, e.g. "account") via EntityDefinitions metadata.
   * Results are cached for the lifetime of the service instance.
   */
  async resolveLogicalName(entitySetName: string): Promise<string> {
    const cached = this.entityNameCache.get(entitySetName);
    if (cached) return cached;

    const url = `api/data/v9.2/EntityDefinitions?$filter=EntitySetName eq '${entitySetName}'&$select=LogicalName`;
    const result = await this.client.makeRequest<ApiCollectionResponse<{ LogicalName: string }>>(url);

    if (!result.value || result.value.length === 0) {
      throw new Error(`Cannot resolve entity set name '${entitySetName}' — no matching EntityDefinition found`);
    }

    const logicalName = result.value[0].LogicalName;
    this.entityNameCache.set(entitySetName, logicalName);
    return logicalName;
  }

  /**
   * Count records matching an optional OData filter.
   *
   * - Without filter: uses RetrieveTotalRecordCount (no 5,000 paging cap).
   * - With filter: uses FetchXML aggregate count (no 5,000 paging cap).
   *
   * Both approaches bypass the Dataverse /$count and $count=true endpoints
   * which silently cap results at 5,000.
   */
  async countRecords(
    entityNamePlural: string,
    filter?: string
  ): Promise<number> {
    let logicalName: string;
    try {
      logicalName = await this.resolveLogicalName(entityNamePlural);
    } catch {
      // Not a standard entity — check if it's an N:N intersect entity
      const intersectInfo = await this.resolveIntersectEntity(entityNamePlural);
      if (intersectInfo) {
        if (filter) {
          throw new Error(
            `Filtered counts are not supported for N:N intersect entity '${entityNamePlural}'. ` +
            `Only unfiltered counts are available for intersect entities.`
          );
        }
        return this.countIntersectRecords(intersectInfo);
      }
      throw new Error(
        `Cannot resolve entity '${entityNamePlural}' — not found in EntityDefinitions or ManyToManyRelationshipMetadata`
      );
    }

    if (filter) {
      return this.countWithFetchXmlAggregate(entityNamePlural, logicalName, filter);
    }

    return this.retrieveTotalRecordCount(logicalName);
  }

  /**
   * Use the RetrieveTotalRecordCount function for exact unfiltered counts.
   * This function returns organisation-level counts not subject to paging limits.
   * Accepts logical names (singular), not entity set names.
   */
  private async retrieveTotalRecordCount(logicalName: string): Promise<number> {
    const url = `api/data/v9.2/RetrieveTotalRecordCount(EntityNames=@e)?@e=['${logicalName}']`;
    const result = await this.client.makeRequest<{
      EntityRecordCountCollection: {
        Keys: string[];
        Values: number[];
      };
    }>(url);

    const values = result?.EntityRecordCountCollection?.Values;
    if (!values || values.length === 0) {
      throw new Error(`RetrieveTotalRecordCount returned no data for '${logicalName}'`);
    }
    return values[0];
  }

  /**
   * Use FetchXML aggregate to count filtered records without the 5,000 cap.
   * Converts the OData $filter to a FetchXML condition-free aggregate and
   * applies the filter via the collection endpoint's $filter parameter.
   */
  private async countWithFetchXmlAggregate(
    entityNamePlural: string,
    logicalName: string,
    filter: string
  ): Promise<number> {
    // Build a FetchXML aggregate query (no filter in FetchXML itself)
    // The OData $filter is applied on the URL alongside the fetchXml parameter
    const fetchXml = [
      '<fetch aggregate="true">',
      `  <entity name="${logicalName}">`,
      `    <attribute name="${logicalName}id" alias="count" aggregate="count"/>`,
      '  </entity>',
      '</fetch>',
    ].join('');

    const url = `api/data/v9.2/${entityNamePlural}?fetchXml=${encodeURIComponent(fetchXml)}&$filter=${encodeURIComponent(filter)}`;
    const result = await this.client.makeRequest<ApiCollectionResponse<{ count: number }>>(url);

    if (!result.value || result.value.length === 0) {
      throw new Error('FetchXML aggregate count returned no results');
    }
    return result.value[0].count;
  }

  /**
   * Count records for multiple entities in parallel.
   * Optimises unfiltered counts by batching them into a single
   * RetrieveTotalRecordCount call. Filtered counts use individual
   * FetchXML aggregate queries in parallel chunks.
   */
  async countRecordsBatch(
    entities: Array<{ entityNamePlural: string; filter?: string }>
  ): Promise<Array<{ entityNamePlural: string; filter?: string; count: number; error?: string }>> {
    // Split into unfiltered and filtered
    const unfiltered = entities.filter(e => !e.filter);
    const filtered = entities.filter(e => e.filter);

    // --- Unfiltered: batch via RetrieveTotalRecordCount (1-2 API calls) ---
    const unfilteredResults = new Map<string, { count: number; error?: string }>();
    if (unfiltered.length > 0) {
      try {
        // Resolve all entity set names → logical names
        const nameMap = new Map<string, string>(); // logicalName → entitySetName
        for (const { entityNamePlural } of unfiltered) {
          try {
            const logicalName = await this.resolveLogicalName(entityNamePlural);
            nameMap.set(logicalName, entityNamePlural);
          } catch {
            // Not a standard entity — check if it's an N:N intersect entity
            const intersectInfo = await this.resolveIntersectEntity(entityNamePlural);
            if (intersectInfo) {
              try {
                const count = await this.countIntersectRecords(intersectInfo);
                unfilteredResults.set(entityNamePlural, { count });
              } catch (intError: any) {
                unfilteredResults.set(entityNamePlural, { count: -1, error: intError.message });
              }
            } else {
              unfilteredResults.set(entityNamePlural, {
                count: -1,
                error: `Cannot resolve entity '${entityNamePlural}' — not found in EntityDefinitions or ManyToManyRelationshipMetadata`,
              });
            }
          }
        }

        // Call RetrieveTotalRecordCount with all logical names at once
        if (nameMap.size > 0) {
          const logicalNames = Array.from(nameMap.keys());
          const namesParam = logicalNames.map(n => `'${n}'`).join(',');
          const url = `api/data/v9.2/RetrieveTotalRecordCount(EntityNames=@e)?@e=[${namesParam}]`;
          const result = await this.client.makeRequest<{
            EntityRecordCountCollection: {
              Keys: string[];
              Values: number[];
            };
          }>(url);

          const keys = result?.EntityRecordCountCollection?.Keys ?? [];
          const values = result?.EntityRecordCountCollection?.Values ?? [];

          for (let i = 0; i < keys.length; i++) {
            const entitySetName = nameMap.get(keys[i]);
            if (entitySetName) {
              unfilteredResults.set(entitySetName, { count: values[i] });
            }
          }

          // Any entities not returned by the function
          for (const [logicalName, entitySetName] of nameMap) {
            if (!unfilteredResults.has(entitySetName)) {
              unfilteredResults.set(entitySetName, {
                count: -1,
                error: `RetrieveTotalRecordCount did not return a count for '${logicalName}'`,
              });
            }
          }
        }
      } catch (error: any) {
        // If batch call fails entirely, mark all unfiltered as failed
        for (const { entityNamePlural } of unfiltered) {
          if (!unfilteredResults.has(entityNamePlural)) {
            unfilteredResults.set(entityNamePlural, { count: -1, error: error.message });
          }
        }
      }
    }

    // --- Filtered: parallel FetchXML aggregate in chunks ---
    const CHUNK_SIZE = 10;
    const filteredResults: Array<{ entityNamePlural: string; filter?: string; count: number; error?: string }> = [];
    for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
      const chunk = filtered.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async ({ entityNamePlural, filter }) => {
          try {
            const count = await this.countRecords(entityNamePlural, filter);
            return { entityNamePlural, filter, count };
          } catch (error: any) {
            return { entityNamePlural, filter, count: -1, error: error.message };
          }
        })
      );
      filteredResults.push(...chunkResults);
    }

    // --- Merge results in original order ---
    return entities.map(({ entityNamePlural, filter }) => {
      if (!filter) {
        const result = unfilteredResults.get(entityNamePlural) ?? { count: -1, error: 'Unknown error' };
        return { entityNamePlural, filter, ...result };
      }
      const found = filteredResults.find(r => r.entityNamePlural === entityNamePlural && r.filter === filter);
      return found ?? { entityNamePlural, filter, count: -1, error: 'Unknown error' };
    });
  }

  /**
   * Get the navigation property name for a lookup attribute
   */
  async getLookupNavigationPropertyName(
    entityLogicalName: string,
    lookupAttributeName: string,
    targetEntityLogicalName: string
  ): Promise<string | null> {
    try {
      // Query the target entity's OneToManyRelationships to find the relationship
      const selectProperties = [
        'ReferencingAttribute',
        'ReferencingEntity',
        'ReferencingEntityNavigationPropertyName',
      ].join(',');

      const response = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/EntityDefinitions(LogicalName='${targetEntityLogicalName}')/OneToManyRelationships?$select=${selectProperties}&$filter=ReferencingEntity eq '${entityLogicalName}' and ReferencingAttribute eq '${lookupAttributeName}'`
      );

      if (response && response.value && response.value.length > 0) {
        return response.value[0].ReferencingEntityNavigationPropertyName as string;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a name corresponds to an N:N intersect entity by querying
   * ManyToManyRelationshipMetadata globally. Also resolves Entity1's
   * EntitySetName for use in FetchXML queries. Results are cached.
   *
   * Tries two lookups in order:
   * 1. Filter by IntersectEntityName (the actual intersect table name, often
   *    truncated to 40 chars by Dataverse — e.g. "new_eventpackageadditional_new_eventd").
   * 2. Filter by SchemaName (the relationship schema name as shown in the maker
   *    portal — e.g. "new_eventpackageadditionalitem_new_eventdel"), which users are
   *    more likely to copy. This covers cases where the SchemaName differs from
   *    the truncated IntersectEntityName.
   */
  private async resolveIntersectEntity(
    entityName: string
  ): Promise<IntersectEntityInfo | null> {
    const cached = this.intersectEntityCache.get(entityName);
    if (cached !== undefined) return cached;

    type RelRow = {
      IntersectEntityName: string;
      Entity1LogicalName: string;
      Entity1IntersectAttribute: string;
      Entity2IntersectAttribute: string;
    };

    const baseUrl =
      `api/data/v9.2/RelationshipDefinitions/Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata`;
    const selectFields =
      `IntersectEntityName,Entity1LogicalName,Entity1IntersectAttribute,Entity2IntersectAttribute`;

    const tryLookup = async (filterExpr: string): Promise<RelRow | null> => {
      try {
        const result = await this.client.makeRequest<ApiCollectionResponse<RelRow>>(
          `${baseUrl}?$filter=${filterExpr}&$select=${selectFields}`
        );
        if (result.value && result.value.length > 0) return result.value[0];
      } catch {
        // Fall through
      }
      return null;
    };

    try {
      // Attempt 1: match by IntersectEntityName (the actual intersect table name)
      let rel = await tryLookup(`IntersectEntityName eq '${entityName}'`);

      // Attempt 2: match by SchemaName (what users typically see in the maker portal).
      // Dataverse truncates IntersectEntityName to 40 chars, so the SchemaName and
      // IntersectEntityName can differ (e.g. SchemaName ends in "...eventdel" but
      // IntersectEntityName is "...eventd").
      if (!rel) {
        rel = await tryLookup(`SchemaName eq '${entityName}'`);
      }

      if (rel) {
        // Resolve Entity1's EntitySetName so we can execute FetchXML via its endpoint
        const entity1Meta = await this.client.makeRequest<{ EntitySetName: string }>(
          `api/data/v9.2/EntityDefinitions(LogicalName='${rel.Entity1LogicalName}')?$select=EntitySetName`
        );

        const info: IntersectEntityInfo = {
          intersectEntityName: rel.IntersectEntityName,
          entity1LogicalName: rel.Entity1LogicalName,
          entity1EntitySetName: entity1Meta.EntitySetName,
          entity1IntersectAttribute: rel.Entity1IntersectAttribute,
          entity2IntersectAttribute: rel.Entity2IntersectAttribute,
        };
        this.intersectEntityCache.set(entityName, info);
        return info;
      }
    } catch {
      // Fall through to return null
    }

    this.intersectEntityCache.set(entityName, null);
    return null;
  }

  /**
   * Count records in an N:N intersect entity using FetchXML aggregate.
   * Intersect entities are not exposed as OData entity sets, so we query
   * through Entity1's entity set with a link-entity inner join to the
   * intersect table and count Entity2's intersect attribute.
   */
  private async countIntersectRecords(info: IntersectEntityInfo): Promise<number> {
    const fetchXml = [
      '<fetch aggregate="true">',
      `  <entity name="${info.entity1LogicalName}">`,
      `    <link-entity name="${info.intersectEntityName}" from="${info.entity1IntersectAttribute}" to="${info.entity1IntersectAttribute}" link-type="inner">`,
      `      <attribute name="${info.entity2IntersectAttribute}" alias="count" aggregate="count"/>`,
      '    </link-entity>',
      '  </entity>',
      '</fetch>',
    ].join('');

    const url = `api/data/v9.2/${info.entity1EntitySetName}?fetchXml=${encodeURIComponent(fetchXml)}`;
    const result = await this.client.makeRequest<ApiCollectionResponse<{ count: number }>>(url);

    if (!result.value || result.value.length === 0) {
      throw new Error(
        `FetchXML aggregate count returned no results for intersect entity '${info.intersectEntityName}'`
      );
    }
    return result.value[0].count;
  }

  /**
   * Convert lookup `@odata.bind` keys to the actual referencing-navigation-property
   * names that Dataverse expects on POST/PATCH bodies.
   *
   * The navigation property is `ReferencingEntityNavigationPropertyName` from
   * ManyToOneRelationships metadata — NOT the lookup attribute's SchemaName.
   * For most attributes the nav property is the lowercase logical name
   * (e.g. `primarycontactid`, `objectid_contact`).
   */
  private async convertLookupNamesToNavProperties(
    entityNamePlural: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const entityLogicalName = this.toEntityLogicalName(entityNamePlural);

    const transformedData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (!key.endsWith('@odata.bind')) {
        transformedData[key] = value;
        continue;
      }

      const fullPropertyName = key.replace('@odata.bind', '');
      const parts = fullPropertyName.split('_');

      let baseAttributeName = fullPropertyName.toLowerCase();
      let polymorphicTargetEntity: string | undefined;

      if (parts.length > 1) {
        const potentialSuffix = parts[parts.length - 1].toLowerCase();
        const commonTargets = ['account', 'contact', 'systemuser', 'team'];
        if (commonTargets.includes(potentialSuffix)) {
          polymorphicTargetEntity = potentialSuffix;
          baseAttributeName = parts.slice(0, -1).join('_').toLowerCase();
        }
      }

      const navProperty = await this.lookupNavigationProperty(
        entityLogicalName,
        baseAttributeName,
        polymorphicTargetEntity
      );

      const correctKey = `${navProperty ?? fullPropertyName}@odata.bind`;
      transformedData[correctKey] = value;
    }

    return transformedData;
  }

  /** Cache of resolved nav-property lookups so we don't re-query metadata per call. */
  private navPropertyCache = new Map<string, string | null>();

  /**
   * Resolve the actual `ReferencingEntityNavigationPropertyName` for a lookup
   * attribute. This is the value Dataverse expects on the left of `@odata.bind`
   * — it is NOT the same as the attribute's SchemaName. For polymorphic lookups,
   * pass `referencedEntity` to disambiguate between targets.
   */
  async lookupNavigationProperty(
    entityLogicalName: string,
    referencingAttribute: string,
    referencedEntity?: string
  ): Promise<string | null> {
    const cacheKey = `${entityLogicalName}|${referencingAttribute}|${referencedEntity ?? ''}`;
    const cached = this.navPropertyCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let filter = `ReferencingAttribute eq '${referencingAttribute}'`;
    if (referencedEntity) {
      filter += ` and ReferencedEntity eq '${referencedEntity}'`;
    }

    try {
      const result = await this.client.makeRequest<
        ApiCollectionResponse<{
          ReferencingEntityNavigationPropertyName: string;
          ReferencedEntity: string;
        }>
      >(
        `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/ManyToOneRelationships?$filter=${encodeURIComponent(
          filter
        )}&$select=ReferencingEntityNavigationPropertyName,ReferencedEntity`
      );

      const navProperty =
        result.value?.[0]?.ReferencingEntityNavigationPropertyName ?? null;
      this.navPropertyCache.set(cacheKey, navProperty);
      return navProperty;
    } catch {
      this.navPropertyCache.set(cacheKey, null);
      return null;
    }
  }

}
