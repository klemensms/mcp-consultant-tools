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
