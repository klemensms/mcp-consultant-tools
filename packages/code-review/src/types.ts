/**
 * Service context shared between the MCP server (index.ts) and the CLI (cli.ts).
 * Uses lazy getters so a missing credential only surfaces when a tool actually runs.
 */
import type { RepositoryService } from './services/repository-service.js';
import type { DotnetVersionService } from './services/dotnet-version-service.js';
import type { NugetPackageService } from './services/nuget-package-service.js';
import type { ComplexityService } from './services/complexity-service.js';
import type { PackageService } from './services/package-service.js';

export interface ServiceContext {
  readonly repositories: RepositoryService;
  readonly dotnetVersions: DotnetVersionService;
  readonly nugetPackages: NugetPackageService;
  readonly complexity: ComplexityService;
  readonly packages: PackageService;
}
