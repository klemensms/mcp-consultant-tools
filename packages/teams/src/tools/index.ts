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
  registerUpdateChannelMessageTool,
  registerDeleteChannelMessageTool,
  registerUndoDeleteChannelMessageTool,
} from './read-channel.js';
import {
  registerListChatsTool,
  registerGetChatMessagesTool,
  registerSendChatMessageTool,
  registerMarkChatReadTool,
  registerUpdateChatMessageTool,
  registerDeleteChatMessageTool,
  registerUndoDeleteChatMessageTool,
} from './chats.js';
import {
  registerReactToChannelMessageTool,
  registerReactToChatMessageTool,
} from './reactions.js';
import { registerFindUserTool, registerSendDirectMessageTool } from './people.js';
import {
  registerSearchMessagesTool,
  registerGetChannelMessagesDeltaTool,
} from './search.js';
import { registerDownloadMessageAttachmentsTool } from './attachments.js';
import { registerSendGroupMessageTool, registerAddChatMemberTool } from './group-chats.js';

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
  registerUpdateChannelMessageTool(server, ctx);
  registerDeleteChannelMessageTool(server, ctx);
  registerUndoDeleteChannelMessageTool(server, ctx);

  // Chat tools
  registerListChatsTool(server, ctx);
  registerGetChatMessagesTool(server, ctx);
  registerSendChatMessageTool(server, ctx);
  registerMarkChatReadTool(server, ctx);
  registerUpdateChatMessageTool(server, ctx);
  registerDeleteChatMessageTool(server, ctx);
  registerUndoDeleteChatMessageTool(server, ctx);

  // Reaction tools
  registerReactToChannelMessageTool(server, ctx);
  registerReactToChatMessageTool(server, ctx);

  // People tools
  registerFindUserTool(server, ctx);
  registerSendDirectMessageTool(server, ctx);

  // Group chat tools
  registerSendGroupMessageTool(server, ctx);
  registerAddChatMemberTool(server, ctx);

  // Search and delta tools
  registerSearchMessagesTool(server, ctx);
  registerGetChannelMessagesDeltaTool(server, ctx);

  // Attachment tools
  registerDownloadMessageAttachmentsTool(server, ctx);

  console.error("teams tools registered: 29 tools");
}

export { registerAuthenticateTool, registerAuthStatusTool, registerLogoutTool } from './authenticate.js';
export { registerSendMessageTool } from './send-message.js';
export { registerSendCardTool } from './send-card.js';
export { registerListChannelsTool, registerListTeamsTool } from './list-channels.js';
export {
  registerGetChannelMessagesTool,
  registerGetMessageRepliesTool,
  registerReplyToMessageTool,
  registerUpdateChannelMessageTool,
  registerDeleteChannelMessageTool,
  registerUndoDeleteChannelMessageTool,
} from './read-channel.js';
export {
  registerListChatsTool,
  registerGetChatMessagesTool,
  registerSendChatMessageTool,
  registerMarkChatReadTool,
  registerUpdateChatMessageTool,
  registerDeleteChatMessageTool,
  registerUndoDeleteChatMessageTool,
} from './chats.js';
export {
  registerReactToChannelMessageTool,
  registerReactToChatMessageTool,
} from './reactions.js';
export { registerFindUserTool, registerSendDirectMessageTool } from './people.js';
export {
  registerSearchMessagesTool,
  registerGetChannelMessagesDeltaTool,
} from './search.js';
export { registerDownloadMessageAttachmentsTool } from './attachments.js';
export { registerSendGroupMessageTool, registerAddChatMemberTool } from './group-chats.js';
