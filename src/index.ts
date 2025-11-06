#!/usr/bin/env node
import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PowerPlatformService, PowerPlatformConfig } from "./PowerPlatformService.js";
import { AzureDevOpsService, AzureDevOpsConfig } from "./AzureDevOpsService.js";
import { FigmaService, type FigmaConfig } from "./FigmaService.js";

// Load environment variables from .env file (silent mode to not interfere with MCP)
// Temporarily suppress stdout to prevent dotenv from corrupting the JSON protocol
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (() => true) as any;
config({ debug: false });
process.stdout.write = originalStdoutWrite;

// Environment configuration
// These values can be set in environment variables or loaded from a configuration file
const POWERPLATFORM_CONFIG: PowerPlatformConfig = {
  organizationUrl: process.env.POWERPLATFORM_URL || "",
  clientId: process.env.POWERPLATFORM_CLIENT_ID || "",
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET || "",
  tenantId: process.env.POWERPLATFORM_TENANT_ID || "",
};

// PowerPlatform Customization Feature Flags
const POWERPLATFORM_CUSTOMIZATION_ENABLED = process.env.POWERPLATFORM_ENABLE_CUSTOMIZATION === "true";
const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

// Azure DevOps configuration
const AZUREDEVOPS_CONFIG: AzureDevOpsConfig = {
  organization: process.env.AZUREDEVOPS_ORGANIZATION || "",
  pat: process.env.AZUREDEVOPS_PAT || "",
  projects: (process.env.AZUREDEVOPS_PROJECTS || "").split(",").map(p => p.trim()).filter(p => p),
  apiVersion: process.env.AZUREDEVOPS_API_VERSION || "7.1",
  enableWorkItemWrite: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE === "true",
  enableWorkItemDelete: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE === "true",
  enableWikiWrite: process.env.AZUREDEVOPS_ENABLE_WIKI_WRITE === "true",
};

// Figma configuration
const FIGMA_CONFIG: FigmaConfig = {
  apiKey: process.env.FIGMA_API_KEY || "",
  oauthToken: process.env.FIGMA_OAUTH_TOKEN || "",
  useOAuth: process.env.FIGMA_USE_OAUTH === "true",
};

// Create server instance
const server = new McpServer({
  name: "mcp-consultant-tools",
  version: "1.0.0",
});

let powerPlatformService: PowerPlatformService | null = null;

// Function to initialize PowerPlatformService on demand
function getPowerPlatformService(): PowerPlatformService {
  if (!powerPlatformService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];
    if (!POWERPLATFORM_CONFIG.organizationUrl) missingConfig.push("organizationUrl");
    if (!POWERPLATFORM_CONFIG.clientId) missingConfig.push("clientId");
    if (!POWERPLATFORM_CONFIG.clientSecret) missingConfig.push("clientSecret");
    if (!POWERPLATFORM_CONFIG.tenantId) missingConfig.push("tenantId");

    if (missingConfig.length > 0) {
      throw new Error(`Missing PowerPlatform configuration: ${missingConfig.join(", ")}. Set these in environment variables.`);
    }

    // Initialize service
    powerPlatformService = new PowerPlatformService(POWERPLATFORM_CONFIG);
    console.error("PowerPlatform service initialized");
  }

  return powerPlatformService;
}

let azureDevOpsService: AzureDevOpsService | null = null;

// Function to initialize AzureDevOpsService on demand
function getAzureDevOpsService(): AzureDevOpsService {
  if (!azureDevOpsService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];
    if (!AZUREDEVOPS_CONFIG.organization) missingConfig.push("organization");
    if (!AZUREDEVOPS_CONFIG.pat) missingConfig.push("pat");
    if (!AZUREDEVOPS_CONFIG.projects || AZUREDEVOPS_CONFIG.projects.length === 0) {
      missingConfig.push("projects");
    }

    if (missingConfig.length > 0) {
      throw new Error(`Missing Azure DevOps configuration: ${missingConfig.join(", ")}. Set these in environment variables (AZUREDEVOPS_*).`);
    }

    // Initialize service
    azureDevOpsService = new AzureDevOpsService(AZUREDEVOPS_CONFIG);
    console.error("Azure DevOps service initialized");
  }

  return azureDevOpsService;
}

let figmaService: FigmaService | null = null;

// Function to initialize FigmaService on demand
function getFigmaService(): FigmaService {
  if (!figmaService) {
    // Check if configuration is complete
    const missingConfig: string[] = [];

    if (!FIGMA_CONFIG.apiKey && !FIGMA_CONFIG.oauthToken) {
      missingConfig.push("FIGMA_API_KEY or FIGMA_OAUTH_TOKEN");
    }

    if (missingConfig.length > 0) {
      throw new Error(
        `Missing required Figma configuration: ${missingConfig.join(", ")}. ` +
        `Please set these in your .env file or environment variables.`
      );
    }

    // Initialize service
    figmaService = new FigmaService(FIGMA_CONFIG);
    console.error("Figma service initialized");
  }

  return figmaService;
}

// Pre-defined PowerPlatform Prompts
const powerPlatformPrompts = {
  // Entity exploration prompts
  ENTITY_OVERVIEW: (entityName: string) => 
    `## Power Platform Entity: ${entityName}\n\n` +
    `This is an overview of the '${entityName}' entity in Microsoft Power Platform/Dataverse:\n\n` +
    `### Entity Details\n{{entity_details}}\n\n` +
    `### Attributes\n{{key_attributes}}\n\n` +
    `### Relationships\n{{relationships}}\n\n` +
    `You can query this entity using OData filters against the plural name.`,

  ATTRIBUTE_DETAILS: (entityName: string, attributeName: string) =>
    `## Attribute: ${attributeName}\n\n` +
    `Details for the '${attributeName}' attribute of the '${entityName}' entity:\n\n` +
    `{{attribute_details}}\n\n` +
    `### Usage Notes\n` +
    `- Data Type: {{data_type}}\n` +
    `- Required: {{required}}\n` +
    `- Max Length: {{max_length}}`,

  // Query builder prompts
  QUERY_TEMPLATE: (entityNamePlural: string) =>
    `## OData Query Template for ${entityNamePlural}\n\n` +
    `Use this template to build queries against the ${entityNamePlural} entity:\n\n` +
    `\`\`\`\n${entityNamePlural}?$select={{selected_fields}}&$filter={{filter_conditions}}&$orderby={{order_by}}&$top={{max_records}}\n\`\`\`\n\n` +
    `### Common Filter Examples\n` +
    `- Equals: \`name eq 'Contoso'\`\n` +
    `- Contains: \`contains(name, 'Contoso')\`\n` +
    `- Greater than date: \`createdon gt 2023-01-01T00:00:00Z\`\n` +
    `- Multiple conditions: \`name eq 'Contoso' and statecode eq 0\``,

  // Relationship exploration prompts
  RELATIONSHIP_MAP: (entityName: string) =>
    `## Relationship Map for ${entityName}\n\n` +
    `This shows all relationships for the '${entityName}' entity:\n\n` +
    `### One-to-Many Relationships (${entityName} as Primary)\n{{one_to_many_primary}}\n\n` +
    `### One-to-Many Relationships (${entityName} as Related)\n{{one_to_many_related}}\n\n` +
    `### Many-to-Many Relationships\n{{many_to_many}}\n\n`
};

