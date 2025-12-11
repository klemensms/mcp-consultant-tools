# Speed Demo PRD: ChatGPT Dynamics MCP

**Goal:** Demo a working ChatGPT → CRM integration tomorrow morning  
**Time budget:** 2-4 hours tonight  
**Quality bar:** "Wow, that's possible!" not "This is production-ready"

---

## The Fastest Path

Skip OAuth entirely. ChatGPT supports MCP connectors with **no authentication**.

```
┌──────────────┐         ┌─────────────────────┐         ┌─────────────┐
│   ChatGPT    │   SSE   │  Your Node MCP      │  API    │  Dynamics   │
│   Desktop    │ ──────► │  Server + ngrok     │ ──────► │  365 CRM    │
└──────────────┘         └─────────────────────┘         └─────────────┘
                              │
                              │ Service account
                              │ (hardcoded creds)
                              ▼
                         Not secure, but works
```

---

## What You Need

| Item | You Have It? | If No |
|------|--------------|-------|
| Node.js MCP server | ✅ Yes | - |
| CRM service account credentials | ? | Create one or use your own |
| ngrok (or Cloudflare Tunnel) | ? | `npm install -g ngrok` |
| ChatGPT Plus/Pro account | ✅ Yes | - |

---

## Step-by-Step (2-4 hours)

### Step 1: Verify Your MCP Server Has SSE Transport (30 min)

ChatGPT requires **SSE (Server-Sent Events)** or **Streamable HTTP** transport - not stdio.

**Check your current server:**
- If it's stdio-only, you need to add an HTTP layer
- If it already has an HTTP/SSE endpoint, skip to Step 2

**Quick SSE wrapper if needed:**

```javascript
// server.js - minimal SSE wrapper for existing MCP server
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const app = express();
const PORT = 3000;

// Your existing MCP server setup
const server = new McpServer({
  name: "dynamics-crm",
  version: "1.0.0"
});

// Add your existing tools here
server.tool("query_crm", "Query CRM data", { /* schema */ }, async (params) => {
  // Your existing implementation
});

// SSE endpoint for ChatGPT
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  await server.connect(transport);
});

app.post('/message', express.json(), async (req, res) => {
  // Handle incoming messages - transport handles this
});

app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}/sse`);
});
```

**Or use the simpler Streamable HTTP transport:**

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

const app = express();
app.use(express.json());

const server = new McpServer({ name: "dynamics-crm", version: "1.0.0" });

// Your tools...

const transport = new StreamableHTTPServerTransport({ endpoint: '/mcp' });
app.use('/mcp', transport.requestHandler);
server.connect(transport);

app.listen(3000);
```

### Step 2: Hardcode CRM Credentials (15 min)

For the demo, use a service account or your own credentials. **NOT FOR PRODUCTION.**

```javascript
// config.js
export const CRM_CONFIG = {
  url: "https://yourorg.crm4.dynamics.com",
  clientId: "your-app-registration-client-id",
  clientSecret: "your-client-secret", // Or use your own credentials
  tenantId: "your-tenant-id"
};
```

**If you don't have a service account app registration:**

Option A: Use your existing MCP server's auth (you mentioned it already connects)

Option B: Quick app registration:
1. Azure Portal → Entra ID → App Registrations → New
2. Name: "MCP Demo (DELETE LATER)"
3. Single tenant
4. Add API permission: Dynamics CRM → user_impersonation
5. Create client secret
6. Grant admin consent

### Step 3: Expose via ngrok (10 min)

```bash
# Terminal 1: Start your MCP server
npm start
# or: node server.js

# Terminal 2: Expose to internet
ngrok http 3000
```

ngrok gives you a URL like: `https://abc123.ngrok-free.app`

Your MCP endpoint is: `https://abc123.ngrok-free.app/sse`

**Alternative: Cloudflare Tunnel (more stable, free)**
```bash
# Install
brew install cloudflared  # or: npm install -g cloudflared

# Quick tunnel (no account needed)
cloudflared tunnel --url http://localhost:3000
```

### Step 4: Add to ChatGPT (5 min)

1. Open ChatGPT (web or desktop)
2. Settings → Connectors → Create (or Developer Mode if enabled)
3. Fill in:
   - **Name:** "Dynamics CRM"
   - **Description:** "Query CRM data"
   - **MCP Server URL:** `https://abc123.ngrok-free.app/sse`
   - **Authentication:** None
