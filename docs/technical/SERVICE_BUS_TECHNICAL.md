# Azure Service Bus - Technical Documentation

<!-- This document is optimized for agent consumption using XML tags for structure.
     For human-readable setup guide, see docs/documentation/SERVICE_BUS.md -->

<overview>

The Azure Service Bus integration provides read-only inspection of Service Bus queues and dead letter queues for troubleshooting, monitoring, and message investigation. It supports multiple namespaces, two authentication methods, session-enabled queues, and cross-service correlation with Application Insights and Log Analytics.

**Package:** `@mcp-consultant-tools/service-bus`
**MCP binary:** `mcp-sb`
**CLI binary:** `mcp-sb-cli`
**Tools:** 8 tools, 4 prompts

</overview>

<architecture>

<service-class>

**Class:** `ServiceBusService` (`packages/service-bus/src/services/service-bus-service.ts`)

Responsibilities:
- Dual client management: `ServiceBusClient` (message operations) + `ServiceBusAdministrationClient` (management operations)
- Authentication: Entra ID OAuth 2.0 via MSAL/ClientSecretCredential, or connection string
- Read-only message inspection using `peekMessages()` exclusively
- Queue list caching with configurable TTL
- Multiple namespace support with active/inactive flags

**ServiceContext** (`types.ts`):
```typescript
export interface ServiceContext {
  readonly serviceBus: ServiceBusService;
}
```

</service-class>

<dual-client-architecture>

The service maintains two separate client maps per namespace:

| Client | Class | Operations |
|--------|-------|------------|
| Message client | `ServiceBusClient` | `peekMessages()`, session acceptance |
| Admin client | `ServiceBusAdministrationClient` | `getQueueRuntimeProperties()`, `getNamespaceProperties()`, list queues |

This separation provides:
- Clean separation of concerns (data vs. management plane)
- Independent error handling per client type
- Compliance with Azure SDK best practices

```typescript
private clients: Map<string, ServiceBusClient> = new Map();
private adminClients: Map<string, ServiceBusAdministrationClient> = new Map();
```

</dual-client-architecture>

<authentication>

<auth-method name="entra-id">

**Microsoft Entra ID (OAuth 2.0)** — default, recommended for production

- Uses `@azure/identity` `ClientSecretCredential` directly for client creation
- MSAL `ConfidentialClientApplication` used for token introspection
- Token scope: `https://servicebus.azure.net/.default`
- Token cached in memory with 5-minute buffer before 1-hour expiry
- Automatic token refresh on expiration
- Required Azure role: **Azure Service Bus Data Receiver** (on namespace or resource group)

Environment variables required:
- `SERVICEBUS_TENANT_ID`
- `SERVICEBUS_CLIENT_ID`
- `SERVICEBUS_CLIENT_SECRET`

</auth-method>

<auth-method name="connection-string">

**Connection String** — for testing/legacy setups

- Direct connection string authentication
- Requires SharedAccessKey with Listen permissions
- Bypasses all token management
- Set `SERVICEBUS_AUTH_METHOD=connection-string`

Environment variable:
- `SERVICEBUS_CONNECTION_STRING` — per namespace (can also be set per-resource in `SERVICEBUS_RESOURCES`)

</auth-method>

</authentication>

<configuration-parsing>

Two namespace configuration modes are supported. Multi-namespace takes priority.

```typescript
// Multi-namespace (JSON array in SERVICEBUS_RESOURCES)
if (process.env.SERVICEBUS_RESOURCES) {
  resources = JSON.parse(process.env.SERVICEBUS_RESOURCES);
}
// Single-namespace fallback
else if (process.env.SERVICEBUS_NAMESPACE) {
  resources = [{
    id: 'default',
    name: 'Default Service Bus',
    namespace: process.env.SERVICEBUS_NAMESPACE,
    active: true,
    connectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
  }];
}
```

**`ServiceBusResource` interface:**
```typescript
interface ServiceBusResource {
  id: string;           // Short identifier used as resourceId in tool calls
  name: string;         // Display name
  namespace: string;    // Full FQDN: your-ns.servicebus.windows.net
  active: boolean;      // Set false to disable without removing config
  connectionString?: string;
  description?: string;
}
```

