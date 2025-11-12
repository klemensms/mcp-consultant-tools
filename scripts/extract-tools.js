#!/usr/bin/env node

/**
 * Extract tool and prompt registrations from monolithic src/index.ts
 * and generate registration functions for each package.
 *
 * This script parses server.tool() and server.prompt() calls and
 * extracts complete registration blocks including all parameters.
 */

const fs = require('fs');
const path = require('path');

// Tool/prompt name to package mapping
const PACKAGE_MAPPING = {
  // PowerPlatform (65 tools, 12 prompts)
  'powerplatform': [
    // Entity & Metadata Tools
    'get-entity-metadata', 'get-entity-attributes', 'get-entity-attribute',
    'get-entity-relationships', 'get-global-option-set', 'get-record', 'query-records',
    // Entity Customization Tools
    'update-entity-icon',
    // Plugin Tools
    'get-plugin-assemblies', 'get-plugin-assembly-complete', 'get-entity-plugin-pipeline',
    'get-plugin-trace-logs',
    // Workflow & Flow Tools
    'get-flows', 'get-flow-definition', 'get-flow-runs',
    'get-workflows', 'get-workflow-definition',
    // Business Rules Tools
    'get-business-rules', 'get-business-rule',
    // Data CRUD Tools
    'create-record', 'update-record', 'delete-record',
    // Model-Driven App Tools
    'get-model-driven-apps', 'get-app-modules', 'get-app-site-map',
    'get-app-form-descriptor', 'get-solution', 'get-solutions',
    'publish-customizations',
    // Prompts
    'entity-overview', 'attribute-details', 'query-template', 'relationship-map',
    'plugin-deployment-report', 'entity-plugin-pipeline-report',
    'flows-report', 'workflows-report', 'business-rules-report'
  ],

  // Azure DevOps (18 tools, 6 prompts)
  'azure-devops': [
    'get-wikis', 'search-wiki-pages', 'get-wiki-page', 'create-wiki-page',
    'update-wiki-page', 'azuredevops-str-replace-wiki-page',
    'get-work-item', 'query-work-items', 'get-work-item-comments',
    'add-work-item-comment', 'update-work-item', 'create-work-item',
    'delete-work-item',
    // Prompts
    'wiki-search-results', 'wiki-page-content',
    'work-item-summary', 'work-items-query-report'
  ],

  // Figma (2 tools, 0 prompts) - already complete
  'figma': [
    'get-figma-data', 'download-figma-images'
  ],

  // Application Insights (10 tools, 5 prompts)
  'application-insights': [
    'appinsights-list-resources', 'appinsights-get-metadata', 'appinsights-execute-query',
    'appinsights-get-exceptions', 'appinsights-get-slow-requests',
    'appinsights-get-operation-performance', 'appinsights-get-failed-dependencies',
    'appinsights-get-traces', 'appinsights-get-availability', 'appinsights-get-custom-events',
    // Prompts
    'appinsights-exception-summary', 'appinsights-performance-report',
    'appinsights-dependency-health', 'appinsights-availability-report',
    'appinsights-troubleshooting-guide'
  ],

  // Log Analytics (10 tools, 5 prompts)
  'log-analytics': [
    'loganalytics-list-workspaces', 'loganalytics-get-metadata', 'loganalytics-execute-query',
    'loganalytics-get-function-logs', 'loganalytics-get-function-errors',
    'loganalytics-get-function-stats', 'loganalytics-get-function-invocations',
    'loganalytics-get-recent-events', 'loganalytics-search-logs',
    // Prompts
    'loganalytics-workspace-summary', 'loganalytics-function-troubleshooting',
    'loganalytics-function-performance-report', 'loganalytics-logs-report'
  ],

  // Azure SQL (11 tools, 3 prompts)
  'azure-sql': [
    'sql-list-servers', 'sql-list-databases', 'sql-test-connection',
    'sql-list-tables', 'sql-list-views', 'sql-list-stored-procedures',
    'sql-list-triggers', 'sql-list-functions', 'sql-get-table-schema',
    'sql-get-object-definition', 'sql-execute-query',
    // Prompts
    'sql-database-overview', 'sql-table-details', 'sql-query-results'
  ],

  // Service Bus (8 tools, 5 prompts)
  'service-bus': [
    'servicebus-list-namespaces', 'servicebus-test-connection', 'servicebus-list-queues',
    'servicebus-peek-messages', 'servicebus-peek-deadletter',
    'servicebus-get-queue-properties', 'servicebus-search-messages',
    'servicebus-get-namespace-properties',
    // Prompts
    'servicebus-namespace-overview', 'servicebus-queue-health',
    'servicebus-deadletter-analysis', 'servicebus-message-inspection',
    'servicebus-cross-service-troubleshooting'
  ],

  // SharePoint (15 tools, 5 prompts)
  'sharepoint': [
    'sharepoint-list-sites', 'sharepoint-test-connection', 'sharepoint-get-site-info',
    'sharepoint-list-document-libraries', 'sharepoint-list-files',
    'sharepoint-get-file-metadata', 'sharepoint-download-file',
    'sharepoint-validate-document-location', 'sharepoint-get-document-location',
    'sharepoint-verify-migration', 'sharepoint-clear-cache',
    // Prompts
    'sharepoint-site-overview', 'sharepoint-library-report',
    'sharepoint-validation-report', 'sharepoint-migration-checklist'
  ],

  // GitHub Enterprise (22 tools, 5 prompts)
  'github-enterprise': [
    'ghe-list-repos', 'ghe-clear-cache', 'ghe-list-branches',
    'ghe-get-default-branch', 'ghe-get-branch-details', 'ghe-compare-branches',
    'ghe-create-branch', 'ghe-get-file', 'ghe-list-files',
    'ghe-get-directory-structure', 'ghe-get-file-history',
    'ghe-update-file', 'ghe-create-file', 'ghe-get-commits',
    'ghe-get-commit-details', 'ghe-get-commit-diff', 'ghe-search-commits',
    'ghe-list-pull-requests', 'ghe-get-pull-request', 'ghe-get-pr-files',
    'ghe-search-code', 'ghe-search-repos',
    // Prompts
    'ghe-repo-overview', 'ghe-code-search-report',
    'ghe-branch-comparison-report', 'ghe-troubleshooting-guide',
    'ghe-deployment-report'
  ],
};

