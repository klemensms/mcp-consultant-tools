/**
 * Reading a PowerPoint deck's slide text and speaker notes, and replacing
 * text in it. The .pptx is unzipped in memory; only the slide and notes parts
 * that change are reserialised, every other part is zipped back untouched.
 */
import { posix } from 'node:path';
import { unzipSync, zipSync, strFromU8, strToU8, type Unzipped } from 'fflate';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { ContentCore, ItemRef, WriteResult } from './content-core.js';
import { countMatches, paragraphText, replaceInParagraph, type TextModel } from './ooxml-text.js';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

type El = any;
const is = (node: any, ns: string, local: string) => node?.nodeType === 1 && node.namespaceURI === ns && node.localName === local;
const all = (el: El, ns: string, local: string): El[] => Array.from(el.getElementsByTagNameNS(ns, local) as ArrayLike<any>);

/** DrawingML paragraphs: a:t in a run is editable; breaks and fields (slide numbers, dates) are fixed. */
const DRAWING_TEXT: TextModel = {
  isText: (el) => is(el, A, 't') && is(el.parentNode, A, 'r'),
  fixedText: (el) => (is(el, A, 'br') ? '\n' : is(el, A, 'fld') ? el.textContent ?? '' : undefined),
  skip: (el) => is(el, A, 'pPr') || is(el, A, 'rPr') || is(el, A, 'endParaRPr'),
  preserveSpace: false,
};

export interface SlideText {
  number: number;
  title?: string;
  /** Every other paragraph on the slide, in shape order, empty ones left out. */
  text: string[];
  notes: string[];
}

export interface PowerPointReadResult {
  name: string;
  webUrl: string;
  /** Pass this to spo-edit-powerpoint; the edit is refused if the file changes in between. */
  eTag: string;
  lastModifiedDateTime?: string;
  size: number;
  slides: SlideText[];
}

export interface PowerPointReplacement {
  text: string;
  replacement: string;
  /** Limit to one slide (1-based), its notes included. */
  slide?: number;
  /** Replace every match; without it a text found in more than one place is refused. */
  all?: boolean;
}

export interface PowerPointEditResult extends WriteResult {
  applied: string[];
  notes: string[];
}

interface SlidePart {
  number: number;
  path: string;
  doc: El;
  notesPath?: string;
  notesDoc?: El;
}

function placeholderType(sp: El): string | undefined {
  const ph = all(sp, P, 'ph')[0];
  return ph ? ph.getAttribute('type') || 'body' : undefined;
}

class Deck {
  readonly slides: SlidePart[];
  private readonly changed = new Set<string>();
  private readonly docs = new Map<string, El>();

  constructor(private readonly files: Unzipped) {
    const presentation = this.xml('ppt/presentation.xml');
    if (!presentation) throw new Error('not a valid PowerPoint deck (no ppt/presentation.xml).');
    const rels = this.relationships('ppt/presentation.xml');
    this.slides = all(presentation, P, 'sldId').map((sldId, i) => {
      const path = rels.get(sldId.getAttributeNS(R, 'id'))?.path;
      const doc = path ? this.xml(path) : undefined;
      if (!path || !doc) throw new Error(`not a valid PowerPoint deck (slide ${i + 1} is missing).`);
      const notes = [...this.relationships(path).values()].find((r) => r.type.endsWith('/notesSlide'));
      return { number: i + 1, path, doc, notesPath: notes?.path, notesDoc: notes ? this.xml(notes.path) : undefined };
    });
  }

  static parse(bytes: Buffer): Deck {
    let files: Unzipped;
    try {
      files = unzipSync(new Uint8Array(bytes));
    } catch {
      throw new Error('not a valid PowerPoint deck (it is not a .pptx zip package).');
    }
    return new Deck(files);
  }

  private xml(path: string): El | undefined {
    if (this.docs.has(path)) return this.docs.get(path);
    const raw = this.files[path];
    if (!raw) return undefined;
    const doc = new DOMParser().parseFromString(strFromU8(raw), 'text/xml');
    this.docs.set(path, doc);
    return doc;
  }

