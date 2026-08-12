/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { TeamsService } from './services/teams-service.js';
import { MessageService } from './services/message-service.js';
import type { TeamsConfig } from './types.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: TeamsService | null = null;
  let messageService: MessageService | null = null;

  function getService(): TeamsService {
    if (!service) {
      const authMode = process.env.TEAMS_AUTH_MODE === 'client-credentials'
        ? 'client-credentials'
        : 'device-code';

      const clientId = process.env.TEAMS_CLIENT_ID;
      const tenantId = process.env.TEAMS_TENANT_ID;

      if (!clientId) {
        throw new Error(
          'TEAMS_CLIENT_ID is required. You must register an Azure AD app:\n\n' +
          '1. Go to https://entra.microsoft.com → App registrations → New registration\n' +
          "2. Enable 'Allow public client flows' in Authentication settings\n" +
          '3. Add delegated Microsoft Graph permissions: User.Read, Team.ReadBasic.All,\n' +
          '   Channel.ReadBasic.All, ChannelMessage.Read.All, ChannelMessage.Send,\n' +
          '   Chat.ReadWrite, Group.Read.All, offline_access\n' +
          '4. Grant admin consent\n' +
          "5. Set TEAMS_CLIENT_ID to your app's Application (client) ID"
        );
      }
      if (!tenantId) {
        throw new Error(
          'TEAMS_TENANT_ID is required. Set it to your Azure AD tenant ID.\n' +
          'Find it in Azure Portal → Microsoft Entra ID → Overview → Tenant ID'
        );
      }
      if (authMode === 'client-credentials' && !process.env.TEAMS_CLIENT_SECRET) {
        throw new Error(
          'TEAMS_CLIENT_SECRET is required for client-credentials auth mode. ' +
          'For interactive authentication, use TEAMS_AUTH_MODE=device-code (default).'
        );
      }

      const config: TeamsConfig = {
        authMode,
        tenantId,
        clientId,
        clientSecret: process.env.TEAMS_CLIENT_SECRET,
        defaultTeamId: process.env.TEAMS_DEFAULT_TEAM_ID,
        defaultChannelId: process.env.TEAMS_DEFAULT_CHANNEL_ID,
      };

      service = new TeamsService(config);
      console.error(`Teams service initialized (${authMode} mode)`);
    }
    return service;
  }

  function getMessageService(): MessageService {
    if (!messageService) {
      messageService = new MessageService(getService());
    }
    return messageService;
  }

  return {
    get teams() { return getService(); },
    get messages() { return getMessageService(); },
  };
}
