/**
 * Configuration Tools - get-configuration
 */
import type { ServiceContext } from '../types.js';

export function registerConfigurationTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-configuration",
    "Get the configured Azure DevOps organization and projects. Use this to construct correct URLs.",
    {},
    async () => {
      try {
        const config = ctx.configuration.getConfiguration();

        if (!config) {
          return {
            content: [{
              type: "text",
              text: "Azure DevOps not configured. Set AZUREDEVOPS_ORGANIZATION and AZUREDEVOPS_PROJECTS environment variables.",
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `Azure DevOps Configuration:\n\n${JSON.stringify(config, null, 2)}`,
          }],
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get configuration: ${error.message}`,
          }],
        };
      }
    }
  );
}
