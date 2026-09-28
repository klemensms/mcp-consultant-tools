import { describe, it, expect } from 'vitest';
import { insertAboveQuote } from '../compose.js';

const LINK = '<p>link</p>';

describe('insertAboveQuote', () => {
  it('goes just before the reply separator Outlook writes above a quoted thread', () => {
    const body = '<html><body><p>Mine</p><div id="appendonsend"></div><hr><div id="divRplyFwdMsg">From: Jane Doe</div></body></html>';
    const out = insertAboveQuote(body, LINK);
    expect(out.indexOf('Mine')).toBeLessThan(out.indexOf('link'));
    expect(out.indexOf('link')).toBeLessThan(out.indexOf('appendonsend'));
  });

  it('falls back to the reply header when there is no appendonsend marker', () => {
    const body = '<html><body><p>Mine</p><hr><div id="divRplyFwdMsg">From: Jane Doe</div></body></html>';
    const out = insertAboveQuote(body, LINK);
    expect(out.indexOf('link')).toBeLessThan(out.indexOf('divRplyFwdMsg'));
    expect(out.indexOf('Mine')).toBeLessThan(out.indexOf('link'));
  });

  it('goes at the end of the body of a new draft', () => {
    expect(insertAboveQuote('<html><body><p>Mine</p></body></html>', LINK)).toBe('<html><body><p>Mine</p><p>link</p></body></html>');
  });

  it('appends to a fragment with no body tag', () => {
    expect(insertAboveQuote('<p>Mine</p>', LINK)).toBe('<p>Mine</p><p>link</p>');
  });
});