// Register prompts with the server using the correct method signature
// Entity Overview Prompt
server.prompt(
  "entity-overview", 
  "Get an overview of a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity")
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get entity metadata and key attributes
      const [metadata, attributes] = await Promise.all([
        service.getEntityMetadata(entityName),
        service.getEntityAttributes(entityName)
      ]);
      
      // Format entity details
      const entityDetails = `- Display Name: ${metadata.DisplayName?.UserLocalizedLabel?.Label || entityName}\n` +
        `- Schema Name: ${metadata.SchemaName}\n` +
        `- Description: ${metadata.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
        `- Primary Key: ${metadata.PrimaryIdAttribute}\n` +
        `- Primary Name: ${metadata.PrimaryNameAttribute}`;
        
      // Get key attributes
      const keyAttributes = attributes.value
        .map((attr: any) => {
          const attrType = attr["@odata.type"] || attr.odata?.type || "Unknown type";
          return `- ${attr.LogicalName}: ${attrType}`;
        })
        .join('\n');
        
      // Get relationships summary
      const relationships = await service.getEntityRelationships(entityName);
      const oneToManyCount = relationships.oneToMany.value.length;
      const manyToManyCount = relationships.manyToMany.value.length;
      
      const relationshipsSummary = `- One-to-Many Relationships: ${oneToManyCount}\n` +
                                  `- Many-to-Many Relationships: ${manyToManyCount}`;
      
      let promptContent = powerPlatformPrompts.ENTITY_OVERVIEW(entityName);
      promptContent = promptContent
        .replace('{{entity_details}}', entityDetails)
        .replace('{{key_attributes}}', keyAttributes)
        .replace('{{relationships}}', relationshipsSummary);
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling entity-overview prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Attribute Details Prompt
server.prompt(
  "attribute-details",
  "Get detailed information about a specific entity attribute/field",
  {
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().describe("The logical name of the attribute"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const { entityName, attributeName } = args;
      
      // Get attribute details
      const attribute = await service.getEntityAttribute(entityName, attributeName);
      
      // Format attribute details
      const attrDetails = `- Display Name: ${attribute.DisplayName?.UserLocalizedLabel?.Label || attributeName}\n` +
        `- Description: ${attribute.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
        `- Type: ${attribute.AttributeType}\n` +
        `- Format: ${attribute.Format || 'N/A'}\n` +
        `- Is Required: ${attribute.RequiredLevel?.Value || 'No'}\n` +
        `- Is Searchable: ${attribute.IsValidForAdvancedFind || false}`;
        
      let promptContent = powerPlatformPrompts.ATTRIBUTE_DETAILS(entityName, attributeName);
      promptContent = promptContent
        .replace('{{attribute_details}}', attrDetails)
        .replace('{{data_type}}', attribute.AttributeType)
        .replace('{{required}}', attribute.RequiredLevel?.Value || 'No')
        .replace('{{max_length}}', attribute.MaxLength || 'N/A');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling attribute-details prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Query Template Prompt
server.prompt(
  "query-template",
  "Get a template for querying a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get entity metadata to determine plural name
      const metadata = await service.getEntityMetadata(entityName);
      const entityNamePlural = metadata.EntitySetName;
      
      // Get a few important fields for the select example
      const attributes = await service.getEntityAttributes(entityName);
      const selectFields = attributes.value
        .filter((attr: any) => attr.IsValidForRead === true && !attr.AttributeOf)
        .slice(0, 5) // Just take first 5 for example
        .map((attr: any) => attr.LogicalName)
        .join(',');
        
      let promptContent = powerPlatformPrompts.QUERY_TEMPLATE(entityNamePlural);
      promptContent = promptContent
        .replace('{{selected_fields}}', selectFields)
        .replace('{{filter_conditions}}', `${metadata.PrimaryNameAttribute} eq 'Example'`)
        .replace('{{order_by}}', `${metadata.PrimaryNameAttribute} asc`)
        .replace('{{max_records}}', '50');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling query-template prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Relationship Map Prompt
server.prompt(
  "relationship-map",
  "Get a list of relationships for a Power Platform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const entityName = args.entityName;
      
      // Get relationships
      const relationships = await service.getEntityRelationships(entityName);
      
      // Format one-to-many relationships where this entity is primary
      const oneToManyPrimary = relationships.oneToMany.value
        .filter((rel: any) => rel.ReferencingEntity !== entityName)
        .map((rel: any) => `- ${rel.SchemaName}: ${entityName} (1) → ${rel.ReferencingEntity} (N)`)
        .join('\n');
        
      // Format one-to-many relationships where this entity is related
      const oneToManyRelated = relationships.oneToMany.value
        .filter((rel: any) => rel.ReferencingEntity === entityName)
        .map((rel: any) => `- ${rel.SchemaName}: ${rel.ReferencedEntity} (1) → ${entityName} (N)`)
        .join('\n');
        
      // Format many-to-many relationships
      const manyToMany = relationships.manyToMany.value
        .map((rel: any) => {
          const otherEntity = rel.Entity1LogicalName === entityName ? rel.Entity2LogicalName : rel.Entity1LogicalName;
          return `- ${rel.SchemaName}: ${entityName} (N) ↔ ${otherEntity} (N)`;
        })
        .join('\n');
      
      let promptContent = powerPlatformPrompts.RELATIONSHIP_MAP(entityName);
      promptContent = promptContent
        .replace('{{one_to_many_primary}}', oneToManyPrimary || 'None found')
        .replace('{{one_to_many_related}}', oneToManyRelated || 'None found')
        .replace('{{many_to_many}}', manyToMany || 'None found');
      
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: promptContent
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error handling relationship-map prompt:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Plugin Deployment Report Prompt
server.prompt(
  "plugin-deployment-report",
  "Generate a comprehensive deployment report for a plugin assembly",
  {
    assemblyName: z.string().describe("The name of the plugin assembly"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPluginAssemblyComplete(args.assemblyName, false);

      // Build markdown report
      let report = `# Plugin Deployment Report: ${result.assembly.name}\n\n`;

      report += `## Assembly Information\n`;
      report += `- **Version**: ${result.assembly.version}\n`;
      report += `- **Isolation Mode**: ${result.assembly.isolationmode === 2 ? 'Sandbox' : 'None'}\n`;
      report += `- **Source**: ${result.assembly.sourcetype === 0 ? 'Database' : result.assembly.sourcetype === 1 ? 'Disk' : 'GAC'}\n`;
      report += `- **Last Modified**: ${result.assembly.modifiedon} by ${result.assembly.modifiedby?.fullname || 'Unknown'}\n`;
      report += `- **Managed**: ${result.assembly.ismanaged ? 'Yes' : 'No'}\n\n`;

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

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating plugin deployment report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Entity Plugin Pipeline Report Prompt
server.prompt(
  "entity-plugin-pipeline-report",
  "Generate a visual execution pipeline showing all plugins for an entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
    messageFilter: z.string().optional().describe("Optional filter by message name"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getEntityPluginPipeline(args.entityName, args.messageFilter, false);

      // Build markdown report
      let report = `# Plugin Pipeline: ${result.entity} Entity\n\n`;

      if (result.steps.length === 0) {
        report += `No plugins registered for this entity.\n`;
      } else {
        // Group by message
        result.messages.forEach((msg: any) => {
          report += `## ${msg.messageName} Message\n\n`;

          // PreValidation stage
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

          // PreOperation stage
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

          // PostOperation stage
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

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating entity plugin pipeline report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Power Automate Flows Report Prompt
server.prompt(
  "flows-report",
  "Generate a comprehensive report of all Power Automate flows in the environment",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated flows (default: false)"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getFlows(args.activeOnly === 'true', 100);

      // Build markdown report
      let report = `# Power Automate Flows Report\n\n`;
      report += `**Total Flows**: ${result.totalCount}\n\n`;

      if (result.flows.length === 0) {
        report += `No flows found in this environment.\n`;
      } else {
        // Group by state
        const activeFlows = result.flows.filter((f: any) => f.state === 'Activated');
        const draftFlows = result.flows.filter((f: any) => f.state === 'Draft');
        const suspendedFlows = result.flows.filter((f: any) => f.state === 'Suspended');

        if (activeFlows.length > 0) {
          report += `## Active Flows (${activeFlows.length})\n\n`;
          activeFlows.forEach((flow: any) => {
            report += `### ${flow.name}\n`;
            report += `- **ID**: ${flow.workflowid}\n`;
            report += `- **Description**: ${flow.description || 'No description'}\n`;
            report += `- **Primary Entity**: ${flow.primaryEntity || 'None'}\n`;
            report += `- **Owner**: ${flow.owner}\n`;
            report += `- **Modified**: ${flow.modifiedOn} by ${flow.modifiedBy}\n`;
            report += `- **Managed**: ${flow.isManaged ? 'Yes' : 'No'}\n\n`;
          });
        }

        if (draftFlows.length > 0) {
          report += `## Draft Flows (${draftFlows.length})\n\n`;
          draftFlows.forEach((flow: any) => {
            report += `- **${flow.name}** (${flow.workflowid})\n`;
            report += `  - Owner: ${flow.owner}, Modified: ${flow.modifiedOn}\n`;
          });
          report += `\n`;
        }

        if (suspendedFlows.length > 0) {
          report += `## Suspended Flows (${suspendedFlows.length})\n\n`;
          suspendedFlows.forEach((flow: any) => {
            report += `- **${flow.name}** (${flow.workflowid})\n`;
            report += `  - Owner: ${flow.owner}, Modified: ${flow.modifiedOn}\n`;
          });
          report += `\n`;
        }
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating flows report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Classic Workflows Report Prompt
server.prompt(
  "workflows-report",
  "Generate a comprehensive report of all classic Dynamics workflows in the environment",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated workflows (default: false)"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWorkflows(args.activeOnly === 'true', 100);

      // Build markdown report
      let report = `# Classic Dynamics Workflows Report\n\n`;
      report += `**Total Workflows**: ${result.totalCount}\n\n`;

      if (result.workflows.length === 0) {
        report += `No classic workflows found in this environment.\n`;
      } else {
        // Group by state
        const activeWorkflows = result.workflows.filter((w: any) => w.state === 'Activated');
        const draftWorkflows = result.workflows.filter((w: any) => w.state === 'Draft');
        const suspendedWorkflows = result.workflows.filter((w: any) => w.state === 'Suspended');

        if (activeWorkflows.length > 0) {
          report += `## Active Workflows (${activeWorkflows.length})\n\n`;
          activeWorkflows.forEach((workflow: any) => {
            report += `### ${workflow.name}\n`;
            report += `- **ID**: ${workflow.workflowid}\n`;
            report += `- **Description**: ${workflow.description || 'No description'}\n`;
            report += `- **Primary Entity**: ${workflow.primaryEntity || 'None'}\n`;
            report += `- **Mode**: ${workflow.mode}\n`;
            report += `- **Triggers**:\n`;
            if (workflow.triggerOnCreate) report += `  - Create\n`;
            if (workflow.triggerOnDelete) report += `  - Delete\n`;
            if (workflow.isOnDemand) report += `  - On Demand\n`;
            report += `- **Owner**: ${workflow.owner}\n`;
            report += `- **Modified**: ${workflow.modifiedOn} by ${workflow.modifiedBy}\n`;
            report += `- **Managed**: ${workflow.isManaged ? 'Yes' : 'No'}\n\n`;
          });
        }

        if (draftWorkflows.length > 0) {
          report += `## Draft Workflows (${draftWorkflows.length})\n\n`;
          draftWorkflows.forEach((workflow: any) => {
            report += `- **${workflow.name}** (${workflow.workflowid})\n`;
            report += `  - Entity: ${workflow.primaryEntity}, Owner: ${workflow.owner}\n`;
          });
          report += `\n`;
        }

        if (suspendedWorkflows.length > 0) {
          report += `## Suspended Workflows (${suspendedWorkflows.length})\n\n`;
          suspendedWorkflows.forEach((workflow: any) => {
            report += `- **${workflow.name}** (${workflow.workflowid})\n`;
            report += `  - Entity: ${workflow.primaryEntity}, Owner: ${workflow.owner}\n`;
          });
          report += `\n`;
        }
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating workflows report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Business Rules Report Prompt
server.prompt(
  "business-rules-report",
  "Generate a comprehensive report of all business rules in the environment (read-only for troubleshooting)",
  {
    activeOnly: z.string().optional().describe("Set to 'true' to only include activated business rules (default: false)"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getBusinessRules(args.activeOnly === 'true', 100);

      // Build markdown report
      let report = `# Business Rules Report\n\n`;
      report += `**Total Business Rules**: ${result.totalCount}\n\n`;

      if (result.businessRules.length === 0) {
        report += `No business rules found in this environment.\n`;
      } else {
        // Group by state
        const activeRules = result.businessRules.filter((r: any) => r.state === 'Activated');
        const draftRules = result.businessRules.filter((r: any) => r.state === 'Draft');
        const suspendedRules = result.businessRules.filter((r: any) => r.state === 'Suspended');

        if (activeRules.length > 0) {
          report += `## Active Business Rules (${activeRules.length})\n\n`;
          activeRules.forEach((rule: any) => {
            report += `### ${rule.name}\n`;
            report += `- **ID**: ${rule.workflowid}\n`;
            report += `- **Description**: ${rule.description || 'No description'}\n`;
            report += `- **Primary Entity**: ${rule.primaryEntity || 'None'}\n`;
            report += `- **Owner**: ${rule.owner}\n`;
            report += `- **Modified**: ${rule.modifiedOn} by ${rule.modifiedBy}\n`;
            report += `- **Managed**: ${rule.isManaged ? 'Yes' : 'No'}\n\n`;
          });
        }

        if (draftRules.length > 0) {
          report += `## Draft Business Rules (${draftRules.length})\n\n`;
          draftRules.forEach((rule: any) => {
            report += `- **${rule.name}** (${rule.workflowid})\n`;
            report += `  - Entity: ${rule.primaryEntity}, Owner: ${rule.owner}\n`;
          });
          report += `\n`;
        }

        if (suspendedRules.length > 0) {
          report += `## Suspended Business Rules (${suspendedRules.length})\n\n`;
          suspendedRules.forEach((rule: any) => {
            report += `- **${rule.name}** (${rule.workflowid})\n`;
            report += `  - Entity: ${rule.primaryEntity}, Owner: ${rule.owner}\n`;
          });
          report += `\n`;
        }
      }

      report += `\n---\n\n`;
      report += `*Note: Business rules are read-only in this MCP server. Use the PowerPlatform UI to create or modify business rules.*\n`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating business rules report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// ==================== MODEL-DRIVEN APP PROMPTS ====================

// App Overview Prompt
server.prompt(
  "app-overview",
  "Generate a comprehensive overview report for a model-driven app including components and configuration",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async (args) => {
    try {
      const service = getPowerPlatformService();

      // Get app details, components, and sitemap
      const app = await service.getApp(args.appId);
      const components = await service.getAppComponents(args.appId);
      const sitemap = await service.getAppSitemap(args.appId);

      // Build markdown report
      let report = `# Model-Driven App Overview: ${app.name}\n\n`;

      // Basic Information
      report += `## Basic Information\n`;
      report += `- **App ID**: ${app.appmoduleid}\n`;
      report += `- **Unique Name**: ${app.uniquename}\n`;
      report += `- **Description**: ${app.description || 'No description'}\n`;
      report += `- **State**: ${app.state}\n`;
      report += `- **Navigation Type**: ${app.navigationtype}\n`;
      report += `- **Featured**: ${app.isfeatured ? 'Yes' : 'No'}\n`;
      report += `- **Default App**: ${app.isdefault ? 'Yes' : 'No'}\n`;
      report += `- **Published On**: ${app.publishedon || 'Not published'}\n`;
      report += `- **Created**: ${app.createdon} by ${app.createdBy || 'Unknown'}\n`;
      report += `- **Modified**: ${app.modifiedon} by ${app.modifiedBy || 'Unknown'}\n\n`;

      // Publisher Information
      if (app.publisher) {
        report += `## Publisher\n`;
        report += `- **Name**: ${app.publisher.friendlyname}\n`;
        report += `- **Unique Name**: ${app.publisher.uniquename}\n`;
        report += `- **Prefix**: ${app.publisher.customizationprefix}\n\n`;
      }

      // Components Summary
      report += `## Components Summary\n`;
      report += `**Total Components**: ${components.totalCount}\n\n`;

      if (components.totalCount > 0) {
        // Group by type
        Object.keys(components.groupedByType).forEach((typeName: string) => {
          const typeComponents = components.groupedByType[typeName];
          report += `- **${typeName}**: ${typeComponents.length}\n`;
        });
        report += `\n`;

        // Detailed component list by type
        report += `## Detailed Components\n\n`;
        Object.keys(components.groupedByType).forEach((typeName: string) => {
          const typeComponents = components.groupedByType[typeName];
          report += `### ${typeName} (${typeComponents.length})\n`;
          typeComponents.forEach((comp: any, idx: number) => {
            report += `${idx + 1}. ID: ${comp.objectid}\n`;
          });
          report += `\n`;
        });
      }

      // Sitemap Information
      if (sitemap.hasSitemap) {
        report += `## Navigation (Sitemap)\n`;
        report += `- **Sitemap Name**: ${sitemap.sitemapname}\n`;
        report += `- **App Aware**: ${sitemap.isappaware ? 'Yes' : 'No'}\n`;
        report += `- **Collapsible Groups**: ${sitemap.enablecollapsiblegroups ? 'Yes' : 'No'}\n`;
        report += `- **Show Home**: ${sitemap.showhome ? 'Yes' : 'No'}\n`;
        report += `- **Show Pinned**: ${sitemap.showpinned ? 'Yes' : 'No'}\n`;
        report += `- **Show Recents**: ${sitemap.showrecents ? 'Yes' : 'No'}\n`;
        report += `- **Managed**: ${sitemap.ismanaged ? 'Yes' : 'No'}\n\n`;
      } else {
        report += `## Navigation (Sitemap)\n`;
        report += `⚠ No sitemap configured for this app\n\n`;
      }

      // Next Steps
      report += `## Available Actions\n`;
      report += `- Add entities: Use \`add-entities-to-app\` tool\n`;
      report += `- Validate app: Use \`validate-app\` tool\n`;
      report += `- Publish app: Use \`publish-app\` tool\n`;
      report += `- View sitemap XML: Use \`get-app-sitemap\` tool\n\n`;

      report += `---\n\n`;
      report += `*Generated by MCP Consultant Tools*\n`;

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating app overview:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// ==================== AZURE DEVOPS PROMPTS ====================

// Wiki Search Results Prompt
server.prompt(
  "wiki-search-results",
  "Search Azure DevOps wiki pages and get formatted results with content snippets",
  {
    searchText: z.string().describe("The text to search for"),
    project: z.string().optional().describe("Optional project filter"),
    maxResults: z.string().optional().describe("Maximum number of results (default: 25)"),
  },
  async (args) => {
    try {
      const service = getAzureDevOpsService();
      const { searchText, project, maxResults } = args;
      const maxResultsNum = maxResults ? parseInt(maxResults, 10) : undefined;
      const result = await service.searchWikiPages(searchText, project, maxResultsNum);

      let report = `# Wiki Search Results: "${searchText}"\n\n`;
      report += `**Project:** ${project || 'All allowed projects'}\n`;
      report += `**Total Results:** ${result.totalCount}\n\n`;

      if (result.results && result.results.length > 0) {
        report += `## Results\n\n`;
        result.results.forEach((item: any, index: number) => {
          report += `### ${index + 1}. ${item.fileName}\n`;
          report += `- **Path:** ${item.path}\n`;
          report += `- **Wiki:** ${item.wikiName}\n`;
          report += `- **Project:** ${item.project}\n`;
          if (item.highlights && item.highlights.length > 0) {
            report += `- **Highlights:**\n`;
            item.highlights.forEach((highlight: string) => {
              // Remove HTML tags for cleaner display
              const cleanHighlight = highlight.replace(/<[^>]*>/g, '');
              report += `  - ${cleanHighlight}\n`;
            });
          }
          report += `\n`;
        });
      } else {
        report += `No results found for "${searchText}".\n`;
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating wiki search results:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Wiki Page Content Prompt
server.prompt(
  "wiki-page-content",
  "Get a formatted wiki page with navigation context from Azure DevOps",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier"),
    pagePath: z.string().describe("The path to the page"),
  },
  async (args) => {
    try {
      const service = getAzureDevOpsService();
      const { project, wikiId, pagePath } = args;
      const result = await service.getWikiPage(project, wikiId, pagePath, true);

      let report = `# Wiki Page: ${pagePath}\n\n`;
      report += `**Project:** ${project}\n`;
      report += `**Wiki:** ${wikiId}\n`;
      report += `**Git Path:** ${result.gitItemPath || 'N/A'}\n\n`;

      if (result.subPages && result.subPages.length > 0) {
        report += `## Sub-pages\n`;
        result.subPages.forEach((subPage: any) => {
          report += `- ${subPage.path}\n`;
        });
        report += `\n`;
      }

      report += `## Content\n\n`;
      report += result.content || '*No content available*';

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating wiki page content:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Work Item Summary Prompt
server.prompt(
  "work-item-summary",
  "Get a comprehensive summary of a work item with comments from Azure DevOps",
  {
    project: z.string().describe("The project name"),
    workItemId: z.string().describe("The work item ID"),
  },
  async (args) => {
    try {
      const service = getAzureDevOpsService();
      const { project, workItemId } = args;
      const workItemIdNum = parseInt(workItemId, 10);

      // Get work item and comments in parallel
      const [workItem, comments] = await Promise.all([
        service.getWorkItem(project, workItemIdNum),
        service.getWorkItemComments(project, workItemIdNum)
      ]);

      const fields = workItem.fields || {};

      let report = `# Work Item #${workItemId}: ${fields['System.Title'] || 'Untitled'}\n\n`;

      report += `## Details\n`;
      report += `- **Type:** ${fields['System.WorkItemType'] || 'N/A'}\n`;
      report += `- **State:** ${fields['System.State'] || 'N/A'}\n`;
      report += `- **Assigned To:** ${fields['System.AssignedTo']?.displayName || 'Unassigned'}\n`;
      report += `- **Created By:** ${fields['System.CreatedBy']?.displayName || 'N/A'}\n`;
      report += `- **Created Date:** ${fields['System.CreatedDate'] || 'N/A'}\n`;
      report += `- **Changed Date:** ${fields['System.ChangedDate'] || 'N/A'}\n`;
      report += `- **Area Path:** ${fields['System.AreaPath'] || 'N/A'}\n`;
      report += `- **Iteration Path:** ${fields['System.IterationPath'] || 'N/A'}\n`;
      if (fields['System.Tags']) {
        report += `- **Tags:** ${fields['System.Tags']}\n`;
      }
      report += `\n`;

      if (fields['System.Description']) {
        report += `## Description\n${fields['System.Description']}\n\n`;
      }

      if (fields['Microsoft.VSTS.TCM.ReproSteps']) {
        report += `## Repro Steps\n${fields['Microsoft.VSTS.TCM.ReproSteps']}\n\n`;
      }

      if (workItem.relations && workItem.relations.length > 0) {
        report += `## Related Items\n`;
        workItem.relations.forEach((relation: any) => {
          report += `- ${relation.rel}: ${relation.url}\n`;
        });
        report += `\n`;
      }

      if (comments.comments && comments.comments.length > 0) {
        report += `## Comments (${comments.totalCount})\n\n`;
        comments.comments.forEach((comment: any) => {
          report += `### ${comment.createdBy} - ${new Date(comment.createdDate).toLocaleString()}\n`;
          report += `${comment.text}\n\n`;
        });
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating work item summary:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// Work Items Query Report Prompt
server.prompt(
  "work-items-query-report",
  "Execute a WIQL query and get formatted results grouped by state/type",
  {
    project: z.string().describe("The project name"),
    wiql: z.string().describe("The WIQL query string"),
    maxResults: z.string().optional().describe("Maximum number of results (default: 200)"),
  },
  async (args) => {
    try {
      const service = getAzureDevOpsService();
      const { project, wiql, maxResults } = args;
      const maxResultsNum = maxResults ? parseInt(maxResults, 10) : undefined;
      const result = await service.queryWorkItems(project, wiql, maxResultsNum);

      let report = `# Work Items Query Results\n\n`;
      report += `**Project:** ${project}\n`;
      report += `**Total Results:** ${result.totalCount}\n\n`;

      if (result.workItems && result.workItems.length > 0) {
        // Group by state
        const groupedByState = new Map<string, any[]>();
        result.workItems.forEach((item: any) => {
          const state = item.fields['System.State'] || 'Unknown';
          if (!groupedByState.has(state)) {
            groupedByState.set(state, []);
          }
          groupedByState.get(state)!.push(item);
        });

        // Sort states: Active, Resolved, Closed, others
        const stateOrder = ['Active', 'New', 'Resolved', 'Closed'];
        const sortedStates = Array.from(groupedByState.keys()).sort((a, b) => {
          const aIndex = stateOrder.indexOf(a);
          const bIndex = stateOrder.indexOf(b);
          if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });

        sortedStates.forEach(state => {
          const items = groupedByState.get(state)!;
          report += `## ${state} (${items.length})\n\n`;
          items.forEach((item: any) => {
            const fields = item.fields;
            report += `- **#${item.id}**: ${fields['System.Title'] || 'Untitled'}\n`;
            report += `  - Type: ${fields['System.WorkItemType'] || 'N/A'}`;
            report += `, Assigned: ${fields['System.AssignedTo']?.displayName || 'Unassigned'}\n`;
          });
          report += `\n`;
        });
      } else {
        report += `No work items found matching the query.\n`;
      }

      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: report
            }
          }
        ]
      };
    } catch (error: any) {
      console.error(`Error generating work items query report:`, error);
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `Error: ${error.message}`
            }
          }
        ]
      };
    }
  }
);

// PowerPlatform entity metadata
server.tool(
  "get-entity-metadata",
  "Get metadata about a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const metadata = await service.getEntityMetadata(entityName);
      
      // Format the metadata as a string for text display
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

// PowerPlatform entity attributes
server.tool(
  "get-entity-attributes",
  "Get attributes/fields of a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const attributes = await service.getEntityAttributes(entityName);
      
      // Format the attributes as a string for text display
      const attributesStr = JSON.stringify(attributes, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Attributes for entity '${entityName}':\n\n${attributesStr}`,
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

// PowerPlatform specific entity attribute
server.tool(
  "get-entity-attribute",
  "Get a specific attribute/field of a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().describe("The logical name of the attribute")
  },
  async ({ entityName, attributeName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const attribute = await service.getEntityAttribute(entityName, attributeName);
      
      // Format the attribute as a string for text display
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

// PowerPlatform entity relationships
server.tool(
  "get-entity-relationships",
  "Get relationships (one-to-many and many-to-many) for a PowerPlatform entity",
  {
    entityName: z.string().describe("The logical name of the entity"),
  },
  async ({ entityName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const relationships = await service.getEntityRelationships(entityName);
      
      // Format the relationships as a string for text display
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

// PowerPlatform global option set
server.tool(
  "get-global-option-set",
  "Get a global option set definition by name",
  {
    optionSetName: z.string().describe("The name of the global option set"),
  },
  async ({ optionSetName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const optionSet = await service.getGlobalOptionSet(optionSetName);
      
      // Format the option set as a string for text display
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

// PowerPlatform record by ID
server.tool(
  "get-record",
  "Get a specific record by entity name (plural) and ID",
  {
    entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
    recordId: z.string().describe("The GUID of the record"),
  },
  async ({ entityNamePlural, recordId }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const record = await service.getRecord(entityNamePlural, recordId);
      
      // Format the record as a string for text display
      const recordStr = JSON.stringify(record, null, 2);
      
      return {
        content: [
          {
            type: "text",
            text: `Record from '${entityNamePlural}' with ID '${recordId}':\n\n${recordStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting record:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get record: ${error.message}`,
          },
        ],
      };
    }
  }
);

// PowerPlatform query records with filter
server.tool(
  "query-records",
  "Query records using an OData filter expression",
  {
    entityNamePlural: z.string().describe("The plural name of the entity (e.g., 'accounts', 'contacts')"),
    filter: z.string().describe("OData filter expression (e.g., \"name eq 'test'\" or \"createdon gt 2023-01-01\")"),
    maxRecords: z.number().optional().describe("Maximum number of records to retrieve (default: 50)"),
  },
  async ({ entityNamePlural, filter, maxRecords }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      const records = await service.queryRecords(entityNamePlural, filter, maxRecords || 50);
      
      // Format the records as a string for text display
      const recordsStr = JSON.stringify(records, null, 2);
      const recordCount = records.value?.length || 0;
      
      return {
        content: [
          {
            type: "text",
            text: `Retrieved ${recordCount} records from '${entityNamePlural}' with filter '${filter}':\n\n${recordsStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error querying records:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to query records: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Plugin Assemblies List Tool
server.tool(
  "get-plugin-assemblies",
  "Get a list of all plugin assemblies in the environment",
  {
    includeManaged: z.boolean().optional().describe("Include managed assemblies (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of assemblies to return (default: 100)"),
  },
  async ({ includeManaged, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPluginAssemblies(includeManaged || false, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} plugin assemblies:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting plugin assemblies:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get plugin assemblies: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Plugin Assembly Tool
server.tool(
  "get-plugin-assembly-complete",
  "Get comprehensive information about a plugin assembly including all types, steps, images, and validation",
  {
    assemblyName: z.string().describe("The name of the plugin assembly"),
    includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
  },
  async ({ assemblyName, includeDisabled }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPluginAssemblyComplete(assemblyName, includeDisabled || false);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Plugin assembly '${assemblyName}' complete information:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting plugin assembly:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get plugin assembly: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Entity Plugin Pipeline Tool
server.tool(
  "get-entity-plugin-pipeline",
  "Get all plugins that execute on a specific entity, organized by message and execution order",
  {
    entityName: z.string().describe("The logical name of the entity"),
    messageFilter: z.string().optional().describe("Filter by message name (e.g., 'Create', 'Update', 'Delete')"),
    includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
  },
  async ({ entityName, messageFilter, includeDisabled }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getEntityPluginPipeline(entityName, messageFilter, includeDisabled || false);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Plugin pipeline for entity '${entityName}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting entity plugin pipeline:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get entity plugin pipeline: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Plugin Trace Logs Tool
server.tool(
  "get-plugin-trace-logs",
  "Query plugin trace logs with filtering and exception parsing",
  {
    entityName: z.string().optional().describe("Filter by entity logical name"),
    messageName: z.string().optional().describe("Filter by message name (e.g., 'Update')"),
    correlationId: z.string().optional().describe("Filter by correlation ID"),
    pluginStepId: z.string().optional().describe("Filter by specific step ID"),
    exceptionOnly: z.boolean().optional().describe("Only return logs with exceptions (default: false)"),
    hoursBack: z.number().optional().describe("How many hours back to search (default: 24)"),
    maxRecords: z.number().optional().describe("Maximum number of logs to return (default: 50)"),
  },
  async ({ entityName, messageName, correlationId, pluginStepId, exceptionOnly, hoursBack, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPluginTraceLogs({
        entityName,
        messageName,
        correlationId,
        pluginStepId,
        exceptionOnly: exceptionOnly || false,
        hoursBack: hoursBack || 24,
        maxRecords: maxRecords || 50
      });

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Plugin trace logs (found ${result.totalCount}):\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting plugin trace logs:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get plugin trace logs: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Power Automate Flows Tool
server.tool(
  "get-flows",
  "Get a list of all Power Automate cloud flows in the environment",
  {
    activeOnly: z.boolean().optional().describe("Only return activated flows (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of flows to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getFlows(activeOnly || false, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} Power Automate flows:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting flows:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get flows: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Flow Definition Tool
server.tool(
  "get-flow-definition",
  "Get the complete definition of a specific Power Automate flow including its logic",
  {
    flowId: z.string().describe("The GUID of the flow (workflowid)"),
  },
  async ({ flowId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getFlowDefinition(flowId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Flow definition for '${result.name}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting flow definition:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get flow definition: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Flow Runs Tool
server.tool(
  "get-flow-runs",
  "Get the run history for a specific Power Automate flow with success/failure status",
  {
    flowId: z.string().describe("The GUID of the flow (workflowid)"),
    maxRecords: z.number().optional().describe("Maximum number of runs to return (default: 100)"),
  },
  async ({ flowId, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getFlowRuns(flowId, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      // Calculate success/failure stats
      const stats = result.runs.reduce((acc: any, run: any) => {
        if (run.status === 'Succeeded') acc.succeeded++;
        else if (run.status === 'Failed' || run.status === 'Faulted' || run.status === 'TimedOut') acc.failed++;
        else if (run.status === 'Running' || run.status === 'Waiting') acc.inProgress++;
        else acc.other++;
        return acc;
      }, { succeeded: 0, failed: 0, inProgress: 0, other: 0 });

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} flow runs for flow ${flowId}:\n\nStats:\n- Succeeded: ${stats.succeeded}\n- Failed: ${stats.failed}\n- In Progress: ${stats.inProgress}\n- Other: ${stats.other}\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting flow runs:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get flow runs: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Classic Dynamics Workflows Tool
server.tool(
  "get-workflows",
  "Get a list of all classic Dynamics workflows in the environment",
  {
    activeOnly: z.boolean().optional().describe("Only return activated workflows (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of workflows to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWorkflows(activeOnly || false, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} classic Dynamics workflows:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting workflows:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get workflows: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Workflow Definition Tool
server.tool(
  "get-workflow-definition",
  "Get the complete definition of a specific classic Dynamics workflow including its XAML",
  {
    workflowId: z.string().describe("The GUID of the workflow (workflowid)"),
  },
  async ({ workflowId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWorkflowDefinition(workflowId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Workflow definition for '${result.name}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting workflow definition:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get workflow definition: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Business Rules Tool
server.tool(
  "get-business-rules",
  "Get a list of all business rules in the environment (read-only for troubleshooting)",
  {
    activeOnly: z.boolean().optional().describe("Only return activated business rules (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of business rules to return (default: 100)"),
  },
  async ({ activeOnly, maxRecords }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getBusinessRules(activeOnly || false, maxRecords || 100);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Found ${result.totalCount} business rules:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting business rules:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get business rules: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Business Rule Definition Tool
server.tool(
  "get-business-rule",
  "Get the complete definition of a specific business rule including its XAML (read-only for troubleshooting)",
  {
    workflowId: z.string().describe("The GUID of the business rule (workflowid)"),
  },
  async ({ workflowId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getBusinessRule(workflowId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Business rule definition for '${result.name}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting business rule:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get business rule: ${error.message}`,
          },
        ],
      };
    }
  }
);

// ==================== MODEL-DRIVEN APP TOOLS ====================

// Get Apps Tool
server.tool(
  "get-apps",
  "Get all model-driven apps in the PowerPlatform environment",
  {
    activeOnly: z.boolean().optional().describe("Only return active apps (default: false)"),
    maxRecords: z.number().optional().describe("Maximum number of apps to return (default: 100)"),
    includeUnpublished: z.boolean().optional().describe("Include unpublished/draft apps (default: true)"),
    solutionUniqueName: z.string().optional().describe("Filter apps by solution unique name (e.g., 'MCPTestCore')"),
  },
  async ({ activeOnly, maxRecords, includeUnpublished, solutionUniqueName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getApps(
        activeOnly || false,
        maxRecords || 100,
        includeUnpublished !== undefined ? includeUnpublished : true,
        solutionUniqueName
      );

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Model-Driven Apps (found ${result.totalCount}):\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting apps:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get apps: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Get App Tool
server.tool(
  "get-app",
  "Get detailed information about a specific model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getApp(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Model-Driven App '${result.name}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting app:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get app: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Get App Components Tool
server.tool(
  "get-app-components",
  "Get all components (entities, forms, views, sitemaps) in a model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getAppComponents(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `App Components (found ${result.totalCount}):\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting app components:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get app components: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Get App Sitemap Tool
server.tool(
  "get-app-sitemap",
  "Get the sitemap (navigation) configuration for a model-driven app",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getAppSitemap(appId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `App Sitemap:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting app sitemap:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get app sitemap: ${error.message}`,
          },
        ],
        isError: true
      };
    }
  }
);

// Create App Tool - REMOVED DUE TO DATAVERSE API BUG
// See CREATE_APP_API_BUG_REPORT.md for details
// The API consistently creates orphaned solution components without creating the actual appmodule record
// Workaround: Create apps manually via Power Apps maker portal

// Add Entities to App Tool
server.tool(
  "add-entities-to-app",
  "Add entities to a model-driven app (automatically adds them to navigation)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
    entityNames: z.array(z.string()).describe("Array of entity logical names to add (e.g., ['account', 'contact'])"),
  },
  async ({ appId, entityNames }) => {
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

// Validate App Tool
server.tool(
  "validate-app",
  "Validate a model-driven app before publishing (checks for missing components and configuration issues)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
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

// Publish App Tool
server.tool(
  "publish-app",
  "Publish a model-driven app to make it available to users (automatically validates first)",
  {
    appId: z.string().describe("The GUID of the app (appmoduleid)"),
  },
  async ({ appId }) => {
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

// ==================== AZURE DEVOPS WIKI TOOLS ====================

// Get Wikis Tool
server.tool(
  "get-wikis",
  "Get all wikis in an Azure DevOps project",
  {
    project: z.string().describe("The project name"),
  },
  async ({ project }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.getWikis(project);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Wikis in project '${project}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting wikis:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get wikis: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Search Wiki Pages Tool
server.tool(
  "search-wiki-pages",
  "Search wiki pages across Azure DevOps projects",
  {
    searchText: z.string().describe("The text to search for"),
    project: z.string().optional().describe("Optional project filter"),
    maxResults: z.number().optional().describe("Maximum number of results (default: 25)"),
  },
  async ({ searchText, project, maxResults }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.searchWikiPages(searchText, project, maxResults);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Wiki search results for '${searchText}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error searching wiki pages:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search wiki pages: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Get Wiki Page Tool
server.tool(
  "get-wiki-page",
  "Get a specific wiki page with content from Azure DevOps",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier (ID or name)"),
    pagePath: z.string().describe("The path to the page (e.g., '/Setup/Authentication')"),
    includeContent: z.boolean().optional().describe("Include page content (default: true)"),
  },
  async ({ project, wikiId, pagePath, includeContent }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.getWikiPage(project, wikiId, pagePath, includeContent ?? true);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Wiki page '${pagePath}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting wiki page:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get wiki page: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Create Wiki Page Tool
server.tool(
  "create-wiki-page",
  "Create a new wiki page in Azure DevOps (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier"),
    pagePath: z.string().describe("The path for the new page (e.g., '/Setup/NewGuide')"),
    content: z.string().describe("The markdown content for the page"),
  },
  async ({ project, wikiId, pagePath, content }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.createWikiPage(project, wikiId, pagePath, content);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Created wiki page '${pagePath}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error creating wiki page:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create wiki page: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Update Wiki Page Tool
server.tool(
  "update-wiki-page",
  "Update an existing wiki page in Azure DevOps (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    wikiId: z.string().describe("The wiki identifier"),
    pagePath: z.string().describe("The path to the page"),
    content: z.string().describe("The updated markdown content"),
    version: z.string().optional().describe("The ETag/version for optimistic concurrency"),
  },
  async ({ project, wikiId, pagePath, content, version }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.updateWikiPage(project, wikiId, pagePath, content, version);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Updated wiki page '${pagePath}':\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error updating wiki page:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to update wiki page: ${error.message}`,
          },
        ],
      };
    }
  }
);

// ==================== AZURE DEVOPS WORK ITEM TOOLS ====================

// Get Work Item Tool
server.tool(
  "get-work-item",
  "Get a work item by ID with full details from Azure DevOps",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
  },
  async ({ project, workItemId }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.getWorkItem(project, workItemId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting work item:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get work item: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Query Work Items Tool
server.tool(
  "query-work-items",
  "Query work items using WIQL (Work Item Query Language) in Azure DevOps",
  {
    project: z.string().describe("The project name"),
    wiql: z.string().describe("The WIQL query string (e.g., \"SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.State] = 'Active'\")"),
    maxResults: z.number().optional().describe("Maximum number of results (default: 200)"),
  },
  async ({ project, wiql, maxResults }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.queryWorkItems(project, wiql, maxResults);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Work items query results:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error querying work items:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to query work items: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Get Work Item Comments Tool
server.tool(
  "get-work-item-comments",
  "Get comments/discussion for a work item in Azure DevOps",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
  },
  async ({ project, workItemId }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.getWorkItemComments(project, workItemId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Comments for work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error getting work item comments:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get work item comments: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Add Work Item Comment Tool
server.tool(
  "add-work-item-comment",
  "Add a comment to a work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
    commentText: z.string().describe("The comment text (supports markdown)"),
  },
  async ({ project, workItemId, commentText }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.addWorkItemComment(project, workItemId, commentText);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Added comment to work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error adding work item comment:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to add work item comment: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Update Work Item Tool
server.tool(
  "update-work-item",
  "Update a work item in Azure DevOps using JSON Patch operations (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
    patchOperations: z.array(z.object({
      op: z.string().describe("The operation type (e.g., 'add', 'replace', 'remove')"),
      path: z.string().describe("The field path (e.g., '/fields/System.State')"),
      value: z.any().optional().describe("The value to set (not required for 'remove' operation)")
    })).describe("Array of JSON Patch operations"),
  },
  async ({ project, workItemId, patchOperations }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.updateWorkItem(project, workItemId, patchOperations);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Updated work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error updating work item:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to update work item: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Create Work Item Tool
server.tool(
  "create-work-item",
  "Create a new work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true)",
  {
    project: z.string().describe("The project name"),
    workItemType: z.string().describe("The work item type (e.g., 'Bug', 'Task', 'User Story')"),
    fields: z.record(z.any()).describe("Object with field values (e.g., {\"System.Title\": \"Bug title\", \"System.Description\": \"Details\"})"),
  },
  async ({ project, workItemType, fields }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.createWorkItem(project, workItemType, fields);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Created work item:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error creating work item:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create work item: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Delete Work Item Tool
server.tool(
  "delete-work-item",
  "Delete a work item in Azure DevOps (requires AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true)",
  {
    project: z.string().describe("The project name"),
    workItemId: z.number().describe("The work item ID"),
  },
  async ({ project, workItemId }) => {
    try {
      const service = getAzureDevOpsService();
      const result = await service.deleteWorkItem(project, workItemId);

      const resultStr = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: `Deleted work item ${workItemId}:\n\n${resultStr}`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error deleting work item:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to delete work item: ${error.message}`,
          },
        ],
      };
    }
  }
);

// ==================== FIGMA TOOLS ====================

/**
 * Tool: get-figma-data
 * Fetches and simplifies Figma file or node data for AI consumption
 */
server.tool(
  "get-figma-data",
  "Get comprehensive Figma design data including layout, text, styles, and components. " +
  "Fetches from Figma API and transforms into simplified, AI-friendly format. " +
  "Can fetch entire files or specific nodes. Automatically deduplicates styles.",
  {
    fileKey: z.string().describe(
      "Figma file key (alphanumeric string from URL). " +
      "Example: From 'https://figma.com/file/ABC123/MyFile', use 'ABC123'"
    ),
    nodeId: z.string().optional().describe(
      "Optional specific node ID(s) to fetch. Format: '1234:5678' or multiple '1:10;2:20'. " +
      "If omitted, fetches entire file."
    ),
    depth: z.number().optional().describe(
      "Optional tree traversal depth limit. Useful for large files. " +
      "Example: depth=3 stops after 3 levels of children."
    ),
  },
  async ({ fileKey, nodeId, depth }) => {
    try {
      const service = getFigmaService();
      const result = await service.getFigmaData(fileKey, nodeId, depth);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }],
        isError: false,
      };
    } catch (error: any) {
      console.error("Error fetching Figma data:", error);
      return {
        content: [{
          type: "text",
          text: `Failed to fetch Figma data: ${error.message}\n\n` +
                `Troubleshooting:\n` +
                `1. Verify FIGMA_API_KEY or FIGMA_OAUTH_TOKEN is set\n` +
                `2. Check file key is correct (from Figma URL)\n` +
                `3. Ensure you have access to the file in Figma\n` +
                `4. For OAuth, check token hasn't expired`
        }],
        isError: true,
      };
    }
  }
);

/**
 * Tool: download-figma-images (v2 Feature)
 * Placeholder for future image download functionality
 */
server.tool(
  "download-figma-images",
  "Download and process images from Figma designs (Coming in v2)",
  {
    fileKey: z.string().describe("Figma file key"),
    localPath: z.string().describe("Local path to save images"),
  },
  async ({ fileKey, localPath }) => {
    return {
      content: [{
        type: "text",
        text: "Image download functionality is planned for v2. " +
              "This will include:\n" +
              "- Download PNG/SVG exports\n" +
              "- Crop images with Figma transforms\n" +
              "- Generate CSS dimension variables\n" +
              "- Support for image fills and rendered nodes\n\n" +
              "For now, use get-figma-data to retrieve design metadata."
      }],
      isError: false,
    };
  }
);

// ==================== POWERPLATFORM CUSTOMIZATION TOOLS ====================

// Helper function to check if customization is enabled
function checkCustomizationEnabled(): void {
  if (!POWERPLATFORM_CUSTOMIZATION_ENABLED) {
    throw new Error(
      "PowerPlatform customization features are disabled. " +
      "Set POWERPLATFORM_ENABLE_CUSTOMIZATION=true in your environment to enable these tools."
    );
  }
}

/**
 * Tool: create-entity
 * Create a new custom entity (table) in Dynamics 365
 */
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
  async (params) => {
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

/**
 * Tool: update-entity
 * Update an existing entity
 */
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
  async (params) => {
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

/**
 * Tool: update-entity-icon
 * Update entity icon using Fluent UI System Icons
 */
server.tool(
  "update-entity-icon",
  "Update entity icon using Fluent UI System Icons from Microsoft's official icon library. Creates a web resource and sets it as the entity icon. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("The logical name of the entity (e.g., 'sic_strikeaction')"),
    iconFileName: z.string().describe("Fluent UI icon file name (e.g., 'people_community_24_filled.svg'). Browse icons at: https://github.com/microsoft/fluentui-system-icons"),
    solutionUniqueName: z.string().optional().describe("Solution to add the web resource to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not specified)")
  },
  async (params) => {
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

/**
 * Tool: delete-entity
 * Delete a custom entity
 */
server.tool(
  "delete-entity",
  "Delete a custom entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("The MetadataId of the entity to delete (GUID)")
  },
  async ({ metadataId }) => {
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

/**
 * Tool: create-attribute
 * Create a new attribute (column) on an entity
 */
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
  async (params) => {
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
            const normalizedOptions = params.optionSetOptions.map((opt, index) => {
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
            const normalizedOptions = params.optionSetOptions.map((opt, index) => {
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

/**
 * Tool: update-attribute
 * Update an existing attribute
 */
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
  async (params) => {
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

/**
 * Tool: delete-attribute
 * Delete an attribute from an entity
 */
server.tool(
  "delete-attribute",
  "Delete an attribute from an entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name"),
    attributeMetadataId: z.string().describe("Attribute MetadataId (GUID)")
  },
  async ({ entityLogicalName, attributeMetadataId }) => {
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

/**
 * Tool: create-one-to-many-relationship
 * Create a one-to-many relationship between entities
 */
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
  async (params) => {
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

/**
 * Tool: create-many-to-many-relationship
 * Create a many-to-many relationship between entities
 */
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
  async (params) => {
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

/**
 * Tool: delete-relationship
 * Delete a relationship
 */
server.tool(
  "delete-relationship",
  "Delete a relationship. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)")
  },
  async ({ metadataId }) => {
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

/**
 * Tool: update-relationship
 * Update a relationship (labels only)
 */
server.tool(
  "update-relationship",
  "Update relationship labels. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)"),
    referencedEntityNavigationPropertyName: z.string().optional().describe("Navigation property name"),
    referencingEntityNavigationPropertyName: z.string().optional().describe("Navigation property name")
  },
  async (params) => {
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

/**
 * Tool: get-relationship-details
 * Get detailed information about a relationship
 */
server.tool(
  "get-relationship-details",
  "Get detailed metadata about a relationship",
  {
    metadataId: z.string().describe("Relationship MetadataId (GUID)")
  },
  async ({ metadataId }) => {
    try {
      const service = getPowerPlatformService();
      const relationship = await service.getRelationshipDetails(metadataId);

      return {
        content: [{ type: "text", text: `Relationship Details:\n${JSON.stringify(relationship, null, 2)}` }]
      };
    } catch (error: any) {
      console.error("Error getting relationship details:", error);
      return { content: [{ type: "text", text: `Failed to get relationship details: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: create-global-optionset-attribute
 * Create an attribute using a global option set
 */
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
  async (params) => {
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

/**
 * Tool: get-webresource-dependencies
 * Get dependencies for a web resource
 */
server.tool(
  "get-webresource-dependencies",
  "Get all dependencies for a web resource",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }) => {
    try {
      const service = getPowerPlatformService();
      const dependencies = await service.getWebResourceDependencies(webResourceId);

      return {
        content: [{ type: "text", text: `Web Resource Dependencies:\n${JSON.stringify(dependencies, null, 2)}` }]
      };
    } catch (error: any) {
      console.error("Error getting web resource dependencies:", error);
      return { content: [{ type: "text", text: `Failed to get web resource dependencies: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: preview-unpublished-changes
 * Preview all unpublished customizations
 */
server.tool(
  "preview-unpublished-changes",
  "Preview all components with unpublished customizations",
  {},
  async () => {
    try {
      const service = getPowerPlatformService();
      const unpublished = await service.previewUnpublishedChanges();

      return {
        content: [{ type: "text", text: `Unpublished Changes:\n${JSON.stringify(unpublished, null, 2)}` }]
      };
    } catch (error: any) {
      console.error("Error previewing unpublished changes:", error);
      return { content: [{ type: "text", text: `Failed to preview unpublished changes: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: validate-solution-integrity
 * Validate solution integrity and check for missing dependencies
 */
server.tool(
  "validate-solution-integrity",
  "Validate a solution's integrity and check for missing dependencies",
  {
    solutionUniqueName: z.string().describe("Solution unique name")
  },
  async ({ solutionUniqueName }) => {
    try {
      const service = getPowerPlatformService();
      const validation = await service.validateSolutionIntegrity(solutionUniqueName);

      return {
        content: [{
          type: "text",
          text: `Solution Integrity Validation:\n\n` +
                `Valid: ${validation.isValid ? '✅ Yes' : '❌ No'}\n` +
                `Issues: ${validation.issues.length}\n` +
                `Warnings: ${validation.warnings.length}\n\n` +
                (validation.issues.length > 0 ? `Issues:\n${JSON.stringify(validation.issues, null, 2)}\n\n` : '') +
                (validation.warnings.length > 0 ? `Warnings:\n${JSON.stringify(validation.warnings, null, 2)}` : '')
        }]
      };
    } catch (error: any) {
      console.error("Error validating solution integrity:", error);
      return { content: [{ type: "text", text: `Failed to validate solution integrity: ${error.message}` }], isError: true };
    }
  }
);

/**
 * Tool: publish-customizations
 * Publish all pending customizations
 */
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

// ===== PHASE 2: Global Option Set Management =====

/**
 * Tool: update-global-optionset
 * Update a global option set
 */
server.tool(
  "update-global-optionset",
  "Update a global option set in Dynamics 365. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    metadataId: z.string().describe("The MetadataId of the option set"),
    displayName: z.string().optional().describe("New display name"),
    description: z.string().optional().describe("New description"),
    solutionUniqueName: z.string().optional().describe("Solution to add to (optional, uses POWERPLATFORM_DEFAULT_SOLUTION if not provided)")
  },
  async ({ metadataId, displayName, description, solutionUniqueName }) => {
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

/**
 * Tool: add-optionset-value
 * Add a value to a global option set
 */
server.tool(
  "add-optionset-value",
  "Add a new value to a global option set in Dynamics 365. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value (should start with publisher prefix, e.g., 15743xxxx)"),
    label: z.string().describe("The display label for the value"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, value, label, solutionUniqueName }) => {
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

/**
 * Tool: update-optionset-value
 * Update an existing option set value
 */
server.tool(
  "update-optionset-value",
  "Update an existing value in a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value to update"),
    label: z.string().describe("The new display label"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, value, label, solutionUniqueName }) => {
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

/**
 * Tool: delete-optionset-value
 * Delete a value from a global option set
 */
server.tool(
  "delete-optionset-value",
  "Delete a value from a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    value: z.number().describe("The numeric value to delete")
  },
  async ({ optionSetName, value }) => {
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

/**
 * Tool: reorder-optionset-values
 * Reorder values in a global option set
 */
server.tool(
  "reorder-optionset-values",
  "Reorder the values in a global option set. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    optionSetName: z.string().describe("The name of the option set"),
    values: z.array(z.number()).describe("Array of values in the desired order"),
    solutionUniqueName: z.string().optional().describe("Solution to add to")
  },
  async ({ optionSetName, values, solutionUniqueName }) => {
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

// ===== PHASE 2: Form Management =====

/**
 * Tool: create-form
 * Create a new form
 */
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
  async ({ name, entityLogicalName, formType, formXml, description, solutionUniqueName }) => {
    try {
      checkCustomizationEnabled();
      const service = getPowerPlatformService();

      const typeMap = { Main: 2, QuickCreate: 7, QuickView: 8, Card: 10 };
      const form = {
        name,
        objecttypecode: entityLogicalName,
        type: typeMap[formType],
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

/**
 * Tool: update-form
 * Update an existing form
 */
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
  async ({ formId, name, formXml, description, solutionUniqueName }) => {
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

/**
 * Tool: delete-form
 * Delete a form
 */
server.tool(
  "delete-form",
  "Delete a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }) => {
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

/**
 * Tool: activate-form
 * Activate a form
 */
server.tool(
  "activate-form",
  "Activate a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }) => {
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

/**
 * Tool: deactivate-form
 * Deactivate a form
 */
server.tool(
  "deactivate-form",
  "Deactivate a form. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    formId: z.string().describe("Form ID (GUID)")
  },
  async ({ formId }) => {
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

/**
 * Tool: get-forms
 * Get all forms for an entity
 */
server.tool(
  "get-forms",
  "Get all forms for an entity",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getForms(entityLogicalName);

      const forms = result.value || [];
      const typeNames: { [key: number]: string } = { 2: "Main", 7: "QuickCreate", 8: "QuickView", 10: "Card" };

      return {
        content: [
          {
            type: "text",
            text: `Found ${forms.length} form(s) for entity '${entityLogicalName}':\n\n` +
                  forms.map((f: any) =>
                    `- ${f.name} (${typeNames[f.type] || f.type})\n  ID: ${f.formid}`
                  ).join('\n')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting forms:", error);
      return {
        content: [{ type: "text", text: `Failed to get forms: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ===== PHASE 2: View Management =====

/**
 * Tool: create-view
 * Create a new view
 */
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
  async ({ name, entityLogicalName, fetchXml, layoutXml, queryType, isDefault, description, solutionUniqueName }) => {
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

/**
 * Tool: update-view
 * Update an existing view
 */
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
  async ({ viewId, name, fetchXml, layoutXml, isDefault, description, solutionUniqueName }) => {
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

/**
 * Tool: delete-view
 * Delete a view
 */
server.tool(
  "delete-view",
  "Delete a view. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }) => {
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

/**
 * Tool: get-views
 * Get all views for an entity
 */
server.tool(
  "get-views",
  "Get all views for an entity",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getViews(entityLogicalName);

      const views = result.value || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${views.length} view(s) for entity '${entityLogicalName}':\n\n` +
                  views.map((v: any) =>
                    `- ${v.name}${v.isdefault ? ' [DEFAULT]' : ''}\n  ID: ${v.savedqueryid}\n  Query Type: ${v.querytype}`
                  ).join('\n')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting views:", error);
      return {
        content: [{ type: "text", text: `Failed to get views: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: set-default-view
 * Set a view as the default view for its entity
 */
server.tool(
  "set-default-view",
  "Set a view as the default view for its entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }) => {
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

/**
 * Tool: get-view-fetchxml
 * Get the FetchXML from a view
 */
server.tool(
  "get-view-fetchxml",
  "Get the FetchXML query from a view",
  {
    viewId: z.string().describe("View ID (GUID)")
  },
  async ({ viewId }) => {
    try {
      const service = getPowerPlatformService();
      const view = await service.getViewFetchXml(viewId);

      return {
        content: [
          {
            type: "text",
            text: `View: ${view.name}\nEntity: ${view.returnedtypecode}\nQuery Type: ${view.querytype}\n\nFetchXML:\n${view.fetchxml}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting view FetchXML:", error);
      return {
        content: [{ type: "text", text: `Failed to get view FetchXML: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ===== PHASE 3: Web Resource Management =====

/**
 * Tool: create-web-resource
 * Create a new web resource
 */
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
  async ({ name, displayName, webResourceType, content, description, solutionUniqueName }) => {
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

/**
 * Tool: update-web-resource
 * Update an existing web resource
 */
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
  async ({ webResourceId, displayName, content, description, solutionUniqueName }) => {
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

/**
 * Tool: delete-web-resource
 * Delete a web resource
 */
server.tool(
  "delete-web-resource",
  "Delete a web resource. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }) => {
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

/**
 * Tool: get-web-resource
 * Get a web resource by ID
 */
server.tool(
  "get-web-resource",
  "Get a web resource by ID",
  {
    webResourceId: z.string().describe("Web resource ID (GUID)")
  },
  async ({ webResourceId }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWebResource(webResourceId);

      return {
        content: [
          {
            type: "text",
            text: `Web Resource: ${result.name}\n` +
                  `Display Name: ${result.displayname}\n` +
                  `Type: ${result.webresourcetype}\n` +
                  `Description: ${result.description || 'N/A'}\n` +
                  `Modified: ${result.modifiedon}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting web resource:", error);
      return {
        content: [{ type: "text", text: `Failed to get web resource: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-web-resources
 * Get web resources by name pattern
 */
server.tool(
  "get-web-resources",
  "Get web resources by name pattern (optional)",
  {
    nameFilter: z.string().optional().describe("Name filter (contains)")
  },
  async ({ nameFilter }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getWebResources(nameFilter);

      const webResources = result.value || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${webResources.length} web resource(s):\n\n` +
                  webResources.map((wr: any) =>
                    `- ${wr.name}\n  Type: ${wr.webresourcetype}\n  ID: ${wr.webresourceid}`
                  ).join('\n')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting web resources:", error);
      return {
        content: [{ type: "text", text: `Failed to get web resources: ${error.message}` }],
        isError: true
      };
    }
  }
);

// ===== PHASE 4: Solution Management =====

/**
 * Tool: create-publisher
 * Create a new publisher
 */
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
  async ({ uniqueName, friendlyName, customizationPrefix, customizationOptionValuePrefix, description }) => {
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

/**
 * Tool: get-publishers
 * Get all publishers
 */
server.tool(
  "get-publishers",
  "Get all solution publishers (excluding system publishers)",
  {},
  async () => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getPublishers();

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

/**
 * Tool: create-solution
 * Create a new solution
 */
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
  async ({ uniqueName, friendlyName, version, publisherId, description }) => {
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

/**
 * Tool: get-solutions
 * Get all solutions
 */
server.tool(
  "get-solutions",
  "Get all visible solutions in the environment",
  {},
  async () => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getSolutions();

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

/**
 * Tool: add-solution-component
 * Add a component to a solution
 */
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
  async ({ solutionUniqueName, componentId, componentType, addRequiredComponents, includedComponentSettingsValues }) => {
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

/**
 * Tool: remove-solution-component
 * Remove a component from a solution
 */
server.tool(
  "remove-solution-component",
  "Remove a component from a solution. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    solutionUniqueName: z.string().describe("Solution unique name"),
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ solutionUniqueName, componentId, componentType }) => {
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

/**
 * Tool: export-solution
 * Export a solution
 */
server.tool(
  "export-solution",
  "Export a solution as a zip file. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    solutionName: z.string().describe("Solution unique name"),
    managed: z.boolean().optional().describe("Export as managed solution (default: false)")
  },
  async ({ solutionName, managed }) => {
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

/**
 * Tool: import-solution
 * Import a solution
 */
server.tool(
  "import-solution",
  "Import a solution from a base64-encoded zip file. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    customizationFile: z.string().describe("Base64-encoded solution zip file"),
    publishWorkflows: z.boolean().optional().describe("Publish workflows after import (default: true)"),
    overwriteUnmanagedCustomizations: z.boolean().optional().describe("Overwrite unmanaged customizations (default: false)")
  },
  async ({ customizationFile, publishWorkflows, overwriteUnmanagedCustomizations }) => {
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

// ===== PHASE 5: Publishing & Validation =====

/**
 * Tool: publish-entity
 * Publish a specific entity
 */
server.tool(
  "publish-entity",
  "Publish all customizations for a specific entity. Requires POWERPLATFORM_ENABLE_CUSTOMIZATION=true.",
  {
    entityLogicalName: z.string().describe("Entity logical name to publish")
  },
  async ({ entityLogicalName }) => {
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

/**
 * Tool: check-dependencies
 * Check component dependencies
 */
server.tool(
  "check-dependencies",
  "Check dependencies before deleting a component",
  {
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ componentId, componentType }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.checkDependencies(componentId, componentType);

      const dependencies = result.EntityCollection?.Entities || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${dependencies.length} dependenc${dependencies.length === 1 ? 'y' : 'ies'} for component '${componentId}':\n\n` +
                  (dependencies.length > 0
                    ? dependencies.map((d: any) =>
                        `- ${d.Attributes?.dependentcomponentobjectid || 'Unknown'}\n  Type: ${d.Attributes?.dependentcomponenttype || 'Unknown'}`
                      ).join('\n')
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

/**
 * Tool: check-entity-dependencies
 * Check entity dependencies
 */
server.tool(
  "check-entity-dependencies",
  "Check dependencies for a specific entity before deletion",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.checkEntityDependencies(entityLogicalName);

      const dependencies = result.EntityCollection?.Entities || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${dependencies.length} dependenc${dependencies.length === 1 ? 'y' : 'ies'} for entity '${entityLogicalName}':\n\n` +
                  (dependencies.length > 0
                    ? dependencies.map((d: any) =>
                        `- ${d.Attributes?.dependentcomponentobjectid || 'Unknown'}\n  Type: ${d.Attributes?.dependentcomponenttype || 'Unknown'}`
                      ).join('\n')
                    : 'No dependencies found - entity can be safely deleted')
          }
        ]
      };
    } catch (error: any) {
      console.error("Error checking entity dependencies:", error);
      return {
        content: [{ type: "text", text: `Failed to check entity dependencies: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: get-entity-customization-info
 * Get entity customization information
 */
server.tool(
  "get-entity-customization-info",
  "Get entity customization information (customizable, managed, custom)",
  {
    entityLogicalName: z.string().describe("Entity logical name")
  },
  async ({ entityLogicalName }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.getEntityCustomizationInfo(entityLogicalName);

      return {
        content: [
          {
            type: "text",
            text: `Entity Customization Info for '${entityLogicalName}':\n\n` +
                  `Is Customizable: ${result.IsCustomizable?.Value ?? result.IsCustomizable}\n` +
                  `Is Managed: ${result.IsManaged}\n` +
                  `Is Custom Entity: ${result.IsCustomEntity}`
          }
        ]
      };
    } catch (error: any) {
      console.error("Error getting entity customization info:", error);
      return {
        content: [{ type: "text", text: `Failed to get entity customization info: ${error.message}` }],
        isError: true
      };
    }
  }
);

/**
 * Tool: validate-schema-name
 * Validate a schema name against naming rules
 */
server.tool(
  "validate-schema-name",
  "Validate a schema name against PowerPlatform naming rules",
  {
    schemaName: z.string().describe("Schema name to validate"),
    prefix: z.string().describe("Required customization prefix")
  },
  async ({ schemaName, prefix }) => {
    try {
      const service = getPowerPlatformService();
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

/**
 * Tool: check-delete-eligibility
 * Check if a component can be deleted
 */
server.tool(
  "check-delete-eligibility",
  "Check if a component can be safely deleted",
  {
    componentId: z.string().describe("Component ID (GUID or MetadataId)"),
    componentType: z.number().describe("Component type: 1=Entity, 2=Attribute, 9=OptionSet, 24=Form, 26=SavedQuery, 29=Workflow, 60=SystemForm, 61=WebResource")
  },
  async ({ componentId, componentType }) => {
    try {
      const service = getPowerPlatformService();
      const result = await service.checkDeleteEligibility(componentId, componentType);

      return {
        content: [
          {
            type: "text",
            text: `Delete Eligibility for component '${componentId}':\n\n` +
                  `Can Delete: ${result.canDelete ? '✅ Yes' : '❌ No'}\n` +
                  `Dependencies: ${result.dependencies.length}\n\n` +
                  (result.dependencies.length > 0
                    ? `Blocking Dependencies:\n${result.dependencies.map((d: any) =>
                        `- ${d.Attributes?.dependentcomponentobjectid || 'Unknown'}`
                      ).join('\n')}`
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Initializing PowerPlatform MCP Server...");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});