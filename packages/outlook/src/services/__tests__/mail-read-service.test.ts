/**
 * MailReadService tests.
 *
 * The failure modes pinned here:
 *   - $search on messages cannot be combined with $orderby or $filter; Graph
 *     rejects the request. The absence of both is asserted, not just the
 *     presence of $search.
 *   - When $filter and $orderby are used together on messages, every property
 *     in $orderby must also appear in $filter, first and in the same order, or
 *     Graph answers "The restriction or sort order is too complex". So any
 *     filtered list leads with a receivedDateTime clause.
 *   - A conversation read sorts client side: the same restriction makes
 *     conversationId eq ... plus $orderby=receivedDateTime fail.
 *   - Query values are asserted after URL decoding, so a "+" in a plus-address
 *     or an "&" in search text must survive the trip as themselves.
 */
import { describe, it, expect } from 'vitest';
import { MailReadService } from '../mail-read-service.js';
import { recordingGraph, graphError } from '../../__tests__/graph-recorder.js';
import type { RecordedRequest } from '../../__tests__/graph-recorder.js';

const SUMMARY_SELECT = 'id,conversationId,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview,webLink';

const MESSAGE = {
  id: 'AAMkAGI2TG93AAA=',
  conversationId: 'AAQkAGI2TG93',
  subject: 'Budget review',
  from: { emailAddress: { name: 'Jane Doe', address: 'jdoe@example.com' } },
  receivedDateTime: '2026-09-01T10:00:00Z',
  isRead: false,
  hasAttachments: true,
  bodyPreview: 'Please see the attached budget.',
  webLink: 'https://outlook.office365.com/owa/?ItemID=AAMkAGI2TG93AAA%3D',
};

function service(respond: (r: RecordedRequest) => unknown = () => ({ value: [MESSAGE] })) {
  const graph = recordingGraph(respond);
  const svc = new MailReadService({ getGraphClient: () => graph.client }, { downloadDir: '/tmp/unused' });
  return { svc, requests: graph.requests };
}

describe('listMessages', () => {
  it('reads the inbox by default, newest first, with the summary fields and 20 results', async () => {
    const { svc, requests } = service();
    await svc.listMessages({});
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].path).toBe('/me/mailFolders/inbox/messages');
    expect(requests[0].query).toEqual({
      $select: SUMMARY_SELECT,
      $top: '20',
      $orderby: 'receivedDateTime desc',
    });
  });

  it('caps $top at 50', async () => {
    const { svc, requests } = service();
    await svc.listMessages({ top: 500 });
    await svc.listMessages({ top: 5 });
    expect(requests[0].query.$top).toBe('50');
    expect(requests[1].query.$top).toBe('5');
  });

  it('reads a named folder', async () => {
    const { svc, requests } = service();
    await svc.listMessages({ folder: 'archive' });
    expect(requests[0].path).toBe('/me/mailFolders/archive/messages');
  });

  it('combines every filter into one $filter led by receivedDateTime', async () => {
    const { svc, requests } = service();
    await svc.listMessages({
      unreadOnly: true,
      from: 'jdoe@example.com',
      since: '2026-09-01',
      until: '2026-09-15T12:00:00Z',
      hasAttachments: true,
    });
    expect(requests[0].query.$filter).toBe(
      'receivedDateTime ge 2026-09-01T00:00:00.000Z and receivedDateTime le 2026-09-15T12:00:00.000Z' +
        " and isRead eq false and from/emailAddress/address eq 'jdoe@example.com' and hasAttachments eq true"
    );
    expect(requests[0].query.$orderby).toBe('receivedDateTime desc');
  });

  it('adds an open receivedDateTime clause when filtering without a date, so the sort is accepted', async () => {
    const { svc, requests } = service();
    await svc.listMessages({ unreadOnly: true });
    expect(requests[0].query.$filter).toBe('receivedDateTime ge 1900-01-01T00:00:00Z and isRead eq false');
  });

  it('escapes a single quote and keeps a plus-address intact', async () => {
    const { svc, requests } = service();
    await svc.listMessages({ from: "o'brien+news@example.com" });
    expect(requests[0].query.$filter).toContain("from/emailAddress/address eq 'o''brien+news@example.com'");
  });

  it('rejects an unreadable date before calling Graph', async () => {
    const { svc, requests } = service();
    await expect(svc.listMessages({ since: 'last tuesday' })).rejects.toThrow(/since/);
    expect(requests).toHaveLength(0);
  });

  it('maps a message to a summary', async () => {
    const { svc } = service();
    const [summary] = await svc.listMessages({});
    expect(summary).toEqual({
      id: MESSAGE.id,
      conversationId: MESSAGE.conversationId,
      subject: 'Budget review',
      from: 'Jane Doe <jdoe@example.com>',
      receivedDateTime: '2026-09-01T10:00:00Z',
      isRead: false,
      hasAttachments: true,
      preview: 'Please see the attached budget.',
      webLink: MESSAGE.webLink,
    });
  });

  it('turns a 403 into a message naming the permission and saying an administrator grants it', async () => {
    const { svc } = service(() => graphError(403, 'ErrorAccessDenied', 'Access is denied.'));
    const error = await svc.listMessages({}).catch((e) => e);
    expect(error.message).toMatch(/Mail\.Read/);
    expect(error.message).toMatch(/administrator/i);
    expect(error.message).toMatch(/app registration/i);
    expect(error.message).toMatch(/signing in again does not/i);
  });
});

