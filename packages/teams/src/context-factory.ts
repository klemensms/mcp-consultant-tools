/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { TeamsService } from './services/teams-service.js';
import type { TeamsConfig } from './types.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: TeamsService | null = null;

  function getService(): TeamsService {
    if (!service) {
      const authMode = process.env.TEAMS_AUTH_MODE === 'client-credentials'
        ? 'client-credentials'
        : 'device-code';

      const clientId = process.env.TEAMS_CLIENT_ID;
      const tenantId = process.env.TEAMS_TENANT_ID;

      if (!clientId) {
        throw new Error(
          'TEAMS_CLIENT_ID is required. Register an Azure AD app and set this variable.'
        );
      }
      if (!tenantId) {
        throw new Error(
          'TEAMS_TENANT_ID is required. Set it to your Azure AD tenant ID.'
        );
      }
      if (authMode === 'client-credentials' && !process.env.TEAMS_CLIENT_SECRET) {
        throw new Error(
          'TEAMS_CLIENT_SECRET is required for client-credentials auth mode.'
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

  return {
    get teams() { return getService(); },
  };
}
