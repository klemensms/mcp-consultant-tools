/**
 * Shared ServiceContext factory for code-review. Used by both the MCP server (index.ts) and the
 * CLI (cli.ts) — there is exactly one copy.
 *
 * The package is provider-agnostic: CODE_REVIEW_PROVIDER selects Azure DevOps (PAT or an Entra
 * service principal), GitHub Enterprise (PAT), or a GitHub App. NuGet lookups go to the public
 * nuget.org API and need no credential.
 */

import { readFileSync } from 'node:fs';
import axios from 'axios';
import { CodeReviewClient, type CodeReviewConfig } from './code-review-client.js';
import { GheAppAuth } from './utils/ghe-app-auth.js';
import { AzdoEntraAuth } from './utils/azdo-entra-auth.js';
import { RepositoryService } from './services/repository-service.js';
import { DotnetVersionService } from './services/dotnet-version-service.js';
import { NugetPackageService, type FetchJson } from './services/nuget-package-service.js';
import { ComplexityService } from './services/complexity-service.js';
import { PackageService } from './services/package-service.js';
import type { ServiceContext } from './types.js';

const PROVIDERS = ['azure-devops', 'github-enterprise', 'github-app'] as const;
const AZDO_AUTH_METHODS = ['pat', 'entra-id'] as const;

/**
 * Build the provider config from environment variables, failing with a message that names every
 * missing variable (the missing-config surface tested against real credentials being absent).
 * Pure — reads env only, does no filesystem or network work — so it is unit-testable.
 */
