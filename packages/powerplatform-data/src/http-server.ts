#!/usr/bin/env node
/**
 * HTTP Server entry point for PowerPlatform Data MCP
 * Enables use with Claude Mobile via Cloudflare Tunnel
 *
 * Authentication modes (checked in order):
 *   1. API key: x-api-key header, ?api_key= query param, or Authorization: Bearer matching MCP_API_KEY
 *   2. Entra ID JWT: Authorization: Bearer <jwt> validated against Entra ID (opt-in via ENTRA_JWT_* env vars)
 *   3. No auth: if MCP_API_KEY is not set (development only)
 *
 * When JWT auth is used, the user's Object ID is extracted and passed as
 * CallerObjectId to Dataverse for per-user security role enforcement.
 *
 * Usage:
 *   npm run start:http
 *   # Then: cloudflared tunnel run <tunnel-name>
 */
import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createEnvLoader } from '@mcp-consultant-tools/core';
import { setRequestCallerObjectId } from '@mcp-consultant-tools/powerplatform-core';
import { registerPowerplatformDataTools } from './index.js';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

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

// =====================================================
// JWT Validation (Entra ID)
// =====================================================

const jwtConfig = {
  tenantId: process.env.ENTRA_JWT_TENANT_ID,
  clientId: process.env.ENTRA_JWT_CLIENT_ID,
  issuer: process.env.ENTRA_JWT_ISSUER,
};

const jwtEnabled = !!(jwtConfig.tenantId && jwtConfig.clientId);

// JWKS client — caches signing keys from Microsoft's OIDC endpoint
const jwksClient = jwtEnabled
  ? jwksRsa({
      jwksUri: `https://login.microsoftonline.com/${jwtConfig.tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    })
  : null;

/**
 * Validate an Entra ID JWT and return decoded claims.
 * Verifies signature (via JWKS), audience, issuer, and expiry.
 */
async function validateEntraJwt(token: string): Promise<{ oid: string; sub: string; name?: string; preferred_username?: string }> {
  if (!jwksClient || !jwtConfig.tenantId || !jwtConfig.clientId) {
    throw new Error('JWT validation not configured');
  }

  // Decode header to get the signing key ID
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Invalid JWT: could not decode');
  }

  const kid = decoded.header.kid;
  if (!kid) {
    throw new Error('Invalid JWT: missing kid in header');
  }

  // Fetch the signing key from Microsoft's JWKS endpoint
  const signingKey = await jwksClient.getSigningKey(kid);
  const publicKey = signingKey.getPublicKey();

  // Expected issuer: v2.0 endpoint
  const expectedIssuer = jwtConfig.issuer || `https://login.microsoftonline.com/${jwtConfig.tenantId}/v2.0`;

  // Verify signature, audience, issuer, and expiry
  const verified = jwt.verify(token, publicKey, {
    audience: jwtConfig.clientId,
    issuer: expectedIssuer,
    algorithms: ['RS256'],
  });

  if (typeof verified === 'string') {
    throw new Error('Invalid JWT: unexpected string payload');
  }

  const oid = (verified as any).oid;
  if (!oid) {
    throw new Error('Invalid JWT: missing oid claim');
  }

  return verified as { oid: string; sub: string; name?: string; preferred_username?: string };
}

// =====================================================
// Authentication Middleware
// =====================================================

// API Key + JWT authentication middleware
// Priority: API key (x-api-key, ?api_key=, Bearer=apikey) > JWT > reject
const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const expectedKey = process.env.MCP_API_KEY;
  if (req.path === '/health' || req.path === '/' || req.method === 'OPTIONS') {
    return next();
  }
  if (!expectedKey && !jwtEnabled) {
    // No auth configured — development mode
    return next();
  }

  // Extract potential credentials
  const headerKey = req.headers['x-api-key'] as string;
  const bearerToken = req.headers['authorization']?.replace('Bearer ', '');
  const queryKey = req.query.api_key as string;

  // 1. API key via x-api-key header or ?api_key= query param
  if (expectedKey && (headerKey === expectedKey || queryKey === expectedKey)) {
    return next();
  }

  // 2. Bearer token matching API key
  if (expectedKey && bearerToken === expectedKey) {
    return next();
  }

  // 3. Bearer token as JWT (if JWT auth is configured)
  if (jwtEnabled && bearerToken) {
    try {
      const claims = await validateEntraJwt(bearerToken);
      // Store user OID on request for CallerObjectId threading
      (req as any).userObjectId = claims.oid;
      (req as any).userName = claims.name || claims.preferred_username || 'unknown';
      console.error(`  JWT auth: user=${(req as any).userName} oid=${claims.oid}`);
      return next();
    } catch (err: any) {
      console.error(`  JWT validation failed: ${err.message}`);
      // Fall through to 401
    }
  }

  console.error('Authentication failed: no valid API key or JWT');
  return res.status(401).json({ error: 'Invalid or missing authentication' });
};

app.use(authMiddleware);

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
    name: 'powerplatform-data-http',
    version: '29.0.0-beta.1',
  });

  registerPowerplatformDataTools(mcpServer);

  // Create linked in-memory transports
  const [server, client] = InMemoryTransport.createLinkedPair();
  serverTransport = server;
  clientTransport = client;

  await mcpServer.connect(serverTransport);
  console.error('MCP server initialized with InMemoryTransport');
  if (jwtEnabled) {
    console.error(`Entra ID JWT auth enabled (tenant: ${jwtConfig.tenantId})`);
  }
}

// MCP endpoint - manual JSON-RPC handling
app.post('/mcp', async (req: Request, res: Response) => {
  // Set per-request CallerObjectId from JWT auth (if present)
  const userObjectId = (req as any).userObjectId || null;
  setRequestCallerObjectId(userObjectId);

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
  } finally {
    // Clear per-request context
    setRequestCallerObjectId(null);
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
  res.json({
    status: 'ok',
    serverInitialized: mcpServer !== null,
    jwtAuthEnabled: jwtEnabled,
  });
});

// Root endpoint - info
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'PowerPlatform Data MCP Server',
    version: '29.0.0-beta.1',
    mcp_endpoint: '/mcp',
    health_endpoint: '/health',
    auth: {
      apiKey: !!process.env.MCP_API_KEY,
      jwt: jwtEnabled,
    },
    tools: ['query-records', 'get-record', 'get-entity-metadata', 'get-lookup-target', 'create-record', 'update-record', 'delete-record', 'execute-action'],
  });
});

// REST-style tool endpoint for compatibility
// Catches paths like /connector/link/tool_name
app.post('/:connector/:linkId/:toolName', async (req: Request, res: Response) => {
  // Set per-request CallerObjectId from JWT auth (if present)
  const userObjectId = (req as any).userObjectId || null;
  setRequestCallerObjectId(userObjectId);

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
  } finally {
    setRequestCallerObjectId(null);
  }
});

const PORT = process.env.HTTP_PORT || 3001;
app.listen(PORT, () => {
  console.error(`PowerPlatform Data MCP HTTP server running on http://localhost:${PORT}/mcp`);
  console.error(`Health check: http://localhost:${PORT}/health`);
  console.error(`Auth: API key=${!!process.env.MCP_API_KEY}, JWT=${jwtEnabled}`);
  console.error('');
  console.error('To expose via tunnel: cloudflared tunnel run <tunnel-name>');
});
