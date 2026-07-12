/**
 * Shared server/database targeting for the diagnostic tool groups.
 * Every diagnostic tool takes an optional serverId + database and resolves them to the
 * configured defaults, reporting which defaults were applied.
 */
import { z } from 'zod';
import type { ServiceContext } from '../types.js';

export const TARGET_SCHEMA = {
  serverId: z.string().optional().describe("⚠️ OMIT to use default server. DO NOT GUESS."),
  database: z.string().optional().describe("⚠️ OMIT to use default database. DO NOT GUESS."),
};

export interface Target {
  serverId?: string;
  database?: string;
}

/**
 * Helper to build "defaults used" message for tool responses.
 */
function buildDefaultsUsedMessage(
  providedServerId: string | undefined,
  resolvedServerId: string,
  providedDatabase: string | undefined,
  resolvedDatabase: string
): string {
  const defaultsUsed: string[] = [];
  if (!providedServerId) defaultsUsed.push(`server='${resolvedServerId}'`);
  if (!providedDatabase) defaultsUsed.push(`database='${resolvedDatabase}'`);

  if (defaultsUsed.length > 0) {
    return `\n\nℹ️ Used defaults: ${defaultsUsed.join(', ')}`;
  }
  return '';
}

/**
 * Resolve target, run the operation, and render the result with a defaults note.
 *
 * `before` runs ahead of target resolution, so a feature-flag guard reports "disabled"
 * rather than whichever configuration error resolution would have hit first.
 */
export function createWithTarget(ctx: ServiceContext) {
  return async (
    { serverId, database }: Target,
    action: string,
    run: (resolvedServerId: string, resolvedDatabase: string) => Promise<unknown>,
    before?: () => void
  ) => {
    try {
      before?.();
      const resolvedServerId = ctx.connection.resolveServerId(serverId);
      const resolvedDatabase = ctx.connection.resolveDatabase(resolvedServerId, database);
      const result = await run(resolvedServerId, resolvedDatabase);
      const defaultsMsg = buildDefaultsUsedMessage(serverId, resolvedServerId, database, resolvedDatabase);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) + defaultsMsg }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error ${action}: ${error.message}` }],
        isError: true,
      };
    }
  };
}
