/**
 * Figma Data CLI Commands - maps to get-figma-data MCP tool
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import type { FigmaDataOptions } from '../../models/api-types.js';
import { outputResult } from '../output.js';

export function registerFigmaDataCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('get-data')
    .description('Get comprehensive Figma design data in simplified, AI-friendly format')
    .argument('<fileKey>', 'Figma file key (alphanumeric string from URL)')
    .option('-n, --node-id <nodeId>', 'Specific node ID(s) to fetch (format: "1234:5678" or "1:10;2:20")')
    .option('-d, --depth <depth>', 'Tree traversal depth limit')
    .option('--no-exclude-styles', 'Include all styling info (default: excluded)')
    .option('--no-tables-to-markdown', 'Keep TABLE nodes as nested structures (default: converted to markdown)')
    .option('--no-simplify-connectors', 'Keep full CONNECTOR node data (default: simplified)')
    .option('--no-simplify-components', 'Keep full INSTANCE node data (default: simplified)')
    .option('--extractors <extractors>', 'Comma-separated list of extractors: layout,text,visuals,component')
    .action(async (fileKey: string, opts: any) => {
      try {
        const extractors = opts.extractors
          ? opts.extractors.split(',').map((e: string) => e.trim()) as ("layout" | "text" | "visuals" | "component")[]
          : undefined;

        const dataOptions: FigmaDataOptions = {
          excludeStyles: opts.excludeStyles,
          tablesToMarkdown: opts.tablesToMarkdown,
          simplifyConnectors: opts.simplifyConnectors,
          simplifyComponentInstances: opts.simplifyComponents,
          extractors,
        };

        const depth = opts.depth ? parseInt(opts.depth) : undefined;
        const result = await ctx.figma.getFigmaData(fileKey, opts.nodeId, depth, dataOptions);

        const nodeCount = Array.isArray(result.nodes) ? result.nodes.length : 0;
        outputResult(
          {
            fileName: `figma-data-${fileKey}`,
            data: result,
            summary: `Fetched Figma data for file '${fileKey}'${opts.nodeId ? ` (node: ${opts.nodeId})` : ''} - ${nodeCount} top-level node(s)`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get figma data'); }
    });
}
