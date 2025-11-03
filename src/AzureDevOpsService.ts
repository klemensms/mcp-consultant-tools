import axios from 'axios';

export interface AzureDevOpsConfig {
  organization: string;
  pat: string;
  projects: string[];  // List of allowed projects
  apiVersion?: string;
  enableWorkItemWrite?: boolean;
  enableWorkItemDelete?: boolean;
  enableWikiWrite?: boolean;
}

// Interface for API responses with value collections
export interface AdoApiCollectionResponse<T> {
  value: T[];
  count?: number;
  [key: string]: any; // For any additional properties
}

export class AzureDevOpsService {
  private config: AzureDevOpsConfig;
  private baseUrl: string;
  private searchUrl: string;
  private authHeader: string;
  private apiVersion: string;

  constructor(config: AzureDevOpsConfig) {
    this.config = {
      ...config,
      apiVersion: config.apiVersion || '7.1',
      enableWorkItemWrite: config.enableWorkItemWrite ?? false,
      enableWorkItemDelete: config.enableWorkItemDelete ?? false,
      enableWikiWrite: config.enableWikiWrite ?? false
    };

    this.baseUrl = `https://dev.azure.com/${this.config.organization}`;
    this.searchUrl = `https://almsearch.dev.azure.com/${this.config.organization}`;
    this.apiVersion = this.config.apiVersion!;

    // Encode PAT for Basic Auth (format is :PAT encoded in base64)
    this.authHeader = `Basic ${Buffer.from(`:${this.config.pat}`).toString('base64')}`;
  }

  /**
   * Validate that a project is in the allowed list
   */
  private validateProject(project: string): void {
    if (!this.config.projects.includes(project)) {
      throw new Error(`Project '${project}' is not in the allowed projects list. Allowed projects: ${this.config.projects.join(', ')}`);
    }
  }

  /**
   * Make an authenticated request to the Azure DevOps API
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
    data?: any,
    useSearchUrl: boolean = false
  ): Promise<T> {
    try {
      const baseUrl = useSearchUrl ? this.searchUrl : this.baseUrl;
      const url = `${baseUrl}/${endpoint}`;

      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': method === 'PATCH' ? 'application/json-patch+json' : 'application/json',
          'Accept': 'application/json'
        },
        data
      });

      return response.data as T;
    } catch (error: any) {
      const errorDetails = error.response?.data?.message || error.response?.data || error.message;
      console.error('Azure DevOps API request failed:', {
        endpoint,
        method,
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: errorDetails
      });

      // Provide user-friendly error messages
      if (error.response?.status === 401) {
        throw new Error('Azure DevOps authentication failed. Please check your PAT token and permissions.');
      }
      if (error.response?.status === 403) {
        throw new Error('Azure DevOps access denied. Please check your PAT scopes and project permissions.');
      }
      if (error.response?.status === 404) {
        throw new Error(`Azure DevOps resource not found: ${endpoint}`);
      }

      throw new Error(`Azure DevOps API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }

  // ==================== WIKI OPERATIONS ====================

  /**
   * Convert a git path (returned by search) to a wiki path (used by get-page API)
   * Git paths use dashes and .md extensions: /Release-Notes/Page-Name.md
   * Wiki paths use spaces and no extensions: /Release Notes/Page Name
   * @param gitPath The git path from search results
   * @returns The wiki path for use with get-page API
   */
  private convertGitPathToWikiPath(gitPath: string): string {
    return gitPath
      .replace(/\.md$/, '')      // Remove .md extension
      .replace(/-/g, ' ')         // Replace ALL dashes with spaces
      .replace(/%2D/gi, '-');     // Decode %2D back to - (actual dashes in page names)
  }

