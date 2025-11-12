#!/usr/bin/env node

/**
 * Complete tool extraction - analyzes src/index.ts.old to find ALL tools/prompts
 * and automatically maps them to packages based on naming conventions
 */

const fs = require('fs');
const path = require('path');

// Automatically map tools/prompts to packages based on naming patterns
function mapToolToPackage(name) {
  // PowerPlatform tools - comprehensive patterns
  if (name.match(/^(get-entity|get-attribute|query-records|get-record|get-global-option|create-record|update-record|delete-record)/)) return 'powerplatform';
  if (name.match(/^(get-plugin|get-flow|get-workflow|get-business-rule)/)) return 'powerplatform';
  if (name.match(/^(get-apps|get-app|add-entities-to-app|validate-app|publish-app)/)) return 'powerplatform';
  if (name.match(/^(create-entity|update-entity|delete-entity|create-attribute|update-attribute|delete-attribute)/)) return 'powerplatform';
  if (name.match(/^(create-one-to-many|create-many-to-many|delete-relationship|update-relationship|get-relationship)/)) return 'powerplatform';
  if (name.match(/^(update-global-optionset|add-optionset|update-optionset|delete-optionset|reorder-optionset|create-global-optionset)/)) return 'powerplatform';
  if (name.match(/^(create-form|update-form|delete-form|activate-form|deactivate-form|get-forms)/)) return 'powerplatform';
  if (name.match(/^(create-view|update-view|delete-view|get-views|set-default-view|get-view-fetchxml)/)) return 'powerplatform';
  if (name.match(/^(create-web-resource|update-web-resource|delete-web-resource|get-web-resource|get-webresource-dependencies)/)) return 'powerplatform';
  if (name.match(/^(create-publisher|get-publishers|create-solution|add-solution-component|remove-solution-component)/)) return 'powerplatform';
  if (name.match(/^(export-solution|import-solution|publish-|check-dependencies|get-model-driven-apps|get-solution)/)) return 'powerplatform';
  if (name.match(/^(validate-schema-name|check-delete-eligibility|check-entity-dependencies|get-entity-customization|update-entity-icon)/)) return 'powerplatform';
  if (name.match(/^(preview-unpublished|validate-solution)/)) return 'powerplatform';

  // PowerPlatform prompts
  if (name.match(/^(entity-overview|attribute-details|query-template|relationship-map)/)) return 'powerplatform';
  if (name.match(/^(plugin-deployment-report|entity-plugin-pipeline-report)/)) return 'powerplatform';
  if (name.match(/^(flows-report|workflows-report|business-rules-report)/)) return 'powerplatform';
  if (name.match(/^app-overview$/)) return 'powerplatform';

  // Azure DevOps tools
  if (name.match(/^(get-wikis|search-wiki|get-wiki-page|create-wiki|update-wiki|azuredevops-str-replace)/)) return 'azure-devops';
  if (name.match(/^(get-work-item|query-work-items|add-work-item|update-work-item|create-work-item|delete-work-item)/)) return 'azure-devops';

  // Azure DevOps prompts
  if (name.match(/^(wiki-search-results|wiki-page-content|work-item-summary|work-items-query-report)/)) return 'azure-devops';

  // Figma tools
  if (name.match(/^(get-figma|download-figma)/)) return 'figma';

  // Application Insights tools and prompts
  if (name.match(/^appinsights-/)) return 'application-insights';

  // Log Analytics tools and prompts
  if (name.match(/^loganalytics-/)) return 'log-analytics';

  // Azure SQL tools and prompts
  if (name.match(/^sql-/)) return 'azure-sql';

  // Service Bus tools and prompts
  if (name.match(/^servicebus-/)) return 'service-bus';

  // SharePoint tools and prompts
  if (name.match(/^spo-/)) return 'sharepoint';

  // GitHub Enterprise tools and prompts
  if (name.match(/^ghe-/)) return 'github-enterprise';

  return null;
}

