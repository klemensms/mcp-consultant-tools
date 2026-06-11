/**
 * Entity Prompts - 6 prompts for entity analysis and plugin reports
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  ENTITY_OVERVIEW,
  ATTRIBUTE_DETAILS,
  QUERY_TEMPLATE,
  RELATIONSHIP_MAP,
} from '@mcp-consultant-tools/powerplatform-core';

function makePromptResult(text: string) {
  return {
    messages: [
      {
        role: "assistant" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

function makePromptError(message: string) {
  return makePromptResult(`Error: ${message}`);
}

export function registerEntityPrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "entity-overview",
    "Get an overview of a Power Platform entity",
    {
      entityName: z.string().describe("The logical name of the entity")
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const entityName = args.entityName;

        const [rawMetadata, attributes] = await Promise.all([
          service.getEntityMetadata(entityName),
          service.getEntityAttributes(entityName)
        ]);
        const metadata = rawMetadata as any;

        const entityDetails = `- Display Name: ${metadata.DisplayName?.UserLocalizedLabel?.Label || entityName}\n` +
          `- Schema Name: ${metadata.SchemaName}\n` +
          `- Description: ${metadata.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
          `- Primary Key: ${metadata.PrimaryIdAttribute}\n` +
          `- Primary Name: ${metadata.PrimaryNameAttribute}`;

        const keyAttributes = attributes.value
          .map((attr: any) => {
            const attrType = attr["@odata.type"] || attr.odata?.type || "Unknown type";
            return `- ${attr.LogicalName}: ${attrType}`;
          })
          .join('\n');

        const relationships = await service.getEntityRelationships(entityName);
        const oneToManyCount = relationships.oneToMany.value.length;
        const manyToManyCount = relationships.manyToMany.value.length;

        const relationshipsSummary = `- One-to-Many Relationships: ${oneToManyCount}\n` +
                                    `- Many-to-Many Relationships: ${manyToManyCount}`;

        let promptContent = ENTITY_OVERVIEW(entityName);
        promptContent = promptContent
          .replace('{{entity_details}}', entityDetails)
          .replace('{{key_attributes}}', keyAttributes)
          .replace('{{relationships}}', relationshipsSummary);

        return makePromptResult(promptContent);
      } catch (error: any) {
        console.error(`Error handling entity-overview prompt:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "attribute-details",
    "Get detailed information about a specific entity attribute/field",
    {
      entityName: z.string().describe("The logical name of the entity"),
      attributeName: z.string().describe("The logical name of the attribute"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const { entityName, attributeName } = args;

        const attribute = await service.getEntityAttribute(entityName, attributeName) as any;

        const attrDetails = `- Display Name: ${attribute.DisplayName?.UserLocalizedLabel?.Label || attributeName}\n` +
          `- Description: ${attribute.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
          `- Type: ${attribute.AttributeType}\n` +
          `- Format: ${attribute.Format || 'N/A'}\n` +
          `- Is Required: ${attribute.RequiredLevel?.Value || 'No'}\n` +
          `- Is Searchable: ${attribute.IsValidForAdvancedFind || false}`;

        let promptContent = ATTRIBUTE_DETAILS(entityName, attributeName);
        promptContent = promptContent
          .replace('{{attribute_details}}', attrDetails)
          .replace('{{data_type}}', attribute.AttributeType)
          .replace('{{required}}', attribute.RequiredLevel?.Value || 'No')
          .replace('{{max_length}}', attribute.MaxLength || 'N/A');

        return makePromptResult(promptContent);
      } catch (error: any) {
        console.error(`Error handling attribute-details prompt:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "query-template",
    "Get a template for querying a Power Platform entity",
    {
      entityName: z.string().describe("The logical name of the entity"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const entityName = args.entityName;

        const metadata = await service.getEntityMetadata(entityName) as any;
        const entityNamePlural = metadata.EntitySetName;

        const attributes = await service.getEntityAttributes(entityName);
        const selectFields = attributes.value
          .filter((attr: any) => attr.IsValidForRead === true && !attr.AttributeOf)
          .slice(0, 5)
          .map((attr: any) => attr.LogicalName)
          .join(',');

        let promptContent = QUERY_TEMPLATE(entityNamePlural);
        promptContent = promptContent
          .replace('{{selected_fields}}', selectFields)
          .replace('{{filter_conditions}}', `${metadata.PrimaryNameAttribute} eq 'Example'`)
          .replace('{{order_by}}', `${metadata.PrimaryNameAttribute} asc`)
          .replace('{{max_records}}', '50');

        return makePromptResult(promptContent);
      } catch (error: any) {
        console.error(`Error handling query-template prompt:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "relationship-map",
    "Get a list of relationships for a Power Platform entity",
    {
      entityName: z.string().describe("The logical name of the entity"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const entityName = args.entityName;

        const relationships = await service.getEntityRelationships(entityName);

        const oneToManyPrimary = relationships.oneToMany.value
          .filter((rel: any) => rel.ReferencingEntity !== entityName)
          .map((rel: any) => `- ${rel.SchemaName}: ${entityName} (1) → ${rel.ReferencingEntity} (N)`)
          .join('\n');

        const oneToManyRelated = relationships.oneToMany.value
          .filter((rel: any) => rel.ReferencingEntity === entityName)
          .map((rel: any) => `- ${rel.SchemaName}: ${rel.ReferencedEntity} (1) → ${entityName} (N)`)
          .join('\n');

        const manyToMany = relationships.manyToMany.value
          .map((rel: any) => {
            const otherEntity = rel.Entity1LogicalName === entityName ? rel.Entity2LogicalName : rel.Entity1LogicalName;
            return `- ${rel.SchemaName}: ${entityName} (N) ↔ ${otherEntity} (N)`;
          })
          .join('\n');

        let promptContent = RELATIONSHIP_MAP(entityName);
        promptContent = promptContent
          .replace('{{one_to_many_primary}}', oneToManyPrimary || 'None found')
          .replace('{{one_to_many_related}}', oneToManyRelated || 'None found')
          .replace('{{many_to_many}}', manyToMany || 'None found');

        return makePromptResult(promptContent);
      } catch (error: any) {
        console.error(`Error handling relationship-map prompt:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "plugin-deployment-report",
    "Generate a comprehensive deployment report for a plugin assembly",
    {
      assemblyName: z.string().describe("The name of the plugin assembly"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getPluginAssemblyComplete(args.assemblyName, false);
        const assembly = (result as any).assembly;

        let report = `# Plugin Deployment Report: ${assembly.name}\n\n`;

        report += `## Assembly Information\n`;
        report += `- **Version**: ${assembly.version}\n`;
        report += `- **Isolation Mode**: ${assembly.isolationmode === 2 ? 'Sandbox' : 'None'}\n`;
        report += `- **Source**: ${assembly.sourcetype === 0 ? 'Database' : assembly.sourcetype === 1 ? 'Disk' : 'GAC'}\n`;
        report += `- **Last Modified**: ${assembly.modifiedon} by ${assembly.modifiedby?.fullname || 'Unknown'}\n`;
        report += `- **Managed**: ${assembly.ismanaged ? 'Yes' : 'No'}\n\n`;

        report += `## Plugin Types (${result.pluginTypes.length} total)\n`;
        result.pluginTypes.forEach((type: any, idx: number) => {
          report += `${idx + 1}. ${type.typename}\n`;
        });
        report += `\n`;

        report += `## Registered Steps (${result.steps.length} total)\n\n`;
        result.steps.forEach((step: any) => {
          const stageName = step.stage === 10 ? 'PreValidation' : step.stage === 20 ? 'PreOperation' : 'PostOperation';
          const modeName = step.mode === 0 ? 'Sync' : 'Async';
          const status = step.statuscode === 1 ? '✓ Enabled' : '✗ Disabled';

          report += `### ${step.sdkmessageid?.name || 'Unknown'} - ${step.sdkmessagefilterid?.primaryobjecttypecode || 'None'} (${stageName}, ${modeName}, Rank ${step.rank})\n`;
          report += `- **Plugin**: ${step.plugintypeid?.typename || 'Unknown'}\n`;
          report += `- **Status**: ${status}\n`;
          report += `- **Filtering Attributes**: ${step.filteringattributes || '(none - runs on all changes)'}\n`;
          report += `- **Deployment**: ${step.supporteddeployment === 0 ? 'Server Only' : step.supporteddeployment === 1 ? 'Offline Only' : 'Both'}\n`;

          if (step.images.length > 0) {
            report += `- **Images**:\n`;
            step.images.forEach((img: any) => {
              const imageType = img.imagetype === 0 ? 'PreImage' : img.imagetype === 1 ? 'PostImage' : 'Both';
              report += `  - ${img.name} (${imageType}) → Attributes: ${img.attributes || '(all)'}\n`;
            });
          } else {
            report += `- **Images**: None\n`;
          }
          report += `\n`;
        });

        report += `## Validation Results\n\n`;
        if (result.validation.hasDisabledSteps) {
          report += `⚠ Some steps are disabled\n`;
        } else {
          report += `✓ All steps are enabled\n`;
        }

        if (result.validation.stepsWithoutFilteringAttributes.length > 0) {
          report += `⚠ Warning: ${result.validation.stepsWithoutFilteringAttributes.length} Update/Delete steps without filtering attributes:\n`;
          result.validation.stepsWithoutFilteringAttributes.forEach((name: string) => {
            report += `  - ${name}\n`;
          });
        } else {
          report += `✓ All Update/Delete steps have filtering attributes\n`;
        }

        if (result.validation.stepsWithoutImages.length > 0) {
          report += `⚠ Warning: ${result.validation.stepsWithoutImages.length} Update/Delete steps without images:\n`;
          result.validation.stepsWithoutImages.forEach((name: string) => {
            report += `  - ${name}\n`;
          });
        }

        if (result.validation.potentialIssues.length > 0) {
          report += `\n### Potential Issues\n`;
          result.validation.potentialIssues.forEach((issue: string) => {
            report += `- ${issue}\n`;
          });
        }

        return makePromptResult(report);
      } catch (error: any) {
        console.error(`Error generating plugin deployment report:`, error);
        return makePromptError(error.message);
      }
    }
  );

  server.prompt(
    "entity-plugin-pipeline-report",
    "Generate a visual execution pipeline showing all plugins for an entity",
    {
      entityName: z.string().describe("The logical name of the entity"),
      messageFilter: z.string().optional().describe("Optional filter by message name"),
    },
    async (args: any) => {
      try {
        const service = ctx.pp;
        const result = await service.getEntityPluginPipeline(args.entityName, args.messageFilter, false);

        let report = `# Plugin Pipeline: ${result.entity} Entity\n\n`;

        if (result.steps.length === 0) {
          report += `No plugins registered for this entity.\n`;
        } else {
          result.messages.forEach((msg: any) => {
            report += `## ${msg.messageName} Message\n\n`;

            if (msg.stages.preValidation.length > 0) {
              report += `### Stage 1: PreValidation (Synchronous)\n`;
              msg.stages.preValidation.forEach((step: any, idx: number) => {
                report += `${idx + 1}. **[Rank ${step.rank}]** ${step.pluginType}\n`;
                report += `   - Assembly: ${step.assemblyName} v${step.assemblyVersion}\n`;
                report += `   - Filtering: ${step.filteringAttributes.join(', ') || '(all columns)'}\n`;
                if (step.hasPreImage || step.hasPostImage) {
                  const images = [];
                  if (step.hasPreImage) images.push('PreImage');
                  if (step.hasPostImage) images.push('PostImage');
                  report += `   - Images: ${images.join(', ')}\n`;
                }
                report += `\n`;
              });
            }

            if (msg.stages.preOperation.length > 0) {
              report += `### Stage 2: PreOperation (Synchronous)\n`;
              msg.stages.preOperation.forEach((step: any, idx: number) => {
                report += `${idx + 1}. **[Rank ${step.rank}]** ${step.pluginType}\n`;
                report += `   - Assembly: ${step.assemblyName} v${step.assemblyVersion}\n`;
                report += `   - Filtering: ${step.filteringAttributes.join(', ') || '(all columns)'}\n`;
                if (step.hasPreImage || step.hasPostImage) {
                  const images = [];
                  if (step.hasPreImage) images.push('PreImage');
                  if (step.hasPostImage) images.push('PostImage');
                  report += `   - Images: ${images.join(', ')}\n`;
                }
                report += `\n`;
              });
            }

            if (msg.stages.postOperation.length > 0) {
              report += `### Stage 3: PostOperation\n`;
              msg.stages.postOperation.forEach((step: any, idx: number) => {
                const mode = step.modeName === 'Asynchronous' ? ' (Async)' : ' (Sync)';
                report += `${idx + 1}. **[Rank ${step.rank}]** ${step.pluginType}${mode}\n`;
                report += `   - Assembly: ${step.assemblyName} v${step.assemblyVersion}\n`;
                report += `   - Filtering: ${step.filteringAttributes.join(', ') || '(all columns)'}\n`;
                if (step.hasPreImage || step.hasPostImage) {
                  const images = [];
                  if (step.hasPreImage) images.push('PreImage');
                  if (step.hasPostImage) images.push('PostImage');
                  report += `   - Images: ${images.join(', ')}\n`;
                }
                report += `\n`;
              });
            }

            report += `---\n\n`;
          });

          report += `## Execution Order\n\n`;
          report += `Plugins execute in this order:\n`;
          result.executionOrder.forEach((name: string, idx: number) => {
            report += `${idx + 1}. ${name}\n`;
          });
        }

        return makePromptResult(report);
      } catch (error: any) {
        console.error(`Error generating entity plugin pipeline report:`, error);
        return makePromptError(error.message);
      }
    }
  );
}
