/**
 * send-adaptive-card tool
 *
 * Sends Adaptive Cards to a Teams channel.
 * Supports both raw cards and pre-built templates.
 */

import { z } from "zod";
import type { ServiceContext } from "../types.js";
import type { AdaptiveCard, ReleaseTemplateData, CardTemplate } from "../types.js";
import { getCardFromTemplate, AVAILABLE_TEMPLATES } from "../cards/templates.js";
import {
  descWithExamples,
  CARD_TEMPLATE_EXAMPLES,
  IMPORTANCE_EXAMPLES,
} from "../tool-examples.js";

// Input schema for send-adaptive-card
export const sendCardSchema = {
  teamId: z
    .string()
    .optional()
    .describe("Team ID (optional if TEAMS_DEFAULT_TEAM_ID is set)"),
  channelId: z
    .string()
    .optional()
    .describe("Channel ID (optional if TEAMS_DEFAULT_CHANNEL_ID is set)"),
  card: z
    .any()
    .optional()
    .describe("Raw Adaptive Card JSON object. Use this OR template+templateData."),
  template: z
    .enum(["release-announcement", "beta-release", "hotfix"])
    .optional()
    .describe(descWithExamples("Use a pre-built card template", CARD_TEMPLATE_EXAMPLES)),
  templateData: z
    .object({
      packageName: z.string().describe("Package name (e.g., '@mcp-consultant-tools/azure-devops')"),
      version: z.string().describe("Version string (e.g., '27.0.0')"),
      summary: z.string().describe("Brief summary of the release"),
      date: z.string().describe("Release date (e.g., '2025-01-16')"),
      releaseType: z.string().describe("Type of release (e.g., 'Minor Release', 'Patch')"),
      changes: z.string().describe("Markdown list of changes"),
      releaseNotesUrl: z.string().optional().describe("URL to release notes"),
      npmUrl: z.string().optional().describe("URL to npm package (auto-generated if not provided)"),
    })
    .optional()
    .describe("Data to fill the template. Required when using template."),
  importance: z
    .enum(["normal", "high", "urgent"])
    .optional()
    .default("normal")
    .describe(descWithExamples("Message importance level", IMPORTANCE_EXAMPLES)),
};

/**
 * Register the send-adaptive-card tool
 */
export function registerSendCardTool(
  server: any,
  ctx: ServiceContext
): void {
  server.tool(
    "send-adaptive-card",
    `Send an Adaptive Card to a Microsoft Teams channel. Use pre-built templates (${AVAILABLE_TEMPLATES.join(", ")}) for release announcements, or provide a raw card JSON.`,
    sendCardSchema,
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({
      teamId,
      channelId,
      card,
      template,
      templateData,
      importance,
    }: {
      teamId?: string;
      channelId?: string;
      card?: AdaptiveCard;
      template?: CardTemplate;
      templateData?: ReleaseTemplateData;
      importance?: "normal" | "high" | "urgent";
    }) => {
      try {
        const service = ctx.teams;

        // Determine which card to send
        let cardToSend: AdaptiveCard;

        if (card) {
          // Use raw card
          cardToSend = card;
        } else if (template && templateData) {
          // Use template
          cardToSend = getCardFromTemplate(template, templateData);
        } else {
          return {
            content: [
              {
                type: "text",
                text: `❌ Invalid input: Provide either 'card' (raw Adaptive Card JSON) OR 'template' + 'templateData'.\n\nAvailable templates: ${AVAILABLE_TEMPLATES.join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        const result = await service.sendAdaptiveCard(cardToSend, {
          teamId,
          channelId,
          importance,
        });

        const templateInfo = template ? ` (template: ${template})` : "";

        return {
          content: [
            {
              type: "text",
              text: `✅ Adaptive Card sent successfully${templateInfo}!\n\nMessage ID: ${result.messageId}${result.webUrl ? `\nView: ${result.webUrl}` : ""}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to send adaptive card: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