4. Check the "I understand and want to continue" box
5. Click Create

### Step 5: Test (10 min)

In ChatGPT:
```
Use the Dynamics CRM connector to list my accounts
```

If it works → 🎉 Demo ready

If it fails → Check:
- Is ngrok still running?
- Is your MCP server running?
- Check ChatGPT's error message
- Check your server logs

---

## Minimal Tool Set for Demo

You only need 1-2 tools to impress. Focus on:

### Tool 1: `query_crm` (must have)

```javascript
server.tool(
  "query_crm",
  "Query Dynamics 365 CRM records",
  {
    entity: { type: "string", description: "Entity name (e.g., account, contact, opportunity)" },
    top: { type: "number", description: "Max records to return", default: 10 }
  },
  async ({ entity, top = 10 }) => {
    const token = await getAccessToken(); // Your existing auth
    const response = await fetch(
      `${CRM_URL}/api/data/v9.2/${entity}s?$top=${top}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data.value, null, 2) }] };
  }
);
```

### Tool 2: `get_account` (nice to have)

```javascript
server.tool(
  "get_account",
  "Get account details by name",
  {
    name: { type: "string", description: "Account name to search for" }
  },
  async ({ name }) => {
    const token = await getAccessToken();
    const response = await fetch(
      `${CRM_URL}/api/data/v9.2/accounts?$filter=contains(name,'${name}')&$top=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data.value, null, 2) }] };
  }
);
```

---

## Demo Script

**Setup before client arrives:**
1. ngrok running
2. MCP server running
3. ChatGPT open with connector added
4. Test query works

**Demo flow (5 min):**

1. "Let me show you how we can connect ChatGPT to your CRM..."

2. Show the connector in ChatGPT settings briefly

3. Ask ChatGPT:
   > "Show me my top 10 accounts from CRM"

4. Watch it call the tool and return real data

5. Follow up:
   > "Tell me more about [specific account name from results]"

6. If they're impressed:
   > "Now imagine your sales team asking 'What opportunities are closing this month?' or 'Which accounts haven't been contacted in 30 days?'"

7. Close:
   > "This is a quick proof of concept. For production, we'd add proper authentication so each user only sees their own data, but this shows what's possible."

---

## What to Say About Security

When the client asks (they will):

> "For this demo I'm using a service account so we can see it working. In production, we'd integrate with your Entra ID so each user authenticates with their own account and only sees data they have permission to access. That's a bit more setup but it's the right way to do it."

---

## Troubleshooting

### "Connector not found" or connection errors
- Check ngrok is running and URL is correct
- Restart ngrok (you get a new URL each time on free tier)
- Update the URL in ChatGPT settings

### "Tool not found"
- Verify your tool names match what you're asking ChatGPT to use
- Refresh the connector in ChatGPT settings

### CORS errors
- Add CORS headers to your server:
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});
```

### CRM returns 401/403
- Check your credentials are correct
- Verify the app registration has Dynamics CRM permissions
- Check admin consent was granted

### ngrok URL keeps changing
- Pay for ngrok ($8/mo) for stable URL, OR
- Use Cloudflare Tunnel (free, stable), OR
- Just update the URL in ChatGPT before the demo

---

## After the Demo

If client is interested, next steps:

1. **This week:** Share the full PRD for production implementation
2. **Phase 1 (2-3 weeks):** Proper OAuth with delegated permissions
3. **Phase 1.5:** Deploy to their Azure tenant
4. **Ongoing:** Add more tools based on their needs

---

## Checklist for Tonight

- [ ] MCP server has SSE/HTTP transport
- [ ] Server connects to CRM and can query data
- [ ] ngrok/tunnel running and accessible
- [ ] ChatGPT connector created and connected
- [ ] Test query returns real CRM data
- [ ] Backup plan if ngrok dies (Cloudflare Tunnel ready)
- [ ] Know the demo script
- [ ] Have the "security question" answer ready

---

## Emergency Fallback

If you can't get your Node server working with SSE in time:

**Option A: Use the Profility .NET solution as-is**
- Clone it
- Configure for your Entra ID
- It has a working WhoAmI tool out of the box
- Demo "authentication works" even without CRM data

**Option B: Screen recording**
- If all else fails, record a working demo tonight
- Play the video tomorrow with "let me show you what this looks like"
- Not ideal but better than a broken live demo

---

*Total time estimate: 2-4 hours if your Node server mostly works, longer if starting from scratch.*