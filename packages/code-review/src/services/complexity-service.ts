import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { glob } from 'glob';
import { analyzeFileComplexity, COMPLEXITY_METHODOLOGY } from '../utils/complexity-analyzer.js';
import type { ComplexityReport, FileComplexityInfo, ComplexityHotspot } from '../models/index.js';

const DEFAULT_EXTENSIONS = ['.cs', '.ts', '.js'];
const DEFAULT_MAX_FILES = 5000;
const TOP_HOTSPOTS = 10;
const BATCH_SIZE = 50;

export class ComplexityService {
  async analyze(
    localPath: string,
    repository: string,
    branch: string,
    options?: { extensions?: string[]; pathFilter?: string; maxFiles?: number },
  ): Promise<ComplexityReport> {
    const extensions = options?.extensions ?? DEFAULT_EXTENSIONS;
    const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;

    const patterns = extensions.map((ext) => {
      const base = options?.pathFilter ?? '**';
      const prefix = base.endsWith('/') ? base : `${base}/`;
      return `${prefix}**/*${ext}`;
    });

    let filePaths: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, { cwd: localPath, nodir: true });
      filePaths.push(...matches);
    }

    const allFiles = [...new Set(filePaths)].sort();
    const totalFilesFound = allFiles.length;
    const truncated = maxFiles > 0 && totalFilesFound > maxFiles;
    filePaths = maxFiles > 0 ? allFiles.slice(0, maxFiles) : allFiles;

    const files: FileComplexityInfo[] = [];
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (fp) => {
          try {
            const content = await readFile(`${localPath}/${fp}`, 'utf-8');
            return analyzeFileComplexity(content, fp);
          } catch {
            return null;
          }
        }),
      );
      files.push(...results.filter((r): r is FileComplexityInfo => r !== null));
    }

    const totalLoc = files.reduce((sum, f) => sum + f.linesOfCode, 0);
    const allComplexities = files.flatMap((f) => f.methods.map((m) => m.cyclomaticComplexity));
    const avgComplexity =
      allComplexities.length > 0 ? allComplexities.reduce((a, b) => a + b, 0) / allComplexities.length : 0;
    const maxComplexity = allComplexities.length > 0 ? Math.max(...allComplexities) : 0;

    const hotspots: ComplexityHotspot[] = files
      .flatMap((f) =>
        f.methods.map((m) => ({
          filePath: f.path,
          methodName: m.name,
          cyclomaticComplexity: m.cyclomaticComplexity,
          linesOfCode: m.linesOfCode,
        })),
      )
      .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
      .slice(0, TOP_HOTSPOTS);

    const byExtension: Record<string, { files: number; loc: number }> = {};
    for (const f of files) {
      const ext = extname(f.path);
      if (!byExtension[ext]) byExtension[ext] = { files: 0, loc: 0 };
      byExtension[ext].files++;
      byExtension[ext].loc += f.linesOfCode;
    }

    return {
      repository,
      branch,
      methodology: COMPLEXITY_METHODOLOGY,
      files,
      summary: {
        totalFiles: files.length,
        totalFilesFound,
        truncated,
        totalLinesOfCode: totalLoc,
        averageCyclomaticComplexity: Math.round(avgComplexity * 100) / 100,
        maxCyclomaticComplexity: maxComplexity,
        hotspots,
        byExtension,
      },
    };
  }
}
