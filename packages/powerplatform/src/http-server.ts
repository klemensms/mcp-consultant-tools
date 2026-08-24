#!/usr/bin/env node
/**
 * HTTP Server entry point for PowerPlatform MCP
 * Enables use with ChatGPT via ngrok/tunnel
 *
 * Usage:
 *   npm run start:http
 *   # Then: ngrok http 3000
 */
import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createEnvLoader } from '@mcp-consultant-tools/core';
import { registerPowerPlatformTools } from './index.js';

// Load environment variables (suppresses stdout for MCP protocol)
createEnvLoader();

const app = express();
app.use(express.json());

// CORS for ChatGPT compatibility
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// API Key authentication middleware
// Supports: x-api-key header, Authorization: Bearer <key>, or ?api_key=<key> query param
const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const expectedKey = process.env.MCP_API_KEY;
  if (req.path === '/health' || req.path === '/' || req.method === 'OPTIONS') {
    return next();
  }
  if (!expectedKey) {
    return next();
  }

  // Check multiple sources for API key
  const headerKey = req.headers['x-api-key'] as string;
  const bearerToken = req.headers['authorization']?.replace('Bearer ', '');
  const queryKey = req.query.api_key as string;

  const providedKey = headerKey || bearerToken || queryKey;

  if (providedKey !== expectedKey) {
    console.error('API key authentication failed');
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
};

// OAuth discovery paths must 404, not 401. This server only does static API keys — it has no
// OAuth routes. A 401 tells an MCP client "OAuth is supported, you are unauthorized", so the
// client starts a flow that can never complete and reports "authentication failed" even though
// the API key works. Must be registered BEFORE the auth middleware; after it, the 401 wins.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/.well-known/oauth-') || req.path === '/register') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

app.use(apiKeyAuth);

// Debug logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.error('  Body:', JSON.stringify(req.body).substring(0, 300));
  }
  next();
});

// Global MCP server instance
let mcpServer: McpServer | null = null;
let serverTransport: InMemoryTransport | null = null;
let clientTransport: InMemoryTransport | null = null;

const RESPONSE_TIMEOUT_MS = 30000;

// Correlates JSON-RPC responses to the requests waiting on them. The transport's
// onmessage handler is installed once, permanently, when the transport is created
// (see initializeMcpServer) - a per-request handler is wrong twice over: installed
// after send() it misses any response the SDK emits synchronously, and concurrent
// requests overwrite each other's handler.
const pendingResponses = new Map<string | number, (msg: any) => void>();

// REST bridge request ids. Prefixed so they can never collide with the numeric ids
// a JSON-RPC client picks, and sequential so two calls in the same millisecond get
// distinct ids.
let restRequestSeq = 0;

/**
 * Send a JSON-RPC request and wait for the response carrying the same id.
 *
 * The resolver is registered BEFORE the send. InMemoryTransport.send() is
 * synchronous, and the SDK answers unknown methods with MethodNotFound inline, so
 * a resolver registered after the send would never see that response.
 */
async function sendAndAwaitResponse(jsonRpcRequest: any, timeoutMessage: string): Promise<any> {
  const id = jsonRpcRequest.id;

  const responsePromise = new Promise<any>((resolve) => {
    pendingResponses.set(id, resolve);
  });

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), RESPONSE_TIMEOUT_MS);
  });

  try {
    await clientTransport!.send(jsonRpcRequest);
    return await Promise.race([responsePromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
    // No-op on success; on timeout this is what stops the pending entry leaking.
    pendingResponses.delete(id);
  }
}

async function initializeMcpServer() {
  if (mcpServer) return;

  mcpServer = new McpServer({
    name: 'powerplatform-http',
    version: '23.0.0-beta.1',
  });

  registerPowerPlatformTools(mcpServer);

  // Create linked in-memory transports
  const [server, client] = InMemoryTransport.createLinkedPair();
  serverTransport = server;
  clientTransport = client;

  // Install the response handler once, before anything can be sent. InMemoryTransport
  // queues messages while onmessage is unset and only drains that queue on start(),
  // so a response arriving before a handler exists is lost for good.
  clientTransport.onmessage = (msg: any) => {
    const resolve = pendingResponses.get(msg.id);
    if (resolve) {
      pendingResponses.delete(msg.id);
      resolve(msg);
    }
  };

  await mcpServer.connect(serverTransport);
  console.error('✅ MCP server initialized with InMemoryTransport');
}

// MCP endpoint - manual JSON-RPC handling
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    await initializeMcpServer();

    const jsonRpcRequest = req.body;
    console.error('  JSON-RPC method:', jsonRpcRequest.method);

    // Check if this is a notification (no id = no response expected)
    const isNotification = jsonRpcRequest.id === undefined;

    if (isNotification) {
      // Notifications don't expect a response - just acknowledge
      await clientTransport!.send(jsonRpcRequest);
      console.error('  (notification - no response expected)');
      res.status(202).json({ jsonrpc: '2.0', result: 'accepted' });
      return;
    }

    // Send request and wait for its correlated response (with timeout)
    const response = await sendAndAwaitResponse(
      jsonRpcRequest,
      'Timeout waiting for MCP response'
    );

    console.error('  Response:', JSON.stringify(response).substring(0, 200));
    res.json(response);
  } catch (error: any) {
    console.error('MCP HTTP error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id: req.body?.id || null,
    });
  }
});

// SSE endpoint for streaming (required by some clients)
app.get('/mcp', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    console.error('SSE connection closed');
  });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', serverInitialized: mcpServer !== null });
});

// Root endpoint - required for ChatGPT connector validation
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'PowerPlatform MCP Server',
    version: '23.0.0-beta.1',
    mcp_endpoint: '/mcp',
    health_endpoint: '/health',
  });
});

// REST-style tool endpoint for ChatGPT compatibility
// ChatGPT constructs paths like /connector_name/link_xxx/tool_name
// This catches those and converts to MCP tools/call
app.post('/:connector/:linkId/:toolName', async (req: Request, res: Response) => {
  try {
    await initializeMcpServer();

    const toolName = req.params.toolName;
    const args = req.body.args ? JSON.parse(req.body.args) : req.body;

    console.error(`  REST→MCP: ${toolName} with args:`, JSON.stringify(args).substring(0, 200));

    const requestId = `rest-${++restRequestSeq}`;
    const jsonRpcRequest = {
      jsonrpc: '2.0' as const,
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const response = await sendAndAwaitResponse(jsonRpcRequest, 'Timeout');

    // Extract text content from MCP response for simpler REST response
    if (response.result?.content?.[0]?.text) {
      res.json({ result: response.result.content[0].text });
    } else {
      res.json(response);
    }
  } catch (error: any) {
    console.error('REST→MCP error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.HTTP_PORT || 3000;
app.listen(PORT, () => {
  console.error(`PowerPlatform MCP HTTP server running on http://localhost:${PORT}/mcp`);
  console.error(`Health check: http://localhost:${PORT}/health`);
  console.error('');
  console.error('To expose via ngrok: ngrok http ' + PORT);
});
