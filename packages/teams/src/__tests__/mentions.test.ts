/**
 * Mention builder tests
 *
 * A mention is only valid if the `<at id="N">` element in the body and the
 * `mentions[]` entry with the same `id` agree. Half of that pair is useless: an
 * `<at>` with no mentions entry renders as a literal tag in the Teams client, and
 * a mentions entry with no `<at>` notifies nobody. Every test here asserts BOTH
 * halves, because asserting either alone would pass on a broken message.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildOutboundMessage, extractMentionTargets } from '../mentions.js';

const JANE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PETER_ID = '11111111-2222-3333-4444-555555555555';

const DIRECTORY: Record<string, any> = {
  'jane doe': { id: JANE_ID, displayName: 'Jane Doe', mail: 'jdoe@example.com', userPrincipalName: 'jdoe@example.com' },
  'jdoe@example.com': { id: JANE_ID, displayName: 'Jane Doe', mail: 'jdoe@example.com', userPrincipalName: 'jdoe@example.com' },
  'peter parker': { id: PETER_ID, displayName: 'Peter Parker', mail: 'pparker@example.com', userPrincipalName: 'pparker@example.com' },
};

/**
 * Stands in for the directory. Returns whatever the search term maps to, so the
 * builder exercises the real resolveDirectoryUser path including its ambiguity
 * and not-found handling.
 */
