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
    useSearchUrl: boolean = false,
    customHeaders?: Record<string, string>
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
          'Accept': 'application/json',
          ...customHeaders  // Merge custom headers (can override defaults)
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
   * Count occurrences of a string in content
   * @param content The content to search in
   * @param searchStr The string to search for
   * @returns Number of occurrences
   */
  private countOccurrences(content: string, searchStr: string): number {
    const regex = new RegExp(this.escapeRegExp(searchStr), 'g');
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Get locations where a string appears in content
   * @param content The content to search in
   * @param searchStr The string to search for
   * @returns Formatted string showing line numbers and context
   */
  private getMatchLocations(content: string, searchStr: string): string {
    const lines = content.split('\n');
    const matches: string[] = [];

    lines.forEach((line, index) => {
      if (line.includes(searchStr)) {
        matches.push(`Line ${index + 1}: ${this.truncate(line.trim(), 100)}`);
      }
    });

    const maxDisplay = 10;
    const result = matches.slice(0, maxDisplay).join('\n');
    if (matches.length > maxDisplay) {
      return result + `\n... and ${matches.length - maxDisplay} more`;
    }
    return result;
  }

  /**
   * Generate a unified diff showing changes
   * @param oldContent Original content
   * @param newContent Updated content
   * @param oldStr The string that was replaced
   * @param newStr The replacement string
   * @returns Formatted diff output
   */
  private generateUnifiedDiff(
    oldContent: string,
    newContent: string,
    oldStr: string,
    newStr: string
  ): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    // Find changed lines
    const changedLineNumbers: number[] = [];
    oldLines.forEach((line, index) => {
      if (line.includes(oldStr)) {
        changedLineNumbers.push(index);
      }
    });

    // Build diff output
    const diffLines: string[] = [];
    changedLineNumbers.forEach(lineNum => {
      diffLines.push(`@@ Line ${lineNum + 1} @@`);
      diffLines.push(`- ${oldLines[lineNum]}`);
      diffLines.push(`+ ${newLines[lineNum]}`);
      diffLines.push('');
    });

    return diffLines.join('\n');
  }

  /**
   * Escape special regex characters
   * @param str String to escape
   * @returns Escaped string safe for use in regex
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Truncate a string for display
   * @param str String to truncate
   * @param maxLen Maximum length
   * @returns Truncated string with ellipsis if needed
   */
  private truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
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

    // Always normalize paths to wiki format (removes .md, converts dashes to spaces)
    // This ensures consistent behavior regardless of input format
    const wikiPath = this.convertGitPathToWikiPath(pagePath);

    // Log conversion if the path was changed (for debugging)
    if (wikiPath !== pagePath) {
      console.error(`Normalized wiki path: ${pagePath} -> ${wikiPath}`);
    }

    // Use axios directly to access response headers (for ETag)
    const url = `${this.baseUrl}/${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&includeContent=${includeContent}&api-version=${this.apiVersion}`;

    try {
      const axiosResponse = await axios({
        method: 'GET',
        url,
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const response = axiosResponse.data;

      // Extract ETag from response headers (needed for updates)
      const etag = axiosResponse.headers['etag'] || axiosResponse.headers['ETag'];

      // The API returns the page data directly (not wrapped in a 'page' property)
      return {
        id: response.id,
        path: response.path,
        content: response.content,
        gitItemPath: response.gitItemPath,
        subPages: response.subPages || [],
        url: response.url,
        remoteUrl: response.remoteUrl,
        version: etag,  // Include ETag for use with updateWikiPage
        project,
        wikiId
      };
    } catch (error: any) {
      // Handle errors similar to makeRequest
      const errorDetails = error.response?.data?.message || error.response?.data || error.message;
      console.error('Azure DevOps API request failed:', {
        url,
        status: error.response?.status,
        error: errorDetails
      });

      if (error.response?.status === 401) {
        throw new Error('Azure DevOps authentication failed. Please check your PAT token and permissions.');
      }
      if (error.response?.status === 403) {
        throw new Error('Azure DevOps access denied. Please check your PAT scopes and project permissions.');
      }
      if (error.response?.status === 404) {
        throw new Error(`Wiki page not found: ${wikiPath} (original input: ${pagePath})`);
      }

      throw new Error(`Azure DevOps API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }

  /**
   * Create a new wiki page
   * @param project The project name
   * @param wikiId The wiki identifier
   * @param pagePath The path for the new page (will be normalized to wiki format)
   * @param content The markdown content
   * @returns Created page information
   */
  async createWikiPage(project: string, wikiId: string, pagePath: string, content: string): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    // Always normalize paths to wiki format (removes .md, converts dashes to spaces)
    const wikiPath = this.convertGitPathToWikiPath(pagePath);

    // Log conversion if the path was changed (for debugging)
    if (wikiPath !== pagePath) {
      console.error(`Normalized wiki path for creation: ${pagePath} -> ${wikiPath}`);
    }

    const response = await this.makeRequest<any>(
      `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&api-version=${this.apiVersion}`,
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
   * @param pagePath The path to the page (will be normalized to wiki format)
   * @param content The updated markdown content
   * @param version The ETag/version for optimistic concurrency (recommended to prevent conflicts)
   * @returns Updated page information
   */
  async updateWikiPage(project: string, wikiId: string, pagePath: string, content: string, version?: string): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    // Always normalize paths to wiki format (removes .md, converts dashes to spaces)
    const wikiPath = this.convertGitPathToWikiPath(pagePath);

    // Log conversion if the path was changed (for debugging)
    if (wikiPath !== pagePath) {
      console.error(`Normalized wiki path for update: ${pagePath} -> ${wikiPath}`);
    }

    // Add If-Match header if version is provided (for optimistic concurrency control)
    const customHeaders = version ? { 'If-Match': version } : undefined;

    const response = await this.makeRequest<any>(
      `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&api-version=${this.apiVersion}`,
      'PUT',
      { content },
      false,  // useSearchUrl
      customHeaders
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
   * Replace a specific string in a wiki page without rewriting entire content
   * @param project The project name
   * @param wikiId The wiki identifier
   * @param pagePath The path to the page (will be normalized to wiki format)
   * @param oldStr The exact string to replace
   * @param newStr The replacement string
   * @param replaceAll If true, replace all occurrences; if false, old_str must be unique
   * @param description Optional description of the change for audit logging
   * @returns Result with diff, occurrence count, version, and message
   */
  async strReplaceWikiPage(
    project: string,
    wikiId: string,
    pagePath: string,
    oldStr: string,
    newStr: string,
    replaceAll: boolean = false,
    description?: string
  ): Promise<any> {
    this.validateProject(project);

    // 1. Validate write permission
    if (!this.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    // 2. Fetch current page content and version (auto-fetch latest)
    const currentPage = await this.getWikiPage(project, wikiId, pagePath, true);
    const currentContent = currentPage.content;
    const currentVersion = currentPage.version;

    // 3. Count occurrences of old_str
    const occurrences = this.countOccurrences(currentContent, oldStr);

    if (occurrences === 0) {
      throw new Error(
        `String not found in page.\n\n` +
        `Looking for: "${this.truncate(oldStr, 200)}"\n\n` +
        `Page excerpt:\n${this.truncate(currentContent, 500)}`
      );
    }

    if (occurrences > 1 && !replaceAll) {
      throw new Error(
        `String appears ${occurrences} times in the page. ` +
        `Either provide more context to make old_str unique, or set replace_all=true.\n\n` +
        `Matching locations:\n${this.getMatchLocations(currentContent, oldStr)}`
      );
    }

    // 4. Perform replacement
    const regex = new RegExp(this.escapeRegExp(oldStr), replaceAll ? 'g' : '');
    const newContent = currentContent.replace(regex, newStr);

    // 5. Validate replacement succeeded
    if (newContent === currentContent) {
      throw new Error('Replacement failed - content unchanged');
    }

    // 6. Update wiki page with version conflict retry
    let updateResult;
    try {
      updateResult = await this.updateWikiPage(
        project,
        wikiId,
        pagePath,
        newContent,
        currentVersion
      );
    } catch (error: any) {
      // Version conflict - retry once with fresh version
      if (error.message.includes('412') || error.message.includes('version') || error.message.includes('conflict')) {
        console.error('Version conflict detected, retrying with fresh version...');

        const freshPage = await this.getWikiPage(project, wikiId, pagePath, true);
        const freshContent = freshPage.content;
        const freshVersion = freshPage.version;

        // Re-apply replacement to fresh content
        const freshRegex = new RegExp(this.escapeRegExp(oldStr), replaceAll ? 'g' : '');
        const freshNewContent = freshContent.replace(freshRegex, newStr);

        updateResult = await this.updateWikiPage(
          project,
          wikiId,
          pagePath,
          freshNewContent,
          freshVersion
        );
      } else {
        throw error;
      }
    }

    // 7. Generate diff output
    const diff = this.generateUnifiedDiff(currentContent, newContent, oldStr, newStr);

    // 8. Return result with diff
    return {
      success: true,
      diff,
      occurrences: replaceAll ? occurrences : 1,
      version: currentVersion,
      message: `Successfully replaced ${replaceAll ? occurrences : 1} occurrence(s)`,
      ...updateResult
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
   * @param parentId Optional parent work item ID (for creating child items)
   * @param relations Optional array of work item relationships
   * @returns Created work item
   */
  async createWorkItem(
    project: string,
    workItemType: string,
    fields: any,
    parentId?: number,
    relations?: Array<{
      rel: string;
      url: string;
      attributes?: Record<string, any>;
    }>
  ): Promise<any> {
    this.validateProject(project);

    if (!this.config.enableWorkItemWrite) {
      throw new Error('Work item write operations are disabled. Set AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true to enable.');
    }

    // Build patch operations array
    const patchOperations: any[] = [];

    // Add field operations
    Object.keys(fields).forEach(field => {
      patchOperations.push({
        op: 'add',
        path: `/fields/${field}`,
        value: fields[field]
      });
    });

    // Handle parentId parameter (simplified parent relationship)
    if (parentId !== undefined) {
      const parentUrl = `${this.baseUrl}/${encodeURIComponent(project)}/_apis/wit/workItems/${parentId}`;
      patchOperations.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: parentUrl
        }
      });
    }

    // Handle relations array (advanced relationships)
    if (relations && relations.length > 0) {
      relations.forEach(relation => {
        patchOperations.push({
          op: 'add',
          path: '/relations/-',
          value: relation
        });
      });
    }

    const response = await this.makeRequest<any>(
      `${project}/_apis/wit/workitems/$${workItemType}?api-version=${this.apiVersion}`,
      'PATCH',
      patchOperations
    );

    return {
      id: response.id,
      rev: response.rev,
      fields: response.fields,
      relations: response.relations || [],  // Include relations in response
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
