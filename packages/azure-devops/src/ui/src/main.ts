import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import { applyHostContext } from "./theme.js";
import { renderCard } from "./views/card-view.js";
import { renderList } from "./views/list-view.js";
import { renderGenui } from "./views/genui-view.js";

const appEl = document.getElementById("app")!;
const app = new App({ name: "ADO Work Items", version: "1.0.0" });

// State for back-navigation
let lastListData: any = null;

app.ontoolinput = (params: any) => {
  // Can render preview from arguments before result arrives
};

app.ontoolresult = (result: any) => {
  const structured = result.structuredContent;
  if (!structured) {
    // Fallback: try parsing text content
    const text = result.content?.find((c: any) => c.type === "text")?.text;
    appEl.innerHTML = `<pre style="white-space:pre-wrap">${text ?? "No data"}</pre>`;
    return;
  }

  if (structured.type === "work-item-detail") {
    renderCard(appEl, structured.item, lastListData ? goBackToList : undefined);
  } else if (structured.type === "work-item-list") {
    lastListData = structured;
    renderList(appEl, structured.items, structured.project, onRowClick);
  } else if (structured.type === "genui") {
    renderGenui(appEl, structured.html);
  }
};

app.onhostcontextchanged = (ctx: any) => {
  applyHostContext(ctx);
};

app.onteardown = async () => ({});

async function onRowClick(project: string, id: number): Promise<void> {
  appEl.innerHTML = '<div class="loading">Loading work item...</div>';
  try {
    const result = await app.callServerTool({
      name: "get-work-item",
      arguments: { project, workItemId: id },
    });
    const structured = (result as any).structuredContent;
    if (structured?.type === "work-item-detail") {
      renderCard(appEl, structured.item, goBackToList);
    } else {
      const text = (result as any).content?.find((c: any) => c.type === "text")?.text;
      appEl.innerHTML = `<pre style="white-space:pre-wrap">${text ?? "No data"}</pre>`;
    }
  } catch (err: any) {
    appEl.innerHTML = `<div class="error">Failed to load work item: ${err.message}</div>`;
  }
}

function goBackToList(): void {
  if (lastListData) {
    renderList(appEl, lastListData.items, lastListData.project, onRowClick);
  }
}

await app.connect(new PostMessageTransport());
