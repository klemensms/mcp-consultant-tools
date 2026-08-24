import type { FileComplexityInfo, MethodComplexityInfo } from '../models/index.js';
import { extname } from 'node:path';

/**
 * Regex-based cyclomatic-complexity ESTIMATOR for C#, TypeScript, and JavaScript.
 *
 * It counts decision points line by line - it does not parse an AST - so the numbers are an
 * approximation of McCabe complexity, not an exact measurement. Known heuristic ceilings: a `case`
 * or operator inside a string literal can be over-counted; C# nullable-type declarations (`int?`)
 * can register as a ternary; and decision points inside a nested lambda are counted both for the
 * nested method and its enclosing method. Report the values as estimates. Upgrade path: a real C#
 * / TS parser (Roslyn, ts-morph) if exactness is ever required.
 */
export const COMPLEXITY_METHODOLOGY =
  'Cyclomatic complexity is a regex-based estimate (decision-point count), not an AST measurement; treat the values as approximate.';

// Patterns that indicate a method/function definition
const CS_METHOD_PATTERN =
  /(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed|partial)\s+[\w<>\[\],\s]+\s+(\w+)\s*\(([^)]*)\)\s*(?:where\s+\w+\s*:\s*\w+\s*)*\{/g;

const TS_METHOD_PATTERN =
  /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]*)?\s*=>|(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|,\s]+)?\s*\{)/g;

// Decision-point patterns (applied per line). `else if` is intentionally NOT listed: every
// `else if (` contains an `if (` that the `if` pattern already counts once - counting a separate
// `else if` pattern too would double-count the branch (the ported source's bug).
const DECISION_PATTERNS = [
  /\bif\s*\(/g,
  /\bcase\s+/g,
  /\bfor\s*\(/g,
  /\bforeach\s*\(/g,
  /\bwhile\s*\(/g,
  /\bdo\s*\{/g,
  /\bcatch\s*[\({]/g,
  /&&/g,
  /\|\|/g,
  /\?\?/g,
  /[^?]\s*\?\s+\S/g, // ternary operator (approximate, avoids ?. and ?? false positives)
];

export function analyzeFileComplexity(content: string, filePath: string): FileComplexityInfo {
  const extension = extname(filePath);
  const lines = content.split('\n');

  const linesOfCode = lines.length;
  const blankLines = lines.filter((l) => l.trim() === '').length;
  const commentLines = countCommentLines(lines);

  const methods = extractMethods(content, extension);

  const complexities = methods.map((m) => m.cyclomaticComplexity);
  const averageMethodComplexity =
    methods.length > 0 ? complexities.reduce((a, b) => a + b, 0) / methods.length : 0;
  const maxMethodComplexity = methods.length > 0 ? Math.max(...complexities) : 0;

  return {
    path: filePath,
    extension,
    linesOfCode,
    blankLines,
    commentLines,
    methods,
    averageMethodComplexity: Math.round(averageMethodComplexity * 100) / 100,
    maxMethodComplexity,
  };
}

function extractMethods(content: string, extension: string): MethodComplexityInfo[] {
  const methods: MethodComplexityInfo[] = [];
  const isCs = extension === '.cs';
  const pattern = isCs ? CS_METHOD_PATTERN : TS_METHOD_PATTERN;

  // Reset regex state
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const name = match[1] ?? match[2] ?? match[3] ?? 'anonymous';
    const startOffset = match.index;
    const startLine = content.substring(0, startOffset).split('\n').length;

    // Find the matching closing brace
    const bodyStart = content.indexOf('{', startOffset);
    if (bodyStart === -1) continue;

    const endOffset = findMatchingBrace(content, bodyStart);
    if (endOffset === -1) continue;

    const endLine = content.substring(0, endOffset).split('\n').length;
    const methodBody = content.substring(bodyStart, endOffset + 1);
    const methodLines = methodBody.split('\n');

    // Count parameters
    const paramStr = match[0].match(/\(([^)]*)\)/)?.[1] ?? '';
    const parameters = paramStr.trim() === '' ? 0 : paramStr.split(',').length;

    // Calculate cyclomatic complexity (base = 1)
    let complexity = 1;
    for (const line of methodLines) {
      // Skip comment lines
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      for (const dp of DECISION_PATTERNS) {
        dp.lastIndex = 0;
        const matches = line.match(dp);
        if (matches) {
          complexity += matches.length;
        }
      }
    }

    methods.push({
      name,
      startLine,
      linesOfCode: endLine - startLine + 1,
      cyclomaticComplexity: complexity,
      parameters,
    });
  }

  return methods;
}

function findMatchingBrace(content: string, openBraceIndex: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openBraceIndex; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        i++; // skip escaped character
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function countCommentLines(lines: string[]): number {
  let count = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inBlockComment) {
      count++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }

    if (trimmed.startsWith('//') || trimmed.startsWith('///')) {
      count++;
      continue;
    }

    if (trimmed.startsWith('/*')) {
      count++;
      inBlockComment = true;
      if (trimmed.includes('*/')) inBlockComment = false;
    }
  }

  return count;
}
