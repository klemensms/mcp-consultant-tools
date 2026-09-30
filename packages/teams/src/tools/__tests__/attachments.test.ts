import { describe, it, expect } from 'vitest';
import { formatAttachmentDownload } from '../attachments.js';

const base = { messageId: '1616990032035', outputDir: '/tmp/out', downloaded: [], skipped: [], failed: [] };

describe('formatAttachmentDownload', () => {
  it('says plainly when a message carries nothing', () => {
    expect(formatAttachmentDownload(base)).toBe('No images or files found in message 1616990032035.');
  });

  it('prints each saved path, and each failure with its reason', () => {
    const text = formatAttachmentDownload({
      ...base,
      downloaded: [{ kind: 'file', name: 'Report.pdf', path: '/tmp/out/Report.pdf', size: 2048, contentType: 'application/pdf' }],
      failed: [{ name: 'Secret.docx', reason: 'access denied' }],
    });
    expect(text).toContain('/tmp/out/Report.pdf');
    expect(text).toContain('2 KB');
    expect(text).toContain('- Secret.docx: access denied');
  });

  it('gives an unnamed item its reason alone rather than a leading colon', () => {
    const text = formatAttachmentDownload({ ...base, skipped: [{ name: '', reason: 'a quoted reply, not a file' }] });
    expect(text).toContain('- a quoted reply, not a file');
    expect(text).not.toContain('- : ');
  });
});
