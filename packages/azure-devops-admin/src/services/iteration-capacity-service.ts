/**
 * Team iteration capacity operations for Azure DevOps Admin.
 *
 * Reads and writes per-member capacity (capacity-per-day + days-off) and the
 * team-wide days-off collection for a sprint, plus the team-wide days-off.
 * Writes are FULL REPLACE of the targeted member's activities + days-off.
 *
 * Endpoints (api-version 7.1), team-scoped:
 *   {project}/{team}/_apis/work/teamsettings/iterations/{iterationId}/capacities
 *   {project}/{team}/_apis/work/teamsettings/iterations/{iterationId}/teamdaysoff
 * Identity resolution (name/email -> GUID):
 *   _apis/projects/{project}/teams/{team}/members
 */
import type { AdminClient } from './admin-client.js';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DayOff {
  /** ISO date or datetime, e.g. "2026-06-22" or "2026-06-22T00:00:00Z". */
  start: string;
  end: string;
}

export interface MemberCapacityInput {
  /** Identity GUID, email, or display name of the team member. */
  member: string;
  capacityPerDay: number;
  /** Activity name; defaults to "" (Unassigned). */
  activityName?: string;
  daysOff?: DayOff[];
}

export class IterationCapacityService {
  constructor(private client: AdminClient) {}

  // ---- helpers -------------------------------------------------------------

  private capacitiesBase(project: string, team: string, iterationId: string): string {
    const encodedTeam = encodeURIComponent(team);
    return `${project}/${encodedTeam}/_apis/work/teamsettings/iterations/${iterationId}`;
  }

  private normalizeDaysOff(daysOff?: DayOff[]): DayOff[] {
    if (!daysOff || daysOff.length === 0) return [];
    return daysOff.map((d) => ({
      start: this.client.formatDateForAdo(d.start),
      end: this.client.formatDateForAdo(d.end),
    }));
  }

  /** Fetch the team's members (each entry exposes `.identity`). */
  private async fetchTeamMembers(project: string, team: string): Promise<any[]> {
    // ceiling: single page ($top=1000); paginate if a team ever exceeds that
    const endpoint = `_apis/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}/members?$top=1000&api-version=${this.client.apiVersion}`;
    const response = await this.client.makeRequest<any>(endpoint);
    return Array.isArray(response?.value) ? response.value : [];
  }

  /** Resolve a member identifier (GUID passes through; else match email then display name). */
  private resolveMemberId(members: any[], identifier: string): string {
    if (GUID_RE.test(identifier.trim())) return identifier.trim();

    const identities = members.map((m) => m?.identity).filter(Boolean);
    const needle = identifier.trim().toLowerCase();

    const byEmail = identities.filter((i) => (i.uniqueName || '').toLowerCase() === needle);
    if (byEmail.length === 1) return byEmail[0].id;
    if (byEmail.length > 1) throw new Error(this.ambiguousMsg(identifier, byEmail));

    const byName = identities.filter((i) => (i.displayName || '').toLowerCase() === needle);
    if (byName.length === 1) return byName[0].id;
    if (byName.length > 1) throw new Error(this.ambiguousMsg(identifier, byName));

    throw new Error(
      `No team member matching '${identifier}'. Provide an identity GUID, or a display name/email of a team member. ` +
      `Team members: ${this.candidateList(identities) || '(none)'}`
    );
  }

  private candidateList(identities: any[]): string {
    return identities.map((i) => `${i.displayName} <${i.uniqueName}>`).join('; ');
  }

  private ambiguousMsg(identifier: string, matches: any[]): string {
    return `Ambiguous team member '${identifier}' - matched ${matches.length}: ${this.candidateList(matches)}. Use the identity GUID to disambiguate.`;
  }

  // ---- reads ---------------------------------------------------------------

  async getIterationCapacities(project: string, team: string, iterationId: string): Promise<any> {
    this.client.validateProject(project);

    const endpoint = `${this.capacitiesBase(project, team, iterationId)}/capacities?api-version=${this.client.apiVersion}`;
    const response = await this.client.makeRequest<any>(endpoint);

    const raw = Array.isArray(response?.teamMembers)
      ? response.teamMembers
      : Array.isArray(response?.value)
        ? response.value
        : [];

    const members = raw.map((m: any) => ({
      id: m.teamMember?.id,
      displayName: m.teamMember?.displayName,
      uniqueName: m.teamMember?.uniqueName,
      activities: m.activities || [],
      daysOff: m.daysOff || [],
    }));

    return {
      project,
      team,
      iterationId,
      totalCount: members.length,
      totalCapacityPerDay: response?.totalCapacityPerDay,
      totalDaysOff: response?.totalDaysOff,
      members,
    };
  }

