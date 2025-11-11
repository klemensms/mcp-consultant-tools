/**
 * Best Practices Validation Module
 *
 * Hard-coded SmartImpact CRM best practices for entity and attribute customization.
 * These rules are enforced during entity and attribute creation/update operations.
 */

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  missingColumns?: RequiredColumn[];
}

export interface RequiredColumn {
  schemaName: string;
  displayName: string;
  description: string;
  type: string;
  maxLength?: number;
  format?: string;
  behavior?: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Hard-coded best practices rules for SmartImpact CRM customizations
 */
export const BEST_PRACTICES = {
  publisher: {
    prefix: 'sic_',
    name: 'SmartImpactCustomer',
    optionValuePrefix: 15743
  },

  entity: {
    ownershipType: {
      allowed: ['UserOwned', 'TeamOwned'],
      forbidden: ['OrganizationOwned'],
      default: 'UserOwned'
    },
    // Naming pattern: prefix + "ref_" + tablename (for RefData) or prefix + tablename (for BAU)
    // Example RefData: sic_ref_cancellationreason (prefix=sic_, ref_ inserted, name=cancellationreason)
    // Example BAU: sic_application (prefix=sic_, name=application)
    prefix: 'sic_',        // Publisher prefix
    refDataInfix: 'ref_',  // Inserted after prefix for reference data tables
    caseRule: 'lowercase'
  },

  attribute: {
    lookupSuffix: 'id',
    caseRule: 'lowercase',
    avoidBooleans: true,
    dateTimeDefaultBehavior: 'TimeZoneIndependent'
  },

  requiredColumns: {
    allTables: [
      {
        schemaName: 'sic_updatedbyprocess',
        displayName: 'Updated by process',
        description: 'This field is updated, each time an automated process updates this record.',
        type: 'String',
        maxLength: 4000
      }
    ],
    refDataTables: [
      {
        schemaName: 'sic_startdate',
        displayName: 'Start Date',
        description: 'The date this reference data record started being used.',
        type: 'DateTime',
        format: 'DateOnly',
        behavior: 'TimeZoneIndependent'
      },
      {
        schemaName: 'sic_enddate',
        displayName: 'End Date',
        description: 'The date this reference data record stopped being used.',
        type: 'DateTime',
        format: 'DateOnly',
        behavior: 'TimeZoneIndependent'
      },
      {
        schemaName: 'sic_description',
        displayName: 'Description',
        description: 'Useful information about this reference data record.',
        type: 'Memo',
        maxLength: 20000
      },
      {
        schemaName: 'sic_code',
        displayName: 'Code',
        description: 'Code to identify the record, instead of GUID',
        type: 'String',
        maxLength: 100
      }
    ]
  },

  form: {
    firstColumnMustBeName: true,
    standardColumnOrder: ['name', 'createdon', 'createdby', 'modifiedon', 'modifiedby', 'statuscode', 'status'],
    colorPalette: {
      amber: '#ffd175',
      green: '#8ed483',
      red: '#ff8c8c',
      grey: '#d1d1d1'
    },
    timelineActivityLimit: 10
  },

  status: {
    preferGlobalOptionSets: true,
    avoidOOTBStateStatus: true
  }
};

/**
 * Best Practices Validator Class
 */
export class BestPracticesValidator {

