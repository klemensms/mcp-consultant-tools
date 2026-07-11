/**
 * CLI Commands barrel export + combined registration.
 * Command names map 1:1 to the cr-* MCP tools (tool name minus the cr- prefix).
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerRepositoryCommands } from './repository-commands.js';
import { registerDotnetVersionCommands } from './dotnet-version-commands.js';
import { registerNugetPackageCommands } from './nuget-package-commands.js';
import { registerComplexityCommands } from './complexity-commands.js';
import { registerReviewCommands } from './review-commands.js';
import { registerPackageCommands } from './package-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerRepositoryCommands(program, ctx);
  registerDotnetVersionCommands(program, ctx);
  registerNugetPackageCommands(program, ctx);
  registerComplexityCommands(program, ctx);
  registerReviewCommands(program, ctx);
  registerPackageCommands(program, ctx);
}