  /**
   * Get all wikis in a project
   * @param project The project name
   * @returns List of wikis in the project
   */
  async getWikis(project: string): Promise<any> {
    this.validateProject(project);

    const response = await this.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/wiki/wikis?api-version=${this.apiVersion}`
    );

    return {
      project,
      totalCount: response.value.length,
      wikis: response.value.map((wiki: any) => ({
        id: wiki.id,
        name: wiki.name,
        type: wiki.type,
        url: wiki.url,
        projectId: wiki.projectId,
        repositoryId: wiki.repositoryId,
        mappedPath: wiki.mappedPath
      }))
    };
  }

  /**
   * Search wiki pages across projects
   * @param searchText The text to search for
   * @param project Optional project filter
   * @param maxResults Maximum number of results (default: 25)
   * @returns Search results with highlighted content
   */
  async searchWikiPages(searchText: string, project?: string, maxResults: number = 25): Promise<any> {
    if (project) {
      this.validateProject(project);
    }

    const searchBody: any = {
      searchText,
      $top: maxResults,
      $skip: 0
    };

    // Add project filter if specified
    if (project) {
      searchBody.filters = {
        Project: [project]
      };
    }

    const response = await this.makeRequest<any>(
      `_apis/search/wikisearchresults?api-version=${this.apiVersion}`,
      'POST',
      searchBody,
      true  // Use search URL
    );

    return {
      searchText,
      project: project || 'all',
      totalCount: response.count || 0,
      results: (response.results || []).map((result: any) => {
        const gitPath = result.path;
        const wikiPath = this.convertGitPathToWikiPath(gitPath);
        return {
          fileName: result.fileName,
          gitPath: gitPath,           // Original git path (for reference)
          path: wikiPath,              // Wiki path (for get-page API) - kept as 'path' for backward compatibility
          wikiName: result.wiki?.name,
          wikiId: result.wiki?.id,
          project: result.project?.name,
          highlights: result.hits?.map((hit: any) => hit.highlights).flat() || []
        };
      })
    };
  }

  /**
   * Get a specific wiki page with content
   * @param project The project name
   * @param wikiId The wiki identifier (ID or name)
   * @param pagePath The path to the page (e.g., "/Setup/Authentication")
   *                 Accepts both wiki paths (with spaces) and git paths (with dashes and .md)
   * @param includeContent Include page content (default: true)
   * @returns Wiki page with content and metadata
   */
  async getWikiPage(project: string, wikiId: string, pagePath: string, includeContent: boolean = true): Promise<any> {
    this.validateProject(project);

    // Auto-convert git paths to wiki paths for better compatibility
    // If the path ends with .md, it's likely a git path from search results
    let wikiPath = pagePath;
    if (pagePath.endsWith('.md')) {
      wikiPath = this.convertGitPathToWikiPath(pagePath);
      console.log(`Auto-converted git path to wiki path: ${pagePath} -> ${wikiPath}`);
    }

    const response = await this.makeRequest<any>(
      `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&includeContent=${includeContent}&api-version=${this.apiVersion}`
    );

    // The API returns the page data directly (not wrapped in a 'page' property)
    return {
      id: response.id,
      path: response.path,
      content: response.content,
      gitItemPath: response.gitItemPath,
      subPages: response.subPages || [],
      url: response.url,
      remoteUrl: response.remoteUrl,
      project,
      wikiId
    };
  }

  /**
   * Create a new wiki page
   * @param project The project name
   * @param wikiId The wiki identifier
   * @param pagePath The path for the new page
   * @param content The markdown content
   * @returns Created page information
   */
  async createWikiPage(project: string, wikiId: string, pagePath: string, content: string): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    const response = await this.makeRequest<any>(
      `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(pagePath)}&api-version=${this.apiVersion}`,
      'PUT',
      { content }
    );

    return {
      id: response.page?.id,
      path: response.page?.path,
      gitItemPath: response.page?.gitItemPath,
      project,
      wikiId
    };
  }

  /**
   * Update an existing wiki page
   * @param project The project name
   * @param wikiId The wiki identifier
   * @param pagePath The path to the page
   * @param content The updated markdown content
   * @param version The ETag/version for optimistic concurrency
   * @returns Updated page information
   */
  async updateWikiPage(project: string, wikiId: string, pagePath: string, content: string, version?: string): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    const response = await this.makeRequest<any>(
      `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(pagePath)}&api-version=${this.apiVersion}`,
      'PUT',
      { content }
    );

    return {
      id: response.page?.id,
      path: response.page?.path,
      gitItemPath: response.page?.gitItemPath,
      project,
      wikiId
    };
  }

  // ==================== WORK ITEM OPERATIONS ====================

  /**
   * Get a work item by ID with full details
   * @param project The project name
   * @param workItemId The work item ID
   * @returns Complete work item details
   */
  async getWorkItem(project: string, workItemId: number): Promise<any> {
    this.validateProject(project);

    const response = await this.makeRequest<any>(
      `${project}/_apis/wit/workitems/${workItemId}?$expand=all&api-version=${this.apiVersion}`
    );

    return {
      id: response.id,
      rev: response.rev,
      url: response.url,
      fields: response.fields,
      relations: response.relations || [],
      _links: response._links,
      commentVersionRef: response.commentVersionRef,
      project
    };
  }

  /**
   * Query work items using WIQL (Work Item Query Language)
   * @param project The project name
   * @param wiql The WIQL query string
   * @param maxResults Maximum number of results (default: 200)
   * @returns Work items matching the query
   */
  async queryWorkItems(project: string, wiql: string, maxResults: number = 200): Promise<any> {
    this.validateProject(project);

    // Execute WIQL query
    const queryResult = await this.makeRequest<any>(
      `${project}/_apis/wit/wiql?api-version=${this.apiVersion}`,
      'POST',
      { query: wiql }
    );

    if (!queryResult.workItems || queryResult.workItems.length === 0) {
      return {
        query: wiql,
        project,
        totalCount: 0,
        workItems: []
      };
    }

    // Get work item IDs (limit to maxResults)
    const workItemIds = queryResult.workItems
      .slice(0, maxResults)
      .map((wi: any) => wi.id);

    // Batch get full work item details
    const workItems = await this.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/wit/workitemsbatch?api-version=${this.apiVersion}`,
      'POST',
      {
        ids: workItemIds,
        $expand: 'all'
      }
    );

    return {
      query: wiql,
      project,
      totalCount: workItems.value.length,
      workItems: workItems.value
    };
  }

  /**
   * Get comments/discussion for a work item
   * @param project The project name
   * @param workItemId The work item ID
   * @returns List of comments
   */
  async getWorkItemComments(project: string, workItemId: number): Promise<any> {
    this.validateProject(project);

    const response = await this.makeRequest<AdoApiCollectionResponse<any>>(
      `${project}/_apis/wit/workItems/${workItemId}/comments?api-version=${this.apiVersion}`
    );

    return {
      workItemId,
      project,
      totalCount: response.totalCount || response.value.length,
      comments: response.value.map((comment: any) => ({
        id: comment.id,
        text: comment.text,
        createdBy: comment.createdBy?.displayName,
        createdDate: comment.createdDate,
        modifiedBy: comment.modifiedBy?.displayName,
        modifiedDate: comment.modifiedDate,
        url: comment.url
      }))
    };
  }

  /**
   * Add a comment to a work item
   * @param project The project name
   * @param workItemId The work item ID
   * @param commentText The comment text (supports markdown)
   * @returns Created comment information
   */
  async addWorkItemComment(project: string, workItemId: number, commentText: string): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    const response = await this.makeRequest<any>(
      `${project}/_apis/wit/workItems/${workItemId}/comments?api-version=${this.apiVersion}`,
      'POST',
      { text: commentText }
    );

    return {
      id: response.id,
      workItemId,
      project,
      text: response.text,
      createdBy: response.createdBy?.displayName,
      createdDate: response.createdDate
    };
  }

  /**
   * Update a work item using JSON Patch operations
   * @param project The project name
   * @param workItemId The work item ID
   * @param patchOperations Array of JSON Patch operations
   * @returns Updated work item
   */
  async updateWorkItem(project: string, workItemId: number, patchOperations: any[]): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    const response = await this.makeRequest<any>(
      `${project}/_apis/wit/workitems/${workItemId}?api-version=${this.apiVersion}`,
      'PATCH',
      patchOperations
    );

    return {
      id: response.id,
      rev: response.rev,
      fields: response.fields,
      project
    };
  }

  /**
   * Create a new work item
   * @param project The project name
   * @param workItemType The work item type (e.g., "Bug", "Task", "User Story")
   * @param fields Object with field values (e.g., { "System.Title": "Bug title" })
   * @returns Created work item
   */
  async createWorkItem(project: string, workItemType: string, fields: any): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    // Convert fields object to JSON Patch operations
    const patchOperations = Object.keys(fields).map(field => ({
      op: 'add',
      path: `/fields/${field}`,
      value: fields[field]
    }));

    const response = await this.makeRequest<any>(
      `${project}/_apis/wit/workitems/$${workItemType}?api-version=${this.apiVersion}`,
      'PATCH',
      patchOperations
    );

    return {
      id: response.id,
      rev: response.rev,
      fields: response.fields,
      url: response._links?.html?.href,
      project
    };
  }

  /**
   * Delete a work item
   * @param project The project name
   * @param workItemId The work item ID
   * @returns Deletion confirmation
   */
  async deleteWorkItem(project: string, workItemId: number): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWorkItemDelete) {
      throw new Error('Work item delete operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true to enable.');
    }

    await this.makeRequest<any>(
      `${project}/_apis/wit/workitems/${workItemId}?api-version=${this.apiVersion}`,
      'DELETE'
    );

    return {
      workItemId,
      project,
      deleted: true
    };
  }
}
