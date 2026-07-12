/**
 * Shared server/database targeting and option parsing for the diagnostic CLI groups.
 */
import type { ServiceContext } from '../../types.js';

/** Commander gives us strings; the diagnostic queries expect positive integers. */
export function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer, got '${value}'`);
  }
  return parsed;
}

/** Resolve --server-id / --database against the configured defaults. */
export function createResolveTarget(ctx: ServiceContext) {
  return (opts: any) => {
    const serverId = ctx.connection.resolveServerId(opts.serverId);
    const database = ctx.connection.resolveDatabase(serverId, opts.database);
    return { serverId, database };
  };
}
