/**
 * Reading a Word document as Markdown with paragraph anchors, and editing it
 * with a list of operations. The .docx is unzipped in memory, word/document.xml
 * is patched as a DOM, and every other part is zipped back untouched.
 */
import { unzipSync, zipSync, strFromU8, strToU8, type Unzipped } from 'fflate';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { ContentCore, ItemRef, WriteResult } from './content-core.js';
import { countMatches, paragraphText as textOf, replaceInParagraph, type TextModel } from './ooxml-text.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const DOCUMENT = 'word/document.xml';

export interface WordReadResult {
  name: string;
  webUrl: string;
  /** Pass this to spo-edit-word; the edit is refused if the file changes in between. */
  eTag: string;
  lastModifiedDateTime?: string;
  size: number;
  /** Number of anchored blocks (paragraphs and tables), p1 to pN. */
  blockCount: number;
  markdown: string;
}

export type WordOperation =
  | { op: 'replace'; text: string; replacement: string; all?: boolean }
  | { op: 'insertAfter' | 'insertBefore'; anchor: string; text: string; style?: string }
  | { op: 'append'; text: string; style?: string }
  | { op: 'delete'; anchor: string };

export interface WordEditResult extends WriteResult {
  /** One line per operation, in order. */
  applied: string[];
  /** Things worth knowing about the result, such as formatting taken from the first run. */
  notes: string[];
}

type Doc = ReturnType<DOMParser['parseFromString']>;
type El = any;

const isW = (node: any, local: string) => node?.nodeType === 1 && node.namespaceURI === W && node.localName === local;
const childrenW = (el: El, local: string): El[] => Array.from(el.childNodes as ArrayLike<any>).filter((n) => isW(n, local));

class WordDocument {
  readonly doc: Doc;
  readonly body: El;
  readonly styles: Set<string>;

  constructor(readonly files: Unzipped) {
    const xml = files[DOCUMENT];
    if (!xml) throw new Error('not a valid Word document (no word/document.xml).');
    this.doc = new DOMParser().parseFromString(strFromU8(xml), 'text/xml');
    const body = this.doc.getElementsByTagNameNS(W, 'body')[0];
    if (!body) throw new Error('not a valid Word document (no document body).');
    this.body = body;
    this.styles = new Set();
    const styles = files['word/styles.xml'];
    if (styles) {
      const sdoc = new DOMParser().parseFromString(strFromU8(styles), 'text/xml');
      for (const s of Array.from(sdoc.getElementsByTagNameNS(W, 'style') as ArrayLike<any>)) {
        const id = s.getAttributeNS(W, 'styleId');
        if (id) this.styles.add(id);
      }
    }
  }

  static parse(bytes: Buffer): WordDocument {
    let files: Unzipped;
    try {
      files = unzipSync(new Uint8Array(bytes));
    } catch {
      throw new Error('not a valid Word document (it is not a .docx zip package).');
    }
    return new WordDocument(files);
  }

  /** Top-level paragraphs and tables, in body order: the anchored blocks. */
  blocks(): El[] {
    return Array.from(this.body.childNodes as ArrayLike<any>).filter((n) => isW(n, 'p') || isW(n, 'tbl'));
  }

  bytes(): Buffer {
    let xml = new XMLSerializer().serializeToString(this.doc as any);
    if (!xml.startsWith('<?xml')) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
    return Buffer.from(zipSync({ ...this.files, [DOCUMENT]: strToU8(xml) }));
  }

  newParagraph(text: string, style?: string): El {
    const p = this.doc.createElementNS(W, 'w:p');
    if (style) {
      const pPr = this.doc.createElementNS(W, 'w:pPr');
      const pStyle = this.doc.createElementNS(W, 'w:pStyle');
      pStyle.setAttributeNS(W, 'w:val', style);
      pPr.appendChild(pStyle);
      p.appendChild(pPr);
    }
    const r = this.doc.createElementNS(W, 'w:r');
    const t = this.doc.createElementNS(W, 'w:t');
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.appendChild(this.doc.createTextNode(text));
    r.appendChild(t);
    p.appendChild(r);
    return p;
  }
}

/** Word paragraphs: w:t is editable; tabs and breaks are fixed; properties and deleted or field-code text are skipped. */
const WORD_TEXT: TextModel = {
  isText: (el) => isW(el, 't'),
  fixedText: (el) => (isW(el, 'tab') ? '\t' : isW(el, 'br') || isW(el, 'cr') ? '\n' : undefined),
  skip: (el) => isW(el, 'pPr') || isW(el, 'rPr') || isW(el, 'del') || isW(el, 'instrText'),
  preserveSpace: true,
};

const paragraphText = (p: El) => textOf(p, WORD_TEXT);

function styleOf(p: El): string | undefined {
  const pPr = childrenW(p, 'pPr')[0];
  const pStyle = pPr && childrenW(pPr, 'pStyle')[0];
  return pStyle?.getAttributeNS(W, 'val') || undefined;
}

function isListItem(p: El): boolean {
  const pPr = childrenW(p, 'pPr')[0];
  return Boolean(pPr && childrenW(pPr, 'numPr').length) || /^List(Bullet|Number)/i.test(styleOf(p) ?? '');
}

function paragraphMarkdown(p: El): string {
  const text = paragraphText(p);
  const style = styleOf(p) ?? '';
  const heading = /^Heading([1-6])$/i.exec(style);
  if (heading) return `${'#'.repeat(Number(heading[1]))} ${text}`;
  if (/^Title$/i.test(style)) return `# ${text}`;
  if (isListItem(p)) return `- ${text}`;
  return text;
}

