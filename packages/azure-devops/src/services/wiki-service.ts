/**
 * Wiki Service - Azure DevOps wiki operations
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveSafePath, assertNoTraversal, safeBasename } from '@mcp-consultant-tools/core';
import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { AdoApiCollectionResponse } from '../models/index.js';

export class WikiService {
  constructor(private readonly client: AzureDevOpsClient) {}

  // ==================== PRIVATE HELPERS ====================

  /**
   * Convert a git-backed wiki path to a display wiki path.
   * Git paths use hyphens for spaces and %2D for literal dashes.
   * ONLY use this for paths returned by the wiki search API (git paths).
   */
  private convertGitPathToWikiPath(gitPath: string): string {
    return gitPath
      .replace(/\.md$/, '')      // Remove .md extension
      .replace(/-/g, ' ')         // Replace ALL dashes with spaces
      .replace(/%2D/gi, '-');     // Decode %2D back to - (actual dashes in page names)
  }

  /**
   * Light normalization for user-provided wiki paths.
   * Only strips .md extension - does NOT convert dashes to spaces.
   */
  private normalizePagePath(pagePath: string): string {
    return pagePath.replace(/\.md$/, '');
  }

  private countOccurrences(content: string, searchStr: string): number {
    const regex = new RegExp(this.escapeRegExp(searchStr), 'g');
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  }

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

  private generateUnifiedDiff(
    oldContent: string,
    newContent: string,
    oldStr: string,
    _newStr: string
  ): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const changedLineNumbers: number[] = [];
    oldLines.forEach((line, index) => {
      if (line.includes(oldStr)) {
        changedLineNumbers.push(index);
      }
    });

    const diffLines: string[] = [];
    changedLineNumbers.forEach(lineNum => {
      diffLines.push(`@@ Line ${lineNum + 1} @@`);
      diffLines.push(`- ${oldLines[lineNum]}`);
      diffLines.push(`+ ${newLines[lineNum]}`);
      diffLines.push('');
    });

    return diffLines.join('\n');
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  // ==================== PUBLIC METHODS ====================

  async getWikis(project: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<AdoApiCollectionResponse<any>>(
      `${project}/_apis/wiki/wikis?api-version=${this.client.apiVersion}`
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

  async searchWikiPages(searchText: string, project?: string, maxResults: number = 25): Promise<any> {
    if (project) {
      this.client.validateProject(project);
    }

    const searchBody: any = {
      searchText,
      $top: maxResults,
      $skip: 0
    };

    if (project) {
      searchBody.filters = {
        Project: [project]
      };
    }

    const response = await this.client.post<any>(
      `_apis/search/wikisearchresults?api-version=${this.client.apiVersion}`,
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
          gitPath: gitPath,
          path: wikiPath,
          wikiName: result.wiki?.name,
          wikiId: result.wiki?.id,
          project: result.project?.name,
          highlights: result.hits?.map((hit: any) => hit.highlights).flat() || []
        };
      })
    };
  }

  async getWikiPage(project: string, wikiId: string, pagePath: string, includeContent: boolean = true, recursionLevel?: 'none' | 'oneLevel' | 'full'): Promise<any> {
    this.client.validateProject(project);

    const wikiPath = this.normalizePagePath(pagePath);

    if (wikiPath !== pagePath) {
      console.error(`Normalized wiki path: ${pagePath} -> ${wikiPath}`);
    }

    // The ADO Pages API only populates subPages when recursionLevel is requested
    const recursionParam = recursionLevel && recursionLevel !== 'none' ? `&recursionLevel=${recursionLevel}` : '';
    const url = `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&includeContent=${includeContent}${recursionParam}&api-version=${this.client.apiVersion}`;

    try {
      const axiosResponse = await this.client.requestRaw(url);

      const response = axiosResponse.data;
      const etag = axiosResponse.headers['etag'] || axiosResponse.headers['ETag'];

      return {
        id: response.id,
        path: response.path,
        content: response.content,
        gitItemPath: response.gitItemPath,
        ...(recursionParam
          ? { subPages: response.subPages || [] }
          : { subPagesNote: "subPages not requested - pass recursionLevel ('oneLevel' or 'full') to populate, or use get-wiki-tree for the full hierarchy" }),
        url: response.url,
        remoteUrl: response.remoteUrl,
        version: etag,
        project,
        wikiId
      };
    } catch (error: any) {
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

  async getWikiPageById(project: string, wikiId: string, pageId: number, includeContent: boolean = true, recursionLevel?: 'none' | 'oneLevel' | 'full'): Promise<any> {
    this.client.validateProject(project);

    const recursionParam = recursionLevel && recursionLevel !== 'none' ? `&recursionLevel=${recursionLevel}` : '';
    const url = `${project}/_apis/wiki/wikis/${wikiId}/pages/${pageId}?includeContent=${includeContent}${recursionParam}&api-version=${this.client.apiVersion}`;

    try {
      const axiosResponse = await this.client.requestRaw(url);

      const response = axiosResponse.data;
      const etag = axiosResponse.headers['etag'] || axiosResponse.headers['ETag'];

      return {
        id: response.id,
        path: response.path,
        content: response.content,
        gitItemPath: response.gitItemPath,
        ...(recursionParam
          ? { subPages: response.subPages || [] }
          : { subPagesNote: "subPages not requested - pass recursionLevel ('oneLevel' or 'full') to populate, or use get-wiki-tree for the full hierarchy" }),
        url: response.url,
        remoteUrl: response.remoteUrl,
        version: etag,
        project,
        wikiId
      };
    } catch (error: any) {
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
        throw new Error(`Wiki page not found by ID: ${pageId}`);
      }

      throw new Error(`Azure DevOps API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }

  /**
   * Get the page hierarchy under a path (paths + ids, no content) -
   * tree enumeration without pulling every page body.
   */
  async getWikiPageTree(project: string, wikiId: string, pagePath: string = '/', depth: 'oneLevel' | 'full' = 'full'): Promise<any> {
    this.client.validateProject(project);

    const wikiPath = this.normalizePagePath(pagePath);
    const url = `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&includeContent=false&recursionLevel=${depth}&api-version=${this.client.apiVersion}`;

    try {
      const axiosResponse = await this.client.requestRaw(url);
      const response = axiosResponse.data;

      let pageCount = 0;
      const toTreeNode = (page: any): any => {
        pageCount++;
        return {
          id: page.id,
          path: page.path,
          gitItemPath: page.gitItemPath,
          url: page.remoteUrl || page.url,
          subPages: (page.subPages || []).map(toTreeNode),
        };
      };

      return {
        tree: toTreeNode(response),
        pageCount,
        project,
        wikiId,
      };
    } catch (error: any) {
      const errorDetails = error.response?.data?.message || error.response?.data || error.message;
      console.error('Azure DevOps API request failed:', {
        url,
        status: error.response?.status,
        error: errorDetails
      });

      if (error.response?.status === 404) {
        throw new Error(`Wiki page not found: ${wikiPath} (original input: ${pagePath})`);
      }

      throw new Error(`Azure DevOps API request failed: ${error.message} - ${JSON.stringify(errorDetails)}`);
    }
  }

  async createWikiPage(project: string, wikiId: string, pagePath: string, content: string): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    const wikiPath = this.normalizePagePath(pagePath);

    if (wikiPath !== pagePath) {
      console.error(`Normalized wiki path for creation: ${pagePath} -> ${wikiPath}`);
    }

    const response = await this.client.put<any>(
      `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&api-version=${this.client.apiVersion}`,
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

  async updateWikiPage(project: string, wikiId: string, pagePath: string, content: string, version?: string): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    const wikiPath = this.normalizePagePath(pagePath);

    if (wikiPath !== pagePath) {
      console.error(`Normalized wiki path for update: ${pagePath} -> ${wikiPath}`);
    }

    // Auto-fetch version if not provided
    if (!version) {
      try {
        const currentPage = await this.getWikiPage(project, wikiId, wikiPath, false);
        version = currentPage.version;
        if (version) {
          console.error(`Auto-fetched version for wiki update: ${version}`);
        } else {
          console.error(`Warning: getWikiPage returned no version/etag for existing page. Response: ${JSON.stringify(currentPage)}`);
        }
      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        if (!errorMsg.includes('not found') && !errorMsg.includes('404') && !errorMsg.includes('does not exist')) {
          throw error;
        }
        console.error(`Page not found, will create new page: ${wikiPath}`);
      }
    }

    const customHeaders = version ? { 'If-Match': version } : undefined;

    const response = await this.client.request<any>(
      `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(wikiPath)}&api-version=${this.client.apiVersion}`,
      'PUT',
      { content },
      false,
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

  async strReplaceWikiPage(
    project: string,
    wikiId: string,
    pagePath: string,
    oldStr: string,
    newStr: string,
    replaceAll: boolean = false,
    _description?: string
  ): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    const currentPage = await this.getWikiPage(project, wikiId, pagePath, true);
    const currentContent = currentPage.content;
    const currentVersion = currentPage.version;

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

    const regex = new RegExp(this.escapeRegExp(oldStr), replaceAll ? 'g' : '');
    const newContent = currentContent.replace(regex, newStr);

    if (newContent === currentContent) {
      throw new Error('Replacement failed - content unchanged');
    }

    let updateResult;
    try {
      updateResult = await this.updateWikiPage(project, wikiId, pagePath, newContent, currentVersion);
    } catch (error: any) {
      if (error.message.includes('412') || error.message.includes('version') || error.message.includes('conflict')) {
        console.error('Version conflict detected, retrying with fresh version...');

        const freshPage = await this.getWikiPage(project, wikiId, pagePath, true);
        const freshContent = freshPage.content;
        const freshVersion = freshPage.version;

        const freshRegex = new RegExp(this.escapeRegExp(oldStr), replaceAll ? 'g' : '');
        const freshNewContent = freshContent.replace(freshRegex, newStr);

        updateResult = await this.updateWikiPage(project, wikiId, pagePath, freshNewContent, freshVersion);
      } else {
        throw error;
      }
    }

    const diff = this.generateUnifiedDiff(currentContent, newContent, oldStr, newStr);

    return {
      success: true,
      diff,
      occurrences: replaceAll ? occurrences : 1,
      version: currentVersion,
      message: `Successfully replaced ${replaceAll ? occurrences : 1} occurrence(s)`,
      ...updateResult
    };
  }

  async deleteWikiPage(project: string, wikiId: string, pagePath: string): Promise<any> {
    this.client.validateProject(project);

    if (!this.client.config.enableWikiDelete) {
      throw new Error('Wiki delete operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_DELETE=true to enable.');
    }

    await this.client.del<any>(
      `${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(pagePath)}&api-version=${this.client.apiVersion}`
    );

    return {
      project,
      wikiId,
      pagePath: pagePath,
      deleted: true
    };
  }

  // ==================== WIKI FILE SYNC OPERATIONS ====================

  async saveWikiPageToFile(
    project: string,
    wikiId: string,
    pagePath: string,
    outputPath?: string
  ): Promise<{ filePath: string; pagePath: string; project: string; wikiId: string }> {
    this.client.validateProject(project);

    const page = await this.getWikiPage(project, wikiId, pagePath, true);

    // Confine a caller-supplied destination to the permitted root; the
    // server-chosen default (relative docs/wiki-pages/...) is already safe.
    const resolvedPath = outputPath
      ? resolveSafePath(outputPath)
      : path.join('docs', 'wiki-pages', pagePath.replace(/^\//, '').replace(/\//g, '-') + '.md');

    const dir = path.dirname(resolvedPath);
    fs.mkdirSync(dir, { recursive: true });

    const frontmatter = [
      '---',
      `project: ${project}`,
      `wikiId: ${wikiId}`,
      `pagePath: "${page.path || pagePath}"`,
      `version: "${(page.version || '').replace(/^"|"$/g, '')}"`,
      `lastDownloaded: "${new Date().toISOString()}"`,
      '---',
      '',
    ].join('\n');

    const fileContent = frontmatter + (page.content || '');
    fs.writeFileSync(resolvedPath, fileContent, 'utf-8');

    return {
      filePath: resolvedPath,
      pagePath: page.path || pagePath,
      project,
      wikiId,
    };
  }

  async uploadWikiPageFromFile(
    filePath: string
  ): Promise<{ filePath: string; pagePath: string; project: string; wikiId: string; id?: number }> {
    if (!this.client.config.enableWikiWrite) {
      throw new Error('Wiki write operations are disabled. Set AZUREDEVOPS_ENABLE_WIKI_WRITE=true to enable.');
    }

    assertNoTraversal(filePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');

    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatterMatch) {
      throw new Error(`File is missing YAML frontmatter (---). Expected frontmatter with project, wikiId, pagePath. File: ${filePath}`);
    }

    const frontmatterBlock = frontmatterMatch[1];
    const body = raw.slice(frontmatterMatch[0].length);

    const meta: Record<string, string> = {};
    for (const line of frontmatterBlock.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        meta[key] = value;
      }
    }

    const project = meta['project'];
    const wikiId = meta['wikiId'];
    const pagePath = meta['pagePath'];
    const version = meta['version'] || undefined;

    if (!project || !wikiId || !pagePath) {
      throw new Error(`Frontmatter missing required fields (project, wikiId, pagePath). Found: ${JSON.stringify(meta)}`);
    }

    this.client.validateProject(project);

    const result = await this.updateWikiPage(project, wikiId, pagePath, body, version);

    return {
      filePath,
      pagePath,
      project,
      wikiId,
      id: result.id,
    };
  }

  // ==================== WIKI ATTACHMENT OPERATIONS ====================

  async getWikiRepositoryId(project: string, wikiId: string): Promise<string> {
    const wikisResult = await this.getWikis(project);
    const wiki = wikisResult.wikis.find(
      (w: any) => w.id === wikiId || w.name === wikiId
    );
    if (!wiki) {
      throw new Error(`Wiki '${wikiId}' not found in project '${project}'. Available wikis: ${wikisResult.wikis.map((w: any) => w.name).join(', ')}`);
    }
    return wiki.repositoryId;
  }

  async downloadWikiAttachment(
    project: string,
    wikiId: string,
    attachmentPath: string,
    outputDir?: string
  ): Promise<{ filePath: string; fileName: string; size: number; attachmentPath: string }> {
    this.client.validateProject(project);

    const repoId = await this.getWikiRepositoryId(project, wikiId);

    let normalizedPath = attachmentPath.startsWith('/') ? attachmentPath : `/${attachmentPath}`;
    normalizedPath = decodeURIComponent(normalizedPath);

    const response = await this.client.requestRaw(
      `${project}/_apis/git/repositories/${repoId}/items?path=${encodeURIComponent(normalizedPath)}&download=true&api-version=${this.client.apiVersion}`,
      'GET',
      undefined,
      undefined,
      'arraybuffer'
    );

    // Confine a caller-supplied output dir; default to a server-chosen tmp dir.
    const targetDir = outputDir
      ? resolveSafePath(outputDir)
      : path.join(os.tmpdir(), 'ado-wiki-attachments');
    fs.mkdirSync(targetDir, { recursive: true });

    const fileName = safeBasename(normalizedPath);
    const filePath = path.join(targetDir, fileName);

    fs.writeFileSync(filePath, Buffer.from(response.data));

    return {
      filePath,
      fileName,
      size: response.data.byteLength,
      attachmentPath: normalizedPath,
    };
  }

  async downloadWikiPageAttachments(
    project: string,
    wikiId: string,
    pagePath: string,
    outputDir?: string
  ): Promise<{
    pagePath: string;
    totalFound: number;
    downloaded: number;
    files: Array<{ filePath: string; fileName: string; size: number; attachmentRef: string }>;
    errors: Array<{ attachmentRef: string; error: string }>;
  }> {
    this.client.validateProject(project);

    const page = await this.getWikiPage(project, wikiId, pagePath, true);
    const content: string = page.content || '';

    const attachmentRegex = /!\[[^\]]*\]\((\/\.attachments\/[^)]+)\)/g;
    const attachmentRefs: string[] = [];
    let match;
    while ((match = attachmentRegex.exec(content)) !== null) {
      attachmentRefs.push(match[1]);
    }

    if (attachmentRefs.length === 0) {
      return { pagePath, totalFound: 0, downloaded: 0, files: [], errors: [] };
    }

    const files: Array<{ filePath: string; fileName: string; size: number; attachmentRef: string }> = [];
    const errors: Array<{ attachmentRef: string; error: string }> = [];

    for (const ref of attachmentRefs) {
      try {
        const result = await this.downloadWikiAttachment(project, wikiId, ref, outputDir);
        files.push({
          filePath: result.filePath,
          fileName: result.fileName,
          size: result.size,
          attachmentRef: ref,
        });
      } catch (err: any) {
        errors.push({ attachmentRef: ref, error: err.message });
      }
    }

    return {
      pagePath,
      totalFound: attachmentRefs.length,
      downloaded: files.length,
      files,
      errors,
    };
  }
}
