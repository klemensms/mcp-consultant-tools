import { describe, it, expect } from 'vitest';
import { ListService } from '../services/list-service.js';
import { fakeGraph } from './fake-graph.js';

const ROOT = { id: 'ROOT', name: 'root', folder: { childCount: 0 } };

function listService(responses: Record<string, unknown>) {
  const graph = fakeGraph(responses);
  const spo = {
    getSiteById: () => ({ id: 'site', name: 'Example' }),
    getAuthenticatedGraphClient: async () => graph.client,
    handleError: (error: any) => error,
    sanitizeErrorMessage: (error: any) => String(error?.message ?? error),
  };
  return { service: new ListService(spo as any), calls: graph.calls };
}

describe('getItemByPath', () => {
  it.each(['/', '', '//'])('addresses the drive root as /root, not root:/ (path %j)', async (path) => {
    const { service, calls } = listService({ '/drives/D/root': ROOT });
    const item = await service.getItemByPath('site', 'D', path);
    expect(calls.map((c) => c.path)).toEqual(['/drives/D/root']);
    expect(item.id).toBe('ROOT');
  });

  it('addresses a nested path with root:', async () => {
    const { service, calls } = listService({ '/drives/D/root:/Shared/Plan.docx': { id: 'X', name: 'Plan.docx', file: {} } });
    await service.getItemByPath('site', 'D', 'Shared/Plan.docx');
    expect(calls[0].path).toBe('/drives/D/root:/Shared/Plan.docx');
  });
});
