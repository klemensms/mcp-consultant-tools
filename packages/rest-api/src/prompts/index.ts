/**
 * Prompts barrel export + combined registration
 */
import { getRestApiGuidePrompt, getRestApiTroubleshootPrompt } from './templates.js';

export function registerAllPrompts(server: any): void {
  server.prompt(
    "rest-api-guide",
    "Comprehensive guide for using the REST API testing tools",
    {},
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: getRestApiGuidePrompt() },
        },
      ],
    })
  );

  server.prompt(
    "rest-api-troubleshoot",
    "Troubleshooting guide for common REST API testing issues",
    {},
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: getRestApiTroubleshootPrompt() },
        },
      ],
    })
  );

  console.error("rest-api prompts registered: 2 prompts");
}
