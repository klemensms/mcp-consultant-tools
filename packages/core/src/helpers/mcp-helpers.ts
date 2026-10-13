/**
 * MCP Server Helper Utilities
 *
 * Provides consistent patterns for creating MCP servers, handling responses,
 * and loading environment variables across all packages.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface MCPServerOptions {
  name: string;
  version: string;
  capabilities?: {
    tools?: {};
    prompts?: {};
    resources?: {};
  };
}

/**
 * Create an MCP server with standard capabilities
 */
export function createMcpServer(options: MCPServerOptions): McpServer {
  return new McpServer(
    {
      name: options.name,
      version: options.version
    },
    {
      capabilities: options.capabilities || {
        tools: {},
        prompts: {}
      }
    }
  );
}

/**
 * Create a function that prepares environment loading (no-op for MCP usage)
 *
 * CRITICAL: The MCP protocol requires clean JSON-only output on stdout.
 * dotenv has been removed to avoid ES module compatibility issues.
 *
 * Environment variables are passed by the MCP client (Claude Desktop config)
 * and are available directly in process.env.
 *
 * For local testing with .env files, use: node --env-file=.env build/index.js
 *
 * Usage:
 * const loadEnv = createEnvLoader();
 * loadEnv(); // No-op - kept for backward compatibility
 */
export function createEnvLoader(): () => void {
  return () => {
    // No-op: Environment variables are set by MCP client
    // dotenv removed to avoid require() in ES modules
  };
}

/**
 * Helper for consistent error responses
 *
 * @param error Error object or unknown error
 * @param operation Operation name for context
 * @returns MCP-compliant error response
 */
export function createErrorResponse(error: Error | unknown, operation: string) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return {
    content: [
      {
        type: "text" as const,
        text: `Error during ${operation}: ${message}${stack ? `\n\nStack trace:\n${stack}` : ''}`
      }
    ],
    isError: true
  };
}

/**
 * Helper for consistent success responses
 *
 * @param data Data to return (string or object)
 * @returns MCP-compliant success response
 */
export function createSuccessResponse(data: any) {
  let text: string;

  if (typeof data === 'string') {
    text = data;
  } else if (data === null || data === undefined) {
    text = 'Operation completed successfully';
  } else {
    try {
      text = JSON.stringify(data, null, 2);
    } catch (e) {
      text = String(data);
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ]
  };
}

/**
 * Helper for prompt responses with formatted markdown
 *
 * @param markdown Markdown-formatted text
 * @returns MCP-compliant prompt response
 */
export function createMarkdownResponse(markdown: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: markdown
      }
    ]
  };
}

/**
 * Sanitize error messages to remove sensitive data
 *
 * Removes:
 * - Connection strings
 * - API keys
 * - Tokens
 * - IP addresses
 *
 * @param message Original error message
 * @returns Sanitized message
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  // Remove connection strings
  sanitized = sanitized.replace(/Server=[^;]+/gi, 'Server=***');
  sanitized = sanitized.replace(/Password=[^;]+/gi, 'Password=***');
  sanitized = sanitized.replace(/User ID=[^;]+/gi, 'User ID=***');

  // Remove API keys and tokens
  sanitized = sanitized.replace(/api[_-]?key[=:][^\s&]+/gi, 'api_key=***');
  sanitized = sanitized.replace(/token[=:][^\s&]+/gi, 'token=***');
  sanitized = sanitized.replace(/bearer\s+[^\s]+/gi, 'bearer ***');

  // Remove GitHub PATs
  sanitized = sanitized.replace(/ghp_[a-zA-Z0-9]{36}/g, 'ghp_***');

  // Remove IP addresses
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '***.***.***.***');

  return sanitized;
}
