# @mcp-consultant-tools/rest-api

MCP server for REST API testing with OAuth2 client credentials support. Enables AI assistants to test HTTP endpoints with automatic JWT token generation.

## Features

- **HTTP Methods**: GET, POST, PUT, DELETE, PATCH
- **OAuth2 Client Credentials**: Automatic JWT token acquisition and caching
- **Multiple Auth Methods**: Bearer token, Basic auth, API key
- **Response Management**: Size limiting, truncation, timing
- **SSL Control**: Enable/disable certificate verification
- **Custom Headers**: Configure via environment variables
- **Batch Requests**: Execute multiple requests sequentially

## Quick Start

### Installation

```bash
# As standalone
npx @mcp-consultant-tools/rest-api

# Or install globally
npm install -g @mcp-consultant-tools/rest-api
```

### MCP Client Configuration

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["@mcp-consultant-tools/rest-api"],
      "env": {
        "REST_BASE_URL": "https://your-api.azurewebsites.net/api",
        "OAUTH2_TOKEN_URL": "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token",
        "OAUTH2_CLIENT_ID": "your-client-id",
        "OAUTH2_CLIENT_SECRET": "your-client-secret",
        "OAUTH2_SCOPE": "api://your-app-id/.default"
      }
    }
  }
}
```

## Tools (4)

| Tool | Description |
|------|-------------|
| `rest-request` | Execute HTTP requests with automatic authentication |
| `rest-config` | Get current service configuration summary |
| `rest-refresh-token` | Force refresh OAuth2 token cache |
| `rest-batch-request` | Execute multiple requests sequentially |

## Prompts (2)

| Prompt | Description |
|--------|-------------|
| `rest-api-guide` | Comprehensive usage guide |
| `rest-api-troubleshoot` | Troubleshooting common issues |

## Authentication Methods

### OAuth2 Client Credentials (Recommended)

Best for Azure/Entra ID protected APIs like Data API Builder (DAB):

```bash
OAUTH2_TOKEN_URL=https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
OAUTH2_CLIENT_ID=your-client-id
OAUTH2_CLIENT_SECRET=your-secret
OAUTH2_SCOPE=api://your-api/.default
```

### Static Bearer Token

```bash
AUTH_BEARER=your-pre-acquired-token
```

### Basic Authentication

```bash
AUTH_BASIC_USERNAME=user
AUTH_BASIC_PASSWORD=pass
```

### API Key

```bash
AUTH_APIKEY_HEADER_NAME=X-Api-Key
AUTH_APIKEY_VALUE=your-key
```

## Configuration Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REST_BASE_URL` | Yes | - | Base URL for API requests |
| `REST_RESPONSE_SIZE_LIMIT` | No | 10000 | Max response size in bytes |
| `REST_ENABLE_SSL_VERIFY` | No | true | SSL certificate verification |
| `REST_TIMEOUT` | No | 30000 | Request timeout in ms |
| `HEADER_*` | No | - | Custom headers (e.g., `HEADER_Accept`) |

## Example Usage

### Simple GET Request

```
Use rest-request with method GET and endpoint /users
```

### POST with Body

```
Use rest-request with method POST, endpoint /orders, and body {"item": "widget", "qty": 5}
```

### Batch Operations

```
Use rest-batch-request with an array of requests to test a complete workflow
```

## License

MIT
