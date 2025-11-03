#!/usr/bin/env node
import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PowerPlatformService, PowerPlatformConfig } from "./PowerPlatformService.js";
import { AzureDevOpsService, AzureDevOpsConfig } from "./AzureDevOpsService.js";

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

// Create server instance
const server = new McpServer({
  name: "powerplatform-mcp",
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

// PowerPlatform MCP Prompts
server.tool(
  "use-powerplatform-prompt",
  "Use a predefined prompt template for PowerPlatform entities",
  {
    promptType: z.enum([
      "ENTITY_OVERVIEW", 
      "ATTRIBUTE_DETAILS", 
      "QUERY_TEMPLATE", 
      "RELATIONSHIP_MAP"
    ]).describe("The type of prompt template to use"),
    entityName: z.string().describe("The logical name of the entity"),
    attributeName: z.string().optional().describe("The logical name of the attribute (required for ATTRIBUTE_DETAILS prompt)"),
  },
  async ({ promptType, entityName, attributeName }) => {
    try {
      // Get or initialize PowerPlatformService
      const service = getPowerPlatformService();
      
      let promptContent = "";
      let replacements: Record<string, string> = {};
      
      switch (promptType) {
        case "ENTITY_OVERVIEW": {
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
            //.slice(0, 10) // Limit to first 10 important attributes
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
          
          promptContent = powerPlatformPrompts.ENTITY_OVERVIEW(entityName);
          replacements = {
            '{{entity_details}}': entityDetails,
            '{{key_attributes}}': keyAttributes,
            '{{relationships}}': relationshipsSummary
          };
          break;
        }
        
        case "ATTRIBUTE_DETAILS": {
          if (!attributeName) {
            throw new Error("attributeName is required for ATTRIBUTE_DETAILS prompt");
          }
          
          // Get attribute details
          const attribute = await service.getEntityAttribute(entityName, attributeName);
          
          // Format attribute details
          const attrDetails = `- Display Name: ${attribute.DisplayName?.UserLocalizedLabel?.Label || attributeName}\n` +
            `- Description: ${attribute.Description?.UserLocalizedLabel?.Label || 'No description'}\n` +
            `- Type: ${attribute.AttributeType}\n` +
            `- Format: ${attribute.Format || 'N/A'}\n` +
            `- Is Required: ${attribute.RequiredLevel?.Value || 'No'}\n` +
            `- Is Searchable: ${attribute.IsValidForAdvancedFind || false}`;
            
          promptContent = powerPlatformPrompts.ATTRIBUTE_DETAILS(entityName, attributeName);
          replacements = {
            '{{attribute_details}}': attrDetails,
            '{{data_type}}': attribute.AttributeType,
            '{{required}}': attribute.RequiredLevel?.Value || 'No',
            '{{max_length}}': attribute.MaxLength || 'N/A'
          };
          break;
        }
        
        case "QUERY_TEMPLATE": {
          // Get entity metadata to determine plural name
          const metadata = await service.getEntityMetadata(entityName);
          const entityNamePlural = metadata.EntitySetName;
          
          // Get a few important fields for the select example
          const attributes = await service.getEntityAttributes(entityName);
          const selectFields = attributes.value
            .slice(0, 5) // Just take first 5 for example
            .map((attr: any) => attr.LogicalName)
            .join(',');
            
          promptContent = powerPlatformPrompts.QUERY_TEMPLATE(entityNamePlural);
          replacements = {
            '{{selected_fields}}': selectFields,
            '{{filter_conditions}}': `${metadata.PrimaryNameAttribute} eq 'Example'`,
            '{{order_by}}': `${metadata.PrimaryNameAttribute} asc`,
            '{{max_records}}': '50'
          };
          break;
        }
        
        case "RELATIONSHIP_MAP": {
          // Get relationships
          const relationships = await service.getEntityRelationships(entityName);
          
          // Format one-to-many relationships where this entity is primary
          const oneToManyPrimary = relationships.oneToMany.value
            .filter((rel: any) => rel.ReferencingEntity !== entityName)
            //.slice(0, 10) // Limit to 10 for readability
            .map((rel: any) => `- ${rel.SchemaName}: ${entityName} (1) → ${rel.ReferencingEntity} (N)`)
            .join('\n');
            
          // Format one-to-many relationships where this entity is related
          const oneToManyRelated = relationships.oneToMany.value
            .filter((rel: any) => rel.ReferencingEntity === entityName)
            //.slice(0, 10) // Limit to 10 for readability
            .map((rel: any) => `- ${rel.SchemaName}: ${rel.ReferencedEntity} (1) → ${entityName} (N)`)
            .join('\n');
            
          // Format many-to-many relationships
          const manyToMany = relationships.manyToMany.value
            //.slice(0, 10) // Limit to 10 for readability
            .map((rel: any) => {
              const otherEntity = rel.Entity1LogicalName === entityName ? rel.Entity2LogicalName : rel.Entity1LogicalName;
              return `- ${rel.SchemaName}: ${entityName} (N) ↔ ${otherEntity} (N)`;
            })
            .join('\n');
          
          promptContent = powerPlatformPrompts.RELATIONSHIP_MAP(entityName);
          replacements = {
            '{{one_to_many_primary}}': oneToManyPrimary || 'None found',
            '{{one_to_many_related}}': oneToManyRelated || 'None found',
            '{{many_to_many}}': manyToMany || 'None found'
          };
          break;
        }
      }
      
      // Replace all placeholders in the template
      for (const [placeholder, value] of Object.entries(replacements)) {
        promptContent = promptContent.replace(placeholder, value);
      }
      
      return {
        content: [
          {
            type: "text",
            text: promptContent,
          },
        ],
      };
    } catch (error: any) {
      console.error("Error using PowerPlatform prompt:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to use PowerPlatform prompt: ${error.message}`,
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
    patchOperations: z.array(z.any()).describe("Array of JSON Patch operations (e.g., [{\"op\": \"add\", \"path\": \"/fields/System.State\", \"value\": \"Resolved\"}])"),
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Initializing PowerPlatform MCP Server...");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});