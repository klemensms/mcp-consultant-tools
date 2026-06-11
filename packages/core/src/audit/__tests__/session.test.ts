import { describe, it, expect, beforeEach } from 'vitest';
import { AuditSessionStore } from '../session.js';

let store: AuditSessionStore;

beforeEach(() => {
  store = new AuditSessionStore('Acme');
});

describe('AuditSessionStore', () => {
  it('starts with no engagement set', () => {
    expect(store.getEngagement()).toBeNull();
  });

  it('records engagement and returns previous on subsequent set', () => {
    const e1 = store.setEngagement(['Acme-1'], 'first');
    expect(e1.previous).toBeNull();
    expect(e1.current.workItemIds).toEqual(['Acme-1']);
    expect(e1.current.source).toBe('agent-explicit');

    const e2 = store.setEngagement(['Acme-2'], 'second');
    expect(e2.previous?.workItemIds).toEqual(['Acme-1']);
    expect(e2.current.workItemIds).toEqual(['Acme-2']);
  });

  it('marks source=exploration for the sentinel value', () => {
    const e = store.setEngagement(['exploration'], 'pre-ticket');
    expect(e.current.source).toBe('exploration');
  });

  it('treats duplicated exploration sentinel as exploration mode', () => {
    const e = store.setEngagement(['exploration', 'exploration'], undefined);
    expect(e.current.workItemIds).toEqual(['exploration']);
    expect(e.current.source).toBe('exploration');
  });

  it('treats sentinel mixed with real IDs as agent-explicit mode', () => {
    const e = store.setEngagement(['exploration', 'Acme-1'], undefined);
    expect(e.current.workItemIds).toEqual(['exploration', 'Acme-1']);
    expect(e.current.source).toBe('agent-explicit');
  });

  it('rejects empty arrays', () => {
    expect(() => store.setEngagement([], undefined)).toThrow(/at least one/i);
  });

  it('rejects arrays that become empty after trim', () => {
    expect(() => store.setEngagement(['  ', '', '\t'], undefined)).toThrow(/at least one/i);
  });

  it('trims and dedupes work item IDs', () => {
    const e = store.setEngagement(['  Acme-1  ', 'Acme-2', 'Acme-1'], undefined);
    expect(e.current.workItemIds).toEqual(['Acme-1', 'Acme-2']);
  });
});
