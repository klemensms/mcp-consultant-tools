/**
 * Every code-review tool is read-only and returns JSON. This centralises the success/`isError`
 * response shape so the registrations stay thin.
 */
export async function runTool(action: string, run: () => Promise<unknown>) {
  try {
    const result = await run();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error ${action}: ${error.message}` }],
      isError: true,
    };
  }
}

/** Read-only tools that reach an external API and/or clone a repository. */
export const READ_ONLY: { readOnlyHint: true; openWorldHint: true } = {
  readOnlyHint: true,
  openWorldHint: true,
};

/** Repeated on the repo-analysis tools so an agent knows the repo is shallow-cloned and cleaned up. */
export const CLONE_NOTE =
  'Shallow-clones the repository into a temporary directory, analyses the working tree, and deletes it afterwards; the embedded credential is never written to output or logs.';

/** Repeated on the GitHub Packages tools - those work only with a GitHub Enterprise PAT. */
export const GHE_PACKAGES_NOTE =
  'Requires the github-enterprise provider with a classic PAT that has the read:packages scope. Not available with the azure-devops or github-app providers (GitHub Apps cannot authenticate to the Packages API).';
