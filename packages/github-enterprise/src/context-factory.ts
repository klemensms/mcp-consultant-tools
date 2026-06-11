/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { GitHubEnterpriseService } from './services/base-service.js';
import type { GitHubEnterpriseConfig } from './services/base-service.js';
import { RepoService } from './services/repo-service.js';
import { PrService } from './services/pr-service.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let base: GitHubEnterpriseService | null = null;
  let repoService: RepoService | null = null;
  let prService: PrService | null = null;

  function getBase(): GitHubEnterpriseService {
    if (!base) {
      const missingConfig: string[] = [];
      let repos: any[] = [];

      if (process.env.GHE_REPOS) {
        try {
          repos = JSON.parse(process.env.GHE_REPOS);
        } catch {
          throw new Error('Failed to parse GHE_REPOS JSON');
        }
      } else {
        missingConfig.push('GHE_REPOS');
      }

      if (!process.env.GHE_TOKEN) missingConfig.push('GHE_TOKEN');

      if (missingConfig.length > 0) {
        throw new Error(`Missing GitHub Enterprise configuration: ${missingConfig.join(', ')}`);
      }

      const config: GitHubEnterpriseConfig = {
        repos,
        baseUrl: process.env.GHE_BASE_URL || 'https://github.com',
        apiVersion: process.env.GHE_API_VERSION || '2022-11-28',
        authMethod: 'pat',
        pat: process.env.GHE_TOKEN!,
        enableWrite: process.env.GHE_ENABLE_WRITE === 'true',
        enableCreate: process.env.GHE_ENABLE_CREATE === 'true',
        enablePrWrite: process.env.GHE_ENABLE_PR_WRITE === 'true',
        enableCache: process.env.GHE_ENABLE_CACHE !== 'false',
        cacheTtl: parseInt(process.env.GHE_CACHE_TTL || '300'),
        maxFileSize: parseInt(process.env.GHE_MAX_FILE_SIZE || '1048576'),
        maxSearchResults: parseInt(process.env.GHE_MAX_SEARCH_RESULTS || '100'),
      };

      base = new GitHubEnterpriseService(config);
      console.error('GitHub Enterprise service initialized');
    }
    return base;
  }

  return {
    get repo() {
      if (!repoService) repoService = new RepoService(getBase());
      return repoService;
    },
    get pr() {
      if (!prService) prService = new PrService(getBase());
      return prService;
    },
  };
}
