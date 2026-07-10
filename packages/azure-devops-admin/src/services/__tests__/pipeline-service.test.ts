import { describe, it, expect } from 'vitest';
import { PipelineService } from '../pipeline-service.js';

interface StubOptions {
  definitions?: any[];
  definitionById?: any;
  builds?: any[];
  timelines?: Record<number, any[]>;
  latestBuildByDefinition?: Record<number, any>;
}

function stubClient(options: StubOptions) {
  const calls: string[] = [];
  return {
    calls,
    apiVersion: '7.1',
    validateProject: () => {},
    makeRequest: async (endpoint: string) => {
      calls.push(endpoint);

      const byIdMatch = endpoint.match(/_apis\/build\/definitions\/(\d+)\?/);
      if (byIdMatch) return options.definitionById;

      if (endpoint.includes('_apis/build/definitions?')) {
        return { value: options.definitions ?? [] };
      }

      const timelineMatch = endpoint.match(/builds\/(\d+)\/timeline/);
      if (timelineMatch) {
        return { records: options.timelines?.[Number(timelineMatch[1])] ?? [] };
      }

      const buildsMatch = endpoint.match(/_apis\/build\/builds\?definitions=(\d+)/);
      if (buildsMatch) {
        if (endpoint.includes('$top=1&')) {
          const latest = options.latestBuildByDefinition?.[Number(buildsMatch[1])];
          return { value: latest ? [latest] : [] };
        }
        return { value: options.builds ?? [] };
      }

      throw new Error(`unexpected endpoint: ${endpoint}`);
    },
  } as any;
}

const stage = (name: string, result: string) => ({ type: 'Stage', name, result, finishTime: `${name}-time` });

describe('getLastDeploys', () => {
  const definitions = [{ id: 7, name: 'Deploy Pipeline' }];
  const builds = [
    { id: 200, buildNumber: '200', finishTime: 'b200', sourceBranch: 'refs/heads/main', templateParameters: { env: 'blue' } },
    { id: 100, buildNumber: '100', finishTime: 'b100', sourceBranch: 'refs/heads/main', templateParameters: { env: 'green' } },
  ];

  it('finds the newest successful build per stage, walking builds newest-first', async () => {
    const client = stubClient({
      definitions,
      builds,
      timelines: {
        200: [stage('Dev', 'succeeded'), stage('Prod', 'failed')],
        100: [stage('Dev', 'succeeded'), stage('Prod', 'succeeded')],
      },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
      stages: ['Dev', 'Prod'],
    });

    expect(result.stages.Dev).toMatchObject({ found: true, buildId: 200 });
    expect(result.stages.Prod).toMatchObject({ found: true, buildId: 100, stageResult: 'succeeded' });
    expect(result.stagesNotFound).toEqual([]);
    expect(result.buildsSearched).toBe(2);
  });

  it('matches a stage name regardless of case', async () => {
    const client = stubClient({
      definitions,
      builds: [builds[0]],
      timelines: { 200: [stage('Prod', 'succeeded')] },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
      stages: ['prod'],
    });

    expect(result.stages.prod).toMatchObject({ found: true, buildId: 200 });
  });

  it('accepts succeededWithIssues as a deploy and reports which result it was', async () => {
    const client = stubClient({
      definitions,
      builds: [builds[0]],
      timelines: { 200: [stage('Dev', 'succeededWithIssues')] },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
      stages: ['Dev'],
    });

    expect(result.stages.Dev).toMatchObject({ found: true, stageResult: 'succeededWithIssues' });
  });

  it('surfaces the stage names it actually saw, so a typo is diagnosable', async () => {
    const client = stubClient({
      definitions,
      builds: [builds[0]],
      timelines: { 200: [stage('Development', 'succeeded'), stage('Production', 'succeeded')] },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
      stages: ['Dev'],
    });

    expect(result.stages.Dev).toEqual({ found: false });
    expect(result.stagesNotFound).toEqual(['Dev']);
    expect(result.availableStageNames).toEqual(['Development', 'Production']);
    expect(result.noStageRecordsFound).toBe(false);
  });

  it('flags a pipeline whose timelines carry no Stage records at all', async () => {
    const client = stubClient({
      definitions,
      builds: [builds[0]],
      timelines: { 200: [{ type: 'Job', name: 'Build', result: 'succeeded' }] },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
    });

    expect(result.noStageRecordsFound).toBe(true);
    expect(result.availableStageNames).toEqual([]);
  });

  it('warns that older builds exist when the search window filled up', async () => {
    const client = stubClient({
      definitions,
      builds,
      timelines: { 200: [], 100: [] },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
      stages: ['Dev'],
      searchTop: 2,
    });

    expect(result.searchWindowFull).toBe(true);
  });

  it('stops scanning as soon as every stage is found', async () => {
    const client = stubClient({
      definitions,
      builds,
      timelines: { 200: [stage('Dev', 'succeeded')], 100: [stage('Dev', 'succeeded')] },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
      stages: ['Dev'],
    });

    expect(result.buildsSearched).toBe(1);
  });

  it('surfaces templateParameters and the requested parameter value', async () => {
    const client = stubClient({
      definitions,
      builds: [builds[0]],
      timelines: { 200: [stage('Dev', 'succeeded')] },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
      stages: ['Dev'],
      templateParameter: 'env',
    });

    expect(result.stages.Dev.templateParameters).toEqual({ env: 'blue' });
    expect(result.stages.Dev.paramValue).toBe('blue');
  });

  it('returns a null paramValue when the parameter is absent', async () => {
    const client = stubClient({
      definitions,
      builds: [{ ...builds[0], templateParameters: {} }],
      timelines: { 200: [stage('Dev', 'succeeded')] },
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'Deploy Pipeline',
      stages: ['Dev'],
      templateParameter: 'missing',
    });

    expect(result.stages.Dev.paramValue).toBeNull();
  });

  it('resolves a pipeline name case-insensitively', async () => {
    const client = stubClient({
      definitions: [{ id: 7, name: 'Deploy Pipeline' }],
      builds: [],
      timelines: {},
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineName: 'deploy pipeline',
    });

    expect(result.pipelineId).toBe(7);
  });

  it('names similar pipelines when the name does not match', async () => {
    const client = stubClient({ definitions: [{ id: 1, name: 'Other Pipeline' }] });

    await expect(
      new PipelineService(client).getLastDeploys('MyProject', { pipelineName: 'Deploy' }),
    ).rejects.toThrow(/not found in project 'MyProject'. Similar pipelines: Other Pipeline/);
  });

  it('refuses an ambiguous name rather than guessing', async () => {
    const client = stubClient({
      definitions: [{ id: 1, name: 'Deploy' }, { id: 2, name: 'deploy' }],
    });

    await expect(
      new PipelineService(client).getLastDeploys('MyProject', { pipelineName: 'Deploy' }),
    ).rejects.toThrow(/ambiguous/);
  });

  it('prefers pipelineId over pipelineName', async () => {
    const client = stubClient({
      definitionById: { id: 42, name: 'By Id' },
      builds: [],
      timelines: {},
    });

    const result = await new PipelineService(client).getLastDeploys('MyProject', {
      pipelineId: 42,
      pipelineName: 'ignored',
    });

    expect(result.pipelineId).toBe(42);
    expect(result.pipelineName).toBe('By Id');
  });

  it('requires one of pipelineId or pipelineName', async () => {
    const client = stubClient({});
    await expect(
      new PipelineService(client).getLastDeploys('MyProject', {}),
    ).rejects.toThrow(/Provide either pipelineId or pipelineName/);
  });
});

