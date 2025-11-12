#!/usr/bin/env node

/**
 * Implements PowerPlatform package split into 3 security-focused packages
 * - powerplatform: 38 read-only tools (production-safe)
 * - powerplatform-customization: 40 schema change tools (dev/config)
 * - powerplatform-data: 3 CRUD tools (operational)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Tool categorization from split-powerplatform.sh
const READ_ONLY_TOOLS = [
  'get-entity-metadata', 'get-entity-attributes', 'get-entity-attribute',
  'get-entity-relationships', 'get-global-option-set', 'get-record',
  'query-records', 'get-plugin-assemblies', 'get-plugin-assembly-complete',
  'get-entity-plugin-pipeline', 'get-plugin-trace-logs', 'get-flows',
  'get-flow-definition', 'get-flow-runs', 'get-workflows',
  'get-workflow-definition', 'get-business-rules', 'get-business-rule',
  'get-apps', 'get-app', 'get-app-components', 'get-app-sitemap',
  'get-publishers', 'get-solutions', 'get-forms', 'get-views',
  'get-view-fetchxml', 'get-web-resource', 'get-web-resources',
  'get-webresource-dependencies', 'get-relationship-details',
  'get-entity-customization-info', 'validate-schema-name',
  'check-delete-eligibility', 'check-entity-dependencies', 'check-dependencies',
  'preview-unpublished-changes', 'validate-solution-integrity'
];

const CUSTOMIZATION_TOOLS = [
  'create-entity', 'update-entity', 'delete-entity', 'publish-entity',
  'create-attribute', 'update-attribute', 'delete-attribute',
  'create-one-to-many-relationship', 'create-many-to-many-relationship',
  'update-relationship', 'delete-relationship', 'create-global-optionset-attribute',
  'update-global-optionset', 'add-optionset-value', 'update-optionset-value',
  'delete-optionset-value', 'reorder-optionset-values', 'create-form',
  'update-form', 'delete-form', 'activate-form', 'deactivate-form',
  'create-view', 'update-view', 'delete-view', 'set-default-view',
  'create-web-resource', 'update-web-resource', 'delete-web-resource',
  'create-publisher', 'create-solution', 'add-solution-component',
  'remove-solution-component', 'export-solution', 'import-solution',
  'publish-customizations', 'update-entity-icon', 'add-entities-to-app',
  'validate-app', 'publish-app'
];

const DATA_CRUD_TOOLS = [
  'create-record', 'update-record', 'delete-record'
];

console.log('=========================================');
console.log('PowerPlatform Package Split Implementation');
console.log('=========================================');
console.log(`Read-Only Tools: ${READ_ONLY_TOOLS.length}`);
console.log(`Customization Tools: ${CUSTOMIZATION_TOOLS.length}`);
console.log(`Data CRUD Tools: ${DATA_CRUD_TOOLS.length}`);
console.log(`Total: ${READ_ONLY_TOOLS.length + CUSTOMIZATION_TOOLS.length + DATA_CRUD_TOOLS.length} tools\n`);

// Load extracted registrations
const extractedFile = path.join(rootDir, 'tmp', 'extracted-all-registrations.json');
if (!fs.existsSync(extractedFile)) {
  console.error('❌ Error: extracted-all-registrations.json not found');
  process.exit(1);
}

const extracted = JSON.parse(fs.readFileSync(extractedFile, 'utf8'));
const allPowerPlatformTools = extracted.tools.powerplatform || [];
const allPowerPlatformPrompts = extracted.prompts.powerplatform || [];

console.log(`Loaded ${allPowerPlatformTools.length} PowerPlatform tools from extraction\n`);

// Filter tools by category
function filterTools(toolNames) {
  return allPowerPlatformTools.filter(tool => toolNames.includes(tool.name));
}

const readOnlyTools = filterTools(READ_ONLY_TOOLS);
const customizationTools = filterTools(CUSTOMIZATION_TOOLS);
const dataCrudTools = filterTools(DATA_CRUD_TOOLS);

console.log(`Filtered tools:`);
console.log(`  Read-Only: ${readOnlyTools.length}/${READ_ONLY_TOOLS.length}`);
console.log(`  Customization: ${customizationTools.length}/${CUSTOMIZATION_TOOLS.length}`);
console.log(`  Data CRUD: ${dataCrudTools.length}/${DATA_CRUD_TOOLS.length}\n`);

// Verify all tools were found
const missing = [];
[...READ_ONLY_TOOLS, ...CUSTOMIZATION_TOOLS, ...DATA_CRUD_TOOLS].forEach(name => {
  if (!allPowerPlatformTools.find(t => t.name === name)) {
    missing.push(name);
  }
});

if (missing.length > 0) {
  console.warn(`⚠️  Warning: ${missing.length} tools not found in extraction:`);
  missing.forEach(name => console.warn(`    - ${name}`));
  console.log('');
}

// Package templates
const packageTemplates = {
  'powerplatform-customization': {
    description: 'MCP server for PowerPlatform schema/metadata customizations (dev/config environments)',
    envVar: 'POWERPLATFORM_ENABLE_CUSTOMIZATION',
    tools: customizationTools,
    prompts: [] // Prompts stay in base package
  },
  'powerplatform-data': {
    description: 'MCP server for PowerPlatform data CRUD operations (operational use)',
    envVar: null, // Uses individual ENABLE_CREATE/UPDATE/DELETE flags
    tools: dataCrudTools,
    prompts: []
  }
};

// Create package structures
Object.entries(packageTemplates).forEach(([packageName, config]) => {
  const packageDir = path.join(rootDir, 'packages', packageName);
  const srcDir = path.join(packageDir, 'src');
  const utilsDir = path.join(srcDir, 'utils');

  console.log(`Creating package: ${packageName}`);

  // Create directories
  [packageDir, srcDir, utilsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  ✅ Created ${path.relative(rootDir, dir)}`);
    }
  });

  // Copy service files from base powerplatform package
  const basePowerPlatformSrc = path.join(rootDir, 'packages', 'powerplatform', 'src');
  const serviceToCopy = 'PowerPlatformService.ts';
  const sourceFile = path.join(basePowerPlatformSrc, serviceToCopy);
  const destFile = path.join(srcDir, serviceToCopy);

  if (fs.existsSync(sourceFile)) {
    fs.copyFileSync(sourceFile, destFile);
    console.log(`  ✅ Copied ${serviceToCopy}`);
  }

  // Copy utils directory
  const baseUtilsDir = path.join(basePowerPlatformSrc, 'utils');
  if (fs.existsSync(baseUtilsDir)) {
    fs.readdirSync(baseUtilsDir).forEach(file => {
      const src = path.join(baseUtilsDir, file);
      const dest = path.join(utilsDir, file);
      fs.copyFileSync(src, dest);
    });
    console.log(`  ✅ Copied utils directory`);
  }

  // Generate package.json
  const packageJson = {
    name: `@mcp-consultant-tools/${packageName}`,
    version: '1.0.0',
    description: config.description,
    type: 'module',
    main: './build/index.js',
    types: './build/index.d.ts',
    bin: { [`mcp-${packageName}`]: './build/index.js' },
    exports: { '.': { import: './build/index.js', types: './build/index.d.ts' } },
    files: ['build', 'README.md'],
    scripts: {
      build: 'tsc',
      clean: 'rm -rf build *.tsbuildinfo',
      prepublishOnly: 'npm run build'
    },
    keywords: ['mcp', 'model-context-protocol', 'powerplatform', 'dynamics', 'dataverse', packageName.split('-')[1]],
    author: 'Michal Sobieraj',
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/klemensms/mcp-consultant-tools.git',
      directory: `packages/${packageName}`
    },
    engines: { node: '>=16.0.0' },
    dependencies: {
      '@azure/msal-node': '^3.3.0',
      '@mcp-consultant-tools/core': '^1.0.0',
      '@modelcontextprotocol/sdk': '^1.0.4',
      'axios': '^1.8.3',
      'zod': '^3.24.1'
    },
    devDependencies: {
      '@types/node': '^22.10.5',
      'typescript': '^5.8.2'
    }
  };

  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n'
  );
  console.log(`  ✅ Generated package.json`);

  // Generate tsconfig.json
  const tsconfig = {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      outDir: './build',
      rootDir: './src'
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'build'],
    references: [{ path: '../core' }]
  };

  fs.writeFileSync(
    path.join(packageDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2) + '\n'
  );
  console.log(`  ✅ Generated tsconfig.json`);

  // Generate index.ts
  const indexContent = generateIndexFile(packageName, config);
  fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent);
  console.log(`  ✅ Generated index.ts with ${config.tools.length} tools\n`);
});

// Generate index.ts content
function generateIndexFile(packageName, config) {
  const registerFunctionName = `register${packageName.split('-').map(p =>
    p.charAt(0).toUpperCase() + p.slice(1)
  ).join('')}Tools`;

  const envCheck = config.envVar ? `
  // Check if customization is enabled
  const customizationEnabled = process.env.${config.envVar} === 'true';
  if (!customizationEnabled) {
    throw new Error(
      '${packageName} tools are disabled. Set ${config.envVar}=true to enable.'
    );
  }
` : '';

  const checkFunctions = packageName === 'powerplatform-data' ? `
// Permission check functions
function checkCreateEnabled() {
  if (process.env.POWERPLATFORM_ENABLE_CREATE !== 'true') {
    throw new Error('Create operations are disabled. Set POWERPLATFORM_ENABLE_CREATE=true to enable.');
  }
}

function checkUpdateEnabled() {
  if (process.env.POWERPLATFORM_ENABLE_UPDATE !== 'true') {
    throw new Error('Update operations are disabled. Set POWERPLATFORM_ENABLE_UPDATE=true to enable.');
  }
}

function checkDeleteEnabled() {
  if (process.env.POWERPLATFORM_ENABLE_DELETE !== 'true') {
    throw new Error('Delete operations are disabled. Set POWERPLATFORM_ENABLE_DELETE=true to enable.');
  }
}
` : '';

  const toolRegistrations = config.tools.map(tool => tool.code).join('\n\n');

  return `#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PowerPlatformService, PowerPlatformConfig } from './PowerPlatformService.js';

/**
 * Register ${packageName} tools with an MCP server
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function ${registerFunctionName}(server: Server, service?: PowerPlatformService) {
${envCheck}
  let ppService: PowerPlatformService | null = service || null;

  function getPowerPlatformService(): PowerPlatformService {
    if (!ppService) {
      const requiredVars = [
        'POWERPLATFORM_URL',
        'POWERPLATFORM_CLIENT_ID',
        'POWERPLATFORM_CLIENT_SECRET',
        'POWERPLATFORM_TENANT_ID'
      ];

      const missing = requiredVars.filter(v => !process.env[v]);
      if (missing.length > 0) {
        throw new Error(\`Missing required PowerPlatform configuration: \${missing.join(', ')}\`);
      }

      const config: PowerPlatformConfig = {
        organizationUrl: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET!,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      ppService = new PowerPlatformService(config);
    }
    return ppService;
  }
${checkFunctions}
  // Tool registrations
${toolRegistrations}

  console.error(\`✅ ${packageName} tools registered (\${${config.tools.length}} tools)\`);
}

// CLI entry point (standalone execution)
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const server = new Server(
    { name: 'mcp-${packageName}', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {} } }
  );

  ${registerFunctionName}(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start ${packageName} MCP server:', error);
    process.exit(1);
  });

  console.error('${packageName} MCP server running');
}
`;
}

// Update base powerplatform package
console.log('Updating base powerplatform package...');
const basePowerPlatformIndex = path.join(rootDir, 'packages', 'powerplatform', 'src', 'index.ts');
const currentContent = fs.readFileSync(basePowerPlatformIndex, 'utf8');

// Extract only read-only tool registrations
const readOnlyRegistrations = readOnlyTools.map(tool => tool.code).join('\n\n');
const readOnlyPromptRegistrations = allPowerPlatformPrompts.map(prompt => prompt.code).join('\n\n');

// Generate new index.ts for base package (read-only only)
const newBaseIndex = `#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PowerPlatformService, PowerPlatformConfig } from './PowerPlatformService.js';
import { ENTITY_OVERVIEW, ATTRIBUTE_DETAILS, QUERY_TEMPLATE, RELATIONSHIP_MAP } from './utils/prompt-templates.js';

const POWERPLATFORM_DEFAULT_SOLUTION = process.env.POWERPLATFORM_DEFAULT_SOLUTION || "";

/**
 * Register PowerPlatform read-only tools with an MCP server
 * @param server - MCP server instance
 * @param service - Optional pre-initialized PowerPlatformService (for testing)
 */
