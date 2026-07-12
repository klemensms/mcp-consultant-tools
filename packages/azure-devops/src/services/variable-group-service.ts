/**
 * Variable Group Service - Azure DevOps variable group operations
 */
import type { AzureDevOpsClient } from '../azure-devops-client.js';
import type { AdoApiCollectionResponse } from '../models/index.js';
import {
  compareVariables,
  parseEnvironment,
  summariseVariables,
  DEFAULT_ENVIRONMENT_SUFFIXES,
  type RawVariableGroup,
  type VariableGroupComparison,
} from './variable-group-compare.js';

export class VariableGroupService {
  constructor(private readonly client: AzureDevOpsClient) {}

  /**
   * Fetch a group exactly as Azure DevOps returned it.
   *
   * `getVariableGroup` below masks every secret to the literal '***SECRET***'.
   * Comparing masked values would make any two secrets look identical, so the
   * comparison tools read the raw payload and branch on `isSecret` instead.
   */
  private async fetchRawGroup(project: string, groupId: number): Promise<RawVariableGroup> {
    return this.client.get<RawVariableGroup>(
      `${project}/_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`
    );
  }

  private async fetchRawGroups(project: string): Promise<RawVariableGroup[]> {
    const response = await this.client.get<AdoApiCollectionResponse<RawVariableGroup>>(
      `${project}/_apis/distributedtask/variablegroups?api-version=${this.client.apiVersion}`
    );
    return response.value ?? [];
  }

  async getVariableGroups(project: string): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<AdoApiCollectionResponse<any>>(
      `${project}/_apis/distributedtask/variablegroups?api-version=${this.client.apiVersion}`
    );

    return {
      project,
      totalCount: response.value.length,
      variableGroups: response.value.map((group: any) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        type: group.type,
        createdBy: group.createdBy?.displayName,
        createdOn: group.createdOn,
        modifiedBy: group.modifiedBy?.displayName,
        modifiedOn: group.modifiedOn,
        isShared: group.isShared,
        variableGroupProjectReferences: group.variableGroupProjectReferences,
        variables: Object.keys(group.variables || {}).reduce((acc: any, key: string) => {
          const variable = group.variables[key];
          acc[key] = {
            value: variable.isSecret ? '***SECRET***' : variable.value,
            isSecret: variable.isSecret || false,
            isReadOnly: variable.isReadOnly || false
          };
          return acc;
        }, {})
      }))
    };
  }

  async getVariableGroup(project: string, groupId: number): Promise<any> {
    this.client.validateProject(project);

    const response = await this.client.get<any>(
      `${project}/_apis/distributedtask/variablegroups/${groupId}?api-version=${this.client.apiVersion}`
    );

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      type: response.type,
      createdBy: response.createdBy?.displayName,
      createdOn: response.createdOn,
      modifiedBy: response.modifiedBy?.displayName,
      modifiedOn: response.modifiedOn,
      isShared: response.isShared,
      variableGroupProjectReferences: response.variableGroupProjectReferences,
      project,
      variables: Object.keys(response.variables || {}).reduce((acc: any, key: string) => {
        const variable = response.variables[key];
        acc[key] = {
          value: variable.isSecret ? '***SECRET***' : variable.value,
          isSecret: variable.isSecret || false,
          isReadOnly: variable.isReadOnly || false
        };
        return acc;
      }, {})
    };
  }

  /** Side-by-side diff of two variable groups. Secret values are never read or emitted. */
  async compareVariableGroups(
    project: string,
    groupIdA: number,
    groupIdB: number
  ): Promise<VariableGroupComparison & { project: string }> {
    this.client.validateProject(project);

    const [groupA, groupB] = await Promise.all([
      this.fetchRawGroup(project, groupIdA),
      this.fetchRawGroup(project, groupIdB),
    ]);

    return { project, ...compareVariables(groupA, groupB) };
  }

  /**
   * Detect `<base>-<env>` variable-group families and diff each environment
   * against the first one in the family.
   *
   * Reports what it could NOT classify (`unmatchedGroups`) and families with a
   * single environment (`incompleteSets`), so an empty result is explainable
   * rather than looking like "nothing has drifted".
   */
  async compareEnvironments(
    project: string,
    options?: { nameContains?: string; environmentSuffixes?: string[] }
  ): Promise<any> {
    this.client.validateProject(project);

    const suffixes = options?.environmentSuffixes?.length
      ? options.environmentSuffixes
      : [...DEFAULT_ENVIRONMENT_SUFFIXES];

    const needle = options?.nameContains?.toLowerCase();
    const groups = (await this.fetchRawGroups(project)).filter(
      (group) => !needle || group.name.toLowerCase().includes(needle)
    );

    const families = new Map<string, Array<{ environment: string; group: RawVariableGroup }>>();
    const unmatchedGroups: string[] = [];

    for (const group of groups) {
      const parsed = parseEnvironment(group.name, suffixes);
      if (!parsed) {
        unmatchedGroups.push(group.name);
        continue;
      }
      const key = parsed.baseName.toLowerCase();
      const family = families.get(key) ?? [];
      family.push({ environment: parsed.environment, group });
      families.set(key, family);
    }

    const environmentSets: any[] = [];
    const incompleteSets: any[] = [];

    for (const [baseName, members] of families) {
      members.sort((x, y) => x.environment.localeCompare(y.environment));
      const environments = members.map((m) => ({
        environment: m.environment,
        group: { id: m.group.id, name: m.group.name },
      }));

      if (members.length < 2) {
        incompleteSets.push({ baseName, environments });
        continue;
      }

      // Diff every environment against the first, so N environments yield N-1
      // comparisons anchored on a single baseline.
      const baseline = members[0];
      const comparisons = members
        .slice(1)
        .map((member) => compareVariables(baseline.group, member.group));

      environmentSets.push({ baseName, environments, comparisons });
    }

    return {
      project,
      environmentSuffixes: suffixes,
      groupsScanned: groups.length,
      environmentSetCount: environmentSets.length,
      environmentSets,
      incompleteSets,
      unmatchedGroups,
    };
  }

  /** Overview of variable groups with variable/secret counts. Secret values are never read. */
  async getVariableGroupSummaries(
    project: string,
    options?: { nameContains?: string; maxResults?: number }
  ): Promise<any> {
    this.client.validateProject(project);

    const maxResults = options?.maxResults ?? 100;
    const needle = options?.nameContains?.toLowerCase();

    const matched = (await this.fetchRawGroups(project)).filter(
      (group) => !needle || group.name.toLowerCase().includes(needle)
    );

    const returned = matched.slice(0, maxResults);
    const summaries = returned.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      description: group.description,
      isShared: group.isShared ?? false,
      modifiedOn: group.modifiedOn,
      ...summariseVariables(group.variables),
    }));

    return {
      project,
      groupCount: summaries.length,
      truncated: matched.length > returned.length,
      // Totals describe exactly the groups returned, never a wider population.
      totals: {
        variableCount: summaries.reduce((sum, group) => sum + group.variableCount, 0),
        secretCount: summaries.reduce((sum, group) => sum + group.secretCount, 0),
      },
      variableGroups: summaries,
    };
  }
}
