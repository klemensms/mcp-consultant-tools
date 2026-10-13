/**
 * Checks for values that are placed into a Dataverse request address.
 *
 * Table, column, navigation property and option set names, and record IDs, are
 * interpolated into the URL path or into a quoted OData literal. A value carrying
 * its own `?`, `/`, `(`, `'` or `&` would change which request is sent, and would
 * also slip past PII redaction, which keys on the table name and the select list.
 * `$filter` and FetchXML are left alone: they are URL-encoded and are expressions
 * by design.
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Action names may be namespace-qualified, e.g. `Microsoft.Dynamics.CRM.QualifyLead`. */
const ACTION_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Throw unless `value` is a plain Dataverse name: letters, digits and underscores, not starting with a digit. */
export function assertIdentifier(value: string, label: string): void {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new Error(
      `Invalid ${label}: ${JSON.stringify(value)}. Use the plain name: letters, digits and underscores only.`
    );
  }
}

/** Throw unless `value` is a GUID. */
export function assertGuid(value: string, label = 'record ID'): void {
  if (typeof value !== 'string' || !GUID.test(value)) {
    throw new Error(`Invalid ${label} format: ${value}. Must be a valid GUID.`);
  }
}

/** Throw unless `value` is an action or Custom API name, optionally dot-qualified. */
export function assertActionName(value: string): void {
  if (typeof value !== 'string' || !ACTION_NAME.test(value)) {
    throw new Error(
      `Invalid action name: ${JSON.stringify(value)}. Use the plain name, optionally qualified with dots.`
    );
  }
}

/** Throw unless `value` is a whole number of 1 or more. */
export function assertPositiveWholeNumber(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a whole number of 1 or more (got ${value}).`);
  }
}
