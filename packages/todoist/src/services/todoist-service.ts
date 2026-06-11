/**
 * TodoistService - business logic wrapper over the Todoist REST API.
 * No MCP or CLI concerns here.
 */

import { TodoistClient } from '../todoist-client.js';
import type {
  CreateProjectInput,
  CreateTaskInput,
  ListTasksOptions,
  TodoistProject,
  TodoistTask,
  UpdateProjectInput,
  UpdateTaskInput,
} from '../types.js';

/**
 * Unwrap the Todoist v1 paginated response shape `{ results, next_cursor }`
 * into a plain array. Also tolerates legacy plain-array responses.
 */
async function unwrapList<T>(promise: Promise<any>): Promise<T[]> {
  const data = await promise;
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray(data.results)) return data.results as T[];
  return [];
}

export class TodoistService {
  constructor(private readonly client: TodoistClient) {}

  // ── Projects ──────────────────────────────────────────────
  listProjects(): Promise<TodoistProject[]> {
    return unwrapList<TodoistProject>(this.client.request('GET', '/projects'));
  }

  getProject(id: string): Promise<TodoistProject> {
    return this.client.request<TodoistProject>('GET', `/projects/${encodeURIComponent(id)}`);
  }

  createProject(input: CreateProjectInput): Promise<TodoistProject> {
    return this.client.request<TodoistProject>('POST', '/projects', { body: input });
  }

  updateProject(id: string, input: UpdateProjectInput): Promise<TodoistProject> {
    return this.client.request<TodoistProject>(
      'POST',
      `/projects/${encodeURIComponent(id)}`,
      { body: input }
    );
  }

  async deleteProject(id: string): Promise<void> {
    await this.client.request('DELETE', `/projects/${encodeURIComponent(id)}`);
  }

  // ── Tasks ─────────────────────────────────────────────────
  listTasks(options: ListTasksOptions = {}): Promise<TodoistTask[]> {
    const query: Record<string, unknown> = {};
    if (options.project_id) query.project_id = options.project_id;
    if (options.section_id) query.section_id = options.section_id;
    if (options.label) query.label = options.label;
    if (options.filter) query.filter = options.filter;
    if (options.lang) query.lang = options.lang;
    if (options.ids && options.ids.length > 0) query.ids = options.ids.join(',');
    return unwrapList<TodoistTask>(this.client.request('GET', '/tasks', { query }));
  }

  getTask(id: string): Promise<TodoistTask> {
    return this.client.request<TodoistTask>('GET', `/tasks/${encodeURIComponent(id)}`);
  }

  createTask(input: CreateTaskInput): Promise<TodoistTask> {
    return this.client.request<TodoistTask>('POST', '/tasks', { body: input });
  }

  updateTask(id: string, input: UpdateTaskInput): Promise<TodoistTask> {
    return this.client.request<TodoistTask>(
      'POST',
      `/tasks/${encodeURIComponent(id)}`,
      { body: input }
    );
  }

  async closeTask(id: string): Promise<void> {
    await this.client.request('POST', `/tasks/${encodeURIComponent(id)}/close`);
  }

  async reopenTask(id: string): Promise<void> {
    await this.client.request('POST', `/tasks/${encodeURIComponent(id)}/reopen`);
  }

  async deleteTask(id: string): Promise<void> {
    await this.client.request('DELETE', `/tasks/${encodeURIComponent(id)}`);
  }
}
