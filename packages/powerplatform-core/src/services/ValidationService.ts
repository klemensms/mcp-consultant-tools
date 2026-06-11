/**
 * ValidationService
 *
 * Read-only service for validating entities against best practices.
 */

import type { PowerPlatformClient } from '../client/PowerPlatformClient.js';
import type {
  ApiCollectionResponse,
  BestPracticesValidationResult,
  EntityValidationResult,
  Violation,
  ViolationSummaryByRule,
} from '../client/types.js';

export class ValidationService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Validate entities against Dataverse best practices
   */
  async validateBestPractices(
    solutionUniqueName: string | undefined,
    entityLogicalNames: string[] | undefined,
    publisherPrefix: string,
    recentDays: number = 30,
    includeRefDataTables: boolean = true,
    rules: string[] = [
      'prefix',
      'lowercase',
      'lookup',
      'optionset',
      'required-column',
      'entity-icon',
    ],
    maxEntities: number = 0,
    requiredColumns: string[] = ['{prefix}updatedbyprocess']
  ): Promise<BestPracticesValidationResult> {
    const startTime = Date.now();
    const statisticsCounters = {
      systemColumns: 0,
      oldColumns: 0,
    };

    let entities: string[] = [];
    let solutionFriendlyName: string | undefined;

    // STEP 1: Discover entities
    if (solutionUniqueName) {
      // Get solution ID
      const solutionResponse = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,friendlyname,uniquename`
      );

      if (!solutionResponse.value || solutionResponse.value.length === 0) {
        throw new Error(`Solution not found: ${solutionUniqueName}`);
      }

      const solution = solutionResponse.value[0];
      const solutionId = solution.solutionid as string;
      solutionFriendlyName = solution.friendlyname as string;

      // Get solution components (entities only, componenttype = 1)
      const componentsResponse = await this.client.makeRequest<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solutionId} and componenttype eq 1&$select=objectid`
      );

      // Get entity metadata for each component
      for (const component of componentsResponse.value || []) {
        const metadataId = component.objectid;

        try {
          // Query entity by MetadataId
          const entityResponse = await this.client.makeRequest<
            Record<string, unknown>
          >(
            `api/data/v9.2/EntityDefinitions(${metadataId})?$select=LogicalName,SchemaName`
          );

          const logicalName = entityResponse.LogicalName as string;

          // Filter: Only entities with publisher prefix
          if (logicalName.startsWith(publisherPrefix)) {
            // Filter: Optionally exclude RefData tables
            if (
              includeRefDataTables ||
              !logicalName.startsWith(`${publisherPrefix}ref_`)
            ) {
              entities.push(logicalName);
            }
          }
        } catch {
          // Skip entities that can't be queried (managed/system entities)
        }
      }

      // Apply max entities limit
      if (maxEntities > 0 && entities.length > maxEntities) {
        entities = entities.slice(0, maxEntities);
      }
    } else if (entityLogicalNames) {
      // Use explicit entity list
      entities = entityLogicalNames.filter((name) =>
        name.startsWith(publisherPrefix)
      );
    } else {
      throw new Error(
        'Either solutionUniqueName or entityLogicalNames must be provided'
      );
    }

    // STEP 2: Validate each entity
    const results: EntityValidationResult[] = [];

    for (const entityLogicalName of entities) {
      try {
        // Get entity metadata (including icon information)
        const entityMetadata = await this.client.makeRequest<
          Record<string, unknown>
        >(
          `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=LogicalName,SchemaName,DisplayName,MetadataId,IconVectorName,IsCustomEntity`
        );

        // Get all attributes for entity
        const attributesResponse = await this.client.makeRequest<
          ApiCollectionResponse<Record<string, unknown>>
        >(
          `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,AttributeType,DisplayName,CreatedOn,IsCustomAttribute,AttributeTypeName`
        );

        const attributes = attributesResponse.value || [];

        // Apply filtering
        const filteredAttributes = attributes.filter((attr) => {
          const logicalName = attr.LogicalName as string;
          const isCustomAttribute = attr.IsCustomAttribute as boolean;
          const createdOn = attr.CreatedOn as string | undefined;

          // Rule: Must have publisher prefix
          if (!logicalName.startsWith(publisherPrefix)) {
            statisticsCounters.systemColumns++;
            return false; // Exclude system columns
          }

          // Rule: Must be custom attribute (additional safety)
          if (!isCustomAttribute) {
            statisticsCounters.systemColumns++;
            return false;
          }

          // Rule: Must be within time threshold
          if (recentDays > 0 && createdOn) {
            const createdDate = new Date(createdOn);
            const daysAgo =
              (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

            if (daysAgo > recentDays) {
              statisticsCounters.oldColumns++;
              return false; // Too old
            }
          }

          return true;
        });

        // Validate entity-level properties and attributes
        const violations = await this.validateEntityAndAttributes(
          entityMetadata,
          filteredAttributes,
          attributes, // Pass all attributes for required column check
          publisherPrefix,
          rules,
          requiredColumns
        );

        const displayName =
          (
            entityMetadata.DisplayName as {
              UserLocalizedLabel?: { Label?: string };
            }
          )?.UserLocalizedLabel?.Label || (entityMetadata.LogicalName as string);

        results.push({
          logicalName: entityMetadata.LogicalName as string,
          schemaName: entityMetadata.SchemaName as string,
          displayName: displayName,
          isRefData: (entityMetadata.LogicalName as string).startsWith(
            `${publisherPrefix}ref_`
          ),
          attributesChecked: filteredAttributes.length,
          violations: violations,
          isCompliant: violations.length === 0,
        });
      } catch {
        // Skip entities that fail validation
      }
    }

    // STEP 3: Calculate summary statistics
    const summary = {
      entitiesChecked: results.length,
      attributesChecked: results.reduce((sum, e) => sum + e.attributesChecked, 0),
      totalViolations: results.reduce((sum, e) => sum + e.violations.length, 0),
      criticalViolations: results.reduce(
        (sum, e) =>
          sum + e.violations.filter((v) => v.severity === 'MUST').length,
        0
      ),
      warnings: results.reduce(
        (sum, e) =>
          sum + e.violations.filter((v) => v.severity === 'SHOULD').length,
        0
      ),
      compliantEntities: results.filter((e) => e.isCompliant).length,
    };

    const executionTimeMs = Date.now() - startTime;

    // STEP 4: Build violations summary with complete lists
    const violationsSummary = this.buildViolationsSummary(results);

    // Build final result
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        solutionName: solutionFriendlyName,
        solutionUniqueName: solutionUniqueName,
        publisherPrefix,
        recentDays,
        executionTimeMs,
      },
      summary,
      violationsSummary,
      entities: results,
      statistics: {
        systemColumnsExcluded: statisticsCounters.systemColumns,
        oldColumnsExcluded: statisticsCounters.oldColumns,
        refDataTablesSkipped: results.filter((e) => e.isRefData).length,
      },
    };
  }

  /**
   * Helper method to validate entity-level properties and attributes against best practice rules
   */
  private async validateEntityAndAttributes(
    entityMetadata: Record<string, unknown>,
    filteredAttributes: Record<string, unknown>[],
    allAttributes: Record<string, unknown>[],
    publisherPrefix: string,
    rules: string[],
    requiredColumns: string[]
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const entityLogicalName = entityMetadata.LogicalName as string;

    // ENTITY-LEVEL VALIDATION: Check if entity has an icon
    if (rules.includes('entity-icon')) {
      // Only check custom entities (IsCustomEntity = true)
      if (entityMetadata.IsCustomEntity) {
        const iconVectorName = entityMetadata.IconVectorName as
          | string
          | null
          | undefined;
        const hasIcon =
          iconVectorName && iconVectorName.length > 0 && iconVectorName !== null;

        if (!hasIcon) {
          violations.push({
            attributeLogicalName: undefined, // Entity-level violation
            rule: 'Entity Icon',
            severity: 'SHOULD',
            message: `Entity "${entityLogicalName}" does not have a custom icon assigned`,
            currentValue: 'No icon',
            expectedValue: 'Custom icon (SVG web resource)',
            action: `Assign a Fluent UI icon using the update-entity-icon tool. Example: update-entity-icon with entityLogicalName="${entityLogicalName}" and an appropriate icon file.`,
            recommendation:
              'Custom icons improve entity recognition in Model-Driven Apps and enhance user experience. Use Fluent UI System Icons for consistency with Microsoft design language.',
          });
        }
      }
    }

    // RULE 1: Publisher Prefix Check
    if (rules.includes('prefix')) {
      for (const attr of filteredAttributes) {
        const logicalName = attr.LogicalName as string;
        if (!logicalName.startsWith(publisherPrefix)) {
          violations.push({
            attributeLogicalName: logicalName,
            attributeType:
              (attr.AttributeTypeName as { Value?: string })?.Value ||
              (attr.AttributeType as string),
            createdOn: attr.CreatedOn as string,
            rule: 'Publisher Prefix',
            severity: 'MUST',
            message: `Column "${logicalName}" does not have required prefix "${publisherPrefix}"`,
            currentValue: logicalName,
            expectedValue: `${publisherPrefix}${logicalName}`,
            action: `Rename column to add "${publisherPrefix}" prefix`,
          });
        }
      }
    }

    // RULE 2: Schema Name Lowercase Check
    if (rules.includes('lowercase')) {
      for (const attr of filteredAttributes) {
        const logicalName = attr.LogicalName as string;
        if (logicalName !== logicalName.toLowerCase()) {
          violations.push({
            attributeLogicalName: logicalName,
            attributeType:
              (attr.AttributeTypeName as { Value?: string })?.Value ||
              (attr.AttributeType as string),
            createdOn: attr.CreatedOn as string,
            rule: 'Schema Name Lowercase',
            severity: 'MUST',
            message: `Column "${logicalName}" contains uppercase letters`,
            currentValue: logicalName,
            expectedValue: logicalName.toLowerCase(),
            action: `Rename column to use all lowercase: ${logicalName.toLowerCase()}`,
          });
        }
      }
    }

    // RULE 3: Lookup Naming Convention
    if (rules.includes('lookup')) {
      for (const attr of filteredAttributes) {
        const logicalName = attr.LogicalName as string;
        const attributeType = attr.AttributeType as string;
        const attributeTypeName = (attr.AttributeTypeName as { Value?: string })
          ?.Value;

        // Check if it's a Lookup type
        const isLookup =
          attributeType === 'Lookup' || attributeTypeName === 'LookupType';

        if (isLookup && !logicalName.endsWith('id')) {
          violations.push({
            attributeLogicalName: logicalName,
            attributeType: 'Lookup',
            createdOn: attr.CreatedOn as string,
            rule: 'Lookup Naming Convention',
            severity: 'MUST',
            message: `Lookup column "${logicalName}" does not end with "id"`,
            currentValue: logicalName,
            expectedValue: `${logicalName}id`,
            action: `Rename column to add "id" suffix: ${logicalName}id`,
          });
        }
      }
    }

    // RULE 4: Option Set Scope Check
    if (rules.includes('optionset')) {
      for (const attr of filteredAttributes) {
        const logicalName = attr.LogicalName as string;
        const attributeType = attr.AttributeType as string;
        const attributeTypeName = (attr.AttributeTypeName as { Value?: string })
          ?.Value;

        // Check if it's a Picklist type
        const isPicklist =
          attributeType === 'Picklist' || attributeTypeName === 'PicklistType';

        if (isPicklist) {
          try {
            // Need to get full attribute details to check OptionSet.IsGlobal
            const attrDetails = await this.client.makeRequest<
              Record<string, unknown>
            >(
              `api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName&$expand=OptionSet($select=IsGlobal)`
            );

            const optionSet = attrDetails.OptionSet as { IsGlobal?: boolean };
            if (optionSet && !optionSet.IsGlobal) {
              violations.push({
                attributeLogicalName: logicalName,
                attributeType: 'Picklist',
                createdOn: attr.CreatedOn as string,
                rule: 'Option Set Scope',
                severity: 'MUST',
                message: `Option set "${logicalName}" is local, must be global`,
                currentValue: 'Local Option Set',
                expectedValue: 'Global Option Set',
                action: 'Convert to global option set for reusability',
                recommendation:
                  'Use global option sets to enable reuse across entities and reduce maintenance',
              });
            }
          } catch {
            // Skip if we can't get option set details
          }
        }
      }
    }

    // RULE 5: Required Column Existence
    if (rules.includes('required-column')) {
      // Skip for RefData tables
      if (!entityLogicalName.startsWith(`${publisherPrefix}ref_`)) {
        // Replace {prefix} placeholder in each required column name
        const resolvedColumns = requiredColumns.map((col) =>
          col.replace('{prefix}', publisherPrefix)
        );

        // Check each required column
        for (const requiredColumn of resolvedColumns) {
          const hasColumn = allAttributes.some(
            (attr) => (attr.LogicalName as string) === requiredColumn
          );

          if (!hasColumn) {
            // Extract display name from schema name (remove prefix, capitalize words)
            const displayName = requiredColumn
              .replace(publisherPrefix, '')
              .split('_')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            violations.push({
              attributeLogicalName: undefined, // Entity-level violation
              rule: 'Required Column Existence',
              severity: 'MUST',
              message: `Entity "${entityLogicalName}" is missing required column "${requiredColumn}"`,
              currentValue: 'Missing',
              expectedValue: `Column "${requiredColumn}" must exist`,
              action: `Create column with Display Name "${displayName}", Schema Name "${requiredColumn}", Type: Text (4000 chars), Description: "This field tracks ${displayName.toLowerCase()} information."`,
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Build violations summary with complete lists of affected entities and columns grouped by rule
   */
  private buildViolationsSummary(
    entities: EntityValidationResult[]
  ): ViolationSummaryByRule[] {
    // Group violations by rule
    const grouped = new Map<
      string,
      Array<Violation & { entityLogicalName: string }>
    >();

    for (const entity of entities) {
      for (const violation of entity.violations) {
        if (!grouped.has(violation.rule)) {
          grouped.set(violation.rule, []);
        }

        grouped.get(violation.rule)!.push({
          ...violation,
          entityLogicalName: entity.logicalName,
        });
      }
    }

    // Build summary for each rule
    const summary: ViolationSummaryByRule[] = [];

    for (const [rule, items] of grouped.entries()) {
      if (items.length === 0) continue;

      // Separate entity-level violations (no attributeLogicalName) from column-level
      const entityLevelViolations = items.filter((v) => !v.attributeLogicalName);
      const columnLevelViolations = items.filter((v) => v.attributeLogicalName);

      // Get unique affected entities
      const affectedEntities = [
        ...new Set(entityLevelViolations.map((v) => v.entityLogicalName)),
      ];

      // Get unique affected columns (entity.column format)
      const affectedColumns = [
        ...new Set(
          columnLevelViolations.map(
            (v) => `${v.entityLogicalName}.${v.attributeLogicalName}`
          )
        ),
      ];

      // Get severity, action, and recommendation from first violation
      const firstViolation = items[0];

      summary.push({
        rule,
        severity: firstViolation.severity,
        totalCount: items.length,
        affectedEntities,
        affectedColumns,
        action: firstViolation.action,
        recommendation: firstViolation.recommendation,
      });
    }

    // Sort by severity (MUST first) then by count (descending)
    summary.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'MUST' ? -1 : 1;
      }
      return b.totalCount - a.totalCount;
    });

    return summary;
  }

  /**
   * Validate schema name against PowerPlatform naming rules
   */
  validateSchemaName(
    schemaName: string,
    prefix: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if starts with prefix
    if (!schemaName.startsWith(prefix)) {
      errors.push(`Schema name must start with prefix '${prefix}'`);
    }

    // Check for invalid characters
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      errors.push(
        'Schema name must start with a letter or underscore and contain only letters, numbers, and underscores'
      );
    }

    // Check length (max 64 characters for most components)
    if (schemaName.length > 64) {
      errors.push('Schema name must be 64 characters or less');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