  /** Relationship id to target part path, resolved against the source part's folder. */
  private relationships(part: string): Map<string, { path: string; type: string }> {
    const relsPath = posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`);
    const doc = this.xml(relsPath);
    const map = new Map<string, { path: string; type: string }>();
    if (!doc) return map;
    for (const rel of Array.from(doc.getElementsByTagNameNS(REL, 'Relationship') as ArrayLike<any>)) {
      if (rel.getAttribute('TargetMode') === 'External') continue;
      const target: string = rel.getAttribute('Target');
      const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(part), target));
      map.set(rel.getAttribute('Id'), { path, type: rel.getAttribute('Type') ?? '' });
    }
    return map;
  }

  /** The paragraphs of a slide or notes part, each with the placeholder type of its shape. */
  paragraphs(doc: El): Array<{ p: El; ph?: string }> {
    const out: Array<{ p: El; ph?: string }> = [];
    for (const p of all(doc, A, 'p')) {
      let el = p.parentNode;
      while (el && !is(el, P, 'sp') && !is(el, P, 'graphicFrame')) el = el.parentNode;
      out.push({ p, ph: el && is(el, P, 'sp') ? placeholderType(el) : undefined });
    }
    return out;
  }

  markChanged(path: string): void {
    this.changed.add(path);
  }

  bytes(): Buffer {
    const out: Unzipped = { ...this.files };
    for (const path of this.changed) {
      let xml = new XMLSerializer().serializeToString(this.docs.get(path));
      if (!xml.startsWith('<?xml')) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
      out[path] = strToU8(xml);
    }
    return Buffer.from(zipSync(out));
  }
}

const TITLE = new Set(['title', 'ctrTitle']);

function slideText(deck: Deck, slide: SlidePart): SlideText {
  const titles: string[] = [];
  const text: string[] = [];
  for (const { p, ph } of deck.paragraphs(slide.doc)) {
    const value = paragraphText(p, DRAWING_TEXT);
    if (!value.trim()) continue;
    (ph && TITLE.has(ph) ? titles : text).push(value);
  }
  const notes = slide.notesDoc
    ? deck.paragraphs(slide.notesDoc).filter((x) => x.ph === 'body').map((x) => paragraphText(x.p, DRAWING_TEXT)).filter((t) => t.trim())
    : [];
  return { number: slide.number, ...(titles.length ? { title: titles.join(' ') } : {}), text, notes };
}

export class PowerPointContent {
  constructor(private readonly core: ContentCore) {}

  async read(ref: ItemRef): Promise<PowerPointReadResult> {
    this.core.access.checkRead('powerpoint');
    const item = await this.core.locate(ref, ['powerpoint']);
    const deck = this.parse(item.name, await this.core.readBytes(item));
    return {
      name: item.name,
      webUrl: item.webUrl,
      eTag: item.eTag,
      lastModifiedDateTime: item.lastModifiedDateTime,
      size: item.size,
      slides: deck.slides.map((s) => slideText(deck, s)),
    };
  }

  /** Apply every replacement, or none: any failure refuses the whole edit before anything is written. */
  async edit(ref: ItemRef, replacements: PowerPointReplacement[], eTag: string): Promise<PowerPointEditResult> {
    this.core.access.checkWrite('powerpoint');
    if (!Array.isArray(replacements) || replacements.length === 0) throw new Error('Give at least one replacement.');
    const item = await this.core.locate(ref, ['powerpoint']);
    const deck = this.parse(item.name, await this.core.readBytes(item));

    const applied: string[] = [];
    const notes: string[] = [];
    replacements.forEach((r, i) => {
      if (typeof r.text !== 'string' || r.text === '') throw new Error(`Replacement ${i + 1} needs text.`);
      if (typeof r.replacement !== 'string') throw new Error(`Replacement ${i + 1} needs replacement.`);
      if (r.slide !== undefined && !deck.slides[r.slide - 1]) {
        throw new Error(`Replacement ${i + 1}: no slide ${r.slide}; the deck has ${deck.slides.length} slides.`);
      }
      const where = r.slide !== undefined ? ` on slide ${r.slide}` : '';
      const parts = (r.slide !== undefined ? [deck.slides[r.slide - 1]] : deck.slides).flatMap((s) => [
        { path: s.path, doc: s.doc },
        ...(s.notesPath && s.notesDoc ? [{ path: s.notesPath, doc: s.notesDoc }] : []),
      ]);
      const targets = parts.flatMap((part) => deck.paragraphs(part.doc).map(({ p }) => ({ path: part.path, p })));

      const total = targets.reduce((n, t) => n + countMatches(t.p, r.text, DRAWING_TEXT), 0);
      if (total === 0) throw new Error(`Replacement ${i + 1}: '${r.text}' was not found${where}.`);
      if (total > 1 && !r.all) {
        throw new Error(`Replacement ${i + 1}: '${r.text}' appears in ${total} places${where}. Set all to replace every one, give a slide, or give more surrounding text.`);
      }
      let spanning = 0;
      for (const t of targets) {
        const done = replaceInParagraph(t.p, r.text, r.replacement, r.all ? Infinity : 1, DRAWING_TEXT);
        if (done.replaced) deck.markChanged(t.path);
        spanning += done.spanning;
        if (!r.all && done.replaced) break;
      }
      applied.push(`replace '${r.text}': ${total} ${total === 1 ? 'match' : 'matches'}${where}`);
      if (spanning) notes.push(`${spanning} replacement(s) of '${r.text}' spanned differently formatted runs and took the first run's formatting.`);
    });

    const saved = await this.core.writeBytes(item, deck.bytes(), eTag);
    return { ...saved, applied, notes };
  }

  private parse(name: string, bytes: Buffer): Deck {
    try {
      return Deck.parse(bytes);
    } catch (error: any) {
      throw new Error(`'${name}' is ${error.message}`);
    }
  }
}