**`ServiceBusConfig` interface:**
```typescript
interface ServiceBusConfig {
  resources: ServiceBusResource[];
  authMethod: 'entra-id' | 'connection-string';
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  sanitizeMessages?: boolean;     // default: false
  peekTimeout?: number;           // default: 30000 ms
  retryMaxAttempts?: number;      // default: 3
  retryDelay?: number;            // default: 1000 ms
  maxSearchMessages?: number;     // default: 500
  maxPeekMessages?: number;       // default: 100
  cacheQueueListTTL?: number;     // default: 300 seconds
}
```

**Full environment variable reference:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICEBUS_NAMESPACE` | Yes* | — | Single namespace FQDN |
| `SERVICEBUS_RESOURCES` | Yes* | — | JSON array for multi-namespace |
| `SERVICEBUS_TENANT_ID` | Entra ID | — | Azure tenant ID |
| `SERVICEBUS_CLIENT_ID` | Entra ID | — | App registration client ID |
| `SERVICEBUS_CLIENT_SECRET` | Entra ID | — | App registration secret |
| `SERVICEBUS_AUTH_METHOD` | No | `entra-id` | `entra-id` or `connection-string` |
| `SERVICEBUS_CONNECTION_STRING` | Conn. str. | — | Full connection string |
| `SERVICEBUS_SANITIZE_MESSAGES` | No | `false` | Enable PII redaction |
| `SERVICEBUS_MAX_PEEK_MESSAGES` | No | `100` | Hard cap on peek operations |
| `SERVICEBUS_MAX_SEARCH_MESSAGES` | No | `500` | Hard cap on search scans |
| `SERVICEBUS_PEEK_TIMEOUT` | No | `30000` | Peek timeout in ms |
| `SERVICEBUS_RETRY_MAX_ATTEMPTS` | No | `3` | Retry attempts on failure |
| `SERVICEBUS_RETRY_DELAY` | No | `1000` | Retry delay in ms |
| `SERVICEBUS_CACHE_QUEUE_LIST_TTL` | No | `300` | Queue list cache TTL in seconds |

*One of `SERVICEBUS_NAMESPACE` or `SERVICEBUS_RESOURCES` is required.

</configuration-parsing>

<lazy-initialization>

The service is created on first tool or prompt invocation:

```typescript
function createServiceContext(): ServiceContext {
  let service: ServiceBusService | null = null;

  function getService(): ServiceBusService {
    if (!service) {
      // Validate resources
      if (!process.env.SERVICEBUS_RESOURCES && !process.env.SERVICEBUS_NAMESPACE) {
        throw new Error("Missing Service Bus configuration: SERVICEBUS_RESOURCES or SERVICEBUS_NAMESPACE");
      }
      // Build config, create service
      service = new ServiceBusService(config);
    }
    return service;
  }

  return {
    get serviceBus() { return getService(); },
  };
}
```

</lazy-initialization>

<cleanup-handlers>

The server registers SIGINT and SIGTERM handlers that call `serviceBusService.close()` to dispose all `ServiceBusClient` and `ServiceBusAdministrationClient` instances gracefully before exit.

</cleanup-handlers>

</architecture>

<tool-reference>

All 8 tools are read-only. No tool modifies, consumes, or deletes messages.

<tool name="sb-list-namespaces">

**Description:** List all configured Service Bus namespaces (active and inactive).

**Parameters:** none

**Returns:** Array of `ServiceBusResource` objects including `id`, `name`, `namespace`, `active` flag.

**Notes:** Returns from in-memory config — no network call. Use `id` values as `resourceId` in all other tools.

</tool>

<tool name="sb-test-connection">

**Description:** Test connectivity to a Service Bus namespace and verify permissions (Data Receiver + Reader roles).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID from `sb-list-namespaces` |

**Returns:** Connection test result including namespace info and permission status.

</tool>

<tool name="sb-list-queues">

**Description:** List all queues in a Service Bus namespace with message counts and session info. Results cached for 5 minutes (configurable).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID from `sb-list-namespaces` |

**Returns:** Array of `QueueInfo`:
```typescript
interface QueueInfo {
  name: string;
  activeMessageCount: number;
  deadLetterMessageCount: number;
  scheduledMessageCount: number;
  sizeInBytes: number | undefined;
  totalMessageCount: number | undefined;
  requiresSession: boolean;
}
```

**Caching:** Results cached per `resourceId` with TTL from `SERVICEBUS_CACHE_QUEUE_LIST_TTL` (default 300s). Fresh data is fetched after TTL expires.

</tool>

<tool name="sb-peek-messages">

**Description:** Peek messages in a queue without removing them (read-only, max 100 messages).

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceId` | string | Yes | — | Resource ID |
| `queueName` | string | Yes | — | Queue name |
| `maxMessages` | number | No | 10 | Messages to peek (hard cap: 100) |
| `sessionId` | string | No | — | Session ID for session-enabled queues |