  /**
   * Validate entity naming conventions
   * Pattern for RefData: prefix + "ref_" + tablename (e.g., sic_ref_cancellationreason)
   * Pattern for BAU: prefix + tablename (e.g., sic_application)
   */
  validateEntityName(schemaName: string, isRefData: boolean): ValidationResult {
    const rules = BEST_PRACTICES.entity;
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check lowercase
    if (schemaName !== schemaName.toLowerCase()) {
      issues.push(`Entity schema name must be all lowercase. Got: "${schemaName}"`);
    }

    // Check prefix and infix
    if (!schemaName.startsWith(rules.prefix)) {
      issues.push(`Entity schema name must start with publisher prefix "${rules.prefix}". Got: "${schemaName}"`);
    } else if (isRefData) {
      // For RefData tables, check that "ref_" follows the prefix
      const expectedPattern = rules.prefix + rules.refDataInfix;
      if (!schemaName.startsWith(expectedPattern)) {
        issues.push(
          `RefData entity schema name must follow pattern "${expectedPattern}<tablename>". ` +
          `Example: ${expectedPattern}cancellationreason. Got: "${schemaName}"`
        );
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Validate attribute naming conventions
   */
  validateAttributeName(schemaName: string, isLookup: boolean): ValidationResult {
    const rules = BEST_PRACTICES.attribute;
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check lowercase
    if (schemaName !== schemaName.toLowerCase()) {
      issues.push(`Attribute schema name must be all lowercase. Got: "${schemaName}"`);
    }

    // Check publisher prefix
    if (!schemaName.startsWith(BEST_PRACTICES.publisher.prefix)) {
      issues.push(`Attribute schema name must start with "${BEST_PRACTICES.publisher.prefix}". Got: "${schemaName}"`);
    }

    // Check lookup suffix
    if (isLookup && !schemaName.endsWith(rules.lookupSuffix)) {
      warnings.push(`Lookup attribute should end with "${rules.lookupSuffix}". Got: "${schemaName}"`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Validate entity ownership type
   */
  validateOwnershipType(ownershipType: string): ValidationResult {
    const rules = BEST_PRACTICES.entity.ownershipType;
    const issues: string[] = [];

    if (rules.forbidden.includes(ownershipType)) {
      issues.push(`Ownership type "${ownershipType}" is forbidden. Use "${rules.default}" instead.`);
    }

    if (!rules.allowed.includes(ownershipType)) {
      issues.push(`Ownership type "${ownershipType}" is not in allowed list: ${rules.allowed.join(', ')}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings: []
    };
  }

  /**
   * Check if required columns are present
   */
  validateRequiredColumns(
    existingColumns: string[],
    isRefData: boolean
  ): ValidationResult {
    const rules = BEST_PRACTICES.requiredColumns;
    const issues: string[] = [];
    const missingColumns: RequiredColumn[] = [];

    // Check all-tables columns
    for (const column of rules.allTables) {
      if (!existingColumns.includes(column.schemaName)) {
        missingColumns.push(column);
        issues.push(`Missing required column: ${column.schemaName} (${column.displayName})`);
      }
    }

    // Check ref-data-specific columns
    if (isRefData) {
      for (const column of rules.refDataTables) {
        if (!existingColumns.includes(column.schemaName)) {
          missingColumns.push(column);
          issues.push(`Missing required RefData column: ${column.schemaName} (${column.displayName})`);
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings: [],
      missingColumns
    };
  }

  /**
   * Validate boolean usage (discouraged)
   */
  validateBooleanUsage(attributeType: string, schemaName: string): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (attributeType === 'Boolean' && BEST_PRACTICES.attribute.avoidBooleans) {
      warnings.push(
        `Boolean attribute "${schemaName}" should be avoided. ` +
        `Consider using a picklist with explicit values instead for better clarity.`
      );
    }

    return {
      isValid: true, // Warnings only, not an error
      issues,
      warnings
    };
  }

  /**
   * Validate DateTime behavior
   */
  validateDateTimeBehavior(behavior: string | undefined): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    const defaultBehavior = BEST_PRACTICES.attribute.dateTimeDefaultBehavior;

    if (behavior && behavior !== defaultBehavior) {
      warnings.push(
        `DateTime behavior "${behavior}" differs from recommended "${defaultBehavior}". ` +
        `Consider using "${defaultBehavior}" for consistency.`
      );
    }

    return {
      isValid: true, // Warnings only
      issues,
      warnings
    };
  }

  /**
   * Get required columns for entity type
   */
  getRequiredColumns(isRefData: boolean): RequiredColumn[] {
    const columns: RequiredColumn[] = [...BEST_PRACTICES.requiredColumns.allTables];
    if (isRefData) {
      columns.push(...BEST_PRACTICES.requiredColumns.refDataTables as RequiredColumn[]);
    }
    return columns;
  }

  /**
   * Validate option set value prefix
   */
  validateOptionSetValuePrefix(value: number): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    const expectedPrefix = BEST_PRACTICES.publisher.optionValuePrefix;

    const valueStr = value.toString();
    const prefixStr = expectedPrefix.toString();

    if (!valueStr.startsWith(prefixStr)) {
      warnings.push(
        `Option set value ${value} does not start with publisher prefix ${expectedPrefix}. ` +
        `Values should start with ${prefixStr} for consistency.`
      );
    }

    return {
      isValid: true, // Warnings only
      issues,
      warnings
    };
  }

  /**
   * Generate next option set value with proper prefix
   */
  getNextOptionSetValue(existingValues: number[]): number {
    const prefix = BEST_PRACTICES.publisher.optionValuePrefix;
    const prefixStr = prefix.toString();

    // Find all values that start with our prefix
    const ourValues = existingValues
      .filter(v => v.toString().startsWith(prefixStr))
      .sort((a, b) => b - a);

    if (ourValues.length === 0) {
      // Start with prefix + 0001
      return prefix * 10000 + 1;
    }

    // Increment the highest value
    return ourValues[0] + 1;
  }

  /**
   * Comprehensive entity validation
   */
  validateEntity(params: {
    schemaName: string;
    displayName: string;
    ownershipType: string;
    isRefData: boolean;
    existingColumns?: string[];
  }): ValidationResult {
    const allIssues: string[] = [];
    const allWarnings: string[] = [];
    let missingColumns: RequiredColumn[] | undefined;

    // Validate schema name
    const nameResult = this.validateEntityName(params.schemaName, params.isRefData);
    allIssues.push(...nameResult.issues);
    allWarnings.push(...nameResult.warnings);

    // Validate ownership type
    const ownershipResult = this.validateOwnershipType(params.ownershipType);
    allIssues.push(...ownershipResult.issues);
    allWarnings.push(...ownershipResult.warnings);

    // Validate required columns if checking existing entity
    if (params.existingColumns) {
      const columnsResult = this.validateRequiredColumns(params.existingColumns, params.isRefData);
      allIssues.push(...columnsResult.issues);
      allWarnings.push(...columnsResult.warnings);
      missingColumns = columnsResult.missingColumns;
    }

    return {
      isValid: allIssues.length === 0,
      issues: allIssues,
      warnings: allWarnings,
      missingColumns
    };
  }

  /**
   * Comprehensive attribute validation
   */
  validateAttribute(params: {
    schemaName: string;
    attributeType: string;
    dateTimeBehavior?: string;
  }): ValidationResult {
    const allIssues: string[] = [];
    const allWarnings: string[] = [];

    // Validate schema name
    const isLookup = params.attributeType === 'Lookup' || params.attributeType === 'Customer';
    const nameResult = this.validateAttributeName(params.schemaName, isLookup);
    allIssues.push(...nameResult.issues);
    allWarnings.push(...nameResult.warnings);

    // Validate boolean usage
    const boolResult = this.validateBooleanUsage(params.attributeType, params.schemaName);
    allWarnings.push(...boolResult.warnings);

    // Validate DateTime behavior if applicable
    if (params.attributeType === 'DateTime' && params.dateTimeBehavior) {
      const behaviorResult = this.validateDateTimeBehavior(params.dateTimeBehavior);
      allWarnings.push(...behaviorResult.warnings);
    }

    return {
      isValid: allIssues.length === 0,
      issues: allIssues,
      warnings: allWarnings
    };
  }
}

// Export singleton instance
export const bestPracticesValidator = new BestPracticesValidator();
