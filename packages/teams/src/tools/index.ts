/**
 * Tools barrel export + combined registration
 */
import type { ServiceContext } from '../types.js';
import { registerAuthenticateTool, registerAuthStatusTool, registerLogoutTool } from './authenticate.js';
import { registerSendMessageTool } from './send-message.js';
import { registerSendCardTool } from './send-card.js';
import { registerListChannelsTool, registerListTeamsTool } from './list-channels.js';

export function registerAllTools(server: any, ctx: ServiceContext): void {
  // Authentication tools
  registerAuthenticateTool(server, ctx);
  registerAuthStatusTool(server, ctx);
  registerLogoutTool(server, ctx);

  // Messaging tools
  registerSendMessageTool(server, ctx);
  registerSendCardTool(server, ctx);
  registerListChannelsTool(server, ctx);
  registerListTeamsTool(server, ctx);

  console.error("teams tools registered: 7 tools");
}

export { registerAuthenticateTool, registerAuthStatusTool, registerLogoutTool } from './authenticate.js';
export { registerSendMessageTool } from './send-message.js';
export { registerSendCardTool } from './send-card.js';
export { registerListChannelsTool, registerListTeamsTool } from './list-channels.js';
