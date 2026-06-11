import { auditLogger } from '@mcp-consultant-tools/core';
import axios from 'axios';
import type { GitHubEnterpriseService } from './base-service.js';

/**
 * Pull request operations: list, get, review, comment, merge, labels, reviewers.
 */
export class PrService {
  constructor(public readonly base: GitHubEnterpriseService) {}

  async listPullRequests(
    repoId: string, state: 'open' | 'closed' | 'all' = 'open',
    base?: string, head?: string, sort: 'created' | 'updated' | 'popularity' = 'created',
    limit: number = 30
  ): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const params: any = { state, sort, per_page: limit };
      if (base) params.base = base;
      if (head) params.head = head;

      const queryString = new URLSearchParams(params).toString();
      const prs = await this.base.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/pulls?${queryString}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'list-pull-requests', operationType: 'READ', componentType: 'PullRequest',
        success: true, parameters: { repoId, state, base, head, sort, limit, count: prs.length },
        executionTimeMs: timer(),
      });

      return prs;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-pull-requests', operationType: 'READ', componentType: 'PullRequest',
        success: false, error: error.message, parameters: { repoId, state, base, head, sort, limit },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getPullRequest(repoId: string, prNumber: number): Promise<any> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const pr = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-pull-request', operationType: 'READ', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true, parameters: { repoId, prNumber },
        executionTimeMs: timer(),
      });

      return pr;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-pull-request', operationType: 'READ', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getPullRequestFiles(repoId: string, prNumber: number): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const files = await this.base.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/files`,
        { repoId }
      );

      auditLogger.log({
        operation: 'get-pr-files', operationType: 'READ', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, fileCount: files.length }, executionTimeMs: timer(),
      });

      return files;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-pr-files', operationType: 'READ', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async listPrReviews(repoId: string, prNumber: number): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const reviews = await this.base.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/reviews`,
        { repoId }
      );

      auditLogger.log({
        operation: 'list-pr-reviews', operationType: 'READ', componentType: 'PullRequestReview',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, count: reviews.length }, executionTimeMs: timer(),
      });

      return reviews;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-pr-reviews', operationType: 'READ', componentType: 'PullRequestReview',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async listPrComments(repoId: string, prNumber: number): Promise<any[]> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const comments = await this.base.makeRequest<any[]>(
        `repos/${repo.owner}/${repo.repo}/issues/${prNumber}/comments`,
        { repoId }
      );

      auditLogger.log({
        operation: 'list-pr-comments', operationType: 'READ', componentType: 'PullRequestComment',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, count: comments.length }, executionTimeMs: timer(),
      });

      return comments;
    } catch (error: any) {
      auditLogger.log({
        operation: 'list-pr-comments', operationType: 'READ', componentType: 'PullRequestComment',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async getPrDiff(repoId: string, prNumber: number): Promise<string> {
    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const token = await this.base.getAccessToken();
      const url = `${this.base.baseApiUrl}/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}`;

      const response = await axios({
        method: 'GET', url,
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3.diff',
          'X-GitHub-Api-Version': this.base.config.apiVersion,
        },
      });

      auditLogger.log({
        operation: 'get-pr-diff', operationType: 'READ', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true, parameters: { repoId, prNumber },
        executionTimeMs: timer(),
      });

      return response.data;
    } catch (error: any) {
      auditLogger.log({
        operation: 'get-pr-diff', operationType: 'READ', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  // ========================================
  // WRITE OPERATIONS (require GHE_ENABLE_PR_WRITE=true)
  // ========================================

  async submitPrReview(
    repoId: string, prNumber: number,
    options: {
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      body?: string; commitId?: string;
      comments?: Array<{ path: string; position?: number; line?: number; body: string }>;
    }
  ): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const data: any = { event: options.event };
      if (options.body) data.body = options.body;
      if (options.commitId) data.commit_id = options.commitId;
      if (options.comments) data.comments = options.comments;

      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/reviews`,
        { method: 'POST', data, useCache: false }
      );

      auditLogger.log({
        operation: 'submit-pr-review', operationType: 'CREATE', componentType: 'PullRequestReview',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, event: options.event }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'submit-pr-review', operationType: 'CREATE', componentType: 'PullRequestReview',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber, event: options.event }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async addPrComment(repoId: string, prNumber: number, body: string): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/issues/${prNumber}/comments`,
        { method: 'POST', data: { body }, useCache: false }
      );

      auditLogger.log({
        operation: 'add-pr-comment', operationType: 'CREATE', componentType: 'PullRequestComment',
        componentId: prNumber.toString(), success: true, parameters: { repoId, prNumber },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'add-pr-comment', operationType: 'CREATE', componentType: 'PullRequestComment',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async addReviewComment(
    repoId: string, prNumber: number,
    options: {
      body: string; commitId: string; path: string;
      line?: number; side?: 'LEFT' | 'RIGHT';
      startLine?: number; startSide?: 'LEFT' | 'RIGHT';
    }
  ): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const data: any = { body: options.body, commit_id: options.commitId, path: options.path };
      if (options.line) data.line = options.line;
      if (options.side) data.side = options.side;
      if (options.startLine) data.start_line = options.startLine;
      if (options.startSide) data.start_side = options.startSide;

      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/comments`,
        { method: 'POST', data, useCache: false }
      );

      auditLogger.log({
        operation: 'add-review-comment', operationType: 'CREATE', componentType: 'ReviewComment',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, path: options.path, line: options.line }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'add-review-comment', operationType: 'CREATE', componentType: 'ReviewComment',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber, path: options.path }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async mergePullRequest(
    repoId: string, prNumber: number,
    options?: { mergeMethod?: 'merge' | 'squash' | 'rebase'; commitTitle?: string; commitMessage?: string; sha?: string; }
  ): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const data: any = {};
      if (options?.mergeMethod) data.merge_method = options.mergeMethod;
      if (options?.commitTitle) data.commit_title = options.commitTitle;
      if (options?.commitMessage) data.commit_message = options.commitMessage;
      if (options?.sha) data.sha = options.sha;

      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/merge`,
        { method: 'PUT', data, useCache: false }
      );

      auditLogger.log({
        operation: 'merge-pull-request', operationType: 'UPDATE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, mergeMethod: options?.mergeMethod || 'merge' }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'merge-pull-request', operationType: 'UPDATE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async replyToReviewComment(repoId: string, prNumber: number, commentId: number, body: string): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/comments/${commentId}/replies`,
        { method: 'POST', data: { body }, useCache: false }
      );

      auditLogger.log({
        operation: 'reply-to-review-comment', operationType: 'CREATE', componentType: 'ReviewCommentReply',
        componentId: commentId.toString(), success: true, parameters: { repoId, prNumber, commentId },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'reply-to-review-comment', operationType: 'CREATE', componentType: 'ReviewCommentReply',
        componentId: commentId.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber, commentId }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async createPullRequest(
    repoId: string,
    options: { title: string; head: string; base: string; body?: string; draft?: boolean; maintainerCanModify?: boolean; }
  ): Promise<any> {
    if (!this.base.config.enableCreate) {
      throw new Error('PR creation is disabled. Set GHE_ENABLE_CREATE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const data: any = { title: options.title, head: options.head, base: options.base };
      if (options.body) data.body = options.body;
      if (options.draft !== undefined) data.draft = options.draft;
      if (options.maintainerCanModify !== undefined) data.maintainer_can_modify = options.maintainerCanModify;

      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls`,
        { method: 'POST', data, useCache: false }
      );

      auditLogger.log({
        operation: 'create-pull-request', operationType: 'CREATE', componentType: 'PullRequest',
        componentId: result.number.toString(), success: true,
        parameters: { repoId, title: options.title, head: options.head, base: options.base },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'create-pull-request', operationType: 'CREATE', componentType: 'PullRequest',
        success: false, error: error.message,
        parameters: { repoId, title: options.title, head: options.head, base: options.base },
        executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async updatePullRequest(
    repoId: string, prNumber: number,
    options: { title?: string; body?: string; state?: 'open' | 'closed'; base?: string; maintainerCanModify?: boolean; }
  ): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const data: any = {};
      if (options.title) data.title = options.title;
      if (options.body !== undefined) data.body = options.body;
      if (options.state) data.state = options.state;
      if (options.base) data.base = options.base;
      if (options.maintainerCanModify !== undefined) data.maintainer_can_modify = options.maintainerCanModify;

      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}`,
        { method: 'PATCH', data, useCache: false }
      );

      auditLogger.log({
        operation: 'update-pull-request', operationType: 'UPDATE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true, parameters: { repoId, prNumber, ...options },
        executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'update-pull-request', operationType: 'UPDATE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async requestPrReviewers(repoId: string, prNumber: number, reviewers?: string[], teamReviewers?: string[]): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const data: any = {};
      if (reviewers && reviewers.length > 0) data.reviewers = reviewers;
      if (teamReviewers && teamReviewers.length > 0) data.team_reviewers = teamReviewers;

      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/requested_reviewers`,
        { method: 'POST', data, useCache: false }
      );

      auditLogger.log({
        operation: 'request-pr-reviewers', operationType: 'UPDATE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, reviewers, teamReviewers }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'request-pr-reviewers', operationType: 'UPDATE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async removePrReviewers(repoId: string, prNumber: number, reviewers?: string[], teamReviewers?: string[]): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const data: any = {};
      if (reviewers && reviewers.length > 0) data.reviewers = reviewers;
      if (teamReviewers && teamReviewers.length > 0) data.team_reviewers = teamReviewers;

      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/requested_reviewers`,
        { method: 'DELETE', data, useCache: false }
      );

      auditLogger.log({
        operation: 'remove-pr-reviewers', operationType: 'DELETE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, reviewers, teamReviewers }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'remove-pr-reviewers', operationType: 'DELETE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async addPrLabels(repoId: string, prNumber: number, labels: string[]): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/issues/${prNumber}/labels`,
        { method: 'POST', data: { labels }, useCache: false }
      );

      auditLogger.log({
        operation: 'add-pr-labels', operationType: 'UPDATE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, labels }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'add-pr-labels', operationType: 'UPDATE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber, labels }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async removePrLabel(repoId: string, prNumber: number, label: string): Promise<any> {
    if (!this.base.config.enablePrWrite) {
      throw new Error('PR write operations disabled. Set GHE_ENABLE_PR_WRITE=true to enable.');
    }

    const timer = auditLogger.startTimer();
    const repo = this.base.getRepoById(repoId);

    try {
      const result = await this.base.makeRequest<any>(
        `repos/${repo.owner}/${repo.repo}/issues/${prNumber}/labels/${encodeURIComponent(label)}`,
        { method: 'DELETE', useCache: false }
      );

      auditLogger.log({
        operation: 'remove-pr-label', operationType: 'DELETE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: true,
        parameters: { repoId, prNumber, label }, executionTimeMs: timer(),
      });

      return result;
    } catch (error: any) {
      auditLogger.log({
        operation: 'remove-pr-label', operationType: 'DELETE', componentType: 'PullRequest',
        componentId: prNumber.toString(), success: false, error: error.message,
        parameters: { repoId, prNumber, label }, executionTimeMs: timer(),
      });
      throw error;
    }
  }

  async closePullRequest(repoId: string, prNumber: number): Promise<any> {
    return this.updatePullRequest(repoId, prNumber, { state: 'closed' });
  }
}
