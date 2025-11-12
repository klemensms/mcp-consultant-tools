  // ========================================
  // PROMPTS
  // ========================================

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

  // ========================================
  // TOOLS
  // ========================================

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

  server.tool(
    "create-record",
    "Create a new record in Dataverse. Requires POWERPLATFORM_ENABLE_CREATE=true.",
    {
      entityNamePlural: z
        .string()
        .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
      data: z
        .record(z.any())
        .describe(
          "Record data as JSON object. Field names must match logical names (e.g., {'name': 'Acme Corp', 'telephone1': '555-1234'}). " +
          "For lookup fields, use '@odata.bind' syntax: {'parentaccountid@odata.bind': '/accounts(guid)'}. " +
          "For option sets, use integer values."
        ),
    },
    async ({ entityNamePlural, data }) => {
      try {
        checkCreateEnabled();
        const service = getPowerPlatformService();
        const result = await service.createRecord(entityNamePlural, data);
  
        return {
          content: [
            {
              type: "text",
              text: `✅ Record created successfully in ${entityNamePlural}\n\n` +
                `**Record ID:** ${result.id || result[Object.keys(result).find(k => k.endsWith('id')) || ''] || 'N/A'}\n\n` +
                `**Created Record:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating record:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to create record: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "update-record",
    "Update an existing record in Dataverse. Requires POWERPLATFORM_ENABLE_UPDATE=true.",
    {
      entityNamePlural: z
        .string()
        .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
      recordId: z
        .string()
        .describe("The GUID of the record to update"),
      data: z
        .record(z.any())
        .describe(
          "Partial record data to update (only fields being changed). " +
          "Field names must match logical names. " +
          "Use '@odata.bind' syntax for lookups, integer values for option sets."
        ),
    },
    async ({ entityNamePlural, recordId, data }) => {
      try {
        checkUpdateEnabled();
        const service = getPowerPlatformService();
        const result = await service.updateRecord(entityNamePlural, recordId, data);
  
        return {
          content: [
            {
              type: "text",
              text: `✅ Record updated successfully in ${entityNamePlural}\n\n` +
                `**Record ID:** ${recordId}\n\n` +
                `**Updated Record:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error updating record:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to update record: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "delete-record",
    "Delete a record from Dataverse. Requires POWERPLATFORM_ENABLE_DELETE=true. WARNING: This operation is permanent and cannot be undone.",
    {
      entityNamePlural: z
        .string()
        .describe("The plural name of the entity (e.g., 'accounts', 'contacts', 'sic_applications')"),
      recordId: z
        .string()
        .describe("The GUID of the record to delete"),
      confirm: z
        .boolean()
        .optional()
        .describe("Confirmation flag - must be true to proceed with deletion (safety check)"),
    },
    async ({ entityNamePlural, recordId, confirm }) => {
      try {
        checkDeleteEnabled();
  
        // Require explicit confirmation for deletion
        if (confirm !== true) {
          return {
            content: [
              {
                type: "text",
                text: `⚠️  Delete operation requires explicit confirmation.\n\n` +
                  `You are about to delete record **${recordId}** from **${entityNamePlural}**.\n\n` +
                  `This operation is **permanent** and **cannot be undone**.\n\n` +
                  `To proceed, call this tool again with \`confirm: true\`.`,
              },
            ],
          };
        }
  
        const service = getPowerPlatformService();
        await service.deleteRecord(entityNamePlural, recordId);
  
        return {
          content: [
            {
              type: "text",
              text: `✅ Record deleted successfully\n\n` +
                `**Entity:** ${entityNamePlural}\n` +
                `**Record ID:** ${recordId}\n\n` +
                `⚠️  This operation is permanent.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error deleting record:", error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to delete record: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

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

  console.error("powerplatform tools registered: 24 tools, 9 prompts");