**CRITICAL:** Uses `peekMessages()` only — never `receiveMessages()`. Messages remain in queue.

</tool>

<tool name="sb-peek-deadletter">

**Description:** Peek dead letter queue messages with failure reasons (read-only, max 100 messages).

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceId` | string | Yes | — | Resource ID |
| `queueName` | string | Yes | — | Source queue name (DLQ path `queueName/$DeadLetterQueue` resolved internally) |
| `maxMessages` | number | No | 10 | Messages to peek (hard cap: 100) |
| `sessionId` | string | No | — | Session ID for session-enabled DLQs |

**DLQ path:** The service appends `/$DeadLetterQueue` automatically. Pass the source queue name, not the DLQ path.

</tool>

<tool name="sb-get-queue-props">

**Description:** Get detailed queue properties, metrics, and configuration including session info.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |
| `queueName` | string | Yes | Queue name |

**Returns:** Combined runtime properties + queue configuration:
- `activeMessageCount`, `deadLetterMessageCount`, `scheduledMessageCount`, `sizeInBytes`
- `maxSizeInMegabytes`, `lockDuration`, `maxDeliveryCount`
- `requiresDuplicateDetection`, `requiresSession`, `enablePartitioning`, `status`

Uses `ServiceBusAdministrationClient.getQueueRuntimeProperties()` + `getQueue()`.

</tool>

<tool name="sb-search-messages">

**Description:** Search messages by content or properties. Peeks messages in batches and filters client-side (max 500 messages scanned).

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `resourceId` | string | Yes | — | Resource ID |
| `queueName` | string | Yes | — | Queue name |
| `bodyContains` | string | No | — | Case-insensitive text search in message body |
| `correlationId` | string | No | — | Exact match on correlation ID |
| `messageId` | string | No | — | Exact match on message ID |
| `propertyKey` | string | No | — | Application property key to filter by |
| `propertyValue` | any | No | — | Application property value to match (exact) |
| `sessionId` | string | No | — | Session ID for session-enabled queues |
| `maxMessages` | number | No | 50 | Maximum messages to scan (hard cap: 500) |

**Returns:** `SearchResult`:
```typescript
interface SearchResult {
  messages: ServiceBusReceivedMessage[];
  totalPeeked: number;
  matchCount: number;
  limitReached: boolean;
}
```

**Search algorithm:** Peeks in batches of 100. Stops when `matchCount >= maxMessages` or no more messages. All filtering is client-side — Service Bus has no server-side message filtering API.

**`matchesCriteria` logic:**
```typescript
private matchesCriteria(msg, criteria): boolean {
  if (criteria.correlationId && msg.correlationId !== criteria.correlationId) return false;
  if (criteria.messageId && msg.messageId !== criteria.messageId) return false;
  if (criteria.sessionId && msg.sessionId !== criteria.sessionId) return false;
  if (criteria.bodyContains) {
    const bodyStr = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
    if (!bodyStr.includes(criteria.bodyContains)) return false;
  }
  if (criteria.propertyKey && criteria.propertyValue) {
    if (msg.applicationProperties?.[criteria.propertyKey] !== criteria.propertyValue) return false;
  }
  return true;
}
```

</tool>

<tool name="sb-get-ns-props">

**Description:** Get namespace-level properties and quotas (tier, max message size).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resourceId` | string | Yes | Resource ID |

