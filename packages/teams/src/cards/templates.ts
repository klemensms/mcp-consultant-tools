/**
 * Adaptive Card Templates for Release Announcements
 */

import type { AdaptiveCard, ReleaseTemplateData, CardTemplate } from "../types.js";

/**
 * Create a release announcement card
 */
function createReleaseAnnouncementCard(data: ReleaseTemplateData): AdaptiveCard {
  const npmUrl = data.npmUrl || `https://www.npmjs.com/package/${data.packageName}`;

  return {
    type: "AdaptiveCard",
    version: "1.4",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body: [
      {
        type: "Container",
        style: "emphasis",
        items: [
          {
            type: "TextBlock",
            text: `🚀 New Release: ${data.packageName} v${data.version}`,
            size: "large",
            weight: "bolder",
            wrap: true,
          },
        ],
      },
      {
        type: "TextBlock",
        text: data.summary,
        wrap: true,
        spacing: "medium",
      },
      {
        type: "FactSet",
        facts: [
          { title: "Version", value: data.version },
          { title: "Released", value: data.date },
          { title: "Type", value: data.releaseType },
        ],
      },
      {
        type: "TextBlock",
        text: "**Changes:**",
        weight: "bolder",
        spacing: "medium",
      },
      {
        type: "TextBlock",
        text: data.changes,
        wrap: true,
      },
    ],
    actions: [
      ...(data.releaseNotesUrl
        ? [
            {
              type: "Action.OpenUrl" as const,
              title: "View Release Notes",
              url: data.releaseNotesUrl,
            },
          ]
        : []),
      {
        type: "Action.OpenUrl" as const,
        title: "npm Package",
        url: npmUrl,
      },
    ],
  };
}

/**
 * Create a beta release card with warning styling
 */
function createBetaReleaseCard(data: ReleaseTemplateData): AdaptiveCard {
  const npmUrl = data.npmUrl || `https://www.npmjs.com/package/${data.packageName}`;

  return {
    type: "AdaptiveCard",
    version: "1.4",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body: [
      {
        type: "Container",
        style: "warning",
        items: [
          {
            type: "TextBlock",
            text: `🧪 Beta Release: ${data.packageName} v${data.version}`,
            size: "large",
            weight: "bolder",
            wrap: true,
          },
        ],
      },
      {
        type: "TextBlock",
        text: "⚠️ **This is a pre-release version for testing purposes.**",
        wrap: true,
        color: "warning",
      },
      {
        type: "TextBlock",
        text: data.summary,
        wrap: true,
        spacing: "medium",
      },
      {
        type: "FactSet",
        facts: [
          { title: "Version", value: data.version },
          { title: "Released", value: data.date },
          { title: "Type", value: "Beta Release" },
        ],
      },
      {
        type: "TextBlock",
        text: "**Changes:**",
        weight: "bolder",
        spacing: "medium",
      },
      {
        type: "TextBlock",
        text: data.changes,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Install with: `npm install ${data.packageName}@beta`",
        wrap: true,
        spacing: "medium",
      },
    ],
    actions: [
      ...(data.releaseNotesUrl
        ? [
            {
              type: "Action.OpenUrl" as const,
              title: "View Release Notes",
              url: data.releaseNotesUrl,
            },
          ]
        : []),
      {
        type: "Action.OpenUrl" as const,
        title: "npm Package (Beta)",
        url: npmUrl,
      },
    ],
  };
}

/**
 * Create a hotfix card with attention styling
 */
function createHotfixCard(data: ReleaseTemplateData): AdaptiveCard {
  const npmUrl = data.npmUrl || `https://www.npmjs.com/package/${data.packageName}`;

  return {
    type: "AdaptiveCard",
    version: "1.4",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    body: [
      {
        type: "Container",
        style: "attention",
        items: [
          {
            type: "TextBlock",
            text: `🔥 Hotfix: ${data.packageName} v${data.version}`,
            size: "large",
            weight: "bolder",
            color: "attention",
            wrap: true,
          },
        ],
      },
      {
        type: "TextBlock",
        text: "🚨 **Critical fix - please update immediately.**",
        wrap: true,
        color: "attention",
      },
      {
        type: "TextBlock",
        text: data.summary,
        wrap: true,
        spacing: "medium",
      },
      {
        type: "FactSet",
        facts: [
          { title: "Version", value: data.version },
          { title: "Released", value: data.date },
          { title: "Type", value: "Hotfix" },
        ],
      },
      {
        type: "TextBlock",
        text: "**Fixed Issues:**",
        weight: "bolder",
        spacing: "medium",
      },
      {
        type: "TextBlock",
        text: data.changes,
        wrap: true,
      },
    ],
    actions: [
      ...(data.releaseNotesUrl
        ? [
            {
              type: "Action.OpenUrl" as const,
              title: "View Details",
              url: data.releaseNotesUrl,
            },
          ]
        : []),
      {
        type: "Action.OpenUrl" as const,
        title: "Update Now",
        url: npmUrl,
      },
    ],
  };
}

/**
 * Get a card from a template
 */
export function getCardFromTemplate(
  template: CardTemplate,
  data: ReleaseTemplateData
): AdaptiveCard {
  switch (template) {
    case "release-announcement":
      return createReleaseAnnouncementCard(data);
    case "beta-release":
      return createBetaReleaseCard(data);
    case "hotfix":
      return createHotfixCard(data);
    default:
      throw new Error(`Unknown template: ${template}`);
  }
}

/**
 * Available templates
 */
export const AVAILABLE_TEMPLATES: CardTemplate[] = [
  "release-announcement",
  "beta-release",
  "hotfix",
];
