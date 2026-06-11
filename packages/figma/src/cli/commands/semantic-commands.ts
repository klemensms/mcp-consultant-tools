/**
 * Semantic Extraction CLI Commands - maps to get-figma-semantic MCP tool
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import type { FigmaDataOptions } from '../../models/api-types.js';
import { extractSemanticData } from '../../figma/extractors/semantic-extractor.js';
import type { StickyCategory } from '../../figma/extractors/semantic-extractor.js';
import { outputResult } from '../output.js';

export function registerSemanticCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('get-semantic')
    .description('Extract semantically meaningful data from FigJam boards (diff-friendly)')
    .argument('<fileKey>', 'Figma file key (alphanumeric string from URL)')
    .option('-n, --node-id <nodeId>', 'Specific node/section ID to fetch')
    .option('--sticky-overrides <json>', 'JSON map of hex colors to sticky categories (e.g. \'{"#FF0000":"blocker"}\')')
    .option('--story-pattern <regex>', 'Custom regex pattern for extracting story IDs')
    .option('--screenshot', 'Save a 2x PNG screenshot of the node (requires --node-id)')
    .action(async (fileKey: string, opts: any) => {
      try {
        // Fetch with fills preserved for sticky categorization
        const dataOptions: FigmaDataOptions = {
          excludeStyles: false, // Need fills for sticky color detection
          simplifyConnectors: true,
          simplifyComponentInstances: true,
          tablesToMarkdown: true,
        };

        const rawData = await ctx.figma.getFigmaData(fileKey, opts.nodeId, undefined, dataOptions);

        // Parse sticky color overrides
        let stickyColorOverrides: Record<string, StickyCategory> | undefined;
        if (opts.stickyOverrides) {
          try {
            stickyColorOverrides = JSON.parse(opts.stickyOverrides);
          } catch {
            throw new Error(`Invalid JSON for --sticky-overrides: ${opts.stickyOverrides}`);
          }
        }

        // Parse custom story pattern
        let customPattern: RegExp | undefined;
        if (opts.storyPattern) {
          try {
            customPattern = new RegExp(opts.storyPattern, 'gi');
          } catch {
            throw new Error(`Invalid regex for --story-pattern: ${opts.storyPattern}`);
          }
        }

        const semanticData = extractSemanticData(rawData, fileKey, opts.nodeId, {
          stickyColorOverrides,
          storyIdPattern: customPattern,
        });

        const stickyCount = semanticData.stickies?.length ?? 0;
        const storyCount = semanticData.userStories?.length ?? 0;
        outputResult(
          {
            fileName: `figma-semantic-${fileKey}`,
            data: semanticData,
            summary: `Extracted semantic data from '${fileKey}'${opts.nodeId ? ` (node: ${opts.nodeId})` : ''} - ${stickyCount} sticky note(s), ${storyCount} user story ref(s)`,
          },
          getGlobalFlags(program)
        );

        // Optionally save a screenshot
        if (opts.screenshot && opts.nodeId) {
          try {
            const imageMap = await ctx.figma.getNodeImages(fileKey, [opts.nodeId], { format: 'png', scale: 2 });
            const imageUrl = imageMap[opts.nodeId];
            if (imageUrl) {
              const cacheDir = '.context/.mcp-figma-cache';
              const safeId = opts.nodeId.replace(/:/g, '_');
              const filePath = await ctx.figma.downloadNodeImage(imageUrl, cacheDir, `screenshot-${safeId}.png`);
              console.log(`Screenshot saved: ${filePath}`);
            } else {
              console.error('No screenshot URL returned for node', opts.nodeId);
            }
          } catch (screenshotError) {
            console.error('Screenshot failed:', screenshotError);
          }
        } else if (opts.screenshot && !opts.nodeId) {
          console.error('--screenshot requires --node-id to be set');
        }
      } catch (error) { handleCliError(error, 'get figma semantic data'); }
    });
}
