/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { TodoistClient } from './todoist-client.js';
import { TodoistService } from './services/todoist-service.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: TodoistService | null = null;

  function getService(): TodoistService {
    if (!service) {
      const apiToken = process.env.TODOIST_API_TOKEN;
      if (!apiToken) {
        throw new Error(
          'TODOIST_API_TOKEN is required. Get it from https://todoist.com/app/settings/integrations/developer'
        );
      }
      const client = new TodoistClient({
        apiToken,
        baseUrl: process.env.TODOIST_BASE_URL,
      });
      service = new TodoistService(client);
    }
    return service;
  }

  return {
    get todoist() { return getService(); },
  };
}
