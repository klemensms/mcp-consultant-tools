/**
 * Prompt template formatters for Azure DevOps prompts
 */

export function formatWikiSearchResults(searchText: string, project: string | undefined, result: any): string {
  let report = `# Wiki Search Results: "${searchText}"\n\n`;
  report += `**Project:** ${project || 'All allowed projects'}\n`;
  report += `**Total Results:** ${result.totalCount}\n\n`;

  if (result.results && result.results.length > 0) {
    report += `## Results\n\n`;
    result.results.forEach((item: any, index: number) => {
      report += `### ${index + 1}. ${item.fileName}\n`;
      report += `- **Path:** ${item.path}\n`;
      report += `- **Wiki:** ${item.wikiName}\n`;
      report += `- **Project:** ${item.project}\n`;
      if (item.highlights && item.highlights.length > 0) {
        report += `- **Highlights:**\n`;
        item.highlights.forEach((highlight: string) => {
          const cleanHighlight = highlight.replace(/<[^>]*>/g, '');
          report += `  - ${cleanHighlight}\n`;
        });
      }
      report += `\n`;
    });
  } else {
    report += `No results found for "${searchText}".\n`;
  }

  return report;
}

export function formatWikiPageContent(project: string, wikiId: string, pagePath: string, result: any): string {
  let report = `# Wiki Page: ${pagePath}\n\n`;
  report += `**Project:** ${project}\n`;
  report += `**Wiki:** ${wikiId}\n`;
  report += `**Git Path:** ${result.gitItemPath || 'N/A'}\n\n`;

  if (result.subPages && result.subPages.length > 0) {
    report += `## Sub-pages\n`;
    result.subPages.forEach((subPage: any) => {
      report += `- ${subPage.path}\n`;
    });
    report += `\n`;
  }

  report += `## Content\n\n`;
  report += result.content || '*No content available*';

  return report;
}

export function formatWorkItemSummary(workItemId: string, workItem: any, comments: any): string {
  const fields = workItem.fields || {};

  let report = `# Work Item #${workItemId}: ${fields['System.Title'] || 'Untitled'}\n\n`;

  report += `## Details\n`;
  report += `- **Type:** ${fields['System.WorkItemType'] || 'N/A'}\n`;
  report += `- **State:** ${fields['System.State'] || 'N/A'}\n`;
  report += `- **Assigned To:** ${fields['System.AssignedTo']?.displayName || 'Unassigned'}\n`;
  report += `- **Created By:** ${fields['System.CreatedBy']?.displayName || 'N/A'}\n`;
  report += `- **Created Date:** ${fields['System.CreatedDate'] || 'N/A'}\n`;
  report += `- **Changed Date:** ${fields['System.ChangedDate'] || 'N/A'}\n`;
  report += `- **Area Path:** ${fields['System.AreaPath'] || 'N/A'}\n`;
  report += `- **Iteration Path:** ${fields['System.IterationPath'] || 'N/A'}\n`;
  if (fields['System.Tags']) {
    report += `- **Tags:** ${fields['System.Tags']}\n`;
  }
  report += `\n`;

  if (fields['System.Description']) {
    report += `## Description\n${fields['System.Description']}\n\n`;
  }

  if (fields['Microsoft.VSTS.TCM.ReproSteps']) {
    report += `## Repro Steps\n${fields['Microsoft.VSTS.TCM.ReproSteps']}\n\n`;
  }

  if (workItem.relations && workItem.relations.length > 0) {
    report += `## Related Items\n`;
    workItem.relations.forEach((relation: any) => {
      report += `- ${relation.rel}: ${relation.url}\n`;
    });
    report += `\n`;
  }

  if (comments.comments && comments.comments.length > 0) {
    report += `## Comments (${comments.totalCount})\n\n`;
    comments.comments.forEach((comment: any) => {
      report += `### ${comment.createdBy} - ${new Date(comment.createdDate).toLocaleString()}\n`;
      report += `${comment.text}\n\n`;
    });
  }

  return report;
}

export function formatWorkItemsQueryReport(project: string, result: any): string {
  let report = `# Work Items Query Results\n\n`;
  report += `**Project:** ${project}\n`;
  report += `**Total Results:** ${result.totalCount}\n\n`;

  if (result.workItems && result.workItems.length > 0) {
    const groupedByState = new Map<string, any[]>();
    result.workItems.forEach((item: any) => {
      const state = item.fields['System.State'] || 'Unknown';
      if (!groupedByState.has(state)) {
        groupedByState.set(state, []);
      }
      groupedByState.get(state)!.push(item);
    });

    const stateOrder = ['Active', 'New', 'Resolved', 'Closed'];
    const sortedStates = Array.from(groupedByState.keys()).sort((a, b) => {
      const aIndex = stateOrder.indexOf(a);
      const bIndex = stateOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    sortedStates.forEach(state => {
      const items = groupedByState.get(state)!;
      report += `## ${state} (${items.length})\n\n`;
      items.forEach((item: any) => {
        const fields = item.fields;
        report += `- **#${item.id}**: ${fields['System.Title'] || 'Untitled'}\n`;
        report += `  - Type: ${fields['System.WorkItemType'] || 'N/A'}`;
        report += `, Assigned: ${fields['System.AssignedTo']?.displayName || 'Unassigned'}\n`;
      });
      report += `\n`;
    });
  } else {
    report += `No work items found matching the query.\n`;
  }

  return report;
}
