#!/usr/bin/env node
/**
 * HTTP Server entry point for SharePoint MCP
 * Enables use with Claude Mobile via Cloudflare Tunnel
 *
 * Usage:
 *   npm run start:http
 *   # Then: cloudflared tunnel run <tunnel-name>
 */
import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createEnvLoader } from '@mcp-consultant-tools/core';
import { registerSharePointTools } from './index.js';

// Load environment variables (suppresses stdout for MCP protocol)
createEnvLoader();

const app = express();
app.use(express.json());

// CORS for compatibility
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

async function initializeMcpServer() {
  if (mcpServer) return;

  mcpServer = new McpServer({
    name: 'sharepoint-http',
    version: '20.0.0',
  });

  registerSharePointTools(mcpServer);

  // Create linked in-memory transports
  const [server, client] = InMemoryTransport.createLinkedPair();
  serverTransport = server;
  clientTransport = client;

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

    // Send request through client transport
    await clientTransport!.send(jsonRpcRequest);

    if (isNotification) {
      // Notifications don't expect a response - just acknowledge
      console.error('  (notification - no response expected)');
      res.status(202).json({ jsonrpc: '2.0', result: 'accepted' });
      return;
    }

    // Wait for response (with timeout)
    const response = await Promise.race([
      new Promise<any>((resolve) => {
        const handler = (msg: any) => {
          if (msg.id === jsonRpcRequest.id) {
            clientTransport!.onmessage = undefined;
            resolve(msg);
          }
        };
        clientTransport!.onmessage = handler;
      }),
      new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for MCP response')), 30000)
      ),
    ]);

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

// Root endpoint - info
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'SharePoint Online MCP Server',
    version: '20.0.0',
    mcp_endpoint: '/mcp',
    health_endpoint: '/health',
    tools: [
      'spo-list-sites',
      'spo-get-site-info',
      'spo-test-connection',
      'spo-list-drives',
      'spo-get-drive-info',
      'spo-clear-cache',
      'spo-list-items',
      'spo-get-item',
      'spo-get-item-by-path',
      'spo-search-items',
      'spo-get-recent-items',
      'spo-get-folder-structure',
      'spo-get-crm-document-locations',
      'spo-validate-document-location',
      'spo-verify-document-migration',
    ],
  });
});

// REST-style tool endpoint for compatibility
// Catches paths like /connector/link/tool_name
app.post('/:connector/:linkId/:toolName', async (req: Request, res: Response) => {
  try {
    await initializeMcpServer();

    const toolName = req.params.toolName;
    const args = req.body.args ? JSON.parse(req.body.args) : req.body;

    console.error(`  REST→MCP: ${toolName} with args:`, JSON.stringify(args).substring(0, 200));

    const requestId = Date.now();
    const jsonRpcRequest = {
      jsonrpc: '2.0' as const,
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    await clientTransport!.send(jsonRpcRequest);

    const response = await Promise.race([
      new Promise<any>((resolve) => {
        const handler = (msg: any) => {
          if (msg.id === requestId) {
            clientTransport!.onmessage = undefined;
            resolve(msg);
          }
        };
        clientTransport!.onmessage = handler;
      }),
      new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 30000)
      ),
    ]);

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

const PORT = process.env.HTTP_PORT || 3002;
app.listen(PORT, () => {
  console.error(`SharePoint MCP HTTP server running on http://localhost:${PORT}/mcp`);
  console.error(`Health check: http://localhost:${PORT}/health`);
  console.error('');
  console.error('To expose via tunnel: cloudflared tunnel run <tunnel-name>');
});
