/**
 * Microsoft 365 Message Center reads: service update messages (planned changes, advisories,
 * stay-informed posts).
 *
 * As with service health, every filter is CLIENT-SIDE — Graph ignores `$filter` on the
 * `messages` collection, and every enum (`category`, `severity`) is compared case-insensitively
 * because the docs disagree with live payloads on casing.
 */

import { MessageCenterClient } from '../message-center-client.js';
import { assertAnnouncementId } from '../utils/announcement-id.js';
import { equalsIgnoreCase, someIncludesIgnoreCase, sortByLastModifiedDesc } from '../utils/filters.js';
import type {
  GraphServiceUpdateMessage,
  ListMessagesOptions,
  MessageListResult,
} from '../models/message-center-types.js';

const BASE_PATH = '/admin/serviceAnnouncement';

// ---------------------------------------------------------------------------
// Pure predicate — unit-tested without a Graph client
// ---------------------------------------------------------------------------

/** All filters are AND-ed and compared case-insensitively. */
export function matchesMessage(message: GraphServiceUpdateMessage, options: ListMessagesOptions): boolean {
  if (options.category !== undefined && !equalsIgnoreCase(message.category, options.category)) {
    return false;
  }
  if (options.severity !== undefined && !equalsIgnoreCase(message.severity, options.severity)) {
    return false;
  }
  if (options.service !== undefined && !someIncludesIgnoreCase(message.services, options.service)) {
    return false;
  }
  if (options.isMajorChange !== undefined && (message.isMajorChange ?? false) !== options.isMajorChange) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MessageService {
  constructor(private client: MessageCenterClient) {}

  /** Message Center posts, filtered and ordered (newest first) client-side. */
  async listMessages(options: ListMessagesOptions = {}): Promise<MessageListResult> {
    const hasFilter =
      options.category !== undefined ||
      options.severity !== undefined ||
      options.service !== undefined ||
      options.isMajorChange !== undefined;

    const fetchLimit = hasFilter ? undefined : options.maxResults;

    let page;
    try {
      page = await this.client.paginate<GraphServiceUpdateMessage>(`${BASE_PATH}/messages`, fetchLimit);
    } catch (error) {
      throw this.client.enhanceError(error, 'listing message center messages');
    }

    let messages = hasFilter ? page.items.filter((m) => matchesMessage(m, options)) : page.items;
    messages = sortByLastModifiedDesc(messages);
    let truncated = page.truncated;

    if (hasFilter && options.maxResults !== undefined && messages.length > options.maxResults) {
      messages = messages.slice(0, options.maxResults);
      truncated = true;
    }

    return { messages, total: messages.length, truncated };
  }

  /** One message by its service-announcement ID. */
  async getMessage(messageId: string): Promise<GraphServiceUpdateMessage> {
    const id = assertAnnouncementId(messageId, 'messageId');
    try {
      return await this.client.get<GraphServiceUpdateMessage>(`${BASE_PATH}/messages/${id}`);
    } catch (error) {
      throw this.client.enhanceError(error, `getting message ${id}`);
    }
  }
}
