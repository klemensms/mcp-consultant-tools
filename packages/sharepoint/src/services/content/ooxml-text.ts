/**
 * Finding and replacing text inside an Office Open XML paragraph whose text is
 * split across runs (Word w:p, PowerPoint a:p). Only text nodes are edited;
 * run formatting, tabs, breaks and fields stay where they are.
 */

type El = any;

/** How a paragraph's descendants carry text. */
export interface TextModel {
  /** Editable text node, such as w:t or a:t. */
  isText(el: El): boolean;
  /** Visible but not editable, such as a tab, break or field: the text it stands for. */
  fixedText(el: El): string | undefined;
  /** Contributes no text and is not searched, such as run properties or deleted text. */
  skip(el: El): boolean;
  /** Set xml:space="preserve" on an edited text node (Word needs it; DrawingML does not). */
  preserveSpace: boolean;
}

interface Segment {
  node: El | null;
  text: string;
}

export function segments(p: El, model: TextModel): Segment[] {
  const out: Segment[] = [];
  const walk = (el: El) => {
    for (const n of Array.from(el.childNodes as ArrayLike<any>)) {
      if (n.nodeType !== 1) continue;
      if (model.isText(n)) {
        out.push({ node: n, text: n.textContent ?? '' });
        continue;
      }
      const fixed = model.fixedText(n);
      if (fixed !== undefined) out.push({ node: null, text: fixed });
      else if (!model.skip(n)) walk(n);
    }
  };
  walk(p);
  return out;
}

export const paragraphText = (p: El, model: TextModel) => segments(p, model).map((s) => s.text).join('');

function editableSpan(segs: Segment[], start: number, end: number): boolean {
  let pos = 0;
  for (const s of segs) {
    const next = pos + s.text.length;
    if (!s.node && next > start && pos < end) return false;
    pos = next;
  }
  return true;
}

function nextMatch(segs: Segment[], find: string, from: number): number {
  const text = segs.map((s) => s.text).join('');
  let at = text.indexOf(find, from);
  while (at >= 0 && !editableSpan(segs, at, at + find.length)) at = text.indexOf(find, at + find.length);
  return at;
}

/** Occurrences of `find` that lie wholly on editable text. */
export function countMatches(p: El, find: string, model: TextModel): number {
  const segs = segments(p, model);
  let count = 0;
  for (let at = nextMatch(segs, find, 0); at >= 0; at = nextMatch(segs, find, at + find.length)) count++;
  return count;
}

/**
 * Replace up to `limit` matches in place. The replacement goes into the text
 * node where the match starts, so it takes that run's formatting; the rest of
 * the match is removed from the following nodes.
 */
export function replaceInParagraph(p: El, find: string, replacement: string, limit: number, model: TextModel): { replaced: number; spanning: number } {
  let replaced = 0;
  let spanning = 0;
  let from = 0;
  while (replaced < limit) {
    const segs = segments(p, model);
    const at = nextMatch(segs, find, from);
    if (at < 0) break;
    const end = at + find.length;
    let pos = 0;
    let touched = 0;
    for (const s of segs) {
      const segStart = pos;
      const segEnd = pos + s.text.length;
      pos = segEnd;
      if (!s.node || segEnd <= at || segStart >= end) continue;
      const before = s.text.slice(0, Math.max(0, at - segStart));
      const after = s.text.slice(Math.max(0, end - segStart));
      s.node.textContent = before + (touched === 0 ? replacement : '') + after;
      if (model.preserveSpace) s.node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      touched++;
    }
    if (touched > 1) spanning++;
    replaced++;
    from = at + replacement.length;
  }
  return { replaced, spanning };
}