export function buildCodeReviewConfig(env: NodeJS.ProcessEnv): CodeReviewConfig {
  const provider = env.CODE_REVIEW_PROVIDER;
  if (!provider) {
    throw new Error(`Missing CODE_REVIEW_PROVIDER (one of: ${PROVIDERS.join(', ')})`);
  }
  if (!(PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`Invalid CODE_REVIEW_PROVIDER '${provider}' (one of: ${PROVIDERS.join(', ')})`);
  }

  // Absent means 'pat', so every configuration written before entra-id existed keeps working.
  const azdoAuthMethod = env.CODE_REVIEW_AZDO_AUTH_METHOD || 'pat';
  if (provider === 'azure-devops' && !(AZDO_AUTH_METHODS as readonly string[]).includes(azdoAuthMethod)) {
    throw new Error(
      `Invalid CODE_REVIEW_AZDO_AUTH_METHOD '${azdoAuthMethod}' (one of: ${AZDO_AUTH_METHODS.join(', ')})`,
    );
  }

  const missing: string[] = [];
  if (provider === 'azure-devops') {
    if (!env.CODE_REVIEW_AZDO_ORGANIZATION) missing.push('CODE_REVIEW_AZDO_ORGANIZATION');
    if (azdoAuthMethod === 'entra-id') {
      if (!env.CODE_REVIEW_AZDO_CLIENT_ID) missing.push('CODE_REVIEW_AZDO_CLIENT_ID');
      if (!env.CODE_REVIEW_AZDO_CLIENT_SECRET) missing.push('CODE_REVIEW_AZDO_CLIENT_SECRET');
      if (!env.CODE_REVIEW_AZDO_TENANT_ID) missing.push('CODE_REVIEW_AZDO_TENANT_ID');
    } else if (!env.CODE_REVIEW_AZDO_PAT) {
      missing.push('CODE_REVIEW_AZDO_PAT');
    }
  } else if (provider === 'github-enterprise') {
    if (!env.CODE_REVIEW_GHE_BASE_URL) missing.push('CODE_REVIEW_GHE_BASE_URL');
    if (!env.CODE_REVIEW_GHE_TOKEN) missing.push('CODE_REVIEW_GHE_TOKEN');
  } else {
    if (!env.CODE_REVIEW_GHE_BASE_URL) missing.push('CODE_REVIEW_GHE_BASE_URL');
    if (!env.CODE_REVIEW_GHE_APP_ID) missing.push('CODE_REVIEW_GHE_APP_ID');
    if (!env.CODE_REVIEW_GHE_INSTALLATION_ID) missing.push('CODE_REVIEW_GHE_INSTALLATION_ID');
    if (!env.CODE_REVIEW_GHE_PRIVATE_KEY && !env.CODE_REVIEW_GHE_PRIVATE_KEY_PATH) {
      missing.push('CODE_REVIEW_GHE_PRIVATE_KEY or CODE_REVIEW_GHE_PRIVATE_KEY_PATH');
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing code-review configuration for provider '${provider}': ${missing.join(', ')}`);
  }

  return {
    provider: provider as CodeReviewConfig['provider'],
    azdoAuthMethod: azdoAuthMethod as CodeReviewConfig['azdoAuthMethod'],
    azdoOrganization: env.CODE_REVIEW_AZDO_ORGANIZATION,
    azdoProject: env.CODE_REVIEW_AZDO_PROJECT,
    azdoPat: env.CODE_REVIEW_AZDO_PAT,
    azdoClientId: env.CODE_REVIEW_AZDO_CLIENT_ID,
    azdoClientSecret: env.CODE_REVIEW_AZDO_CLIENT_SECRET,
    azdoTenantId: env.CODE_REVIEW_AZDO_TENANT_ID,
    gheBaseUrl: env.CODE_REVIEW_GHE_BASE_URL,
    gheToken: env.CODE_REVIEW_GHE_TOKEN,
    gheAppId: env.CODE_REVIEW_GHE_APP_ID,
    gheInstallationId: env.CODE_REVIEW_GHE_INSTALLATION_ID,
    ghePrivateKeyPath: env.CODE_REVIEW_GHE_PRIVATE_KEY_PATH,
    ghePrivateKey: env.CODE_REVIEW_GHE_PRIVATE_KEY,
  };
}

/** Optional repository allowlist — scopes every clone/list to a named set. Undefined = no filter. */
export function parseAllowedRepositories(env: NodeJS.ProcessEnv): string[] | undefined {
  const raw = env.CODE_REVIEW_ALLOWED_REPOSITORIES;
  if (!raw) return undefined;
  const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function resolvePrivateKeySync(keyPath?: string, keyInline?: string): string {
  if (keyPath) return readFileSync(keyPath, 'utf-8').trim();
  if (keyInline) return keyInline.replace(/\\n/g, '\n');
  throw new Error(
    'GitHub App private key is required. Set CODE_REVIEW_GHE_PRIVATE_KEY or CODE_REVIEW_GHE_PRIVATE_KEY_PATH.',
  );
}

export function createServiceContext(): ServiceContext {
  let client: CodeReviewClient | null = null;
  let repositories: RepositoryService | null = null;
  let dotnetVersions: DotnetVersionService | null = null;
  let nugetPackages: NugetPackageService | null = null;
  let complexity: ComplexityService | null = null;
  let packages: PackageService | null = null;

  function getClient(): CodeReviewClient {
    if (!client) {
      const config = buildCodeReviewConfig(process.env);
      let entraAuth: AzdoEntraAuth | undefined;
      if (config.provider === 'azure-devops' && config.azdoAuthMethod === 'entra-id') {
        entraAuth = new AzdoEntraAuth({
          tenantId: config.azdoTenantId!,
          clientId: config.azdoClientId!,
          clientSecret: config.azdoClientSecret!,
        });
      }
      let appAuth: GheAppAuth | undefined;
      if (config.provider === 'github-app') {
        appAuth = new GheAppAuth({
          appId: config.gheAppId!,
          installationId: config.gheInstallationId!,
          privateKey: resolvePrivateKeySync(config.ghePrivateKeyPath, config.ghePrivateKey),
          gheApiBaseUrl: config.gheBaseUrl!.endsWith('/api/v3')
            ? config.gheBaseUrl!
            : `${config.gheBaseUrl!}/api/v3`,
        });
      }
      client = new CodeReviewClient(config, appAuth, entraAuth);
      // Never log tokens, org names, or base URLs — they land in transcripts.
      const authNote = config.provider === 'azure-devops' ? `, auth: ${config.azdoAuthMethod}` : '';
      console.error(`Code-review client initialized (provider: ${config.provider}${authNote})`);
    }
    return client;
  }

  // NuGet lookups hit the public nuget.org API; no credential, gzip-decompressed JSON.
  const fetchJson: FetchJson = async (url: string) => {
    const response = await axios.get(url, {
      headers: { Accept: 'application/json' },
      decompress: true,
    });
    return response.data;
  };

  return {
    get repositories() {
      return (repositories ??= new RepositoryService(getClient(), parseAllowedRepositories(process.env)));
    },
    get dotnetVersions() {
      return (dotnetVersions ??= new DotnetVersionService());
    },
    get nugetPackages() {
      return (nugetPackages ??= new NugetPackageService(fetchJson));
    },
    get complexity() {
      return (complexity ??= new ComplexityService());
    },
    get packages() {
      return (packages ??= new PackageService(getClient()));
    },
  };
}
