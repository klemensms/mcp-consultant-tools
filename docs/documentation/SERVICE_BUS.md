# Azure Service Bus Integration Documentation

**📦 Package:** `@mcp-consultant-tools/service-bus`
**🔒 Security:** Production-safe (read-only access, no message deletion or modification)

Complete guide to using the Azure Service Bus integration with MCP Consultant Tools.

---

## ⚡ Quick Start

### MCP Client Configuration

Get started quickly with this minimal configuration. Just replace the placeholder values with your actual credentials:

#### For VS Code

Add this to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "service-bus": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/service-bus", "mcp-sb"],
      "env": {
        "SERVICEBUS_NAMESPACE": "your-namespace.servicebus.windows.net",
        "SERVICEBUS_CLIENT_ID": "your-client-id",
        "SERVICEBUS_CLIENT_SECRET": "your-client-secret",
        "SERVICEBUS_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

#### For Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "service-bus": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/service-bus", "mcp-sb"],
      "env": {
        "SERVICEBUS_NAMESPACE": "your-namespace.servicebus.windows.net",
        "SERVICEBUS_CLIENT_ID": "your-client-id",
        "SERVICEBUS_CLIENT_SECRET": "your-client-secret",
        "SERVICEBUS_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

#### Test Your Setup

After configuring, test the connection by listing queues:

```javascript
// Ask Claude: "List all queues in my Service Bus namespace"
// Or use the namespace overview prompt:
await mcpClient.invoke("servicebus-namespace-overview", {
  resourceId: "prod"
});
```

**Need credentials?** See the [Detailed Setup](#detailed-setup) section below for Azure AD service principal creation and permissions.

---

## 🎯 Key Features for Consultants

### Automated Workflows (Prompts)

This package includes **5 pre-built prompts** that generate formatted, human-readable reports from Service Bus data. These prompts are designed for consultants and first responders who need quick insights for troubleshooting and monitoring.

#### Service Bus Analysis Prompts

1. **`servicebus-namespace-overview`** - Comprehensive overview of namespace with all queues and health metrics
   - Example: `"Show me an overview of the production Service Bus namespace"`
   - Includes: Queue summary table, health indicators, message counts, DLQ status

2. **`servicebus-queue-health`** - Detailed health report for a specific queue with recommendations
   - Example: `"Check the health of the orders-queue"`
   - Includes: Health status, metrics, configuration settings, recommendations

3. 🔥 **`servicebus-dlq-analysis`** - **MOST VALUABLE** - Analyzes dead-letter queue messages to identify patterns and root causes
   - Example: `"Analyze dead-letter messages in the orders-queue"`
   - Includes: Failure reason summary, top error patterns, message timeline, actionable recommendations
   - **Use Case:** First-responder guide for troubleshooting message processing failures

4. **`servicebus-message-inspection`** - Inspect a single message in detail with cross-service troubleshooting recommendations
   - Example: `"Inspect the first message in the orders-queue"`
   - Includes: Message metadata, body (formatted), properties, correlation suggestions

5. **`servicebus-cross-service-troubleshooting`** - Generate comprehensive troubleshooting report correlating Service Bus with Application Insights and Log Analytics
   - Example: `"Troubleshoot messages with correlation ID order-12345"`
   - Includes: Queue health, recent messages, DLQ patterns, correlated telemetry, root cause suggestions

### Telemetry Query Tools

Beyond prompts, this package provides **8 specialized tools** for Service Bus operations:

- **`servicebus-list-namespaces`** - List all configured Service Bus namespaces
- **`servicebus-test-connection`** - Test connectivity to a namespace
- **`servicebus-list-queues`** - List all queues with metadata and health status
- **`servicebus-peek-messages`** - Peek messages without removing them (read-only)
- **`servicebus-peek-deadletter`** - Peek dead-letter queue messages
- **`servicebus-get-queue-properties`** - Get detailed queue properties and configuration
- **`servicebus-search-messages`** - Search messages by correlation ID, message ID, or body content
- **`servicebus-get-namespace-properties`** - Get namespace-level properties

**Why the DLQ analysis is most valuable:**
- Identifies patterns in message failures automatically
- Groups failures by reason (MaxDeliveryCountExceeded, MessageLockLostException, etc.)
- Provides actionable recommendations for fixing issues
- Correlates with Application Insights for root cause analysis
- Perfect for incident response and troubleshooting

---

## Table of Contents

1. [Overview](#overview)
2. [Detailed Setup](#detailed-setup)
3. [Tools](#tools)
4. [Prompts](#prompts)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Azure Service Bus?

Azure Service Bus is a fully managed enterprise message broker with message queues and publish-subscribe topics:
- **Reliable message delivery** with at-least-once delivery guarantee
- **Advanced queuing** with sessions, scheduled delivery, and message deferral
- **Dead letter queues** for failed message handling
- **FIFO ordering** with session-enabled queues
- **High throughput** with partitioning and batching

**Primary Use Case**: Read-only inspection of Service Bus queues and dead letter queues for troubleshooting, monitoring, and message investigation.

### Key Features

**Read-Only by Design:**
- ✅ Uses `peekMessages()` only - never `receiveMessages()`
- ✅ Messages remain in queue after inspection
- ✅ No message deletion or modification
- ✅ Safe for production troubleshooting

**Dual Client Architecture:**
- **ServiceBusClient**: Message operations (peek, search)
- **ServiceBusAdministrationClient**: Management operations (queue properties, namespace info)

**Message Inspection:**
- Peek messages in queues without removal
- Inspect dead letter queues for failure analysis
- Search messages by correlation ID, message ID, or body content
- Session-enabled queue support
- Message format detection (JSON, XML, text, binary)

**Queue Management:**
- List all queues with health metrics
- Get queue properties (size, message counts, configuration)
- Get namespace properties (tier, capacity)
- Queue health status indicators (healthy/warning/critical)

**Security Features:**
- 🔒 Credential sanitization (optional, OFF by default)
- 🔒 Connection string redaction in error messages
- 🔒 Configurable peek limits (default: 100 messages)
- 🔒 Audit logging of all operations
- 🔒 Graceful client disposal on shutdown

---

## Detailed Setup

### Prerequisites

1. **Azure Service Bus namespace** (Standard or Premium tier)
2. **Queues** created in the namespace
3. **Authentication credentials** (Entra ID or connection string)
4. **Network access** to Service Bus namespace (firewall rules, private endpoints)

### Authentication Methods

**Entra ID (Microsoft Entra ID) - RECOMMENDED**
- ✅ Better security (token-based)
- ✅ No stored connection strings
- ✅ Automatic token refresh
- ✅ RBAC-based access control
- ❌ More complex setup

**Connection String**
- ✅ Simple setup
- ✅ Quick testing
- ❌ Stored secrets (less secure than Entra ID)
- ❌ Broad permissions

### Entra ID Setup (Recommended)

#### Step 1: Create Azure AD App Registration

1. Go to Azure Portal → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. **Name**: `MCP-ServiceBus-Reader`
4. **Supported account types**: Single tenant
5. Click **Register**
6. Note the **Application (client) ID** and **Directory (tenant) ID**

#### Step 2: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. **Description**: `MCP Service Bus Access`
4. **Expires**: 12 months (or 24 months)
5. Click **Add**
6. **IMPORTANT**: Copy the secret **Value** immediately (shown only once)

#### Step 3: Grant Service Bus Permissions

Assign the **Azure Service Bus Data Receiver** role to your app registration:

```bash
# Get your Service Bus namespace resource ID
az servicebus namespace show \
  --name your-namespace-name \
  --resource-group your-resource-group \
  --query id -o tsv

# Assign role (replace placeholders)
az role assignment create \
  --role "Azure Service Bus Data Receiver" \
  --assignee <app-client-id> \
  --scope <namespace-resource-id>
```

Or via Azure Portal:
1. Navigate to your **Service Bus namespace**
2. Go to **Access control (IAM)**
3. Click **Add** → **Add role assignment**
4. **Role**: `Azure Service Bus Data Receiver`
5. **Assign access to**: User, group, or service principal
6. **Select**: Your app registration name
7. Click **Save**

#### Step 4: Configure Environment Variables

Add to your `.env` file or Claude Desktop configuration:

```bash
# Service Bus - Entra ID Authentication
SERVICEBUS_AUTH_METHOD=entra-id
SERVICEBUS_TENANT_ID=your-tenant-id
SERVICEBUS_CLIENT_ID=your-app-client-id
SERVICEBUS_CLIENT_SECRET=your-client-secret

# Single namespace configuration
SERVICEBUS_NAMESPACE=your-namespace-name.servicebus.windows.net

# OR multi-namespace configuration (JSON array)
SERVICEBUS_RESOURCES=[{"id":"prod","name":"Production Service Bus","namespace":"prod-namespace.servicebus.windows.net","active":true}]

# Optional configuration
SERVICEBUS_SANITIZE_MESSAGES=false
SERVICEBUS_MAX_PEEK_MESSAGES=100
SERVICEBUS_MAX_SEARCH_MESSAGES=500
SERVICEBUS_PEEK_TIMEOUT=30000
SERVICEBUS_RETRY_MAX_ATTEMPTS=3
SERVICEBUS_RETRY_DELAY=1000
SERVICEBUS_CACHE_QUEUE_LIST_TTL=300
```

### Connection String Setup

#### Step 1: Get Connection String

1. Go to Azure Portal → Your **Service Bus namespace**
2. Go to **Shared access policies**
3. Click on **RootManageSharedAccessKey** (or create a new policy with Listen permissions)
4. Copy the **Primary Connection String**

#### Step 2: Configure Environment Variables

```bash
# Service Bus - Connection String Authentication
SERVICEBUS_AUTH_METHOD=connection-string
SERVICEBUS_NAMESPACE=your-namespace-name.servicebus.windows.net
SERVICEBUS_CONNECTION_STRING="Endpoint=sb://your-namespace.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=your-key"

# Optional configuration
SERVICEBUS_SANITIZE_MESSAGES=false
SERVICEBUS_MAX_PEEK_MESSAGES=100
SERVICEBUS_MAX_SEARCH_MESSAGES=500
```

### Multi-Namespace Configuration

To work with multiple Service Bus namespaces:

```bash
SERVICEBUS_AUTH_METHOD=entra-id
SERVICEBUS_TENANT_ID=your-tenant-id
SERVICEBUS_CLIENT_ID=your-app-client-id
SERVICEBUS_CLIENT_SECRET=your-client-secret

# JSON array with multiple namespaces
SERVICEBUS_RESOURCES=[
  {
    "id": "prod",
    "name": "Production Service Bus",
    "namespace": "prod-namespace.servicebus.windows.net",
    "active": true,
    "description": "Production environment"
  },
  {
    "id": "staging",
    "name": "Staging Service Bus",
    "namespace": "staging-namespace.servicebus.windows.net",
    "active": true,
    "description": "Staging environment"
  },
  {
    "id": "dev",
    "name": "Development Service Bus",
    "namespace": "dev-namespace.servicebus.windows.net",
    "active": false,
    "description": "Development environment (inactive)"
  }
]
```

**Note**: Inactive namespaces (`"active": false`) are not queried but remain in configuration for quick re-activation.

### Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SERVICEBUS_AUTH_METHOD` | `entra-id` | Authentication method: `entra-id` or `connection-string` |
| `SERVICEBUS_TENANT_ID` | - | Azure tenant ID (Entra ID only) |
| `SERVICEBUS_CLIENT_ID` | - | App registration client ID (Entra ID only) |
| `SERVICEBUS_CLIENT_SECRET` | - | App registration client secret (Entra ID only) |
| `SERVICEBUS_NAMESPACE` | - | Service Bus namespace (single-namespace mode) |
| `SERVICEBUS_CONNECTION_STRING` | - | Connection string (connection-string auth only) |
| `SERVICEBUS_RESOURCES` | `[]` | JSON array of namespaces (multi-namespace mode) |
| `SERVICEBUS_SANITIZE_MESSAGES` | `false` | Redact sensitive message properties |
| `SERVICEBUS_MAX_PEEK_MESSAGES` | `100` | Maximum messages per peek operation |
| `SERVICEBUS_MAX_SEARCH_MESSAGES` | `500` | Maximum messages per search operation |
| `SERVICEBUS_PEEK_TIMEOUT` | `30000` | Peek operation timeout (ms) |
| `SERVICEBUS_RETRY_MAX_ATTEMPTS` | `3` | Maximum retry attempts on transient failures |
| `SERVICEBUS_RETRY_DELAY` | `1000` | Delay between retries (ms) |
| `SERVICEBUS_CACHE_QUEUE_LIST_TTL` | `300` | Queue list cache time-to-live (seconds) |

---

## Tools

### 1. servicebus-list-namespaces

List all configured Service Bus namespaces (active and inactive).

**Parameters**: None

**Returns**: Array of namespace configurations

**Example**:
```javascript
{
  "resources": [
    {
      "id": "prod",
      "name": "Production Service Bus",
      "namespace": "prod-namespace.servicebus.windows.net",
      "active": true,
      "description": "Production environment"
    }
  ]
}
```

### 2. servicebus-test-connection

Test connectivity to a Service Bus namespace and return connection information.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID

**Returns**: Connection test result with namespace info

**Example**:
```javascript
{
  "connected": true,
  "namespace": "prod-namespace.servicebus.windows.net",
  "authMethod": "entra-id",
  "message": "Successfully connected to Service Bus namespace"
}
```

### 3. servicebus-list-queues

List all queues in a Service Bus namespace with metadata and health status.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID

**Returns**: Array of queue information objects

**Example**:
```javascript
[
  {
    "name": "orders-queue",
    "activeMessageCount": 125,
    "deadLetterMessageCount": 3,
    "scheduledMessageCount": 0,
    "sizeInBytes": 524288,
    "maxSizeInMegabytes": 1024,
    "requiresSession": false,
    "enablePartitioning": true,
    "status": "Active"
  }
]
```

### 4. servicebus-peek-messages

Peek messages in a queue without removing them (read-only operation).

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID
- `queueName` (string, required): Queue name
- `maxMessages` (number, optional): Maximum messages to peek (default: 10, max: 100)
- `sessionId` (string, optional): Session ID for session-enabled queues

**Returns**: Array of message objects

**Example**:
```javascript
[
  {
    "messageId": "abc123",
    "correlationId": "order-12345",
    "sessionId": null,
    "body": "{\"orderId\":12345,\"status\":\"pending\"}",
    "contentType": "application/json",
    "enqueuedTimeUtc": "2025-11-09T10:30:00Z",
    "deliveryCount": 0,
    "applicationProperties": {
      "source": "order-service",
      "priority": "high"
    }
  }
]
```

### 5. servicebus-peek-deadletter

Peek messages in a dead letter queue (DLQ) without removing them.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID
- `queueName` (string, required): Queue name
- `maxMessages` (number, optional): Maximum messages to peek (default: 10, max: 100)
- `sessionId` (string, optional): Session ID for session-enabled queues

**Returns**: Array of dead letter message objects with failure reasons

**Example**:
```javascript
[
  {
    "messageId": "def456",
    "deadLetterReason": "MaxDeliveryCountExceeded",
    "deadLetterErrorDescription": "Message could not be processed after 10 attempts",
    "body": "{\"orderId\":67890,\"status\":\"failed\"}",
    "enqueuedTimeUtc": "2025-11-09T09:00:00Z",
    "deliveryCount": 10,
    "applicationProperties": {
      "source": "payment-service",
      "originalQueue": "orders-queue"
    }
  }
]
```

### 6. servicebus-get-queue-properties

Get detailed properties and configuration for a specific queue.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID
- `queueName` (string, required): Queue name

**Returns**: Queue properties object

**Example**:
```javascript
{
  "name": "orders-queue",
  "activeMessageCount": 125,
  "deadLetterMessageCount": 3,
  "scheduledMessageCount": 0,
  "sizeInBytes": 524288,
  "maxSizeInMegabytes": 1024,
  "lockDuration": "PT1M",
  "maxDeliveryCount": 10,
  "requiresDuplicateDetection": true,
  "requiresSession": false,
  "defaultMessageTimeToLive": "P14D",
  "enablePartitioning": true,
  "enableBatchedOperations": true,
  "status": "Active",
  "createdAt": "2025-01-15T08:00:00Z",
  "updatedAt": "2025-11-09T10:00:00Z"
}
```

### 7. servicebus-search-messages

Search messages in a queue by correlation ID, message ID, body content, or custom properties.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID
- `queueName` (string, required): Queue name
- `bodyContains` (string, optional): Search text in message body
- `correlationId` (string, optional): Filter by correlation ID
- `messageId` (string, optional): Filter by message ID
- `propertyKey` (string, optional): Custom property key to search
- `propertyValue` (string, optional): Custom property value to match
- `sessionId` (string, optional): Filter by session ID
- `maxMessages` (number, optional): Maximum messages to search (default: 100, max: 500)

**Returns**: Array of matching message objects

**Example**:
```javascript
// Search by correlation ID
{
  "resourceId": "prod",
  "queueName": "orders-queue",
  "correlationId": "order-12345",
  "maxMessages": 50
}

// Result
[
  {
    "messageId": "abc123",
    "correlationId": "order-12345",
    "body": "{\"orderId\":12345,\"status\":\"pending\"}",
    "enqueuedTimeUtc": "2025-11-09T10:30:00Z"
  }
]
```

### 8. servicebus-get-namespace-properties

Get namespace-level properties and configuration.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID

**Returns**: Namespace properties object

**Example**:
```javascript
{
  "name": "prod-namespace",
  "tier": "Premium",
  "messagingUnits": 1,
  "createdTime": "2025-01-01T00:00:00Z",
  "updatedTime": "2025-11-09T10:00:00Z"
}
```

---

## Prompts

### 1. servicebus-namespace-overview

Generate comprehensive overview of Service Bus namespace with all queues and health metrics.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID

**Returns**: Markdown-formatted namespace overview

**Output Includes**:
- Namespace information (tier, messaging units)
- Queue summary table with health indicators
- Active message counts
- Dead letter message counts
- Health status for each queue (✅ Healthy, ⚠️ Warning, 🔴 Critical)

### 2. servicebus-queue-health

Generate detailed health report for a specific queue with recommendations.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID
- `queueName` (string, required): Queue name

**Returns**: Markdown-formatted queue health report

**Output Includes**:
- Health status with icon and reason
- Queue metrics (message counts, size, capacity)
- Configuration settings (lock duration, max delivery count, sessions)
- Actionable recommendations based on health status
- Recent messages preview
- Dead letter messages preview

### 3. servicebus-deadletter-analysis

Analyze dead letter queue with pattern detection and actionable recommendations.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID
- `queueName` (string, required): Queue name
- `maxMessages` (number, optional): Maximum messages to analyze (default: 50)

**Returns**: Markdown-formatted dead letter analysis

**Output Includes**:
- Total dead letter message count
- Failure reason summary (grouped by dead letter reason)
- Top error patterns
- Message timeline
- Actionable recommendations (retry logic, error handling, monitoring)
- Sample messages with full details

### 4. servicebus-message-inspection

Inspect a single message in detail with cross-service troubleshooting recommendations.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID
- `queueName` (string, required): Queue name
- `messageId` (string, optional): Message ID to inspect (if not provided, inspects first message)
- `isDeadLetter` (boolean, optional): Inspect dead letter queue (default: false)

**Returns**: Markdown-formatted message inspection report

**Output Includes**:
- Message metadata (ID, correlation ID, session ID)
- Message body (formatted based on content type)
- Message format detection (JSON, XML, text, binary)
- Application properties
- System properties
- Dead letter details (if applicable)
- Cross-service correlation suggestions
- Troubleshooting recommendations

### 5. servicebus-cross-service-troubleshooting

Generate comprehensive troubleshooting report correlating Service Bus with Application Insights and Log Analytics.

**Parameters**:
- `resourceId` (string, required): Service Bus resource ID
- `queueName` (string, required): Queue name
- `correlationId` (string, optional): Correlation ID to trace across services
- `timespan` (string, optional): Time range (ISO 8601 duration, e.g., 'PT1H', 'P1D')

**Returns**: Markdown-formatted cross-service troubleshooting report

**Output Includes**:
- Queue health status
- Recent messages analysis
- Dead letter message patterns
- Correlated messages (if correlation ID provided)
- Application Insights exceptions (if configured and correlated)
- Log Analytics traces (if configured and correlated)
- Timeline analysis
- Root cause suggestions
- Actionable recommendations

---

## Usage Examples

### Example 1: List All Queues in a Namespace

```javascript
// Step 1: List configured namespaces
const namespaces = await serviceBusService.listNamespaces();
console.log(namespaces);

// Step 2: List queues in production namespace
const queues = await serviceBusService.listQueues('prod');
console.log(queues);

// Output:
// [
//   {
//     name: 'orders-queue',
//     activeMessageCount: 125,
//     deadLetterMessageCount: 3,
//     status: 'Active'
//   },
//   {
//     name: 'payments-queue',
//     activeMessageCount: 0,
//     deadLetterMessageCount: 0,
//     status: 'Active'
//   }
// ]
```

### Example 2: Investigate Dead Letter Queue

```javascript
// Step 1: Peek dead letter messages
const dlqMessages = await serviceBusService.peekDeadLetterMessages('prod', 'orders-queue', 50);

// Step 2: Analyze patterns
const analysis = analyzeDeadLetterMessages(dlqMessages);
console.log(analysis.insights);

// Output:
// [
//   "- 15 messages failed due to MaxDeliveryCountExceeded",
//   "- 8 messages failed due to MessageLockLostException",
//   "- 2 messages failed due to custom application error",
//   "- Most failures occurred between 09:00-10:00 UTC"
// ]

// Step 3: Get formatted analysis report (using prompt)
const report = await prompt('servicebus-deadletter-analysis', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  maxMessages: 50
});
```

### Example 3: Trace Message by Correlation ID

```javascript
// Step 1: Search for messages with correlation ID
const messages = await serviceBusService.searchMessages('prod', 'orders-queue', {
  correlationId: 'order-12345'
}, 100);

console.log(`Found ${messages.length} messages with correlation ID: order-12345`);

// Step 2: Get cross-service troubleshooting report
const report = await prompt('servicebus-cross-service-troubleshooting', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  correlationId: 'order-12345',
  timespan: 'PT1H'
});

// This correlates:
// - Service Bus messages
// - Application Insights exceptions
// - Log Analytics traces
```

### Example 4: Monitor Queue Health

```javascript
// Step 1: Get queue properties
const queueProps = await serviceBusService.getQueueProperties('prod', 'orders-queue');

// Step 2: Check health status
const health = getQueueHealthStatus(queueProps);
console.log(`Queue health: ${health.status} - ${health.reason}`);

// Step 3: Get detailed health report (using prompt)
const healthReport = await prompt('servicebus-queue-health', {
  resourceId: 'prod',
  queueName: 'orders-queue'
});

// Output includes:
// - Health status with recommendations
// - Message counts and size metrics
// - Configuration review
// - Recent messages preview
```

### Example 5: Inspect Specific Message

```javascript
// Step 1: Peek messages
const messages = await serviceBusService.peekMessages('prod', 'orders-queue', 10);

// Step 2: Inspect first message
const messageInspection = await prompt('servicebus-message-inspection', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  messageId: messages[0].messageId
});

// Output includes:
// - Message body (formatted)
// - Format detection (JSON/XML/text)
// - Application properties
// - System properties
// - Correlation suggestions
```

### Example 6: Session-Enabled Queue Inspection

```javascript
// Peek messages in a specific session
const sessionMessages = await serviceBusService.peekMessages('prod', 'session-queue', 20, 'session-123');

console.log(`Found ${sessionMessages.length} messages in session: session-123`);

// All messages will have the same sessionId
sessionMessages.forEach(msg => {
  console.log(`Message ${msg.messageId} - Session: ${msg.sessionId}`);
});
```

### Example 7: Search Messages by Custom Property

```javascript
// Search for high-priority messages
const highPriorityMessages = await serviceBusService.searchMessages('prod', 'orders-queue', {
  propertyKey: 'priority',
  propertyValue: 'high'
}, 100);

console.log(`Found ${highPriorityMessages.length} high-priority messages`);

// Search for messages from specific source
const paymentMessages = await serviceBusService.searchMessages('prod', 'orders-queue', {
  propertyKey: 'source',
  propertyValue: 'payment-service'
}, 100);
```

### Example 8: Namespace Overview Report

```javascript
// Generate comprehensive namespace report
const overview = await prompt('servicebus-namespace-overview', {
  resourceId: 'prod'
});

// Output includes:
// - Namespace tier (Standard/Premium)
// - All queues with health status
// - Message count summary
// - Dead letter queue summary
// - Health indicators (✅/⚠️/🔴)
```

---

## Best Practices

### Read-Only Operations

**✅ DO:**
- Use `peekMessages()` for message inspection
- Inspect dead letter queues regularly
- Monitor queue health metrics
- Use correlation IDs for tracing

**❌ DON'T:**
- Use `receiveMessages()` (not supported - read-only by design)
- Delete messages from queues
- Modify queue configuration
- Perform write operations

### Message Sanitization

**When to Enable (`SERVICEBUS_SANITIZE_MESSAGES=true`):**
- Working with production data containing PII
- Sharing message inspection results
- Compliance requirements (GDPR, HIPAA)
- External troubleshooting sessions

**When to Disable (Default: `false`):**
- Internal troubleshooting
- Development environments
- Need to see full message content
- No sensitive data in messages

**What Gets Sanitized:**
- `body`: Redacted if contains potential sensitive data
- Custom application properties matching patterns (email, phone, SSN, credit card)
- Connection strings in error messages
- Access tokens in properties

### Performance Optimization

**Queue List Caching:**
- Default TTL: 5 minutes (300 seconds)
- Reduces API calls to Service Bus
- Adjust `SERVICEBUS_CACHE_QUEUE_LIST_TTL` for your needs
- Cache is automatically invalidated on errors

**Message Peek Limits:**
- Default: 10 messages per peek
- Maximum: 100 messages per peek (configurable via `SERVICEBUS_MAX_PEEK_MESSAGES`)
- Use smaller limits for quick checks
- Use larger limits for dead letter analysis

**Search Limits:**
- Default maximum: 500 messages per search
- Adjust `SERVICEBUS_MAX_SEARCH_MESSAGES` for larger searches
- Search is client-side filtering (peeks multiple batches until limit reached)
- Use specific correlation IDs to reduce search scope

### Security Best Practices

**Authentication:**
- ✅ Use Entra ID authentication (token-based, automatic refresh)
- ✅ Use read-only roles (Azure Service Bus Data Receiver)
- ✅ Rotate client secrets regularly (12-month expiry)
- ❌ Avoid connection strings in production (use Entra ID instead)
- ❌ Don't use RootManageSharedAccessKey (too broad permissions)

**Network Security:**
- Configure Service Bus firewall rules
- Use private endpoints for VNet connectivity
- Restrict IP addresses in firewall
- Enable diagnostic logging

**Data Protection:**
- Enable message sanitization for sensitive data
- Don't log full message bodies in production
- Use correlation IDs instead of message bodies in logs
- Redact sensitive properties before sharing

### Monitoring and Alerting

**Regular Health Checks:**
- Monitor dead letter queue counts
- Set alerts for DLQ threshold (e.g., > 10 messages)
- Check active message counts for queue backlog
- Monitor queue size vs. max size

**Metrics to Track:**
- Active message count (backlog indicator)
- Dead letter message count (failure indicator)
- Queue size in bytes (capacity planning)
- Message throughput (processing rate)

**Troubleshooting Workflow:**
1. Check queue health using `servicebus-queue-health` prompt
2. If DLQ has messages, use `servicebus-deadletter-analysis` prompt
3. Inspect specific messages using `servicebus-message-inspection` prompt
4. Correlate with other services using `servicebus-cross-service-troubleshooting` prompt
5. Investigate application logs in Application Insights or Log Analytics

### Session-Enabled Queues

**When to Use Sessions:**
- FIFO ordering required per entity (e.g., per customer, per order)
- Message correlation by session ID
- Batch processing of related messages

**Session Handling:**
- Always provide `sessionId` parameter when peeking session-enabled queues
- Messages without `sessionId` will fail in session-enabled queues
- List available sessions first, then peek by session ID
- Use correlation ID or custom properties to identify sessions

### Dead Letter Queue Best Practices

**DLQ Investigation:**
1. Peek dead letter messages: `servicebus-peek-deadletter`
2. Analyze failure patterns: `servicebus-deadletter-analysis` prompt
3. Identify root causes: Check `deadLetterReason` and `deadLetterErrorDescription`
4. Fix application code or queue configuration
5. Re-submit messages manually if needed (via separate tool/process)

**Common Dead Letter Reasons:**
- `MaxDeliveryCountExceeded`: Message failed processing multiple times (fix consumer logic)
- `MessageLockLostException`: Processing took longer than lock duration (increase lock duration or optimize processing)
- `MessageSizeExceededLimit`: Message too large (split message or increase queue max size)
- Custom application errors: Check `deadLetterErrorDescription` for details

---

## Troubleshooting

### Authentication Errors

**Error: "Missing Service Bus configuration"**

**Cause**: Required environment variables not set

**Solution**:
```bash
# Entra ID authentication requires:
SERVICEBUS_AUTH_METHOD=entra-id
SERVICEBUS_TENANT_ID=your-tenant-id
SERVICEBUS_CLIENT_ID=your-client-id
SERVICEBUS_CLIENT_SECRET=your-secret
SERVICEBUS_NAMESPACE=your-namespace.servicebus.windows.net

# Connection string authentication requires:
SERVICEBUS_AUTH_METHOD=connection-string
SERVICEBUS_NAMESPACE=your-namespace.servicebus.windows.net
SERVICEBUS_CONNECTION_STRING="Endpoint=sb://..."
```

**Error: "Failed to acquire access token"**

**Cause**: Invalid Entra ID credentials or expired client secret

**Solution**:
1. Verify `SERVICEBUS_TENANT_ID`, `SERVICEBUS_CLIENT_ID`, `SERVICEBUS_CLIENT_SECRET` are correct
2. Check client secret hasn't expired (Azure Portal → App registrations → Certificates & secrets)
3. Create new client secret if expired
4. Verify app registration hasn't been deleted

**Error: "Unauthorized access. No sufficient permission"**

**Cause**: Service principal doesn't have required permissions

**Solution**:
```bash
# Grant Azure Service Bus Data Receiver role
az role assignment create \
  --role "Azure Service Bus Data Receiver" \
  --assignee <app-client-id> \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.ServiceBus/namespaces/<namespace-name>
```

### Connection Errors

**Error: "ServiceBusError: The messaging entity 'queue-name' could not be found"**

**Cause**: Queue doesn't exist or name is incorrect

**Solution**:
1. List all queues: Use `servicebus-list-queues` tool
2. Verify queue name spelling (case-sensitive)
3. Check queue exists in correct namespace

**Error: "ServiceCommunicationProblem: The remote name could not be resolved"**

**Cause**: Network connectivity issue or incorrect namespace

**Solution**:
1. Verify namespace name: `your-namespace.servicebus.windows.net`
2. Check firewall rules in Service Bus namespace (Azure Portal → Networking)
3. Verify IP address is allowed
4. Check DNS resolution: `nslookup your-namespace.servicebus.windows.net`
5. Test connectivity: `telnet your-namespace.servicebus.windows.net 5671`

**Error: "OperationTimeoutException: The operation did not complete within the allotted timeout"**

**Cause**: Peek operation timeout

**Solution**:
1. Increase timeout: `SERVICEBUS_PEEK_TIMEOUT=60000` (60 seconds)
2. Reduce message count: Use smaller `maxMessages` parameter
3. Check network latency to Service Bus namespace
4. Check if queue is partitioned (partitioned queues can be slower)

### Message Inspection Issues

**Error: "No messages found in queue"**

**Cause**: Queue is empty or all messages are locked/scheduled

**Solution**:
1. Check queue properties: Use `servicebus-get-queue-properties` tool
2. Verify `activeMessageCount > 0`
3. Check `scheduledMessageCount` (scheduled messages not visible until scheduled time)
4. Check if messages are locked by other consumers

**Error: "Session ID required for session-enabled queue"**

**Cause**: Trying to peek session-enabled queue without `sessionId` parameter

**Solution**:
```javascript
// Get available sessions first (separate operation, not yet implemented)
// Then peek with specific session ID
const messages = await serviceBusService.peekMessages('prod', 'session-queue', 10, 'session-123');
```

**Error: "Message body is binary and cannot be displayed"**

**Cause**: Message body is binary (not text/JSON/XML)

**Solution**:
- Check `contentType` property: Should be `application/octet-stream` for binary
- Use message format detection: `detectMessageFormat(message)` returns `'binary'`
- Binary messages cannot be inspected as text (design limitation)

### Performance Issues

**Error: "Peek operation taking too long"**

**Cause**: Large number of messages in queue or network latency

**Solution**:
1. Reduce `maxMessages` parameter (use 10 instead of 100)
2. Increase timeout: `SERVICEBUS_PEEK_TIMEOUT=60000`
3. Use partitioned queues for better performance
4. Check Service Bus tier (Premium tier has better performance)

**Error: "Search operation times out"**

**Cause**: Searching through large number of messages

**Solution**:
1. Use more specific search criteria (correlation ID instead of body search)
2. Reduce `maxSearchMessages` limit
3. Search in smaller batches
4. Use correlation ID or message ID for exact match (faster)

### Dead Letter Queue Analysis

**Error: "Dead letter queue is empty but messages are missing"**

**Cause**: Messages might be:
- Locked by other consumers
- Scheduled for future delivery
- Deleted by consumer
- Moved to different queue

**Solution**:
1. Check queue properties for scheduled messages
2. Verify consumer isn't auto-completing messages
3. Check Application Insights for message processing logs
4. Review Service Bus diagnostic logs

**No insights in dead letter analysis**

**Cause**: All dead letter messages have the same reason

**Solution**:
- This is normal if failure is consistent (e.g., all MaxDeliveryCountExceeded)
- Inspect individual messages using `servicebus-message-inspection`
- Check application logs for processing errors
- Review dead letter error descriptions

### Cross-Service Correlation

**Error: "No correlated Application Insights data found"**

**Cause**: Application Insights not configured or correlation ID not used in application

**Solution**:
1. Verify Application Insights integration is configured
2. Ensure application logs correlation ID: `correlationId` in telemetry
3. Use same correlation ID format across services
4. Check timespan parameter (messages might be outside timespan)

**Error: "Correlation ID not found in messages"**

**Cause**: Messages don't have correlation ID property

**Solution**:
1. Verify sender application sets `correlationId` property
2. Check `applicationProperties` for custom correlation property
3. Use `sessionId` as alternative correlation mechanism
4. Search by message ID instead: `messageId` is always present

---

## Advanced Topics

### Queue Naming Conventions

**Best Practices:**
- Use lowercase with hyphens: `orders-queue`, `payment-processing`
- Prefix by environment: `prod-orders-queue`, `dev-orders-queue`
- Use descriptive names: `customer-notifications` not `queue1`
- Avoid special characters (use only alphanumeric and hyphens)

### Message Properties Best Practices

**System Properties** (always present):
- `messageId`: Unique identifier (auto-generated or custom)
- `correlationId`: Correlation identifier (set by sender)
- `sessionId`: Session identifier (session-enabled queues only)
- `contentType`: Message content type (e.g., `application/json`)
- `enqueuedTimeUtc`: When message was enqueued

**Application Properties** (custom, set by sender):
- `source`: Originating service/system
- `priority`: Message priority (custom logic)
- `entityId`: Related entity ID (customer ID, order ID)
- `version`: Message schema version

**Example Message Structure:**
```javascript
{
  // System properties
  "messageId": "abc-123",
  "correlationId": "order-12345",
  "sessionId": null,
  "contentType": "application/json",
  "enqueuedTimeUtc": "2025-11-09T10:30:00Z",

  // Body
  "body": "{\"orderId\":12345,\"customerId\":67890,\"total\":99.99}",

  // Application properties (custom)
  "applicationProperties": {
    "source": "order-service",
    "priority": "high",
    "entityId": "order-12345",
    "version": "1.0"
  }
}
```

### Partition Keys

**What are Partition Keys?**
- Property that Service Bus uses to route messages to partitions
- Enables parallel processing while maintaining order within partition
- Messages with same partition key go to same partition (ordered)

**When to Use:**
- Partitioned queues (better throughput)
- Need ordering for subset of messages (e.g., per customer)
- High-throughput scenarios

**How to Set:**
```javascript
// Sender sets partition key (not visible in peeked message)
// Message sent with partitionKey: 'customer-123'

// All messages with partitionKey 'customer-123' go to same partition
// Messages are ordered within partition
```

### Time to Live (TTL)

**Message TTL:**
- `defaultMessageTimeToLive`: Queue-level setting (applies to all messages)
- Messages expire after TTL and move to DLQ
- Default: 14 days (`P14D`)

**Queue TTL:**
- Entire queue can have TTL
- Inactive queues auto-delete after TTL

**Dead Letter Message TTL:**
- DLQ messages also have TTL
- Don't forget to process DLQ messages before they expire

---

## Integration with Other Services

### Application Insights Integration

Correlate Service Bus messages with Application Insights telemetry:

```javascript
// Step 1: Find correlation ID from Service Bus message
const messages = await serviceBusService.peekMessages('prod', 'orders-queue', 10);
const correlationId = messages[0].correlationId;

// Step 2: Query Application Insights for exceptions with same correlation ID
const exceptions = await appInsightsService.getRecentExceptions('prod-api', 'PT1H');
const correlated = exceptions.filter(e => e.customDimensions?.correlationId === correlationId);

// Step 3: Get cross-service troubleshooting report (automated)
const report = await prompt('servicebus-cross-service-troubleshooting', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  correlationId: correlationId,
  timespan: 'PT1H'
});
```

### Log Analytics Integration

Correlate Service Bus with Azure Functions processing logs:

```javascript
// Step 1: Find correlation ID from dead letter message
const dlqMessages = await serviceBusService.peekDeadLetterMessages('prod', 'orders-queue', 10);
const correlationId = dlqMessages[0].correlationId;

// Step 2: Query Log Analytics for function errors
const functionErrors = await logAnalyticsService.getFunctionErrors('prod-workspace', 'order-processor', 'PT1H');
const correlated = functionErrors.filter(e => e.Message.includes(correlationId));

// Step 3: Cross-reference and generate report
const report = await prompt('servicebus-cross-service-troubleshooting', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  correlationId: correlationId,
  timespan: 'PT1H'
});
```

---

## Common Use Cases

### 1. Monitor Queue Health

**Scenario**: Regular health check of all queues

```javascript
// Get namespace overview
const overview = await prompt('servicebus-namespace-overview', {
  resourceId: 'prod'
});

// Alerts you to:
// - Queues with high active message count (backlog)
// - Queues with dead letter messages (failures)
// - Queues approaching size limit (capacity)
```

### 2. Investigate Message Processing Failures

**Scenario**: Messages are failing and going to DLQ

```javascript
// Step 1: Analyze DLQ patterns
const dlqAnalysis = await prompt('servicebus-deadletter-analysis', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  maxMessages: 100
});

// Step 2: Inspect specific failed message
const messageDetails = await prompt('servicebus-message-inspection', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  messageId: 'abc-123',
  isDeadLetter: true
});

// Step 3: Cross-reference with application logs
const crossService = await prompt('servicebus-cross-service-troubleshooting', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  correlationId: 'order-12345'
});
```

### 3. Trace Message Flow Across Services

**Scenario**: Track a specific order through the system

```javascript
// Search for all messages related to order-12345
const messages = await serviceBusService.searchMessages('prod', 'orders-queue', {
  correlationId: 'order-12345'
}, 100);

console.log(`Found ${messages.length} messages for order-12345`);

// Get cross-service correlation
const report = await prompt('servicebus-cross-service-troubleshooting', {
  resourceId: 'prod',
  queueName: 'orders-queue',
  correlationId: 'order-12345',
  timespan: 'P1D'
});
```

### 4. Verify Message Processing Pipeline

**Scenario**: Ensure messages are flowing through pipeline correctly

```javascript
// Step 1: Check source queue
const sourceMessages = await serviceBusService.peekMessages('prod', 'orders-queue', 20);
console.log(`Source queue has ${sourceMessages.length} messages`);

// Step 2: Check processing queue
const processingMessages = await serviceBusService.peekMessages('prod', 'order-processing', 20);
console.log(`Processing queue has ${processingMessages.length} messages`);

// Step 3: Check DLQs
const sourceDLQ = await serviceBusService.peekDeadLetterMessages('prod', 'orders-queue', 10);
const processingDLQ = await serviceBusService.peekDeadLetterMessages('prod', 'order-processing', 10);

console.log(`Source DLQ: ${sourceDLQ.length} messages`);
console.log(`Processing DLQ: ${processingDLQ.length} messages`);
```

---

## Limits and Quotas

### Service Bus Limits

| Tier | Max Queue Size | Max Message Size | Lock Duration | Max Delivery Count |
|------|----------------|------------------|---------------|-------------------|
| Standard | 1 GB - 5 GB | 256 KB | 5 minutes | 10 |
| Premium | 1 GB - 80 GB | 1 MB | 5 minutes | 10 |

### Tool Limits

| Tool | Default Limit | Max Limit | Configurable |
|------|---------------|-----------|--------------|
| `servicebus-peek-messages` | 10 messages | 100 messages | Yes (`SERVICEBUS_MAX_PEEK_MESSAGES`) |
| `servicebus-peek-deadletter` | 10 messages | 100 messages | Yes (`SERVICEBUS_MAX_PEEK_MESSAGES`) |
| `servicebus-search-messages` | 100 messages | 500 messages | Yes (`SERVICEBUS_MAX_SEARCH_MESSAGES`) |
| Peek timeout | 30 seconds | No limit | Yes (`SERVICEBUS_PEEK_TIMEOUT`) |
| Queue list cache TTL | 300 seconds | No limit | Yes (`SERVICEBUS_CACHE_QUEUE_LIST_TTL`) |

---

## FAQ

**Q: Can I delete messages from queues?**

A: No, this integration is **read-only by design**. It uses `peekMessages()` which doesn't remove messages. This ensures safe production troubleshooting without affecting message processing.

**Q: Can I resubmit dead letter messages?**

A: No, this integration doesn't support write operations. You would need to:
1. Inspect DLQ messages using this tool
2. Fix the root cause (application code or queue configuration)
3. Use Azure Portal or Azure CLI to resubmit messages manually

**Q: How do I find messages by correlation ID?**

A: Use the `servicebus-search-messages` tool with `correlationId` parameter. This searches through active messages (not DLQ).

**Q: Can I see scheduled messages?**

A: No, scheduled messages are not visible via `peekMessages()`. Check queue properties (`scheduledMessageCount`) to see how many scheduled messages exist.

**Q: How do I handle session-enabled queues?**

A: Provide the `sessionId` parameter when peeking messages. All messages in a session must have the same `sessionId`.

**Q: What if message body is binary?**

A: Binary messages cannot be displayed as text. The tool will indicate format as `'binary'` and show message metadata only.

**Q: How long does queue list cache last?**

A: Default: 5 minutes (300 seconds). Configurable via `SERVICEBUS_CACHE_QUEUE_LIST_TTL`. Cache is cleared automatically on errors.

**Q: Can I use this with Service Bus Topics?**

A: Not yet. Current implementation supports **queues only**. Topic support may be added in future versions.

**Q: What's the difference between Entra ID and connection string authentication?**

A:
- **Entra ID** (recommended): Token-based, automatic refresh, RBAC permissions, better security
- **Connection string**: Simpler setup, stored secret, broader permissions, less secure

**Q: How do I sanitize sensitive message data?**

A: Set `SERVICEBUS_SANITIZE_MESSAGES=true`. This redacts:
- Message bodies containing potential PII
- Application properties matching sensitive patterns (email, phone, credit card)
- Connection strings in error messages

**Q: Can I correlate Service Bus with Application Insights?**

A: Yes! Use the `servicebus-cross-service-troubleshooting` prompt with a `correlationId`. This automatically queries Application Insights and Log Analytics for correlated telemetry.

---

## Additional Resources

- [Azure Service Bus Documentation](https://learn.microsoft.com/en-us/azure/service-bus-messaging/)
- [Service Bus Quotas and Limits](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-quotas)
- [Dead Letter Queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues)
- [Sessions and Message Ordering](https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sessions)
- [Azure RBAC Roles for Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-managed-service-identity)

---

**Last Updated**: 2025-01-15
**Version**: 1.0.0
