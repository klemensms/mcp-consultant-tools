/**
 * CLI Commands barrel export + combined registration
 */

import type { Command } from 'commander';
import type { ServiceContext } from '../../context-factory.js';
import { registerAuthCommands } from './auth-commands.js';
import { registerMessageCommands } from './message-commands.js';
import { registerReadCommands } from './read-commands.js';
import { registerPeopleCommands } from './people-commands.js';
import { registerSearchCommands } from './search-commands.js';
import { registerAttachmentCommands } from './attachment-commands.js';
import { registerGroupChatCommands } from './group-chat-commands.js';

export function registerAllCommands(program: Command, ctx: ServiceContext): void {
  registerAuthCommands(program, ctx);
  registerMessageCommands(program, ctx);
  registerReadCommands(program, ctx);
  registerPeopleCommands(program, ctx);
  registerSearchCommands(program, ctx);
  registerAttachmentCommands(program, ctx);
  registerGroupChatCommands(program, ctx);
}

export { registerAuthCommands } from './auth-commands.js';
export { registerMessageCommands } from './message-commands.js';
export { registerReadCommands } from './read-commands.js';
export { registerPeopleCommands } from './people-commands.js';
export { registerSearchCommands } from './search-commands.js';
export { registerAttachmentCommands } from './attachment-commands.js';
export { registerGroupChatCommands } from './group-chat-commands.js';
