/**
 * Which file formats the content tools may read and change, from
 * SHAREPOINT_CONTENT_READ, SHAREPOINT_CONTENT_WRITE and SHAREPOINT_CONTENT_MAX_MB.
 * Independent of SHAREPOINT_ENABLE_WRITE, which governs file operations
 * (upload, copy, move, rename, create folder).
 */

export type ContentFormat = 'text' | 'excel' | 'word' | 'powerpoint';

export const CONTENT_FORMATS: ContentFormat[] = ['text', 'excel', 'word', 'powerpoint'];

const LABELS: Record<ContentFormat, string> = {
  text: 'text',
  excel: 'Excel',
  word: 'Word',
  powerpoint: 'PowerPoint',
};

const EXTENSIONS: Record<string, ContentFormat> = {
  txt: 'text',
  md: 'text',
  markdown: 'text',
  csv: 'text',
  json: 'text',
  xml: 'text',
  yaml: 'text',
  yml: 'text',
  html: 'text',
  htm: 'text',
  xlsx: 'excel',
  xlsm: 'excel',
  docx: 'word',
  pptx: 'powerpoint',
};

const DEFAULT_MAX_MB = 25;

/** The content format for a file name, or undefined when the content tools do not handle it. */
export function formatOf(fileName: string): ContentFormat | undefined {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return undefined;
  return EXTENSIONS[fileName.slice(dot + 1).toLowerCase()];
}

export function formatLabel(format: ContentFormat): string {
  return LABELS[format];
}

export interface ContentAccess {
  read: ContentFormat[];
  write: ContentFormat[];
  maxBytes: number;
  checkRead(format: ContentFormat): void;
  checkWrite(format: ContentFormat): void;
}

function parseFormats(name: string, raw: string | undefined, fallback: ContentFormat[]): ContentFormat[] {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (value === 'all') return [...CONTENT_FORMATS];
  if (value === 'none') return [];
  const formats: ContentFormat[] = [];
  for (const part of value.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (!CONTENT_FORMATS.includes(part as ContentFormat)) {
      throw new Error(
        `Invalid ${name} value '${part}'. Use all, none, or a comma list of: ${CONTENT_FORMATS.join(', ')}.`
      );
    }
    if (!formats.includes(part as ContentFormat)) formats.push(part as ContentFormat);
  }
  return formats;
}

function enableHint(current: ContentFormat[], format: ContentFormat): string {
  return [...current, format].join(',');
}

export function contentAccess(env: Record<string, string | undefined> = process.env): ContentAccess {
  const read = parseFormats('SHAREPOINT_CONTENT_READ', env.SHAREPOINT_CONTENT_READ, [...CONTENT_FORMATS]);
  const write = parseFormats('SHAREPOINT_CONTENT_WRITE', env.SHAREPOINT_CONTENT_WRITE, []);

  const rawMax = env.SHAREPOINT_CONTENT_MAX_MB;
  const maxMb = rawMax === undefined || rawMax.trim() === '' ? DEFAULT_MAX_MB : Number(rawMax);
  if (!Number.isFinite(maxMb) || maxMb <= 0) {
    throw new Error(`Invalid SHAREPOINT_CONTENT_MAX_MB value '${rawMax}'. Use a positive number of megabytes.`);
  }

  return {
    read,
    write,
    maxBytes: Math.round(maxMb * 1024 * 1024),
    checkRead(format) {
      if (!read.includes(format)) {
        throw new Error(
          `Reading ${LABELS[format]} files is off. Set SHAREPOINT_CONTENT_READ=${enableHint(read, format)} (or all) to turn it on.`
        );
      }
    },
    checkWrite(format) {
      if (!write.includes(format)) {
        throw new Error(
          `Editing ${LABELS[format]} files is off. Set SHAREPOINT_CONTENT_WRITE=${enableHint(write, format)} (or all) to turn it on.`
        );
      }
    },
  };
}
