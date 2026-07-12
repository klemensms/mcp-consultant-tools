import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { glob } from 'glob';
import type { CodeReviewClient, RepositoryInfo } from '../code-review-client.js';
import type { PaginatedResult } from '../models/index.js';

export class RepositoryService {
  private readonly client: CodeReviewClient;
  private readonly allowedRepositories?: string[];

  constructor(client: CodeReviewClient, allowedRepositories?: string[]) {
    this.client = client;
    this.allowedRepositories = allowedRepositories;
  }

  isFiltered(): boolean {
    return this.allowedRepositories !== undefined;
  }

  async listRepositories(project?: string): Promise<PaginatedResult<RepositoryInfo>> {
    const result = await this.client.listRepositories(project);
    if (!this.allowedRepositories) return result;
    return {
      items: result.items.filter((r) => this.allowedRepositories!.includes(r.name.toLowerCase())),
      truncated: result.truncated,
    };
  }

  /**
   * Clone the repo, run an analyzer over the working tree, and guarantee cleanup of the temp dir
   * even if the analyzer throws (the clone itself already redacts its credential on failure).
   */
  async cloneAndAnalyze<T>(
    project: string,
    repo: string,
    branch: string | undefined,
    analyzer: (localPath: string) => Promise<T>,
  ): Promise<T> {
    if (this.allowedRepositories && !this.allowedRepositories.includes(repo.toLowerCase())) {
      throw new Error(
        `Repository "${repo}" is not in the configured repository list. ` +
          `Allowed repositories: ${this.allowedRepositories.join(', ')}`,
      );
    }
    const { localPath, cleanup } = await this.client.cloneRepository(project, repo, branch);
    try {
      return await analyzer(localPath);
    } finally {
      await cleanup();
    }
  }

  async getRepositoryTree(project: string, repo: string, branch?: string): Promise<string[]> {
    return this.cloneAndAnalyze(project, repo, branch, async (localPath) => {
      const files = await glob('**/*', { cwd: localPath, nodir: true, dot: false });
      return files.sort();
    });
  }

  async findFiles(localPath: string, patterns: string[]): Promise<string[]> {
    const results: string[] = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, { cwd: localPath, nodir: true });
      results.push(...files);
    }
    return [...new Set(results)].sort();
  }

  async readFile(localPath: string, filePath: string): Promise<string> {
    return readFile(`${localPath}/${filePath}`, 'utf-8');
  }

  getRelativePath(localPath: string, absolutePath: string): string {
    return relative(localPath, absolutePath).replace(/\\/g, '/');
  }
}
