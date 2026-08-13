/**
 * Team iteration capacity CLI commands (group: `capacity`, alias `cap`).
 * Mirrors the MCP iteration-capacity tools. Writes are FULL REPLACE.
 */

import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { getGlobalFlags, handleCliError } from '@mcp-consultant-tools/core';
import type { ServiceContext } from '../../types.js';
import { outputResult } from '../output.js';

const collect = (val: string, acc: string[]) => { acc.push(val); return acc; };

/** Build a days-off array from --days-off <json> and/or repeated --day <date> options. */
function buildDaysOff(opts: any): Array<{ start: string; end: string }> | undefined {
  const days: Array<{ start: string; end: string }> = [];
  if (opts.daysOff) {
    const parsed = JSON.parse(opts.daysOff);
    if (Array.isArray(parsed)) days.push(...parsed);
  }
  if (Array.isArray(opts.day)) {
    for (const d of opts.day) days.push({ start: d, end: d });
  }
  return days.length ? days : undefined;
}

export function registerIterationCapacityCommands(program: Command, ctx: ServiceContext): void {
  const capacity = program.command('capacity').alias('cap').description('Team sprint capacity & days-off operations');

  capacity
    .command('list')
    .description("List all team members' capacity (capacity-per-day + days-off) for a sprint")
    .argument('<project>', 'Project name')
    .argument('<team>', 'Team name')
    .argument('<iterationId>', 'Iteration identifier GUID (from `iteration list` -> identifier)')
    .action(async (project: string, team: string, iterationId: string) => {
      try {
        const result = await ctx.iterationCapacity.getIterationCapacities(project, team, iterationId);
        outputResult(
          { fileName: `capacities-${team}-${iterationId}`, data: result, summary: `Capacities for team '${team}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list iteration capacities'); }
    });

  capacity
    .command('set')
    .description("Set one member's capacity-per-day + days-off (FULL REPLACE)")
    .argument('<project>', 'Project name')
    .argument('<team>', 'Team name')
    .argument('<iterationId>', 'Iteration identifier GUID')
    .argument('<member>', 'Identity GUID, email, or display name')
    .requiredOption('-c, --capacity-per-day <n>', 'Capacity per working day')
    .option('-a, --activity <name>', 'Activity name (default: Unassigned)', '')
    .option('--day <date>', 'A single day off (YYYY-MM-DD); repeatable', collect, [])
    .option('--days-off <json>', 'JSON array of {start,end} ranges')
    .action(async (project: string, team: string, iterationId: string, member: string, opts: any) => {
      try {
        const capacityPerDay = parseFloat(opts.capacityPerDay);
        if (Number.isNaN(capacityPerDay)) throw new Error(`--capacity-per-day must be a number, got '${opts.capacityPerDay}'`);
        const daysOff = buildDaysOff(opts);
        const result = await ctx.iterationCapacity.setTeamMemberCapacity(
          project, team, iterationId, member, capacityPerDay, opts.activity ?? '', daysOff,
        );
        outputResult(
          { persist: false, fileName: `capacity-set-${team}-${member}`, data: result, summary: `Set capacity for '${member}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'set team member capacity'); }
    });

  capacity
    .command('set-batch')
    .description('Set capacity for many members in one call (one PATCH per member)')
    .argument('<project>', 'Project name')
    .argument('<team>', 'Team name')
    .argument('<iterationId>', 'Iteration identifier GUID')
    .option('--members <json>', 'Inline JSON array of { member, capacityPerDay, activityName?, daysOff? }')
    .option('-f, --file <path>', 'Path to a JSON file with the members array')
    .action(async (project: string, team: string, iterationId: string, opts: any) => {
      try {
        if (!opts.members && !opts.file) throw new Error('Provide --members <json> or --file <path>.');
        const raw = opts.file ? readFileSync(opts.file, 'utf8') : opts.members;
        const members = JSON.parse(raw);
        if (!Array.isArray(members)) throw new Error('members must be a JSON array of { member, capacityPerDay, activityName?, daysOff? }');
        const result = await ctx.iterationCapacity.setTeamCapacitiesBatch(project, team, iterationId, members);
        outputResult(
          { persist: false, fileName: `capacity-batch-${team}-${iterationId}`, data: result, summary: `Batch capacity set for team '${team}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'set team capacities (batch)'); }
    });

  capacity
    .command('days-off-list')
    .description('List the team-wide days-off for a sprint')
    .argument('<project>', 'Project name')
    .argument('<team>', 'Team name')
    .argument('<iterationId>', 'Iteration identifier GUID')
    .action(async (project: string, team: string, iterationId: string) => {
      try {
        const result = await ctx.iterationCapacity.getTeamDaysOff(project, team, iterationId);
        outputResult(
          { fileName: `team-days-off-${team}-${iterationId}`, data: result, summary: `Team days-off for '${team}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'list team days-off'); }
    });

  capacity
    .command('days-off-set')
    .description('Set the team-wide days-off for a sprint (FULL REPLACE)')
    .argument('<project>', 'Project name')
    .argument('<team>', 'Team name')
    .argument('<iterationId>', 'Iteration identifier GUID')
    .option('--day <date>', 'A single team day off (YYYY-MM-DD); repeatable', collect, [])
    .option('--days-off <json>', 'JSON array of {start,end} ranges')
    .action(async (project: string, team: string, iterationId: string, opts: any) => {
      try {
        const daysOff = buildDaysOff(opts) ?? [];
        const result = await ctx.iterationCapacity.setTeamDaysOff(project, team, iterationId, daysOff);
        outputResult(
          { fileName: `team-days-off-set-${team}-${iterationId}`, data: result, summary: `Set team days-off for '${team}'` },
          getGlobalFlags(program)
        );
      } catch (error) { handleCliError(error, 'set team days-off'); }
    });
}
