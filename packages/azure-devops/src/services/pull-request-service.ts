/**
 * Pull Request Service - Azure DevOps pull request operations
 */
import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { AdoApiCollectionResponse } from '../models/index.js';

export class PullRequestService {
  constructor(private readonly client: AzureDevOpsClient) {}

  private truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  private getVoteLabel(vote: number): string {
    switch (vote) {
      case -10: return 'Rejected';
      case -5: return 'Waiting for author';
      case 0: return 'No response';
      case 5: return 'Approved with suggestions';
      case 10: return 'Approved';
      default: return `Unknown (${vote})`;
    }
  }

  async listRepositories(project: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<AdoApiCollectionResponse<any>>(
      `${project}/_apis/git/repositories?api-version=${this.client.apiVersion}`
    );

    return {
      project,
      totalCount: response.value.length,
      repositories: response.value.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        url: repo.url,
        defaultBranch: repo.defaultBranch,
        size: repo.size,
        remoteUrl: repo.remoteUrl,
        webUrl: repo.webUrl
      }))
    };
  }

  async listPullRequests(
    project: string,
    repositoryId: string,
    status: 'active' | 'completed' | 'abandoned' | 'all' = 'active',
    top: number = 25,
    creatorId?: string,
    reviewerId?: string
  ): Promise<any> {
    this.client.validateProject(project);

    let url = `${project}/_apis/git/repositories/${repositoryId}/pullrequests?searchCriteria.status=${status}&$top=${top}&api-version=${this.client.apiVersion}`;

    if (creatorId) url += `&searchCriteria.creatorId=${creatorId}`;
    if (reviewerId) url += `&searchCriteria.reviewerId=${reviewerId}`;

    const response = await this.client.get<AdoApiCollectionResponse<any>>(url);

    return {
      project,
      repositoryId,
      status,
      totalCount: response.value.length,
      pullRequests: response.value.map((pr: any) => ({
        pullRequestId: pr.pullRequestId,
        title: pr.title,
        description: pr.description ? this.truncate(pr.description, 200) : null,
        status: pr.status,
        createdBy: pr.createdBy?.displayName,
        creationDate: pr.creationDate,
        closedDate: pr.closedDate,
        sourceBranch: pr.sourceRefName?.replace('refs/heads/', ''),
        targetBranch: pr.targetRefName?.replace('refs/heads/', ''),
        mergeStatus: pr.mergeStatus,
        isDraft: pr.isDraft,
        reviewerCount: pr.reviewers?.length || 0,
        url: pr._links?.web?.href
      }))
    };
  }

  async getPullRequest(
    project: string,
    repositoryId: string,
    pullRequestId: number
  ): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<any>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?api-version=${this.client.apiVersion}`
    );

    return {
      pullRequestId: response.pullRequestId,
      title: response.title,
      description: response.description,
      status: response.status,
      createdBy: {
        displayName: response.createdBy?.displayName,
        id: response.createdBy?.id,
        uniqueName: response.createdBy?.uniqueName
      },
      creationDate: response.creationDate,
      closedDate: response.closedDate,
      sourceBranch: response.sourceRefName?.replace('refs/heads/', ''),
      targetBranch: response.targetRefName?.replace('refs/heads/', ''),
      mergeStatus: response.mergeStatus,
      isDraft: response.isDraft,
      mergeId: response.lastMergeCommit?.commitId,
      sourceCommitId: response.lastMergeSourceCommit?.commitId,
      targetCommitId: response.lastMergeTargetCommit?.commitId,
      supportsIterations: response.supportsIterations,
      reviewers: (response.reviewers || []).map((r: any) => ({
        displayName: r.displayName,
        id: r.id,
        vote: r.vote,
        voteLabel: this.getVoteLabel(r.vote),
        isRequired: r.isRequired,
        hasDeclined: r.hasDeclined
      })),
      labels: response.labels?.map((l: any) => l.name) || [],
      autoComplete: response.autoCompleteSetBy ? {
        setBy: response.autoCompleteSetBy.displayName,
        mergeStrategy: response.completionOptions?.mergeStrategy
      } : null,
      url: response._links?.web?.href,
      project
    };
  }

  async getPullRequestCommits(
    project: string,
    repositoryId: string,
    pullRequestId: number
  ): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<AdoApiCollectionResponse<any>>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/commits?api-version=${this.client.apiVersion}`
    );

    return {
      pullRequestId,
      project,
      totalCount: response.value.length,
      commits: response.value.map((c: any) => ({
        commitId: c.commitId,
        comment: c.comment,
        author: {
          name: c.author?.name,
          email: c.author?.email,
          date: c.author?.date
        },
        committer: {
          name: c.committer?.name,
          date: c.committer?.date
        },
        url: c.url
      }))
    };
  }

  async getPullRequestThreads(
    project: string,
    repositoryId: string,
    pullRequestId: number
  ): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<AdoApiCollectionResponse<any>>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads?api-version=${this.client.apiVersion}`
    );

    return {
      pullRequestId,
      project,
      totalCount: response.value.length,
      threads: response.value.map((t: any) => ({
        id: t.id,
        status: t.status,
        publishedDate: t.publishedDate,
        lastUpdatedDate: t.lastUpdatedDate,
        isDeleted: t.isDeleted,
        threadContext: t.threadContext ? {
          filePath: t.threadContext.filePath,
          rightFileStart: t.threadContext.rightFileStart,
          rightFileEnd: t.threadContext.rightFileEnd
        } : null,
        comments: (t.comments || []).filter((c: any) => !c.isDeleted).map((c: any) => ({
          id: c.id,
          author: c.author?.displayName,
          content: c.content,
          publishedDate: c.publishedDate,
          commentType: c.commentType,
          parentCommentId: c.parentCommentId
        }))
      }))
    };
  }

  async getPullRequestChanges(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    iterationId?: number
  ): Promise<any> {
    this.client.validateProject(project);

    let targetIteration = iterationId;
    if (!targetIteration) {
      const iterations = await this.client.get<AdoApiCollectionResponse<any>>(
        `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/iterations?api-version=${this.client.apiVersion}`
      );
      if (iterations.value.length > 0) {
        targetIteration = iterations.value[iterations.value.length - 1].id;
      } else {
        throw new Error('No iterations found for this pull request');
      }
    }

    const response = await this.client.get<any>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/iterations/${targetIteration}/changes?api-version=${this.client.apiVersion}`
    );

    return {
      pullRequestId,
      iterationId: targetIteration,
      project,
      totalCount: response.changeEntries?.length || 0,
      changes: (response.changeEntries || []).map((c: any) => ({
        changeType: c.changeType,
        path: c.item?.path,
        originalPath: c.originalPath,
        objectId: c.item?.objectId,
        originalObjectId: c.item?.originalObjectId
      }))
    };
  }

  // ==================== WRITE OPERATIONS ====================

  async addPullRequestThread(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    content: string,
    filePath?: string,
    lineNumber?: number,
    status: 'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending' = 'active'
  ): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enablePullRequestWrite) {
      throw new Error('Pull request write operations are disabled. Set AZUREDEVOPS_ENABLE_PR_WRITE=true to enable.');
    }

    const threadData: any = {
      comments: [
        {
          parentCommentId: 0,
          content: content,
          commentType: 1
        }
      ],
      status: status
    };

    if (filePath && lineNumber) {
      threadData.threadContext = {
        filePath: filePath.startsWith('/') ? filePath : `/${filePath}`,
        rightFileStart: { line: lineNumber, offset: 1 },
        rightFileEnd: { line: lineNumber, offset: 1 }
      };
    }

    const response = await this.client.post<any>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads?api-version=${this.client.apiVersion}`,
      threadData
    );

    return {
      threadId: response.id,
      status: response.status,
      publishedDate: response.publishedDate,
      filePath: response.threadContext?.filePath,
      comments: response.comments?.map((c: any) => ({
        id: c.id,
        content: c.content,
        author: c.author?.displayName
      })),
      message: filePath
        ? `Inline comment added to ${filePath} at line ${lineNumber}`
        : 'Comment thread created',
      pullRequestId,
      project
    };
  }

  async createPullRequest(
    project: string,
    repositoryId: string,
    sourceRefName: string,
    targetRefName: string,
    title: string,
    description?: string,
    reviewerIds?: string[],
    isDraft?: boolean
  ): Promise<any> {
    this.client.validateProject(project);
    if (!this.client.config.enablePullRequestWrite) {
      throw new Error('Pull request write operations are disabled. Set AZUREDEVOPS_ENABLE_PR_WRITE=true to enable.');
    }

    const body: any = {
      sourceRefName,
      targetRefName,
      title,
      description: description || '',
      isDraft: isDraft || false,
    };

    if (reviewerIds && reviewerIds.length > 0) {
      body.reviewers = reviewerIds.map(id => ({ id }));
    }

    const response = await this.client.request<any>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests?api-version=${this.client.apiVersion}`,
      'POST',
      body,
      false,
      { 'Content-Type': 'application/json' }
    );

    return {
      pullRequestId: response.pullRequestId,
      title: response.title,
      status: response.status,
      isDraft: response.isDraft,
      sourceBranch: response.sourceRefName?.replace('refs/heads/', ''),
      targetBranch: response.targetRefName?.replace('refs/heads/', ''),
      createdBy: response.createdBy?.displayName,
      creationDate: response.creationDate,
      url: response.url,
      project
    };
  }

  async updatePullRequest(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    updates: { title?: string; description?: string; status?: 'abandoned' | 'active'; isDraft?: boolean }
  ): Promise<any> {
    this.client.validateProject(project);
    if (!this.client.config.enablePullRequestWrite) {
      throw new Error('Pull request write operations are disabled. Set AZUREDEVOPS_ENABLE_PR_WRITE=true to enable.');
    }

    const body: any = {};
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.description !== undefined) body.description = updates.description;
    if (updates.status !== undefined) body.status = updates.status;
    if (updates.isDraft !== undefined) body.isDraft = updates.isDraft;

    const response = await this.client.request<any>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?api-version=${this.client.apiVersion}`,
      'PATCH',
      body,
      false,
      { 'Content-Type': 'application/json' }
    );

    return {
      pullRequestId: response.pullRequestId,
      title: response.title,
      description: response.description ? this.truncate(response.description, 200) : null,
      status: response.status,
      isDraft: response.isDraft,
      project
    };
  }

  async completePullRequest(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    mergeStrategy: 'squash' | 'noFastForward' | 'rebase' | 'rebaseMerge' = 'squash',
    deleteSourceBranch: boolean = true,
    transitionWorkItems: boolean = true,
    mergeCommitMessage?: string
  ): Promise<any> {
    this.client.validateProject(project);
    if (!this.client.config.enablePullRequestWrite) {
      throw new Error('Pull request write operations are disabled. Set AZUREDEVOPS_ENABLE_PR_WRITE=true to enable.');
    }

    const currentPr = await this.client.get<any>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?api-version=${this.client.apiVersion}`
    );

    const mergeStrategyMap: Record<string, number> = {
      noFastForward: 1,
      squash: 2,
      rebase: 3,
      rebaseMerge: 4,
    };

    const body: any = {
      status: 'completed',
      lastMergeSourceCommit: currentPr.lastMergeSourceCommit,
      completionOptions: {
        mergeStrategy: mergeStrategyMap[mergeStrategy],
        deleteSourceBranch,
        transitionWorkItems,
      },
    };

    if (mergeCommitMessage) {
      body.completionOptions.mergeCommitMessage = mergeCommitMessage;
    }

    const response = await this.client.request<any>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}?api-version=${this.client.apiVersion}`,
      'PATCH',
      body,
      false,
      { 'Content-Type': 'application/json' }
    );

    return {
      pullRequestId: response.pullRequestId,
      title: response.title,
      status: response.status,
      mergeStrategy,
      closedDate: response.closedDate,
      project
    };
  }

  async addOrRemovePrReviewer(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    reviewerId: string,
    isRequired?: boolean,
    remove?: boolean
  ): Promise<any> {
    this.client.validateProject(project);
    if (!this.client.config.enablePullRequestWrite) {
      throw new Error('Pull request write operations are disabled. Set AZUREDEVOPS_ENABLE_PR_WRITE=true to enable.');
    }

    const url = `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/reviewers/${reviewerId}?api-version=${this.client.apiVersion}`;

    if (remove) {
      await this.client.del<any>(url);
      return { pullRequestId, reviewerId, action: 'removed', project };
    }

    const body: any = { id: reviewerId };
    if (isRequired !== undefined) {
      body.isRequired = isRequired;
    }

    const response = await this.client.request<any>(url, 'PUT', body, false, { 'Content-Type': 'application/json' });

    return {
      pullRequestId,
      reviewerId: response.id,
      displayName: response.displayName,
      isRequired: response.isRequired,
      vote: response.vote,
      action: 'added',
      project
    };
  }

  async votePullRequest(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    vote: 'approve' | 'approveWithSuggestions' | 'noResponse' | 'waitForAuthor' | 'reject',
    reviewerId?: string
  ): Promise<any> {
    this.client.validateProject(project);
    if (!this.client.config.enablePullRequestWrite) {
      throw new Error('Pull request write operations are disabled. Set AZUREDEVOPS_ENABLE_PR_WRITE=true to enable.');
    }

    const voteMap: Record<string, number> = {
      approve: 10,
      approveWithSuggestions: 5,
      noResponse: 0,
      waitForAuthor: -5,
      reject: -10,
    };

    let userId = reviewerId;
    if (!userId) {
      const connectionData = await this.client.get<any>('_apis/connectionData');
      userId = connectionData.authenticatedUser?.id;
      if (!userId) {
        throw new Error('Could not resolve authenticated user ID. Provide reviewerId explicitly.');
      }
    }

    const body = { vote: voteMap[vote] };

    const response = await this.client.request<any>(
      `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/reviewers/${userId}?api-version=${this.client.apiVersion}`,
      'PUT',
      body,
      false,
      { 'Content-Type': 'application/json' }
    );

    return {
      pullRequestId,
      reviewerId: response.id,
      displayName: response.displayName,
      vote: response.vote,
      voteLabel: vote,
      project
    };
  }

  async replyToPrThread(
    project: string,
    repositoryId: string,
    pullRequestId: number,
    threadId: number,
    content?: string,
    status?: 'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending'
  ): Promise<any> {
    this.client.validateProject(project);
    if (!this.client.config.enablePullRequestWrite) {
      throw new Error('Pull request write operations are disabled. Set AZUREDEVOPS_ENABLE_PR_WRITE=true to enable.');
    }

    const results: any = { pullRequestId, threadId, project };

    if (content) {
      const commentResponse = await this.client.request<any>(
        `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}/comments?api-version=${this.client.apiVersion}`,
        'POST',
        { content, parentCommentId: 0, commentType: 1 },
        false,
        { 'Content-Type': 'application/json' }
      );
      results.comment = {
        id: commentResponse.id,
        content: commentResponse.content,
        author: commentResponse.author?.displayName,
      };
    }

    if (status) {
      await this.client.request<any>(
        `${project}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}/threads/${threadId}?api-version=${this.client.apiVersion}`,
        'PATCH',
        { status },
        false,
        { 'Content-Type': 'application/json' }
      );
      results.status = status;
    }

    return results;
  }
}
