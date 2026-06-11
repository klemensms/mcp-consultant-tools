/**
 * ADO Story Extraction CLI Commands - maps to extract-ado-stories MCP tool
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import type { FigmaDataOptions } from '../../models/api-types.js';
import { extractAdoStories } from '../../figma/extractors/ado-story-extractor.js';
import { outputResult } from '../output.js';

export function registerAdoStoryCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('extract-ado-stories')
    .description('Extract ADO User Story Components from a FigJam board or section')
    .argument('<fileKey>', 'Figma file key (alphanumeric string from URL)')
    .option('-n, --node-id <nodeId>', 'Section node ID to scope extraction')
    .option('--ado-org <org>', 'Azure DevOps organization name (for constructing work item links)')
    .option('--ado-project <project>', 'Azure DevOps project name (for constructing work item links)')
    .option('--include-placeholders', 'Include ADO components with placeholder IDs (e.g. "ADO xxxxx")', false)
    .action(async (fileKey: string, opts: any) => {
      try {
        // Fetch with component properties preserved
        const dataOptions: FigmaDataOptions = {
          excludeStyles: true,
          simplifyComponentInstances: true,
          simplifyConnectors: true,
          tablesToMarkdown: true,
        };

        const rawData = await ctx.figma.getFigmaData(fileKey, opts.nodeId, undefined, dataOptions);

        const result = extractAdoStories(rawData, {
          fileKey,
          adoOrganization: opts.adoOrg,
          adoProject: opts.adoProject,
          includePlaceholders: opts.includePlaceholders,
        });

        const statesSummary = Object.entries(result.byState)
          .map(([state, count]) => `${state}: ${count}`)
          .join(', ');

        outputResult(
          {
            fileName: `figma-ado-stories-${fileKey}`,
            data: result,
            summary: `Extracted ${result.totalCount} ADO story component(s) from '${fileKey}'${opts.nodeId ? ` (node: ${opts.nodeId})` : ''}${statesSummary ? ` [${statesSummary}]` : ''}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'extract ADO stories'); }
    });
}
