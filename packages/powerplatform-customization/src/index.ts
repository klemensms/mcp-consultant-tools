#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createMcpServer, createEnvLoader } from '@mcp-consultant-tools/core';
import { PowerPlatformService, PowerPlatformConfig } from './PowerPlatformService.js';

const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

/**
 * Register powerplatform-customization tools with an MCP server
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function registerPowerplatformCustomizationTools(server: any, service?: PowerPlatformService) {

  // Check if customization is enabled
  const customizationEnabled = process.env.POWERPLATFORM_ENABLE_CUSTOMIZATION === 'true';
  if (!customizationEnabled) {
    throw new Error(
      'powerplatform-customization tools are disabled. Set POWERPLATFORM_ENABLE_CUSTOMIZATION=true to enable.'
    );
  }

  let ppService: PowerPlatformService | null = service || null;


  // Check if customization is enabled
  function checkCustomizationEnabled() {
    if (process.env.POWERPLATFORM_ENABLE_CUSTOMIZATION !== 'true') {
      throw new Error('Customization operations are disabled. Set POWERPLATFORM_ENABLE_CUSTOMIZATION=true to enable.');
    }
  }

  function getPowerPlatformService(): PowerPlatformService {
    if (!ppService) {
      const requiredVars = [
        'POWERPLATFORM_URL',
        'POWERPLATFORM_CLIENT_ID',
        'POWERPLATFORM_CLIENT_SECRET',
        'POWERPLATFORM_TENANT_ID'
      ];

      const missing = requiredVars.filter(v => !process.env[v]);
      if (missing.length > 0) {
        throw new Error(`Missing required PowerPlatform configuration: ${missing.join(', ')}`);
      }

      const config: PowerPlatformConfig = {
        organizationUrl: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET!,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      ppService = new PowerPlatformService(config);
    }
    return ppService;
  }

  // Tool registrations
server.tool(
  "add-entities-to-app",
  "Add entities to a model-driven app (automatically adds them to navigation)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
    entityNames: z.array(z.string()).describe("Array of entity logical names to add (e.g., ['account', 'contact'])"),
  },
  async ({ appId, entityNames }: any) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.addEntitiesToApp(appId, entityNames);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Entities added successfully:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error adding entities to app:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to add entities to app: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "validate-app",
  "Validate a model-driven app before publishing (checks for missing components and configuration issues)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }: any) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.validateApp(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `App validation result:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error validating app:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to validate app: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "publish-app",
  "Publish a model-driven app to make it available to users (automatically validates first)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }: any) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.publishApp(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `App published successfully:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error publishing app:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to publish app: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "create-entity",
  "Create a new custom entity (table) in Dynamics 365 / PowerPlatform. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    schemaName: z.string().describe("The schema name of the entity (e.g., 'sic_application')"),
    displayName: z.string().describe("The display name of the entity (e.g., 'Application')"),
    pluralDisplayName: z.string().describe("The plural display name (e.g., 'Applications')"),
    description: z.string().describe("Description of the entity"),
    ownershipType: z.enum(["UserOwned", "TeamOwned", "OrganizationOwned"]).describe("Ownership type (default: UserOwned)"),
    hasActivities: z.boolean().optional().describe("Enable activities (default: false)"),
    hasNotes: z.boolean().optional().describe("Enable notes (default: false)"),
    isActivityParty: z.boolean().optional().describe("Can be a party in activities (default: false)"),
    primaryAttributeSchemaName: z.string().optional().describe("Schema name for primary attribute (default: 'name')"),
    primaryAttributeDisplayName: z.string().optional().describe("Display name for primary attribute (default: 'Name')"),
    primaryAttributeMaxLength: z.number().optional().describe("Max length for primary attribute (default: 850)"),
    solutionUniqueName: z.string().optional().describe("Solution to add entity to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not specified)")
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Construct entity definition
      const entityDefinition = {
        "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
        SchemaName: params.schemaName,
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
        DisplayCollectionName: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.pluralDisplayName,
              LanguageCode: 1033
            }
          ]
        },
        Description: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: params.description,
              LanguageCode: 1033
            }
          ]
        },
        OwnershipType: params.ownershipType,
        IsActivity: false,
        HasActivities: params.hasActivities || false,
        HasNotes: params.hasNotes || false,
        IsActivityParty: params.isActivityParty || false,
        IsDuplicateDetectionEnabled: { Value: false, CanBeChanged: true },
        IsMailMergeEnabled: { Value: false, CanBeChanged: true },
        Attributes: [
          {
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            SchemaName: params.primaryAttributeSchemaName || "name",
            IsPrimaryName: true,
            RequiredLevel: {
              Value: "None",
              CanBeChanged: true
            },
            MaxLength: params.primaryAttributeMaxLength || 850,
            FormatName: {
              Value: "Text"
            },
            DisplayName: {
              "@odata.type": "Microsoft.Dynamics.CRM.Label",
              LocalizedLabels: [
                {
                  "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                  Label: params.primaryAttributeDisplayName || "Name",
                  LanguageCode: 1033
                }
              ]
            },
            Description: {
              "@odata.type": "Microsoft.Dynamics.CRM.Label",
              LocalizedLabels: [
                {
                  "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                  Label: "The primary attribute for the entity",
                  LanguageCode: 1033
                }
              ]
            }
          }
        ],
        HasFeedback: false
      };

      const solutionName = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION || undefined;
      const result = await service.createEntity(entityDefinition, solutionName);

      return {
        content: [
          {
            type: "text",
            text: `Successfully created entity '${params.schemaName}'.\n\n` +
                  `Details:\n${JSON.stringify(result, null, 2)}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating entity:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create entity: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "update-entity",
  "Update an existing custom entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("The MetadataId of the entity (GUID)"),
    displayName: z.string().optional().describe("New display name"),
    pluralDisplayName: z.string().optional().describe("New plural display name"),
    description: z.string().optional().describe("New description"),
    hasActivities: z.boolean().optional().describe("Enable/disable activities"),
    hasNotes: z.boolean().optional().describe("Enable/disable notes"),
    solutionUniqueName: z.string().optional().describe("Solution context")
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};

      if (params.displayName) {
        updates.DisplayName = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.displayName, LanguageCode: 1033 }]
        };
      }

      if (params.pluralDisplayName) {
        updates.DisplayCollectionName = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.pluralDisplayName, LanguageCode: 1033 }]
        };
      }

      if (params.description) {
        updates.Description = {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.description, LanguageCode: 1033 }]
        };
      }

      if (params.hasActivities !== undefined) updates.HasActivities = params.hasActivities;
      if (params.hasNotes !== undefined) updates.HasNotes = params.hasNotes;

      await service.updateEntity(params.metadataId, updates, params.solutionUniqueName);

      return {
        content: [{ type: "text", text: `✅ Successfully updated entity (${params.metadataId})\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error updating entity:", error);
      return { content: [{ type: "text", text: `Failed to update entity: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-entity-icon",
  "Update entity icon using Fluent UI System Icons from Microsoft's official icon library. Creates a web resource and sets it as the entity icon. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("The logical name of the entity (e.g., 'sic_strikeaction')"),
    iconFileName: z.string().describe("Fluent UI icon file name (e.g., 'people_community_24_filled.svg'). Browse icons at: https://github.com/microsoft/fluentui-system-icons"),
    solutionUniqueName: z.string().optional().describe("Solution to add the web resource to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not specified)")
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const result = await service.updateEntityIcon(
        params.entityLogicalName,
        params.iconFileName,
        params.solutionUniqueName
      );

      const message = `✅ Successfully updated entity icon

**Entity:** ${result.entityLogicalName} (${result.entitySchemaName})
**Icon:** ${result.iconFileName}
**Web Resource:** ${result.webResourceName}
**Web Resource ID:** ${result.webResourceId}
**Icon Vector Name:** ${result.iconVectorName}

✨ **Published:** The icon has been automatically published and should now be visible in the UI.

💡 TIP: Browse available Fluent UI icons at https://github.com/microsoft/fluentui-system-icons`;

      return {
        content: [{ type: "text", text: message }]
      };
    } catch (error: any) {
      console.error("Error updating entity icon:", error);
      return {
        content: [{
          type: "text",
          text: `❌ Failed to update entity icon: ${error.message}\n\n💡 Make sure the icon file name is valid (e.g., 'people_community_24_filled.svg'). Browse available icons at https://github.com/microsoft/fluentui-system-icons`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "delete-entity",
  "Delete a custom entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("The MetadataId of the entity to delete (GUID)")
  },
  async ({ metadataId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteEntity(metadataId);

      return {
        content: [{ type: "text", text: `✅ Successfully deleted entity (${metadataId})\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting entity:", error);
      return { content: [{ type: "text", text: `Failed to delete entity: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-attribute",
  "Create a new attribute (column) on a Dynamics 365 entity. Supports most attribute types. CRITICAL LIMITATIONS: (1) Local option sets are NOT SUPPORTED - all Picklist/MultiSelectPicklist attributes MUST use global option sets. Provide 'optionSetOptions' to auto-create a new global option set, or 'globalOptionSetName' to reference existing. (2) Customer-type attributes (polymorphic lookups) CANNOT be created via SDK - use a standard Lookup to Account or Contact instead, or create manually via Power Apps maker portal. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("The logical name of the entity"),
    attributeType: z.enum([
      "String", "Memo", "Integer", "Decimal", "Money", "DateTime",
      "Boolean", "Picklist", "Lookup", "Customer", "MultiSelectPicklist", "AutoNumber"
    ]).describe("The type of attribute to create"),
    schemaName: z.string().describe("The schema name of the attribute (e.g., 'sic_description')"),
    displayName: z.string().describe("The display name of the attribute"),
    description: z.string().optional().describe("Description of the attribute"),
    isRequired: z.boolean().optional().describe("Whether the attribute is required (default: false)"),
    // String-specific
    maxLength: z.number().optional().describe("Max length (for String/Memo attributes)"),
    // AutoNumber-specific
    autoNumberFormat: z.string().optional().describe(
      "Auto-number format string (for AutoNumber type). " +
      "Use placeholders: {SEQNUM:n} for sequential number (min length n), " +
      "{RANDSTRING:n} for random alphanumeric (length 1-6 only), " +
      "{DATETIMEUTC:format} for UTC timestamp (.NET format). " +
      "Example: 'AUTO-{SEQNUM:5}-{RANDSTRING:4}' produces AUTO-00001-A7K2, AUTO-00002-B9M4, etc."
    ),
    // Decimal/Money-specific
    precision: z.number().optional().describe("Precision (for Decimal/Money attributes)"),
    minValue: z.number().optional().describe("Minimum value (for Integer/Decimal/Money attributes)"),
    maxValue: z.number().optional().describe("Maximum value (for Integer/Decimal/Money attributes)"),
    // DateTime-specific
    dateTimeBehavior: z.enum(["UserLocal", "DateOnly", "TimeZoneIndependent"]).optional().describe("DateTime behavior"),
    // Picklist-specific
    globalOptionSetName: z.string().optional().describe("Name of existing global option set to use (for Picklist/MultiSelectPicklist). If not provided and optionSetOptions is given, a new global option set will be created automatically."),
    optionSetOptions: z.union([
      z.array(z.string()),
      z.array(z.object({
        value: z.number(),
        label: z.string()
      }))
    ]).optional().describe("Options for new global option set. Can be either: 1) Array of strings (values auto-numbered 0,1,2...) RECOMMENDED, or 2) Array of {value, label} objects for custom values. A global option set will be created automatically with the name matching the attribute SchemaName."),
    // Lookup-specific
    referencedEntity: z.string().optional().describe("Referenced entity logical name (for Lookup attributes)"),
    relationshipSchemaName: z.string().optional().describe("Schema name for the relationship (for Lookup attributes)"),
    solutionUniqueName: z.string().optional().describe("Solution to add attribute to")
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Validate Customer attribute type early with helpful error
      if (params.attributeType === "Customer") {
        throw new Error(
          "Customer-type attributes cannot be created via the PowerPlatform SDK.\n\n" +
          "🔴 MICROSOFT LIMITATION: The Dataverse Web API does not support programmatic creation of Customer (polymorphic lookup) attributes.\n\n" +
          "✅ WORKAROUNDS:\n" +
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
              "  'AUTO-{SEQNUM:5}'                              → AUTO-00001, AUTO-00002...\n" +
              "  'CASE-{SEQNUM:4}-{DATETIMEUTC:yyyyMMdd}'      → CASE-0001-20250115\n" +
              "  'WID-{SEQNUM:3}-{RANDSTRING:6}'               → WID-001-A7K2M9\n\n" +
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
            MaxLength: params.maxLength || 100,  // Default to 100, user can override
            FormatName: { Value: "Text" }  // MUST be Text for auto-number
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

        case "Picklist":
          // ALWAYS use global option sets
          if (params.globalOptionSetName) {
            // Using existing global option set - need to look up its MetadataId first
            const globalOptionSet = await service.getGlobalOptionSet(params.globalOptionSetName);
            const metadataId = globalOptionSet.MetadataId;

            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
              "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${metadataId})`
            };
          } else if (params.optionSetOptions && params.optionSetOptions.length > 0) {
            // Create NEW global option set in TWO steps:
            // Step 1: Create the global option set separately
            // Step 2: Create the attribute that references it

            const optionSetName = params.schemaName;

            // Normalize options: support both string[] (auto-numbered) and {value, label}[] formats
            const normalizedOptions = params.optionSetOptions.map((opt: any, index: any) => {
              if (typeof opt === 'string') {
                // Auto-number from 0
                return {
                  Value: index,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [
                      {
                        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                        Label: opt,
                        LanguageCode: 1033
                      }
                    ]
                  }
                };
              } else {
                // User provided explicit value
                return {
                  Value: opt.value,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [
                      {
                        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                        Label: opt.label,
                        LanguageCode: 1033
                      }
                    ]
                  }
                };
              }
            });

            // Step 1: Create the global option set first
            const globalOptionSetDefinition = {
              "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
              Name: optionSetName,
              DisplayName: baseDefinition.DisplayName,
              Description: baseDefinition.Description,
              IsGlobal: true,
              OptionSetType: "Picklist",
              Options: normalizedOptions
            };

            // Store this for later - we'll create it before the attribute
            (baseDefinition as any)._createGlobalOptionSetFirst = globalOptionSetDefinition;
            (baseDefinition as any)._globalOptionSetNameToLookup = optionSetName;

            // Step 2: Create attribute definition that REFERENCES the global option set
            // The MetadataId binding will be set after creating the global option set
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

        case "Lookup":
          if (!params.referencedEntity) {
            throw new Error("referencedEntity is required for Lookup attributes");
          }
          attributeDefinition = {
            ...baseDefinition,
            "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            Targets: [params.referencedEntity]
          };

          // For lookups, we also need relationship information
          if (params.relationshipSchemaName) {
            (attributeDefinition as any).RelationshipSchemaName = params.relationshipSchemaName;
          }
          break;


        case "MultiSelectPicklist":
          // ALWAYS use global option sets
          if (params.globalOptionSetName) {
            // Using existing global option set - need to look up its MetadataId first
            const globalOptionSet = await service.getGlobalOptionSet(params.globalOptionSetName);
            const metadataId = globalOptionSet.MetadataId;

            attributeDefinition = {
              ...baseDefinition,
              "@odata.type": "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata",
              "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${metadataId})`
            };
          } else if (params.optionSetOptions && params.optionSetOptions.length > 0) {
            // Create NEW global option set in TWO steps:
            // Step 1: Create the global option set separately
            // Step 2: Create the attribute that references it

            const optionSetName = params.schemaName;

            // Normalize options: support both string[] (auto-numbered) and {value, label}[] formats
            const normalizedOptions = params.optionSetOptions.map((opt: any, index: any) => {
              if (typeof opt === 'string') {
                // Auto-number from 0
                return {
                  Value: index,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [
                      {
                        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                        Label: opt,
                        LanguageCode: 1033
                      }
                    ]
                  }
                };
              } else {
                // User provided explicit value
                return {
                  Value: opt.value,
                  Label: {
                    "@odata.type": "Microsoft.Dynamics.CRM.Label",
                    LocalizedLabels: [
                      {
                        "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                        Label: opt.label,
                        LanguageCode: 1033
                      }
                    ]
                  }
                };
              }
            });

            // Step 1: Create the global option set first
            const globalOptionSetDefinition = {
              "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
              Name: optionSetName,
              DisplayName: baseDefinition.DisplayName,
              Description: baseDefinition.Description,
              IsGlobal: true,
              OptionSetType: "Picklist",
              Options: normalizedOptions
            };

            // Store this for later - we'll create it before the attribute
            (baseDefinition as any)._createGlobalOptionSetFirst = globalOptionSetDefinition;
            (baseDefinition as any)._globalOptionSetNameToLookup = optionSetName;

            // Step 2: Create attribute definition that REFERENCES the global option set
            // The MetadataId binding will be set after creating the global option set
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

        default:
          throw new Error(`Attribute type '${params.attributeType}' is not yet fully implemented. Contact support.`);
      }

      const solutionName = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION || undefined;

      // Check if we need to create a global option set first (two-step process)
      if ((attributeDefinition as any)._createGlobalOptionSetFirst) {
        const globalOptionSetDef = (attributeDefinition as any)._createGlobalOptionSetFirst;
        const optionSetNameToLookup = (attributeDefinition as any)._globalOptionSetNameToLookup;
        delete (attributeDefinition as any)._createGlobalOptionSetFirst; // Clean up marker
        delete (attributeDefinition as any)._globalOptionSetNameToLookup;

        // Step 1: Create the global option set
        await service.createGlobalOptionSet(globalOptionSetDef, solutionName);

        // Step 1.5: Look up the created global option set to get its MetadataId
        const createdGlobalOptionSet = await service.getGlobalOptionSet(optionSetNameToLookup);
        const metadataId = createdGlobalOptionSet.MetadataId;

        // Add the binding to the attribute definition
        (attributeDefinition as any)["GlobalOptionSet@odata.bind"] = `/GlobalOptionSetDefinitions(${metadataId})`;
      }

      // Step 2: Create the attribute (which now references the global option set)
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
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating attribute:", error);

      // Provide helpful guidance for common errors
      let errorMessage = error.message;
      let helpfulGuidance = "";

      // Detect global option set errors
      if (errorMessage.includes("IsGlobal") || errorMessage.includes("0x80048403")) {
        helpfulGuidance = "\n\n🔴 ERROR EXPLANATION: An error occurred while creating the global option set.\n\n" +
          "✅ SOLUTION: This tool creates global option sets in a two-step process:\n" +
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
  "Update an existing attribute on an entity. Supports converting String attributes to AutoNumber by setting autoNumberFormat. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name"),
    attributeLogicalName: z.string().describe("Attribute logical name"),
    displayName: z.string().optional().describe("New display name"),
    description: z.string().optional().describe("New description"),
    requiredLevel: z.enum(["None", "Recommended", "ApplicationRequired"]).optional().describe("Required level"),
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
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

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

      // Handle AutoNumber format conversion
      if (params.autoNumberFormat) {
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

        updates.AutoNumberFormat = params.autoNumberFormat;
      }

      await service.updateAttribute(params.entityLogicalName, params.attributeLogicalName, updates, params.solutionUniqueName);

      let successMessage = `✅ Successfully updated attribute '${params.attributeLogicalName}' on entity '${params.entityLogicalName}'`;

      if (params.autoNumberFormat) {
        successMessage += `\n\n📋 Auto-number format set to: ${params.autoNumberFormat}`;
        successMessage += `\n\n⚠️ NOTE: Converting to AutoNumber is irreversible. The attribute will now auto-generate values based on the format.`;
      }

      successMessage += `\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`;

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
  "Delete an attribute from an entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name"),
    attributeMetadataId: z.string().describe("Attribute MetadataId (GUID)")
  },
  async ({ entityLogicalName, attributeMetadataId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteAttribute(entityLogicalName, attributeMetadataId);

      return {
        content: [{ type: "text", text: `✅ Successfully deleted attribute (${attributeMetadataId}) from entity '${entityLogicalName}'\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting attribute:", error);
      return { content: [{ type: "text", text: `Failed to delete attribute: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-one-to-many-relationship",
  "Create a one-to-many relationship between two entities. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    referencedEntity: z.string().describe("The 'one' side entity (parent)"),
    referencingEntity: z.string().describe("The 'many' side entity (child)"),
    schemaName: z.string().describe("Relationship schema name (e.g., 'sic_account_application')"),
    lookupAttributeSchemaName: z.string().describe("Lookup attribute schema name (e.g., 'sic_accountid')"),
    lookupAttributeDisplayName: z.string().describe("Lookup attribute display name"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const relationshipDefinition = {
        "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        SchemaName: params.schemaName,
        ReferencedEntity: params.referencedEntity,
        ReferencingEntity: params.referencingEntity,
        Lookup: {
          "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
          SchemaName: params.lookupAttributeSchemaName,
          DisplayName: {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.lookupAttributeDisplayName, LanguageCode: 1033 }]
          }
        }
      };

      const solution = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.createOneToManyRelationship(relationshipDefinition, solution);

      return {
        content: [{ type: "text", text: `✅ Successfully created 1:N relationship '${params.schemaName}'\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating relationship:", error);
      return { content: [{ type: "text", text: `Failed to create relationship: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-many-to-many-relationship",
  "Create a many-to-many relationship between two entities. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entity1: z.string().describe("First entity logical name"),
    entity2: z.string().describe("Second entity logical name"),
    schemaName: z.string().describe("Relationship schema name (e.g., 'sic_account_contact')"),
    intersectEntityName: z.string().describe("Intersect entity name (e.g., 'sic_account_contact')"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const relationshipDefinition = {
        "@odata.type": "Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata",
        SchemaName: params.schemaName,
        Entity1LogicalName: params.entity1,
        Entity2LogicalName: params.entity2,
        IntersectEntityName: params.intersectEntityName
      };

      const solution = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.createManyToManyRelationship(relationshipDefinition, solution);

      return {
        content: [{ type: "text", text: `✅ Successfully created N:N relationship '${params.schemaName}'\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating relationship:", error);
      return { content: [{ type: "text", text: `Failed to create relationship: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete-relationship",
  "Delete a relationship. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)")
  },
  async ({ metadataId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteRelationship(metadataId);

      return {
        content: [{ type: "text", text: `✅ Successfully deleted relationship (${metadataId})\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting relationship:", error);
      return { content: [{ type: "text", text: `Failed to delete relationship: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-relationship",
  "Update relationship labels. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)"),
    referencedEntityNavigationPropertyName: z.string().optional().describe("Navigation property name"),
    referencingEntityNavigationPropertyName: z.string().optional().describe("Navigation property name")
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};
      if (params.referencedEntityNavigationPropertyName) updates.ReferencedEntityNavigationPropertyName = params.referencedEntityNavigationPropertyName;
      if (params.referencingEntityNavigationPropertyName) updates.ReferencingEntityNavigationPropertyName = params.referencingEntityNavigationPropertyName;

      await service.updateRelationship(params.metadataId, updates);

      return {
        content: [{ type: "text", text: `✅ Successfully updated relationship (${params.metadataId})\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error updating relationship:", error);
      return { content: [{ type: "text", text: `Failed to update relationship: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-global-optionset-attribute",
  "Create a picklist attribute using an existing global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name"),
    schemaName: z.string().describe("Attribute schema name"),
    displayName: z.string().describe("Attribute display name"),
    globalOptionSetName: z.string().describe("Global option set name to use"),
    description: z.string().optional().describe("Attribute description"),
    requiredLevel: z.enum(["None", "Recommended", "ApplicationRequired"]).optional().describe("Required level (default: None)"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Look up the global option set to get its MetadataId
      const globalOptionSet = await service.getGlobalOptionSet(params.globalOptionSetName);
      const metadataId = globalOptionSet.MetadataId;

      const attributeDefinition = {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        SchemaName: params.schemaName,
        DisplayName: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.displayName, LanguageCode: 1033 }]
        },
        Description: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: params.description || "", LanguageCode: 1033 }]
        },
        RequiredLevel: { Value: params.requiredLevel || "None", CanBeChanged: true },
        "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${metadataId})`
      };

      const solution = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createGlobalOptionSetAttribute(params.entityLogicalName, attributeDefinition, solution);

      return {
        content: [{ type: "text", text: `✅ Successfully created global option set attribute '${params.schemaName}' using '${params.globalOptionSetName}'\n\n⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating global option set attribute:", error);
      return { content: [{ type: "text", text: `Failed to create global option set attribute: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "publish-customizations",
  "Publish all pending customizations in Dynamics 365. This makes all unpublished changes active. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {},
  async () => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.publishAllCustomizations();

      return {
        content: [
          {
            type: "text",
            text: "Successfully published all customizations. All pending changes are now active."
          }
        ]
      };
    } catch (error: any) {
      console.error("Error publishing customizations:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to publish customizations: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "update-global-optionset",
  "Update a global option set in Dynamics 365. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("The MetadataId of the option set"),
    displayName: z.string().optional().describe("New display name"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not provided)")
  },
  async ({ metadataId, displayName, description, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata' };

      if (displayName) {
        updates.DisplayName = {
          LocalizedLabels: [{ Label: displayName, LanguageCode: 1033 }]
        };
      }

      if (description) {
        updates.Description = {
          LocalizedLabels: [{ Label: description, LanguageCode: 1033 }]
        };
      }

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateGlobalOptionSet(metadataId, updates, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated global option set (${metadataId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating global option set:", error);
      return {
        content: [{ type: "text", text: `Failed to update global option set: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "add-optionset-value",
  "Add a new value to a global option set in Dynamics 365. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value (should start with publisher prefix, e.g., 15743xxxx)"),
    label: z.string().describe("The display label for the value"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, value, label, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.addOptionSetValue(optionSetName, value, label, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully added value to option set '${optionSetName}'\n` +
                  `Value: ${value}\n` +
                  `Label: ${label}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error adding option set value:", error);
      return {
        content: [{ type: "text", text: `Failed to add option set value: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update-optionset-value",
  "Update an existing value in a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value to update"),
    label: z.string().describe("The new display label"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, value, label, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateOptionSetValue(optionSetName, value, label, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated value in option set '${optionSetName}'\n` +
                  `Value: ${value}\n` +
                  `New Label: ${label}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating option set value:", error);
      return {
        content: [{ type: "text", text: `Failed to update option set value: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "delete-optionset-value",
  "Delete a value from a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value to delete")
  },
  async ({ optionSetName, value }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteOptionSetValue(optionSetName, value);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deleted value ${value} from option set '${optionSetName}'\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deleting option set value:", error);
      return {
        content: [{ type: "text", text: `Failed to delete option set value: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "reorder-optionset-values",
  "Reorder the values in a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    values: z.array(z.number()).describe("Array of values in the desired order"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, values, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.reorderOptionSetValues(optionSetName, values, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully reordered ${values.length} values in option set '${optionSetName}'\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error reordering option set values:", error);
      return {
        content: [{ type: "text", text: `Failed to reorder option set values: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create-form",
  "Create a new form (Main, QuickCreate, QuickView, Card) for an entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    name: z.string().describe("Form name"),
    entityLogicalName: z.string().describe("Entity logical name"),
    formType: z.enum(["Main", "QuickCreate", "QuickView", "Card"]).describe("Form type"),
    formXml: z.string().describe("Form XML definition"),
    description: z.string().optional().describe("Form description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ name, entityLogicalName, formType, formXml, description, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const typeMap = { Main: 2, QuickCreate: 7, QuickView: 8, Card: 10 };
      const form = {
        name,
        objecttypecode: entityLogicalName,
        type: typeMap[formType as keyof typeof typeMap],
        formxml: formXml,
        description: description || ""
      };

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createForm(form, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created ${formType} form '${name}' for entity '${entityLogicalName}'\n` +
                  `Form ID: ${result.formid}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating form:", error);
      return {
        content: [{ type: "text", text: `Failed to create form: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update-form",
  "Update an existing form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)"),
    name: z.string().optional().describe("New form name"),
    formXml: z.string().optional().describe("New form XML definition"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ formId, name, formXml, description, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};
      if (name) updates.name = name;
      if (formXml) updates.formxml = formXml;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateForm(formId, updates, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated form (${formId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating form:", error);
      return {
        content: [{ type: "text", text: `Failed to update form: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "delete-form",
  "Delete a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteForm(formId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deleted form (${formId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deleting form:", error);
      return {
        content: [{ type: "text", text: `Failed to delete form: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "activate-form",
  "Activate a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.activateForm(formId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully activated form (${formId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error activating form:", error);
      return {
        content: [{ type: "text", text: `Failed to activate form: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "deactivate-form",
  "Deactivate a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deactivateForm(formId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deactivated form (${formId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deactivating form:", error);
      return {
        content: [{ type: "text", text: `Failed to deactivate form: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create-view",
  "Create a new view for an entity using FetchXML. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    name: z.string().describe("View name"),
    entityLogicalName: z.string().describe("Entity logical name"),
    fetchXml: z.string().describe("FetchXML query"),
    layoutXml: z.string().describe("Layout XML (column definitions)"),
    queryType: z.number().optional().describe("Query type (default: 0 for public view)"),
    isDefault: z.boolean().optional().describe("Set as default view"),
    description: z.string().optional().describe("View description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ name, entityLogicalName, fetchXml, layoutXml, queryType, isDefault, description, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const view = {
        name,
        returnedtypecode: entityLogicalName,
        fetchxml: fetchXml,
        layoutxml: layoutXml,
        querytype: queryType || 0,
        isdefault: isDefault || false,
        description: description || ""
      };

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createView(view, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created view '${name}' for entity '${entityLogicalName}'\n` +
                  `View ID: ${result.savedqueryid}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating view:", error);
      return {
        content: [{ type: "text", text: `Failed to create view: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update-view",
  "Update an existing view. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    viewId: z.string().describe("View ID (GUID)"),
    name: z.string().optional().describe("New view name"),
    fetchXml: z.string().optional().describe("New FetchXML query"),
    layoutXml: z.string().optional().describe("New layout XML"),
    isDefault: z.boolean().optional().describe("Set as default view"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ viewId, name, fetchXml, layoutXml, isDefault, description, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};
      if (name) updates.name = name;
      if (fetchXml) updates.fetchxml = fetchXml;
      if (layoutXml) updates.layoutxml = layoutXml;
      if (isDefault !== undefined) updates.isdefault = isDefault;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateView(viewId, updates, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated view (${viewId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating view:", error);
      return {
        content: [{ type: "text", text: `Failed to update view: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "delete-view",
  "Delete a view. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteView(viewId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deleted view (${viewId})\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deleting view:", error);
      return {
        content: [{ type: "text", text: `Failed to delete view: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "set-default-view",
  "Set a view as the default view for its entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.setDefaultView(viewId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully set view (${viewId}) as default\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error setting default view:", error);
      return {
        content: [{ type: "text", text: `Failed to set default view: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create-web-resource",
  "Create a new web resource (JavaScript, CSS, HTML, Image, etc.). Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    name: z.string().describe("Web resource name (must include prefix, e.g., 'prefix_/scripts/file.js')"),
    displayName: z.string().describe("Display name"),
    webResourceType: z.number().describe("Web resource type: 1=HTML, 2=CSS, 3=JavaScript, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=XAP, 9=XSL, 10=ICO"),
    content: z.string().describe("Base64-encoded content"),
    description: z.string().optional().describe("Description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ name, displayName, webResourceType, content, description, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const webResource = {
        name,
        displayname: displayName,
        webresourcetype: webResourceType,
        content,
        description: description || ""
      };

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createWebResource(webResource, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created web resource '${name}'\n` +
                  `Web Resource ID: ${result.webresourceid}\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating web resource:", error);
      return {
        content: [{ type: "text", text: `Failed to create web resource: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update-web-resource",
  "Update an existing web resource. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)"),
    displayName: z.string().optional().describe("Display name"),
    content: z.string().optional().describe("Base64-encoded content"),
    description: z.string().optional().describe("Description"),
    solutionUniqueName: z.string().optional().describe("Solution context")
  },
  async ({ webResourceId, displayName, content, description, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const updates: any = {};
      if (displayName) updates.displayname = displayName;
      if (content) updates.content = content;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateWebResource(webResourceId, updates, solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated web resource '${webResourceId}'\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error updating web resource:", error);
      return {
        content: [{ type: "text", text: `Failed to update web resource: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "delete-web-resource",
  "Delete a web resource. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.deleteWebResource(webResourceId);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully deleted web resource '${webResourceId}'\n\n` +
                  `⚠️ IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error deleting web resource:", error);
      return {
        content: [{ type: "text", text: `Failed to delete web resource: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create-publisher",
  "Create a new solution publisher. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    uniqueName: z.string().describe("Publisher unique name"),
    friendlyName: z.string().describe("Publisher display name"),
    customizationPrefix: z.string().describe("Customization prefix (e.g., 'new')"),
    customizationOptionValuePrefix: z.number().describe("Option value prefix (e.g., 10000)"),
    description: z.string().optional().describe("Publisher description")
  },
  async ({ uniqueName, friendlyName, customizationPrefix, customizationOptionValuePrefix, description }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const publisher = {
        uniquename: uniqueName,
        friendlyname: friendlyName,
        customizationprefix: customizationPrefix,
        customizationoptionvalueprefix: customizationOptionValuePrefix,
        description: description || ""
      };

      const result = await service.createPublisher(publisher);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created publisher '${friendlyName}'\n` +
                  `Unique Name: ${uniqueName}\n` +
                  `Prefix: ${customizationPrefix}\n` +
                  `Option Value Prefix: ${customizationOptionValuePrefix}\n` +
                  `Publisher ID: ${result.publisherid}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating publisher:", error);
      return {
        content: [{ type: "text", text: `Failed to create publisher: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "create-solution",
  "Create a new solution. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    uniqueName: z.string().describe("Solution unique name"),
    friendlyName: z.string().describe("Solution display name"),
    version: z.string().describe("Solution version (e.g., '1.0.0.0')"),
    publisherId: z.string().describe("Publisher ID (GUID)"),
    description: z.string().optional().describe("Solution description")
  },
  async ({ uniqueName, friendlyName, version, publisherId, description }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const solution = {
        uniquename: uniqueName,
        friendlyname: friendlyName,
        version,
        "publisherid@odata.bind": `/publishers(${publisherId})`,
        description: description || ""
      };

      const result = await service.createSolution(solution);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully created solution '${friendlyName}'\n` +
                  `Unique Name: ${uniqueName}\n` +
                  `Version: ${version}\n` +
                  `Solution ID: ${result.solutionid}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error creating solution:", error);
      return {
        content: [{ type: "text", text: `Failed to create solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "add-solution-component",
  "Add a component to a solution. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    solutionUniqueName: z.string().describe("Solution unique name"),
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource"),
    addRequiredComponents: z.boolean().optional().describe("Add required components (default: true)"),
    includedComponentSettingsValues: z.string().optional().describe("Component settings values")
  },
  async ({ solutionUniqueName, componentId, componentType, addRequiredComponents, includedComponentSettingsValues }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.addComponentToSolution(
        solutionUniqueName,
        componentId,
        componentType,
        addRequiredComponents ?? true,
        includedComponentSettingsValues
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully added component '${componentId}' (type: ${componentType}) to solution '${solutionUniqueName}'`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error adding component to solution:", error);
      return {
        content: [{ type: "text", text: `Failed to add component to solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "remove-solution-component",
  "Remove a component from a solution. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    solutionUniqueName: z.string().describe("Solution unique name"),
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ solutionUniqueName, componentId, componentType }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.removeComponentFromSolution(solutionUniqueName, componentId, componentType);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully removed component '${componentId}' (type: ${componentType}) from solution '${solutionUniqueName}'`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error removing component from solution:", error);
      return {
        content: [{ type: "text", text: `Failed to remove component from solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "export-solution",
  "Export a solution as a zip file. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    solutionName: z.string().describe("Solution unique name"),
    managed: z.boolean().optional().describe("Export as managed solution (default: false)")
  },
  async ({ solutionName, managed }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const result = await service.exportSolution(solutionName, managed ?? false);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully exported solution '${solutionName}' as ${managed ? 'managed' : 'unmanaged'}\n\n` +
                  `Export File (Base64): ${result.ExportSolutionFile.substring(0, 100)}...`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error exporting solution:", error);
      return {
        content: [{ type: "text", text: `Failed to export solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "import-solution",
  "Import a solution from a base64-encoded zip file. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    customizationFile: z.string().describe("Base64-encoded solution zip file"),
    publishWorkflows: z.boolean().optional().describe("Publish workflows after import (default: true)"),
    overwriteUnmanagedCustomizations: z.boolean().optional().describe("Overwrite unmanaged customizations (default: false)")
  },
  async ({ customizationFile, publishWorkflows, overwriteUnmanagedCustomizations }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const result = await service.importSolution(
        customizationFile,
        publishWorkflows ?? true,
        overwriteUnmanagedCustomizations ?? false
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully initiated solution import\n` +
                  `Import Job ID: ${result.ImportJobId}\n\n` +
                  `⚠️ NOTE: Solution import is asynchronous. Monitor the import job for completion status.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error importing solution:", error);
      return {
        content: [{ type: "text", text: `Failed to import solution: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "publish-entity",
  "Publish all customizations for a specific entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name to publish")
  },
  async ({ entityLogicalName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      await service.publishEntity(entityLogicalName);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully published entity '${entityLogicalName}'\n\n` +
                  `All customizations for this entity are now active in the environment.`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error publishing entity:", error);
      return {
        content: [{ type: "text", text: `Failed to publish entity: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ============================================================
// PLUGIN DEPLOYMENT TOOLS
// ============================================================

server.tool(
  "create-plugin-assembly",
  "Upload a compiled plugin DLL to Dynamics 365 from local file system. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    assemblyPath: z.string().describe(
      "Local file path to compiled DLL (e.g., C:\\Dev\\MyPlugin\\bin\\Release\\net462\\MyPlugin.dll)"
    ),
    assemblyName: z.string().describe("Friendly name for the assembly (e.g., MyPlugin)"),
    version: z.string().optional().describe("Version string (auto-extracted if omitted, e.g., '1.0.0.0')"),
    isolationMode: z.number().optional().describe("Isolation mode: 2=Sandbox (default, required for production)"),
    description: z.string().optional().describe("Assembly description"),
    solutionUniqueName: z.string().optional().describe("Solution to add assembly to"),
  },
  async ({ assemblyPath, assemblyName, version, isolationMode, description, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Read DLL file from file system (Windows or WSL compatible)
      const fs = await import('fs/promises');
      const normalizedPath = assemblyPath.replace(/\\/g, '/'); // Normalize path
      const dllBuffer = await fs.readFile(normalizedPath);
      const dllBase64 = dllBuffer.toString('base64');

      // Validate DLL format (check for "MZ" header - .NET assembly signature)
      const header = dllBuffer.toString('utf8', 0, 2);
      if (header !== 'MZ') {
        throw new Error('Invalid .NET assembly format (missing MZ header)');
      }

      // Extract version if not provided
      const extractedVersion = version || await service.extractAssemblyVersion(assemblyPath);

      // Upload assembly
      const result = await service.createPluginAssembly({
        name: assemblyName,
        content: dllBase64,
        version: extractedVersion,
        isolationMode: isolationMode ?? 2, // Default to Sandbox for security
        description,
        solutionUniqueName: solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
      });

      return {
        content: [{
          type: "text",
          text: `✅ Plugin assembly '${assemblyName}' uploaded successfully\n\n` +
                `📦 Assembly ID: ${result.pluginAssemblyId}\n` +
                `🔢 Version: ${extractedVersion}\n` +
                `💾 Size: ${(dllBuffer.length / 1024).toFixed(2)} KB\n` +
                `🔌 Plugin Types Created: ${result.pluginTypes.length}\n\n` +
                `Plugin Types:\n${result.pluginTypes.map(t => `  • ${t.typeName} (${t.pluginTypeId})`).join('\n') || '  (none created yet - check System Jobs)'}`
        }]
      };
    } catch (error: any) {
      console.error("Error creating plugin assembly:", error);
      return {
        content: [{ type: "text", text: `❌ Failed to create plugin assembly: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "update-plugin-assembly",
  "Update an existing plugin assembly with new compiled DLL. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    assemblyId: z.string().describe("Assembly ID (GUID)"),
    assemblyPath: z.string().describe("Local file path to new compiled DLL"),
    version: z.string().optional().describe("Version string (auto-extracted if omitted)"),
    solutionUniqueName: z.string().optional().describe("Solution context"),
  },
  async ({ assemblyId, assemblyPath, version, solutionUniqueName }: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Read new DLL
      const fs = await import('fs/promises');
      const normalizedPath = assemblyPath.replace(/\\/g, '/');
      const dllBuffer = await fs.readFile(normalizedPath);
      const dllBase64 = dllBuffer.toString('base64');

      // Extract version if not provided
      const extractedVersion = version || await service.extractAssemblyVersion(assemblyPath);

      // Update assembly
      await service.updatePluginAssembly(
        assemblyId,
        dllBase64,
        extractedVersion,
        solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION
      );

      return {
        content: [{
          type: "text",
          text: `✅ Plugin assembly updated successfully\n\n` +
                `📦 Assembly ID: ${assemblyId}\n` +
                `🔢 Version: ${extractedVersion}\n` +
                `💾 Size: ${(dllBuffer.length / 1024).toFixed(2)} KB\n\n` +
                `⚠️ Note: Existing plugin steps remain registered and active.`
        }]
      };
    } catch (error: any) {
      console.error("Error updating plugin assembly:", error);
      return {
        content: [{ type: "text", text: `❌ Failed to update plugin assembly: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "register-plugin-step",
  "Register a plugin step on an SDK message. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    assemblyName: z.string().describe("Assembly name (e.g., MyPlugin)"),
    pluginTypeName: z.string().describe("Full type name (e.g., MyOrg.Plugins.ContactPlugin)"),
    stepName: z.string().describe("Friendly step name (e.g., 'Contact: Update - Post-Operation')"),
    messageName: z.string().describe("SDK message: Create, Update, Delete, SetState, etc."),
    primaryEntity: z.string().describe("Entity logical name (e.g., contact, account)"),
    stage: z.enum(['PreValidation', 'PreOperation', 'PostOperation']).describe("Execution stage"),
    executionMode: z.enum(['Sync', 'Async']).describe("Execution mode"),
    rank: z.number().optional().describe("Execution order (default: 1, lower runs first)"),
    filteringAttributes: z.array(z.string()).optional().describe("Fields to monitor (e.g., ['firstname', 'lastname'])"),
    configuration: z.string().optional().describe("Secure/unsecure config JSON"),
    solutionUniqueName: z.string().optional(),
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      // Resolve plugin type ID by typename
      const pluginTypeId = await service.queryPluginTypeByTypename(params.pluginTypeName);

      // Map stage and mode enums to numbers
      const stageMap: Record<string, number> = {
        PreValidation: 10,
        PreOperation: 20,
        PostOperation: 40
      };
      const modeMap: Record<string, number> = { Sync: 0, Async: 1 };

      // Register step
      const result = await service.registerPluginStep({
        pluginTypeId,
        name: params.stepName,
        messageName: params.messageName,
        primaryEntityName: params.primaryEntity,
        stage: stageMap[params.stage],
        executionMode: modeMap[params.executionMode],
        rank: params.rank ?? 1,
        filteringAttributes: params.filteringAttributes?.join(','),
        configuration: params.configuration,
        solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
      });

      return {
        content: [{
          type: "text",
          text: `✅ Plugin step '${params.stepName}' registered successfully\n\n` +
                `🆔 Step ID: ${result.stepId}\n` +
                `📨 Message: ${params.messageName}\n` +
                `📊 Entity: ${params.primaryEntity}\n` +
                `⏱️ Stage: ${params.stage}\n` +
                `🔄 Mode: ${params.executionMode}\n` +
                `📋 Rank: ${params.rank ?? 1}\n` +
                (params.filteringAttributes?.length ? `🔍 Filtering: ${params.filteringAttributes.join(', ')}\n` : '')
        }]
      };
    } catch (error: any) {
      console.error("Error registering plugin step:", error);
      return {
        content: [{ type: "text", text: `❌ Failed to register plugin step: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "register-plugin-image",
  "Add a pre/post image to a plugin step for accessing entity data. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    stepId: z.string().describe("Plugin step ID (from register-plugin-step)"),
    imageName: z.string().describe("Image name (e.g., 'PreImage', 'PostImage')"),
    imageType: z.enum(['PreImage', 'PostImage', 'Both']).describe("Image type"),
    entityAlias: z.string().describe("Alias for code access (e.g., 'target', 'preimage')"),
    attributes: z.array(z.string()).optional().describe("Attributes to include (empty = all)"),
    messagePropertyName: z.string().optional().describe("Message property (default: 'Target')"),
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const imageTypeMap: Record<string, number> = { PreImage: 0, PostImage: 1, Both: 2 };

      const result = await service.registerPluginImage({
        stepId: params.stepId,
        name: params.imageName,
        imageType: imageTypeMap[params.imageType],
        entityAlias: params.entityAlias,
        attributes: params.attributes?.join(','),
        messagePropertyName: params.messagePropertyName || 'Target',
      });

      return {
        content: [{
          type: "text",
          text: `✅ Plugin image '${params.imageName}' registered successfully\n\n` +
                `🆔 Image ID: ${result.imageId}\n` +
                `🖼️ Type: ${params.imageType}\n` +
                `🏷️ Alias: ${params.entityAlias}\n` +
                `📋 Attributes: ${params.attributes?.length ? params.attributes.join(', ') : 'All attributes'}`
        }]
      };
    } catch (error: any) {
      console.error("Error registering plugin image:", error);
      return {
        content: [{ type: "text", text: `❌ Failed to register plugin image: ${error.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "deploy-plugin-complete",
  "End-to-end plugin deployment: upload DLL, register steps, configure images, and publish. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    assemblyPath: z.string().describe("Local DLL file path"),
    assemblyName: z.string().describe("Assembly name"),
    stepConfigurations: z.array(z.object({
      pluginTypeName: z.string(),
      stepName: z.string(),
      messageName: z.string(),
      primaryEntity: z.string(),
      stage: z.enum(['PreValidation', 'PreOperation', 'PostOperation']),
      executionMode: z.enum(['Sync', 'Async']),
      rank: z.number().optional(),
      filteringAttributes: z.array(z.string()).optional(),
      preImage: z.object({
        name: z.string(),
        alias: z.string(),
        attributes: z.array(z.string()).optional(),
      }).optional(),
      postImage: z.object({
        name: z.string(),
        alias: z.string(),
        attributes: z.array(z.string()).optional(),
      }).optional(),
    })).optional().describe("Step configurations (manual registration)"),
    solutionUniqueName: z.string().optional(),
    replaceExisting: z.boolean().optional().describe("Update existing assembly vs. create new"),
  },
  async (params: any) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const summary: any = {
        phases: {
          deploy: {},
          register: { stepsCreated: 0, imagesCreated: 0 },
        },
      };

      // Read DLL file
      const fs = await import('fs/promises');
      const normalizedPath = params.assemblyPath.replace(/\\/g, '/');
      const dllBuffer = await fs.readFile(normalizedPath);
      const dllBase64 = dllBuffer.toString('base64');
      const version = await service.extractAssemblyVersion(params.assemblyPath);

      // Phase 1: Deploy assembly
      if (params.replaceExisting) {
        // Find existing assembly ID
        const assemblyId = await service.queryPluginAssemblyByName(params.assemblyName);
        if (assemblyId) {
          await service.updatePluginAssembly(
            assemblyId,
            dllBase64,
            version,
            params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION
          );
          summary.phases.deploy = {
            action: 'updated',
            assemblyId: assemblyId,
            version,
          };
        } else {
          throw new Error(`Assembly '${params.assemblyName}' not found for update`);
        }
      } else {
        const uploadResult = await service.createPluginAssembly({
          name: params.assemblyName,
          content: dllBase64,
          version,
          solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
        });
        summary.phases.deploy = {
          action: 'created',
          assemblyId: uploadResult.pluginAssemblyId,
          version,
          pluginTypes: uploadResult.pluginTypes,
        };
      }

      // Phase 2: Register steps
      if (params.stepConfigurations) {
        const stageMap: Record<string, number> = {
          PreValidation: 10,
          PreOperation: 20,
          PostOperation: 40
        };
        const modeMap: Record<string, number> = { Sync: 0, Async: 1 };

        for (const stepConfig of params.stepConfigurations) {
          // Resolve plugin type ID
          const pluginTypeId = await service.queryPluginTypeByTypename(stepConfig.pluginTypeName);

          // Register step
          const stepResult = await service.registerPluginStep({
            pluginTypeId: pluginTypeId,
            name: stepConfig.stepName,
            messageName: stepConfig.messageName,
            primaryEntityName: stepConfig.primaryEntity,
            stage: stageMap[stepConfig.stage],
            executionMode: modeMap[stepConfig.executionMode],
            rank: stepConfig.rank ?? 1,
            filteringAttributes: stepConfig.filteringAttributes?.join(','),
            solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
          });
          summary.phases.register.stepsCreated++;

          // Register pre-image
          if (stepConfig.preImage) {
            await service.registerPluginImage({
              stepId: stepResult.stepId,
              name: stepConfig.preImage.name,
              imageType: 0,
              entityAlias: stepConfig.preImage.alias,
              attributes: stepConfig.preImage.attributes?.join(','),
            });
            summary.phases.register.imagesCreated++;
          }

          // Register post-image
          if (stepConfig.postImage) {
            await service.registerPluginImage({
              stepId: stepResult.stepId,
              name: stepConfig.postImage.name,
              imageType: 1,
              entityAlias: stepConfig.postImage.alias,
              attributes: stepConfig.postImage.attributes?.join(','),
            });
            summary.phases.register.imagesCreated++;
          }
        }
      }

      // Phase 3: Publish customizations
      await service.publishAllCustomizations();
      summary.phases.publish = { success: true };

      return {
        content: [{
          type: "text",
          text: `✅ Plugin deployment completed successfully!\n\n` +
                `📦 Assembly: ${summary.phases.deploy.action === 'created' ? 'Created' : 'Updated'}\n` +
                `🆔 Assembly ID: ${summary.phases.deploy.assemblyId}\n` +
                `🔢 Version: ${summary.phases.deploy.version}\n` +
                `💾 Size: ${(dllBuffer.length / 1024).toFixed(2)} KB\n` +
                (summary.phases.deploy.pluginTypes ? `🔌 Plugin Types: ${summary.phases.deploy.pluginTypes.length}\n` : '') +
                `📝 Steps Created: ${summary.phases.register.stepsCreated}\n` +
                `🖼️ Images Created: ${summary.phases.register.imagesCreated}\n` +
                `📢 Published: ${summary.phases.publish.success ? 'Yes' : 'No'}\n\n` +
                `⚡ Deployment is complete and active in the environment!`
        }]
      };
    } catch (error: any) {
      console.error("Error deploying plugin:", error);
      return {
        content: [{ type: "text", text: `❌ Failed to deploy plugin: ${error.message}` }],
        isError: true
      };
    }
  }
);

  console.error(`✅ powerplatform-customization tools registered (${45} tools)`);
}

// CLI entry point (standalone execution)
// Uses realpathSync to resolve symlinks created by npx
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: '@mcp-consultant-tools/powerplatform-customization',
    version: '1.0.0',
    capabilities: { tools: {}, prompts: {} }
  });

  registerPowerplatformCustomizationTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start powerplatform-customization MCP server:', error);
    process.exit(1);
  });

  console.error('powerplatform-customization MCP server running');
}
