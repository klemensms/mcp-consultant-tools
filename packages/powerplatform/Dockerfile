# Dockerfile for @mcp-consultant-tools/powerplatform
# Enables distribution via Docker MCP Registry
#
# Build from repository root:
#   docker build -f packages/powerplatform/Dockerfile -t mcp/mcp-consultant-tools-powerplatform .
#
# Run with credentials:
#   docker run -it --rm \
#     -e POWERPLATFORM_URL=https://yourorg.crm.dynamics.com \
#     -e POWERPLATFORM_TENANT_ID=your-tenant-id \
#     -e POWERPLATFORM_CLIENT_ID=your-client-id \
#     -e POWERPLATFORM_CLIENT_SECRET=your-client-secret \
#     mcp/mcp-consultant-tools-powerplatform

# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configuration
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./

# Copy package.json files for workspace resolution
COPY packages/core/package.json ./packages/core/
COPY packages/powerplatform/package.json ./packages/powerplatform/

# Install all dependencies (workspace-aware)
RUN npm ci --workspace=@mcp-consultant-tools/core \
           --workspace=@mcp-consultant-tools/powerplatform

# Copy source files
COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/powerplatform/src ./packages/powerplatform/src
COPY packages/powerplatform/tsconfig.json ./packages/powerplatform/

# Build packages (core first due to reference)
RUN npm run build --workspace=@mcp-consultant-tools/core && \
    npm run build --workspace=@mcp-consultant-tools/powerplatform

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Copy root package files for module resolution
COPY package.json package-lock.json ./

# Copy built packages and their package.json
COPY --from=builder /app/packages/core/build ./packages/core/build
COPY --from=builder /app/packages/core/package.json ./packages/core/

COPY --from=builder /app/packages/powerplatform/build ./packages/powerplatform/build
COPY --from=builder /app/packages/powerplatform/package.json ./packages/powerplatform/

# Install production dependencies only
RUN npm ci --workspace=@mcp-consultant-tools/core \
           --workspace=@mcp-consultant-tools/powerplatform \
           --omit=dev

# Set working directory to powerplatform package
WORKDIR /app/packages/powerplatform

# MCP servers communicate via stdio
# The server reads environment variables for configuration
ENTRYPOINT ["node", "build/index.js"]
