/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { createPiiPipelineFromEnv } from '@mcp-consultant-tools/core';
import { B2CClient } from './b2c-client.js';
import { UserService } from './services/user-service.js';
import { GroupService } from './services/group-service.js';
import type { AzureB2CConfig } from './models/index.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  const piiPipeline = createPiiPipelineFromEnv({
    environmentIdentifier: process.env.AZURE_B2C_TENANT_ID,
  });
  let client: B2CClient | null = null;
  let userService: UserService | null = null;
  let groupService: GroupService | null = null;

  function getClient(): B2CClient {
    if (!client) {
      const missingConfig: string[] = [];

      const tenantId = process.env.AZURE_B2C_TENANT_ID;
      const clientId = process.env.AZURE_B2C_CLIENT_ID;
      const clientSecret = process.env.AZURE_B2C_CLIENT_SECRET;

      if (!tenantId) missingConfig.push('AZURE_B2C_TENANT_ID');
      if (!clientId) missingConfig.push('AZURE_B2C_CLIENT_ID');
      if (!clientSecret) missingConfig.push('AZURE_B2C_CLIENT_SECRET');

      if (missingConfig.length > 0) {
        throw new Error(`Missing Azure B2C configuration: ${missingConfig.join(', ')}`);
      }

      const config: AzureB2CConfig = {
        tenantId: tenantId!,
        clientId: clientId!,
        clientSecret: clientSecret!,
        enablePasswordReset: process.env.AZURE_B2C_ENABLE_PASSWORD_RESET === 'true',
        enableUserCreate: process.env.AZURE_B2C_ENABLE_USER_CREATE === 'true',
        enableUserUpdate: process.env.AZURE_B2C_ENABLE_USER_UPDATE === 'true',
        enableUserDelete: process.env.AZURE_B2C_ENABLE_USER_DELETE === 'true',
        maxResults: parseInt(process.env.AZURE_B2C_MAX_RESULTS || '100'),
      };

      client = new B2CClient(config);
      console.error('Azure B2C client initialized');
    }
    return client;
  }

  function getUserService(): UserService {
    if (!userService) {
      userService = new UserService(getClient(), piiPipeline);
    }
    return userService;
  }

  function getGroupService(): GroupService {
    if (!groupService) {
      groupService = new GroupService(getClient(), getUserService());
    }
    return groupService;
  }

  return {
    get client() { return getClient(); },
    get users() { return getUserService(); },
    get groups() { return getGroupService(); },
  };
}