// Build reverse mapping: tool/prompt name -> package name
const toolToPackage = {};
for (const [pkg, tools] of Object.entries(PACKAGE_MAPPING)) {
  for (const tool of tools) {
    toolToPackage[tool] = pkg;
  }
}

/**
 * Extract complete server.tool() or server.prompt() block
 * Handles nested parentheses and returns the full registration code
 */
function extractRegistrationBlock(content, startIndex) {
  let depth = 0;
  let inString = false;
  let stringChar = null;
  let escaped = false;
  let i = startIndex;

  // Find the opening parenthesis
  while (i < content.length && content[i] !== '(') {
    i++;
  }

  const blockStart = content.lastIndexOf('\n', startIndex) + 1;

  // Now track parentheses depth
  for (; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

    // Handle escape sequences
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    // Handle strings
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
      continue;
    }

    if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
      stringChar = null;
      continue;
    }

    // Track parentheses depth (only outside strings)
    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') depth--;

      // Found the closing parenthesis
      if (depth === 0) {
        // Find the semicolon or end of statement
        let endIndex = i + 1;
        while (endIndex < content.length && content[endIndex] !== ';') {
          endIndex++;
        }
        endIndex++; // include the semicolon

        return {
          code: content.substring(blockStart, endIndex),
          endIndex
        };
      }
    }
  }

  return null;
}

/**
 * Parse src/index.ts and extract all tool/prompt registrations
 */
