/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../types.js';
import { registerFigmaDataCommands } from './figma-data-commands.js';
import { registerSemanticCommands } from './semantic-commands.js';
import { registerAdoStoryCommands } from './ado-story-commands.js';
import { registerImageCommands } from './image-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerFigmaDataCommands(program, ctx);
  registerSemanticCommands(program, ctx);
  registerAdoStoryCommands(program, ctx);
  registerImageCommands(program, ctx);
}

export { registerFigmaDataCommands } from './figma-data-commands.js';
export { registerSemanticCommands } from './semantic-commands.js';
export { registerAdoStoryCommands } from './ado-story-commands.js';
export { registerImageCommands } from './image-commands.js';
