/**
 * Generative UI View - renders LLM-generated HTML in the MCP App iframe.
 *
 * Provides:
 * 1. HTML injection with script re-execution
 * 2. Clipboard helpers exposed on window for inline onclick handlers
 * 3. Image capture via html2canvas with clipboard copy
 *
 * All interactive functions are defined HERE (in Vite-bundled code) because:
 * - We need proper Promise rejection handling for navigator.clipboard
 * - execCommand('copy') fallback requires careful focus/selection management
 * - Image capture needs controlled html2canvas loading and multi-step fallback
 * - Bundled code guarantees functions exist before any onclick handler fires
 */

// ── Text clipboard helpers ──────────────────────────────────────────

function copyTextToClipboard(text: string, btnEl?: HTMLElement): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => flashCopied(btnEl),
      () => execCommandCopy(text, btnEl)
    );
    return;
  }
  execCommandCopy(text, btnEl);
}

function execCommandCopy(text: string, btnEl?: HTMLElement): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const ok = document.execCommand('copy');
    if (ok) {
      flashCopied(btnEl);
    } else {
      promptCopy(text, btnEl);
    }
  } catch {
    promptCopy(text, btnEl);
  } finally {
    document.body.removeChild(ta);
  }
}

function promptCopy(text: string, _btnEl?: HTMLElement): void {
  window.prompt('Copy this (Ctrl+C / Cmd+C):', text);
}

function flashCopied(el?: HTMLElement): void {
  if (!el) return;
  if (!el.dataset.origText) {
    el.dataset.origText = el.textContent || '';
  }
  const origBg = el.style.background;
  el.textContent = 'Copied!';
  el.style.background = '#009900';
  setTimeout(() => {
    el.textContent = el.dataset.origText || 'Copy';
    el.style.background = origBg;
  }, 1500);
}

// ── Image capture ───────────────────────────────────────────────────

const H2C_CDN = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

function loadHtml2Canvas(): Promise<any> {
  const w = window as any;
  if (w.html2canvas) return Promise.resolve(w.html2canvas);

  return new Promise((resolve, reject) => {
    // Check if script tag already exists (LLM may have included it)
    const existing = document.querySelector(`script[src*="html2canvas"]`);
    if (existing) {
      // Wait for it to load
      const poll = () => {
        if (w.html2canvas) resolve(w.html2canvas);
        else setTimeout(poll, 50);
      };
      poll();
      return;
    }
    // Load it ourselves
    const script = document.createElement('script');
    script.src = H2C_CDN;
    script.onload = () => {
      const poll = () => {
        if (w.html2canvas) resolve(w.html2canvas);
        else setTimeout(poll, 50);
      };
      poll();
    };
    script.onerror = () => reject(new Error('Failed to load html2canvas'));
    document.head.appendChild(script);
  });
}

function captureAsImage(btnEl?: HTMLElement): void {
  const root = document.getElementById('genui-root');
  if (!root) return;

  const btn = btnEl || document.getElementById('imgBtn') || undefined;
  if (btn) {
    if (!btn.dataset.origText) btn.dataset.origText = btn.textContent || '';
    btn.textContent = 'Capturing...';
  }

  const bgColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg').trim() || '#1E1E1E';

  // Hide action buttons during capture so they don't appear in the screenshot
  const buttons = root.querySelectorAll<HTMLElement>('button');
  buttons.forEach(b => { b.dataset.preCapture = b.style.display; b.style.display = 'none'; });

  loadHtml2Canvas().then((h2c: any) => {
    return h2c(root, { backgroundColor: bgColor, scale: 2 });
  }).then((canvas: HTMLCanvasElement) => {
    // Restore buttons
    buttons.forEach(b => { b.style.display = b.dataset.preCapture || ''; delete b.dataset.preCapture; });
    // Strategy 1: Clipboard API for images (rarely works in sandbox)
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      canvas.toBlob((blob) => {
        if (!blob) { copyImageViaSelection(canvas, btn); return; }
        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]).then(
          () => flashCopied(btn ?? undefined),
          () => copyImageViaSelection(canvas, btn ?? undefined)
        );
      }, 'image/png');
    } else {
      copyImageViaSelection(canvas, btn);
    }
  }).catch(() => {
    if (btn) {
      btn.textContent = btn.dataset.origText || 'Copy as Image';
      btn.style.background = '#CC0000';
      setTimeout(() => { btn.style.background = ''; }, 2000);
    }
  });
}

/**
 * Copy an image via execCommand('copy') with a DOM selection.
 * Since execCommand('copy') works for text in this sandbox (proven by CSV copy),
 * selecting an <img> element and copying should copy it as rich content.
 */
function copyImageViaSelection(canvas: HTMLCanvasElement, btn: HTMLElement | null | undefined): void {
  const dataUrl = canvas.toDataURL('image/png');

  // Create a temporary container with the image
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none';
  const img = document.createElement('img');
  img.src = dataUrl;
  container.appendChild(img);
  document.body.appendChild(container);

  // Wait for image to load, then select and copy
  img.onload = () => {
    try {
      const range = document.createRange();
      range.selectNode(img);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
        const ok = document.execCommand('copy');
        sel.removeAllRanges();
        if (ok) {
          flashCopied(btn ?? undefined);
          document.body.removeChild(container);
          return;
        }
      }
    } catch {
      // Fall through to visible fallback
    }
    // Final fallback: show the image visually for manual save
    document.body.removeChild(container);
    showImageForManualSave(dataUrl, btn);
  };
}

/**
 * Last resort: render the captured image visibly so the user can
 * right-click → Save Image As, or drag it to their desktop.
 */
function showImageForManualSave(dataUrl: string, btn: HTMLElement | null | undefined): void {
  if (btn) {
    btn.textContent = btn.dataset.origText || 'Copy as Image';
  }

  const root = document.getElementById('genui-root');
  if (!root) return;

  // Remove any previous fallback image
  const prev = document.getElementById('genui-fallback-img');
  if (prev) prev.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'genui-fallback-img';
  wrapper.style.cssText = 'margin-top:16px;padding:12px;border:2px dashed var(--border);border-radius:8px;background:var(--surface)';

  const note = document.createElement('div');
  note.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-bottom:8px;font-weight:600';
  note.textContent = 'Image captured - drag to desktop or right-click → Save Image As:';

  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.cssText = 'max-width:100%;border-radius:4px;cursor:grab';
  img.draggable = true;

  wrapper.appendChild(note);
  wrapper.appendChild(img);
  root.appendChild(wrapper);
}

// ── Expose on window ────────────────────────────────────────────────

(window as any).copyText = copyTextToClipboard;
(window as any).showCopied = flashCopied;
(window as any).captureAsImage = captureAsImage;
// Also expose as copyImage for backward compat with LLM-generated onclick handlers
(window as any).copyImage = captureAsImage;

// ── Render function ─────────────────────────────────────────────────

export function renderGenui(container: HTMLElement, html: string): void {
  container.innerHTML = html;

  // innerHTML doesn't execute <script> tags - re-create them to trigger execution.
  container.querySelectorAll("script").forEach((oldScript) => {
    const newScript = document.createElement("script");
    for (const attr of oldScript.attributes) {
      newScript.setAttribute(attr.name, attr.value);
    }
    if (oldScript.src) {
      newScript.src = oldScript.src;
    } else {
      newScript.textContent = oldScript.textContent;
    }
    oldScript.replaceWith(newScript);
  });
}
