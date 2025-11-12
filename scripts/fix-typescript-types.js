#!/usr/bin/env node

/**
 * Automatic TypeScript type annotation fixer
 * Adds explicit `: any` type annotations to implicit parameters
 */

const fs = require('fs');
const path = require('path');

function fixTypeAnnotations(filePath) {
  console.error(`Processing: ${filePath}`);
  let content = fs.readFileSync(filePath, 'utf-8');
  let changes = 0;

  // Pattern 1: async (args) => needs async (args: any) =>
  content = content.replace(
    /async\s+\((\w+)\)\s+=>/g,
    (match, paramName) => {
      changes++;
      return `async (${paramName}: any) =>`;
    }
  );

  // Pattern 2: async (params) => needs async (params: any) =>
  content = content.replace(
    /async\s+\((\w+)\)\s+=>/g,
    (match, paramName) => {
      if (!match.includes(': any')) {
        changes++;
        return `async (${paramName}: any) =>`;
      }
      return match;
    }
  );

  // Pattern 3: async ({ destructured, params }) =>
  // This is trickier - we need to add `: any` after the closing brace
  content = content.replace(
    /async\s+\(\s*\{([^}]+)\}\s*\)\s+=>/g,
    (match, params) => {
      // Check if it already has a type annotation
      if (match.includes('}: ')) {
        return match;
      }
      changes++;
      return `async ({ ${params.trim()} }: any) =>`;
    }
  );

  // Pattern 4: .map((item) => needs .map((item: any) =>
  content = content.replace(
    /\.(map|filter|forEach|reduce)\(\s*\((\w+)\)\s+=>/g,
    (match, method, paramName) => {
      if (!match.includes(': any')) {
        changes++;
        return `.${method}((${paramName}: any) =>`;
      }
      return match;
    }
  );

  // Pattern 5: .map((item, index) => needs .map((item: any, index: any) =>
  content = content.replace(
    /\.(map|filter|forEach|reduce)\(\s*\((\w+),\s*(\w+)\)\s+=>/g,
    (match, method, param1, param2) => {
      if (!match.includes(': any')) {
        changes++;
        return `.${method}((${param1}: any, ${param2}: any) =>`;
      }
      return match;
    }
  );

  if (changes > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.error(`  ✅ Fixed ${changes} type annotations`);
  } else {
    console.error(`  ℹ️  No changes needed`);
  }

  return changes;
}

function main() {
  const packages = [
    'powerplatform',
    'azure-devops',
    'application-insights',
    'log-analytics',
    'azure-sql',
    'service-bus',
    'sharepoint',
    'github-enterprise',
  ];

  let totalChanges = 0;

  for (const pkg of packages) {
    const indexPath = path.join(__dirname, '..', 'packages', pkg, 'src', 'index.ts');
    if (fs.existsSync(indexPath)) {
      const changes = fixTypeAnnotations(indexPath);
      totalChanges += changes;
    } else {
      console.error(`⚠️  Not found: ${indexPath}`);
    }
  }

  console.error(`\n✅ Total: Fixed ${totalChanges} type annotations across all packages`);
}

main();
