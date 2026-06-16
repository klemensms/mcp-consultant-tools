/**
 * Wiki Tools - 11 tools for wiki operations
 */
import { z } from 'zod';
import { descWithExamples, ATTACHMENT_PATH_EXAMPLES, WIKI_SAVE_TO_FILE_EXAMPLES, WIKI_UPLOAD_FROM_FILE_EXAMPLES } from '../tool-examples.js';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

export function registerWikiTools(server: any, ctx: ServiceContext): void {
  server.tool(
    "get-wikis",
    "Get all wikis in an Azure DevOps project",
    {
      project: z.string().describe("The project name"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project }: any) => {
      try {
        const result = await ctx.wiki.getWikis(project);
        return { content: [{ type: "text", text: `Wikis in project '${project}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting wikis:", error);
        return { content: [{ type: "text", text: `Failed to get wikis: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "search-wiki-pages",
    "Search wiki pages across Azure DevOps projects",
    {
      searchText: z.string().describe("The text to search for"),
      project: z.string().optional().describe("Optional project filter"),
      maxResults: zCoerceNumber().optional().describe("Maximum number of results (default: 25)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ searchText, project, maxResults }: any) => {
      try {
        const result = await ctx.wiki.searchWikiPages(searchText, project, maxResults);
        return { content: [{ type: "text", text: `Wiki search results for '${searchText}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error searching wiki pages:", error);
        return { content: [{ type: "text", text: `Failed to search wiki pages: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "get-wiki-page",
    "Get a specific wiki page with content from Azure DevOps. Supports lookup by path OR page ID (from wiki URLs like ...wiki/wikis/Wiki.wiki/3789/Page-Name).",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier (ID or name)"),
      pagePath: z.string().optional().describe("The path to the page (e.g., '/Setup/Authentication'). Either pagePath or pageId is required."),
      pageId: zCoerceNumber().optional().describe("The numeric page ID from a wiki URL (e.g., 3789 from ...wiki/wikis/Wiki.wiki/3789/Page-Name). Either pageId or pagePath is required."),
      includeContent: z.boolean().optional().describe("Include page content (default: true)"),
      recursionLevel: z.enum(["none", "oneLevel", "full"]).optional().describe("Populate subPages with child pages: 'oneLevel' for direct children, 'full' for the whole subtree (default: none — subPages omitted). For tree enumeration without content, prefer get-wiki-tree."),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, wikiId, pagePath, pageId, includeContent, recursionLevel }: any) => {
      try {
        if (!pagePath && pageId == null) {
          return { content: [{ type: "text", text: "Either pagePath or pageId must be provided." }], isError: true };
        }
        const result = pageId != null
          ? await ctx.wiki.getWikiPageById(project, wikiId, pageId, includeContent ?? true, recursionLevel)
          : await ctx.wiki.getWikiPage(project, wikiId, pagePath, includeContent ?? true, recursionLevel);
        return { content: [{ type: "text", text: `Wiki page '${pagePath || `#${pageId}`}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting wiki page:", error);
        return { content: [{ type: "text", text: `Failed to get wiki page: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get-wiki-tree",
    "Get the wiki page hierarchy (paths + ids, no content) under a path — enumerate a wiki's structure without pulling page bodies.",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier (ID or name)"),
      pagePath: z.string().optional().describe("Root path to enumerate from (default: '/' — the whole wiki)"),
      depth: z.enum(["oneLevel", "full"]).optional().describe("How deep to enumerate (default: full)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, wikiId, pagePath, depth }: any) => {
      try {
        const result = await ctx.wiki.getWikiPageTree(project, wikiId, pagePath ?? '/', depth ?? 'full');
        return { content: [{ type: "text", text: `Wiki tree for '${pagePath ?? '/'}' (${result.pageCount} page(s)):\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting wiki tree:", error);
        return { content: [{ type: "text", text: `Failed to get wiki tree: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "create-wiki-page",
    "Create a new wiki page in Azure DevOps (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier"),
      pagePath: z.string().describe("The path for the new page (e.g., '/Setup/NewGuide')"),
      content: z.string().describe("The markdown content for the page"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, wikiId, pagePath, content }: any) => {
      try {
        const result = await ctx.wiki.createWikiPage(project, wikiId, pagePath, content);
        return { content: [{ type: "text", text: `Created wiki page '${pagePath}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error creating wiki page:", error);
        return { content: [{ type: "text", text: `Failed to create wiki page: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "update-wiki-page",
    "Update an existing wiki page in Azure DevOps. Version is auto-fetched if not provided, so you can update pages without first calling get-wiki-page. (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier"),
      pagePath: z.string().describe("The path to the page"),
      content: z.string().describe("The updated markdown content"),
      version: z.string().optional().describe("The ETag/version for optimistic concurrency. If not provided, will be auto-fetched from the current page."),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, wikiId, pagePath, content, version }: any) => {
      try {
        const result = await ctx.wiki.updateWikiPage(project, wikiId, pagePath, content, version);
        return { content: [{ type: "text", text: `Updated wiki page '${pagePath}':\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error updating wiki page:", error);
        return { content: [{ type: "text", text: `Failed to update wiki page: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "ado-str-replace-wiki",
    "Replace a specific string in an Azure DevOps wiki page without rewriting entire content. More efficient than update-wiki-page for small changes. (requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true)",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier (ID or name)"),
      pagePath: z.string().describe("The path to the wiki page (e.g., '/SharePoint-Online/04-DEV-Configuration')"),
      old_str: z.string().describe("The exact string to replace (must be unique unless replace_all is true)"),
      new_str: z.string().describe("The replacement string"),
      replace_all: z.boolean().optional().describe("If true, replace all occurrences. If false (default), old_str must be unique in the page."),
      description: z.string().optional().describe("Optional description of the change (for audit logging)")
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ project, wikiId, pagePath, old_str, new_str, replace_all, description }: any) => {
      try {
        const result = await ctx.wiki.strReplaceWikiPage(project, wikiId, pagePath, old_str, new_str, replace_all ?? false, description);
        return {
          content: [{ type: "text", text: `Successfully replaced "${old_str}" with "${new_str}" in wiki page '${pagePath}' (${result.occurrences} occurrence(s)):\n\n${JSON.stringify(result, null, 2)}\n\nDiff:\n${result.diff}` }],
        };
      } catch (error: any) {
        console.error("Error replacing text in wiki page:", error);
        return { content: [{ type: "text", text: `Failed to replace text in wiki page: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "delete-wiki-page",
    "Delete a wiki page permanently (requires AZUREDEVOPS_ENABLE_WIKI_DELETE=true). WARNING: This permanently deletes the page and all sub-pages.",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier"),
      pagePath: z.string().describe("Page path (e.g., '/Setup/Old-Page')"),
    },
    { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async ({ project, wikiId, pagePath }: any) => {
      try {
        const result = await ctx.wiki.deleteWikiPage(project, wikiId, pagePath);
        return { content: [{ type: "text", text: `Deleted wiki page:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error deleting wiki page:", error);
        return { content: [{ type: "text", text: `Failed to delete wiki page: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "download-wiki-attachment",
    "Download a single wiki attachment/image from Azure DevOps wiki to disk. Uses the wiki's backing git repository to retrieve binary files. Claude can then Read the downloaded image for multimodal analysis.",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier (ID or name)"),
      attachmentPath: z.string().describe(
        descWithExamples(
          "The attachment path as it appears in wiki markdown (e.g., from /.attachments/ references)",
          ATTACHMENT_PATH_EXAMPLES
        )
      ),
      outputDir: z.string().optional().describe("Directory to save the file. Default: OS temp dir"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, wikiId, attachmentPath, outputDir }: any) => {
      try {
        const result = await ctx.wiki.downloadWikiAttachment(project, wikiId, attachmentPath, outputDir);
        return {
          content: [{ type: "text", text: `Downloaded wiki attachment:\n\n${JSON.stringify(result, null, 2)}\n\nUse the Read tool on '${result.filePath}' to view the image.` }],
        };
      } catch (error: any) {
        console.error("Error downloading wiki attachment:", error);
        return { content: [{ type: "text", text: `Failed to download wiki attachment: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "download-wiki-page-attachments",
    "Download all image/file attachments referenced in a wiki page. Extracts ![...](/.attachments/...) references from page content and downloads each file to disk. Returns file paths for Claude to Read and interpret images.",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier (ID or name)"),
      pagePath: z.string().describe("The wiki page path (e.g., '/Setup/Authentication')"),
      outputDir: z.string().optional().describe("Directory to save files. Default: OS temp dir"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, wikiId, pagePath, outputDir }: any) => {
      try {
        const result = await ctx.wiki.downloadWikiPageAttachments(project, wikiId, pagePath, outputDir);

        if (result.totalFound === 0) {
          return { content: [{ type: "text", text: `No attachments found in wiki page '${pagePath}'.` }] };
        }

        return {
          content: [{ type: "text", text: `Downloaded ${result.downloaded}/${result.totalFound} attachments from '${pagePath}':\n\n${JSON.stringify(result, null, 2)}\n\nUse the Read tool on each filePath to view the images.` }],
        };
      } catch (error: any) {
        console.error("Error downloading wiki page attachments:", error);
        return { content: [{ type: "text", text: `Failed to download wiki page attachments: ${error.message}` }] };
      }
    }
  );

  server.tool(
    "save-wiki-page-to-file",
    descWithExamples(
      "Download an ADO wiki page and save it as a local markdown file with frontmatter metadata. Supports lookup by path OR page ID (from wiki URLs). The agent can then edit the file locally with the Edit tool and upload it back with upload-wiki-page-from-file.",
      WIKI_SAVE_TO_FILE_EXAMPLES
    ),
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier (ID or name)"),
      pagePath: z.string().optional().describe("The wiki page path (e.g., '/Setup/Authentication'). Either pagePath or pageId is required."),
      pageId: zCoerceNumber().optional().describe("The numeric page ID from a wiki URL (e.g., 3789 from ...wiki/wikis/Wiki.wiki/3789/Page-Name). Either pageId or pagePath is required."),
      outputPath: z.string().optional().describe("Local file path to save to. Default: docs/wiki-pages/{flattened-path}.md"),
    },
    // Downloads ADO→local file only; ADO is never modified → read.
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, wikiId, pagePath, pageId, outputPath }: any) => {
      try {
        if (!pagePath && pageId == null) {
          return { content: [{ type: "text", text: "Either pagePath or pageId must be provided." }], isError: true };
        }

        let result;
        if (pageId != null) {
          // Look up page by ID first, then save using the resolved path
          const page = await ctx.wiki.getWikiPageById(project, wikiId, pageId, true);
          result = await ctx.wiki.saveWikiPageToFile(project, wikiId, page.path, outputPath);
        } else {
          result = await ctx.wiki.saveWikiPageToFile(project, wikiId, pagePath, outputPath);
        }

        return {
          content: [{ type: "text", text: `Saved wiki page to local file:\n\n${JSON.stringify(result, null, 2)}\n\nEdit the file with the Edit tool, then use upload-wiki-page-from-file to push changes back.` }],
        };
      } catch (error: any) {
        console.error("Error saving wiki page to file:", error);
        return { content: [{ type: "text", text: `Failed to save wiki page to file: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "upload-wiki-page-from-file",
    descWithExamples(
      "Upload a local markdown file back to ADO wiki. Reads frontmatter metadata (project, wikiId, pagePath, version) from the file to determine the target. Uses stored etag for optimistic concurrency. Requires AZUREDEVOPS_ENABLE_WIKI_WRITE=true.",
      WIKI_UPLOAD_FROM_FILE_EXAMPLES
    ),
    {
      filePath: z.string().describe("Path to the local markdown file with frontmatter (created by save-wiki-page-to-file)"),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async ({ filePath }: any) => {
      try {
        const result = await ctx.wiki.uploadWikiPageFromFile(filePath);
        return {
          content: [{ type: "text", text: `Uploaded wiki page from file:\n\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (error: any) {
        console.error("Error uploading wiki page from file:", error);
        return { content: [{ type: "text", text: `Failed to upload wiki page from file: ${error.message}` }], isError: true };
      }
    }
  );
}