describe('searchMessages', () => {
  it('sends $search in double quotes and never $orderby or $filter', async () => {
    const { svc, requests } = service();
    await svc.searchMessages('budget report');
    expect(requests[0].path).toBe('/me/messages');
    expect(requests[0].query.$search).toBe('"budget report"');
    expect(requests[0].query).not.toHaveProperty('$orderby');
    expect(requests[0].query).not.toHaveProperty('$filter');
    expect(requests[0].query.$select).toBe(SUMMARY_SELECT);
    expect(requests[0].query.$top).toBe('20');
  });

  it('keeps an ampersand in the search text and escapes an inner double quote', async () => {
    const { svc, requests } = service();
    await svc.searchMessages('R&D subject:"plan"');
    expect(requests[0].query.$search).toBe('"R&D subject:\\"plan\\""');
  });

  it('rejects an empty query', async () => {
    const { svc, requests } = service();
    await expect(svc.searchMessages('  ')).rejects.toThrow(/query/i);
    expect(requests).toHaveLength(0);
  });
});

const DETAIL = {
  ...MESSAGE,
  toRecipients: [{ emailAddress: { name: 'John Smith', address: 'jsmith@example.com' } }],
  ccRecipients: [{ emailAddress: { address: 'team@example.com' } }],
  body: { contentType: 'html', content: '<p>Please see <a href="https://example.com/b">the budget</a>.</p>' },
  attachments: [
    {
      '@odata.type': '#microsoft.graph.fileAttachment',
      id: 'ATT1',
      name: 'Budget.xlsx',
      size: 20480,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      isInline: false,
    },
  ],
};

describe('getMessage', () => {
  it('reads one message with its body and attachment list, and wraps the body as untrusted', async () => {
    const { svc, requests } = service(() => DETAIL);
    const detail = await svc.getMessage(MESSAGE.id);
    expect(requests[0].path).toBe(`/me/messages/${encodeURIComponent(MESSAGE.id)}`);
    expect(requests[0].query.$expand).toBe('attachments($select=id,name,size,contentType,isInline)');
    expect(requests[0].query.$select).toContain('body');
    expect(requests[0].query.$select).toContain('toRecipients');
    expect(detail.to).toEqual(['John Smith <jsmith@example.com>']);
    expect(detail.cc).toEqual(['team@example.com']);
    expect(detail.bodyText).toMatch(/came from an email/i);
    expect(detail.bodyText).toContain('Please see [the budget](https://example.com/b).');
    expect(detail.attachments).toEqual([
      {
        id: 'ATT1',
        name: 'Budget.xlsx',
        size: 20480,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        isInline: false,
      },
    ]);
  });

  it('passes a plain-text body through unchanged inside the wrapper', async () => {
    const { svc } = service(() => ({ ...DETAIL, body: { contentType: 'text', content: 'Line <one>' } }));
    expect((await svc.getMessage(MESSAGE.id)).bodyText).toContain('Line <one>');
  });
});

describe('getConversation', () => {
  it('filters on the conversation id with quotes escaped, sends no $orderby, and returns oldest first', async () => {
    const later = { ...DETAIL, id: 'B', receivedDateTime: '2026-09-02T10:00:00Z' };
    const earlier = { ...DETAIL, id: 'A', receivedDateTime: '2026-09-01T09:00:00Z' };
    const { svc, requests } = service(() => ({ value: [later, earlier] }));
    const thread = await svc.getConversation("AAQk'x");
    expect(requests[0].path).toBe('/me/messages');
    expect(requests[0].query.$filter).toBe("conversationId eq 'AAQk''x'");
    expect(requests[0].query).not.toHaveProperty('$orderby');
    expect(thread.map((m) => m.id)).toEqual(['A', 'B']);
  });
});

describe('listFolders', () => {
  it('lists folders with their counts', async () => {
    const { svc, requests } = service(() => ({
      value: [{ id: 'F1', displayName: 'Inbox', unreadItemCount: 3, totalItemCount: 40, childFolderCount: 0 }],
    }));
    const folders = await svc.listFolders();
    expect(requests[0].path).toBe('/me/mailFolders');
    expect(requests[0].query.$select).toBe('id,displayName,unreadItemCount,totalItemCount');
    expect(folders).toEqual([{ id: 'F1', displayName: 'Inbox', unreadItemCount: 3, totalItemCount: 40 }]);
  });
});
