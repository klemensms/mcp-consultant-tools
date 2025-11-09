import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { auditLogger } from './utils/audit-logger.js';

/**
 * GitHub Enterprise Repository Configuration
 */
export interface GitHubRepoConfig {
  id: string;                 // Unique identifier for this repo (user-friendly)
  owner: string;              // Organization or user name
  repo: string;               // Repository name
  defaultBranch?: string;     // Default branch (empty = auto-detect)
  active: boolean;            // Enable/disable without removing config
  description?: string;       // Optional description
}

/**
 * GitHub Enterprise Service Configuration
 */
export interface GitHubEnterpriseConfig {
  baseUrl: string;            // GHE base URL (e.g., https://github.company.com)
  apiVersion: string;         // API version header
  authMethod: 'pat' | 'github-app';
  pat?: string;               // Personal access token
  appId?: string;             // GitHub App ID
  appPrivateKey?: string;     // GitHub App private key (PEM format)
  appInstallationId?: string; // GitHub App installation ID
  repos: GitHubRepoConfig[];
  enableWrite: boolean;
  enableCreate: boolean;
  enableCache: boolean;       // Enable response caching
  cacheTtl: number;           // Cache TTL in seconds
  maxFileSize: number;        // Max file size in bytes (configurable)
  maxSearchResults: number;
}

/**
 * Branch Selection Result
 */
export interface BranchSelection {
  branch: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  alternatives?: string[];
  message?: string;
}

/**
 * GitHub Enterprise Service
 * Manages authentication, API requests, caching, and branch selection for GitHub Enterprise Cloud
 */
export class GitHubEnterpriseService {
  private config: GitHubEnterpriseConfig;
  private readonly baseApiUrl: string;
  private octokit: Octokit | null = null;

  // Token caching (for GitHub App)
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  // Response caching
  private cache: Map<string, { data: any; expires: number }> = new Map();

  constructor(config: GitHubEnterpriseConfig) {
    this.config = config;
    this.baseApiUrl = `${config.baseUrl}/api/v3`;

    // Initialize Octokit based on auth method
    this.initializeOctokit();
  }

  /**
   * Initialize Octokit client based on authentication method
   */
  private initializeOctokit(): void {
    try {
      if (this.config.authMethod === 'pat') {
        // PAT authentication (primary method)
        this.octokit = new Octokit({
          auth: this.config.pat,
          baseUrl: this.baseApiUrl,
          userAgent: 'mcp-consultant-tools',
        });
      } else if (this.config.authMethod === 'github-app') {
        // GitHub App authentication (optional/advanced)
        if (!this.config.appId || !this.config.appPrivateKey || !this.config.appInstallationId) {
          throw new Error('GitHub App authentication requires appId, appPrivateKey, and appInstallationId');
        }

        this.octokit = new Octokit({
          authStrategy: createAppAuth,
          auth: {
            appId: this.config.appId,
            privateKey: this.config.appPrivateKey,
            installationId: this.config.appInstallationId,
          },
          baseUrl: this.baseApiUrl,
          userAgent: 'mcp-consultant-tools',
        });
      } else {
        throw new Error(`Unsupported authentication method: ${this.config.authMethod}`);
      }
    } catch (error: any) {
      console.error('Failed to initialize Octokit:', error.message);
      throw error;
    }
  }

  /**
   * Get access token with caching (for GitHub App auth)
   * Implements 5-minute buffer pattern before expiry
   */
  private async getAccessToken(): Promise<string> {
    if (this.config.authMethod === 'pat') {
      return this.config.pat!;
    }

    const currentTime = Date.now();

    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    // Acquire new token for GitHub App
    try {
      const auth = await this.octokit!.auth({ type: 'installation' }) as any;

      if (!auth.token) {
        throw new Error('GitHub App auth did not return a token');
      }

      const token: string = auth.token;
      this.accessToken = token;

      // GitHub App installation tokens expire after 1 hour
      // Set expiration time (subtract 5 minutes to refresh early)
      this.tokenExpirationTime = currentTime + (55 * 60 * 1000); // 55 minutes

      return token;
    } catch (error: any) {
      console.error('Failed to acquire GitHub App installation token:', error.message);
      throw new Error(`Failed to acquire GitHub App token: ${error.message}`);
    }
  }

