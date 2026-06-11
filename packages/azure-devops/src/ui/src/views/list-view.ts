import { renderDonutChart, type ChartSegment } from "../chart.js";

const STATE_COLORS: Record<string, string> = {
  New: "#007acc",
  Active: "#2ea043",
  Resolved: "#d29922",
  Closed: "#8b949e",
  Removed: "#f85149",
  "Ready to deploy to UAT": "#9b59b6",
  Testing: "#e67e22",
  "User Acceptance Testing": "#e67e22",
  "Production Testing": "#3498db",
  "In Progress": "#2ea043",
  Committed: "#16a085",
  Done: "#8b949e",
  "Ready for Review": "#f39c12",
};

/** Generate a deterministic color for unknown states so they don't all look grey */
function stateColor(state: string): string {
  if (STATE_COLORS[state]) return STATE_COLORS[state];
  // Simple hash → hue so each unknown state gets a distinct color
  let hash = 0;
  for (let i = 0; i < state.length; i++) hash = state.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

type RowClickHandler = (project: string, id: number) => void;

/** Map from ADO field reference names to flat property keys (run-saved-query summary format) */
const FLAT_FIELD_MAP: Record<string, string> = {
  "System.State": "state",
  "System.Title": "title",
  "System.WorkItemType": "type",
  "System.AssignedTo": "assignedTo",
  "Microsoft.VSTS.Scheduling.StoryPoints": "storyPoints",
  "Microsoft.VSTS.Common.Priority": "priority",
  "Microsoft.VSTS.Common.Severity": "severity",
  "System.Tags": "tags",
  "System.TeamProject": "project",
  "Microsoft.VSTS.Common.ResolvedReason": "resolvedReason",
};

function getField(item: any, field: string): string {
  // Try ADO nested format first: item.fields["System.State"]
  const nested = item?.fields?.[field];
  if (nested !== undefined && nested !== null) {
    if (typeof nested === "object" && nested.displayName) return nested.displayName;
    return String(nested);
  }
  // Fallback: flat format from run-saved-query summary: item.state
  const flatKey = FLAT_FIELD_MAP[field];
  if (flatKey) {
    const flat = item?.[flatKey];
    if (flat !== undefined && flat !== null) return String(flat);
  }
  return "\u2014";
}

function buildStatusChart(items: any[]): string {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const state = getField(item, "System.State");
    counts[state] = (counts[state] ?? 0) + 1;
  }

  const segments: ChartSegment[] = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([label, value]) => ({
      label,
      value,
      color: stateColor(label),
    }));

  return renderDonutChart(segments);
}

export function renderList(
  container: HTMLElement,
  items: any[],
  project: string,
  onRowClick: RowClickHandler
): void {
  if (!items || items.length === 0) {
    container.innerHTML = '<p style="padding:20px;text-align:center">No work items found.</p>';
    return;
  }

  const chart = buildStatusChart(items);

  const getProject = (item: any): string =>
    item?.fields?.["System.TeamProject"] ?? item?.project ?? project ?? "";

  const rows = items
    .map((item: any) => {
      const id = item?.id ?? "?";
      const state = getField(item, "System.State");
      const sc = stateColor(state);
      return `<tr class="wi-row" data-id="${id}" data-project="${getProject(item)}">
        <td>${id}</td>
        <td>${getField(item, "System.WorkItemType")}</td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(getField(item, "System.Title"))}</td>
        <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sc};margin-right:6px"></span>${state}</td>
        <td>${escapeHtml(getField(item, "System.AssignedTo"))}</td>
        <td style="text-align:right">${getField(item, "Microsoft.VSTS.Scheduling.StoryPoints")}</td>
        <td style="text-align:center">${getField(item, "Microsoft.VSTS.Common.Priority")}</td>
      </tr>`;
    })
    .join("");

  container.innerHTML = `
    <style>
      .wi-dashboard { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
      .wi-chart-panel { flex: 0 0 auto; min-width: 200px; padding: 16px; border: 1px solid var(--color-border-primary, #d0d7de); border-radius: 8px; }
      .wi-chart-panel h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; text-align: center; }
      .wi-table-panel { flex: 1 1 500px; min-width: 0; overflow-x: auto; }
      .wi-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .wi-table th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--color-border-primary, #d0d7de); font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary, #656d76); cursor: pointer; user-select: none; }
      .wi-table th:hover { color: var(--color-text-primary, #1a1a1a); }
      .wi-table td { padding: 8px 12px; border-bottom: 1px solid var(--color-border-primary, #d0d7de); }
      .wi-row { cursor: pointer; }
      .wi-row:hover { background: var(--color-background-secondary, #f6f8fa); }
      .wi-summary { font-size: 13px; color: var(--color-text-secondary, #656d76); margin-bottom: 16px; }
    </style>
    <p class="wi-summary">${items.length} work item${items.length !== 1 ? "s" : ""}</p>
    <div class="wi-dashboard">
      <div class="wi-chart-panel">
        <h3>Status</h3>
        ${chart}
      </div>
      <div class="wi-table-panel">
        <table class="wi-table">
          <thead>
            <tr>
              <th data-col="id">ID</th>
              <th data-col="type">Type</th>
              <th data-col="title">Title</th>
              <th data-col="state">State</th>
              <th data-col="assignedTo">Assigned To</th>
              <th data-col="points" style="text-align:right">Points</th>
              <th data-col="priority" style="text-align:center">Priority</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  // Wire up row clicks
  container.querySelectorAll(".wi-row").forEach((row) => {
    row.addEventListener("click", () => {
      const id = Number(row.getAttribute("data-id"));
      const proj = row.getAttribute("data-project") || project;
      if (id) onRowClick(proj, id);
    });
  });

  // Wire up column sort
  let sortCol = "";
  let sortAsc = true;
  container.querySelectorAll(".wi-table th").forEach((th) => {
    th.addEventListener("click", () => {
      const col = (th as HTMLElement).dataset.col!;
      if (sortCol === col) {
        sortAsc = !sortAsc;
      } else {
        sortCol = col;
        sortAsc = true;
      }
      const sorted = sortItems([...items], col, sortAsc);
      renderList(container, sorted, project, onRowClick);
    });
  });
}

function sortItems(items: any[], col: string, asc: boolean): any[] {
  const fieldMap: Record<string, string> = {
    id: "System.Id",
    type: "System.WorkItemType",
    title: "System.Title",
    state: "System.State",
    assignedTo: "System.AssignedTo",
    points: "Microsoft.VSTS.Scheduling.StoryPoints",
    priority: "Microsoft.VSTS.Common.Priority",
  };
  const field = fieldMap[col];
  if (!field) return items;

  return items.sort((a, b) => {
    let va: any;
    let vb: any;

    if (col === "id") {
      va = a?.id ?? 0;
      vb = b?.id ?? 0;
    } else {
      // Try nested ADO format, then flat format
      va = a?.fields?.[field];
      if (va === undefined || va === null) {
        const flatKey = FLAT_FIELD_MAP[field];
        va = flatKey ? a?.[flatKey] ?? "" : "";
      }
      vb = b?.fields?.[field];
      if (vb === undefined || vb === null) {
        const flatKey = FLAT_FIELD_MAP[field];
        vb = flatKey ? b?.[flatKey] ?? "" : "";
      }
      if (typeof va === "object" && va.displayName) va = va.displayName;
      if (typeof vb === "object" && vb.displayName) vb = vb.displayName;
    }

    if (typeof va === "number" && typeof vb === "number") {
      return asc ? va - vb : vb - va;
    }
    return asc
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
