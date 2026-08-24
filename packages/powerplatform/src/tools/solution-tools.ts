/**
 * Solution Tools - 8 tools for solution management and validation
 */
import { z } from 'zod';
import { validationFanOutSuffix } from '@mcp-consultant-tools/powerplatform-core';
import type { ServiceContext } from '../types.js';
import { descWithExamples, SOLUTION_NAME_EXAMPLES, ENTITY_NAME_EXAMPLES, COMPONENT_TYPE_EXAMPLES } from '../tool-examples.js';

export function registerSolutionTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-publishers",
    "Get all solution publishers (excluding system publishers)",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const service = ctx.pp;
        const result = await service.getPublishers() as any;

        const publishers = result.value || [];

        return {
          content: [
            {
              type: "text",
              text: `Found ${publishers.length} publisher(s):\n\n` +
                    publishers.map((p: any) =>
                      `- ${p.friendlyname} (${p.uniquename})\n  Prefix: ${p.customizationprefix}\n  ID: ${p.publisherid}`
                    ).join('\n')
            }
          ]
        };
      } catch (error: any) {
        console.error("Error getting publishers:", error);
        return {
          content: [{ type: "text", text: `Failed to get publishers: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "get-solutions",
    "Get all visible solutions in the environment",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      try {
        const service = ctx.pp;
        const result = await service.getSolutions() as any;

        const solutions = result.value || [];

        return {
          content: [
            {
              type: "text",
              text: `Found ${solutions.length} solution(s):\n\n` +
                    solutions.map((s: any) =>
                      `- ${s.friendlyname} (${s.uniquename})\n  Version: ${s.version}\n  ID: ${s.solutionid}`
                    ).join('\n')
            }
          ]
        };
      } catch (error: any) {
        console.error("Error getting solutions:", error);
        return {
          content: [{ type: "text", text: `Failed to get solutions: ${error.message}` }],
          isError: true
        };
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
    { readOnlyHint: true, openWorldHint: true },
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
        return {
          content: [{ type: "text", text: `Failed to get solution components: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "check-dependencies",
    "Check dependencies before deleting a component",
    {
      componentId: z.string().describe("Component ID (GUID or MetadataId)"),
      componentType: z.number().describe(
        descWithExamples("Component type code", COMPONENT_TYPE_EXAMPLES)
      )
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ componentId, componentType }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.checkDependencies(componentId, componentType) as any;

        // Web API returns { value: [...] }; Organization Service returns { EntityCollection: { Entities: [...] } }
        const dependencies = result.value || result.EntityCollection?.Entities || [];

        const componentTypeNames: Record<number, string> = {
          1: 'Entity', 2: 'Attribute', 3: 'Relationship', 9: 'OptionSet',
          20: 'Policy', 26: 'Role', 29: 'Workflow', 59: 'SavedQuery',
          60: 'Form', 61: 'WebResource', 62: 'SiteMap', 66: 'CustomControl',
          80: 'AppModule', 91: 'PluginAssembly', 92: 'PluginType',
          93: 'SDKMessageProcessingStep', 300: 'Canvas App',
          372: 'EnvironmentVariableDefinition',
        };

        return {
          content: [
            {
              type: "text",
              text: `Found ${dependencies.length} dependenc${dependencies.length === 1 ? 'y' : 'ies'} for component '${componentId}':\n\n` +
                    (dependencies.length > 0
                      ? dependencies.map((d: any) => {
                          // Web API uses lowercase property names directly
                          const depId = d.dependentcomponentobjectid || d.Attributes?.dependentcomponentobjectid || 'Unknown';
                          const depType = d.dependentcomponenttype || d.Attributes?.dependentcomponenttype;
                          const depTypeName = depType != null ? (componentTypeNames[depType] || `Type ${depType}`) : 'Unknown';
                          const reqId = d.requiredcomponentobjectid || d.Attributes?.requiredcomponentobjectid || '';
                          return `- Dependent: ${depId} (${depTypeName})` +
                            (reqId ? `\n  Required: ${reqId}` : '');
                        }).join('\n')
                      : 'No dependencies found - component can be safely deleted')
            }
          ]
        };
      } catch (error: any) {
        console.error("Error checking dependencies:", error);
        return {
          content: [{ type: "text", text: `Failed to check dependencies: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "validate-schema-name",
    "Validate a schema name against PowerPlatform naming rules",
    {
      schemaName: z.string().describe("Schema name to validate"),
      prefix: z.string().describe("Required customization prefix")
    },
    // Local synchronous validation — no external/Dataverse call.
    { readOnlyHint: true },
    async ({ schemaName, prefix }: any) => {
      try {
        const service = ctx.pp;
        const result = service.validateSchemaName(schemaName, prefix);

        return {
          content: [
            {
              type: "text",
              text: `Schema Name Validation for '${schemaName}':\n\n` +
                    `Valid: ${result.valid ? '✅' : '❌'}\n\n` +
                    (result.errors.length > 0
                      ? `Errors:\n${result.errors.map(e => `- ${e}`).join('\n')}`
                      : 'No validation errors')
            }
          ]
        };
      } catch (error: any) {
        console.error("Error validating schema name:", error);
        return {
          content: [{ type: "text", text: `Failed to validate schema name: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "check-delete-eligibility",
    "Check if a component can be safely deleted by verifying it has no blocking dependencies.",
    {
      componentId: z.string().describe("Component ID (GUID or MetadataId)"),
      componentType: z.number().describe(
        descWithExamples("Component type code", COMPONENT_TYPE_EXAMPLES)
      )
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ componentId, componentType }: any) => {
      try {
        const service = ctx.pp;
        const result = await service.checkDeleteEligibility(componentId, componentType) as {
          canDelete: boolean; dependencies: unknown[]; error?: string;
        };

        if (result.error) {
          return {
            content: [{
              type: "text",
              text: `Delete Eligibility for component '${componentId}':\n\n` +
                    `Can Delete: ❌ No (dependency check failed)\n` +
                    `Error: ${result.error}\n\n` +
                    `The dependency check could not be completed. ` +
                    `Try using check-dependencies directly for more details.`
            }],
            isError: true
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Delete Eligibility for component '${componentId}':\n\n` +
                    `Can Delete: ${result.canDelete ? '✅ Yes' : '❌ No'}\n` +
                    `Dependencies: ${result.dependencies.length}\n\n` +
                    (result.dependencies.length > 0
                      ? `Blocking Dependencies:\n${result.dependencies.map((d: any) => {
                          const depId = d.dependentcomponentobjectid || d.Attributes?.dependentcomponentobjectid || 'Unknown';
                          const depType = d.dependentcomponenttype || d.Attributes?.dependentcomponenttype || 'Unknown';
                          return `- ${depId} (type: ${depType})`;
                        }).join('\n')}`
                      : 'No blocking dependencies - component can be safely deleted')
            }
          ]
        };
      } catch (error: any) {
        console.error("Error checking delete eligibility:", error);
        return {
          content: [{ type: "text", text: `Failed to check delete eligibility: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "validate-dataverse",
    "Validate Dataverse entities against internal best practices for column naming, prefixes, configuration, and entity icons. Checks schema name casing, lookup naming conventions, option set scope (all must be global), required columns, publisher prefix compliance, and entity icon assignment. Supports solution-based validation or explicit entity list with configurable time range filtering.",
    {
      solutionUniqueName: z.string().optional().describe(
        descWithExamples("Solution unique name to validate. Mutually exclusive with entityLogicalNames", SOLUTION_NAME_EXAMPLES)
      ),
      entityLogicalNames: z.array(z.string()).optional().describe(
        descWithExamples("Explicit list of entity logical names to validate. Mutually exclusive with solutionUniqueName", ENTITY_NAME_EXAMPLES)
      ),
      publisherPrefix: z.string().describe("Publisher prefix to validate against (e.g., 'contoso_'). Required."),
      recentDays: z.number().optional().describe("Only validate columns created in the last N days. Set to 0 to validate all columns regardless of age. Default: 30."),
      includeRefDataTables: z.boolean().optional().describe("Include RefData tables (schema starts with prefix + 'ref_') in validation. Default: true."),
      rules: z.array(z.string()).optional().describe("Specific rules to validate: 'prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'. Default: all rules."),
      maxEntities: z.number().optional().describe("Maximum number of entities to validate (safety limit). Default: 0 (unlimited)."),
      requiredColumns: z.array(z.string()).optional().describe("List of required column schema names to check for (without prefix). Use '{prefix}' placeholder which will be replaced with publisherPrefix at runtime. Default: ['{prefix}updatedbyprocess']. Example: ['{prefix}sqlcreatedon', '{prefix}sqlmodifiedon'] for SQL timestamp columns.")
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ solutionUniqueName, entityLogicalNames, publisherPrefix, recentDays, includeRefDataTables, rules, maxEntities, requiredColumns }: any) => {
      try {
        if (!solutionUniqueName && !entityLogicalNames) {
          return {
            content: [{ type: "text", text: "Error: Either solutionUniqueName or entityLogicalNames must be provided" }],
            isError: true
          };
        }

        if (solutionUniqueName && entityLogicalNames) {
          return {
            content: [{ type: "text", text: "Error: solutionUniqueName and entityLogicalNames are mutually exclusive" }],
            isError: true
          };
        }

        const service = ctx.pp;
        const result = await service.validateBestPractices(
          solutionUniqueName,
          entityLogicalNames,
          publisherPrefix,
          recentDays ?? 30,
          includeRefDataTables ?? true,
          rules ?? ['prefix', 'lowercase', 'lookup', 'optionset', 'required-column', 'entity-icon'],
          maxEntities ?? 0,
          requiredColumns ?? ['{prefix}updatedbyprocess']
        );

        // The header line carries the incompleteness warning, because a reader who acts on
        // "0 violations" rarely reads as far as `fanOut` in the JSON below it.
        const header =
          `Best-practices validation: ${result.summary.entitiesChecked} entities checked, ` +
          `${result.summary.totalViolations} violation(s)` +
          `${validationFanOutSuffix(result)}`;

        return {
          content: [{ type: "text", text: `${header}\n\n${JSON.stringify(result, null, 2)}` }]
        };
      } catch (error: any) {
        console.error("Error validating best practices:", error);
        return {
          content: [{ type: "text", text: `Failed to validate best practices: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    "generate-dbml-schema",
    `Generates DBML (Database Markup Language) schema from Dataverse entities.

Accepts solution names, explicit entity lists, or both. Returns DBML text
and a clickable dbdiagram.io URL for visualization.

DBML output includes:
- Table definitions with columns and types
- Primary key markers [pk]
- Foreign key relationships (Ref: statements) for all lookups

Example output:
\`\`\`dbml
Table new_directdebit {
    new_directdebitid uniqueidentifier [pk]
    new_name nvarchar
    new_accountid lookup
}
Ref: new_directdebit.new_accountid > account.accountid
\`\`\``,
    {
      solutions: z.array(z.string()).optional()
        .describe('One or more solution unique names to extract entities from'),
      entities: z.array(z.string()).optional()
        .describe('Explicit list of entity logical names to include'),
      includeSystemColumns: z.boolean().optional()
        .describe('Include system columns like createdon, modifiedon (default: false)'),
      includeStateStatus: z.boolean().optional()
        .describe('Include statecode/statuscode columns (default: false)'),
      prefix: z.string().optional()
        .describe('Only include columns matching this prefix (e.g., "si_")'),
      depth: z.number().optional()
        .describe('Relationship traversal depth for discovering related entities (default: 0)'),
      includePolymorphicLookups: z.boolean().optional()
        .describe('Include Customer/Owner/PartyList lookups (default: true)'),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (params: any) => {
      try {
        const service = ctx.pp;
        const result = await service.generateDbmlSchema(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error("Error generating DBML schema:", error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to generate DBML schema: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
