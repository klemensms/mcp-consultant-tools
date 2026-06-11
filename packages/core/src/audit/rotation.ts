import type { AuditRotation } from './types.js';

export function currentFilename(rotation: AuditRotation, when: Date = new Date()): string {
  const yyyy = when.getUTCFullYear().toString();
  const mm = String(when.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(when.getUTCDate()).padStart(2, '0');

  if (rotation === 'monthly') return `${yyyy}-${mm}.jsonl`;
  if (rotation === 'daily') return `${yyyy}-${mm}-${dd}.jsonl`;
  if (rotation === 'weekly') {
    const { year: isoYear, week } = isoWeekParts(when);
    return `${isoYear}-W${String(week).padStart(2, '0')}.jsonl`;
  }

  // size-based: filename includes daily timestamp + secondsPastMidnight to keep rolls deterministic
  const secs =
    when.getUTCHours() * 3600 + when.getUTCMinutes() * 60 + when.getUTCSeconds();
  return `${yyyy}-${mm}-${dd}_${secs.toString().padStart(6, '0')}.jsonl`;
}

function isoWeekParts(d: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { year: isoYear, week };
}
