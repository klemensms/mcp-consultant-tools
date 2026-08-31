/**
 * message-content tests
 *
 * Covers the inbound rendering path, where the input is Graph's own HTML rather
 * than anything this package produced. Every fixture below is the verbatim shape
 * captured from a live tenant, so a passing test means the renderer handles what
 * Graph actually emits - which is the only thing that matters here, since the
 * two defects these tests pin were both cases of Graph emitting something the
 * renderer had never been shown.
 */

import { describe, it, expect } from 'vitest';
import { htmlToText } from '../message-content.js';

const USER_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const USER_B = 'bbbbbbbb-1111-2222-3333-444444444444';
const CONVERSATION_ID = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';

describe('htmlToText mentions', () => {
  // Graph emits one <at> per WORD of a mention, with one mentions[] entry per
  // word all resolving to the same entity. Rendered naively that turns a
  // two-word name into two separate @-tags.
  it('coalesces the per-word <at> elements of a single user mention', () => {
    const html = '<p>Thanks for these <at id="0">Jane</at>&nbsp;<at id="1">Doe</at>&nbsp;- great example!</p>';
    const mentions = [
      { id: 0, mentionText: 'Jane', mentioned: { user: { id: USER_A } } },
      { id: 1, mentionText: 'Doe', mentioned: { user: { id: USER_A } } },
    ];

    expect(htmlToText(html, 'html', mentions)).toBe('Thanks for these @Jane Doe - great example!');
  });

  it('coalesces a channel-tag mention, which resolves to a conversation rather than a user', () => {
    const html = '<p><at id="0">Ops</at>&nbsp;<at id="1">Team</at>&nbsp;please review.</p>';
    const mentions = [
      { id: 0, mentionText: 'Ops', mentioned: { conversation: { id: CONVERSATION_ID } } },
      { id: 1, mentionText: 'Team', mentioned: { conversation: { id: CONVERSATION_ID } } },
    ];

    expect(htmlToText(html, 'html', mentions)).toBe('@Ops Team please review.');
  });

  // The guard that makes this safe. Keying on adjacency alone would fuse two
  // different people standing next to each other into one bogus name.
  it('does NOT merge adjacent mentions of different entities', () => {
    const html = '<p><at id="0">Jane</at>&nbsp;<at id="1">John</at>&nbsp;over to you.</p>';
    const mentions = [
      { id: 0, mentionText: 'Jane', mentioned: { user: { id: USER_A } } },
      { id: 1, mentionText: 'John', mentioned: { user: { id: USER_B } } },
    ];

    expect(htmlToText(html, 'html', mentions)).toBe('@Jane @John over to you.');
  });

  it('leaves a single-element mention alone', () => {
    const html = '<p>Morning <at id="0">Jane</at>&nbsp;- any update?</p>';
    const mentions = [{ id: 0, mentionText: 'Jane', mentioned: { user: { id: USER_A } } }];

    expect(htmlToText(html, 'html', mentions)).toBe('Morning @Jane - any update?');
  });

  it('renders each <at> separately when no mentions array is supplied', () => {
    // Without mentions[] there is no entity to key on, so merging would be a
    // guess. Degrade to the old per-word behaviour rather than guess.
    const html = '<p><at id="0">Jane</at>&nbsp;<at id="1">Doe</at>&nbsp;hello.</p>';

    expect(htmlToText(html, 'html')).toBe('@Jane @Doe hello.');
  });

  it('does not merge across intervening words', () => {
    const html = '<p><at id="0">Jane</at> and <at id="1">Doe</at></p>';
    const mentions = [
      { id: 0, mentionText: 'Jane', mentioned: { user: { id: USER_A } } },
      { id: 1, mentionText: 'Doe', mentioned: { user: { id: USER_A } } },
    ];

    expect(htmlToText(html, 'html', mentions)).toBe('@Jane and @Doe');
  });
});

describe('htmlToText emoji', () => {
  it('renders an <emoji> element as its alt character', () => {
    const html = '<p>Now at the top left of the page&nbsp;<emoji id="smile" alt="🙂" title="Smile"></emoji>&nbsp;</p>';

    expect(htmlToText(html, 'html')).toBe('Now at the top left of the page 🙂');
  });

  it('falls back to the title when an emoji carries no alt', () => {
    const html = '<p>Nice <emoji id="smile" title="Smile"></emoji></p>';

    expect(htmlToText(html, 'html')).toBe('Nice Smile');
  });

  it('keeps surrounding text intact when the emoji has neither alt nor title', () => {
    const html = '<p>Nice <emoji id="smile"></emoji> work</p>';

    expect(htmlToText(html, 'html')).toBe('Nice work');
  });
});