**Returns:** Namespace tier, capacity, max message size. Uses `ServiceBusAdministrationClient.getNamespaceProperties()`.

</tool>

</tool-reference>

<prompt-reference>

4 prompts available. All prompts gather data via service methods, format results as Markdown, and return them as a `user` role message.

<prompt name="sb-namespace-overview">

**Description:** Comprehensive namespace overview with all queues and health metrics.

**Parameters:** `resourceId` (string, required)

**Data gathered:** `getNamespaceProperties()` + `listQueues()`. Formatted via `formatNamespaceOverviewAsMarkdown()`.

</prompt>

<prompt name="sb-queue-health">

**Description:** Detailed health report for a specific queue with recommendations.

**Parameters:** `resourceId` (string, required), `queueName` (string, required)

**Data gathered:** `getQueueProperties()`, `getQueueConfigProperties()`, `peekMessages(10)`, `peekDeadLetterMessages(10)`.

**Health status logic** (via `getQueueHealthStatus()`):
- `critical` — DLQ has any messages, OR queue size > 90% of max
- `warning` — active message count > 1000
- `healthy` — none of the above

**Recommendations generated:**
- CRITICAL: Investigate DLQ immediately, check consumer health, consider scaling
- WARNING: Review processing times, check bottlenecks, monitor DLQ growth
- HEALTHY: Continue regular monitoring

</prompt>

<prompt name="sb-deadletter-analysis">

**Description:** DLQ investigation with pattern detection and actionable recommendations.

**Parameters:** `resourceId` (string, required), `queueName` (string, required), `maxMessages` (string, optional, default: "50")

**Data gathered:** `peekDeadLetterMessages(maxMessages)`. Returns early with a clean result message if DLQ is empty.

**Analysis via `analyzeDeadLetterMessages()`:**
- Groups messages by `deadLetterReason`
- Builds hourly timeline of failures
- Generates recommendations:
  - `MaxDeliveryCountExceeded` → review processing logic, consider increasing delivery count or retry-with-backoff
  - `MessageLockLostException` → increase lock duration or optimize processing speed

</prompt>

<prompt name="sb-message-inspection">

**Description:** Detailed single message inspection with cross-service troubleshooting suggestions.

**Parameters:** `resourceId` (string, required), `queueName` (string, required), `messageId` (string, optional), `isDeadLetter` (string, optional, `"true"` or `"false"`)

**Behavior:** Peeks up to 100 messages, finds the target by `messageId` (or uses first message if not specified). Formatted via `formatMessageInspectionAsMarkdown()`.

</prompt>

</prompt-reference>

<service-implementation>

<message-peek-implementation>

```typescript
async peekMessages(
  resourceId: string,
  queueName: string,
  maxMessages?: number,
  sessionId?: string
): Promise<ServiceBusReceivedMessage[]> {
  const timer = auditLogger.startTimer();
  const limit = Math.min(maxMessages || 10, this.config.maxPeekMessages || 100);

  const client = this.getClient(resourceId);
  const receiver = sessionId
    ? client.acceptSession(queueName, sessionId)
    : client.createReceiver(queueName);

  try {
    // CRITICAL: Use peekMessages() only — never receiveMessages()
    const messages = await receiver.peekMessages(limit, {
      timeout: this.config.peekTimeout || 30000
    });

    const sanitized = this.config.sanitizeMessages
      ? messages.map(m => this.sanitizeMessage(m))
      : messages;

    auditLogger.log({
      operation: 'peek-messages',
      operationType: 'READ',
      resourceId,
      componentType: 'Queue',
      componentName: queueName,
      success: true,
      parameters: { maxMessages: limit, sessionId },
      executionTimeMs: timer()
    });

    return sanitized;
  } finally {
    await receiver.close();
  }
}
```

</message-peek-implementation>

<dlq-implementation>

DLQ path is constructed by appending `/$DeadLetterQueue` to the source queue name:

