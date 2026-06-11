/**
 * Plugin CLI commands: create-assembly, update-assembly, register-step, register-image,
 *                      deploy, deploy-status, packages, deploy-pkg
 */
import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { outputResult, handleCliError } from '../output.js';

export function registerPluginCommands(program: Command, ctx: ServiceContext): void {

  const plugin = program.command('plugin').description('Plugin assembly and step operations');

  plugin
    .command('create-assembly')
    .description('Upload a compiled plugin DLL to Dynamics 365')
    .requiredOption('--assembly-path <path>', 'Local file path to compiled DLL')
    .requiredOption('--assembly-name <name>', 'Friendly name for the assembly')
    .option('--version <ver>', 'Version string (auto-extracted if omitted)')
    .option('--isolation-mode <n>', 'Isolation mode: 2=Sandbox (default)', parseInt as any)
    .option('--description <desc>', 'Assembly description')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const fs = await import('fs/promises');
        const normalizedPath = opts.assemblyPath.replace(/\\/g, '/');
        const dllBuffer = await fs.readFile(normalizedPath);
        const dllBase64 = dllBuffer.toString('base64');

        const header = dllBuffer.toString('utf8', 0, 2);
        if (header !== 'MZ') {
          throw new Error('Invalid .NET assembly format (missing MZ header)');
        }

        const extractedVersion = opts.version || await service.extractAssemblyVersion(opts.assemblyPath);
        const result = await service.createPluginAssembly({
          name: opts.assemblyName,
          content: dllBase64,
          version: extractedVersion,
          isolationMode: opts.isolationMode ?? 2,
          description: opts.description,
          solutionUniqueName: opts.solution || POWERPLATFORM_DEFAULT_SOLUTION,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  plugin
    .command('update-assembly')
    .description('Update an existing plugin assembly with new compiled DLL')
    .requiredOption('--assembly-id <guid>', 'Assembly ID (GUID)')
    .requiredOption('--assembly-path <path>', 'Local file path to new compiled DLL')
    .option('--version <ver>', 'Version string (auto-extracted if omitted)')
    .option('--solution <name>', 'Solution context')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const fs = await import('fs/promises');
        const normalizedPath = opts.assemblyPath.replace(/\\/g, '/');
        const dllBuffer = await fs.readFile(normalizedPath);
        const dllBase64 = dllBuffer.toString('base64');

        const extractedVersion = opts.version || await service.extractAssemblyVersion(opts.assemblyPath);
        await service.updatePluginAssembly(
          opts.assemblyId, dllBase64, extractedVersion,
          opts.solution || POWERPLATFORM_DEFAULT_SOLUTION
        );
        outputResult({ success: true, assemblyId: opts.assemblyId, version: extractedVersion });
      } catch (error) {
        handleCliError(error);
      }
    });

  plugin
    .command('register-step')
    .description('Register a plugin step on an SDK message')
    .requiredOption('--assembly-name <name>', 'Assembly name')
    .requiredOption('--plugin-type-name <name>', 'Full type name including namespace')
    .requiredOption('--step-name <name>', 'Friendly step name')
    .requiredOption('--message-name <name>', 'SDK message: Create, Update, Delete, etc.')
    .requiredOption('--primary-entity <name>', 'Entity logical name')
    .requiredOption('--stage <stage>', 'Execution stage: PreValidation, PreOperation, PostOperation')
    .requiredOption('--execution-mode <mode>', 'Execution mode: Sync, Async')
    .option('--rank <n>', 'Execution order (default: 1)', parseInt as any)
    .option('--filtering-attributes <attrs>', 'Comma-separated fields to monitor for Update message')
    .option('--configuration <json>', 'Secure/unsecure config JSON')
    .option('--solution <name>', 'Solution unique name')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

        const pluginTypeId = await service.queryPluginTypeByTypename(opts.pluginTypeName);
        const stageMap: Record<string, number> = {
          PreValidation: 10, PreOperation: 20, PostOperation: 40
        };
        const modeMap: Record<string, number> = { Sync: 0, Async: 1 };

        const result = await service.registerPluginStep({
          pluginTypeId,
          name: opts.stepName,
          messageName: opts.messageName,
          primaryEntityName: opts.primaryEntity,
          stage: stageMap[opts.stage],
          executionMode: modeMap[opts.executionMode],
          rank: opts.rank ?? 1,
          filteringAttributes: opts.filteringAttributes || undefined,
          configuration: opts.configuration,
          solutionUniqueName: opts.solution || POWERPLATFORM_DEFAULT_SOLUTION,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  plugin
    .command('register-image')
    .description('Add a pre/post image to a plugin step')
    .requiredOption('--step-id <guid>', 'Plugin step ID')
    .requiredOption('--image-name <name>', 'Image name (e.g., PreImage, PostImage)')
    .requiredOption('--image-type <type>', 'Image type: PreImage, PostImage, Both')
    .requiredOption('--entity-alias <alias>', 'Alias for code access (e.g., target, preimage)')
    .option('--attributes <attrs>', 'Comma-separated attributes to include (empty = all)')
    .option('--message-property-name <name>', 'Message property (default: Target)')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const imageTypeMap: Record<string, number> = { PreImage: 0, PostImage: 1, Both: 2 };
        const result = await service.registerPluginImage({
          stepId: opts.stepId,
          name: opts.imageName,
          imageType: imageTypeMap[opts.imageType],
          entityAlias: opts.entityAlias,
          attributes: opts.attributes || undefined,
          messagePropertyName: opts.messagePropertyName || 'Target',
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  plugin
    .command('deploy')
    .description('End-to-end plugin deployment: upload DLL, register steps, configure images, publish')
    .requiredOption('--assembly-path <path>', 'Local file path to compiled DLL')
    .requiredOption('--assembly-name <name>', 'Assembly name')
    .option('--step-configurations <json>', 'JSON array of step configurations')
    .option('--solution <name>', 'Solution unique name')
    .option('--replace-existing', 'Update existing assembly vs. create new', false)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";
        const fs = await import('fs/promises');
        const normalizedPath = opts.assemblyPath.replace(/\\/g, '/');
        const dllBuffer = await fs.readFile(normalizedPath);
        const dllBase64 = dllBuffer.toString('base64');
        const version = await service.extractAssemblyVersion(opts.assemblyPath);

        const stepConfigurations = opts.stepConfigurations
          ? JSON.parse(opts.stepConfigurations) : undefined;

        const existingAssemblyId = await service.queryPluginAssemblyByName(opts.assemblyName);

        let assemblyResult: any;
        if (existingAssemblyId) {
          await service.updatePluginAssembly(
            existingAssemblyId, dllBase64, version,
            opts.solution || POWERPLATFORM_DEFAULT_SOLUTION
          );
          assemblyResult = { action: 'updated', assemblyId: existingAssemblyId };
        } else {
          const uploadResult = await service.createPluginAssembly({
            name: opts.assemblyName,
            content: dllBase64,
            version,
            solutionUniqueName: opts.solution || POWERPLATFORM_DEFAULT_SOLUTION,
          }) as any;
          assemblyResult = { action: 'created', assemblyId: uploadResult.pluginAssemblyId };
        }

        if (stepConfigurations) {
          const stageMap: Record<string, number> = {
            PreValidation: 10, PreOperation: 20, PostOperation: 40
          };
          const modeMap: Record<string, number> = { Sync: 0, Async: 1 };

          for (const stepConfig of stepConfigurations) {
            const pluginTypeId = await service.queryPluginTypeByTypename(stepConfig.pluginTypeName);
            const stepResult = await service.registerPluginStep({
              pluginTypeId,
              name: stepConfig.stepName,
              messageName: stepConfig.messageName,
              primaryEntityName: stepConfig.primaryEntity,
              stage: stageMap[stepConfig.stage],
              executionMode: modeMap[stepConfig.executionMode],
              rank: stepConfig.rank ?? 1,
              filteringAttributes: stepConfig.filteringAttributes?.join(','),
              solutionUniqueName: opts.solution || POWERPLATFORM_DEFAULT_SOLUTION,
            }) as any;

            if (stepConfig.preImage) {
              await service.registerPluginImage({
                stepId: stepResult.stepId,
                name: stepConfig.preImage.name,
                imageType: 0,
                entityAlias: stepConfig.preImage.alias,
                attributes: stepConfig.preImage.attributes?.join(','),
              });
            }
            if (stepConfig.postImage) {
              await service.registerPluginImage({
                stepId: stepResult.stepId,
                name: stepConfig.postImage.name,
                imageType: 1,
                entityAlias: stepConfig.postImage.alias,
                attributes: stepConfig.postImage.attributes?.join(','),
              });
            }
          }
        }

        await service.publishAllCustomizations();
        outputResult({ ...assemblyResult, version, published: true });
      } catch (error) {
        handleCliError(error);
      }
    });

  plugin
    .command('deploy-status')
    .description('Get deployment status of a plugin assembly')
    .requiredOption('--assembly-name <name>', 'Name of the plugin assembly to check')
    .option('--include-disabled', 'Include disabled steps', false)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const assemblyId = await service.queryPluginAssemblyByName(opts.assemblyName);
        if (!assemblyId) {
          outputResult({ found: false, message: `Assembly '${opts.assemblyName}' not found` });
          return;
        }
        const result = await service.getPluginAssemblyComplete(opts.assemblyName, opts.includeDisabled || false);
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });

  plugin
    .command('packages')
    .description('List NuGet-based plugin packages deployed in the environment')
    .option('--include-managed', 'Include managed packages', false)
    .option('--max-records <n>', 'Maximum records to return (default: 100)', parseInt as any)
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const packages = await service.getPluginPackages(opts.includeManaged, opts.maxRecords);
        outputResult(packages);
      } catch (error) {
        handleCliError(error);
      }
    });

  plugin
    .command('deploy-pkg')
    .description('Deploy a NuGet plugin package (.nupkg) to Dataverse')
    .requiredOption('--package-path <path>', 'Local file path to the .nupkg file')
    .option('--unique-name <name>', 'Unique name for the package (defaults to filename)')
    .option('--version <ver>', 'Package version (default: 1.0.0.0)')
    .option('--solution <name>', 'Solution to add the package to')
    .action(async (opts) => {
      try {
        const service = ctx.pp;
        const fs = await import('fs/promises');
        const path = await import('path');

        const normalizedPath = opts.packagePath.replace(/\\/g, '/');
        const buffer = await fs.readFile(normalizedPath);

        if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
          throw new Error('Invalid .nupkg file (not a valid zip/NuGet package)');
        }

        const content = buffer.toString('base64');
        const resolvedName = opts.uniqueName || path.basename(normalizedPath).replace(/\.nupkg$/i, '');
        const resolvedVersion = opts.version || '1.0.0.0';

        const result = await service.deployPluginPackage({
          content,
          uniqueName: resolvedName,
          version: resolvedVersion,
          solutionUniqueName: opts.solution || undefined,
        });
        outputResult(result);
      } catch (error) {
        handleCliError(error);
      }
    });
}
