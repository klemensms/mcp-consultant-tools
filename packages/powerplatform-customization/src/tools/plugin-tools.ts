/**
 * Plugin Tools - 8 tools for plugin assembly and step management
 *
 * Tools: create-plugin-assembly, update-plugin-assembly, register-plugin-step,
 *        register-plugin-image, deploy-plugin-complete, get-plugin-deploy-status,
 *        get-plugin-packages, deploy-plugin-pkg
 */
import { z } from 'zod';
import { assertNoTraversal } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../types.js';
import { descWithExamples, ENTITY_NAME_EXAMPLES, PLUGIN_STAGE_EXAMPLES, SDK_MESSAGE_EXAMPLES } from '../tool-examples.js';

export function registerPluginTools(server: any, ctx: ServiceContext): void {

const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

server.tool(
  "create-plugin-assembly",
  "Upload a compiled plugin DLL to Dynamics 365 from local file system.",
  {
    assemblyPath: z.string().describe("Local file path to compiled DLL (e.g., C:\\Dev\\MyPlugin\\bin\\Release\\net462\\MyPlugin.dll)"),
    assemblyName: z.string().describe("Friendly name for the assembly (e.g., MyPlugin)"),
    version: z.string().optional().describe("Version string (auto-extracted if omitted, e.g., '1.0.0.0')"),
    isolationMode: z.number().optional().describe("Isolation mode: 2=Sandbox (default, required for production)"),
    description: z.string().optional().describe("Assembly description"),
    solutionUniqueName: z.string().optional().describe("Solution to add assembly to"),
  },
  async ({ assemblyPath, assemblyName, version, isolationMode, description, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;

      const fs = await import('fs/promises');
      const normalizedPath = assertNoTraversal(assemblyPath);
      const dllBuffer = await fs.readFile(normalizedPath);
      const dllBase64 = dllBuffer.toString('base64');

      const header = dllBuffer.toString('utf8', 0, 2);
      if (header !== 'MZ') {
        throw new Error('Invalid .NET assembly format (missing MZ header)');
      }

      const extractedVersion = version || await service.extractAssemblyVersion(assemblyPath);

      const result = await service.createPluginAssembly({
        name: assemblyName,
        content: dllBase64,
        version: extractedVersion,
        isolationMode: isolationMode ?? 2,
        description,
        solutionUniqueName: solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
      }) as any;

      return {
        content: [{
          type: "text",
          text: `Plugin assembly '${assemblyName}' uploaded successfully\n\n` +
                `Assembly ID: ${result.pluginAssemblyId}\n` +
                `Version: ${extractedVersion}\n` +
                `Size: ${(dllBuffer.length / 1024).toFixed(2)} KB\n` +
                `Plugin Types Created: ${result.pluginTypes.length}\n\n` +
                `Plugin Types:\n${result.pluginTypes.map((t: any) => `  - ${t.typeName} (${t.pluginTypeId})`).join('\n') || '  (none created yet - check System Jobs)'}`
        }]
      };
    } catch (error: any) {
      console.error("Error creating plugin assembly:", error);
      return { content: [{ type: "text", text: `Failed to create plugin assembly: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "update-plugin-assembly",
  "Update an existing plugin assembly with new compiled DLL.",
  {
    assemblyId: z.string().describe("Assembly ID (GUID)"),
    assemblyPath: z.string().describe("Local file path to new compiled DLL"),
    version: z.string().optional().describe("Version string (auto-extracted if omitted)"),
    solutionUniqueName: z.string().optional().describe("Solution context"),
  },
  async ({ assemblyId, assemblyPath, version, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;

      const fs = await import('fs/promises');
      const normalizedPath = assertNoTraversal(assemblyPath);
      const dllBuffer = await fs.readFile(normalizedPath);
      const dllBase64 = dllBuffer.toString('base64');

      const extractedVersion = version || await service.extractAssemblyVersion(assemblyPath);

      await service.updatePluginAssembly(
        assemblyId, dllBase64, extractedVersion,
        solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION
      );

      return {
        content: [{
          type: "text",
          text: `Plugin assembly updated successfully\n\n` +
                `Assembly ID: ${assemblyId}\n` +
                `Version: ${extractedVersion}\n` +
                `Size: ${(dllBuffer.length / 1024).toFixed(2)} KB\n\n` +
                `Note: Existing plugin steps remain registered and active.`
        }]
      };
    } catch (error: any) {
      console.error("Error updating plugin assembly:", error);
      return { content: [{ type: "text", text: `Failed to update plugin assembly: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "register-plugin-step",
  "Register a plugin step on an SDK message. The plugin assembly must already be uploaded.",
  {
    assemblyName: z.string().describe("Assembly name (e.g., MyPlugin)"),
    pluginTypeName: z.string().describe("Full type name including namespace (e.g., 'MyOrg.Plugins.ContactPlugin')"),
    stepName: z.string().describe("Friendly step name (e.g., 'Contact: Update - Post-Operation')"),
    messageName: z.string().describe(
      descWithExamples("SDK message to trigger on", SDK_MESSAGE_EXAMPLES)
    ),
    primaryEntity: z.string().describe(
      descWithExamples("Entity logical name", ENTITY_NAME_EXAMPLES)
    ),
    stage: z.enum(['PreValidation', 'PreOperation', 'PostOperation']).describe(
      descWithExamples("Execution stage in the pipeline", PLUGIN_STAGE_EXAMPLES)
    ),
    executionMode: z.enum(['Sync', 'Async']).describe("Execution mode. Sync=inline (blocking), Async=background (non-blocking)"),
    rank: z.number().optional().describe("Execution order (default: 1, lower runs first)"),
    filteringAttributes: z.array(z.string()).optional().describe("Fields to monitor for Update message (e.g., ['firstname', 'lastname']). Empty = all fields."),
    configuration: z.string().optional().describe("Secure/unsecure config JSON"),
    solutionUniqueName: z.string().optional(),
  },
  async (params: any) => {
    try {
      const service = ctx.pp;

      const pluginTypeId = await service.queryPluginTypeByTypename(params.pluginTypeName);

      const stageMap: Record<string, number> = {
        PreValidation: 10, PreOperation: 20, PostOperation: 40
      };
      const modeMap: Record<string, number> = { Sync: 0, Async: 1 };

      const result = await service.registerPluginStep({
        pluginTypeId,
        name: params.stepName,
        messageName: params.messageName,
        primaryEntityName: params.primaryEntity,
        stage: stageMap[params.stage],
        executionMode: modeMap[params.executionMode],
        rank: params.rank ?? 1,
        filteringAttributes: params.filteringAttributes?.join(','),
        configuration: params.configuration,
        solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
      }) as any;

      return {
        content: [{
          type: "text",
          text: `Plugin step '${params.stepName}' registered successfully\n\n` +
                `Step ID: ${result.stepId}\n` +
                `Message: ${params.messageName}\n` +
                `Entity: ${params.primaryEntity}\n` +
                `Stage: ${params.stage}\n` +
                `Mode: ${params.executionMode}\n` +
                `Rank: ${params.rank ?? 1}\n` +
                (params.filteringAttributes?.length ? `Filtering: ${params.filteringAttributes.join(', ')}\n` : '')
        }]
      };
    } catch (error: any) {
      console.error("Error registering plugin step:", error);
      return { content: [{ type: "text", text: `Failed to register plugin step: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "register-plugin-image",
  "Add a pre/post image to a plugin step for accessing entity data.",
  {
    stepId: z.string().describe("Plugin step ID (from register-plugin-step)"),
    imageName: z.string().describe("Image name (e.g., 'PreImage', 'PostImage')"),
    imageType: z.enum(['PreImage', 'PostImage', 'Both']).describe("Image type"),
    entityAlias: z.string().describe("Alias for code access (e.g., 'target', 'preimage')"),
    attributes: z.array(z.string()).optional().describe("Attributes to include (empty = all)"),
    messagePropertyName: z.string().optional().describe("Message property (default: 'Target')"),
  },
  async (params: any) => {
    try {
      const service = ctx.pp;

      const imageTypeMap: Record<string, number> = { PreImage: 0, PostImage: 1, Both: 2 };

      const result = await service.registerPluginImage({
        stepId: params.stepId,
        name: params.imageName,
        imageType: imageTypeMap[params.imageType],
        entityAlias: params.entityAlias,
        attributes: params.attributes?.join(','),
        messagePropertyName: params.messagePropertyName || 'Target',
      }) as any;

      return {
        content: [{
          type: "text",
          text: `Plugin image '${params.imageName}' registered successfully\n\n` +
                `Image ID: ${result.imageId}\n` +
                `Type: ${params.imageType}\n` +
                `Alias: ${params.entityAlias}\n` +
                `Attributes: ${params.attributes?.length ? params.attributes.join(', ') : 'All attributes'}`
        }]
      };
    } catch (error: any) {
      console.error("Error registering plugin image:", error);
      return { content: [{ type: "text", text: `Failed to register plugin image: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "deploy-plugin-complete",
  "End-to-end plugin deployment: upload DLL, register steps, configure images, and publish. Automatically rolls back on failure. Prefer this over individual create/register tools.",
  {
    assemblyPath: z.string().describe("Local file path to compiled DLL (e.g., 'C:\\Dev\\MyPlugin\\bin\\Release\\net462\\MyPlugin.dll')"),
    assemblyName: z.string().describe("Assembly name (e.g., 'MyPlugin')"),
    stepConfigurations: z.array(z.object({
      pluginTypeName: z.string(),
      stepName: z.string(),
      messageName: z.string(),
      primaryEntity: z.string(),
      stage: z.enum(['PreValidation', 'PreOperation', 'PostOperation']),
      executionMode: z.enum(['Sync', 'Async']),
      rank: z.number().optional(),
      filteringAttributes: z.array(z.string()).optional(),
      preImage: z.object({
        name: z.string(),
        alias: z.string(),
        attributes: z.array(z.string()).optional(),
      }).optional(),
      postImage: z.object({
        name: z.string(),
        alias: z.string(),
        attributes: z.array(z.string()).optional(),
      }).optional(),
    })).optional().describe("Step configurations (manual registration)"),
    solutionUniqueName: z.string().optional(),
    replaceExisting: z.boolean().optional().describe("Update existing assembly vs. create new"),
  },
  async (params: any) => {
    const service = ctx.pp;

    let createdAssemblyId: string | null = null;
    let isNewAssembly = false;
    const createdStepIds: string[] = [];

    const summary: any = {
      phases: {
        deploy: {},
        register: { stepsCreated: 0, imagesCreated: 0 },
      },
    };

    let dllBuffer: Buffer;

    try {
      const fs = await import('fs/promises');
      const normalizedPath = params.assemblyPath.replace(/\\/g, '/');
      dllBuffer = await fs.readFile(normalizedPath);
      const dllBase64 = dllBuffer.toString('base64');
      const version = await service.extractAssemblyVersion(params.assemblyPath);

      const existingAssemblyId = await service.queryPluginAssemblyByName(params.assemblyName);

      if (existingAssemblyId) {
        await service.updatePluginAssembly(
          existingAssemblyId, dllBase64, version,
          params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION
        );
        summary.phases.deploy = {
          action: 'updated',
          assemblyId: existingAssemblyId,
          version,
          pluginTypes: await service.getPluginTypesForAssembly(existingAssemblyId),
        };
      } else {
        if (params.replaceExisting) {
          console.error(`Warning: Assembly '${params.assemblyName}' not found for update. Creating new assembly instead.`);
        }

        const uploadResult = await service.createPluginAssembly({
          name: params.assemblyName,
          content: dllBase64,
          version,
          solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
        }) as any;

        createdAssemblyId = uploadResult.pluginAssemblyId;
        isNewAssembly = true;

        summary.phases.deploy = {
          action: 'created',
          assemblyId: uploadResult.pluginAssemblyId,
          version,
          pluginTypes: uploadResult.pluginTypes,
        };
      }

      if (params.stepConfigurations) {
        const stageMap: Record<string, number> = {
          PreValidation: 10, PreOperation: 20, PostOperation: 40
        };
        const modeMap: Record<string, number> = { Sync: 0, Async: 1 };

        for (const stepConfig of params.stepConfigurations) {
          const pluginTypeId = await service.queryPluginTypeByTypename(stepConfig.pluginTypeName);

          const stepResult = await service.registerPluginStep({
            pluginTypeId: pluginTypeId,
            name: stepConfig.stepName,
            messageName: stepConfig.messageName,
            primaryEntityName: stepConfig.primaryEntity,
            stage: stageMap[stepConfig.stage],
            executionMode: modeMap[stepConfig.executionMode],
            rank: stepConfig.rank ?? 1,
            filteringAttributes: stepConfig.filteringAttributes?.join(','),
            solutionUniqueName: params.solutionUniqueName || POWERPLATFORM_DEFAULT_SOLUTION,
          }) as any;

          createdStepIds.push(stepResult.stepId);
          summary.phases.register.stepsCreated++;

          if (stepConfig.preImage) {
            await service.registerPluginImage({
              stepId: stepResult.stepId,
              name: stepConfig.preImage.name,
              imageType: 0,
              entityAlias: stepConfig.preImage.alias,
              attributes: stepConfig.preImage.attributes?.join(','),
            });
            summary.phases.register.imagesCreated++;
          }

          if (stepConfig.postImage) {
            await service.registerPluginImage({
              stepId: stepResult.stepId,
              name: stepConfig.postImage.name,
              imageType: 1,
              entityAlias: stepConfig.postImage.alias,
              attributes: stepConfig.postImage.attributes?.join(','),
            });
            summary.phases.register.imagesCreated++;
          }
        }
      }

      await service.publishAllCustomizations();
      summary.phases.publish = { success: true };

      return {
        content: [{
          type: "text",
          text: `Plugin deployment completed successfully!\n\n` +
                `Assembly: ${summary.phases.deploy.action === 'created' ? 'Created' : 'Updated'}\n` +
                `Assembly ID: ${summary.phases.deploy.assemblyId}\n` +
                `Version: ${summary.phases.deploy.version}\n` +
                `Size: ${(dllBuffer.length / 1024).toFixed(2)} KB\n` +
                (summary.phases.deploy.pluginTypes ? `Plugin Types: ${summary.phases.deploy.pluginTypes.length}\n` : '') +
                `Steps Created: ${summary.phases.register.stepsCreated}\n` +
                `Images Created: ${summary.phases.register.imagesCreated}\n` +
                `Published: ${summary.phases.publish.success ? 'Yes' : 'No'}\n\n` +
                `Deployment is complete and active in the environment!`
        }]
      };
    } catch (error: any) {
      let rollbackMessage = '';

      if (createdStepIds.length > 0 || (createdAssemblyId && isNewAssembly)) {
        rollbackMessage = '\n\nRollback initiated:\n';

        for (const stepId of createdStepIds.reverse()) {
          try {
            await service.deletePluginStep(stepId);
            rollbackMessage += `- Deleted step: ${stepId}\n`;
          } catch (rollbackError: any) {
            rollbackMessage += `- Failed to delete step ${stepId}: ${rollbackError.message}\n`;
          }
        }

        if (createdAssemblyId && isNewAssembly) {
          try {
            await service.deletePluginAssembly(createdAssemblyId);
            rollbackMessage += `- Deleted assembly: ${createdAssemblyId}\n`;
          } catch (rollbackError: any) {
            rollbackMessage += `- Failed to delete assembly ${createdAssemblyId}: ${rollbackError.message}\n`;
          }
        }

        rollbackMessage += '\nPlease verify cleanup in Power Platform.';
      }

      console.error("Error deploying plugin:", error);
      return { content: [{ type: "text", text: `Failed to deploy plugin: ${error.message}${rollbackMessage}` }], isError: true };
    }
  }
);

server.tool(
  "get-plugin-deploy-status",
  "Get the current deployment status of a plugin assembly, including all registered types, steps, and images. Useful for verifying deployments and troubleshooting.",
  {
    assemblyName: z.string().describe("Name of the plugin assembly to check"),
    includeDisabled: z.boolean().optional().describe("Include disabled steps (default: false)"),
  },
  async (params: any) => {
    try {
      const service = ctx.pp;

      const assemblyId = await service.queryPluginAssemblyByName(params.assemblyName);

      if (!assemblyId) {
        return {
          content: [{
            type: "text",
            text: `Assembly '${params.assemblyName}' not found in Dataverse.\n\n` +
                  `Possible reasons:\n` +
                  `- Assembly has not been deployed yet\n` +
                  `- Assembly name is incorrect (case-sensitive)\n` +
                  `- Assembly was deleted\n\n` +
                  `Use 'create-plugin-assembly' or 'deploy-plugin-complete' to deploy.`
          }]
        };
      }

      const result = await service.getPluginAssemblyComplete(params.assemblyName, params.includeDisabled || false) as any;

      let statusReport = `PLUGIN DEPLOYMENT STATUS\n`;
      statusReport += `${'='.repeat(50)}\n\n`;

      statusReport += `ASSEMBLY\n`;
      statusReport += `---------\n`;
      statusReport += `Name: ${result.assembly.name}\n`;
      statusReport += `Version: ${result.assembly.version}\n`;
      statusReport += `ID: ${result.assembly.pluginassemblyid}\n`;
      statusReport += `Isolation Mode: ${result.assembly.isolationmode === 2 ? 'Sandbox' : 'None'}\n`;
      statusReport += `Is Managed: ${result.assembly.ismanaged ? 'Yes' : 'No'}\n`;
      statusReport += `Modified: ${result.assembly.modifiedon}\n`;
      statusReport += `Modified By: ${result.assembly.modifiedby?.fullname || 'Unknown'}\n\n`;

      statusReport += `PLUGIN TYPES (${result.pluginTypes.length})\n`;
      statusReport += `-------------\n`;
      if (result.pluginTypes.length === 0) {
        statusReport += `No plugin types found. This may indicate:\n`;
        statusReport += `- Dataverse is still processing the assembly\n`;
        statusReport += `- The DLL does not contain any IPlugin implementations\n\n`;
      } else {
        for (const type of result.pluginTypes) {
          statusReport += `- ${type.typename}\n`;
          statusReport += `  ID: ${type.plugintypeid}\n`;
        }
        statusReport += `\n`;
      }

      const stageNames: Record<number, string> = { 10: 'PreValidation', 20: 'PreOperation', 40: 'PostOperation' };
      const modeNames: Record<number, string> = { 0: 'Sync', 1: 'Async' };

      statusReport += `REGISTERED STEPS (${result.steps.length})\n`;
      statusReport += `------------------\n`;
      if (result.steps.length === 0) {
        statusReport += `No steps registered.\n\n`;
      } else {
        for (const step of result.steps) {
          const status = step.statuscode === 1 ? 'Active' : 'Disabled';

          statusReport += `- ${step.name}\n`;
          statusReport += `  Message: ${step.sdkmessageid?.name || 'Unknown'} on ${step.sdkmessagefilterid?.primaryobjecttypecode || 'Unknown'}\n`;
          statusReport += `  Stage: ${stageNames[step.stage] || step.stage}, Mode: ${modeNames[step.mode] || step.mode}\n`;
          statusReport += `  Status: ${status}, Rank: ${step.rank}\n`;
          statusReport += `  ID: ${step.sdkmessageprocessingstepid}\n`;

          if (step.images && step.images.length > 0) {
            statusReport += `  Images:\n`;
            for (const img of step.images) {
              const imgType = img.imagetype === 0 ? 'Pre' : img.imagetype === 1 ? 'Post' : 'Both';
              statusReport += `    - ${img.name} (${imgType}Image, alias: ${img.entityalias})\n`;
            }
          }
          statusReport += `\n`;
        }
      }

      statusReport += `VALIDATION\n`;
      statusReport += `----------\n`;
      if (result.validation.potentialIssues.length === 0) {
        statusReport += `No issues detected.\n`;
      } else {
        for (const issue of result.validation.potentialIssues) {
          statusReport += `Warning: ${issue}\n`;
        }
      }

      return { content: [{ type: "text", text: statusReport }] };
    } catch (error: any) {
      console.error("Error getting plugin deployment status:", error);
      return { content: [{ type: "text", text: `Failed to get plugin deployment status: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "get-plugin-packages",
  "List NuGet-based plugin packages deployed in the environment.",
  {
    includeManaged: z.boolean().optional().describe("Include managed packages (default: false)"),
    maxRecords: z.number().optional().describe("Maximum records to return (default: 100)"),
  },
  async ({ includeManaged, maxRecords }: any) => {
    try {
      const service = ctx.pp;
      const packages = await service.getPluginPackages(includeManaged, maxRecords) as any[];

      if (packages.length === 0) {
        return { content: [{ type: "text", text: "No plugin packages found." }] };
      }

      const lines = packages.map((p: any) =>
        `- **${p.uniquename}** (v${p.version}) [${p.pluginpackageid}]${p.ismanaged ? ' [managed]' : ''} - Modified: ${p.modifiedon}`
      );

      return {
        content: [{
          type: "text",
          text: `Plugin Packages (${packages.length}):\n\n${lines.join('\n')}`
        }]
      };
    } catch (error: any) {
      console.error("Error getting plugin packages:", error);
      return { content: [{ type: "text", text: `Failed to get plugin packages: ${error.message}` }], isError: true };
    }
  }
);

server.tool(
  "deploy-plugin-pkg",
  "Deploy a NuGet plugin package (.nupkg) to Dataverse. Creates or updates the package automatically.",
  {
    packagePath: z.string().describe("Local file path to the .nupkg file (e.g., C:\\Dev\\MyPlugin\\bin\\Release\\MyPlugin.1.0.0.nupkg)"),
    uniqueName: z.string().optional().describe("Unique name for the package (defaults to filename without extension)"),
    version: z.string().optional().describe("Package version (default: '1.0.0.0')"),
    solutionUniqueName: z.string().optional().describe("Solution to add the package to"),
  },
  async ({ packagePath, uniqueName, version, solutionUniqueName }: any) => {
    try {
      const service = ctx.pp;
      const fs = await import('fs/promises');
      const path = await import('path');

      const normalizedPath = packagePath.replace(/\\/g, '/');
      const buffer = await fs.readFile(normalizedPath);

      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
        throw new Error('Invalid .nupkg file (not a valid zip/NuGet package)');
      }

      const content = buffer.toString('base64');
      const resolvedName = uniqueName || path.basename(normalizedPath).replace(/\.nupkg$/i, '');
      const resolvedVersion = version || '1.0.0.0';

      const result = await service.deployPluginPackage({
        content,
        uniqueName: resolvedName,
        version: resolvedVersion,
        solutionUniqueName: solutionUniqueName || undefined,
      }) as any;

      return {
        content: [{
          type: "text",
          text: `Plugin package ${result.action} successfully.\n\n` +
                `**Package ID:** ${result.pluginpackageid}\n` +
                `**Unique Name:** ${resolvedName}\n` +
                `**Version:** ${resolvedVersion}\n` +
                `**Size:** ${(buffer.length / 1024).toFixed(2)} KB\n` +
                `**Action:** ${result.action}`
        }]
      };
    } catch (error: any) {
      console.error("Error deploying plugin package:", error);
      return { content: [{ type: "text", text: `Failed to deploy plugin package: ${error.message}` }], isError: true };
    }
  }
);

}
