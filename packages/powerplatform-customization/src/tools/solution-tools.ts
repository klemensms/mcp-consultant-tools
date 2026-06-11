/**
 * Solution Tools - 8 tools for solution and publisher management
 *
 * Tools: create-publisher, create-solution, get-solution-components, add-solution-component,
 *        remove-solution-component, export-solution, import-solution, publish-entity
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import { descWithExamples, PUBLISHER_PREFIX_EXAMPLES, SOLUTION_NAME_EXAMPLES, SOLUTION_COMPONENT_TYPE_EXAMPLES } from '../tool-examples.js';

export function registerSolutionTools(server: any, ctx: ServiceContext): void {

server.tool(
  "create-publisher",
  "Create a new solution publisher. Publishers own solutions and define the customization prefix used for all schema names.",
  {
    uniqueName: z.string().describe("Publisher unique name (lowercase, no spaces, e.g., 'siconsulting')"),
    friendlyName: z.string().describe("Publisher display name (e.g., 'SI Consulting')"),
    customizationPrefix: z.string().describe(
      descWithExamples("Customization prefix (2-8 lowercase letters, used for all schema names)", PUBLISHER_PREFIX_EXAMPLES)
    ),
    customizationOptionValuePrefix: z.number().describe("Option value prefix, 5-digit number (e.g., 10000, 15743). All option set values start with this prefix."),
    description: z.string().optional().describe("Publisher description")
  },
  async ({ uniqueName, friendlyName, customizationPrefix, customizationOptionValuePrefix, description }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.createPublisher(
        uniqueName, friendlyName, customizationPrefix, customizationOptionValuePrefix, description
      ) as any;

      return {
        content: [{
          type: "text",
          text: `Successfully created publisher '${friendlyName}'\n` +
                `Unique Name: ${uniqueName}\n` +
                `Prefix: ${customizationPrefix}\n` +
                `Option Value Prefix: ${customizationOptionValuePrefix}\n` +
                `Publisher ID: ${result.publisherid}`
        }]
      };
    } catch (error: any) {
      console.error("Error creating publisher:", error);
      return { content: [{ type: "text", text: `Failed to create publisher: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "create-solution",
  "Create a new unmanaged solution. Solutions group customizations for transport between environments.",
  {
    uniqueName: z.string().describe(
      descWithExamples("Solution unique name (no spaces)", SOLUTION_NAME_EXAMPLES)
    ),
    friendlyName: z.string().describe("Solution display name (e.g., 'My Custom Solution')"),
    version: z.string().describe("Solution version in format 'major.minor.build.revision' (e.g., '1.0.0.0')"),
    publisherId: z.string().describe("Publisher ID (GUID). Get from get-publishers in the read-only package."),
    description: z.string().optional().describe("Solution description")
  },
  async ({ uniqueName, friendlyName, version, publisherId, description }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.createSolution(
        uniqueName, friendlyName, version, publisherId, description
      ) as any;

      return {
        content: [{
          type: "text",
          text: `Successfully created solution '${friendlyName}'\n` +
                `Unique Name: ${uniqueName}\n` +
                `Version: ${version}\n` +
                `Solution ID: ${result.solutionid}`
        }]
      };
    } catch (error: any) {
      console.error("Error creating solution:", error);
      return { content: [{ type: "text", text: `Failed to create solution: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "get-solution-components",
  "List all components in a solution, grouped by component type. Returns component IDs, types, and behavior settings.",
  {
    solutionUniqueName: z.string().describe(
      descWithExamples("The unique name of the solution to list components for", SOLUTION_NAME_EXAMPLES)
    ),
  },
  async ({ solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const result = await service.getSolutionComponents(solutionUniqueName) as any;

      const components = result.value || [];

      const componentTypeNames: Record<number, string> = {
        1: 'Entity', 2: 'Attribute', 3: 'Relationship', 9: 'OptionSet',
        10: 'EntityRelationship', 13: 'ManagedProperty', 20: 'Policy',
        24: 'Privilege', 25: 'PrivilegeObjectTypeCode', 26: 'Role',
        29: 'Workflow', 31: 'Report', 36: 'Template', 37: 'Contract Template',
        38: 'Article Template', 39: 'Mail Merge Template', 44: 'Duplicate Rule',
        46: 'Duplicate Rule Condition', 48: 'Entity Map', 49: 'Attribute Map',
        59: 'SavedQuery', 60: 'Form', 61: 'WebResource', 62: 'SiteMap',
        63: 'Connection Role', 65: 'Hierarchy Rule', 66: 'Custom Control',
        70: 'FieldSecurityProfile', 71: 'FieldPermission', 80: 'AppModule',
        91: 'PluginAssembly', 92: 'PluginType', 93: 'SDKMessageProcessingStep',
        95: 'ServiceEndpoint', 150: 'RoutingRule', 152: 'SLA',
        154: 'ConvertRule', 300: 'Canvas App', 371: 'Connector',
        372: 'EnvironmentVariableDefinition', 373: 'EnvironmentVariableValue',
        380: 'AIModel', 381: 'AIConfiguration',
      };

      const grouped: Record<number, any[]> = {};
      for (const c of components) {
        const type = c.componenttype;
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(c);
      }

      const lines = [`Found ${components.length} component(s) in solution '${solutionUniqueName}':\n`];
      for (const [type, items] of Object.entries(grouped)) {
        const typeName = componentTypeNames[Number(type)] || `Type ${type}`;
        lines.push(`\n${typeName} (${items.length}):`);
        for (const item of items) {
          lines.push(`  - ${item.objectid} (behavior: ${item.rootcomponentbehavior ?? 'include subcomponents'})`);
        }
      }

      return {
        content: [{ type: "text", text: lines.join('\n') }]
      };
    } catch (error: any) {
      console.error("Error getting solution components:", error);
      return { content: [{ type: "text", text: `Failed to get solution components: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "add-solution-component",
  "Add a component to a solution.",
  {
    solutionUniqueName: z.string().describe(
      descWithExamples("Solution unique name", SOLUTION_NAME_EXAMPLES)
    ),
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe(
      descWithExamples("Component type number", SOLUTION_COMPONENT_TYPE_EXAMPLES)
    ),
    addRequiredComponents: z.boolean().optional().describe("Add required components (default: true)"),
    includedComponentSettingsValues: z.string().optional().describe("Component settings values")
  },
  async ({ solutionUniqueName, componentId, componentType, addRequiredComponents }: any) => {
    try {
      const service = ctx.pp;

      await service.addComponentToSolution(
        solutionUniqueName, componentId, componentType, addRequiredComponents ?? true
      );

      return {
        content: [{
          type: "text",
          text: `Successfully added component '${componentId}' (type: ${componentType}) to solution '${solutionUniqueName}'`
        }]
      };
    } catch (error: any) {
      console.error("Error adding component to solution:", error);
      return { content: [{ type: "text", text: `Failed to add component to solution: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "remove-solution-component",
  "Remove a component from a solution. NOTE: Does NOT work for Workflows (type 29) due to Microsoft API bug - use the UI instead.",
  {
    solutionUniqueName: z.string().describe(
      descWithExamples("Solution unique name", SOLUTION_NAME_EXAMPLES)
    ),
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe(
      descWithExamples("Component type number. WARNING: type 29 (Workflow) is broken in the API", SOLUTION_COMPONENT_TYPE_EXAMPLES)
    )
  },
  async ({ solutionUniqueName, componentId, componentType }: any) => {
    try {
      const service = ctx.pp;

      await service.removeComponentFromSolution(solutionUniqueName, componentId, componentType);

      return {
        content: [{
          type: "text",
          text: `Successfully removed component '${componentId}' (type: ${componentType}) from solution '${solutionUniqueName}'`
        }]
      };
    } catch (error: any) {
      console.error("Error removing component from solution:", error);
      return { content: [{ type: "text", text: `Failed to remove component from solution: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "export-solution",
  "Export a solution as a base64-encoded zip file. Workflow: export-solution -> transfer -> import-solution. Use unmanaged for development, managed for production deployment.",
  {
    solutionName: z.string().describe(
      descWithExamples("Solution unique name", SOLUTION_NAME_EXAMPLES)
    ),
    managed: z.boolean().optional().describe("Export as managed solution (default: false). Managed=locked for production, Unmanaged=editable for development.")
  },
  async ({ solutionName, managed }: any) => {
    try {
      const service = ctx.pp;

      const result = await service.exportSolution(solutionName, managed ?? false) as any;

      return {
        content: [{
          type: "text",
          text: `Successfully exported solution '${solutionName}' as ${managed ? 'managed' : 'unmanaged'}\n\n` +
                `Export File (Base64): ${(result.ExportSolutionFile || result).substring(0, 100)}...`
        }]
      };
    } catch (error: any) {
      console.error("Error exporting solution:", error);
      return { content: [{ type: "text", text: `Failed to export solution: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "import-solution",
  "Import a solution from a base64-encoded zip file. Workflow: export-solution (source env) -> import-solution (target env). Import is asynchronous - monitor the job for completion.",
  {
    customizationFile: z.string().describe("Base64-encoded solution zip file (from export-solution output)"),
    publishWorkflows: z.boolean().optional().describe("Publish workflows after import (default: true)"),
    overwriteUnmanagedCustomizations: z.boolean().optional().describe("Overwrite unmanaged customizations (default: false). Use true to force update existing customizations.")
  },
  async ({ customizationFile, publishWorkflows, overwriteUnmanagedCustomizations }: any) => {
    try {
      const service = ctx.pp;

      const result = await service.importSolution(
        customizationFile,
        overwriteUnmanagedCustomizations ?? false,
        publishWorkflows ?? true
      ) as any;

      return {
        content: [{
          type: "text",
          text: `Successfully initiated solution import\n` +
                `Import Job ID: ${result.ImportJobId}\n\n` +
                `NOTE: Solution import is asynchronous. Monitor the import job for completion status.`
        }]
      };
    } catch (error: any) {
      console.error("Error importing solution:", error);
      return { content: [{ type: "text", text: `Failed to import solution: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "publish-entity",
  "Publish all customizations for a specific entity. Faster than publish-customizations when changes are limited to one entity.",
  {
    entityLogicalName: z.string().describe(
      descWithExamples("Entity logical name to publish", [
        { label: "Standard entity", value: "account" },
        { label: "Custom entity", value: "new_application" },
      ])
    )
  },
  async ({ entityLogicalName }: any) => {
    try {
      const service = ctx.pp;

      await service.publishEntity(entityLogicalName);

      return {
        content: [{
          type: "text",
          text: `Successfully published entity '${entityLogicalName}'\n\n` +
                `All customizations for this entity are now active in the environment.`
        }]
      };
    } catch (error: any) {
      console.error("Error publishing entity:", error);
      return { content: [{ type: "text", text: `Failed to publish entity: ${error.message}` }], isError: true };
    }
  }
);

}
