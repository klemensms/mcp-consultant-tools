/**
 * Configuration Service - Reads environment configuration
 */

export class ConfigurationService {
  getConfiguration(): any {
    const organization = process.env.AZUREDEVOPS_ORGANIZATION;
    const projects = process.env.AZUREDEVOPS_PROJECTS?.split(",").map(p => p.trim()).filter(p => p) || [];
    const syncFolder = process.env.AZUREDEVOPS_SYNC_FOLDER || 'docs/user-stories';

    if (!organization || projects.length === 0) {
      return null;
    }

    return {
      organization,
      projects,
      syncFolder,
      urlPatterns: {
        workItem: `https://dev.azure.com/${organization}/{project}/_workitems/edit/{id}`,
        pullRequest: `https://dev.azure.com/${organization}/{project}/_git/{repo}/pullrequest/{id}`,
        wiki: `https://dev.azure.com/${organization}/{project}/_wiki/wikis/{wikiName}/{pagePath}`,
      },
    };
  }
}
