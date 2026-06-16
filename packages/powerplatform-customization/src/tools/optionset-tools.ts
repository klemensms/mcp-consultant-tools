/**
 * Option Set Tools - 6 tools for option set and publish management
 *
 * Tools: update-global-optionset, add-optionset-value, update-optionset-value,
 *        delete-optionset-value, reorder-optionset-values, publish-customizations
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, SOLUTION_NAME_EXAMPLES } from '../tool-examples.js';

export function registerOptionSetTools(server: any, ctx: ServiceContext): void {

server.tool(
  "update-global-optionset",
  "Update a global option set display name or description. Requires publish-customizations afterwards.",
  {
    metadataId: z.string().describe("The MetadataId of the option set (GUID). Get from get-global-option-set in the read-only package."),
    displayName: z.string().optional().describe("New display name"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not provided)", SOLUTION_NAME_EXAMPLES)
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ metadataId, displayName, description, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

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
            text: `Successfully updated global option set (${metadataId})\n\n` +
                  `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
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
  "Add a new value to a global option set. Requires publish-customizations afterwards.",
  {
    optionSetName: z.string().describe("The name of the option set (e.g., 'new_applicationstatus')"),
    value: z.number().describe("The numeric value. Use publisher-prefix range (e.g., 157430000 for prefix 15743)"),
    label: z.string().describe("The display label for the value (e.g., 'In Review')"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to", SOLUTION_NAME_EXAMPLES)
    )
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ optionSetName, value, label, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.addOptionSetValue(optionSetName, value, label, solution);

      return {
        content: [
          {
            type: "text",
            text: `Successfully added value to option set '${optionSetName}'\n` +
                  `Value: ${value}\n` +
                  `Label: ${label}\n\n` +
                  `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
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
  "Update an existing value in a global option set.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value to update"),
    label: z.string().describe("The new display label"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ optionSetName, value, label, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateOptionSetValue(optionSetName, value, label, solution);

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated value in option set '${optionSetName}'\n` +
                  `Value: ${value}\n` +
                  `New Label: ${label}\n\n` +
                  `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
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
  "Delete a value from a global option set. WARNING: Existing records using this value will lose their display label. Requires publish-customizations afterwards.",
  {
    optionSetName: z.string().describe("The name of the option set (e.g., 'new_applicationstatus')"),
    value: z.number().describe("The numeric value to delete (e.g., 157430002)")
  },
  { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  async ({ optionSetName, value }: any) => {
    try {
      const service = ctx.pp;

      await service.deleteOptionSetValue(optionSetName, value);

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted value ${value} from option set '${optionSetName}'\n\n` +
                  `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
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
  "Reorder the values in a global option set.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    values: z.array(z.number()).describe("Array of values in the desired order"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ optionSetName, values, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.reorderOptionSetValues(optionSetName, values, solution);

      return {
        content: [
          {
            type: "text",
            text: `Successfully reordered ${values.length} values in option set '${optionSetName}'\n\n` +
                  `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
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
  "publish-customizations",
  "Publish all pending customizations in Dynamics 365. This makes all unpublished changes active.",
  {},
  // Publishes pending changes (makes them active) — mutates the env, not destructive.
  { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async () => {
    try {
      const service = ctx.pp;

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

}
