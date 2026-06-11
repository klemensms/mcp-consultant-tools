/**
 * Shared service context factory - used by both MCP server and CLI.
 */
import { FigmaService } from './services/figma-service.js';
import type { FigmaConfig } from './models/index.js';
import type { ServiceContext } from './types.js';

export type { ServiceContext } from './types.js';

export function createServiceContext(): ServiceContext {
  let service: FigmaService | null = null;

  function getService(): FigmaService {
    if (!service) {
      if (!process.env.FIGMA_API_KEY && !process.env.FIGMA_OAUTH_TOKEN) {
        throw new Error(
          'Missing required Figma configuration: FIGMA_API_KEY or FIGMA_OAUTH_TOKEN'
        );
      }

      const config: FigmaConfig = {
        apiKey: process.env.FIGMA_API_KEY,
        oauthToken: process.env.FIGMA_OAUTH_TOKEN,
        useOAuth: process.env.FIGMA_USE_OAUTH === 'true',
      };

      service = new FigmaService(config);
      console.error('Figma service initialized');
    }
    return service;
  }

  return {
    get figma() { return getService(); },
  };
}
