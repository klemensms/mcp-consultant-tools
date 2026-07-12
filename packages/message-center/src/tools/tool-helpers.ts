/**
 * Every Message Center tool is read-only and returns JSON. This centralises the
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

export const SERVICE_HEALTH_READ =
  'Requires the service principal to hold the ServiceHealth.Read.All Microsoft Graph application permission, granted with admin consent.';

export const SERVICE_MESSAGE_READ =
  'Requires the service principal to hold the ServiceMessage.Read.All Microsoft Graph application permission, granted with admin consent.';

/**
 * Filters run client-side because Microsoft Graph ignores server-side $filter on these
 * collections. Repeated on the list tools so an agent understands why truncated matters.
 */
export const CLIENT_SIDE_FILTER_NOTE =
  'Filters and ordering are applied client-side after fetching the collection (Microsoft Graph does not filter these collections server-side), so any filter scans every row before trimming to maxResults; when truncated is true, maxResults cut the list and the counts describe only the rows returned.';
