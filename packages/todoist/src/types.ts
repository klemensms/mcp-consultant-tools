/**
 * Todoist MCP Server Type Definitions
 */

import type { TodoistService } from './services/todoist-service.js';

export interface ServiceContext {
  readonly todoist: TodoistService;
}

export interface TodoistConfig {
  apiToken: string;
  baseUrl?: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  color?: string;
  parent_id?: string | null;
  order?: number;
  comment_count?: number;
  is_shared?: boolean;
  is_favorite?: boolean;
  is_inbox_project?: boolean;
  view_style?: string;
  url?: string;
}

export interface TodoistDue {
  date: string;
  string?: string;
  lang?: string;
  is_recurring?: boolean;
  datetime?: string | null;
  timezone?: string | null;
}

export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  project_id?: string;
  section_id?: string | null;
  parent_id?: string | null;
  order?: number;
  labels?: string[];
  priority?: number;
  due?: TodoistDue | null;
  is_completed?: boolean;
  url?: string;
  comment_count?: number;
  created_at?: string;
}

export interface CreateProjectInput {
  name: string;
  parent_id?: string;
  color?: string;
  is_favorite?: boolean;
  view_style?: 'list' | 'board';
}

export interface UpdateProjectInput {
  name?: string;
  color?: string;
  is_favorite?: boolean;
  view_style?: 'list' | 'board';
}

export interface CreateTaskInput {
  content: string;
  description?: string;
  project_id?: string;
  section_id?: string;
  parent_id?: string;
  order?: number;
  labels?: string[];
  priority?: 1 | 2 | 3 | 4;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  due_lang?: string;
  assignee_id?: string;
}

export interface UpdateTaskInput {
  content?: string;
  description?: string;
  labels?: string[];
  priority?: 1 | 2 | 3 | 4;
  due_string?: string;
  due_date?: string;
  due_datetime?: string;
  due_lang?: string;
  assignee_id?: string | null;
}

export interface ListTasksOptions {
  project_id?: string;
  section_id?: string;
  label?: string;
  filter?: string;
  lang?: string;
  ids?: string[];
}
