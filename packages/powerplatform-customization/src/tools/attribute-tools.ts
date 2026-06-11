/**
 * Attribute Tools - 4 tools for attribute/column management
 *
 * Tools: create-attribute, update-attribute, delete-attribute, create-global-os-attr
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  descWithExamples, ENTITY_NAME_EXAMPLES, ATTRIBUTE_TYPE_EXAMPLES,
  AUTO_NUMBER_FORMAT_EXAMPLES, DATETIME_BEHAVIOR_EXAMPLES,
  OPTIONSET_OPTIONS_EXAMPLES, SOLUTION_NAME_EXAMPLES,
} from '../tool-examples.js';

export function registerAttributeTools(server: any, ctx: ServiceContext): void {

server.tool(
  "create-attribute",
  "Create a new attribute (column) on a Dynamics 365 entity. Supports most attribute types. CRITICAL LIMITATIONS: (1) Local option sets are NOT SUPPORTED - all Picklist/MultiSelectPicklist attributes MUST use global option sets. Provide 'optionSetOptions' to auto-create a new global option set, or 'globalOptionSetName' to reference existing. (2) Customer-type attributes (polymorphic lookups) CANNOT be created via SDK - use a standard Lookup to Account or Contact instead, or create manually via Power Apps maker portal.",
  {
    entityLogicalName: z.string().describe(
      descWithExamples("The logical name of the entity to add the attribute to", ENTITY_NAME_EXAMPLES)
    ),
    attributeType: z.enum([
      "String", "Memo", "Integer", "Decimal", "Money", "DateTime",
      "Boolean", "Picklist", "Lookup", "Customer", "MultiSelectPicklist", "AutoNumber"
    ]).describe(
      descWithExamples("The type of attribute to create", ATTRIBUTE_TYPE_EXAMPLES)
    ),
    schemaName: z.string().describe("The schema name of the attribute with publisher prefix (e.g., 'new_description', 'contoso_projectcode')"),
    displayName: z.string().describe("The display name of the attribute"),
    description: z.string().optional().describe("Description of the attribute"),
    isRequired: z.boolean().optional().describe("Whether the attribute is required (default: false)"),
    maxLength: z.number().optional().describe("Max length (for String/Memo attributes). String: 1-4000, Memo: 1-1048576"),
    autoNumberFormat: z.string().optional().describe(
      descWithExamples(
        "Auto-number format string (for AutoNumber type). " +
        "Use placeholders: {SEQNUM:n} for sequential number, " +
        "{RANDSTRING:n} for random alphanumeric (length 1-6 only), " +
        "{DATETIMEUTC:format} for UTC timestamp (.NET format)",
        AUTO_NUMBER_FORMAT_EXAMPLES
      )
    ),
    precision: z.number().optional().describe("Decimal precision (0-10) for Decimal/Money attributes"),
    minValue: z.number().optional().describe("Minimum value (for Integer/Decimal/Money attributes)"),
    maxValue: z.number().optional().describe("Maximum value (for Integer/Decimal/Money attributes)"),
    dateTimeBehavior: z.enum(["UserLocal", "DateOnly", "TimeZoneIndependent"]).optional().describe(
      descWithExamples("DateTime behavior", DATETIME_BEHAVIOR_EXAMPLES)
    ),
    globalOptionSetName: z.string().optional().describe("Name of existing global option set to use (for Picklist/MultiSelectPicklist). If not provided and optionSetOptions is given, a new global option set will be created automatically."),
    optionSetOptions: z.union([
      z.array(z.string()),
      z.array(z.object({
        value: z.number(),
        label: z.string()
      }))
    ]).optional().describe(
      descWithExamples(
        "Options for new global option set. String array (auto-numbered, recommended) or {value, label} objects. A global option set is created with the attribute SchemaName",
        OPTIONSET_OPTIONS_EXAMPLES
      )
    ),
    referencedEntity: z.string().optional().describe(
      descWithExamples("Referenced entity logical name (required for Lookup attributes)", ENTITY_NAME_EXAMPLES)
    ),
    relationshipSchemaName: z.string().optional().describe("Schema name for the relationship (for Lookup attributes, e.g., 'new_account_application')"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add attribute to", SOLUTION_NAME_EXAMPLES)
    )
  },
  async (params: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

      // Validate Customer attribute type early with helpful error
      if (params.attributeType === "Customer") {
        throw new Error(
          "Customer-type attributes cannot be created via the PowerPlatform SDK.\n\n" +
          "MICROSOFT LIMITATION: The Dataverse Web API does not support programmatic creation of Customer (polymorphic lookup) attributes.\n\n" +
          "WORKAROUNDS:\n" +
          "1. Create manually via Power Apps maker portal (make.powerapps.com)\n" +
          "2. Use a standard Lookup to a specific entity:\n" +
          "   - For Account: Set attributeType='Lookup' and referencedEntity='account'\n" +
          "   - For Contact: Set attributeType='Lookup' and referencedEntity='contact'\n" +
          "3. Create separate lookup fields:\n" +
          "   - " + params.schemaName + "_account (Lookup to Account)\n" +
          "   - " + params.schemaName + "_contact (Lookup to Contact)\n" +
          "   - Use business logic to ensure only one is populated\n\n" +
          "For more information, see Microsoft's documentation on Customer attributes."
        );
      }

      // Build base attribute definition
      const baseDefinition: any = {
        SchemaName: params.schemaName,
        RequiredLevel: {
          Value: params.isRequired ? "ApplicationRequired" : "None",
          CanBeChanged: true
        },
        DisplayName: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.displayName,
              LanguageCode: 1033
            }
          ]
        },
        Description: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.description || "",
              LanguageCode: 1033
            }
          ]
        }
      };

      let attributeDefinition: any;

      // Build type-specific definition
      switch (params.attributeType) {
        case "String":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            MaxLength: params.maxLength || 100,
            FormatName: { Value: "Text" }
          };
          break;

        case "AutoNumber":
          if (!params.autoNumberFormat) {
            throw new Error(
              "AutoNumber attributes require an 'autoNumberFormat' parameter.\n\n" +
              "Format placeholders:\n" +
              "  {SEQNUM:n}         - Sequential number (min length n, grows as needed)\n" +
              "  {RANDSTRING:n}     - Random alphanumeric string (length 1-6 ONLY)\n" +
              "  {DATETIMEUTC:fmt}  - UTC timestamp with .NET format\n\n" +
              "Examples:\n" +
              "  'AUTO-{SEQNUM:5}'                              -> AUTO-00001, AUTO-00002...\n" +
              "  'CASE-{SEQNUM:4}-{DATETIMEUTC:yyyyMMdd}'      -> CASE-0001-20250115\n" +
              "  'WID-{SEQNUM:3}-{RANDSTRING:6}'               -> WID-001-A7K2M9\n\n" +
              "Note: RANDSTRING length must be 1-6 (API limitation)"
            );
          }

          // Validate RANDSTRING lengths (common error - API rejects length > 6)
          const randstringMatches = params.autoNumberFormat.match(/\{RANDSTRING:(\d+)\}/gi);
          if (randstringMatches) {
            for (const match of randstringMatches) {
              const lengthMatch = match.match(/\{RANDSTRING:(\d+)\}/i);
              if (lengthMatch) {
                const length = parseInt(lengthMatch[1]);
                if (length < 1 || length > 6) {
                  throw new Error(
                    `Invalid RANDSTRING length: ${length}\n\n` +
                    "RANDSTRING must be between 1-6 characters (Dataverse API limitation).\n" +
                    `Found in format: ${params.autoNumberFormat}\n\n` +
                    `Please change {RANDSTRING:${length}} to {RANDSTRING:6} or less.`
                  );
                }
              }
            }
          }

          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            AutoNumberFormat: params.autoNumberFormat,
            MaxLength: params.maxLength || 100,
            FormatName: { Value: "Text" }
          };
          break;

        case "Memo":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
            MaxLength: params.maxLength || 2000,
            Format: "TextArea"
          };
          break;

        case "Integer":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
            Format: "None",
            MinValue: params.minValue ?? -2147483648,
            MaxValue: params.maxValue ?? 2147483647
          };
          break;

        case "Decimal":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
            Precision: params.precision || 2,
            MinValue: params.minValue ?? -100000000000,
            MaxValue: params.maxValue ?? 100000000000
          };
          break;

        case "Money":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
            Precision: params.precision || 2,
            MinValue: params.minValue ?? -922337203685477,
            MaxValue: params.maxValue ?? 922337203685477,
            PrecisionSource: 2
          };
          break;

        case "DateTime":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
            Format: params.dateTimeBehavior === "DateOnly" ? "DateOnly" : "DateAndTime",
            DateTimeBehavior: {
              Value: params.dateTimeBehavior || "UserLocal"
            }
          };
          break;

        case "Boolean":
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
            DefaultValue: false,
            OptionSet: {
              "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
              TrueOption: {
                Value: 1,
                Label: {
                  "@odata.type": "Microsoft.Dynamics.CRM.Label",
                  LocalizedLabels: [
                    {
                      "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                      Label: "Yes",
                      LanguageCode: 1033
                    }
                  ]
                }
              },
              FalseOption: {
                Value: 0,
                Label: {
                  "@odata.type": "Microsoft.Dynamics.CRM.Label",
                  LocalizedLabels: [
                    {
                      "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                      Label: "No",
                      LanguageCode: 1033
                    }
                  ]
                }
              }
            }
          };
          break;

        case "Picklist": {
          // ALWAYS use global option sets
          if (params.globalOptionSetName) {
            const globalOptionSet = await service.getGlobalOptionSet(params.globalOptionSetName) as any;
            const metadataId = globalOptionSet.MetadataId;

            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
              "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${metadataId})`
            };
          } else if (params.optionSetOptions && params.optionSetOptions.length > 0) {
            const optionSetName = params.schemaName;

            const normalizedOptions = params.optionSetOptions.map((opt: any, index: any) => {
              if (typeof opt === 'string') {
                return {
                  Value: index,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opt, LanguageCode: 1033 }]
                  }
                };
              } else {
                return {
                  Value: opt.value,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opt.label, LanguageCode: 1033 }]
                  }
                };
              }
            });

            const globalOptionSetDefinition = {
              "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
              Name: optionSetName,
              DisplayName: baseDefinition.DisplayName,
              Description: baseDefinition.Description,
              IsGlobal: true,
              OptionSetType: "Picklist",
              Options: normalizedOptions
            };

            (baseDefinition as any)._createGlobalOptionSetFirst = globalOptionSetDefinition;
            (baseDefinition as any)._globalOptionSetNameToLookup = optionSetName;

            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
            };
          } else {
            throw new Error(
              "For Picklist attributes, you must provide either:\n" +
              "1. 'globalOptionSetName' to reference an existing global option set, OR\n" +
              "2. 'optionSetOptions' to create a new global option set automatically\n\n" +
              "Note: Local option sets are not supported - all option sets are created as global for consistency and reusability."
            );
          }
          break;
        }

        case "Lookup":
          if (!params.referencedEntity) {
            throw new Error("referencedEntity is required for Lookup attributes");
          }
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            Targets: [params.referencedEntity]
          };

          if (params.relationshipSchemaName) {
            (attributeDefinition as any).RelationshipSchemaName = params.relationshipSchemaName;
          }
          break;

        case "MultiSelectPicklist": {
          // ALWAYS use global option sets
          if (params.globalOptionSetName) {
            const globalOptionSet = await service.getGlobalOptionSet(params.globalOptionSetName) as any;
            const metadataId = globalOptionSet.MetadataId;

            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata",
              "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${metadataId})`
            };
          } else if (params.optionSetOptions && params.optionSetOptions.length > 0) {
            const optionSetName = params.schemaName;

            const normalizedOptions = params.optionSetOptions.map((opt: any, index: any) => {
              if (typeof opt === 'string') {
                return {
                  Value: index,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opt, LanguageCode: 1033 }]
                  }
                };
              } else {
                return {
                  Value: opt.value,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: opt.label, LanguageCode: 1033 }]
                  }
                };
              }
            });

            const globalOptionSetDefinition = {
              "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
              Name: optionSetName,
              DisplayName: baseDefinition.DisplayName,
              Description: baseDefinition.Description,
              IsGlobal: true,
              OptionSetType: "Picklist",
              Options: normalizedOptions
            };

            (baseDefinition as any)._createGlobalOptionSetFirst = globalOptionSetDefinition;
            (baseDefinition as any)._globalOptionSetNameToLookup = optionSetName;

            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata"
            };
          } else {
            throw new Error(
              "For MultiSelectPicklist attributes, you must provide either:\n" +
              "1. 'globalOptionSetName' to reference an existing global option set, OR\n" +
              "2. 'optionSetOptions' to create a new global option set automatically\n\n" +
              "Note: Local option sets are not supported - all option sets are created as global for consistency and reusability."
            );
          }
          break;
        }

        default:
          throw new Error(`Attribute type '${params.attributeType}' is not yet fully implemented. Contact support.`);
      }

      const solutionName = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION || undefined;

      // Check if we need to create a global option set first (two-step process)
      if ((attributeDefinition as any)._createGlobalOptionSetFirst) {
        const globalOptionSetDef = (attributeDefinition as any)._createGlobalOptionSetFirst;
        const optionSetNameToLookup = (attributeDefinition as any)._globalOptionSetNameToLookup;
        delete (attributeDefinition as any)._createGlobalOptionSetFirst;
        delete (attributeDefinition as any)._globalOptionSetNameToLookup;

        await service.createGlobalOptionSet(globalOptionSetDef, solutionName);

        const createdGlobalOptionSet = await service.getGlobalOptionSet(optionSetNameToLookup) as any;
        const metadataId = createdGlobalOptionSet.MetadataId;

        (attributeDefinition as any)["GlobalOptionSet@odata.bind"] = `/GlobalOptionSetDefinitions(${metadataId})`;
      }

      const result = await service.createAttribute(
        params.entityLogicalName,
        attributeDefinition,
        solutionName
      );

      return {
        content: [
          {
            type: "text",
            text: `Successfully created ${params.attributeType} attribute '${params.schemaName}' on entity '${params.entityLogicalName}'.\n\n` +
                  (params.attributeType === "AutoNumber" && params.autoNumberFormat ? `Auto-number format: ${params.autoNumberFormat}\n\n` : "") +
                  `Details:\n${JSON.stringify(result, null, 2)}\n\n` +
                  `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating attribute:", error);

      let errorMessage = error.message;
      let helpfulGuidance = "";

      if (errorMessage.includes("IsGlobal") || errorMessage.includes("0x80048403")) {
        helpfulGuidance = "\n\nERROR EXPLANATION: An error occurred while creating the global option set.\n\n" +
          "SOLUTION: This tool creates global option sets in a two-step process:\n" +
          "1. First, it creates the global option set\n" +
          "2. Then, it creates the attribute that references it\n\n" +
          "This error may mean:\n" +
          "- A global option set with name '" + params.schemaName + "' already exists\n" +
          "- There was an issue with the option set definition\n\n" +
          "Try using a different schema name or reference the existing global option set:\n" +
          "{\n" +
          "  entityLogicalName: \"" + params.entityLogicalName + "\",\n" +
          "  attributeType: \"" + params.attributeType + "\",\n" +
          "  schemaName: \"" + params.schemaName + "\",\n" +
          "  displayName: \"" + params.displayName + "\",\n" +
          "  globalOptionSetName: \"existing_option_set_name\"\n" +
          "}";
      }

      return {
        content: [
          {
            type: "text",
            text: `Failed to create attribute: ${errorMessage}${helpfulGuidance}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "update-attribute",
  "Update an existing attribute on an entity. Supports updating display properties, numeric constraints, date/time format, string format, and auditing settings.",
  {
    entityLogicalName: z.string().describe("Entity logical name"),
    attributeLogicalName: z.string().describe("Attribute logical name"),
    displayName: z.string().optional().describe("New display name"),
    description: z.string().optional().describe("New description"),
    requiredLevel: z.enum(["None", "Recommended", "ApplicationRequired"]).optional().describe("Required level"),
    maxLength: z.number().optional().describe(
      "Maximum length for String/Memo attributes. " +
      "String (single-line): 1-4000 characters. " +
      "Memo (multi-line): 1-1048576 characters. " +
      "Note: Reducing maxLength won't truncate existing data."
    ),
    formatName: z.enum(["Text", "TextArea", "Email", "Phone", "Url", "TickerSymbol"]).optional().describe(
      "Format for String attributes. Text=single line, TextArea=multi-line, " +
      "Email/Phone/Url/TickerSymbol=formatted input with validation."
    ),
    minValue: z.number().optional().describe(
      "Minimum value for Integer/Decimal/Money attributes. " +
      "Integer: -2147483648 to 2147483647. " +
      "Decimal: -100000000000 to 100000000000. " +
      "Money: -922337203685477 to 922337203685477."
    ),
    maxValue: z.number().optional().describe(
      "Maximum value for Integer/Decimal/Money attributes. " +
      "Integer: -2147483648 to 2147483647. " +
      "Decimal: -100000000000 to 100000000000. " +
      "Money: -922337203685477 to 922337203685477."
    ),
    precision: z.number().optional().describe(
      "Decimal precision for Decimal/Money attributes (0-10 decimal places)."
    ),
    precisionSource: z.enum(["Precision", "Pricing", "Currency"]).optional().describe(
      "Precision source for Money attributes. " +
      "Precision=use precision property, Pricing=org pricing setting, Currency=currency precision."
    ),
    format: z.enum(["DateAndTime", "DateOnly"]).optional().describe(
      "Display format for DateTime attributes."
    ),
    dateTimeBehavior: z.enum(["UserLocal", "DateOnly", "TimeZoneIndependent"]).optional().describe(
      "Time zone behavior for DateTime attributes. Only changeable if CanChangeDateTimeBehavior=true. " +
      "UserLocal=adjusted to user timezone, DateOnly=date without time, TimeZoneIndependent=stored as-is."
    ),
    isAuditEnabled: z.boolean().optional().describe(
      "Enable/disable auditing for this attribute. Tracks changes to field values."
    ),
    isValidForAdvancedFind: z.boolean().optional().describe(
      "Show this attribute in Advanced Find queries."
    ),
    autoNumberFormat: z.string().optional().describe(
      "Auto-number format string to convert String attribute to AutoNumber. " +
      "Use placeholders: {SEQNUM:n} for sequential number (min length n), " +
      "{RANDSTRING:n} for random alphanumeric (length 1-6 only), " +
      "{DATETIMEUTC:format} for UTC timestamp (.NET format). " +
      "Example: 'AUTO-{SEQNUM:5}-{RANDSTRING:4}' produces AUTO-00001-A7K2, AUTO-00002-B9M4, etc."
    ),
    solutionUniqueName: z.string().optional().describe("Solution context")
  },
  async (params: any) => {
    try {
      const service = ctx.pp;

      const updates: any = {};

      if (params.displayName) {
        updates.DisplayName = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.displayName, LanguageCode: 1033 }]
        };
      }

      if (params.description) {
        updates.Description = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.description, LanguageCode: 1033 }]
        };
      }

      if (params.requiredLevel) {
        updates.RequiredLevel = { Value: params.requiredLevel, CanBeChanged: true };
      }

      if (params.maxLength !== undefined) {
        if (params.maxLength < 1) {
          throw new Error("maxLength must be at least 1 character.");
        }
        if (params.maxLength > 1048576) {
          throw new Error("maxLength cannot exceed 1,048,576 characters (Memo maximum).");
        }
        updates.MaxLength = params.maxLength;
      }

      if (params.formatName) {
        updates.FormatName = { Value: params.formatName };
      }

      if (params.minValue !== undefined) {
        updates.MinValue = params.minValue;
      }

      if (params.maxValue !== undefined) {
        updates.MaxValue = params.maxValue;
      }

      if (params.precision !== undefined) {
        if (params.precision < 0 || params.precision > 10) {
          throw new Error("precision must be between 0 and 10 decimal places.");
        }
        updates.Precision = params.precision;
      }

      if (params.precisionSource) {
        const precisionSourceMap: Record<string, number> = {
          "Precision": 0,
          "Pricing": 1,
          "Currency": 2
        };
        updates.PrecisionSource = precisionSourceMap[params.precisionSource];
      }

      if (params.format) {
        updates.Format = params.format;
      }

      if (params.dateTimeBehavior) {
        updates.DateTimeBehavior = {
          "@odata.type": "Microsoft.Dynamics.CRM.DateTimeBehavior",
          Value: params.dateTimeBehavior
        };
      }

      if (params.isAuditEnabled !== undefined) {
        updates.IsAuditEnabled = {
          Value: params.isAuditEnabled,
          CanBeChanged: true
        };
      }

      if (params.isValidForAdvancedFind !== undefined) {
        updates.IsValidForAdvancedFind = {
          Value: params.isValidForAdvancedFind,
          CanBeChanged: true
        };
      }

      if (params.autoNumberFormat) {
        const randstringMatches2 = params.autoNumberFormat.match(/\{RANDSTRING:(\d+)\}/gi);
        if (randstringMatches2) {
          for (const match of randstringMatches2) {
            const lengthMatch = match.match(/\{RANDSTRING:(\d+)\}/i);
            if (lengthMatch) {
              const length = parseInt(lengthMatch[1]);
              if (length < 1 || length > 6) {
                throw new Error(
                  `Invalid RANDSTRING length: ${length}\n\n` +
                  "RANDSTRING must be between 1-6 characters (Dataverse API limitation).\n" +
                  `Found in format: ${params.autoNumberFormat}\n\n` +
                  `Please change {RANDSTRING:${length}} to {RANDSTRING:6} or less.`
                );
              }
            }
          }
        }

        updates.AutoNumberFormat = params.autoNumberFormat;
      }

      await service.updateAttribute(params.entityLogicalName, params.attributeLogicalName, updates, params.solutionUniqueName);

      let successMessage = `Successfully updated attribute '${params.attributeLogicalName}' on entity '${params.entityLogicalName}'`;

      const changes: string[] = [];

      if (params.displayName) changes.push(`Display name: "${params.displayName}"`);
      if (params.description) changes.push(`Description updated`);
      if (params.requiredLevel) changes.push(`Required level: ${params.requiredLevel}`);
      if (params.maxLength !== undefined) changes.push(`Max length: ${params.maxLength} characters`);
      if (params.formatName) changes.push(`Format: ${params.formatName}`);
      if (params.minValue !== undefined) changes.push(`Min value: ${params.minValue}`);
      if (params.maxValue !== undefined) changes.push(`Max value: ${params.maxValue}`);
      if (params.precision !== undefined) changes.push(`Precision: ${params.precision} decimal places`);
      if (params.precisionSource) changes.push(`Precision source: ${params.precisionSource}`);
      if (params.format) changes.push(`DateTime format: ${params.format}`);
      if (params.dateTimeBehavior) changes.push(`DateTime behavior: ${params.dateTimeBehavior}`);
      if (params.isAuditEnabled !== undefined) changes.push(`Auditing: ${params.isAuditEnabled ? 'enabled' : 'disabled'}`);
      if (params.isValidForAdvancedFind !== undefined) changes.push(`Advanced Find: ${params.isValidForAdvancedFind ? 'enabled' : 'disabled'}`);
      if (params.autoNumberFormat) changes.push(`AutoNumber format: ${params.autoNumberFormat}`);

      if (changes.length > 0) {
        successMessage += `\n\nChanges made:\n${changes.map(c => `  - ${c}`).join('\n')}`;
      }

      if (params.autoNumberFormat) {
        successMessage += `\n\nNOTE: Converting to AutoNumber is irreversible. The attribute will now auto-generate values based on the format.`;
      }

      if (params.dateTimeBehavior) {
        successMessage += `\n\nNOTE: DateTimeBehavior changes may affect existing data interpretation. Review dependent workflows and business rules.`;
      }

      successMessage += `\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`;

      return {
        content: [{ type: "text", text: successMessage }]
      };
    } catch (error: any) {
      console.error("Error updating attribute:", error);
      return { content: [{ type: "text", text: `Failed to update attribute: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete-attribute",
  "Delete an attribute from an entity. WARNING: Use check-delete-eligibility (read-only package) first to verify safe deletion. This is irreversible.",
  {
    entityLogicalName: z.string().describe(
      descWithExamples("Entity logical name", ENTITY_NAME_EXAMPLES)
    ),
    attributeMetadataId: z.string().describe("Attribute MetadataId (GUID). Get from get-entity-attributes in the read-only package.")
  },
  async ({ entityLogicalName, attributeMetadataId }: any) => {
    try {
      const service = ctx.pp;

      await service.deleteAttribute(entityLogicalName, attributeMetadataId);

      return {
        content: [{ type: "text", text: `Successfully deleted attribute (${attributeMetadataId}) from entity '${entityLogicalName}'\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting attribute:", error);
      return { content: [{ type: "text", text: `Failed to delete attribute: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-global-os-attr",
  "Create a picklist attribute using an existing global option set. Requires publish-customizations afterwards.",
  {
    entityLogicalName: z.string().describe(
      descWithExamples("Entity logical name", ENTITY_NAME_EXAMPLES)
    ),
    schemaName: z.string().describe("Attribute schema name with publisher prefix (e.g., 'new_status', 'contoso_category')"),
    displayName: z.string().describe("Attribute display name"),
    globalOptionSetName: z.string().describe("Global option set name to use. Get available option sets from get-global-option-set (read-only package)."),
    description: z.string().optional().describe("Attribute description"),
    requiredLevel: z.enum(["None", "Recommended", "ApplicationRequired"]).optional().describe("Required level (default: None)"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to", SOLUTION_NAME_EXAMPLES)
    )
  },
  async (params: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
      const solution = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createGlobalOptionSetAttribute(
        params.entityLogicalName,
        params.schemaName,
        params.displayName,
        params.globalOptionSetName,
        {
          description: params.description,
          requiredLevel: params.requiredLevel,
          solutionUniqueName: solution
        }
      );

      return {
        content: [{ type: "text", text: `Successfully created global option set attribute '${params.schemaName}' using '${params.globalOptionSetName}'\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating global option set attribute:", error);
      return { content: [{ type: "text", text: `Failed to create global option set attribute: ${error.message}` }], isError: true };
    }
  }
);

}
