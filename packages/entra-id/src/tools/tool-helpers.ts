/**
 * Every Entra ID tool is read-only and returns JSON. This centralises the
 * success/`isError` response shape so the registrations stay thin.
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

/** Read-only tools that reach an external API. */
export const READ_ONLY: { readOnlyHint: true; openWorldHint: true } = {
  readOnlyHint: true,
  openWorldHint: true,
};

export const APPLICATION_READ_ALL =
  'Requires the service principal to hold the Application.Read.All Microsoft Graph application permission, granted with admin consent.';

/**
 * Repeated on both tools. An app registration and its service principal hold separate
 * credential collections, and this package reads only the app registration's.
 */
export const SP_CREDENTIAL_CAVEAT =
  'Covers credentials on the app registration only. Secrets or certificates added directly to a service principal (enterprise application) are a separate collection in Microsoft Graph and are NOT scanned, so an empty result is not proof that nothing in the tenant is expiring.';
