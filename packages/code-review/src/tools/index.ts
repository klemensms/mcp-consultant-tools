import type { ServiceContext } from '../types.js';
import { registerRepositoryTools } from './repository-tools.js';
import { registerDotnetVersionTools } from './dotnet-version-tools.js';
import { registerNugetPackageTools } from './nuget-package-tools.js';
import { registerComplexityTools } from './complexity-tools.js';
import { registerReviewTools } from './review-tools.js';
import { registerPackageTools } from './package-tools.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  registerRepositoryTools(server, ctx);
  registerDotnetVersionTools(server, ctx);
  registerNugetPackageTools(server, ctx);
  registerComplexityTools(server, ctx);
  registerReviewTools(server, ctx);
  registerPackageTools(server, ctx);
}