function extractRegistrations(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const registrations = {
    tools: {},
    prompts: {},
  };

  // Find all server.tool() calls
  let index = 0;
  while ((index = content.indexOf('server.tool(', index)) !== -1) {
    const block = extractRegistrationBlock(content, index);
    if (block) {
      // Extract tool name (first string parameter)
      const match = block.code.match(/server\.tool\(\s*["']([^"']+)["']/);
      if (match) {
        const toolName = match[1];
        const packageName = toolToPackage[toolName];

        if (packageName) {
          if (!registrations.tools[packageName]) {
            registrations.tools[packageName] = [];
          }
          registrations.tools[packageName].push({
            name: toolName,
            code: block.code.trim(),
          });
        } else {
          console.error(`Warning: Tool '${toolName}' not mapped to any package`);
        }
      }

      index = block.endIndex;
    } else {
      index++;
    }
  }

  // Find all server.prompt() calls
  index = 0;
  while ((index = content.indexOf('server.prompt(', index)) !== -1) {
    const block = extractRegistrationBlock(content, index);
    if (block) {
      // Extract prompt name (first string parameter)
      const match = block.code.match(/server\.prompt\(\s*["']([^"']+)["']/);
      if (match) {
        const promptName = match[1];
        const packageName = toolToPackage[promptName];

        if (packageName) {
          if (!registrations.prompts[packageName]) {
            registrations.prompts[packageName] = [];
          }
          registrations.prompts[packageName].push({
            name: promptName,
            code: block.code.trim(),
          });
        } else {
          console.error(`Warning: Prompt '${promptName}' not mapped to any package`);
        }
      }

      index = block.endIndex;
    } else {
      index++;
    }
  }

  return registrations;
}

/**
 * Generate registration function code for a package
 */
function generateRegistrationFunction(packageName, registrations) {
  const tools = registrations.tools[packageName] || [];
  const prompts = registrations.prompts[packageName] || [];

  let code = '';

  // Add prompts first
  if (prompts.length > 0) {
    code += '  // ========================================\n';
    code += '  // PROMPTS\n';
    code += '  // ========================================\n\n';

    for (const prompt of prompts) {
      code += '  ' + prompt.code.replace(/\n/g, '\n  ') + '\n\n';
    }
  }

  // Add tools
  if (tools.length > 0) {
    code += '  // ========================================\n';
    code += '  // TOOLS\n';
    code += '  // ========================================\n\n';

    for (const tool of tools) {
      code += '  ' + tool.code.replace(/\n/g, '\n  ') + '\n\n';
    }
  }

  code += `  console.error("${packageName} tools registered: ${tools.length} tools, ${prompts.length} prompts");\n`;

  return code;
}

/**
 * Main execution
 */
function main() {
  const srcIndexPath = path.join(__dirname, '..', 'src', 'index.ts');

  console.log('Extracting tool and prompt registrations from src/index.ts...');
  const registrations = extractRegistrations(srcIndexPath);

  // Display summary
  console.log('\n=== Extraction Summary ===\n');
  for (const [pkg, items] of Object.entries(PACKAGE_MAPPING)) {
    const tools = registrations.tools[pkg] || [];
    const prompts = registrations.prompts[pkg] || [];
    console.log(`${pkg}: ${tools.length} tools, ${prompts.length} prompts`);
  }

  // Save extraction results
  const outputDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'extracted-registrations.json');
  fs.writeFileSync(outputPath, JSON.stringify(registrations, null, 2));
  console.log(`\nExtracted registrations saved to: ${outputPath}`);

  // Generate registration functions for each package
  for (const [pkg, items] of Object.entries(PACKAGE_MAPPING)) {
    if (pkg === 'figma') {
      console.log(`Skipping ${pkg} (already complete)`);
      continue;
    }

    const code = generateRegistrationFunction(pkg, registrations);
    const funcPath = path.join(outputDir, `register-${pkg}-tools.ts`);
    fs.writeFileSync(funcPath, code);
    console.log(`Generated: ${funcPath}`);
  }

  console.log('\n✅ Extraction complete!');
  console.log('\nNext steps:');
  console.log('1. Review extracted code in tmp/ directory');
  console.log('2. Insert registration code into each package index.ts');
  console.log('3. Run npm run build to verify');
}

main();
