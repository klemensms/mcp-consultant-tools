/**
 * Which way the SharePoint server authenticates.
 *
 * A client secret present means app-only (client credentials, the original
 * behaviour). No secret means device code: the user signs in and the server acts
 * as them. SHAREPOINT_AUTH_MODE overrides the inference.
 */

export type SharePointAuthMode = 'client-credentials' | 'device-code';

const AUTH_MODES: SharePointAuthMode[] = ['client-credentials', 'device-code'];

export function resolveAuthMode(env: NodeJS.ProcessEnv): SharePointAuthMode {
  const override = env.SHAREPOINT_AUTH_MODE;
  if (override) {
    if (!AUTH_MODES.includes(override as SharePointAuthMode)) {
      throw new Error(
        `Invalid SHAREPOINT_AUTH_MODE '${override}'. Allowed values: ${AUTH_MODES.join(', ')}.`
      );
    }
    return override as SharePointAuthMode;
  }
  return env.SHAREPOINT_CLIENT_SECRET ? 'client-credentials' : 'device-code';
}