```typescript
async peekDeadLetterMessages(
  resourceId: string,
  queueName: string,
  maxMessages?: number,
  sessionId?: string
): Promise<ServiceBusReceivedMessage[]> {
  const dlqPath = `${queueName}/$DeadLetterQueue`;
  const client = this.getClient(resourceId);
  const receiver = sessionId
    ? client.acceptSession(dlqPath, sessionId)
    : client.createReceiver(dlqPath);

  try {
    const messages = await receiver.peekMessages(
      Math.min(maxMessages || 10, this.config.maxPeekMessages || 100)
    );
    return this.config.sanitizeMessages
      ? messages.map(m => this.sanitizeMessage(m))
      : messages;
  } finally {
    await receiver.close();
  }
}
```

</dlq-implementation>

<queue-list-caching>

Queue list results are cached in memory per `resourceId`:

```typescript
private queueListCache: Map<string, { data: QueueInfo[]; expires: number }> = new Map();

async listQueues(resourceId: string): Promise<QueueInfo[]> {
  const cacheKey = `${resourceId}:queues`;
  const cached = this.queueListCache.get(cacheKey);

  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  const queues = await this.fetchQueuesFromServiceBus(resourceId);
  const ttl = this.config.cacheQueueListTTL || 300;
  this.queueListCache.set(cacheKey, {
    data: queues,
    expires: Date.now() + (ttl * 1000)
  });

  return queues;
}
```

TTL defaults to 300 seconds (5 minutes). Set `SERVICEBUS_CACHE_QUEUE_LIST_TTL` to adjust.

</queue-list-caching>

<token-management>

For Entra ID auth:
- MSAL `ConfidentialClientApplication` initialized at service construction time
- Scope: `https://servicebus.azure.net/.default`
- Token cached in memory with 5-minute buffer before 1-hour expiry
- Automatic refresh on next request after expiry
- Token never persisted to disk or logged

```typescript
private msalClient: ConfidentialClientApplication | null = null;
private accessToken: string | null = null;
private tokenExpirationTime: number = 0;
```

Note: Client creation uses `ClientSecretCredential` from `@azure/identity` directly — MSAL is used only for supplementary token operations.

</token-management>

</service-implementation>

<formatters>

**File:** `packages/service-bus/src/utils/servicebus-formatters.ts`

All formatters transform raw SDK objects into Markdown for prompt output or structured analysis.

| Formatter | Purpose |
|-----------|---------|
| `formatNamespaceOverviewAsMarkdown()` | Complete namespace overview with queue table |
| `formatQueueListAsMarkdown()` | Queue table with health status indicators |
| `formatMessagesAsMarkdown()` | Message list with metadata |
| `formatMessageInspectionAsMarkdown()` | Detailed single message with content type detection |
| `formatDeadLetterAnalysisAsMarkdown()` | DLQ report with pattern insights |
| `analyzeDeadLetterMessages()` | Pattern detection and recommendations (used by DLQ prompt) |
| `detectMessageFormat()` | Auto-detect message format (JSON/XML/text/binary) |
| `getQueueHealthStatus()` | Compute health status: `healthy` / `warning` / `critical` |
| `generateServiceBusTroubleshootingGuide()` | Comprehensive troubleshooting report |
| `generateCrossServiceReport()` | Multi-service correlation report |

<formatter-detail name="detectMessageFormat">

```typescript
function detectMessageFormat(message): {
  format: 'json' | 'xml' | 'text' | 'binary' | 'unknown';
  isValid: boolean;
  error?: string;
}
```

Detection order:
1. Check `contentType` header for `json` or `xml` hint, validate accordingly
2. If body is object → `json`
3. If body is string starting with `{` or `[` → try `JSON.parse` → `json` or `text`
4. If body is string starting with `<` → `xml`
5. If body is `Buffer` or `ArrayBuffer` → `binary`
6. Otherwise → `unknown`

</formatter-detail>

<formatter-detail name="getQueueHealthStatus">

```typescript
function getQueueHealthStatus(queue: QueueInfo): {
  status: 'healthy' | 'warning' | 'critical';
  icon: string;
  reason: string;
}
```

Thresholds:
- **critical** if `deadLetterMessageCount > 0`
- **critical** if `sizeInBytes > maxSizeInMegabytes * 1024 * 1024 * 0.9` (90% full)
- **warning** if `activeMessageCount > 1000`
- **healthy** otherwise

