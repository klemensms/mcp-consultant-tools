/**
 * Every write, send and delete tool is registered whatever the switches say,
 * and refuses with a message naming its variable, before any Graph call, while
 * its switch is off. Write and send are independent: one does not open the other.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { registerAllTools } from '../index.js';
import { MailReadService } from '../../services/mail-read-service.js';
import { MailWriteService } from '../../services/mail-write-service.js';
import { MailSendService } from '../../services/mail-send-service.js';
import { CalendarReadService } from '../../services/calendar-read-service.js';
import { recordingGraph } from '../../__tests__/graph-recorder.js';

const SWITCHES = ['OUTLOOK_ENABLE_WRITE', 'OUTLOOK_ENABLE_DRAFTS', 'OUTLOOK_ENABLE_SEND', 'OUTLOOK_ENABLE_DELETE'];

const DRAFT_TOOLS: Record<string, object> = {
  'mail-create-draft': { to: ['jdoe@example.com'], subject: 's', body: 'b' },
  'mail-create-reply-draft': { messageId: 'M', body: 'b' },
  'mail-create-forward-draft': { messageId: 'M', to: ['jdoe@example.com'] },
  'mail-update-draft': { draftId: 'D', subject: 's' },
  'mail-add-draft-attachment': { draftId: 'D', filePath: '/nonexistent/file.txt' },
};
const WRITE_TOOLS: Record<string, object> = {
  'mail-mark-read': { messageId: 'M', isRead: true },
  'mail-move-message': { messageId: 'M', destinationFolder: 'archive' },
  'mail-flag-message': { messageId: 'M', flag: 'flagged' },
};
const SEND_TOOLS: Record<string, object> = {
  'mail-send-draft': { draftId: 'D' },
  'mail-send': { to: ['jdoe@example.com'], subject: 's', body: 'b' },
};
const DELETE_TOOLS: Record<string, object> = {
  'mail-delete-message': { messageId: 'M', confirm: true },
};

function setup() {
  const graph = recordingGraph(() => ({ id: 'X', webLink: 'w' }));
  const provider = { getGraphClient: () => graph.client };
  const ctx: any = {
    auth: {},
    mail: new MailReadService(provider, { downloadDir: '/tmp/unused' }),
    write: new MailWriteService(provider, { maxAttachmentMB: 25 }),
    send: new MailSendService(provider),
    calendar: new CalendarReadService(provider),
  };
  const handlers: Record<string, (args: any) => Promise<any>> = {};
  registerAllTools({ tool: (name: string, ...rest: any[]) => { handlers[name] = rest[rest.length - 1]; } }, ctx);
  return { handlers, requests: graph.requests };
}

async function expectRefused(handlers: Record<string, any>, requests: unknown[], tools: Record<string, object>, variable: string) {
  for (const [name, args] of Object.entries(tools)) {
    expect(handlers[name], `${name} is registered`).toBeTypeOf('function');
    const result = await handlers[name](args);
    expect(result.isError, name).toBe(true);
    expect(result.content[0].text, name).toContain(`Set ${variable}=true to enable`);
  }
  expect(requests).toHaveLength(0);
}

afterEach(() => {
  for (const name of SWITCHES) delete process.env[name];
});

describe('switches off', () => {
  it('refuses every draft tool naming OUTLOOK_ENABLE_DRAFTS', async () => {
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, DRAFT_TOOLS, 'OUTLOOK_ENABLE_DRAFTS');
  });

  it('refuses every write tool naming OUTLOOK_ENABLE_WRITE', async () => {
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, WRITE_TOOLS, 'OUTLOOK_ENABLE_WRITE');
  });

  it('refuses every send tool naming OUTLOOK_ENABLE_SEND', async () => {
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, SEND_TOOLS, 'OUTLOOK_ENABLE_SEND');
  });

  it('refuses the delete tool naming OUTLOOK_ENABLE_DELETE', async () => {
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, DELETE_TOOLS, 'OUTLOOK_ENABLE_DELETE');
  });
});

describe('switches are independent', () => {
  it('refuses send when only write is on', async () => {
    process.env.OUTLOOK_ENABLE_WRITE = 'true';
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, SEND_TOOLS, 'OUTLOOK_ENABLE_SEND');
  });

  it('refuses write and drafts when only send is on', async () => {
    process.env.OUTLOOK_ENABLE_SEND = 'true';
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, WRITE_TOOLS, 'OUTLOOK_ENABLE_WRITE');
    await expectRefused(handlers, requests, DRAFT_TOOLS, 'OUTLOOK_ENABLE_DRAFTS');
  });

  it('refuses send when only drafts are on', async () => {
    process.env.OUTLOOK_ENABLE_DRAFTS = 'true';
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, SEND_TOOLS, 'OUTLOOK_ENABLE_SEND');
    await expectRefused(handlers, requests, WRITE_TOOLS, 'OUTLOOK_ENABLE_WRITE');
  });

  it('refuses drafts when write is on but OUTLOOK_ENABLE_DRAFTS=false', async () => {
    process.env.OUTLOOK_ENABLE_WRITE = 'true';
    process.env.OUTLOOK_ENABLE_DRAFTS = 'false';
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, DRAFT_TOOLS, 'OUTLOOK_ENABLE_DRAFTS');
  });

  it('lets drafts through when OUTLOOK_ENABLE_DRAFTS is unset and write is on, as before the split', async () => {
    process.env.OUTLOOK_ENABLE_WRITE = 'true';
    const { handlers, requests } = setup();
    const result = await handlers['mail-create-draft']({ to: ['jdoe@example.com'], subject: 's', body: 'b' });
    expect(result.isError).toBeUndefined();
    expect(requests).toHaveLength(1);
  });

  it('says in every draft result that nothing was sent', async () => {
    process.env.OUTLOOK_ENABLE_DRAFTS = 'true';
    const { handlers } = setup();
    for (const name of ['mail-create-draft', 'mail-update-draft']) {
      const result = await handlers[name](DRAFT_TOOLS[name]);
      expect(JSON.parse(result.content[0].text).note, name).toMatch(/nothing was sent/i);
    }
  });

  it('refuses delete when write and send are on', async () => {
    process.env.OUTLOOK_ENABLE_WRITE = 'true';
    process.env.OUTLOOK_ENABLE_SEND = 'true';
    const { handlers, requests } = setup();
    await expectRefused(handlers, requests, DELETE_TOOLS, 'OUTLOOK_ENABLE_DELETE');
  });

  it('lets a write tool through once its switch is on', async () => {
    process.env.OUTLOOK_ENABLE_WRITE = 'true';
    const { handlers, requests } = setup();
    const result = await handlers['mail-mark-read']({ messageId: 'M', isRead: true });
    expect(result.isError).toBeUndefined();
    expect(requests).toHaveLength(1);
  });
});
