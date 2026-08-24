import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageService, matchesMessage } from '../message-service.js';
import type { MessageCenterClient } from '../../message-center-client.js';
import type { GraphServiceUpdateMessage } from '../../models/message-center-types.js';

function message(overrides: Partial<GraphServiceUpdateMessage> = {}): GraphServiceUpdateMessage {
  return {
    id: 'MC100',
    title: 'A message',
    category: 'stayInformed',
    severity: 'normal',
    isMajorChange: false,
    services: ['Exchange Online'],
    lastModifiedDateTime: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function fakeClient() {
  return {
    paginate: vi.fn(),
    get: vi.fn(),
    getRaw: vi.fn(),
    enhanceError: vi.fn((e: unknown, op: string) => new Error(`enhanced: ${op}`)),
  };
}

function service(client: ReturnType<typeof fakeClient>) {
  return new MessageService(client as unknown as MessageCenterClient);
}

// ---------------------------------------------------------------------------
// matchesMessage - casing + services[] substring
// ---------------------------------------------------------------------------

describe('matchesMessage', () => {
  it('matches camelCase category/severity filters against PascalCase wire values', () => {
    const wire = message({ category: 'PlanForChange', severity: 'High' });
    expect(matchesMessage(wire, { category: 'planForChange' })).toBe(true);
    expect(matchesMessage(wire, { severity: 'high' })).toBe(true);
    expect(matchesMessage(wire, { category: 'stayInformed' })).toBe(false);
  });

  it('matches a service filter against any entry in services[], case-insensitively', () => {
    const wire = message({ services: ['SharePoint Online', 'OneDrive for Business'] });
    expect(matchesMessage(wire, { service: 'onedrive' })).toBe(true);
    expect(matchesMessage(wire, { service: 'teams' })).toBe(false);
  });

  it('filters on the isMajorChange boolean, treating a missing flag as false', () => {
    expect(matchesMessage(message({ isMajorChange: true }), { isMajorChange: true })).toBe(true);
    expect(matchesMessage(message({ isMajorChange: undefined }), { isMajorChange: false })).toBe(true);
    expect(matchesMessage(message({ isMajorChange: undefined }), { isMajorChange: true })).toBe(false);
  });

  it('ANDs multiple filters and matches everything when empty', () => {
    const wire = message({ category: 'PreventOrFixIssue', isMajorChange: true, services: ['Teams'] });
    expect(matchesMessage(wire, { category: 'preventOrFixIssue', isMajorChange: true, service: 'teams' })).toBe(true);
    expect(matchesMessage(wire, { category: 'preventOrFixIssue', isMajorChange: false })).toBe(false);
    expect(matchesMessage(message(), {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MessageService.listMessages
// ---------------------------------------------------------------------------

describe('MessageService.listMessages', () => {
  let client: ReturnType<typeof fakeClient>;
  beforeEach(() => {
    client = fakeClient();
  });

  it('scans all messages before trimming when a filter is set, and reports truncation honestly', async () => {
    client.paginate.mockResolvedValue({
      items: [
        message({ id: '1', category: 'PlanForChange' }),
        message({ id: '2', category: 'PlanForChange' }),
        message({ id: '3', category: 'StayInformed' }),
      ],
      truncated: false,
    });

    const result = await service(client).listMessages({ category: 'planForChange', maxResults: 1 });

    expect(client.paginate).toHaveBeenCalledWith('/admin/serviceAnnouncement/messages', undefined);
    expect(result.total).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('pushes maxResults to the fetch when unfiltered', async () => {
    client.paginate.mockResolvedValue({ items: [message()], truncated: true });
    const result = await service(client).listMessages({ maxResults: 1 });
    expect(client.paginate).toHaveBeenCalledWith('/admin/serviceAnnouncement/messages', 1);
    expect(result.truncated).toBe(true);
  });

  it('orders newest-first', async () => {
    client.paginate.mockResolvedValue({
      items: [
        message({ id: 'old', lastModifiedDateTime: '2026-01-01T00:00:00Z' }),
        message({ id: 'new', lastModifiedDateTime: '2026-09-01T00:00:00Z' }),
      ],
      truncated: false,
    });
    const result = await service(client).listMessages({});
    expect(result.messages.map((m) => m.id)).toEqual(['new', 'old']);
  });

  it('surfaces a Graph failure through enhanceError', async () => {
    client.paginate.mockRejectedValue({ statusCode: 401, message: 'Unauthorized' });
    await expect(service(client).listMessages({})).rejects.toThrow(/enhanced/);
    expect(client.enhanceError).toHaveBeenCalledWith(expect.anything(), 'listing message center messages');
  });
});

// ---------------------------------------------------------------------------
// MessageService.getMessage - ID validation
// ---------------------------------------------------------------------------

describe('MessageService.getMessage', () => {
  let client: ReturnType<typeof fakeClient>;
  beforeEach(() => {
    client = fakeClient();
  });

  it('rejects a malformed message ID before any Graph call', async () => {
    await expect(service(client).getMessage('MC1/../issues/EX1')).rejects.toThrow(
      /must be a service-announcement ID/
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it('fetches a valid message by ID', async () => {
    client.get.mockResolvedValue(message({ id: 'MC172851' }));
    const result = await service(client).getMessage('MC172851');
    expect(client.get).toHaveBeenCalledWith('/admin/serviceAnnouncement/messages/MC172851');
    expect(result.id).toBe('MC172851');
  });
});