  /**
   * Get cache key for a request
   */
  private getCacheKey(method: string, repo: string, resource: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${method}:${repo}:${resource}:${paramStr}`;
  }

  /**
   * Get cached response
   */
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expires) {
      return cached.data as T;
    }
    this.cache.delete(key);  // Expired - remove it
    return null;
  }

  /**
   * Set cache entry
   */
  private setCache(key: string, data: any, ttlSeconds?: number): void {
    if (!this.config.enableCache) return;

    const ttl = ttlSeconds || this.config.cacheTtl;
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttl * 1000)
    });
  }

  /**
   * Clear cache entries
   * @param pattern Optional pattern to match cache keys
   * @param repoId Optional repo ID to clear cache for specific repo
   * @returns Number of cache entries cleared
   */
  clearCache(pattern?: string, repoId?: string): number {
    if (repoId) {
      const repo = this.getRepoById(repoId);
      const repoPattern = `${repo.owner}/${repo.repo}`;
      pattern = pattern ? `${repoPattern}:${pattern}` : repoPattern;
    }

    if (pattern) {
      let cleared = 0;
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          cleared++;
        }
      }
      console.error(`Cleared ${cleared} cache entries matching pattern '${pattern}'`);
      return cleared;
    }

    const size = this.cache.size;
    this.cache.clear();
    console.error(`Cleared all ${size} cache entries`);
    return size;
  }

  /**
   * Make API request with error handling and caching
   */
  private async makeRequest<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      data?: any;
      useCache?: boolean;
      cacheTtl?: number;
      repoId?: string;
    } = {}
  ): Promise<T> {
    const { method = 'GET', data, useCache = true, cacheTtl, repoId } = options;

    // Check cache for GET requests
    if (method === 'GET' && useCache && this.config.enableCache) {
      const cacheKey = this.getCacheKey(method, repoId || '', endpoint, data);
      const cached = this.getCached<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const token = await this.getAccessToken();
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseApiUrl}/${endpoint}`;

      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': this.config.apiVersion,
          'Content-Type': 'application/json',
        },
        data,
      });

      // Cache successful GET responses
      if (method === 'GET' && useCache && this.config.enableCache) {
        const cacheKey = this.getCacheKey(method, repoId || '', endpoint, data);
        this.setCache(cacheKey, response.data, cacheTtl);
      }

      return response.data as T;
    } catch (error: any) {
      // Comprehensive error handling
      let errorMessage = 'Unknown error';
      let errorDetails: any = {};

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        switch (status) {
          case 401:
            errorMessage = 'Authentication failed. Check your PAT or GitHub App credentials.';
            break;
          case 403:
            if (error.response.headers['x-ratelimit-remaining'] === '0') {
              const resetTime = error.response.headers['x-ratelimit-reset'];
              const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleString() : 'unknown';
              errorMessage = `Rate limit exceeded. Resets at ${resetDate}.`;
            } else {
              errorMessage = 'Access denied. Check repository permissions.';
            }
            break;
          case 404:
            errorMessage = `Resource not found: ${endpoint}`;
            break;
          case 422:
            errorMessage = `Validation failed: ${data?.message || 'Invalid request parameters'}`;
            break;
          default:
            errorMessage = `HTTP ${status}: ${data?.message || error.message}`;
        }

        errorDetails = { status, message: data?.message };
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage = `Network error: Unable to reach GitHub Enterprise at ${this.config.baseUrl}. Check your connection and GHE_URL.`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Request timeout. GitHub Enterprise API is slow to respond.';
      } else {
        errorMessage = error.message;
      }

      console.error('GitHub Enterprise API request failed:', { endpoint, method, status: error.response?.status, error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  /**
   * Get all configured repositories
   */
  getAllRepos(): GitHubRepoConfig[] {
    return this.config.repos;
  }

  /**
   * Get active repositories only
   */
  getActiveRepos(): GitHubRepoConfig[] {
    return this.config.repos.filter(r => r.active);
  }

  /**
   * Get repository by ID with validation
   */
  getRepoById(repoId: string): GitHubRepoConfig {
    const repo = this.config.repos.find(r => r.id === repoId);
    if (!repo) {
      const availableIds = this.config.repos.map(r => r.id).join(', ');
      throw new Error(
        `Repository '${repoId}' not found. Available repositories: ${availableIds || 'none'}`
      );
    }
    if (!repo.active) {
      throw new Error(
        `Repository '${repoId}' is inactive. Set 'active: true' in configuration to enable it.`
      );
    }
    return repo;
  }

  /**
   * List all branches for a repository
   */
  async listBranches(repoId: string, protectedOnly?: boolean): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const branches = await this.makeRequest<any[]>(
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

  /**
   * Auto-detect default branch for a repository
   * Handles typos gracefully and provides alternatives
   */
  async getDefaultBranch(repoId: string, userSpecified?: string): Promise<BranchSelection> {
    const repo = this.getRepoById(repoId);

    // 1. User explicitly specified branch (highest priority)
    if (userSpecified) {
      const branches = await this.listBranches(repoId);
      const exists = branches.find(b => b.name === userSpecified);
      if (exists) {
        return {
          branch: userSpecified,
          reason: 'user-specified',
          confidence: 'high'
        };
      }
      // Branch doesn't exist - show available branches
      const availableBranches = branches.map(b => `  - ${b.name}`).join('\n');
      throw new Error(
        `Branch "${userSpecified}" not found in ${repo.owner}/${repo.repo}.\n\n` +
        `Available branches:\n${availableBranches}`
      );
    }

    // 2. Check if default branch configured for this repo
    if (repo.defaultBranch) {
      return {
        branch: repo.defaultBranch,
        reason: 'configured default',
        confidence: 'high'
      };
    }

    // 3. Get all branches
    const branches = await this.listBranches(repoId);

    // 4. Filter and sort release branches (handle typos gracefully)
    const releaseBranches = branches
      .filter(b => b.name.toLowerCase().startsWith('release/'))  // Case-insensitive
      .map(b => {
        // Parse version number after "release/"
        const versionStr = b.name.substring(b.name.indexOf('/') + 1);
        const version = parseFloat(versionStr);
        return {
          name: b.name,
          version: isNaN(version) ? 0 : version,
          raw: versionStr
        };
      })
      .filter(b => b.version > 0)  // Only keep valid version numbers
      .sort((a, b) => b.version - a.version);  // Highest first

    // 5. Auto-select highest version, but ALWAYS show alternatives
    if (releaseBranches.length > 0) {
      const selected = releaseBranches[0].name;
      const allAlternatives = releaseBranches.slice(1).map(b => b.name);

      console.error(`✓ Auto-selected branch: ${selected} (highest release version ${releaseBranches[0].version})`);
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

    // 6. No release branches found - fallback to main/master
    console.error(`⚠️ No release branches found in format "release/X.Y" for ${repo.owner}/${repo.repo}`);
    const availableBranchNames = branches.map(b => b.name);
    console.error(`  Available branches: ${availableBranchNames.slice(0, 5).join(', ')}${availableBranchNames.length > 5 ? '...' : ''}`);

    const mainBranch = branches.find(b => b.name === 'main' || b.name === 'master');
    if (mainBranch) {
      console.error(`⚠️ Falling back to: ${mainBranch.name} (main branch - likely production)`);
      return {
        branch: mainBranch.name,
        reason: 'fallback to main branch (no release branches found)',
        confidence: 'low',
        alternatives: availableBranchNames.filter(n => n !== mainBranch.name),
        message: `No release branches found. Using "${mainBranch.name}" as fallback. User should verify this is correct.`
      };
    }

    // 7. Cannot determine - list all branches and throw error
    const branchList = availableBranchNames.map(n => `  - ${n}`).join('\n');
    throw new Error(
      `Could not determine default branch for ${repo.owner}/${repo.repo}.\n\n` +
      `Available branches:\n${branchList}\n\n` +
      `Please specify a branch explicitly or configure a defaultBranch in GHE_REPOS.`
    );
  }

  /**
   * Get file content from a repository
   */
  async getFile(repoId: string, path: string, branch?: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      // Auto-detect branch if not specified
      const selectedBranch = branch || (await this.getDefaultBranch(repoId)).branch;

      const file = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${selectedBranch}`,
        { repoId }
      );

      // Check file size
      if (file.size > this.config.maxFileSize) {
        throw new Error(
          `File size (${file.size} bytes) exceeds maximum allowed size (${this.config.maxFileSize} bytes). ` +
          `Increase GHE_MAX_FILE_SIZE if needed.`
        );
      }

      // Decode base64 content
      if (file.encoding === 'base64') {
        file.decodedContent = Buffer.from(file.content, 'base64').toString('utf-8');
      }

      auditLogger.log({
        operation: 'get-file',
        operationType: 'READ',
        componentType: 'File',
        componentName: path,
        success: true,
        parameters: { repoId, path, branch: selectedBranch },
        executionTimeMs: timer(),
      });

      return { ...file, branch: selectedBranch };
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-file',
        operationType: 'READ',
        componentType: 'File',
        componentName: path,
        success: false,
        error: error.message,
        parameters: { repoId, path, branch },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Search code across repositories
   */
  async searchCode(query: string, repoId?: string, path?: string, extension?: string): Promise<any> {
    const timer = auditLogger.startTimer();

    try {
      // Build search query
      let searchQuery = query;

      if (repoId) {
        const repo = this.getRepoById(repoId);
        searchQuery += ` repo:${repo.owner}/${repo.repo}`;
      }

      if (path) {
        searchQuery += ` path:${path}`;
      }

      if (extension) {
        searchQuery += ` extension:${extension}`;
      }

      const result = await this.makeRequest<any>(
        `search/code?q=${encodeURIComponent(searchQuery)}&per_page=${this.config.maxSearchResults}`,
        { useCache: false }  // Don't cache search results
      );

      auditLogger.log({
        operation: 'search-code',
        operationType: 'READ',
        componentType: 'Code',
        success: true,
        parameters: { query, repoId, path, extension, totalResults: result.total_count },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-code',
        operationType: 'READ',
        componentType: 'Code',
        success: false,
        error: error.message,
        parameters: { query, repoId, path, extension },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(repoId: string, path?: string, branch?: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      // Auto-detect branch if not specified
      const selectedBranch = branch || (await this.getDefaultBranch(repoId)).branch;
      const dirPath = path || '';

      const contents = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/contents/${dirPath}?ref=${selectedBranch}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'list-files',
        operationType: 'READ',
        componentType: 'Directory',
        componentName: path || '/',
        success: true,
        parameters: { repoId, path, branch: selectedBranch },
        executionTimeMs: timer(),
      });

      return { contents, branch: selectedBranch };
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-files',
        operationType: 'READ',
        componentType: 'Directory',
        componentName: path || '/',
        success: false,
        error: error.message,
        parameters: { repoId, path, branch },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get commit history for a branch
   */
  async getCommits(
    repoId: string,
    branch?: string,
    since?: string,
    until?: string,
    author?: string,
    path?: string,
    limit: number = 50
  ): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      // Auto-detect branch if not specified
      const selectedBranch = branch || (await this.getDefaultBranch(repoId)).branch;

      // Build query parameters
      const params: any = {
        sha: selectedBranch,
        per_page: limit,
      };
      if (since) params.since = since;
      if (until) params.until = until;
      if (author) params.author = author;
      if (path) params.path = path;

      const queryString = new URLSearchParams(params).toString();
      const commits = await this.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/commits?${queryString}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-commits',
        operationType: 'READ',
        componentType: 'Commit',
        success: true,
        parameters: { repoId, branch: selectedBranch, since, until, author, path, limit, count: commits.length },
        executionTimeMs: timer(),
      });

      return commits;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-commits',
        operationType: 'READ',
        componentType: 'Commit',
        success: false,
        error: error.message,
        parameters: { repoId, branch, since, until, author, path, limit },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get commit details
   */
  async getCommitDetails(repoId: string, sha: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const commit = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/commits/${sha}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-commit-details',
        operationType: 'READ',
        componentType: 'Commit',
        componentId: sha,
        success: true,
        parameters: { repoId, sha },
        executionTimeMs: timer(),
      });

      return commit;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-commit-details',
        operationType: 'READ',
        componentType: 'Commit',
        componentId: sha,
        success: false,
        error: error.message,
        parameters: { repoId, sha },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Search commits by message
   */
  async searchCommits(
    query: string,
    repoId?: string,
    author?: string,
    since?: string,
    until?: string
  ): Promise<any> {
    const timer = auditLogger.startTimer();

    try {
      // Build search query
      let searchQuery = query;

      if (repoId) {
        const repo = this.getRepoById(repoId);
        searchQuery += ` repo:${repo.owner}/${repo.repo}`;
      }

      if (author) {
        searchQuery += ` author:${author}`;
      }

      if (since) {
        searchQuery += ` committer-date:>=${since}`;
      }

      if (until) {
        searchQuery += ` committer-date:<=${until}`;
      }

      const result = await this.makeRequest<any>(
        `search/commits?q=${encodeURIComponent(searchQuery)}`,
        { useCache: false }  // Don't cache search results
      );

      auditLogger.log({
        operation: 'search-commits',
        operationType: 'READ',
        componentType: 'Commit',
        success: true,
        parameters: { query, repoId, author, since, until, totalResults: result.total_count },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-commits',
        operationType: 'READ',
        componentType: 'Commit',
        success: false,
        error: error.message,
        parameters: { query, repoId, author, since, until },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Compare two branches
   */
  async compareBranches(repoId: string, base: string, head: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const comparison = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/compare/${base}...${head}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'compare-branches',
        operationType: 'READ',
        componentType: 'Branch',
        success: true,
        parameters: { repoId, base, head, aheadBy: comparison.ahead_by, behindBy: comparison.behind_by },
        executionTimeMs: timer(),
      });

      return comparison;
    } catch (error: any) {
      auditLogger.log({
        operation: 'compare-branches',
        operationType: 'READ',
        componentType: 'Branch',
        success: false,
        error: error.message,
        parameters: { repoId, base, head },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get branch details
   */
  async getBranchDetails(repoId: string, branch: string): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const branchInfo = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/branches/${branch}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-branch-details',
        operationType: 'READ',
        componentType: 'Branch',
        componentName: branch,
        success: true,
        parameters: { repoId, branch },
        executionTimeMs: timer(),
      });

      return branchInfo;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-branch-details',
        operationType: 'READ',
        componentType: 'Branch',
        componentName: branch,
        success: false,
        error: error.message,
        parameters: { repoId, branch },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    repoId: string,
    state: 'open' | 'closed' | 'all' = 'open',
    base?: string,
    head?: string,
    sort: 'created' | 'updated' | 'popularity' = 'created',
    limit: number = 30
  ): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const params: any = {
        state,
        sort,
        per_page: limit,
      };
      if (base) params.base = base;
      if (head) params.head = head;

      const queryString = new URLSearchParams(params).toString();
      const prs = await this.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/pulls?${queryString}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'list-pull-requests',
        operationType: 'READ',
        componentType: 'PullRequest',
        success: true,
        parameters: { repoId, state, base, head, sort, limit, count: prs.length },
        executionTimeMs: timer(),
      });

      return prs;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-pull-requests',
        operationType: 'READ',
        componentType: 'PullRequest',
        success: false,
        error: error.message,
        parameters: { repoId, state, base, head, sort, limit },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get pull request details
   */
  async getPullRequest(repoId: string, prNumber: number): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const pr = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-pull-request',
        operationType: 'READ',
        componentType: 'PullRequest',
        componentId: prNumber.toString(),
        success: true,
        parameters: { repoId, prNumber },
        executionTimeMs: timer(),
      });

      return pr;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-pull-request',
        operationType: 'READ',
        componentType: 'PullRequest',
        componentId: prNumber.toString(),
        success: false,
        error: error.message,
        parameters: { repoId, prNumber },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get pull request files
   */
  async getPullRequestFiles(repoId: string, prNumber: number): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const files = await this.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/files`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-pr-files',
        operationType: 'READ',
        componentType: 'PullRequest',
        componentId: prNumber.toString(),
        success: true,
        parameters: { repoId, prNumber, fileCount: files.length },
        executionTimeMs: timer(),
      });

      return files;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-pr-files',
        operationType: 'READ',
        componentType: 'PullRequest',
        componentId: prNumber.toString(),
        success: false,
        error: error.message,
        parameters: { repoId, prNumber },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Create a new branch (requires GHE_ENABLE_CREATE=true)
   */
  async createBranch(repoId: string, branchName: string, fromBranch?: string): Promise<any> {
    if (!this.config.enableCreate) {
      throw new Error('Branch creation is disabled. Set GHE_ENABLE_CREATE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      // Get source branch SHA
      const sourceBranch = fromBranch || (await this.getDefaultBranch(repoId)).branch;
      const branchInfo = await this.getBranchDetails(repoId, sourceBranch);
      const sha = branchInfo.commit.sha;

      // Create new branch
      const result = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/git/refs`,
        {
          method: 'POST',
          data: {
            ref: `refs/heads/${branchName}`,
            sha,
          },
          useCache: false,
        }
      );

      auditLogger.log({
        operation: 'create-branch',
        operationType: 'CREATE',
        componentType: 'Branch',
        componentName: branchName,
        success: true,
        parameters: { repoId, branchName, fromBranch: sourceBranch },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-branch',
        operationType: 'CREATE',
        componentType: 'Branch',
        componentName: branchName,
        success: false,
        error: error.message,
        parameters: { repoId, branchName, fromBranch },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Update file content (requires GHE_ENABLE_WRITE=true)
   */
  async updateFile(
    repoId: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha: string
  ): Promise<any> {
    if (!this.config.enableWrite) {
      throw new Error('File updates are disabled. Set GHE_ENABLE_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const encodedContent = Buffer.from(content).toString('base64');

      const result = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/contents/${path}`,
        {
          method: 'PUT',
          data: {
            message,
            content: encodedContent,
            sha,
            branch,
          },
          useCache: false,
        }
      );

      auditLogger.log({
        operation: 'update-file',
        operationType: 'UPDATE',
        componentType: 'File',
        componentName: path,
        success: true,
        parameters: { repoId, path, branch, message },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'update-file',
        operationType: 'UPDATE',
        componentType: 'File',
        componentName: path,
        success: false,
        error: error.message,
        parameters: { repoId, path, branch },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Create a new file (requires GHE_ENABLE_CREATE=true)
   */
  async createFile(
    repoId: string,
    path: string,
    content: string,
    message: string,
    branch: string
  ): Promise<any> {
    if (!this.config.enableCreate) {
      throw new Error('File creation is disabled. Set GHE_ENABLE_CREATE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const encodedContent = Buffer.from(content).toString('base64');

      const result = await this.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/contents/${path}`,
        {
          method: 'PUT',
          data: {
            message,
            content: encodedContent,
            branch,
          },
          useCache: false,
        }
      );

      auditLogger.log({
        operation: 'create-file',
        operationType: 'CREATE',
        componentType: 'File',
        componentName: path,
        success: true,
        parameters: { repoId, path, branch, message },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-file',
        operationType: 'CREATE',
        componentType: 'File',
        componentName: path,
        success: false,
        error: error.message,
        parameters: { repoId, path, branch },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Search repositories
   */
  async searchRepositories(query: string, owner?: string): Promise<any> {
    const timer = auditLogger.startTimer();

    try {
      let searchQuery = query;
      if (owner) {
        searchQuery += ` org:${owner}`;
      }

      const result = await this.makeRequest<any>(
        `search/repositories?q=${encodeURIComponent(searchQuery)}`,
        { useCache: false }
      );

      auditLogger.log({
        operation: 'search-repositories',
        operationType: 'READ',
        componentType: 'Repository',
        success: true,
        parameters: { query, owner, totalResults: result.total_count },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'search-repositories',
        operationType: 'READ',
        componentType: 'Repository',
        success: false,
        error: error.message,
        parameters: { query, owner },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get directory structure recursively
   */
  async getDirectoryStructure(repoId: string, path?: string, branch?: string, depth: number = 3): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      // Auto-detect branch if not specified
      const selectedBranch = branch || (await this.getDefaultBranch(repoId)).branch;

      // Recursive function to build tree
      const buildTree = async (currentPath: string, currentDepth: number): Promise<any> => {
        if (currentDepth > depth) {
          return { truncated: true };
        }

        const contents = await this.makeRequest<any[]>(
          `repos/${repo.owner}/${repo.repo}/contents/${currentPath}?ref=${selectedBranch}`,
          { repoId }
        );

        const tree: any[] = [];
        for (const item of contents) {
          if (item.type === 'dir' && currentDepth < depth) {
            tree.push({
              ...item,
              children: await buildTree(item.path, currentDepth + 1)
            });
          } else {
            tree.push(item);
          }
        }

        return tree;
      };

      const tree = await buildTree(path || '', 1);

      auditLogger.log({
        operation: 'get-directory-structure',
        operationType: 'READ',
        componentType: 'Directory',
        componentName: path || '/',
        success: true,
        parameters: { repoId, path, branch: selectedBranch, depth },
        executionTimeMs: timer(),
      });

      return { tree, branch: selectedBranch };
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-directory-structure',
        operationType: 'READ',
        componentType: 'Directory',
        componentName: path || '/',
        success: false,
        error: error.message,
        parameters: { repoId, path, branch, depth },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get file commit history
   */
  async getFileHistory(repoId: string, path: string, branch?: string, limit: number = 50): Promise<any[]> {
    const timer = auditLogger.startTimer();

    try {
      const commits = await this.getCommits(repoId, branch, undefined, undefined, undefined, path, limit);

      auditLogger.log({
        operation: 'get-file-history',
        operationType: 'READ',
        componentType: 'File',
        componentName: path,
        success: true,
        parameters: { repoId, path, branch, limit, count: commits.length },
        executionTimeMs: timer(),
      });

      return commits;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-file-history',
        operationType: 'READ',
        componentType: 'File',
        componentName: path,
        success: false,
        error: error.message,
        parameters: { repoId, path, branch, limit },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  /**
   * Get commit diff
   */
  async getCommitDiff(repoId: string, sha: string, format: 'diff' | 'patch' = 'diff'): Promise<string> {
    const timer = auditLogger.startTimer();
    const repo = this.getRepoById(repoId);

    try {
      const acceptHeader = format === 'patch'
        ? 'application/vnd.github.v3.patch'
        : 'application/vnd.github.v3.diff';

      const token = await this.getAccessToken();
      const url = `${this.baseApiUrl}/repos/${repo.owner}/${repo.repo}/commits/${sha}`;

      const response = await axios({
        method: 'GET',
        url,
        headers: {
          'Authorization': `token ${token}`,
          'Accept': acceptHeader,
          'X-GitHub-Api-Version': this.config.apiVersion,
        },
      });

      auditLogger.log({
        operation: 'get-commit-diff',
        operationType: 'READ',
        componentType: 'Commit',
        componentId: sha,
        success: true,
        parameters: { repoId, sha, format },
        executionTimeMs: timer(),
      });

      return response.data;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-commit-diff',
        operationType: 'READ',
        componentType: 'Commit',
        componentId: sha,
        success: false,
        error: error.message,
        parameters: { repoId, sha, format },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }
}
