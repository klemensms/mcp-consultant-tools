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
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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

// Store transports by session ID for stateful mode
const transports = new Map<string, StreamableHTTPServerTransport>();

// MCP endpoint - handles all HTTP methods
app.all('/mcp', async (req: Request, res: Response) => {
  try {
    // Check for existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport for this session
      transport = transports.get(sessionId)!;
    } else if (req.method === 'GET' || (req.method === 'POST' && !sessionId)) {
      // New session - create server and transport
      const server = new McpServer({
        name: 'powerplatform-http',
        version: '21.0.0',
      });

      // Register all PowerPlatform tools and prompts
      // (prompts are registered inside registerPowerPlatformTools)
      registerPowerPlatformTools(server);

      // Create transport with session management
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport);
          console.error(`Session initialized: ${id}`);
        },
        onsessionclosed: (id) => {
          transports.delete(id);
          console.error(`Session closed: ${id}`);
        },
      });

      // Connect server to transport
      await server.connect(transport);
    } else {
      // Invalid request - session required but not found
      res.status(400).json({ error: 'Invalid session' });
      return;
    }

    // Let transport handle the request
    await transport.handleRequest(req, res);
  } catch (error: any) {
    console.error('MCP HTTP error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', sessions: transports.size });
});

const PORT = process.env.HTTP_PORT || 3000;
app.listen(PORT, () => {
  console.error(`PowerPlatform MCP HTTP server running on http://localhost:${PORT}/mcp`);
  console.error(`Health check: http://localhost:${PORT}/health`);
  console.error('');
  console.error('To expose via ngrok: ngrok http ' + PORT);
});
