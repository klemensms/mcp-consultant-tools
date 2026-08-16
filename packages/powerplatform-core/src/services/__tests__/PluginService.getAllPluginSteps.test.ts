import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginService } from '../PluginService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const makeRequest = vi.fn();
const service = new PluginService({ makeRequest } as unknown as PowerPlatformClient);

const rawStep = (overrides: Record<string, unknown> = {}) => ({
  sdkmessageprocessingstepid: '11111111-1111-1111-1111-111111111111',
  name: 'Sample.Plugin: Create of account',
  stage: 20,
  mode: 0,
  rank: 1,
  statuscode: 1,
  filteringattributes: 'name,telephone1',
  ismanaged: false,
  modifiedon: '2026-01-15T09:00:00Z',
  sdkmessageid: { name: 'Create' },
  plugintypeid: { typename: 'Sample.Plugin', assemblyname: 'Sample.Plugins' },
  ...overrides,
});

const url = () => makeRequest.mock.calls[0][0] as string;
const prefer = () => makeRequest.mock.calls[0][3] as Record<string, string>;

describe('PluginService.getAllPluginSteps', () => {
  beforeEach(() => {
    makeRequest.mockReset();
    makeRequest.mockResolvedValue({ value: [] });
  });

  it('includes disabled steps by default, and fetches every step rather than a page', async () => {
    await service.getAllPluginSteps();

    expect(url()).toContain('$filter=ishidden/Value eq false');
    expect(url()).not.toContain('statuscode eq 1');
    // No $top: Dataverse returns no continuation token for a $top-capped query, so a
    // $top result cannot tell a capped set from a complete one.
    expect(url()).not.toContain('$top');
    expect(prefer()).toEqual({ Prefer: 'odata.maxpagesize=5000' });
  });

  it('filters to enabled steps only when includeDisabled is false', async () => {
    await service.getAllPluginSteps({ includeDisabled: false });

    expect(url()).toContain('$filter=statuscode eq 1 and ishidden/Value eq false');
  });

  it('honours maxRecords', async () => {
    await service.getAllPluginSteps({ maxRecords: 25 });

    expect(prefer()).toEqual({ Prefer: 'odata.maxpagesize=25' });
  });

  it('a capped run is distinguishable from a complete one at the same totalCount', async () => {
    // The D2 shape: 500 of 2,637 steps returned as `{ totalCount: 500 }` and nothing else.
    makeRequest.mockResolvedValue({
      value: Array.from({ length: 500 }, () => rawStep()),
      '@odata.nextLink': 'https://mcptests.crm4.dynamics.com/api/data/v9.2/sdkmessageprocessingsteps?$skiptoken=500',
    });

    const capped = await service.getAllPluginSteps({ maxRecords: 500 });

    expect(capped.totalCount).toBe(500);
    expect(capped.truncation.hasMore).toBe(true);
    expect(capped.truncation.totalAvailable).toBeNull();
    expect(capped.truncation.requestedMax).toBe(500);
  });

  it('reports an exact total when every step was fetched', async () => {
    makeRequest.mockResolvedValue({
      value: Array.from({ length: 3 }, () => rawStep()),
    });

    const result = await service.getAllPluginSteps();

    expect(result.truncation.hasMore).toBe(false);
    expect(result.truncation.totalAvailable).toBe(3);
    expect(result.truncation.requestedMax).toBeNull();
  });

  it('expands the message and plugin-type names the inventory shape depends on', async () => {
    await service.getAllPluginSteps();

    expect(url()).toContain('$expand=sdkmessageid($select=name),plugintypeid($select=typename,assemblyname)');
  });

  it('maps a step onto the inventory shape', async () => {
    makeRequest.mockResolvedValue({ value: [rawStep()] });

    const result = await service.getAllPluginSteps();

    expect(result.totalCount).toBe(1);
    expect(result.steps[0]).toEqual({
      stepId: '11111111-1111-1111-1111-111111111111',
      name: 'Sample.Plugin: Create of account',
      messageName: 'Create',
      stage: 20,
      stageName: 'PreOperation',
      mode: 0,
      modeName: 'Synchronous',
      statuscode: 1,
      enabled: true,
      rank: 1,
      filteringAttributes: 'name,telephone1',
      pluginTypeName: 'Sample.Plugin',
      assemblyName: 'Sample.Plugins',
      isManaged: false,
      modifiedOn: '2026-01-15T09:00:00Z',
    });
  });

  it('splits enabled from disabled on statuscode', async () => {
    makeRequest.mockResolvedValue({
      value: [rawStep({ statuscode: 1 }), rawStep({ statuscode: 2 })],
    });

    const result = await service.getAllPluginSteps();

    expect(result.totalCount).toBe(2);
    expect(result.steps.map((s) => s.enabled)).toEqual([true, false]);
  });

  it('names each pipeline stage', async () => {
    makeRequest.mockResolvedValue({
      value: [rawStep({ stage: 10 }), rawStep({ stage: 20 }), rawStep({ stage: 40 })],
    });

    const result = await service.getAllPluginSteps();

    expect(result.steps.map((s) => s.stageName)).toEqual([
      'PreValidation',
      'PreOperation',
      'PostOperation',
    ]);
  });

  it('names asynchronous mode', async () => {
    makeRequest.mockResolvedValue({ value: [rawStep({ mode: 1 })] });

    const result = await service.getAllPluginSteps();

    expect(result.steps[0].modeName).toBe('Asynchronous');
  });

  it('degrades missing expands rather than throwing', async () => {
    makeRequest.mockResolvedValue({
      value: [
        rawStep({ sdkmessageid: null, plugintypeid: null, filteringattributes: null }),
      ],
    });

    const result = await service.getAllPluginSteps();

    expect(result.steps[0].messageName).toBe('Unknown');
    expect(result.steps[0].pluginTypeName).toBeNull();
    expect(result.steps[0].assemblyName).toBeNull();
    expect(result.steps[0].filteringAttributes).toBeNull();
  });
});
