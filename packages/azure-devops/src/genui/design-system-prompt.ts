/**
 * Design System Prompt for Generative UI
 *
 * Delivered to the host LLM as part of the visualize-data tool response.
 * The host LLM follows these rules when generating HTML for render-visualization.
 */

export const DESIGN_SYSTEM_PROMPT = `
## Design System for HTML Visualization

You are generating an HTML snippet that will be rendered inside an MCP App iframe.
Follow these rules precisely to produce consistent, attractive, interactive output.

### Structure
- Return a single root \`<div id="genui-root">\` element containing all content.
- Do NOT include \`<html>\`, \`<head>\`, or \`<body>\` tags.
- All CSS must be inline via \`<style>\` tags within the snippet.
- All JavaScript must be inline via \`<script>\` tags (no \`src\` except allowed CDNs).
- Maximum content width: 800px, centered with \`margin: 0 auto\`.

### Typography
- Font: \`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif\`
- Base font size: 14px
- Headings: 20px (h2), 16px (h3), 14px bold (h4)
- Line height: 1.5

### Theme - CSS Variables (CRITICAL)
Always define CSS variables for BOTH light and dark themes using \`prefers-color-scheme\`.
This ensures the visualization adapts to the host app's theme automatically.

\`\`\`css
:root {
  --bg: #FFFFFF;
  --surface: #F8F9FA;
  --text: #1A1A1A;
  --text-secondary: #6B7280;
  --border: #E5E7EB;
  --link: #0078D4;
  --hover: #F0F4FF;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1E1E1E;
    --surface: #2D2D2D;
    --text: #E5E7EB;
    --text-secondary: #9CA3AF;
    --border: #404040;
    --link: #4DA6FF;
    --hover: #2A2D35;
  }
}
\`\`\`

If the theme parameter is explicitly "dark", ALSO duplicate the dark values as the default
(outside the media query) so dark mode always applies regardless of system setting.

**Use these CSS variables for ALL colors.** Never hardcode \`#1A1A1A\` or \`#FFFFFF\` directly.
Example: \`color: var(--text)\`, \`background: var(--surface)\`, \`border-color: var(--border)\`.

### ADO State Colors (fixed - work on both light and dark)
- New: #007ACC (blue)
- Active / In Progress: #009900 (green)
- Resolved: #FF9D00 (amber)
- Closed / Done / Completed: #6B7280 (grey)
- Removed: #CC0000 (red)

### Work Item Type Colors (fixed)
- Epic: #FF7B00
- Feature: #773B93
- User Story: #009CCC
- Bug: #CC293D
- Task: #F2CB1D

### Layout
- Use CSS Flexbox or Grid for layout.
- Root div: \`background: var(--bg); color: var(--text); padding: 24px\`
- Cards: \`border-radius: 8px; border: 1px solid var(--border); padding: 16px; background: var(--surface)\`
- Card grid: \`display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px\`
- Section spacing: \`margin-bottom: 24px\`

### KPI Cards
For summary metrics, use KPI cards at the top:
\`\`\`html
<div style="text-align:center; padding:16px; background:var(--surface); border-radius:8px; border:1px solid var(--border)">
  <div style="font-size:28px; font-weight:700; color:var(--text)">42</div>
  <div style="font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px">Total Items</div>
</div>
\`\`\`

### Tables
- Full width, border-collapse
- Header: \`background:var(--surface); font-weight:600; text-align:left; padding:8px 12px; border-bottom:2px solid var(--border); color:var(--text)\`
- Cells: \`padding:8px 12px; border-bottom:1px solid var(--border); color:var(--text)\`
- Hover: \`background:var(--hover)\`
- Add sortable column headers with onclick handlers when appropriate

### Charts (IMPORTANT - loading order)
- For complex charts: use Chart.js from CDN.
- **CRITICAL loading pattern**: Chart.js loads asynchronously. You MUST wait for it before initializing charts:
\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<canvas id="myChart" style="max-height:300px"></canvas>
<script>
(function initChart() {
  if (typeof Chart === 'undefined') {
    setTimeout(initChart, 50);
    return;
  }
  new Chart(document.getElementById('myChart'), { /* config */ });
})();
</script>
\`\`\`
- Never put chart initialization code in the same \`<script>\` tag as the CDN import.
- Always set \`responsive: true\` and \`maintainAspectRatio: false\` in Chart.js options.
- For Chart.js text colors, use: \`color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim()\`
- For Chart.js grid colors, use the \`--border\` variable similarly.
- For simple visuals (donut, progress bars): prefer inline SVG over Chart.js (no loading delay).
- Use the ADO state/type colors defined above for data series.

### Interactivity - Sandbox Constraints (CRITICAL)
This HTML renders inside a sandboxed iframe. **Links cannot open new tabs** and **file downloads are blocked**.
You MUST use clipboard-based alternatives for all interactive features.

#### Pre-defined Functions (DO NOT redefine these)
The following functions are pre-defined by the MCP App shell. Just call them:
- \`copyText(text, buttonElement)\` - copies text to clipboard with visual "Copied!" feedback
- \`showCopied(element)\` - shows brief "Copied!" indicator on an element
- \`captureAsImage(buttonElement)\` - captures the \`#genui-root\` div as a PNG image and copies to clipboard (loads html2canvas automatically)
**Do NOT define copyText, showCopied, captureAsImage, or copyImage in your \`<script>\` tags.** They already exist on \`window\`.

#### Work Item ID Links - Click to Copy URL
Do NOT use \`<a href="..." target="_blank">\`. Links cannot open in the sandbox.
Instead, display the ID as a clickable element that copies the ADO URL to clipboard:
\`\`\`html
<span onclick="copyText('https://dev.azure.com/{org}/{project}/_workitems/edit/{id}', this)"
  style="color:var(--link); cursor:pointer; font-weight:600; text-decoration:underline; text-decoration-style:dotted"
  title="Click to copy link">#52009</span>
\`\`\`

#### Copy CSV Button
\`\`\`html
<button id="csvBtn" onclick="copyCsv()" style="padding:6px 14px; background:var(--link); color:white;
  border:none; border-radius:4px; cursor:pointer; font-size:13px">Copy CSV</button>
\`\`\`
Define \`copyCsv()\` in a \`<script>\` tag - build the CSV string, then call \`copyText(csvString, document.getElementById('csvBtn'))\`.

#### Copy as Image Button
The \`captureAsImage\` function is pre-defined. It loads html2canvas automatically,
captures \`#genui-root\` at 2x resolution, and copies it to clipboard.
Do NOT include an html2canvas \`<script>\` tag or define copyImage/captureAsImage - just add the button:
\`\`\`html
<button id="imgBtn" onclick="captureAsImage(this)" style="padding:6px 14px; background:var(--link); color:white;
  border:none; border-radius:4px; cursor:pointer; font-size:13px">Copy as Image</button>
\`\`\`

### Button Row
Place action buttons (Copy CSV, Copy as Image) together in a flex row at the top:
\`\`\`html
<div style="display:flex; gap:8px; align-items:center">
  <button id="csvBtn" onclick="copyCsv()" ...>Copy CSV</button>
  <button id="imgBtn" onclick="copyImage()" ...>Copy as Image</button>
</div>
\`\`\`

### Security (CRITICAL)
- **HTML-escape ALL data values** before embedding. Titles, names, descriptions - everything from the data JSON must be escaped:
  \`\`\`javascript
  function esc(str) { const d = document.createElement('div'); d.textContent = String(str ?? ''); return d.innerHTML; }
  \`\`\`
- Use the \`esc()\` function for every data value rendered into HTML.
- Never use \`eval()\` or the \`Function()\` constructor.
- Never load scripts from domains other than \`cdn.jsdelivr.net\`.
- Never submit data to external URLs.

### Content Structure
1. **Title bar**: Visualization title + item count + action buttons (Copy CSV, Copy as Image)
2. **KPI cards**: Key metrics in a grid (total, by state, etc.)
3. **Primary visualization**: Chart or visual that matches the intent
4. **Data table**: Sortable table with work item IDs as click-to-copy-URL spans
5. **Footer**: "Generated by MCP Apps" + timestamp

### Output Format
Return ONLY the HTML snippet. No markdown fences, no explanation, no preamble.
The HTML must be self-contained and render correctly when injected via innerHTML.
`.trim();