function createClient(overrides: Record<string, any[]> = {}) {
  const searched: string[] = [];

  const client = {
    api: (_path: string) => {
      const chain: any = {
        header: () => chain,
        count: () => chain,
        select: () => chain,
        top: () => chain,
        search: (s: string) => {
          // "displayName:TERM" OR "mail:TERM" OR ... - recover TERM
          const term = /displayName:([^"]+)"/.exec(s)?.[1] ?? '';
          searched.push(term);
          chain._term = term.toLowerCase();
          return chain;
        },
        get: async () => {
          const term = chain._term as string;
          if (term in overrides) return { value: overrides[term] };
          const hit = DIRECTORY[term];
          return { value: hit ? [hit] : [] };
        },
      };
      return chain;
    },
  };

  return { client, searched };
}

describe('extractMentionTargets', () => {
  it('finds markers in first-appearance order', () => {
    expect(extractMentionTargets('@[Jane Doe] and @[Peter Parker] please look')).toEqual([
      'Jane Doe',
      'Peter Parker',
    ]);
  });

  it('de-duplicates the same person case-insensitively', () => {
    expect(extractMentionTargets('@[Jane Doe] ... @[jane doe]')).toEqual(['Jane Doe']);
  });

  it('ignores a bare @name, which has no parseable end', () => {
    expect(extractMentionTargets('@Jane please look')).toEqual([]);
  });

  it('does not span newlines', () => {
    expect(extractMentionTargets('@[Jane\nDoe]')).toEqual([]);
  });

  it('returns nothing for ordinary text', () => {
    expect(extractMentionTargets('no mentions here, email a@b.com')).toEqual([]);
  });
});

describe('buildOutboundMessage without mentions', () => {
  it('converts markdown and omits the mentions array entirely', async () => {
    const { client } = createClient();

    const out = await buildOutboundMessage(client, '**bold**', 'markdown');

    expect(out.body.contentType).toBe('html');
    expect(out.body.content).toContain('<strong>bold</strong>');
    expect(out.mentions).toBeUndefined();
  });

  it('leaves plain text as text', async () => {
    const { client } = createClient();

    const out = await buildOutboundMessage(client, '**bold**', 'text');

    expect(out.body).toEqual({ contentType: 'text', content: '**bold**' });
    expect(out.mentions).toBeUndefined();
  });

  it('makes no directory call at all - the common path must not need User.ReadBasic.All', async () => {
    const { client, searched } = createClient();

    await buildOutboundMessage(client, 'nothing to see', 'markdown');

    expect(searched).toEqual([]);
  });
});

describe('buildOutboundMessage with mentions', () => {
  it('pairs an <at id> in the body with a matching mentions entry', async () => {
    const { client } = createClient();

    const out = await buildOutboundMessage(client, '@[Jane Doe] please review', 'markdown');

    expect(out.body.content).toContain('<at id="0">Jane Doe</at>');
    expect(out.mentions).toEqual([
      {
        id: 0,
        mentionText: 'Jane Doe',
        mentioned: { user: { displayName: 'Jane Doe', id: JANE_ID, userIdentityType: 'aadUser' } },
      },
    ]);
  });

  it('leaves no marker behind in the body', async () => {
    const { client } = createClient();

    const out = await buildOutboundMessage(client, '@[Jane Doe] please review', 'markdown');

    expect(out.body.content).not.toContain('@[');
    expect(out.body.content).not.toContain('zzMcpTeamsMention');
  });

  it('numbers several mentions distinctly and keeps ids aligned with the body', async () => {
    const { client } = createClient();

    const out = await buildOutboundMessage(client, '@[Jane Doe] and @[Peter Parker]', 'markdown');

    expect(out.body.content).toContain('<at id="0">Jane Doe</at>');
    expect(out.body.content).toContain('<at id="1">Peter Parker</at>');
    expect(out.mentions!.map((m) => m.id)).toEqual([0, 1]);
    expect(out.mentions![1].mentioned.user.id).toBe(PETER_ID);
  });

  it('reuses one id when the same person is mentioned twice', async () => {
    const { client, searched } = createClient();

    const out = await buildOutboundMessage(client, '@[Jane Doe] ... @[jane doe] again', 'markdown');

    // Two <at> elements, but one mentions entry - a second entry renders as a
    // duplicate mention in the Teams client.
    expect(out.mentions).toHaveLength(1);
    expect(out.body.content.match(/<at id="0">/g)).toHaveLength(2);
    expect(searched).toHaveLength(1);
  });

  it('resolves an email marker to the same user as the name', async () => {
    const { client } = createClient();

    const out = await buildOutboundMessage(client, '@[jdoe@example.com] hi', 'markdown');

    expect(out.mentions![0].mentioned.user.id).toBe(JANE_ID);
  });

  it('promotes a text message to html, since a mention cannot render from plain text', async () => {
    const { client } = createClient();

    const out = await buildOutboundMessage(client, '@[Jane Doe] see **this**', 'text');

    expect(out.body.contentType).toBe('html');
    expect(out.body.content).toContain('<at id="0">Jane Doe</at>');
    // "text" still means do not interpret markdown.
    expect(out.body.content).toContain('**this**');
    expect(out.body.content).not.toContain('<strong>');
  });

  it('escapes the surrounding text when promoting a text message', async () => {
    const { client } = createClient();

    const out = await buildOutboundMessage(client, '@[Jane Doe] <script>alert(1)</script>', 'text');

    expect(out.body.content).not.toContain('<script>');
    expect(out.body.content).toContain('&lt;script&gt;');
  });

  it('escapes a hostile display name rather than injecting it raw', async () => {
    const { client } = createClient({
      'evil': [{ id: 'evil-id', displayName: '<img src=x onerror=alert(1)>', mail: 'e@example.com' }],
    });

    const out = await buildOutboundMessage(client, '@[evil] hi', 'markdown');

    // The <at> markup is built after sanitisation, so this escaping is the only
    // thing standing between a directory display name and the message body.
    expect(out.body.content).not.toContain('<img');
    expect(out.body.content).toContain('&lt;img');
  });

  it('names the marker that could not be resolved', async () => {
    const { client } = createClient();

    await expect(buildOutboundMessage(client, '@[Nobody At All] hi', 'markdown')).rejects.toThrow(
      /@\[Nobody At All\]/
    );
  });

  it('refuses to send when a mention is ambiguous', async () => {
    const { client } = createClient({
      'pete': [
        { id: 'id-1', displayName: 'Pete One', mail: 'p1@example.com' },
        { id: 'id-2', displayName: 'Pete Two', mail: 'p2@example.com' },
      ],
    });

    await expect(buildOutboundMessage(client, '@[pete] hi', 'markdown')).rejects.toThrow(
      /matches 2 users/
    );
  });

  // Mentions run on the same resolver as send-direct-message, so they carry the
  // same exposure: @[Sam] in a channel post notifies a guest and hands them the
  // thread. The guard has to hold on this path too, not only on DMs.
  it('refuses to mention a guest named by name', async () => {
    const { client } = createClient({
      'sam': [
        {
          id: 'id-guest',
          displayName: 'Sam Vendor',
          mail: 'svendor@contoso.com',
          userPrincipalName: 'svendor_contoso.com#EXT#@yourtenant.onmicrosoft.com',
        },
      ],
    });

    await expect(buildOutboundMessage(client, '@[sam] hi', 'markdown')).rejects.toThrow(/guest/);
  });

  it('mentions that same guest when named by their exact address', async () => {
    const { client } = createClient({
      'svendor@contoso.com': [
        {
          id: 'id-guest',
          displayName: 'Sam Vendor',
          mail: 'svendor@contoso.com',
          userPrincipalName: 'svendor_contoso.com#EXT#@yourtenant.onmicrosoft.com',
        },
      ],
    });

    const out = await buildOutboundMessage(client, '@[svendor@contoso.com] hi', 'markdown');

    expect(out.mentions?.[0].mentioned.user.id).toBe('id-guest');
  });
});