  async getTeamDaysOff(project: string, team: string, iterationId: string): Promise<any> {
    this.client.validateProject(project);

    const endpoint = `${this.capacitiesBase(project, team, iterationId)}/teamdaysoff?api-version=${this.client.apiVersion}`;
    const response = await this.client.makeRequest<any>(endpoint);

    return {
      project,
      team,
      iterationId,
      daysOff: response?.daysOff || [],
      daysOffEntries: (response?.daysOff || []).length,
    };
  }

  // ---- writes (full replace) ----------------------------------------------

  /** PATCH one member's capacity-per-day + days-off (full replace). */
  async setTeamMemberCapacity(
    project: string,
    team: string,
    iterationId: string,
    member: string,
    capacityPerDay: number,
    activityName: string = '',
    daysOff?: DayOff[],
  ): Promise<any> {
    this.client.validateProject(project);

    // Only hit the team-members API when we actually need to resolve a name/email.
    const teamMemberId = GUID_RE.test(member.trim())
      ? member.trim()
      : this.resolveMemberId(await this.fetchTeamMembers(project, team), member);

    return this.patchMemberCapacity(project, team, iterationId, member, teamMemberId, capacityPerDay, activityName, daysOff);
  }

  /** Set capacity for many members in one call (sequential PATCH per member - never wipes unlisted members). */
  async setTeamCapacitiesBatch(
    project: string,
    team: string,
    iterationId: string,
    entries: MemberCapacityInput[],
  ): Promise<any> {
    this.client.validateProject(project);

    if (!entries || entries.length === 0) {
      throw new Error('No member capacities supplied.');
    }

    // ceiling: resolve the roster once, then PATCH sequentially; fine for team-sized rosters.
    // Skip the roster fetch entirely when every entry is already a GUID.
    const needsResolution = entries.some((e) => !GUID_RE.test((e.member || '').trim()));
    const members = needsResolution ? await this.fetchTeamMembers(project, team) : [];

    const results: any[] = [];
    for (const entry of entries) {
      try {
        const teamMemberId = this.resolveMemberId(members, entry.member);
        const result = await this.patchMemberCapacity(
          project, team, iterationId, entry.member, teamMemberId,
          entry.capacityPerDay, entry.activityName ?? '', entry.daysOff,
        );
        results.push({ member: entry.member, status: 'ok', teamMemberId, daysOffEntries: result.daysOffEntries });
      } catch (error: any) {
        results.push({ member: entry.member, status: 'error', error: error.message });
      }
    }

    const succeeded = results.filter((r) => r.status === 'ok').length;
    return {
      project,
      team,
      iterationId,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  }

  /** PATCH the team-wide days-off collection (full replace). */
  async setTeamDaysOff(project: string, team: string, iterationId: string, daysOff?: DayOff[]): Promise<any> {
    this.client.validateProject(project);

    const normalized = this.normalizeDaysOff(daysOff);
    const endpoint = `${this.capacitiesBase(project, team, iterationId)}/teamdaysoff?api-version=${this.client.apiVersion}`;
    const response = await this.client.makeRequest<any>(endpoint, 'PATCH', { daysOff: normalized }, undefined, 'application/json');

    return {
      project,
      team,
      iterationId,
      daysOff: response?.daysOff ?? normalized,
      daysOffEntries: (response?.daysOff ?? normalized).length,
    };
  }

  private async patchMemberCapacity(
    project: string,
    team: string,
    iterationId: string,
    member: string,
    teamMemberId: string,
    capacityPerDay: number,
    activityName: string,
    daysOff?: DayOff[],
  ): Promise<any> {
    const normalized = this.normalizeDaysOff(daysOff);
    const body = {
      activities: [{ capacityPerDay, name: activityName }],
      daysOff: normalized,
    };

    const endpoint = `${this.capacitiesBase(project, team, iterationId)}/capacities/${teamMemberId}?api-version=${this.client.apiVersion}`;
    const response = await this.client.makeRequest<any>(endpoint, 'PATCH', body, undefined, 'application/json');

    return {
      project,
      team,
      iterationId,
      resolvedFrom: member,
      teamMemberId,
      capacityPerDay,
      activityName,
      daysOff: normalized,
      daysOffEntries: normalized.length,
      activities: response?.activities ?? body.activities,
    };
  }
}
