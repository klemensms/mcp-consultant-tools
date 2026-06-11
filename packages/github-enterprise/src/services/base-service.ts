import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import axios from 'axios';

/**
 * GitHub Enterprise Repository Configuration
 */
export interface GitHubRepoConfig {
  id: string;
  owner: string;
  repo: string;
  defaultBranch?: string;
  active: boolean;
  description?: string;
}

/**
 * GitHub Enterprise Service Configuration
 */
export interface GitHubEnterpriseConfig {
  baseUrl: string;
  apiVersion: string;
  authMethod: 'pat' | 'github-app';
  pat?: string;
  appId?: string;
  appPrivateKey?: string;
  appInstallationId?: string;
  repos: GitHubRepoConfig[];
  enableWrite: boolean;
  enableCreate: boolean;
  enablePrWrite: boolean;
  enableCache: boolean;
  cacheTtl: number;
  maxFileSize: number;
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
 * GitHub Enterprise Base Service
 * Manages authentication, API requests, caching, and repository configuration.
 */
export class GitHubEnterpriseService {
  readonly config: GitHubEnterpriseConfig;
  readonly baseApiUrl: string;
  private octokit: Octokit | null = null;

  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  private cache: Map<string, { data: any; expires: number }> = new Map();

  constructor(config: GitHubEnterpriseConfig) {
    this.config = config;
    this.baseApiUrl = `${config.baseUrl}/api/v3`;
    this.initializeOctokit();
  }

  private initializeOctokit(): void {
    try {
      if (this.config.authMethod === 'pat') {
        this.octokit = new Octokit({
          auth: this.config.pat,
          baseUrl: this.baseApiUrl,
          userAgent: 'mcp-consultant-tools',
        });
      } else if (this.config.authMethod === 'github-app') {
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

  async getAccessToken(): Promise<string> {
    if (this.config.authMethod === 'pat') {
      return this.config.pat!;
    }

    const currentTime = Date.now();
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      const auth = await this.octokit!.auth({ type: 'installation' }) as any;
      if (!auth.token) {
        throw new Error('GitHub App auth did not return a token');
      }
      const token: string = auth.token;
      this.accessToken = token;
      this.tokenExpirationTime = currentTime + (55 * 60 * 1000);
      return token;
    } catch (error: any) {
      console.error('Failed to acquire GitHub App installation token:', error.message);
      throw new Error(`Failed to acquire GitHub App token: ${error.message}`);
    }
  }

  private getCacheKey(method: string, repo: string, resource: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${method}:${repo}:${resource}:${paramStr}`;
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expires) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any, ttlSeconds?: number): void {
    if (!this.config.enableCache) return;
    const ttl = ttlSeconds || this.config.cacheTtl;
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttl * 1000)
    });
  }

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

  async makeRequest<T>(
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

      if (method === 'GET' && useCache && this.config.enableCache) {
        const cacheKey = this.getCacheKey(method, repoId || '', endpoint, data);
        this.setCache(cacheKey, response.data, cacheTtl);
      }

      return response.data as T;
    } catch (error: any) {
      let errorMessage = 'Unknown error';

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

  getAllRepos(): GitHubRepoConfig[] {
    return this.config.repos;
  }

  getActiveRepos(): GitHubRepoConfig[] {
    return this.config.repos.filter(r => r.active);
  }

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
}
