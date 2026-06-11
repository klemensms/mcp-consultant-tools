export interface ChartSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Render an SVG donut chart. Returns an HTML string.
 */
export function renderDonutChart(segments: ChartSegment[], size = 180): string {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return "<p>No data</p>";

  const pad = 4;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 30;
  const radius = size / 2 - strokeWidth / 2 - pad;

  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const pct = seg.value / total;
      const dash = pct * circumference;
      const gap = circumference - dash;
      const svg = `<circle
        cx="${cx}" cy="${cy}" r="${radius}"
        fill="none"
        stroke="${seg.color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${dash} ${gap}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})"
      />`;
      offset += dash;
      return svg;
    })
    .join("\n");

  const legend = segments
    .filter((s) => s.value > 0)
    .map(
      (seg) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:12px">
          <span style="width:10px;height:10px;border-radius:2px;background:${seg.color};display:inline-block"></span>
          ${seg.label}: ${seg.value}
        </span>`
    )
    .join("");

  return `
    <div style="text-align:center">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${arcs}
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
          style="font-size:24px;font-weight:700;fill:var(--color-text-primary,#1a1a1a)">${total}</text>
      </svg>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;justify-content:center">${legend}</div>
    </div>
  `;
}