describe('htmlToText links', () => {
  // The whole point of reading a thread through the tool is not having to open
  // Teams to finish the job, and an anchor whose href is dropped forces exactly
  // that - the label survives, so nothing even signals a link was there.
  it('renders an anchor as a markdown link', () => {
    const html = '<p><a href="https://example.com/faqs/122">Sample Documents</a> Its all here.</p>';

    expect(htmlToText(html, 'html')).toBe('[Sample Documents](https://example.com/faqs/122) Its all here.');
  });

  // Teams auto-links a pasted URL, labelling the anchor with the URL itself.
  // Rendering that as markdown would produce [https://x](https://x).
  it('emits a bare URL when the label is already the URL', () => {
    const html = '<p>See <a href="https://example.com/page">https://example.com/page</a></p>';

    expect(htmlToText(html, 'html')).toBe('See https://example.com/page');
  });

  it('ignores a trailing slash when deciding the label is the URL', () => {
    const html = '<p><a href="https://example.com/page/">https://example.com/page</a></p>';

    expect(htmlToText(html, 'html')).toBe('https://example.com/page');
  });

  it('strips the scheme before comparing a mailto anchor', () => {
    const html = '<p>Mail <a href="mailto:jdoe@example.com">jdoe@example.com</a></p>';

    expect(htmlToText(html, 'html')).toBe('Mail jdoe@example.com');
  });

  it('keeps the label when the anchor carries no href', () => {
    const html = '<p>Nothing <a>to see</a> here</p>';

    expect(htmlToText(html, 'html')).toBe('Nothing to see here');
  });

  it('falls back to the URL when the anchor has no label', () => {
    const html = '<p><a href="https://example.com/page"></a></p>';

    expect(htmlToText(html, 'html')).toBe('https://example.com/page');
  });

  it('renders every anchor in a message, not just the first', () => {
    const html = '<p><a href="https://example.com/a">A</a> and <a href="https://example.com/b">B</a></p>';

    expect(htmlToText(html, 'html')).toBe('[A](https://example.com/a) and [B](https://example.com/b)');
  });

  it('resolves a mention inside an anchor before using it as the label', () => {
    const html = '<p><a href="https://example.com/x"><at id="0">Jane</at></a></p>';
    const mentions = [{ id: 0, mentionText: 'Jane', mentioned: { user: { id: USER_A } } }];

    expect(htmlToText(html, 'html', mentions)).toBe('[@Jane](https://example.com/x)');
  });
});

describe('htmlToText attachments', () => {
  // The body carries only a placeholder <attachment id="...">; the name and the
  // URL live in the sibling attachments[] array, which the renderer was never
  // given - so every attachment collapsed to a bare, unidentifiable marker.
  it('resolves a file attachment to its name and URL', () => {
    const html = '<p>Here you go</p><attachment id="abc123"></attachment>';
    const attachments = [{
      id: 'abc123',
      contentType: 'reference',
      contentUrl: 'https://contoso.sharepoint.com/Shared%20Documents/Report.docx',
      name: 'Report.docx',
    }];

    expect(htmlToText(html, 'html', undefined, attachments)).toBe(
      'Here you go\n[attachment: Report.docx - https://contoso.sharepoint.com/Shared%20Documents/Report.docx]',
    );
  });

  it('renders a link-preview card as its title and URL', () => {
    const html = '<attachment id="card1"></attachment>';
    const attachments = [{
      id: 'card1',
      contentType: 'reference',
      contentUrl: 'https://example.com/faqs/122',
      name: 'Sample Documents',
    }];

    expect(htmlToText(html, 'html', undefined, attachments)).toBe(
      '[attachment: Sample Documents - https://example.com/faqs/122]',
    );
  });

  // A quoted reply and a preview card are both <attachment> placeholders, so
  // without the contentType a reader has to guess from position which is which.
  it('marks a quoted reply as a quote rather than an attachment', () => {
    const html = '<attachment id="quote1"></attachment>\n<p>Agreed</p>';
    const attachments = [{
      id: 'quote1',
      contentType: 'messageReference',
      content: JSON.stringify({
        messageId: '1616965872395',
        messagePreview: 'Can someone confirm the date?',
        messageSender: { user: { id: USER_B, displayName: 'Jane Doe' } },
      }),
    }];

    expect(htmlToText(html, 'html', undefined, attachments)).toBe(
      '[quoted reply from Jane Doe: Can someone confirm the date?]\nAgreed',
    );
  });

  it('still marks a quoted reply when its content will not parse', () => {
    const html = '<attachment id="quote1"></attachment>';
    const attachments = [{ id: 'quote1', contentType: 'messageReference', content: 'not json' }];

    expect(htmlToText(html, 'html', undefined, attachments)).toBe('[quoted reply]');
  });

  it('names the content type when an attachment has neither name nor URL', () => {
    const html = '<attachment id="card2"></attachment>';
    const attachments = [{ id: 'card2', contentType: 'application/vnd.microsoft.card.adaptive' }];

    expect(htmlToText(html, 'html', undefined, attachments)).toBe(
      '[attachment: application/vnd.microsoft.card.adaptive]',
    );
  });

  // Graph does not always pair an attachment with a placeholder in the body -
  // an unfurled link preview often arrives with the body carrying only the URL.
  it('appends an attachment that has no placeholder in the body', () => {
    const html = '<p>Have a look</p>';
    const attachments = [{
      id: 'orphan1',
      contentType: 'reference',
      contentUrl: 'https://example.com/faqs/122',
      name: 'Sample Documents',
    }];

    expect(htmlToText(html, 'html', undefined, attachments)).toBe(
      'Have a look\n[attachment: Sample Documents - https://example.com/faqs/122]',
    );
  });

  it('keeps the bare placeholder when the attachments array is missing', () => {
    const html = '<p>Here you go</p><attachment id="abc123"></attachment>';

    expect(htmlToText(html, 'html')).toBe('Here you go\n[attachment]');
  });

  it('keeps the bare placeholder when no attachment matches the id', () => {
    const html = '<attachment id="abc123"></attachment>';
    const attachments = [{ id: 'somethingelse', contentType: 'reference', name: 'Other.docx' }];

    expect(htmlToText(html, 'html', undefined, attachments)).toBe(
      '[attachment]\n[attachment: Other.docx]',
    );
  });
});
