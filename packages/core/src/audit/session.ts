import type { AuditEngagement, EngagementSource } from './types.js';

export interface SetEngagementResult {
  previous: AuditEngagement | null;
  current: AuditEngagement;
}

export class AuditSessionStore {
  private engagement: AuditEngagement | null = null;

  constructor(private readonly client: string) {}

  getEngagement(): AuditEngagement | null {
    return this.engagement;
  }

  setEngagement(workItemIds: string[], reason: string | undefined): SetEngagementResult {
    const cleaned = dedupe(workItemIds.map((s) => s.trim()).filter((s) => s.length > 0));
    if (cleaned.length === 0) {
      throw new Error('set-audit-engagement requires at least one work item ID');
    }
    const source: EngagementSource =
      cleaned.length === 1 && cleaned[0] === 'exploration' ? 'exploration' : 'agent-explicit';

    const previous = this.engagement;
    const current: AuditEngagement = Object.freeze({
      client: this.client,
      workItemIds: Object.freeze(cleaned) as readonly string[],
      reason,
      source,
    }) as AuditEngagement;
    this.engagement = current;
    return { previous, current };
  }
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
