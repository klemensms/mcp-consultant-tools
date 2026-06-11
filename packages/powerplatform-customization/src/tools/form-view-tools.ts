/**
 * Form & View Tools - 9 tools for form and view management
 *
 * Tools: create-form, update-form, delete-form, activate-form, deactivate-form,
 *        create-view, update-view, delete-view, set-default-view
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, SOLUTION_NAME_EXAMPLES } from '../tool-examples.js';

export function registerFormViewTools(server: any, ctx: ServiceContext): void {

server.tool(
  "create-form",
  "Create a new form (Main, QuickCreate, QuickView, Card) for an entity. Use get-forms (read-only package) to inspect existing forms for XML structure reference. Requires publish-customizations afterwards.",
  {
    name: z.string().describe("Form name (e.g., 'Main Form', 'Quick Create')"),
    entityLogicalName: z.string().describe(
      descWithExamples("Entity logical name", ENTITY_NAME_EXAMPLES)
    ),
    formType: z.enum(["Main", "QuickCreate", "QuickView", "Card"]).describe("Form type. Main=full edit form, QuickCreate=minimal create form, QuickView=read-only embedded, Card=card layout"),
    formXml: z.string().describe("Form XML definition. Get structure examples from existing forms using get-forms (read-only package)."),
    description: z.string().optional().describe("Form description"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to", SOLUTION_NAME_EXAMPLES)
    )
  },
  async ({ name, entityLogicalName, formType, formXml, description, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createForm(
        name, entityLogicalName, formType, formXml,
        { description, solutionUniqueName: solution }
      ) as any;

      return {
        content: [{
          type: "text",
          text: `Successfully created ${formType} form '${name}' for entity '${entityLogicalName}'\n` +
                `Form ID: ${result.formid}\n\n` +
                `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error creating form:", error);
      return { content: [{ type: "text", text: `Failed to create form: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-form",
  "Update an existing form.",
  {
    formId: z.string().describe("Form ID (GUID)"),
    name: z.string().optional().describe("New form name"),
    formXml: z.string().optional().describe("New form XML definition"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ formId, name, formXml, description, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

      const updates: any = {};
      if (name) updates.name = name;
      if (formXml) updates.formxml = formXml;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateForm(formId, updates, solution);

      return {
        content: [{
          type: "text",
          text: `Successfully updated form (${formId})\n\n` +
                `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error updating form:", error);
      return { content: [{ type: "text", text: `Failed to update form: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete-form",
  "Delete a form. WARNING: Use check-delete-eligibility (read-only package) first. Cannot delete the last remaining Main form for an entity.",
  {
    formId: z.string().describe("Form ID (GUID). Get from get-forms in the read-only package.")
  },
  async ({ formId }: any) => {
    try {
      const service = ctx.pp;
      await service.deleteForm(formId);

      return {
        content: [{
          type: "text",
          text: `Successfully deleted form (${formId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error deleting form:", error);
      return { content: [{ type: "text", text: `Failed to delete form: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "activate-form",
  "Activate a form.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }: any) => {
    try {
      const service = ctx.pp;
      await service.activateForm(formId);

      return {
        content: [{
          type: "text",
          text: `Successfully activated form (${formId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error activating form:", error);
      return { content: [{ type: "text", text: `Failed to activate form: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "deactivate-form",
  "Deactivate a form.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }: any) => {
    try {
      const service = ctx.pp;
      await service.deactivateForm(formId);

      return {
        content: [{
          type: "text",
          text: `Successfully deactivated form (${formId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error deactivating form:", error);
      return { content: [{ type: "text", text: `Failed to deactivate form: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-view",
  "Create a new view for an entity using FetchXML. Use get-views and get-view-fetchxml (read-only package) for structure reference. Requires publish-customizations afterwards.",
  {
    name: z.string().describe("View name (e.g., 'Active Applications', 'My Open Cases')"),
    entityLogicalName: z.string().describe(
      descWithExamples("Entity logical name", ENTITY_NAME_EXAMPLES)
    ),
    fetchXml: z.string().describe("FetchXML query defining the data filter. Get examples from existing views using get-view-fetchxml (read-only package)."),
    layoutXml: z.string().describe("Layout XML defining visible columns and widths. Get examples from existing views using get-views (read-only package)."),
    queryType: z.number().optional().describe("Query type (default: 0 for public view)"),
    isDefault: z.boolean().optional().describe("Set as default view"),
    description: z.string().optional().describe("View description"),
    solutionUniqueName: z.string().optional().describe(
      descWithExamples("Solution to add to", SOLUTION_NAME_EXAMPLES)
    )
  },
  async ({ name, entityLogicalName, fetchXml, layoutXml, queryType, isDefault, description, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      const result = await service.createView(
        name, entityLogicalName, fetchXml, layoutXml,
        {
          queryType: queryType || 0,
          isDefault: isDefault || false,
          description,
          solutionUniqueName: solution
        }
      ) as any;

      return {
        content: [{
          type: "text",
          text: `Successfully created view '${name}' for entity '${entityLogicalName}'\n` +
                `View ID: ${result.savedqueryid}\n\n` +
                `IMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error creating view:", error);
      return { content: [{ type: "text", text: `Failed to create view: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-view",
  "Update an existing view. Quick Find views (querytype=4) have a Dataverse platform limitation: fetchxml/name/layoutxml cannot be updated via the Web API (only description/isdefault work). Attempts fail fast with an actionable error. To change Quick Find columns or filters, use the maker portal (Solutions → table → Views → Quick Find Active... → edit → Save & Publish).",
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
      const service = ctx.pp;
      const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

      const updates: any = {};
      if (name) updates.name = name;
      if (fetchXml) updates.fetchxml = fetchXml;
      if (layoutXml) updates.layoutxml = layoutXml;
      if (isDefault !== undefined) updates.isdefault = isDefault;
      if (description) updates.description = description;

      const solution = solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION;
      await service.updateView(viewId, updates, solution);

      return {
        content: [{
          type: "text",
          text: `Successfully updated view (${viewId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error updating view:", error);
      return { content: [{ type: "text", text: `Failed to update view: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete-view",
  "Delete a view. WARNING: Use check-delete-eligibility (read-only package) first. Cannot delete the default view for an entity.",
  {
    viewId: z.string().describe("View ID (GUID). Get from get-views in the read-only package.")
  },
  async ({ viewId }: any) => {
    try {
      const service = ctx.pp;
      await service.deleteView(viewId);

      return {
        content: [{
          type: "text",
          text: `Successfully deleted view (${viewId})\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error deleting view:", error);
      return { content: [{ type: "text", text: `Failed to delete view: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "set-default-view",
  "Set a view as the default view for its entity.",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }: any) => {
    try {
      const service = ctx.pp;
      await service.setDefaultView(viewId);

      return {
        content: [{
          type: "text",
          text: `Successfully set view (${viewId}) as default\n\nIMPORTANT: You must publish this customization using the 'publish-customizations' tool before it becomes active.`
        }]
      };
    } catch (error: any) {
      console.error("Error setting default view:", error);
      return { content: [{ type: "text", text: `Failed to set default view: ${error.message}` }], isError: true };
    }
  }
);

}
