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

function stateColor(state: string): string {
  if (STATE_COLORS[state]) return STATE_COLORS[state];
  let hash = 0;
  for (let i = 0; i < state.length; i++) hash = state.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

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
  "System.IterationPath": "iterationPath",
  "System.AreaPath": "areaPath",
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

export function renderCard(
  container: HTMLElement,
  item: any,
  onBack?: () => void
): void {
  const id = item?.id ?? "?";
  const title = getField(item, "System.Title");
  const state = getField(item, "System.State");
  const type = getField(item, "System.WorkItemType");
  const assignedTo = getField(item, "System.AssignedTo");
  const iteration = getField(item, "System.IterationPath");
  const area = getField(item, "System.AreaPath");
  const points = getField(item, "Microsoft.VSTS.Scheduling.StoryPoints");
  const priority = getField(item, "Microsoft.VSTS.Common.Priority");
  const tags = getField(item, "System.Tags");
  const description = item?.fields?.["System.Description"] ?? item?.description ?? "";
  const sc = stateColor(state);

  container.innerHTML = `
    <style>
      .wi-card { border: 1px solid var(--color-border-primary, #d0d7de); border-radius: 8px; overflow: hidden; }
      .wi-card-header { padding: 16px 20px; border-bottom: 1px solid var(--color-border-primary, #d0d7de); display: flex; align-items: center; gap: 12px; }
      .wi-card-header h2 { font-size: 18px; font-weight: 600; flex: 1; }
      .wi-type-badge { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: var(--color-background-secondary, #f6f8fa); }
      .wi-id { color: var(--color-text-secondary, #656d76); font-size: 14px; }
      .wi-state-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; padding: 2px 10px; border-radius: 12px; color: #fff; }
      .wi-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; padding: 16px 20px; }
      .wi-field label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary, #656d76); margin-bottom: 2px; }
      .wi-field span { font-size: 14px; }
      .wi-description { padding: 16px 20px; border-top: 1px solid var(--color-border-primary, #d0d7de); }
      .wi-description h3 { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
      .wi-description-content { font-size: 14px; line-height: 1.6; }
      .wi-description-content img { max-width: 100%; }
      .wi-back-btn { background: none; border: 1px solid var(--color-border-primary, #d0d7de); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; color: var(--color-text-primary, #1a1a1a); margin-bottom: 12px; }
      .wi-back-btn:hover { background: var(--color-background-secondary, #f6f8fa); }
    </style>
    ${onBack ? '<button class="wi-back-btn" id="back-btn">\u2190 Back to list</button>' : ""}
    <div class="wi-card">
      <div class="wi-card-header">
        <span class="wi-type-badge">${type}</span>
        <span class="wi-id">#${id}</span>
        <h2>${escapeHtml(title)}</h2>
        <span class="wi-state-badge" style="background:${sc}">${state}</span>
      </div>
      <div class="wi-fields">
        <div class="wi-field"><label>Assigned To</label><span>${escapeHtml(assignedTo)}</span></div>
        <div class="wi-field"><label>Iteration</label><span>${escapeHtml(iteration)}</span></div>
        <div class="wi-field"><label>Area</label><span>${escapeHtml(area)}</span></div>
        <div class="wi-field"><label>Story Points</label><span>${points}</span></div>
        <div class="wi-field"><label>Priority</label><span>${priority}</span></div>
        <div class="wi-field"><label>Tags</label><span>${escapeHtml(tags)}</span></div>
      </div>
      ${description ? `
        <div class="wi-description">
          <h3>Description</h3>
          <div class="wi-description-content">${description}</div>
        </div>
      ` : ""}
    </div>
  `;

  if (onBack) {
    document.getElementById("back-btn")?.addEventListener("click", onBack);
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
