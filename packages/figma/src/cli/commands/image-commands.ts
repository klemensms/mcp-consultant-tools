/**
 * Image Download CLI Commands - maps to download-figma-images MCP tool
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerImageCommands(program: Command, ctx: ServiceContext): void {
  program
    .command('download-images')
    .description('Download rendered images of Figma nodes to local disk (PNG/SVG/JPG/PDF)')
    .argument('<fileKey>', 'Figma file key')
    .argument('<nodeIds>', 'Node ID(s) to render, semicolon-separated (e.g. "1:10;2:20")')
    .argument('<localPath>', 'Local directory path to save images')
    .option('--format <format>', 'Image format: png, svg, jpg, pdf', 'png')
    .option('--scale <n>', 'Scale factor 0.01-4 (default: 2)', '2')
    .action(async (fileKey: string, nodeIds: string, localPath: string, opts: any) => {
      try {
        const parsedIds = nodeIds.split(';').map((id: string) => id.trim()).filter(Boolean);
        const scale = parseFloat(opts.scale);
        const format = opts.format as 'png' | 'svg' | 'jpg' | 'pdf';

        const imageMap = await ctx.figma.getNodeImages(fileKey, parsedIds, { format, scale });

        const results: { nodeId: string; filePath?: string; error?: string }[] = [];
        for (const nodeId of parsedIds) {
          const imageUrl = imageMap[nodeId];
          if (!imageUrl) {
            results.push({ nodeId, error: 'No image URL returned' });
            continue;
          }
          const safeId = nodeId.replace(/:/g, '_');
          const ext = format ?? 'png';
          const filePath = await ctx.figma.downloadNodeImage(imageUrl, localPath, `${safeId}.${ext}`);
          results.push({ nodeId, filePath });
        }

        const successCount = results.filter(r => r.filePath).length;
        outputResult(
          {
            fileName: `download-images-${fileKey}`,
            data: { downloaded: successCount, total: parsedIds.length, results },
            summary: `Downloaded ${successCount}/${parsedIds.length} image(s) to ${localPath}`,
          },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'download figma images'); }
    });
}
