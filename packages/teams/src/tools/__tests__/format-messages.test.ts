/**
 * Message rendering tests
 *
 * The flag suffix is the one place Graph's raw vocabulary reaches a reader, so it
 * is worth pinning: real message types are informative, the enum placeholder Graph
 * pairs with an eventDetail is not.
 */

import { describe, it, expect } from 'vitest';
import { formatMessages } from '../format-messages.js';
import type { MessageInfo } from '../../types.js';

const BASE: MessageInfo = {
  id: '1616965872395',
  createdDateTime: '2026-08-12T09:30:00Z',
  authorName: 'Robin Kline',
  text: 'Hello world',
};

const OPTIONS = { heading: 'Channel Messages', emptyMessage: 'No messages found.' };

describe('formatMessages flags', () => {
  it('hides the unknownFutureValue placeholder when Graph also sent an eventDetail', () => {
    const output = formatMessages(
      [{ ...BASE, authorName: 'System', text: '[system message]', messageType: 'unknownFutureValue', hasEventDetail: true }],
      OPTIONS
    );

    expect(output).not.toContain('unknownFutureValue');
    expect(output).toContain('[system message]');
  });

  it('still shows a message type that carries meaning', () => {
    const output = formatMessages([{ ...BASE, messageType: 'systemEventMessage' }], OPTIONS);

    expect(output).toContain('systemEventMessage');
  });

  it('shows unknownFutureValue when there is no eventDetail to explain it away', () => {
    const output = formatMessages([{ ...BASE, messageType: 'unknownFutureValue' }], OPTIONS);

    expect(output).toContain('unknownFutureValue');
  });
});

describe('formatMessages body budget', () => {
  const long = (chars: number) => 'x'.repeat(chars);

  it('returns a single long message whole instead of capping it at the old 1500', () => {
    const output = formatMessages([{ ...BASE, text: long(1810) }], OPTIONS);

    expect(output).not.toContain('truncated');
    expect(output).toContain(long(1810));
  });

  it('spends unused allowance on the one message that needs it', () => {
    const messages = [
      ...Array.from({ length: 19 }, (_, i) => ({ ...BASE, id: `short-${i}`, text: 'brief' })),
      { ...BASE, id: 'long', text: long(20_000) },
    ];

    const output = formatMessages(messages, OPTIONS);

    expect(output).not.toContain('truncated');
  });

  it('caps the whole read so a wide read of long messages cannot exhaust a context window', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({ ...BASE, id: `m-${i}`, text: long(5_000) }));

    const output = formatMessages(messages, OPTIONS);

    expect(output).toContain('truncated');
    // 50 x 5000 = 250,000 chars of body before the cap.
    expect(output.length).toBeLessThan(40_000);
  });

  it('tells a multi-message read how to get the rest', () => {
    const messages = [
      { ...BASE, id: 'a', text: long(40_000) },
      { ...BASE, id: 'b', text: long(40_000) },
    ];

    const output = formatMessages(messages, OPTIONS);

    expect(output).toContain('narrow to this message');
  });

  it('does not tell a single-message read to narrow further, because it cannot', () => {
    const output = formatMessages([{ ...BASE, text: long(40_000) }], OPTIONS);

    expect(output).toContain('truncated');
    expect(output).not.toContain('narrow to this message');
    expect(output).toContain('open it in Teams');
  });

  it('still renders a message whose body flattened to nothing', () => {
    const output = formatMessages([{ ...BASE, text: '' }], OPTIONS);

    expect(output).toContain('_(no text content)_');
  });
});
