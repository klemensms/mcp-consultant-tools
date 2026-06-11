/**
 * Configuration CLI Commands - 1 command
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerConfigurationCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('config')
    .description('Get configured organization and projects')
    .action(async () => {
      try {
        const config = ctx.configuration.getConfiguration();
        if (!config) {
          process.stderr.write('Azure DevOps not configured. Set AZUREDEVOPS_ORGANIZATION and AZUREDEVOPS_PROJECTS.\n');
          process.exit(1);
        }
        outputResult(
          { fileName: 'configuration', data: config, summary: `Organization: ${(config as any)?.organization || 'unknown'}\nProjects: ${(config as any)?.projects?.join(', ') || 'none'}` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get configuration'); }
    });
}
