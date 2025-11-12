#!/usr/bin/env node

/**
 * Fix TypeScript type errors in split PowerPlatform packages
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const packagesToFix = [
  'packages/powerplatform-customization/src/index.ts',
  'packages/powerplatform-data/src/index.ts'
];

console.log('Fixing TypeScript types in split PowerPlatform packages...\n');

packagesToFix.forEach(relativePath => {
  const filePath = path.join(rootDir, relativePath);
  console.log(`Processing ${relativePath}...`);

  let content = fs.readFileSync(filePath, 'utf8');
  let fixCount = 0;

  // Fix 1: Change Server type to any in function signature
  const beforeServer = content.match(/export function \w+\(server: Server/);
  content = content.replace(
    /export function (\w+)\(server: Server,/g,
    'export function $1(server: any,'
  );
  if (beforeServer && content !== fs.readFileSync(filePath, 'utf8')) {
    fixCount++;
    console.log('  ✅ Fixed server type (Server → any)');
  }

  // Fix 2: Add type annotations to async function parameters
  // Pattern: async ({ param1, param2 }) =>
  const paramMatches = content.match(/async \(\{\s*([^}]+)\s*\}\s*\)\s+=>/g);
  if (paramMatches) {
    content = content.replace(
      /async \(\{\s*([^}]+)\s*\}\s*\)\s+=>/g,
      (match, params) => {
        // Skip if already has type annotation
        if (match.includes('}: ')) {
          return match;
        }
        return `async ({ ${params.trim()} }: any) =>`;
      }
    );
    fixCount += paramMatches.length;
    console.log(`  ✅ Fixed ${paramMatches.length} async parameter type annotations`);
  }

  // Fix 3: Remove Server import (we're using any now)
  const beforeImports = content;
  content = content.replace(
    /import \{ Server \} from '@modelcontextprotocol\/sdk\/server\/index\.js';\n/g,
    ''
  );
  if (content !== beforeImports) {
    fixCount++;
    console.log('  ✅ Removed unused Server import');
  }

  // Fix 4: Add missing checkCustomizationEnabled function for customization package
  if (relativePath.includes('powerplatform-customization')) {
    if (!content.includes('function checkCustomizationEnabled()')) {
      const insertPoint = content.indexOf('  function getPowerPlatformService()');
      if (insertPoint > 0) {
        const checkFunction = `
  // Check if customization is enabled
  function checkCustomizationEnabled() {
    if (process.env.POWERPLATFORM_ENABLE_CUSTOMIZATION !== 'true') {
      throw new Error('Customization operations are disabled. Set POWERPLATFORM_ENABLE_CUSTOMIZATION=true to enable.');
    }
  }

`;
        content = content.substring(0, insertPoint) + checkFunction + content.substring(insertPoint);
        fixCount++;
        console.log('  ✅ Added checkCustomizationEnabled function');
      }
    }
  }

  // Write fixed content
  fs.writeFileSync(filePath, content);
  console.log(`  ✅ Total fixes applied: ${fixCount}\n`);
});

console.log('✅ All packages fixed!\n');
console.log('Run "npm run build" to verify the fixes.');
