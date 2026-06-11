/**
 * Context-Safe MCP Tool Responses
 *
 * Opt-in mechanism for MCP tools to write large responses to disk
 * and return a summary + file path instead of the full data.
 * The agent can then Read/Grep the cached file for specific details.
 *
 * Controlled by:
 * - MCP_CONTEXT_SAFE_RESPONSE (default: "false") - enable/disable
 * - MCP_RESPONSE_SIZE_THRESHOLD (default: "5000") - byte threshold
 */

import { z } from "zod";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ContextSafeConfig {
  enabled: boolean;
  threshold: number;
  cacheDir: string;
}

export interface ContextSafeResponseOptions {
  toolName: string;
  data: any;
  config: ContextSafeConfig;
  returnFullResponse?: boolean;
  summaryHint?: (data: any) => string;
}

/**
 * Read context-safe configuration from environment variables.
 * Called once per tool registration function (not per invocation).
 *
 * @param cacheDir - Cache subdirectory name, e.g. '.mcp-figma-cache'
 */
export function getContextSafeConfig(cacheDir: string): ContextSafeConfig {
  const enabled = process.env.MCP_CONTEXT_SAFE_RESPONSE === "true";
  const threshold = parseInt(process.env.MCP_RESPONSE_SIZE_THRESHOLD || "5000", 10);

  return {
    enabled,
    threshold: isNaN(threshold) ? 5000 : threshold,
    cacheDir,
  };
}

/**
 * Appends `returnFullResponse` parameter to a tool's Zod schema object.
 * One-line change per tool to adopt context-safe responses.
 */
export function withContextSafeParam<T extends Record<string, z.ZodTypeAny>>(
  schema: T
): T & { returnFullResponse: z.ZodOptional<z.ZodBoolean> } {
  return {
    ...schema,
    returnFullResponse: z
      .boolean()
      .optional()
      .describe(
        "Set to true to force the full response inline (ignores context-safe threshold). " +
        "When omitted or false, large responses may be saved to disk with a summary returned instead."
      ),
  };
}

/**
 * Create an MCP tool response that optionally saves large data to disk.
 *
 * Logic:
 * 1. Serialize data to JSON
 * 2. If context-safe disabled OR returnFullResponse=true OR size <= threshold: return inline
 * 3. Otherwise: write to disk, return summary with file path
 * 4. If file write fails: silently fall back to inline response
 */
export function createContextSafeResponse(opts: ContextSafeResponseOptions) {
  const { toolName, data, config, returnFullResponse, summaryHint } = opts;

  // Serialize data
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else if (data === null || data === undefined) {
    text = "Operation completed successfully";
  } else {
    try {
      text = JSON.stringify(data, null, 2);
    } catch {
      text = String(data);
    }
  }

  const byteSize = Buffer.byteLength(text, "utf-8");

  // Return inline if: feature disabled, override requested, or below threshold
  if (!config.enabled || returnFullResponse === true || byteSize <= config.threshold) {
    return {
      content: [{ type: "text" as const, text }],
    };
  }

  // Attempt to write to disk
  try {
    const baseDir = resolve(process.cwd(), ".context", config.cacheDir);
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }

    const timestamp = Date.now();
    const fileName = `${toolName}_${timestamp}.json`;
    const filePath = join(baseDir, fileName);

    writeFileSync(filePath, text, "utf-8");

    // Build summary
    const hint = summaryHint ? summaryHint(data) : "Data extracted successfully";
    const formattedSize = byteSize.toLocaleString("en-US");
    const formattedThreshold = config.threshold.toLocaleString("en-US");

    const summary =
      `## ${toolName} result\n\n` +
      `**Status:** Success\n` +
      `**Details:** ${hint}\n` +
      `**Size:** ${formattedSize} bytes (threshold: ${formattedThreshold} bytes)\n` +
      `**Saved to:** ${filePath}\n\n` +
      `Use the Read tool on the path above to view the full response.\n` +
      `Use Grep on the path to search within the response.`;

    return {
      content: [{ type: "text" as const, text: summary }],
    };
  } catch {
    // File write failed - fall back to inline response
    return {
      content: [{ type: "text" as const, text }],
    };
  }
}
