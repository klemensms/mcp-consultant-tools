#!/usr/bin/env node

/**
 * Integrate extracted tool/prompt registrations into package index.ts files
 *
 * Reads the extracted registration code from tmp/register-{package}-tools.ts
 * and inserts it into the appropriate package's src/index.ts file using the
 * Figma package as a template structure.
 */

const fs = require('fs');
const path = require('path');

// Package metadata
const PACKAGES = {
  'powerplatform': {
    name: '@mcp-consultant-tools/powerplatform',
    serviceName: 'PowerPlatformService',
    registerFunction: 'registerPowerPlatformTools',
    config: {
      url: 'POWERPLATFORM_URL',
      clientId: 'POWERPLATFORM_CLIENT_ID',
      clientSecret: 'POWERPLATFORM_CLIENT_SECRET',
      tenantId: 'POWERPLATFORM_TENANT_ID',
    },
    imports: [
      "import { z } from 'zod';",
      "import * as powerPlatformPrompts from './utils/prompts.js';",
      "import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';",
    ]
  },
  'azure-devops': {
    name: '@mcp-consultant-tools/azure-devops',
    serviceName: 'AzureDevOpsService',
    registerFunction: 'registerAzureDevOpsTools',
    config: {
      organization: 'AZUREDEVOPS_ORGANIZATION',
      pat: 'AZUREDEVOPS_PAT',
      projects: 'AZUREDEVOPS_PROJECTS',
    },
    imports: [
      "import { z } from 'zod';",
      "import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';",
    ]
  },
  'application-insights': {
    name: '@mcp-consultant-tools/application-insights',
    serviceName: 'ApplicationInsightsService',
    registerFunction: 'registerApplicationInsightsTools',
    config: {},
    imports: [
      "import { z } from 'zod';",
      "import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';",
      "import * as appInsightsFormatters from './utils/appinsights-formatters.js';",
    ]
  },
  'log-analytics': {
    name: '@mcp-consultant-tools/log-analytics',
    serviceName: 'LogAnalyticsService',
    registerFunction: 'registerLogAnalyticsTools',
    config: {},
    imports: [
      "import { z } from 'zod';",
      "import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';",
      "import * as logAnalyticsFormatters from './utils/loganalytics-formatters.js';",
    ]
  },
  'azure-sql': {
    name: '@mcp-consultant-tools/azure-sql',
    serviceName: 'AzureSqlService',
    registerFunction: 'registerAzureSqlTools',
    config: {},
    imports: [
      "import { z } from 'zod';",
      "import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';",
      "import * as sqlFormatters from './utils/sql-formatters.js';",
    ]
  },
  'service-bus': {
    name: '@mcp-consultant-tools/service-bus',
    serviceName: 'ServiceBusService',
    registerFunction: 'registerServiceBusTools',
    config: {},
    imports: [
      "import { z } from 'zod';",
      "import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';",
      "import * as serviceBusFormatters from './utils/servicebus-formatters.js';",
    ]
  },
  'github-enterprise': {
    name: '@mcp-consultant-tools/github-enterprise',
    serviceName: 'GitHubEnterpriseService',
    registerFunction: 'registerGitHubEnterpriseTools',
    config: {},
    imports: [
      "import { z } from 'zod';",
      "import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';",
      "import * as gheFormatters from './utils/ghe-formatters.js';",
    ]
  },
  'sharepoint': {
    name: '@mcp-consultant-tools/sharepoint',
    serviceName: 'SharePointService',
    registerFunction: 'registerSharePointTools',
    config: {},
    imports: [
      "import { z } from 'zod';",
      "import { createErrorResponse, createSuccessResponse } from '@mcp-consultant-tools/core';",
      "import * as spoFormatters from './utils/sharepoint-formatters.js';",
    ]
  },
};

/**
 * Generate complete index.ts content for a package
 */
