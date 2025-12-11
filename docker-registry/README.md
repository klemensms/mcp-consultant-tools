# Docker MCP Registry Entries

This directory contains the server entries to be submitted to the [Docker MCP Registry](https://github.com/docker/mcp-registry).

## Submission Process

1. Fork [docker/mcp-registry](https://github.com/docker/mcp-registry)
2. Copy the contents of `servers/` to your fork's `servers/` directory
3. Update the commit SHA in `server.yaml` to the current release commit
4. Run validation: `task validate -- --name mcp-consultant-tools-powerplatform`
5. Run build test: `task build -- --tools mcp-consultant-tools-powerplatform`
6. Test in Docker Desktop MCP Toolkit
7. Submit PR to docker/mcp-registry

## Directory Structure

```
docker-registry/
├── README.md                                    # This file
└── servers/
    └── mcp-consultant-tools-powerplatform/      # PowerPlatform (read-only)
        ├── server.yaml                          # Server configuration
        └── readme.md                            # Server documentation
```

## Future Entries

After PowerPlatform pilot is accepted, additional entries will be added:

- `mcp-consultant-tools-powerplatform-customization`
- `mcp-consultant-tools-powerplatform-data`
- `mcp-consultant-tools-azure-devops`
- `mcp-consultant-tools-figma`
- `mcp-consultant-tools-application-insights`
- `mcp-consultant-tools-log-analytics`
- `mcp-consultant-tools-azure-sql`
- `mcp-consultant-tools-service-bus`
- `mcp-consultant-tools-sharepoint`
- `mcp-consultant-tools-github-enterprise`
- `mcp-consultant-tools-azure-b2c`
- `mcp-consultant-tools-rest-api`

## Testing Locally

Before submitting, test the Docker image locally:

```bash
# Build from repo root
docker build -f packages/powerplatform/Dockerfile -t mcp/mcp-consultant-tools-powerplatform .

# Run with credentials
docker run -it --rm \
  -e POWERPLATFORM_URL=https://yourorg.crm.dynamics.com \
  -e POWERPLATFORM_TENANT_ID=your-tenant-id \
  -e POWERPLATFORM_CLIENT_ID=your-client-id \
  -e POWERPLATFORM_CLIENT_SECRET=your-client-secret \
  mcp/mcp-consultant-tools-powerplatform
```

The server should start and await MCP JSON-RPC commands via stdio.