function tableMarkdown(tbl: El): string {
  const cell = (tc: El) =>
    Array.from(tc.getElementsByTagNameNS(W, 'p') as ArrayLike<any>)
      .map(paragraphText)
      .join(' ')
      .replace(/\|/g, '\\|')
      .replace(/\s*\n\s*/g, ' ');
  const rows = childrenW(tbl, 'tr').map((tr) => childrenW(tr, 'tc').map(cell));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  return [line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}

export function wordMarkdown(word: WordDocument): string {
  return word
    .blocks()
    .map((block, i) => (isW(block, 'tbl') ? `[p${i + 1}]\n${tableMarkdown(block)}` : `[p${i + 1}] ${paragraphMarkdown(block)}`))
    .join('\n\n');
}

function need(op: any, field: string, i: number): string {
  const value = op[field];
  if (typeof value !== 'string' || value === '') throw new Error(`Operation ${i + 1} (${op.op}) needs ${field}.`);
  return value;
}

export class WordContent {
  constructor(private readonly core: ContentCore) {}

  async read(ref: ItemRef): Promise<WordReadResult> {
    this.core.access.checkRead('word');
    const item = await this.core.locate(ref, ['word']);
    const word = this.parse(item.name, await this.core.readBytes(item));
    return {
      name: item.name,
      webUrl: item.webUrl,
      eTag: item.eTag,
      lastModifiedDateTime: item.lastModifiedDateTime,
      size: item.size,
      blockCount: word.blocks().length,
      markdown: wordMarkdown(word),
    };
  }

  /**
   * Apply every operation, or none: any failure refuses the whole edit before
   * anything is written. Anchors refer to the numbering of the read.
   */
  async edit(ref: ItemRef, operations: WordOperation[], eTag: string): Promise<WordEditResult> {
    this.core.access.checkWrite('word');
    if (!Array.isArray(operations) || operations.length === 0) throw new Error('Give at least one operation.');
    const item = await this.core.locate(ref, ['word']);
    const word = this.parse(item.name, await this.core.readBytes(item));

    const blocks = word.blocks();
    const deleted = new Set<string>();
    const block = (anchor: string, i: number): El => {
      const m = /^\[?p(\d+)\]?$/i.exec(anchor.trim());
      const found = m ? blocks[Number(m[1]) - 1] : undefined;
      if (!found) throw new Error(`Operation ${i + 1}: No block ${anchor} in this document (it has p1 to p${blocks.length}).`);
      if (deleted.has(`p${m![1]}`)) throw new Error(`Operation ${i + 1}: ${anchor} was deleted by an earlier operation.`);
      return found;
    };
    const checkStyle = (style: string | undefined) => {
      if (style && !word.styles.has(style)) notes.push(`Style '${style}' is not defined in this document, so Word shows the paragraph as Normal.`);
    };

    const applied: string[] = [];
    const notes: string[] = [];
    operations.forEach((op: any, i) => {
      switch (op.op) {
        case 'replace': {
          const find = need(op, 'text', i);
          if (typeof op.replacement !== 'string') throw new Error(`Operation ${i + 1} (replace) needs replacement.`);
          const paragraphs = Array.from(word.body.getElementsByTagNameNS(W, 'p') as ArrayLike<any>);
          const total = paragraphs.reduce((n, p) => n + countMatches(p, find, WORD_TEXT), 0);
          if (total === 0) throw new Error(`Operation ${i + 1}: '${find}' was not found in the document.`);
          if (total > 1 && !op.all) {
            throw new Error(`Operation ${i + 1}: '${find}' appears in ${total} places. Set all to replace every one, or give more surrounding text.`);
          }
          let spanning = 0;
          for (const p of paragraphs) spanning += replaceInParagraph(p, find, op.replacement, op.all ? Infinity : 1, WORD_TEXT).spanning;
          applied.push(`replace '${find}': ${total} ${total === 1 ? 'match' : 'matches'}`);
          if (spanning) notes.push(`${spanning} replacement(s) of '${find}' spanned differently formatted runs and took the first run's formatting.`);
          break;
        }
        case 'insertAfter':
        case 'insertBefore': {
          const anchor = need(op, 'anchor', i);
          const text = need(op, 'text', i);
          const target = block(anchor, i);
          checkStyle(op.style);
          const lines = text.split('\n');
          const reference = op.op === 'insertAfter' ? target.nextSibling : target;
          for (const line of lines) word.body.insertBefore(word.newParagraph(line, op.style), reference);
          applied.push(`${op.op} ${anchor}: ${lines.length} paragraph(s)`);
          break;
        }
        case 'append': {
          const text = need(op, 'text', i);
          checkStyle(op.style);
          const sectPr = childrenW(word.body, 'sectPr')[0] ?? null;
          const lines = text.split('\n');
          for (const line of lines) word.body.insertBefore(word.newParagraph(line, op.style), sectPr);
          applied.push(`append: ${lines.length} paragraph(s)`);
          break;
        }
        case 'delete': {
          const anchor = need(op, 'anchor', i);
          const target = block(anchor, i);
          if (word.blocks().length === 1) throw new Error(`Operation ${i + 1}: ${anchor} is the only block left; a document needs at least one.`);
          word.body.removeChild(target);
          deleted.add(`p${/\d+/.exec(anchor)![0]}`);
          applied.push(`delete ${anchor}`);
          break;
        }
        default:
          throw new Error(`Operation ${i + 1}: unknown op '${op.op}'. Use replace, insertAfter, insertBefore, append or delete.`);
      }
    });

    const saved = await this.core.writeBytes(item, word.bytes(), eTag);
    return { ...saved, applied, notes };
  }

  private parse(name: string, bytes: Buffer): WordDocument {
    try {
      return WordDocument.parse(bytes);
    } catch (error: any) {
      throw new Error(`'${name}' is ${error.message}`);
    }
  }
}
