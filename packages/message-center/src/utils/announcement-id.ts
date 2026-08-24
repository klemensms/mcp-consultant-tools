/**
 * Validation for the only caller-supplied values that reach a Graph URL: service-health
 * issue IDs and Message Center message IDs.
 *
 * These are Graph-assigned service-announcement IDs - a short service prefix plus digits
 * (e.g. `EX226792`, `MC172851`, `SP391284`). They are always alphanumeric. Validating the
 * shape before it lands in a URL path segment is a complete defence: nothing here builds an
 * OData `$filter` from caller input (Graph ignores `$filter` on these collections - see the
 * client), so a shape check is all that is needed and there is no string literal to escape.
 */

const ANNOUNCEMENT_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;

export function isAnnouncementId(value: string): boolean {
  return ANNOUNCEMENT_ID_PATTERN.test(value);
}

/** Reject a malformed ID before it can reach a Graph URL. */
export function assertAnnouncementId(value: string, label: string): string {
  if (!isAnnouncementId(value)) {
    throw new Error(
      `${label} must be a service-announcement ID: letters and digits only, e.g. 'EX226792' or 'MC172851'. Got: '${value}'`
    );
  }
  return value;
}