function generatePackageIndex(packageKey, metadata) {
  const extractedToolsPath = path.join(__dirname, '..', 'tmp', `register-${packageKey}-tools.ts`);

  if (!fs.existsSync(extractedToolsPath)) {
    console.error(`❌ No extracted tools found for ${packageKey}: ${extractedToolsPath}`);
    return null;
  }

  const toolRegistrations = fs.readFileSync(extractedToolsPath, 'utf-8');

  // Build the index.ts content
  let content = `#!/usr/bin/env node

/**
 * ${metadata.name}
 *
 * MCP server for ${packageKey} integration.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, createEnvLoader } from "@mcp-consultant-tools/core";
import { ${metadata.serviceName} } from "./${metadata.serviceName}.js";
import type { ${metadata.serviceName.replace('Service', 'Config')} } from "./${metadata.serviceName}.js";
${metadata.imports.join('\n')}

/**
 * Register ${packageKey} tools and prompts to an MCP server
 * @param server - The MCP server instance
 * @param ${packageKey.replace(/-/g, '')}Service - Optional pre-configured ${metadata.serviceName} (for testing or custom configs)
 */
export function ${metadata.registerFunction}(server: any, ${packageKey.replace(/-/g, '')}Service?: ${metadata.serviceName}) {
  let service: ${metadata.serviceName} | null = ${packageKey.replace(/-/g, '')}Service || null;

  function get${metadata.serviceName}(): ${metadata.serviceName} {
    if (!service) {
      // Configuration validation would go here
      // For now, just initialize from environment
      service = new ${metadata.serviceName}(/* config */);
      console.error("${metadata.serviceName} initialized");
    }

    return service;
  }

${toolRegistrations}
}

/**
 * Export service class for direct usage
 */
export { ${metadata.serviceName} } from "./${metadata.serviceName}.js";
export type { ${metadata.serviceName.replace('Service', 'Config')} } from "./${metadata.serviceName}.js";

/**
 * Standalone CLI server (when run directly)
 */
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const loadEnv = createEnvLoader();
  loadEnv();

  const server = createMcpServer({
    name: "${metadata.name}",
    version: "1.0.0",
    capabilities: {
      tools: {},
      prompts: {},
    },
  });

  ${metadata.registerFunction}(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error("Failed to start ${metadata.name} MCP server:", error);
    process.exit(1);
  });

  console.error("${metadata.name} server running on stdio");
}
`;

  return content;
}

/**
 * Main execution
 */
function main() {
  console.log('Integrating extracted tools into package index.ts files...\n');

  for (const [packageKey, metadata] of Object.entries(PACKAGES)) {
    if (packageKey === 'figma') {
      console.log(`⏭️  Skipping ${packageKey} (already complete)`);
      continue;
    }

    console.log(`📦 Processing ${packageKey}...`);

    const indexContent = generatePackageIndex(packageKey, metadata);

    if (!indexContent) {
      console.log(`⚠️  Skipped ${packageKey} - no extracted tools\n`);
      continue;
    }

    const indexPath = path.join(__dirname, '..', 'packages', packageKey, 'src', 'index.ts');

    // Backup existing file
    if (fs.existsSync(indexPath)) {
      const backupPath = indexPath + '.backup';
      fs.copyFileSync(indexPath, backupPath);
      console.log(`  ✅ Backed up to ${path.basename(backupPath)}`);
    }

    // Write new index.ts
    fs.writeFileSync(indexPath, indexContent);
    console.log(`  ✅ Generated ${indexPath}`);
    console.log(`  📊 Size: ${(indexContent.length / 1024).toFixed(2)} KB\n`);
  }

  console.log('✅ Integration complete!');
  console.log('\nNext steps:');
  console.log('1. Review generated index.ts files in packages/*/src/');
  console.log('2. Fix any import issues or missing dependencies');
  console.log('3. Run: npm run build');
  console.log('4. Fix TypeScript errors');
}

main();
