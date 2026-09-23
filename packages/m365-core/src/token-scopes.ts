/**
 * Read the delegated permissions (`scp` claim) out of a Graph access token.
 *
 * The token is NOT verified. This is for display only - telling the user which
 * permissions the app registration was granted - never for an access decision.
 */
export function decodeTokenScopes(accessToken: string): string[] {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2 || !parts[1]) {
      return [];
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload?.scp !== 'string') {
      return [];
    }
    return payload.scp.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}
