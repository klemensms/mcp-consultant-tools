import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MailSendService } from '../mail-send-service.js';
import { recordingGraph } from '../../__tests__/graph-recorder.js';

beforeEach(() => {
  process.env.OUTLOOK_ENABLE_SEND = 'true';
});

afterEach(() => {
  delete process.env.OUTLOOK_ENABLE_SEND;
});

function service() {
  const graph = recordingGraph(() => undefined);
  return { svc: new MailSendService({ getGraphClient: () => graph.client }), requests: graph.requests };
}

describe('sendDraft', () => {
  it('posts to the draft send action', async () => {
    const { svc, requests } = service();
    await svc.sendDraft('DRAFT=1');
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].path).toBe(`/me/messages/${encodeURIComponent('DRAFT=1')}/send`);
  });
});

describe('sendMail', () => {
  it('posts /me/sendMail with the message and saveToSentItems true', async () => {
    const { svc, requests } = service();
    await svc.sendMail({ to: ['jdoe@example.com'], subject: 'Hello', body: 'Hi *there*' });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].path).toBe('/me/sendMail');
    expect(requests[0].body.saveToSentItems).toBe(true);
    expect(requests[0].body.message.subject).toBe('Hello');
    expect(requests[0].body.message.toRecipients).toEqual([{ emailAddress: { address: 'jdoe@example.com' } }]);
    expect(requests[0].body.message.body).toEqual({ contentType: 'HTML', content: expect.stringContaining('<em>there</em>') });
  });

  it('needs at least one recipient', async () => {
    const { svc, requests } = service();
    await expect(svc.sendMail({ to: [], subject: 'x', body: 'y' })).rejects.toThrow(/recipient/i);
    expect(requests).toHaveLength(0);
  });
});