export function registerPowerPlatformTools(server: Server, service?: PowerPlatformService) {
  let ppService: PowerPlatformService | null = service || null;

  function getPowerPlatformService(): PowerPlatformService {
    if (!ppService) {
      const requiredVars = [
        'POWERPLATFORM_URL',
        'POWERPLATFORM_CLIENT_ID',
        'POWERPLATFORM_CLIENT_SECRET',
        'POWERPLATFORM_TENANT_ID'
      ];

      const missing = requiredVars.filter(v => !process.env[v]);
      if (missing.length > 0) {
        throw new Error(\`Missing required PowerPlatform configuration: \${missing.join(', ')}\`);
      }

      const config: PowerPlatformConfig = {
        organizationUrl: process.env.POWERPLATFORM_URL!,
        clientId: process.env.POWERPLATFORM_CLIENT_ID!,
        clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET!,
        tenantId: process.env.POWERPLATFORM_TENANT_ID!,
      };

      ppService = new PowerPlatformService(config);
    }
    return ppService;
  }

  // Read-only tool registrations (${readOnlyTools.length} tools)
${readOnlyRegistrations}

  // Prompt registrations (${allPowerPlatformPrompts.length} prompts)
${readOnlyPromptRegistrations}

  console.error(\`✅ PowerPlatform read-only tools registered (\${${readOnlyTools.length}} tools, \${${allPowerPlatformPrompts.length}} prompts)\`);
}

// CLI entry point (standalone execution)
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const server = new Server(
    { name: 'mcp-powerplatform', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {} } }
  );

  registerPowerPlatformTools(server);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((error: Error) => {
    console.error('Failed to start PowerPlatform MCP server:', error);
    process.exit(1);
  });

  console.error('PowerPlatform MCP server running (read-only)');
}
`;

fs.writeFileSync(basePowerPlatformIndex, newBaseIndex);
console.log(`✅ Updated base powerplatform/src/index.ts (${readOnlyTools.length} read-only tools + ${allPowerPlatformPrompts.length} prompts)\n`);

// Update base package.json description
const basePkgJsonPath = path.join(rootDir, 'packages', 'powerplatform', 'package.json');
const basePkgJson = JSON.parse(fs.readFileSync(basePkgJsonPath, 'utf8'));
basePkgJson.description = 'MCP server for Microsoft PowerPlatform/Dataverse - read-only access (production-safe)';
fs.writeFileSync(basePkgJsonPath, JSON.stringify(basePkgJson, null, 2) + '\n');
console.log('✅ Updated base powerplatform/package.json description\n');

// Update main src/index.ts to register all 3 packages
console.log('Updating main src/index.ts...');
const mainIndexPath = path.join(rootDir, 'src', 'index.ts');
const mainIndexContent = fs.readFileSync(mainIndexPath, 'utf8');

// Add imports for new packages
const newImports = `import { registerPowerplatformCustomizationTools } from "@mcp-consultant-tools/powerplatform-customization";
import { registerPowerplatformDataTools } from "@mcp-consultant-tools/powerplatform-data";`;

// Add registration calls
const newRegistrations = `
// PowerPlatform Customization (optional - schema changes)
try {
  registerPowerplatformCustomizationTools(server);
  console.error("✅ PowerPlatform Customization tools registered");
} catch (error) {
  console.error("⚠️  PowerPlatform Customization registration skipped:", (error as Error).message);
}

// PowerPlatform Data (optional - CRUD operations)
try {
  registerPowerplatformDataTools(server);
  console.error("✅ PowerPlatform Data tools registered");
} catch (error) {
  console.error("⚠️  PowerPlatform Data registration skipped:", (error as Error).message);
}`;

// Insert after existing PowerPlatform import
const updatedMainIndex = mainIndexContent
  .replace(
    /import \{ registerPowerPlatformTools \} from "@mcp-consultant-tools\/powerplatform";/,
    `import { registerPowerPlatformTools } from "@mcp-consultant-tools/powerplatform";\n${newImports}`
  )
  .replace(
    /console\.error\("✅ PowerPlatform tools registered"\);/,
    `console.error("✅ PowerPlatform tools registered (read-only)");\n} catch (error) {\n  console.error("⚠️  PowerPlatform registration skipped:", (error as Error).message);\n}\n${newRegistrations}`
  );

fs.writeFileSync(mainIndexPath, updatedMainIndex);
console.log('✅ Updated main src/index.ts with new package registrations\n');

console.log('=========================================');
console.log('✅ PowerPlatform Split Complete!');
console.log('=========================================');
console.log('Created packages:');
console.log('  - @mcp-consultant-tools/powerplatform (38 read-only tools + 12 prompts)');
console.log('  - @mcp-consultant-tools/powerplatform-customization (40 schema tools)');
console.log('  - @mcp-consultant-tools/powerplatform-data (3 CRUD tools)');
console.log('');
console.log('Next steps:');
console.log('  1. npm install (update workspace links)');
console.log('  2. npm run build (build all packages)');
console.log('  3. Test standalone execution');
console.log('');
