/**
 * Entity Tools - 4 tools for entity (table) management
 *
 * Tools: create-entity, update-entity, update-entity-icon, delete-entity
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, OWNERSHIP_TYPE_EXAMPLES, SOLUTION_NAME_EXAMPLES } from '../tool-examples.js';

export function registerEntityTools(server: any, ctx: ServiceContext): void {

server.tool(
  "create-entity",
  "Create a new custom entity (table) in Dynamics 365 / PowerPlatform. Requires publish-customizations afterwards.",
  {
    schemaName: z.string().describe(
      descWithExamples(
        "Schema name with publisher prefix (must be unique in environment)",
        ENTITY_NAME_EXAMPLES.filter(e => e.label === "Custom entity")
      )
    ),
    displayName: z.string().describe("The display name of the entity (e.g., 'Application')"),
    pluralDisplayName: z.string().describe("The plural display name (e.g., 'Applications')"),
    description: z.string().describe("Description of the entity"),
    ownershipType: z.enum(["UserOwned", "TeamOwned", "OrganizationOwned"]).describe(
      descWithExamples("Ownership type", OWNERSHIP_TYPE_EXAMPLES)
    ),
    hasActivities: z.boolean().optional().describe("Enable activities (default: false)"),
    hasNotes: z.boolean().optional().describe("Enable notes (default: false)"),
    isAuditEnabled: z.boolean().optional().describe(
      "Enable auditing for this entity — tracks record-level changes (default: false)"
    ),
    changeTrackingEnabled: z.boolean().optional().describe(
      "Enable change tracking for data sync scenarios like Azure Synapse Link (default: false)"
    ),
    isDuplicateDetectionEnabled: z.boolean().optional().describe(
      "Enable duplicate detection rules for this entity (default: false)"
    ),
    isActivityParty: z.boolean().optional().describe("Can be a party in activities (default: false)"),
    primaryAttributeSchemaName: z.string().optional().describe("Schema name for primary attribute (default: 'name')"),
    primaryAttributeDisplayName: z.string().optional().describe("Display name for primary attribute (default: 'Name')"),
    primaryAttributeMaxLength: z.number().optional().describe("Max length for primary attribute (default: 850)"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples(
        "Solution to add entity to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not specified)",
        SOLUTION_NAME_EXAMPLES
      )
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async (params: any) => {
    try {
      const service = ctx.pp;

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
        IsAuditEnabled: { Value: params.isAuditEnabled || false, CanBeChanged: true },
        ChangeTrackingEnabled: params.changeTrackingEnabled || false,
        IsDuplicateDetectionEnabled: { Value: params.isDuplicateDetectionEnabled || false, CanBeChanged: true },
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

      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
      const solutionName = params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION || undefined;
      const result = await service.createEntity(entityDefinition, solutionName);

      return {
        content: [
          {
            type: "text",
            text: `Successfully created entity '${params.schemaName}'.\n\n` +
                  `Details:\n${JSON.stringify(result, null, 2)}\n\n` +
                  `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
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
  "Update an existing custom entity. Requires publish-customizations afterwards.",
  {
    metadataId: z.string().describe("The MetadataId of the entity (GUID). Get from get-entity-metadata in the read-only package."),
    displayName: z.string().optional().describe("New display name"),
    pluralDisplayName: z.string().optional().describe("New plural display name"),
    description: z.string().optional().describe("New description"),
    hasActivities: z.boolean().optional().describe("Enable/disable activities"),
    hasNotes: z.boolean().optional().describe("Enable/disable notes"),
    isAuditEnabled: z.boolean().optional().describe(
      "Enable/disable auditing for this entity"
    ),
    changeTrackingEnabled: z.boolean().optional().describe(
      "Enable/disable change tracking for data sync"
    ),
    isDuplicateDetectionEnabled: z.boolean().optional().describe(
      "Enable/disable duplicate detection rules"
    ),
    solutionUniqueName: z.string().optional().describe("Solution context")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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
      if (params.isAuditEnabled !== undefined) {
        updates.IsAuditEnabled = { Value: params.isAuditEnabled, CanBeChanged: true };
      }
      if (params.changeTrackingEnabled !== undefined) {
        updates.ChangeTrackingEnabled = params.changeTrackingEnabled;
      }
      if (params.isDuplicateDetectionEnabled !== undefined) {
        updates.IsDuplicateDetectionEnabled = { Value: params.isDuplicateDetectionEnabled, CanBeChanged: true };
      }

      await service.updateEntity(params.metadataId, updates, params.solutionUniqueName);

      return {
        content: [{ type: "text", text: `Successfully updated entity (${params.metadataId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error updating entity:", error);
      return { content: [{ type: "text", text: `Failed to update entity: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-entity-icon",
  "Update entity icon using Fluent UI System Icons from Microsoft's official icon library. Creates a web resource and sets it as the entity icon.",
  {
    entityLogicalName: z.string().describe("The logical name of the entity (e.g., 'new_strikeaction')"),
    iconFileName: z.string().describe("Fluent UI icon file name (e.g., 'people_community_24_filled.svg'). Browse icons at: https://github.com/microsoft/fluentui-system-icons"),
    solutionUniqueName: z.string().optional().describe("Solution to add the web resource to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not specified)")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async (params: any) => {
    try {
      const service = ctx.pp;

      const result = await service.updateEntityIcon(
        params.entityLogicalName,
        params.iconFileName,
        params.solutionUniqueName
      ) as any;

      const message = `Successfully updated entity icon

**Entity:** ${result.entityLogicalName} (${result.entitySchemaName})
**Icon:** ${result.iconFileName}
**Web Resource:** ${result.webResourceName}
**Web Resource ID:** ${result.webResourceId}
**Icon Vector Name:** ${result.iconVectorName}

**Published:** The icon has been automatically published and should now be visible in the UI.

TIP: Browse available Fluent UI icons at https://github.com/microsoft/fluentui-system-icons`;

      return {
        content: [{ type: "text", text: message }]
      };
    } catch (error: any) {
      console.error("Error updating entity icon:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to update entity icon: ${error.message}\n\nMake sure the icon file name is valid (e.g., 'people_community_24_filled.svg'). Browse available icons at https://github.com/microsoft/fluentui-system-icons`
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "delete-entity",
  "Delete a custom entity. WARNING: Use check-delete-eligibility (read-only package) first to verify safe deletion. This is irreversible.",
  {
    metadataId: z.string().describe("The MetadataId of the entity to delete (GUID). Get from get-entity-metadata.")
  },
  { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  async ({ metadataId }: any) => {
    try {
      const service = ctx.pp;

      await service.deleteEntity(metadataId);

      return {
        content: [{ type: "text", text: `Successfully deleted entity (${metadataId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting entity:", error);
      return { content: [{ type: "text", text: `Failed to delete entity: ${error.message}` }], isError: true };
    }
  }
);

}
