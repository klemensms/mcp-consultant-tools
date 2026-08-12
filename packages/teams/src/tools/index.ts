/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerAuthenticateTool, registerAuthStatusTool, registerLogoutTool } from './authenticate.js';
import { registerSendMessageTool } from './send-message.js';
import { registerSendCardTool } from './send-card.js';
import { registerListChannelsTool, registerListTeamsTool } from './list-channels.js';
import {
  registerGetChannelMessagesTool,
  registerGetMessageRepliesTool,
  registerReplyToMessageTool,
} from './read-channel.js';
import {
  registerListChatsTool,
  registerGetChatMessagesTool,
  registerSendChatMessageTool,
  registerMarkChatReadTool,
} from './chats.js';
import {
  registerReactToChannelMessageTool,
  registerReactToChatMessageTool,
} from './reactions.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  // Authentication tools
  registerAuthenticateTool(server, ctx);
  registerAuthStatusTool(server, ctx);
  registerLogoutTool(server, ctx);

  // Discovery tools
  registerListChannelsTool(server, ctx);
  registerListTeamsTool(server, ctx);

  // Channel messaging tools
  registerSendMessageTool(server, ctx);
  registerSendCardTool(server, ctx);
  registerGetChannelMessagesTool(server, ctx);
  registerGetMessageRepliesTool(server, ctx);
  registerReplyToMessageTool(server, ctx);

  // Chat tools
  registerListChatsTool(server, ctx);
  registerGetChatMessagesTool(server, ctx);
  registerSendChatMessageTool(server, ctx);
  registerMarkChatReadTool(server, ctx);

  // Reaction tools
  registerReactToChannelMessageTool(server, ctx);
  registerReactToChatMessageTool(server, ctx);

  console.error("teams tools registered: 16 tools");
}

export { registerAuthenticateTool, registerAuthStatusTool, registerLogoutTool } from './authenticate.js';
export { registerSendMessageTool } from './send-message.js';
export { registerSendCardTool } from './send-card.js';
export { registerListChannelsTool, registerListTeamsTool } from './list-channels.js';
export {
  registerGetChannelMessagesTool,
  registerGetMessageRepliesTool,
  registerReplyToMessageTool,
} from './read-channel.js';
export {
  registerListChatsTool,
  registerGetChatMessagesTool,
  registerSendChatMessageTool,
  registerMarkChatReadTool,
} from './chats.js';
export {
  registerReactToChannelMessageTool,
  registerReactToChatMessageTool,
} from './reactions.js';