describe('getPipelineSummaries', () => {
  it('reports a breakdown whose counts add up to the pipeline count', async () => {
    const client = stubClient({
      definitions: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ],
      latestBuildByDefinition: {
        1: { id: 11, result: 'succeeded' },
        2: { id: 22, result: 'partiallySucceeded' },
        // 3 has never built.
      },
    });

    const result = await new PipelineService(client).getPipelineSummaries('MyProject');

    expect(result.pipelineCount).toBe(3);
    expect(result.resultBreakdown).toMatchObject({
      succeeded: 1,
      partiallySucceeded: 1,
      noBuilds: 1,
    });
    const total = Object.values(result.resultBreakdown).reduce((a: any, b: any) => a + b, 0);
    expect(total).toBe(3);
  });

  it('filters by name and reports truncation honestly', async () => {
    const client = stubClient({
      definitions: [
        { id: 1, name: 'deploy-api' },
        { id: 2, name: 'deploy-web' },
        { id: 3, name: 'build-lib' },
      ],
      latestBuildByDefinition: { 1: { id: 11, result: 'succeeded' }, 2: { id: 22, result: 'failed' } },
    });

    const result = await new PipelineService(client).getPipelineSummaries('MyProject', {
      nameContains: 'DEPLOY',
      maxResults: 1,
    });

    expect(result.pipelineCount).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('marks a pipeline with no builds as latestBuild null', async () => {
    const client = stubClient({ definitions: [{ id: 1, name: 'A' }], latestBuildByDefinition: {} });

    const result = await new PipelineService(client).getPipelineSummaries('MyProject');

    expect(result.pipelines[0].latestBuild).toBeNull();
    expect(result.resultBreakdown.noBuilds).toBe(1);
  });
});
