/**
 * Request Context
 *
 * Module-level storage for per-request context (e.g., CallerObjectId from JWT).
 * Safe for the current single-request HTTP architecture (InMemoryTransport
 * processes one request at a time).
 *
 * For concurrent request support, migrate to AsyncLocalStorage.
 */

let _callerObjectId: string | null = null;

/**
 * Set the CallerObjectId for the current request.
 * Call before dispatching the MCP request, clear after.
 */
export function setRequestCallerObjectId(oid: string | null): void {
  _callerObjectId = oid;
}

/**
 * Get the CallerObjectId for the current request.
 * Returns null if no user impersonation is active.
 */
export function getRequestCallerObjectId(): string | null {
  return _callerObjectId;
}
