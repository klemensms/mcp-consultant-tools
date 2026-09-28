import { describe, it, expect } from 'vitest';
import { contentAccess, formatOf } from '../services/content/content-access.js';

describe('formatOf', () => {
  it('maps extensions to formats, case-insensitively', () => {
    expect(formatOf('notes.MD')).toBe('text');
    expect(formatOf('data.csv')).toBe('text');
    expect(formatOf('Budget.xlsx')).toBe('excel');
    expect(formatOf('macro.xlsm')).toBe('excel');
    expect(formatOf('Report.docx')).toBe('word');
    expect(formatOf('Deck.pptx')).toBe('powerpoint');
  });

  it('returns undefined for formats the content tools do not handle', () => {
    expect(formatOf('old.doc')).toBeUndefined();
    expect(formatOf('image.png')).toBeUndefined();
    expect(formatOf('no-extension')).toBeUndefined();
  });
});

describe('contentAccess', () => {
  it('defaults to reading every format and writing none', () => {
    const access = contentAccess({});
    expect(access.read).toEqual(['text', 'excel', 'word', 'powerpoint']);
    expect(access.write).toEqual([]);
    expect(access.maxBytes).toBe(25 * 1024 * 1024);
  });

  it('accepts all, none and comma lists, ignoring case and spaces', () => {
    const access = contentAccess({
      SHAREPOINT_CONTENT_READ: 'none',
      SHAREPOINT_CONTENT_WRITE: ' Excel , word ',
      SHAREPOINT_CONTENT_MAX_MB: '5',
    });
    expect(access.read).toEqual([]);
    expect(access.write).toEqual(['excel', 'word']);
    expect(access.maxBytes).toBe(5 * 1024 * 1024);
    expect(contentAccess({ SHAREPOINT_CONTENT_WRITE: 'ALL' }).write).toEqual(['text', 'excel', 'word', 'powerpoint']);
  });

  it('rejects an unknown format name and lists the allowed ones', () => {
    expect(() => contentAccess({ SHAREPOINT_CONTENT_WRITE: 'excel,pdf' })).toThrow(
      /SHAREPOINT_CONTENT_WRITE.*'pdf'.*text, excel, word, powerpoint/
    );
  });

  it('rejects a size cap that is not a positive number', () => {
    expect(() => contentAccess({ SHAREPOINT_CONTENT_MAX_MB: 'lots' })).toThrow(/SHAREPOINT_CONTENT_MAX_MB/);
  });

  it('a disabled read names the setting and a value that enables it', () => {
    const access = contentAccess({ SHAREPOINT_CONTENT_READ: 'text' });
    expect(() => access.checkRead('word')).toThrow(/Reading Word files is off.*SHAREPOINT_CONTENT_READ.*word/);
    expect(() => access.checkRead('text')).not.toThrow();
  });

  it('a disabled write names the setting and a value that enables it', () => {
    const access = contentAccess({});
    expect(() => access.checkWrite('excel')).toThrow(/Editing Excel files is off.*SHAREPOINT_CONTENT_WRITE.*excel/);
  });
});
