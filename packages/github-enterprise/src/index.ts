#!/usr/bin/env node

/**
 * @mcp-consultant-tools/github-enterprise
 *
 * MCP server for GitHub Enterprise integration.
 * Entry point: MCP server startup + backward-compatible registerGitHubEnterpriseTools().
 */

import { createRequire } from 'node:module';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { createMcpServer, createEnvLoader, resolveSecrets } from "@mcp-consultant-tools/core";

import { GitHubEnterpriseService } from './services/base-service.js';
import type { GitHubEnterpriseConfig } from './services/base-service.js';
import { RepoService } from './services/repo-service.js';
import { PrService } from './services/pr-service.js';
import type { ServiceContext } from './types.js';
import { registerAllTools } from './tools/index.js';
import { registerAllPrompts } from './prompts/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/**
 * Build a ServiceContext from environment variables (lazy service initialization).
 */
function createServiceContext(): ServiceContext {
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
        } catch (error) {
          throw new Error("Failed to parse GHE_REPOS JSON");
        }
      } else {
        missingConfig.push("GHE_REPOS");
      }

      if (!process.env.GHE_TOKEN) missingConfig.push("GHE_TOKEN");

      if (missingConfig.length > 0) {
        throw new Error(`Missing GitHub Enterprise configuration: ${missingConfig.join(", ")}`);
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
      console.error("GitHub Enterprise service initialized");
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

/**
 * Register GitHub Enterprise tools and prompts to an MCP server.
 * Backward-compatible API for the meta package.
 */
export function registerGitHubEnterpriseTools(server: any): void {
  const ctx = createServiceContext();
  registerAllTools(server, ctx);
  registerAllPrompts(server, ctx);

  const enablePrWrite = process.env.GHE_ENABLE_PR_WRITE === 'true';
  const enableCreate = process.env.GHE_ENABLE_CREATE === 'true';
  const baseToolCount = 22;
  const prReadToolCount = 3;
  const prWriteToolCount = enablePrWrite ? 11 : 0;
  const createPrToolCount = enableCreate ? 1 : 0;
  const totalToolCount = baseToolCount + prReadToolCount + prWriteToolCount + createPrToolCount;

  console.error(`GitHub Enterprise tools registered: ${totalToolCount} tools, 5 prompts` +
    (enablePrWrite ? ' (PR write enabled)' : '') +
    (enableCreate ? ' (create enabled)' : ''));
}

// Backward-compatible exports
export { GitHubEnterpriseService } from './services/base-service.js';
export type {
  GitHubEnterpriseConfig,
  GitHubRepoConfig,
  BranchSelection,
} from './services/base-service.js';
export { RepoService } from './services/repo-service.js';
export { PrService } from './services/pr-service.js';
export type { ServiceContext } from './types.js';

/**
 * Standalone CLI server (when run directly)
 * Uses realpathSync to resolve symlinks created by npx
 */
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const loadEnv = createEnvLoader();
  loadEnv();
  await resolveSecrets();

  const server = createMcpServer({
    name: "mcp-github-enterprise",
    version: pkg.version,
    capabilities: { tools: {}, prompts: {} },
  });

  registerGitHubEnterpriseTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start GitHub Enterprise MCP server:", error);
    process.exit(1);
  });

  console.error("GitHub Enterprise MCP server running");
}
