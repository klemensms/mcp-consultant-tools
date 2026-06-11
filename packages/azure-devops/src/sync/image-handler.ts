/**
 * Image Reference Handler
 *
 * Detects and rewrites image references in ADO work item content.
 *
 * Two source forms are recognised:
 *   - HTML <img src="..."> (raw HTML, typically pre-conversion)
 *   - Markdown ![alt](src) (post Turndown conversion or hand-written)
 *
 * Each <img>/![] reference is parsed; if the URL points at an ADO work item
 * attachment (`_apis/wit/attachments/{guid}`), we extract the GUID, fileName,
 * and project GUID. Callers can then download the file and rewrite the source
 * to a local relative path — or, on push, walk the manifest and rewrite local
 * paths back to the original ADO URL.
 */

export interface AdoAttachmentRef {
  /** Attachment GUID extracted from the URL path */
  guid: string;
  /** Filename inferred from the `fileName` query param or the alt text */
  fileName: string;
  /** Project GUID from the URL (e.g. e4476c68-75d1-4d4b-...) */
  projectGuid?: string;
  /** The full original URL */
  originalUrl: string;
}

export interface ImageRef {
  /** Original src/url string from the markdown or HTML */
  originalSrc: string;
  /** True when the src is an HTML <img src="..."> tag (vs markdown ![]()) */
  isHtmlTag: boolean;
  /** Index of the match in the source string (for ordered processing) */
  index: number;
  /** Length of the matched substring */
  length: number;
  /** Parsed ADO attachment metadata, when the URL is an ADO attachment */
  adoAttachment?: AdoAttachmentRef;
}

/**
 * Parse an ADO work item attachment URL.
 *
 * Recognised patterns:
 *   https://dev.azure.com/{org}/{projectGuid}/_apis/wit/attachments/{guid}?fileName=image.png&...
 *   https://dev.azure.com/{org}/_apis/wit/attachments/{guid}?fileName=image.png&...
 *
 * Returns null when the URL is not an ADO attachment URL.
 */
export function parseAdoAttachmentUrl(url: string): AdoAttachmentRef | null {
  // Match _apis/wit/attachments/{guid} anywhere in the URL.
  // GUID = 8-4-4-4-12 hex chars
  const guidPattern = /\/_apis\/wit\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
  const guidMatch = url.match(guidPattern);
  if (!guidMatch) return null;

  const guid = guidMatch[1];

  // Try to extract project GUID (segment between org and _apis).
  // dev.azure.com/{org}/{projectGuid}/_apis/...
  let projectGuid: string | undefined;
  const projectGuidPattern = /dev\.azure\.com\/[^/]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/_apis\//i;
  const projectMatch = url.match(projectGuidPattern);
  if (projectMatch) {
    projectGuid = projectMatch[1];
  }

  // Extract fileName from query string; fall back to a sensible default.
  let fileName = 'attachment.bin';
  try {
    const u = new URL(url);
    const qsName = u.searchParams.get('fileName');
    if (qsName) fileName = qsName;
  } catch {
    const qsMatch = url.match(/[?&]fileName=([^&#]+)/);
    if (qsMatch) {
      try { fileName = decodeURIComponent(qsMatch[1]); } catch { fileName = qsMatch[1]; }
    }
  }

  return { guid, fileName, projectGuid, originalUrl: url };
}

/**
 * Extract every image reference from a string of HTML or markdown content.
 *
 * Returns refs in source order. Both HTML <img> tags and markdown ![]() are
 * detected. Refs whose URL parses as an ADO attachment have `adoAttachment`
 * populated.
 */
export function extractImageRefs(content: string): ImageRef[] {
  if (!content) return [];

  const refs: ImageRef[] = [];

  // HTML <img src="..."> — handles both " and ' delimiters and self-closing
  const htmlRegex = /<img[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = htmlRegex.exec(content)) !== null) {
    const src = m[1] || m[2];
    if (!src) continue;
    refs.push({
      originalSrc: src,
      isHtmlTag: true,
      index: m.index,
      length: m[0].length,
      adoAttachment: parseAdoAttachmentUrl(src) ?? undefined,
    });
  }

  // Markdown ![alt](url) — url terminates at whitespace or close paren
  const mdRegex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  while ((m = mdRegex.exec(content)) !== null) {
    const src = m[1];
    if (!src) continue;
    refs.push({
      originalSrc: src,
      isHtmlTag: false,
      index: m.index,
      length: m[0].length,
      adoAttachment: parseAdoAttachmentUrl(src) ?? undefined,
    });
  }

  return refs.sort((a, b) => a.index - b.index);
}

/**
 * Rewrite image src/url values in content using a mapper function.
 *
 * The mapper receives the original src and the parsed ADO attachment (if any)
 * and returns the new src to substitute. Returning null/undefined leaves the
 * original src in place.
 *
 * Both HTML <img src="..."> and markdown ![](src) forms are rewritten.
 */
export function rewriteImageSrcs(
  content: string,
  mapper: (src: string, ado: AdoAttachmentRef | undefined) => string | null | undefined,
): string {
  if (!content) return content;

  // Rewrite HTML <img src="...">
  let result = content.replace(
    /(<img[^>]*\bsrc\s*=\s*)(?:"([^"]+)"|'([^']+)')([^>]*\/?>)/gi,
    (_match, before, dq, sq, after) => {
      const src = dq ?? sq;
      const ado = parseAdoAttachmentUrl(src) ?? undefined;
      const newSrc = mapper(src, ado);
      const finalSrc = newSrc ?? src;
      // Preserve the original quote style
      const quote = dq !== undefined ? '"' : "'";
      return `${before}${quote}${finalSrc}${quote}${after}`;
    }
  );

  // Rewrite markdown ![alt](url "optional title")
  result = result.replace(
    /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
    (_match, before, src, after) => {
      const ado = parseAdoAttachmentUrl(src) ?? undefined;
      const newSrc = mapper(src, ado);
      const finalSrc = newSrc ?? src;
      return `${before}${finalSrc}${after}`;
    }
  );

  return result;
}
