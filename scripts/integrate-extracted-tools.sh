#!/bin/bash

# Script to integrate extracted tool registrations into package index files
# This creates complete index.ts files with proper imports and service initialization

set -e

PACKAGES_DIR="packages"
TMP_DIR="tmp"

# Function to get service initialization code from original index
get_service_init() {
    local service_name=$1
    local config_var=$2

    # Extract service initialization from src/index.ts.old
    # This will be customized per package
    echo "// Service initialization for $service_name"
}

# Integration for PowerPlatform
echo "Integrating PowerPlatform tools..."
cat > "$PACKAGES_DIR/powerplatform/src/index.ts" << 'EOF'
#!/usr/bin/env node

/**
 * @mcp-consultant-tools/powerplatform
 *
 * MCP server for PowerPlatform integration.
 * Provides 81 tools and 10 prompts for Power Platform/Dataverse operations.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { PowerPlatformService } from "./PowerPlatformService.js";
import type { PowerPlatformConfig } from "./PowerPlatformService.js";
import { z } from 'zod';
import * as powerPlatformPrompts from './utils/prompt-templates.js';

/**
 * Register PowerPlatform tools and prompts to an MCP server
 * @param server - The MCP server instance
 * @param powerplatformService - Optional pre-configured PowerPlatformService (for testing or custom configs)
 */
export function registerPowerPlatformTools(server: any, powerplatformService?: PowerPlatformService) {
  let service: PowerPlatformService | null = powerplatformService || null;

  function getPowerPlatformService(): PowerPlatformService {
    if (!service) {
      const missingConfig: string[] = [];
      if (!process.env.POWERPLATFORM_URL) missingConfig.push("POWERPLATFORM_URL");
      if (!process.env.POWERPLATFORM_CLIENT_ID) missingConfig.push("POWERPLATFORM_CLIENT_ID");
      if (!process.env.POWERPLATFORM_CLIENT_SECRET) missingConfig.push("POWERPLATFORM_CLIENT_SECRET");
      if (!process.env.POWERPLATFORM_TENANT_ID) missingConfig.push("POWERPLATFORM_TENANT_ID");

      if (missingConfig.length > 0) {
        throw new Error(
          `Missing required PowerPlatform configuration: ${missingConfig.join(", ")}. ` +
          `Set environment variables for URL, client ID, client secret, and tenant ID.`
        );
      }

      const config: PowerPlatformConfig = {
        url: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET!,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      service = new PowerPlatformService(config);
      console.error("PowerPlatform service initialized");
    }

    return service;
  }

  // Permission check helpers
  function checkCreateEnabled() {
    if (process.env.POWERPLATFORM_ENABLE_CREATE !== "true") {
      throw new Error(
        "Create operations are disabled. Set POWERPLATFORM_ENABLE_CREATE=true to enable."
      );
    }
  }

  function checkUpdateEnabled() {
    if (process.env.POWERPLATFORM_ENABLE_UPDATE !== "true") {
      throw new Error(
        "Update operations are disabled. Set POWERPLATFORM_ENABLE_UPDATE=true to enable."
      );
    }
  }

  function checkDeleteEnabled() {
    if (process.env.POWERPLATFORM_ENABLE_DELETE !== "true") {
      throw new Error(
        "Delete operations are disabled. Set POWERPLATFORM_ENABLE_DELETE=true to enable."
      );
    }
  }

  function checkCustomizationEnabled() {
    if (process.env.POWERPLATFORM_ENABLE_CUSTOMIZATION !== "true") {
      throw new Error(
        "Customization operations are disabled. Set POWERPLATFORM_ENABLE_CUSTOMIZATION=true to enable."
      );
    }
  }

EOF

# Append the extracted registrations
cat "$TMP_DIR/register-powerplatform-tools-complete.ts" >> "$PACKAGES_DIR/powerplatform/src/index.ts"

# Close the function and add CLI entry point
cat >> "$PACKAGES_DIR/powerplatform/src/index.ts" << 'EOF'

  console.error("PowerPlatform tools registered: 81 tools, 10 prompts");
}

// CLI entry point (standalone execution)
if (import.meta.url === `file://${process.argv[1]}`) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: "mcp-powerplatform",
    version: "1.0.0",
    capabilities: { tools: {}, prompts: {} }
  });

  registerPowerPlatformTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start PowerPlatform MCP server:", error);
    process.exit(1);
  });

  console.error("PowerPlatform MCP server running");
}
EOF

echo "✅ PowerPlatform integration complete"

echo "Integration script completed!"
EOF

chmod +x /home/user/mcp-consultant-tools/scripts/integrate-extracted-tools.sh
