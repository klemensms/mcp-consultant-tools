/**
 * Todoist HTTP client.
 *
 * Defaults to the Todoist REST v2 API (https://api.todoist.com/rest/v2) because
 * it returns plain arrays and has the most stable shape. The base URL can be
 * overridden with TODOIST_BASE_URL if needed.
 */

import { randomUUID } from 'node:crypto';
import type { TodoistConfig } from './types.js';

export class TodoistClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor(config: TodoistConfig) {
    if (!config.apiToken) {
      throw new Error('TODOIST_API_TOKEN is required');
    }
    this.apiToken = config.apiToken;
    this.baseUrl = (config.baseUrl ?? 'https://api.todoist.com/api/v1').replace(/\/+$/, '');
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      Accept: 'application/json',
    };

    let body: string | undefined;
    if (options.body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['X-Request-Id'] = randomUUID();
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), { method, headers, body });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Todoist ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