/**
 * Extract complete server.tool() or server.prompt() block
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

  // Track parentheses depth
  for (; i < content.length; i++) {
    const char = content[i];

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

    if (inString && char === stringChar) {
      inString = false;
      stringChar = null;
      continue;
    }

    // Track parentheses (only outside strings)
    if (!inString) {
      if (char === '(') depth++;
      if (char === ')') depth--;

      if (depth === 0) {
        let endIndex = i + 1;
        while (endIndex < content.length && content[endIndex] !== ';') {
          endIndex++;
        }
        endIndex++;

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
 * Extract all tool/prompt registrations
 */
function extractAllRegistrations(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const registrations = {
    tools: {},
    prompts: {},
  };

  // Extract all tools
  let index = 0;
  let toolCount = 0;
  while ((index = content.indexOf('server.tool(', index)) !== -1) {
    const block = extractRegistrationBlock(content, index);
    if (block) {
      const match = block.code.match(/server\.tool\(\s*["']([^"']+)["']/);
      if (match) {
        const toolName = match[1];
        const packageName = mapToolToPackage(toolName);

        if (packageName) {
          if (!registrations.tools[packageName]) {
            registrations.tools[packageName] = [];
          }
          registrations.tools[packageName].push({
            name: toolName,
            code: block.code.trim(),
          });
          toolCount++;
        } else {
          console.error(`⚠️  Unmapped tool: ${toolName}`);
        }
      }

      index = block.endIndex;
    } else {
      index++;
    }
  }

  // Extract all prompts
  index = 0;
  let promptCount = 0;
  while ((index = content.indexOf('server.prompt(', index)) !== -1) {
    const block = extractRegistrationBlock(content, index);
    if (block) {
      const match = block.code.match(/server\.prompt\(\s*["']([^"']+)["']/);
      if (match) {
        const promptName = match[1];
        const packageName = mapToolToPackage(promptName);

        if (packageName) {
          if (!registrations.prompts[packageName]) {
            registrations.prompts[packageName] = [];
          }
          registrations.prompts[packageName].push({
            name: promptName,
            code: block.code.trim(),
          });
          promptCount++;
        } else {
          console.error(`⚠️  Unmapped prompt: ${promptName}`);
        }
      }

      index = block.endIndex;
    } else {
      index++;
    }
  }

  console.error(`\nTotal extracted: ${toolCount} tools, ${promptCount} prompts`);

  return registrations;
}

/**
 * Generate registration function code
 */
function generateRegistrationFunction(packageName, registrations) {
  const tools = registrations.tools[packageName] || [];
  const prompts = registrations.prompts[packageName] || [];

  let code = '';

  // Add prompts
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
  const srcIndexPath = path.join(__dirname, '..', 'src', 'index.ts.old');

  console.error('Extracting ALL tools and prompts from src/index.ts.old...\n');
  const registrations = extractAllRegistrations(srcIndexPath);

  // Display summary
  console.error('\n=== Extraction Summary ===\n');

  const packages = ['powerplatform', 'azure-devops', 'figma', 'application-insights',
                   'log-analytics', 'azure-sql', 'service-bus', 'sharepoint', 'github-enterprise'];

  let totalTools = 0;
  let totalPrompts = 0;

  for (const pkg of packages) {
    const tools = registrations.tools[pkg] || [];
    const prompts = registrations.prompts[pkg] || [];
    totalTools += tools.length;
    totalPrompts += prompts.length;
    console.error(`${pkg}: ${tools.length} tools, ${prompts.length} prompts`);
  }

  console.error(`\nGrand Total: ${totalTools} tools, ${totalPrompts} prompts`);

  // Save results
  const outputDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'extracted-all-registrations.json');
  fs.writeFileSync(outputPath, JSON.stringify(registrations, null, 2));
  console.error(`\nExtracted registrations saved to: ${outputPath}`);

  // Generate registration functions
  for (const pkg of packages) {
    if (pkg === 'figma') {
      console.error(`Skipping ${pkg} (already complete)`);
      continue;
    }

    const code = generateRegistrationFunction(pkg, registrations);
    const funcPath = path.join(outputDir, `register-${pkg}-tools-complete.ts`);
    fs.writeFileSync(funcPath, code);
    console.error(`Generated: ${funcPath}`);
  }

  console.error('\n✅ Complete extraction finished!');
}

main();
