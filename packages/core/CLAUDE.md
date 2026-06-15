# Core Package Guide

## Overview

The `@mcp-consultant-tools/core` package provides shared utilities used by all service packages.

## Key Exports

### createMcpServer()

Factory function for creating MCP server instances with standardized configuration.

```typescript
import { createMcpServer } from '@mcp-consultant-tools/core';

const server = createMcpServer({
  name: 'my-mcp-server',
  version: '1.0.0'
});
```

### createEnvLoader()

**Critical for MCP Protocol Compliance.**

Loads environment variables from `.env` files while suppressing stdout output. This is required because the MCP protocol uses stdio transport and requires clean JSON-only stdout.

```typescript
import { createEnvLoader } from '@mcp-consultant-tools/core';

// Loads .env without corrupting MCP protocol
createEnvLoader();
```

**Why this matters:** `dotenv` can write debug messages to stdout. In MCP servers, any non-JSON output corrupts the protocol. `createEnvLoader()` temporarily redirects stdout during loading.

### auditLogger

Centralized audit logging for all service operations.

```typescript
import { auditLogger } from '@mcp-consultant-tools/core';

auditLogger.log({
  operation: 'create-record',
  componentType: 'account',
  componentId: 'guid',
  success: true,
  duration: 150
});
```

**Logged fields:**
- `operation`: Tool/action name
- `componentType`: Entity/resource type
- `componentId`: Resource identifier
- `success`: Boolean success flag
- `duration`: Execution time (ms)
- `error`: Error message if failed

### Audit subsystem

The audit subsystem provides Phase A PII audit logging:

- `AuditPipeline` — central runtime; each Dataverse tool call routes through `auditEmit(pipeline, opts, fn)`.
- `auditEmit(pipeline, opts, fn)` — wrapper that captures success/error/duration, isolates audit failures (logs to stderr, never blocks tool execution).
- `createAuditConfigFromEnv()` — reads MCP_AUDIT_* env vars, applies refuse-to-start matrix.
- `captureOperator()` — derives operator identity from `MCP_AUDIT_OPERATOR` or `os-user@hostname`.
- `AuditSessionStore` — in-memory engagement state, accessed via `pipeline.setEngagement(...)`.

See [`docs/technical/AUDIT_LOGGING_TECHNICAL.md`](../../docs/technical/AUDIT_LOGGING_TECHNICAL.md).

### Safe filesystem paths

`helpers/safe-path.ts` gives every package one shared implementation of path
confinement for tools that take a caller-supplied path (which prompt injection
could steer into reading/writing outside the intended location):

- `resolveSafePath(userPath, { root? })` — for WRITE destinations. Confines the
  resolved path to a permitted root; rejects `..` traversal and absolute paths
  that escape the root.
- `assertNoTraversal(userPath)` — for READ sources. Rejects `..` traversal but
  allows absolute paths (so "read a file from anywhere I point you" keeps
  working).
- `safeBasename(name)` — collapses an untrusted filename component (e.g. a
  downloaded attachment's own name) to its basename.

**`MCP_FILE_ROOT`** env var sets the permitted root for `resolveSafePath`
(default: the process working directory). Set it when a tool legitimately needs
to write outside the working directory and you hit a "path escapes the permitted
root" error.

## MCP Protocol Requirements

**NEVER use `console.log()` in service packages!**

- `console.log()` and `console.info()` write to **stdout** - FORBIDDEN
- `console.error()` and `console.warn()` write to **stderr** - ALLOWED
- Use `auditLogger` for operational logging

See root CLAUDE.md for full MCP Protocol Requirements section.

## Build Order

Core must be built before service packages:

```
core → service packages → meta
```

This is handled automatically by `npm run build` at workspace root.
