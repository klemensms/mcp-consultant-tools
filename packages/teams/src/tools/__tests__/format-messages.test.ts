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
