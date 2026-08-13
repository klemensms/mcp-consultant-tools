/**
 * Wiki CLI Commands - 11 commands mapping to wiki MCP tools
 */

import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

export function registerWikiCommands(program: Command, ctx: ServiceContext): void {
  const wiki = program.command('wiki').description('Wiki operations');

  wiki
    .command('list')
    .description('List all wikis in a project')
    .argument('<project>', 'Project name')
    .action(async (project: string) => {
      try {
        const result = await ctx.wiki.getWikis(project);
        outputResult(
          { fileName: `wikis-${project}`, data: result, summary: `Found ${Array.isArray(result) ? result.length : 0} wiki(s) in '${project}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list wikis'); }
    });

  wiki
    .command('search')
    .description('Search wiki pages across projects')
    .argument('<searchText>', 'Text to search for')
    .option('-p, --project <project>', 'Filter by project')
    .option('-m, --max-results <n>', 'Maximum results', '25')
    .action(async (searchText: string, opts: any) => {
      try {
        const result = await ctx.wiki.searchWikiPages(searchText, opts.project, parseInt(opts.maxResults));
        outputResult(
          { fileName: `wiki-search-${searchText.replace(/\s+/g, '-')}`, data: result, summary: `Found wiki pages matching '${searchText}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'search wiki pages'); }
    });

  wiki
    .command('get')
    .description('Get a specific wiki page with content (by path or page ID)')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier (ID or name)')
    .argument('[pagePath]', 'Page path (e.g., /Setup/Authentication)')
    .option('--page-id <id>', 'Page ID from wiki URL (alternative to pagePath)')
    .option('--no-content', 'Exclude page content')
    .option('--recursion-level <level>', "Populate subPages: 'oneLevel' or 'full' (default: none — subPages omitted)")
    .action(async (project: string, wikiId: string, pagePath: string | undefined, opts: any) => {
      try {
        if (!pagePath && !opts.pageId) {
          throw new Error('Either pagePath argument or --page-id option is required');
        }
        const result = opts.pageId
          ? await ctx.wiki.getWikiPageById(project, wikiId, parseInt(opts.pageId), opts.content ?? true, opts.recursionLevel)
          : await ctx.wiki.getWikiPage(project, wikiId, pagePath!, opts.content ?? true, opts.recursionLevel);
        const label = pagePath || `#${opts.pageId}`;
        outputResult(
          { fileName: `wiki-page-${label.replace(/\//g, '-')}`, data: result, summary: `Wiki page '${label}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get wiki page'); }
    });

  wiki
    .command('tree')
    .description('Get the wiki page hierarchy (paths + ids, no content)')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier (ID or name)')
    .argument('[pagePath]', "Root path to enumerate from (default: '/')")
    .option('--depth <depth>', "How deep to enumerate: 'oneLevel' or 'full'", 'full')
    .action(async (project: string, wikiId: string, pagePath: string | undefined, opts: any) => {
      try {
        const result = await ctx.wiki.getWikiPageTree(project, wikiId, pagePath ?? '/', opts.depth);
        outputResult(
          { fileName: `wiki-tree-${wikiId}`, data: result, summary: `Wiki tree for '${pagePath ?? '/'}' (${result.pageCount} page(s))` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'get wiki tree'); }
    });

  wiki
    .command('create')
    .description('Create a new wiki page (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier')
    .argument('<pagePath>', 'Path for the new page')
    .argument('<content>', 'Markdown content')
    .action(async (project: string, wikiId: string, pagePath: string, content: string) => {
      try {
        const result = await ctx.wiki.createWikiPage(project, wikiId, pagePath, content);
        outputResult(
          { persist: false, fileName: `wiki-created-${pagePath.replace(/\//g, '-')}`, data: result, summary: `Created wiki page '${pagePath}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'create wiki page'); }
    });

  wiki
    .command('update')
    .description('Update an existing wiki page (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier')
    .argument('<pagePath>', 'Page path')
    .argument('<content>', 'Updated markdown content')
    .option('-v, --version <etag>', 'ETag/version for optimistic concurrency')
    .action(async (project: string, wikiId: string, pagePath: string, content: string, opts: any) => {
      try {
        const result = await ctx.wiki.updateWikiPage(project, wikiId, pagePath, content, opts.version);
        outputResult(
          { persist: false, fileName: `wiki-updated-${pagePath.replace(/\//g, '-')}`, data: result, summary: `Updated wiki page '${pagePath}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'update wiki page'); }
    });

  wiki
    .command('str-replace')
    .description('Replace text in a wiki page (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier')
    .argument('<pagePath>', 'Page path')
    .requiredOption('--old <text>', 'Text to replace')
    .requiredOption('--new <text>', 'Replacement text')
    .option('--replace-all', 'Replace all occurrences', false)
    .option('-d, --description <text>', 'Change description')
    .action(async (project: string, wikiId: string, pagePath: string, opts: any) => {
      try {
        const result = await ctx.wiki.strReplaceWikiPage(project, wikiId, pagePath, opts.old, opts.new, opts.replaceAll, opts.description);
        outputResult(
          { persist: false, fileName: `wiki-replace-${pagePath.replace(/\//g, '-')}`, data: result, summary: `Replaced text in '${pagePath}' (${result.occurrences} occurrence(s))` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'replace wiki text'); }
    });

  wiki
    .command('delete')
    .description('Delete a wiki page (requires AZUREDEVOPS_ENABLE_WIKI_DELETE=true)')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier')
    .argument('<pagePath>', 'Page path')
    .action(async (project: string, wikiId: string, pagePath: string) => {
      try {
        const result = await ctx.wiki.deleteWikiPage(project, wikiId, pagePath);
        outputResult(
          { persist: false, fileName: `wiki-deleted-${pagePath.replace(/\//g, '-')}`, data: result, summary: `Deleted wiki page '${pagePath}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'delete wiki page'); }
    });

  wiki
    .command('download-attachment')
    .description('Download a single wiki attachment/image')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier')
    .argument('<attachmentPath>', 'Attachment path from wiki markdown')
    .option('-o, --output-dir <dir>', 'Output directory (default: OS temp dir)')
    .action(async (project: string, wikiId: string, attachmentPath: string, opts: any) => {
      try {
        const result = await ctx.wiki.downloadWikiAttachment(project, wikiId, attachmentPath, opts.outputDir);
        outputResult(
          { fileName: `wiki-attachment`, data: result, summary: `Downloaded attachment to '${result.filePath}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'download wiki attachment'); }
    });

  wiki
    .command('download-page-attachments')
    .description('Download all attachments from a wiki page')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier')
    .argument('<pagePath>', 'Wiki page path')
    .option('-o, --output-dir <dir>', 'Output directory (default: OS temp dir)')
    .action(async (project: string, wikiId: string, pagePath: string, opts: any) => {
      try {
        const result = await ctx.wiki.downloadWikiPageAttachments(project, wikiId, pagePath, opts.outputDir);
        outputResult(
          { fileName: `wiki-attachments-${pagePath.replace(/\//g, '-')}`, data: result, summary: `Downloaded ${result.downloaded}/${result.totalFound} attachments from '${pagePath}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'download wiki page attachments'); }
    });

  wiki
    .command('save-to-file')
    .description('Download a wiki page to a local markdown file (by path or page ID)')
    .argument('<project>', 'Project name')
    .argument('<wikiId>', 'Wiki identifier (ID or name)')
    .argument('[pagePath]', 'Wiki page path (e.g., /Setup/Authentication)')
    .option('--page-id <id>', 'Page ID from wiki URL (alternative to pagePath)')
    .option('-o, --output <path>', 'Output file path (default: docs/wiki-pages/{path}.md)')
    .action(async (project: string, wikiId: string, pagePath: string | undefined, opts: any) => {
      try {
        if (!pagePath && !opts.pageId) {
          throw new Error('Either pagePath argument or --page-id option is required');
        }

        let result;
        if (opts.pageId) {
          const page = await ctx.wiki.getWikiPageById(project, wikiId, parseInt(opts.pageId), true);
          result = await ctx.wiki.saveWikiPageToFile(project, wikiId, page.path, opts.output);
        } else {
          result = await ctx.wiki.saveWikiPageToFile(project, wikiId, pagePath!, opts.output);
        }
        const label = pagePath || `#${opts.pageId}`;
        outputResult(
          { fileName: `wiki-saved-${label.replace(/\//g, '-')}`, data: result, summary: `Saved wiki page '${label}' to '${result.filePath}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'save wiki page to file'); }
    });

  wiki
    .command('upload-from-file')
    .description('Upload a local markdown file to ADO wiki (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)')
    .argument('<filePath>', 'Path to local markdown file with frontmatter')
    .action(async (filePath: string) => {
      try {
        const result = await ctx.wiki.uploadWikiPageFromFile(filePath);
        outputResult(
          { persist: false, fileName: `wiki-uploaded-${result.pagePath.replace(/\//g, '-')}`, data: result, summary: `Uploaded '${filePath}' to wiki page '${result.pagePath}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'upload wiki page from file'); }
    });
}
