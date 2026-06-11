import { auditLogger } from '@mcp-consultant-tools/core';
import axios from 'axios';
import type { GitHubEnterpriseService, BranchSelection } from './base-service.js';

/**
 * Repository operations: branches, files, commits, search, directory structure.
 */
export class RepoService {
  constructor(public readonly base: GitHubEnterpriseService) {}

  async listBranches(repoId: string, protectedOnly?: boolean): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const branches = await this.base.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/branches`,
        { repoId }
      );

      const filteredBranches = protectedOnly !== undefined
        ? branches.filter(b => b.protected === protectedOnly)
        : branches;

      auditLogger.log({
        operation: 'list-branches',
        operationType: 'READ',
        componentType: 'Branch',
        success: true,
        parameters: { repoId, protectedOnly },
        executionTimeMs: timer(),
      });

      return filteredBranches;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-branches',
        operationType: 'READ',
        componentType: 'Branch',
        success: false,
        error: error.message,
        parameters: { repoId },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getDefaultBranch(repoId: string, userSpecified?: string): Promise<BranchSelection> {
    const repo = this.base.getRepoById(repoId);

    if (userSpecified) {
      const branches = await this.listBranches(repoId);
      const exists = branches.find(b => b.name === userSpecified);
      if (exists) {
        return { branch: userSpecified, reason: 'user-specified', confidence: 'high' };
      }
      const availableBranches = branches.map(b => `  - ${b.name}`).join('\n');
      throw new Error(
        `Branch "${userSpecified}" not found in ${repo.owner}/${repo.repo}.\n\nAvailable branches:\n${availableBranches}`
      );
    }

    if (repo.defaultBranch) {
      return { branch: repo.defaultBranch, reason: 'configured default', confidence: 'high' };
    }

    const branches = await this.listBranches(repoId);
    const releaseBranches = branches
      .filter(b => b.name.toLowerCase().startsWith('release/'))
      .map(b => {
        const versionStr = b.name.substring(b.name.indexOf('/') + 1);
        const version = parseFloat(versionStr);
        return { name: b.name, version: isNaN(version) ? 0 : version, raw: versionStr };
      })
      .filter(b => b.version > 0)
      .sort((a, b) => b.version - a.version);

    if (releaseBranches.length > 0) {
      const selected = releaseBranches[0].name;
      const allAlternatives = releaseBranches.slice(1).map(b => b.name);
      console.error(`Auto-selected branch: ${selected} (highest release version ${releaseBranches[0].version})`);
      if (allAlternatives.length > 0) {
        console.error(`  Alternatives: ${allAlternatives.slice(0, 3).join(', ')}${allAlternatives.length > 3 ? '...' : ''}`);
      }
      return {
        branch: selected,
        reason: `auto-detected: highest release version (${releaseBranches[0].version})`,
        confidence: 'medium',
        alternatives: allAlternatives,
        message: `Auto-selected "${selected}". If this is incorrect, specify a different branch explicitly.`
      };
    }

    console.error(`No release branches found in format "release/X.Y" for ${repo.owner}/${repo.repo}`);
    const availableBranchNames = branches.map(b => b.name);
    console.error(`  Available branches: ${availableBranchNames.slice(0, 5).join(', ')}${availableBranchNames.length > 5 ? '...' : ''}`);

    const mainBranch = branches.find(b => b.name === 'main' || b.name === 'master');
    if (mainBranch) {
      console.error(`Falling back to: ${mainBranch.name} (main branch - likely production)`);
      return {
        branch: mainBranch.name,
        reason: 'fallback to main branch (no release branches found)',
        confidence: 'low',
        alternatives: availableBranchNames.filter(n => n !== mainBranch.name),
        message: `No release branches found. Using "${mainBranch.name}" as fallback. User should verify this is correct.`
      };
    }

    const branchList = availableBranchNames.map(n => `  - ${n}`).join('\n');
    throw new Error(
      `Could not determine default branch for ${repo.owner}/${repo.repo}.\n\nAvailable branches:\n${branchList}\n\nPlease specify a branch explicitly or configure a defaultBranch in GHE_REPOS.`
    );
  }

  async getFile(repoId: string, path: string, branch?: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const selectedBranch = branch || (await this.getDefaultBranch(repoId)).branch;
      const file = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${selectedBranch}`,
        { repoId }
      );

      if (file.size > this.base.config.maxFileSize) {
        throw new Error(
          `File size (${file.size} bytes) exceeds maximum allowed size (${this.base.config.maxFileSize} bytes). Increase GHE_MAX_FILE_SIZE if needed.`
        );
      }

      if (file.encoding === 'base64') {
        file.decodedContent = Buffer.from(file.content, 'base64').toString('utf-8');
      }

      auditLogger.log({
        operation: 'get-file', operationType: 'READ', componentType: 'File', componentName: path,
        success: true, parameters: { repoId, path, branch: selectedBranch }, executionTimeMs: timer(),
      });

      return { ...file, branch: selectedBranch };
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-file', operationType: 'READ', componentType: 'File', componentName: path,
        success: false, error: error.message, parameters: { repoId, path, branch }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async searchCode(query: string, repoId?: string, path?: string, extension?: string): Promise<any> {
    const timer = auditLogger.startTimer();

    try {
      let searchQuery = query;
      if (repoId) {
        const repo = this.base.getRepoById(repoId);
        searchQuery += ` repo:${repo.owner}/${repo.repo}`;
      }
      if (path) searchQuery += ` path:${path}`;
      if (extension) searchQuery += ` extension:${extension}`;

      const result = await this.base.makeRequest<any>(
        `search/code?q=${encodeURIComponent(searchQuery)}&per_page=${this.base.config.maxSearchResults}`,
        { useCache: false }
      );

      auditLogger.log({
        operation: 'search-code', operationType: 'READ', componentType: 'Code',
        success: true, parameters: { query, repoId, path, extension, totalResults: result.total_count },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-code', operationType: 'READ', componentType: 'Code',
        success: false, error: error.message, parameters: { query, repoId, path, extension },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async listFiles(repoId: string, path?: string, branch?: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const selectedBranch = branch || (await this.getDefaultBranch(repoId)).branch;
      const dirPath = path || '';
      const contents = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/contents/${dirPath}?ref=${selectedBranch}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'list-files', operationType: 'READ', componentType: 'Directory', componentName: path || '/',
        success: true, parameters: { repoId, path, branch: selectedBranch }, executionTimeMs: timer(),
      });

      return { contents, branch: selectedBranch };
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-files', operationType: 'READ', componentType: 'Directory', componentName: path || '/',
        success: false, error: error.message, parameters: { repoId, path, branch }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getCommits(
    repoId: string, branch?: string, since?: string, until?: string,
    author?: string, path?: string, limit: number = 50
  ): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const selectedBranch = branch || (await this.getDefaultBranch(repoId)).branch;
      const params: any = { sha: selectedBranch, per_page: limit };
      if (since) params.since = since;
      if (until) params.until = until;
      if (author) params.author = author;
      if (path) params.path = path;

      const queryString = new URLSearchParams(params).toString();
      const commits = await this.base.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/commits?${queryString}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-commits', operationType: 'READ', componentType: 'Commit',
        success: true, parameters: { repoId, branch: selectedBranch, since, until, author, path, limit, count: commits.length },
        executionTimeMs: timer(),
      });

      return commits;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-commits', operationType: 'READ', componentType: 'Commit',
        success: false, error: error.message, parameters: { repoId, branch, since, until, author, path, limit },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getCommitDetails(repoId: string, sha: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const commit = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/commits/${sha}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-commit-details', operationType: 'READ', componentType: 'Commit', componentId: sha,
        success: true, parameters: { repoId, sha }, executionTimeMs: timer(),
      });

      return commit;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-commit-details', operationType: 'READ', componentType: 'Commit', componentId: sha,
        success: false, error: error.message, parameters: { repoId, sha }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async searchCommits(
    query: string, repoId?: string, author?: string, since?: string, until?: string
  ): Promise<any> {
    const timer = auditLogger.startTimer();

    try {
      let searchQuery = query;
      if (repoId) {
        const repo = this.base.getRepoById(repoId);
        searchQuery += ` repo:${repo.owner}/${repo.repo}`;
      }
      if (author) searchQuery += ` author:${author}`;
      if (since) searchQuery += ` committer-date:>=${since}`;
      if (until) searchQuery += ` committer-date:<=${until}`;

      const result = await this.base.makeRequest<any>(
        `search/commits?q=${encodeURIComponent(searchQuery)}`,
        { useCache: false }
      );

      auditLogger.log({
        operation: 'search-commits', operationType: 'READ', componentType: 'Commit',
        success: true, parameters: { query, repoId, author, since, until, totalResults: result.total_count },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-commits', operationType: 'READ', componentType: 'Commit',
        success: false, error: error.message, parameters: { query, repoId, author, since, until },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async compareBranches(repoId: string, base: string, head: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const comparison = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/compare/${base}...${head}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'compare-branches', operationType: 'READ', componentType: 'Branch',
        success: true, parameters: { repoId, base, head, aheadBy: comparison.ahead_by, behindBy: comparison.behind_by },
        executionTimeMs: timer(),
      });

      return comparison;
    } catch (error: any) {
      auditLogger.log({
        operation: 'compare-branches', operationType: 'READ', componentType: 'Branch',
        success: false, error: error.message, parameters: { repoId, base, head },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getBranchDetails(repoId: string, branch: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const branchInfo = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/branches/${branch}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-branch-details', operationType: 'READ', componentType: 'Branch', componentName: branch,
        success: true, parameters: { repoId, branch }, executionTimeMs: timer(),
      });

      return branchInfo;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-branch-details', operationType: 'READ', componentType: 'Branch', componentName: branch,
        success: false, error: error.message, parameters: { repoId, branch }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getDirectoryStructure(repoId: string, path?: string, branch?: string, depth: number = 3): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const selectedBranch = branch || (await this.getDefaultBranch(repoId)).branch;

      const buildTree = async (currentPath: string, currentDepth: number): Promise<any> => {
        if (currentDepth > depth) return { truncated: true };
        const contents = await this.base.makeRequest<any[]>(
          `repos/${repo.owner}/${repo.repo}/contents/${currentPath}?ref=${selectedBranch}`,
          { repoId }
        );
        const tree: any[] = [];
        for (const item of contents) {
          if (item.type === 'dir' && currentDepth < depth) {
            tree.push({ ...item, children: await buildTree(item.path, currentDepth + 1) });
          } else {
            tree.push(item);
          }
        }
        return tree;
      };

      const tree = await buildTree(path || '', 1);

      auditLogger.log({
        operation: 'get-directory-structure', operationType: 'READ', componentType: 'Directory', componentName: path || '/',
        success: true, parameters: { repoId, path, branch: selectedBranch, depth }, executionTimeMs: timer(),
      });

      return { tree, branch: selectedBranch };
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-directory-structure', operationType: 'READ', componentType: 'Directory', componentName: path || '/',
        success: false, error: error.message, parameters: { repoId, path, branch, depth }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getFileHistory(repoId: string, path: string, branch?: string, limit: number = 50): Promise<any[]> {
    const timer = auditLogger.startTimer();

    try {
      const commits = await this.getCommits(repoId, branch, undefined, undefined, undefined, path, limit);

      auditLogger.log({
        operation: 'get-file-history', operationType: 'READ', componentType: 'File', componentName: path,
        success: true, parameters: { repoId, path, branch, limit, count: commits.length }, executionTimeMs: timer(),
      });

      return commits;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-file-history', operationType: 'READ', componentType: 'File', componentName: path,
        success: false, error: error.message, parameters: { repoId, path, branch, limit }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getCommitDiff(repoId: string, sha: string, format: 'diff' | 'patch' = 'diff'): Promise<string> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const acceptHeader = format === 'patch'
        ? 'application/vnd.github.v3.patch'
        : 'application/vnd.github.v3.diff';
      const token = await this.base.getAccessToken();
      const url = `${this.base.baseApiUrl}/repos/${repo.owner}/${repo.repo}/commits/${sha}`;

      const response = await axios({
        method: 'GET', url,
        headers: {
          'Authorization': `token ${token}`,
          'Accept': acceptHeader,
          'X-GitHub-Api-Version': this.base.config.apiVersion,
        },
      });

      auditLogger.log({
        operation: 'get-commit-diff', operationType: 'READ', componentType: 'Commit', componentId: sha,
        success: true, parameters: { repoId, sha, format }, executionTimeMs: timer(),
      });

      return response.data;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-commit-diff', operationType: 'READ', componentType: 'Commit', componentId: sha,
        success: false, error: error.message, parameters: { repoId, sha, format }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async createBranch(repoId: string, branchName: string, fromBranch?: string): Promise<any> {
    if (!this.base.config.enableCreate) {
      throw new Error('Branch creation is disabled. Set GHE_ENABLE_CREATE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const sourceBranch = fromBranch || (await this.getDefaultBranch(repoId)).branch;
      const branchInfo = await this.getBranchDetails(repoId, sourceBranch);
      const sha = branchInfo.commit.sha;

      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/git/refs`,
        { method: 'POST', data: { ref: `refs/heads/${branchName}`, sha }, useCache: false }
      );

      auditLogger.log({
        operation: 'create-branch', operationType: 'CREATE', componentType: 'Branch', componentName: branchName,
        success: true, parameters: { repoId, branchName, fromBranch: sourceBranch }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-branch', operationType: 'CREATE', componentType: 'Branch', componentName: branchName,
        success: false, error: error.message, parameters: { repoId, branchName, fromBranch }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async updateFile(repoId: string, path: string, content: string, message: string, branch: string, sha: string): Promise<any> {
    if (!this.base.config.enableWrite) {
      throw new Error('File updates are disabled. Set GHE_ENABLE_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const encodedContent = Buffer.from(content).toString('base64');
      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/contents/${path}`,
        { method: 'PUT', data: { message, content: encodedContent, sha, branch }, useCache: false }
      );

      auditLogger.log({
        operation: 'update-file', operationType: 'UPDATE', componentType: 'File', componentName: path,
        success: true, parameters: { repoId, path, branch, message }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'update-file', operationType: 'UPDATE', componentType: 'File', componentName: path,
        success: false, error: error.message, parameters: { repoId, path, branch }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async createFile(repoId: string, path: string, content: string, message: string, branch: string): Promise<any> {
    if (!this.base.config.enableCreate) {
      throw new Error('File creation is disabled. Set GHE_ENABLE_CREATE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const encodedContent = Buffer.from(content).toString('base64');
      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/contents/${path}`,
        { method: 'PUT', data: { message, content: encodedContent, branch }, useCache: false }
      );

      auditLogger.log({
        operation: 'create-file', operationType: 'CREATE', componentType: 'File', componentName: path,
        success: true, parameters: { repoId, path, branch, message }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-file', operationType: 'CREATE', componentType: 'File', componentName: path,
        success: false, error: error.message, parameters: { repoId, path, branch }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async searchRepositories(query: string, owner?: string): Promise<any> {
    const timer = auditLogger.startTimer();

    try {
      let searchQuery = query;
      if (owner) searchQuery += ` org:${owner}`;

      const result = await this.base.makeRequest<any>(
        `search/repositories?q=${encodeURIComponent(searchQuery)}`,
        { useCache: false }
      );

      auditLogger.log({
        operation: 'search-repositories', operationType: 'READ', componentType: 'Repository',
        success: true, parameters: { query, owner, totalResults: result.total_count }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-repositories', operationType: 'READ', componentType: 'Repository',
        success: false, error: error.message, parameters: { query, owner }, executionTimeMs: timer(),
      });
      throw error;
    }
  }
}
