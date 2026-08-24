/**
 * GUID validation for values that reach an OData URL.
 *
 * This package deliberately builds no OData `$filter` or `$search` from caller input.
 * The only caller-supplied value that ever lands in a Graph URL is an application's
 * object id or appId, and both are GUIDs - so validating the shape is a complete
 * defence and there is no string literal left to escape. Name matching happens
 * client-side (see AppRegistrationService).
 */

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string): boolean {
  return GUID_PATTERN.test(value);
}

/** Reject a non-GUID before it can reach a Graph URL. */
export function assertGuid(value: string, label: string): string {
  if (!isGuid(value)) {
    throw new Error(
      `${label} must be a GUID (the application's object ID or application/client ID). Got: '${value}'`
    );
  }
  return value;
}
