/**
 * Team iteration capacity tools - read-only + upsert (Tier 2).
 * Writes (set-*) are gated behind AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT=true
 * and perform a FULL REPLACE of the targeted member's / team's activities + days-off.
 */
import { z } from 'zod';
import { zCoerceNumber } from '../schemas.js';
import type { ServiceContext } from '../types.js';

/** Some MCP harnesses stringify array/object params; parse them back before validation. */
const parseJsonIfString = (v: any) => {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return undefined;
    try { return JSON.parse(t); } catch { return v; }
  }
  return v;
};

const dayOffShape = z.object({
  start: z.string().describe("Start date, 'YYYY-MM-DD' or full ISO. Single day = same as end."),
  end: z.string().describe("End date, 'YYYY-MM-DD' or full ISO. Single day = same as start."),
});

const zDaysOff = z.preprocess(parseJsonIfString, z.array(dayOffShape));

const zCapacityEntries = z.preprocess(
  parseJsonIfString,
  z.array(z.object({
    member: z.string().describe("Identity GUID, email, or display name"),
    capacityPerDay: zCoerceNumber(),
    activityName: z.string().optional(),
    daysOff: z.array(dayOffShape).optional(),
  })),
);

export function registerIterationCapacityTools(server: any, ctx: ServiceContext): { readonly: number; upsert: number; delete: number } {
  let readonlyCount = 0;
  let upsertCount = 0;

  // ========================================
  // READ-ONLY TOOLS
  // ========================================
  server.tool(
    "get-iteration-capacities",
    "Get every team member's capacity for a sprint: capacity-per-day (by activity) and days-off. Returns each member's identity GUID, display name, and email — use these with set-team-member-capacity.",
    {
      project: z.string().describe("The project name"),
      team: z.string().describe("The team name (e.g., 'My Team')"),
      iterationId: z.string().describe("The iteration identifier GUID (from list-iterations as 'identifier', NOT the integer id)"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, team, iterationId }: any) => {
      try {
        const result = await ctx.iterationCapacity.getIterationCapacities(project, team, iterationId);
        return { content: [{ type: "text", text: `Capacities for team '${team}', iteration ${iterationId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting iteration capacities:", error);
        return { content: [{ type: "text", text: `Failed to get iteration capacities: ${error.message}` }], isError: true };
      }
    }
  );
  readonlyCount++;

  server.tool(
    "get-team-days-off",
    "Get the team-wide days-off for a sprint (shared non-working days such as public holidays / office closures — separate from per-member days-off).",
    {
      project: z.string().describe("The project name"),
      team: z.string().describe("The team name"),
      iterationId: z.string().describe("The iteration identifier GUID (from list-iterations as 'identifier')"),
    },
    { readOnlyHint: true, openWorldHint: true },
    async ({ project, team, iterationId }: any) => {
      try {
        const result = await ctx.iterationCapacity.getTeamDaysOff(project, team, iterationId);
        return { content: [{ type: "text", text: `Team days-off for '${team}', iteration ${iterationId}:\n\n${JSON.stringify(result, null, 2)}` }] };
      } catch (error: any) {
        console.error("Error getting team days-off:", error);
        return { content: [{ type: "text", text: `Failed to get team days-off: ${error.message}` }], isError: true };
      }
    }
  );
  readonlyCount++;

  // ========================================
  // UPSERT TOOLS (Tier 2) - full replace
  // ========================================
  if (ctx.tierFlags.enableIterationCapacityUpsert) {
    server.tool(
      "set-team-member-capacity",
      "Set one team member's capacity-per-day and days-off for a sprint. FULL REPLACE: the supplied activities and days-off overwrite that member's existing values (omit daysOff to clear them). 'member' accepts an identity GUID, email, or display name (resolved against the team). (requires AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        team: z.string().describe("The team name"),
        iterationId: z.string().describe("The iteration identifier GUID (from list-iterations as 'identifier')"),
        member: z.string().describe("Team member: identity GUID, email, or display name"),
        capacityPerDay: zCoerceNumber().describe("Capacity per working day (e.g., 6)"),
        activityName: z.string().optional().describe("Activity name; defaults to '' (Unassigned)"),
        daysOff: zDaysOff.optional().describe("Array of {start,end} ranges. Single day = start==end. Enumerate single days for predictability. Omit to clear days-off."),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, team, iterationId, member, capacityPerDay, activityName, daysOff }: any) => {
        try {
          const result = await ctx.iterationCapacity.setTeamMemberCapacity(project, team, iterationId, member, capacityPerDay, activityName ?? '', daysOff);
          return { content: [{ type: "text", text: `Set capacity for '${member}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error setting team member capacity:", error);
          return { content: [{ type: "text", text: `Failed to set team member capacity: ${error.message}` }], isError: true };
        }
      }
    );
    upsertCount++;

    server.tool(
      "set-team-capacities-batch",
      "Set capacity + days-off for many team members in one call (one PATCH per member — never wipes members you don't list). Each entry is FULL REPLACE for that member. Use this to refresh a whole sprint's bookings at once. (requires AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        team: z.string().describe("The team name"),
        iterationId: z.string().describe("The iteration identifier GUID (from list-iterations as 'identifier')"),
        members: zCapacityEntries.describe("Array of { member, capacityPerDay, activityName?, daysOff? }. 'member' = GUID/email/display name; daysOff = [{start,end}]."),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, team, iterationId, members }: any) => {
        try {
          const result = await ctx.iterationCapacity.setTeamCapacitiesBatch(project, team, iterationId, members);
          return { content: [{ type: "text", text: `Batch capacity set for team '${team}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error setting team capacities (batch):", error);
          return { content: [{ type: "text", text: `Failed to set team capacities: ${error.message}` }], isError: true };
        }
      }
    );
    upsertCount++;

    server.tool(
      "set-team-days-off",
      "Set the team-wide days-off for a sprint (shared non-working days such as public holidays). FULL REPLACE: the supplied list overwrites the team's existing days-off (pass an empty array to clear). (requires AZUREDEVOPS_ENABLE_ITERATION_CAPACITY_UPSERT=true)",
      {
        project: z.string().describe("The project name"),
        team: z.string().describe("The team name"),
        iterationId: z.string().describe("The iteration identifier GUID (from list-iterations as 'identifier')"),
        daysOff: zDaysOff.describe("Array of {start,end} ranges. Single day = start==end. Empty array clears all team days-off."),
      },
      { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      async ({ project, team, iterationId, daysOff }: any) => {
        try {
          const result = await ctx.iterationCapacity.setTeamDaysOff(project, team, iterationId, daysOff);
          return { content: [{ type: "text", text: `Set team days-off for '${team}':\n\n${JSON.stringify(result, null, 2)}` }] };
        } catch (error: any) {
          console.error("Error setting team days-off:", error);
          return { content: [{ type: "text", text: `Failed to set team days-off: ${error.message}` }], isError: true };
        }
      }
    );
    upsertCount++;
  }

  return { readonly: readonlyCount, upsert: upsertCount, delete: 0 };
}
