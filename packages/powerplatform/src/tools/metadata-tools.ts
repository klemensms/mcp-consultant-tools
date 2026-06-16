/**
 * Metadata Tools - 5 tools for entity metadata inspection
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, ATTRIBUTE_TYPE_EXAMPLES } from '../tool-examples.js';

export function registerMetadataTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-entity-metadata",
    "Get metadata for a Dataverse entity including display name, ownership type, primary key/name fields, entity set name, and change tracking status. Returns schema info needed before querying or customizing the entity.",
    {
      entityName: z.string().describe(
        descWithExamples("The logical name of the entity", ENTITY_NAME_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityName }: any) => {
      try {
        const service = ctx.pp;
        const metadata = await service.getEntityMetadata(entityName);
        const metadataStr = JSON.stringify(metadata, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Entity metadata for '${entityName}':\n\n${metadataStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity metadata:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity metadata: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-entity-attributes",
    "Get attributes/fields of a PowerPlatform entity. Use filtering options to reduce response size for large entities. Returns { attributes, returnedCount, totalBeforeFilter, hasMore }.",
    {
      entityName: z.string().describe(
        descWithExamples("The logical name of the entity", ENTITY_NAME_EXAMPLES)
      ),
      prefix: z.string().optional().describe("Filter attributes by schema name prefix (e.g., 'si_' to get only custom columns)"),
      attributeType: z.enum(['String', 'Integer', 'Boolean', 'DateTime', 'Decimal', 'Double', 'Money', 'Lookup', 'Picklist', 'State', 'Status', 'Uniqueidentifier', 'Memo', 'BigInt', 'Owner', 'Customer', 'PartyList']).optional().describe(
        descWithExamples("Filter by attribute type", ATTRIBUTE_TYPE_EXAMPLES)
      ),
      maxAttributes: z.number().optional().describe("Maximum number of attributes to return (omit for all)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityName, prefix, attributeType, maxAttributes }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getEntityAttributes(entityName, {
          prefix,
          attributeType,
          maxAttributes
        });

        const attributesStr = JSON.stringify(result, null, 2);

        let message = `Attributes for entity '${entityName}' (${result.returnedCount} returned)`;
        if (prefix) {
          message += `\nFiltered by prefix: ${prefix}`;
        }
        if (attributeType) {
          message += `\nFiltered by type: ${attributeType}`;
        }
        if (result.hasMore) {
          message += `\n⚠️ More attributes available - ${result.totalBeforeFilter} total before limit`;
        }

        return {
          content: [
            {
              type: "text",
              text: `${message}:\n\n${attributesStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity attributes:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity attributes: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-entity-attribute",
    "Get a specific attribute/field of a PowerPlatform entity including type, display name, required level, and option set values if applicable.",
    {
      entityName: z.string().describe(
        descWithExamples("The logical name of the entity", ENTITY_NAME_EXAMPLES)
      ),
      attributeName: z.string().describe("The logical name of the attribute (e.g., 'emailaddress1', 'new_customfield')")
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityName, attributeName }: any) => {
      try {
        const service = ctx.pp;
        const attribute = await service.getEntityAttribute(entityName, attributeName);
        const attributeStr = JSON.stringify(attribute, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Attribute '${attributeName}' for entity '${entityName}':\n\n${attributeStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity attribute:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity attribute: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-entity-relationships",
    "Returns both one-to-many and many-to-many relationships for a Dataverse entity, including referenced/referencing entity, lookup field names, and cascade behaviors.",
    {
      entityName: z.string().describe(
        descWithExamples("The logical name of the entity", ENTITY_NAME_EXAMPLES)
      ),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ entityName }: any) => {
      try {
        const service = ctx.pp;
        const relationships = await service.getEntityRelationships(entityName);
        const relationshipsStr = JSON.stringify(relationships, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Relationships for entity '${entityName}':\n\n${relationshipsStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity relationships:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get entity relationships: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get-global-option-set",
    "Get a global option set by name. Returns all options with integer values and labels. Use to look up valid values before creating/updating records.",
    {
      optionSetName: z.string().describe("The name of the global option set (e.g., 'new_applicationstatus', 'budgetamount')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ optionSetName }: any) => {
      try {
        const service = ctx.pp;
        const optionSet = await service.getGlobalOptionSet(optionSetName);
        const optionSetStr = JSON.stringify(optionSet, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `Global option set '${optionSetName}':\n\n${optionSetStr}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting global option set:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to get global option set: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