</formatter-detail>

</formatters>

<security>

<read-only-guarantee>

All message operations use `peekMessages()` exclusively. `receiveMessages()` is never called. This guarantees:
- Messages remain in the queue after inspection
- No message locks are acquired (peek does not lock)
- No message deletion or modification is possible
- Safe for production troubleshooting without operational impact

</read-only-guarantee>

<credential-management>

- Tokens stored in memory only, never persisted to disk
- Connection strings never logged
- Token cleared on service disposal via `close()`
- Automatic token refresh (Entra ID mode)

</credential-management>

<message-sanitization>

Disabled by default (`SERVICEBUS_SANITIZE_MESSAGES=false`). When enabled (`=true`), `sanitizeMessage()` redacts:
- Message bodies containing potential PII patterns
- Application properties matching sensitive key patterns
- Connection strings embedded in error messages

Use when sharing message content externally or in regulated environments.

</message-sanitization>

<rbac>

For Entra ID authentication, the service principal requires:
- **Azure Service Bus Data Receiver** role on the namespace (or resource group)
- Read-only access only — no Send, Manage, or Delete permissions required

</rbac>

</security>

<error-handling>

<error-category name="authentication">

- Missing env vars at init → thrown before service creation with list of missing variables
- Invalid credentials → 401 from Azure SDK, surfaced as tool error with `isError: true`
- Token expiry → automatic refresh; if refresh fails, next call surfaces the error
- Missing Entra ID fields with `authMethod=entra-id` → thrown at service construction

</error-category>

<error-category name="connection">

- Namespace not found → DNS resolution failure or 404, surfaced in error message
- Firewall blocking → timeout or connection refused, suggests checking network rules
- Queue not found → error includes the queue name that was not found

</error-category>

<error-category name="peek">

- Timeout (default 30s) → configurable via `SERVICEBUS_PEEK_TIMEOUT`
- Empty queue → returns empty array, not an error
- Session-enabled queue without `sessionId` → Azure SDK error indicating session is required
- `MessageLockLostException` → not applicable for peek (peek does not acquire locks)

</error-category>

<error-category name="queue-errors">

- Queue disabled or inactive → status returned in properties, surfaced in error if operation attempted
- Resource `active: false` in config → `getAllResources()` still returns it; operations will attempt connection

</error-category>

All tool catch blocks return `{ isError: true }` in the MCP response.

</error-handling>

<performance>

<caching-strategy>

- Queue list: 5-minute in-memory cache per `resourceId` (reduces management API calls by ~95%)
- Clients: cached per `resourceId` for the service lifetime, created on first use
- Tokens: cached with 5-minute pre-expiry buffer

</caching-strategy>

<search-batching>

`searchMessages()` peeks in batches of 100 and applies client-side filtering. It stops when:
1. `matchCount >= maxMessages` (the search limit), or
2. The peek returns 0 messages (end of queue)

Maximum total scan: `maxMessages * 2` messages peeked (capped by `SERVICEBUS_MAX_SEARCH_MESSAGES`).

</search-batching>

<limits>

| Operation | Default | Hard Cap | Environment Variable |
|-----------|---------|----------|----------------------|
| Peek messages | 10 | 100 | `SERVICEBUS_MAX_PEEK_MESSAGES` |
| Search scan | 50 | 500 | `SERVICEBUS_MAX_SEARCH_MESSAGES` |
| Peek timeout | 30000 ms | — | `SERVICEBUS_PEEK_TIMEOUT` |
| Queue list TTL | 300 s | — | `SERVICEBUS_CACHE_QUEUE_LIST_TTL` |

</limits>

</performance>

<cli-architecture>

The CLI reuses the same `ServiceContext` and service methods as the MCP server.

<file-structure>

```
packages/service-bus/src/
  cli.ts                               # Entry point (Commander.js program)
  context-factory.ts                   # Shared createServiceContext() for CLI
  cli/
    output.ts                          # outputResult wrapper, cache dir: .mcp-sb-cache
    commands/
      index.ts                         # registerAllCommands() aggregator
      namespace-commands.ts            # 3 namespace commands
      queue-commands.ts                # 5 queue commands
```

