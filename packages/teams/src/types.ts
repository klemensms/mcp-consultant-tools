/**
 * Teams MCP Server Type Definitions
 */

import type { TeamsService } from './services/teams-service.js';
import type { MessageService } from './services/message-service.js';

/**
 * Service context shared between MCP server entry points.
 * Uses lazy getters to initialize services on-demand.
 */
export interface ServiceContext {
  readonly teams: TeamsService;
  readonly messages: MessageService;
}

/**
 * Authentication mode for Teams service
 * - 'client-credentials': App-only auth with client secret (for automation)
 * - 'device-code': User auth via browser (for interactive use)
 */
export type AuthMode = "client-credentials" | "device-code";

/**
 * Configuration for Teams service authentication
 */
export interface TeamsConfig {
  /** Authentication mode */
  authMode: AuthMode;
  /** Azure AD tenant ID (use 'common' for device-code with any tenant) */
  tenantId: string;
  /** Azure AD application (client) ID */
  clientId: string;
  /** Azure AD client secret (required for client-credentials mode) */
  clientSecret?: string;
  /** Default team ID for sending messages (optional) */
  defaultTeamId?: string;
  /** Default channel ID for sending messages (optional) */
  defaultChannelId?: string;
}

/**
 * Adaptive Card structure for Teams messages
 */
export interface AdaptiveCard {
  type: "AdaptiveCard";
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
  $schema?: string;
}

/**
 * Base type for adaptive card elements
 */
export type AdaptiveCardElement =
  | TextBlock
  | Container
  | FactSet
  | Image
  | ColumnSet
  | Record<string, unknown>;

export interface TextBlock {
  type: "TextBlock";
  text: string;
  size?: "small" | "default" | "medium" | "large" | "extraLarge";
  weight?: "lighter" | "default" | "bolder";
  color?: "default" | "dark" | "light" | "accent" | "good" | "warning" | "attention";
  wrap?: boolean;
  spacing?: "none" | "small" | "default" | "medium" | "large" | "extraLarge";
}

export interface Container {
  type: "Container";
  items: AdaptiveCardElement[];
  style?: "default" | "emphasis" | "good" | "attention" | "warning" | "accent";
}

export interface FactSet {
  type: "FactSet";
  facts: Array<{ title: string; value: string }>;
}

export interface Image {
  type: "Image";
  url: string;
  size?: "auto" | "stretch" | "small" | "medium" | "large";
  altText?: string;
}

export interface ColumnSet {
  type: "ColumnSet";
  columns: Array<{
    type: "Column";
    width?: string | number;
    items: AdaptiveCardElement[];
  }>;
}

export interface AdaptiveCardAction {
  type: "Action.OpenUrl" | "Action.Submit" | "Action.ShowCard";
  title: string;
  url?: string;
  data?: Record<string, unknown>;
}

/**
 * Data for release announcement card template
 */
export interface ReleaseTemplateData {
  /** Package name (e.g., "@mcp-consultant-tools/azure-devops") */
  packageName: string;
  /** Version string (e.g., "27.0.0") */
  version: string;
  /** Brief summary of the release */
  summary: string;
  /** Release date (e.g., "2025-01-16") */
  date: string;
  /** Type of release (e.g., "Minor Release", "Patch", "Beta") */
  releaseType: string;
  /** Markdown list of changes */
  changes: string;
  /** URL to release notes (optional) */
  releaseNotesUrl?: string;
  /** URL to npm package (optional, auto-generated if not provided) */
  npmUrl?: string;
}

/**
 * Available card templates
 */
export type CardTemplate = "release-announcement" | "beta-release" | "hotfix";

/**
 * Message importance levels
 */
export type MessageImportance = "normal" | "high" | "urgent";

/**
 * Message format types
 */
export type MessageFormat = "text" | "markdown";

/**
 * Team info returned from Graph API
 */
export interface TeamInfo {
  id: string;
  displayName: string;
  description?: string;
}

/**
 * Channel info returned from Graph API
 */
export interface ChannelInfo {
  id: string;
  displayName: string;
  description?: string;
  membershipType?: "standard" | "private" | "shared";
}

/**
 * Result of sending a message
 */
export interface SendMessageResult {
  messageId: string;
  webUrl?: string;
}

/**
 * A message read from a channel or chat, rendered for a human reader.
 * `id` is retained because it is what a reply or reaction call needs next.
 */
export interface MessageInfo {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime?: string;
  /** Display name of the sender, or a bot/system label when there is no user. */
  authorName: string;
  /** AAD user id of the sender when available - usable for @-mentions. */
  authorId?: string;
  /** Body flattened to readable plain text. */
  text: string;
  /** Number of replies, when the caller asked for it via $expand. */
  replyCount?: number;
  importance?: string;
  /** "message", "systemEventMessage", etc. */
  messageType?: string;
  webUrl?: string;
  /** Set when the message was deleted; body will be empty. */
  isDeleted?: boolean;
}

/**
 * A chat (1:1, group, or meeting) the signed-in user is part of
 */
export interface ChatInfo {
  id: string;
  topic?: string;
  chatType: string;
  /** Display names of members, when expanded. Graph caps this at 25 per chat. */
  memberNames?: string[];
  lastUpdatedDateTime?: string;
  webUrl?: string;
}

/**
 * Options common to the message-read tools
 */
export interface MessageReadOptions {
  /** Number of messages to return. Defaults to 20. */
  top?: number;
  /** Only messages modified at or after this ISO-8601 timestamp. */
  since?: string;
  /** Only messages modified before this ISO-8601 timestamp. */
  until?: string;
}

/**
 * The signed-in user's identity (from /me, via User.Read)
 */
export interface MeInfo {
  id: string;
  displayName: string;
  userPrincipalName: string;
}

/**
 * Authentication status for device-code flow
 */
export type AuthStatus =
  | "authenticated"      // Valid token exists
  | "not_authenticated"  // No token, needs to authenticate
  | "pending"            // Device code flow in progress
  | "expired";           // Token expired, needs re-authentication

/**
 * Authentication status response
 */
export interface AuthStatusResponse {
  status: AuthStatus;
  authMode: AuthMode;
  expiresAt?: string;
  message: string;
}

/**
 * Device code authentication response
 */
export interface DeviceCodeResponse {
  status: "pending";
  userCode: string;
  verificationUri: string;
  message: string;
  expiresInSeconds: number;
}

/**
 * Authentication result
 */
export interface AuthResult {
  status: "authenticated" | "failed" | "timeout";
  message: string;
  expiresAt?: string;
}
