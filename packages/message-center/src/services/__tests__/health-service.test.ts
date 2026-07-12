import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HealthService,
  findServiceHealth,
  matchesIssue,
  decodeIncidentReport,
} from '../health-service.js';
import type { MessageCenterClient } from '../../message-center-client.js';
import type {
  GraphServiceHealth,
  GraphServiceHealthIssue,
} from '../../models/message-center-types.js';

function issue(overrides: Partial<GraphServiceHealthIssue> = {}): GraphServiceHealthIssue {
  return {
    id: 'EX100',
    title: 'An issue',
    classification: 'incident',
    status: 'serviceRestored',
    service: 'Exchange Online',
    isResolved: true,
    lastModifiedDateTime: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

/** A stub MessageCenterClient. The service only ever touches these four members. */
function fakeClient() {
  return {
    paginate: vi.fn(),
    get: vi.fn(),
    getRaw: vi.fn(),
    enhanceError: vi.fn((e: unknown, op: string) => new Error(`enhanced: ${op}`)),
  };
}

function service(client: ReturnType<typeof fakeClient>) {
  return new HealthService(client as unknown as MessageCenterClient);
}

// ---------------------------------------------------------------------------
// matchesIssue — the casing + resolved-filter bug class
// ---------------------------------------------------------------------------

describe('matchesIssue', () => {
  it('matches a camelCase classification filter against a PascalCase wire value', () => {
    // The docs say `incident`; a live payload returns `Incident`. The source this was ported
    // from used a server-side `classification eq 'incident'`, which both no-ops AND is
    // case-sensitive — matching nothing. Here it must match.
    const wire = issue({ classification: 'Incident' });
    expect(matchesIssue(wire, { classification: 'incident' })).toBe(true);
    expect(matchesIssue(wire, { classification: 'advisory' })).toBe(false);
  });

  it('filters on the authoritative isResolved boolean, not the status text', () => {
    const resolved = issue({ isResolved: true, status: 'PostIncidentReviewPublished' });
    const active = issue({ isResolved: false, status: 'ServiceDegradation' });

    expect(matchesIssue(resolved, { isResolved: true })).toBe(true);
    expect(matchesIssue(resolved, { isResolved: false })).toBe(false);
    expect(matchesIssue(active, { isResolved: false })).toBe(true);
    expect(matchesIssue(active, { isResolved: true })).toBe(false);
  });

  it('treats a missing isResolved as unresolved (false)', () => {
    const noFlag = issue({ isResolved: undefined });
    expect(matchesIssue(noFlag, { isResolved: false })).toBe(true);
    expect(matchesIssue(noFlag, { isResolved: true })).toBe(false);
  });

  it('matches a service filter as a case-insensitive substring', () => {
    const wire = issue({ service: 'Exchange Online' });
    expect(matchesIssue(wire, { service: 'exchange' })).toBe(true);
    expect(matchesIssue(wire, { service: 'teams' })).toBe(false);
  });

  it('ANDs multiple filters together', () => {
    const wire = issue({ classification: 'Advisory', service: 'SharePoint Online', isResolved: false });
    expect(matchesIssue(wire, { classification: 'advisory', service: 'sharepoint', isResolved: false })).toBe(true);
    expect(matchesIssue(wire, { classification: 'advisory', service: 'sharepoint', isResolved: true })).toBe(false);
  });

  it('matches everything when no filter is set', () => {
    expect(matchesIssue(issue(), {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findServiceHealth
// ---------------------------------------------------------------------------

describe('findServiceHealth', () => {
  const services: GraphServiceHealth[] = [
    { id: 'Exchange', service: 'Exchange Online', status: 'serviceOperational' },
    { id: 'SharePoint', service: 'SharePoint Online', status: 'serviceDegradation' },
  ];

  it('matches by display name, case-insensitively', () => {
    expect(findServiceHealth(services, 'exchange online')?.id).toBe('Exchange');
  });

  it('matches by stable id, case-insensitively', () => {
    expect(findServiceHealth(services, 'SHAREPOINT')?.id).toBe('SharePoint');
  });

  it('returns undefined when nothing matches', () => {
    expect(findServiceHealth(services, 'Teams')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// decodeIncidentReport
// ---------------------------------------------------------------------------

describe('decodeIncidentReport', () => {
  it('decodes a UTF-8 document as text', () => {
    const report = decodeIncidentReport(Buffer.from('Root cause: a bad deploy.', 'utf-8'), 'EX100');
    expect(report).toEqual({ issueId: 'EX100', format: 'text', content: 'Root cause: a bad deploy.' });
  });

  it('falls back to base64 for a binary document rather than emitting mojibake', () => {
    const binary = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]); // NUL byte present
    const report = decodeIncidentReport(binary, 'EX100');
    expect(report.format).toBe('base64');
    expect(report.content).toBe(binary.toString('base64'));
  });
});

// ---------------------------------------------------------------------------
// HealthService.listIssues
// ---------------------------------------------------------------------------

describe('HealthService.listIssues', () => {
  let client: ReturnType<typeof fakeClient>;
  beforeEach(() => {
    client = fakeClient();
  });

  it('pushes maxResults down to the fetch when there is no filter', async () => {
    client.paginate.mockResolvedValue({ items: [issue()], truncated: true });
    const result = await service(client).listIssues({ maxResults: 1 });
    expect(client.paginate).toHaveBeenCalledWith('/admin/serviceAnnouncement/issues', 1);
    expect(result.truncated).toBe(true);
  });

  it('scans the whole collection before trimming when a filter is set', async () => {
    // The ported source appended $filter + $top server-side; Graph ignores both and returns
    // the full first page, which it then reported as the filtered total. Here the filter is
    // client-side over every fetched row, and truncated is honest.
    client.paginate.mockResolvedValue({
      items: [
        issue({ id: '1', isResolved: false }),
        issue({ id: '2', isResolved: false }),
        issue({ id: '3', isResolved: false }),
      ],
      truncated: false,
    });

    const result = await service(client).listIssues({ isResolved: false, maxResults: 2 });

    expect(client.paginate).toHaveBeenCalledWith('/admin/serviceAnnouncement/issues', undefined);
    expect(result.issues).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('does not report truncation when the filtered set fits inside maxResults', async () => {
    client.paginate.mockResolvedValue({
      items: [issue({ id: '1', isResolved: false }), issue({ id: '2', isResolved: true })],
      truncated: false,
    });
    const result = await service(client).listIssues({ isResolved: false, maxResults: 5 });
    expect(result.issues.map((i) => i.id)).toEqual(['1']);
    expect(result.truncated).toBe(false);
  });

  it('orders results newest-first client-side', async () => {
    client.paginate.mockResolvedValue({
      items: [
        issue({ id: 'old', lastModifiedDateTime: '2026-01-01T00:00:00Z' }),
        issue({ id: 'new', lastModifiedDateTime: '2026-06-01T00:00:00Z' }),
      ],
      truncated: false,
    });
    const result = await service(client).listIssues({});
    expect(result.issues.map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('surfaces a Graph failure through enhanceError', async () => {
    client.paginate.mockRejectedValue({ statusCode: 403, message: 'Forbidden' });
    await expect(service(client).listIssues({})).rejects.toThrow(/enhanced/);
    expect(client.enhanceError).toHaveBeenCalledWith(expect.anything(), 'listing service health issues');
  });
});

// ---------------------------------------------------------------------------
// HealthService.getServiceHealth
// ---------------------------------------------------------------------------

describe('HealthService.getServiceHealth', () => {
  let client: ReturnType<typeof fakeClient>;
  beforeEach(() => {
    client = fakeClient();
  });

  it('resolves the service case-insensitively and expands issues', async () => {
    client.get.mockResolvedValue({
      value: [{ id: 'Exchange', service: 'Exchange Online', status: 'serviceOperational', issues: [] }],
    });
    const result = await service(client).getServiceHealth('EXCHANGE online');
    expect(client.get).toHaveBeenCalledWith('/admin/serviceAnnouncement/healthOverviews', ['issues']);
    expect(result.id).toBe('Exchange');
  });

  it('throws with the list of available services when the name does not match', async () => {
    client.get.mockResolvedValue({
      value: [{ id: 'Exchange', service: 'Exchange Online' }, { id: 'SharePoint', service: 'SharePoint Online' }],
    });
    await expect(service(client).getServiceHealth('Teams')).rejects.toThrow(
      /Service not found: 'Teams'. Available services: Exchange Online, SharePoint Online/
    );
  });
});

// ---------------------------------------------------------------------------
// HealthService.getIssue / getIncidentReport — ID validation
// ---------------------------------------------------------------------------

describe('HealthService ID validation', () => {
  let client: ReturnType<typeof fakeClient>;
  beforeEach(() => {
    client = fakeClient();
  });

  it('rejects a malformed issue ID before any Graph call', async () => {
    await expect(service(client).getIssue('EX100/../messages/MC1')).rejects.toThrow(
      /must be a service-announcement ID/
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it('fetches a valid issue by ID', async () => {
    client.get.mockResolvedValue(issue({ id: 'EX226792' }));
    const result = await service(client).getIssue('EX226792');
    expect(client.get).toHaveBeenCalledWith('/admin/serviceAnnouncement/issues/EX226792');
    expect(result.id).toBe('EX226792');
  });

  it('rejects a malformed issue ID before requesting an incident report', async () => {
    await expect(service(client).getIncidentReport("EX' or 1=1")).rejects.toThrow(
      /must be a service-announcement ID/
    );
    expect(client.getRaw).not.toHaveBeenCalled();
  });

  it('decodes the incident report for a valid issue', async () => {
    client.getRaw.mockResolvedValue(Buffer.from('PIR text', 'utf-8'));
    const report = await service(client).getIncidentReport('EX226792');
    expect(client.getRaw).toHaveBeenCalledWith('/admin/serviceAnnouncement/issues/EX226792/incidentReport');
    expect(report).toEqual({ issueId: 'EX226792', format: 'text', content: 'PIR text' });
  });

  it('surfaces a missing-PIR error through enhanceError', async () => {
    client.getRaw.mockRejectedValue({ statusCode: 404, message: 'not found' });
    await expect(service(client).getIncidentReport('EX226792')).rejects.toThrow(/enhanced/);
    expect(client.enhanceError).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('postIncidentReviewPublished')
    );
  });
});