</file-structure>

<command-groups>

| Group | Commands | File |
|-------|----------|------|
| `namespace` | `list`, `test`, `props` | `namespace-commands.ts` |
| `queue` | `list`, `props`, `peek`, `peek-dlq`, `search` | `queue-commands.ts` |

</command-groups>

<command-reference>

**Namespace commands:**

| Command | Arguments | Options | MCP Tool |
|---------|-----------|---------|----------|
| `namespace list` | — | — | `sb-list-namespaces` |
| `namespace test <resourceId>` | resourceId | — | `sb-test-connection` |
| `namespace props <resourceId>` | resourceId | — | `sb-get-ns-props` |

**Queue commands:**

| Command | Arguments | Options | MCP Tool |
|---------|-----------|---------|----------|
| `queue list <resourceId>` | resourceId | — | `sb-list-queues` |
| `queue props <resourceId> <queueName>` | resourceId, queueName | — | `sb-get-queue-props` |
| `queue peek <resourceId> <queueName>` | resourceId, queueName | `-n/--max-messages`, `-s/--session-id` | `sb-peek-messages` |
| `queue peek-dlq <resourceId> <queueName>` | resourceId, queueName | `-n/--max-messages`, `-s/--session-id` | `sb-peek-deadletter` |
| `queue search <resourceId> <queueName>` | resourceId, queueName | `-b/--body-contains`, `-c/--correlation-id`, `-m/--message-id`, `-k/--property-key`, `-v/--property-value`, `-s/--session-id`, `-n/--max-messages` | `sb-search-messages` |

</command-reference>

<global-flags>

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of summary |
| `--no-cache` | Skip writing to cache directory |
| `--env-file <path>` | Load custom `.env` file |

Output: summary to stdout + full JSON cached to `.context/.mcp-sb-cache/`.

</global-flags>

<cli-examples>

```bash
# List configured namespaces
mcp-sb-cli namespace list

# Test connectivity
mcp-sb-cli namespace test prod

# Get namespace quotas
mcp-sb-cli namespace props prod

# List all queues with message counts
mcp-sb-cli queue list prod

# Get queue properties and metrics
mcp-sb-cli queue props prod orders-queue

# Peek recent messages
mcp-sb-cli queue peek prod orders-queue --max-messages 20

# Inspect dead letter queue
mcp-sb-cli queue peek-dlq prod orders-queue --max-messages 50

# Search by correlation ID
mcp-sb-cli queue search prod orders-queue --correlation-id abc-123

# Search by body content
mcp-sb-cli queue search prod orders-queue --body-contains "OrderId" --max-messages 100

# Raw JSON output
mcp-sb-cli --json queue list prod
```

</cli-examples>

</cli-architecture>

<use-cases>

**Queue Health Monitoring:**
- Monitor all queues for backlog and DLQ growth via `sb-list-queues` + `sb-get-queue-props`
- Use `sb-namespace-overview` prompt for a complete namespace health snapshot
- Identify queues approaching size limits

**Dead Letter Queue Investigation:**
- Use `sb-peek-deadletter` to inspect failed messages
- Use `sb-deadletter-analysis` prompt for automated pattern detection and recommendations
- Common DLQ reasons: `MaxDeliveryCountExceeded`, `MessageLockLostException`, `DeadLetterMessageSenderCannotBeLocked`

**Message Tracing:**
- Search by `correlationId` across queues to trace message flow
- Use `sb-message-inspection` prompt for deep inspection of a specific message
- Correlate with Application Insights traces using the same correlation ID

**Cross-Service Troubleshooting:**
- Combine Service Bus data with Application Insights (`sb-search-messages` → App Insights query by same correlation ID)
- Use Log Analytics to correlate timestamps with Service Bus failures
- `generateCrossServiceReport()` formatter supports multi-service correlation reports

**Session-Enabled Queues:**
- Pass `sessionId` to `sb-peek-messages` or `sb-peek-deadletter` to inspect session-specific messages
- FIFO ordering is maintained within a session

</use-cases>
