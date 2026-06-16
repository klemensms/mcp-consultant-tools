/**
 * Relationship Tools - 4 tools for entity relationships
 *
 * Tools: create-o2m-rel, create-m2m-rel, delete-relationship, update-relationship
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, SOLUTION_NAME_EXAMPLES } from '../tool-examples.js';

export function registerRelationshipTools(server: any, ctx: ServiceContext): void {

server.tool(
  "create-o2m-rel",
  "Create a one-to-many (1:N) relationship between two entities. Creates a lookup column on the child entity. Requires publish-customizations afterwards.",
  {
    referencedEntity: z.string().describe(
      descWithExamples("The 'one' side entity (parent)", ENTITY_NAME_EXAMPLES)
    ),
    referencingEntity: z.string().describe(
      descWithExamples("The 'many' side entity (child)", ENTITY_NAME_EXAMPLES)
    ),
    schemaName: z.string().describe("Relationship schema name (e.g., 'new_account_application')"),
    lookupAttributeSchemaName: z.string().describe("Lookup attribute schema name on the child entity (e.g., 'new_accountid')"),
    lookupAttributeDisplayName: z.string().describe("Lookup attribute display name (e.g., 'Account')"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to", SOLUTION_NAME_EXAMPLES)
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async (params: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

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
        content: [{ type: "text", text: `Successfully created 1:N relationship '${params.schemaName}'\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating relationship:", error);
      return { content: [{ type: "text", text: `Failed to create relationship: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-m2m-rel",
  "Create a many-to-many (N:N) relationship between two entities. Creates an intersect table. Requires publish-customizations afterwards.",
  {
    entity1: z.string().describe(
      descWithExamples("First entity logical name", ENTITY_NAME_EXAMPLES)
    ),
    entity2: z.string().describe(
      descWithExamples("Second entity logical name", ENTITY_NAME_EXAMPLES)
    ),
    schemaName: z.string().describe("Relationship schema name (e.g., 'new_account_contact')"),
    intersectEntityName: z.string().describe("Intersect entity name (e.g., 'new_account_contact')"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to", SOLUTION_NAME_EXAMPLES)
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async (params: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

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
        content: [{ type: "text", text: `Successfully created N:N relationship '${params.schemaName}'\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error creating relationship:", error);
      return { content: [{ type: "text", text: `Failed to create relationship: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete-relationship",
  "Delete a relationship. WARNING: Use check-delete-eligibility (read-only package) first to verify safe deletion. This removes the lookup column and all association data.",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID). Get from get-entity-relationships in the read-only package.")
  },
  { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  async ({ metadataId }: any) => {
    try {
      const service = ctx.pp;

      await service.deleteRelationship(metadataId);

      return {
        content: [{ type: "text", text: `Successfully deleted relationship (${metadataId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error deleting relationship:", error);
      return { content: [{ type: "text", text: `Failed to delete relationship: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-relationship",
  "Update relationship labels.",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)"),
    referencedEntityNavigationPropertyName: z.string().optional().describe("Navigation property name"),
    referencingEntityNavigationPropertyName: z.string().optional().describe("Navigation property name")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async (params: any) => {
    try {
      const service = ctx.pp;

      const updates: any = {};
      if (params.referencedEntityNavigationPropertyName) updates.ReferencedEntityNavigationPropertyName = params.referencedEntityNavigationPropertyName;
      if (params.referencingEntityNavigationPropertyName) updates.ReferencingEntityNavigationPropertyName = params.referencingEntityNavigationPropertyName;

      await service.updateRelationship(params.metadataId, updates);

      return {
        content: [{ type: "text", text: `Successfully updated relationship (${params.metadataId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.` }]
      };
    } catch (error: any) {
      console.error("Error updating relationship:", error);
      return { content: [{ type: "text", text: `Failed to update relationship: ${error.message}` }], isError: true };
    }
  }
);

}
