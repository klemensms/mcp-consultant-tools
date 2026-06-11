/**
 * Prompt registrations for Azure DevOps
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';
import {
  formatWikiSearchResults,
  formatWikiPageContent,
  formatWorkItemSummary,
  formatWorkItemsQueryReport,
} from './templates.js';

function makePromptResult(text: string) {
  return {
    messages: [
      {
        role: "assistant" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

export function registerAllPrompts(server: any, ctx: ServiceContext): void {
  server.prompt(
    "wiki-search-results",
    "Search Azure DevOps wiki pages and get formatted results with content snippets",
    {
      searchText: z.string().describe("The text to search for"),
      project: z.string().optional().describe("Optional project filter"),
      maxResults: z.string().optional().describe("Maximum number of results (default: 25)"),
    },
    async (args: any) => {
      try {
        const { searchText, project, maxResults } = args;
        const maxResultsNum = maxResults ? parseInt(maxResults, 10) : undefined;
        const result = await ctx.wiki.searchWikiPages(searchText, project, maxResultsNum);
        return makePromptResult(formatWikiSearchResults(searchText, project, result));
      } catch (error: any) {
        console.error(`Error generating wiki search results:`, error);
        return makePromptResult(`Error: ${error.message}`);
      }
    }
  );

  server.prompt(
    "wiki-page-content",
    "Get a formatted wiki page with navigation context from Azure DevOps",
    {
      project: z.string().describe("The project name"),
      wikiId: z.string().describe("The wiki identifier"),
      pagePath: z.string().describe("The path to the page"),
    },
    async (args: any) => {
      try {
        const { project, wikiId, pagePath } = args;
        const result = await ctx.wiki.getWikiPage(project, wikiId, pagePath, true);
        return makePromptResult(formatWikiPageContent(project, wikiId, pagePath, result));
      } catch (error: any) {
        console.error(`Error generating wiki page content:`, error);
        return makePromptResult(`Error: ${error.message}`);
      }
    }
  );

  server.prompt(
    "work-item-summary",
    "Get a comprehensive summary of a work item with comments from Azure DevOps",
    {
      project: z.string().describe("The project name"),
      workItemId: z.string().describe("The work item ID"),
    },
    async (args: any) => {
      try {
        const { project, workItemId } = args;
        const workItemIdNum = parseInt(workItemId, 10);

        const [workItem, comments] = await Promise.all([
          ctx.workItem.getWorkItem(project, workItemIdNum),
          ctx.workItem.getWorkItemComments(project, workItemIdNum),
        ]);

        return makePromptResult(formatWorkItemSummary(workItemId, workItem, comments));
      } catch (error: any) {
        console.error(`Error generating work item summary:`, error);
        return makePromptResult(`Error: ${error.message}`);
      }
    }
  );

  server.prompt(
    "work-items-query-report",
    "Execute a WIQL query and get formatted results grouped by state/type",
    {
      project: z.string().describe("The project name"),
      wiql: z.string().describe("The WIQL query string"),
      maxResults: z.string().optional().describe("Maximum number of results (default: 200)"),
    },
    async (args: any) => {
      try {
        const { project, wiql, maxResults } = args;
        const maxResultsNum = maxResults ? parseInt(maxResults, 10) : undefined;
        const result = await ctx.workItem.queryWorkItems(project, wiql, maxResultsNum);
        return makePromptResult(formatWorkItemsQueryReport(project, result));
      } catch (error: any) {
        console.error(`Error generating work items query report:`, error);
        return makePromptResult(`Error: ${error.message}`);
      }
    }
  );
}
