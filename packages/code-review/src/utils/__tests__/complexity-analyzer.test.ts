import { describe, it, expect } from 'vitest';
import { analyzeFileComplexity, COMPLEXITY_METHODOLOGY } from '../complexity-analyzer.js';

function methodNamed(content: string, name: string) {
  const info = analyzeFileComplexity(content, 'Sample.cs');
  const m = info.methods.find((x) => x.name === name);
  if (!m) throw new Error(`method ${name} not found; got ${info.methods.map((x) => x.name).join(',')}`);
  return m;
}

describe('cyclomatic complexity counting', () => {
  it('a straight-line method has complexity 1', () => {
    const src = `public void Simple() {\n  var x = 1;\n  return;\n}`;
    expect(methodNamed(src, 'Simple').cyclomaticComplexity).toBe(1);
  });

  it('counts an if/else-if/else chain as 3 - the else-if is NOT double counted', () => {
    // 2 decision points (if, else-if) => complexity 3. The ported source counted the
    // "if (" inside "else if (" twice (once as if, once as else-if) and reported 4.
    const src = `public int Branch(int x) {\n  if (x > 0) { return 1; }\n  else if (x < 0) { return -1; }\n  else { return 0; }\n}`;
    expect(methodNamed(src, 'Branch').cyclomaticComplexity).toBe(3);
  });

  it('counts && and || operators', () => {
    const src = `public bool Logic(bool a, bool b) {\n  return a && b || a;\n}`;
    expect(methodNamed(src, 'Logic').cyclomaticComplexity).toBe(3);
  });

  it('counts switch case labels', () => {
    const src = `public int Sw(int x) {\n  switch (x) {\n    case 1: return 1;\n    case 2: return 2;\n    default: return 0;\n  }\n}`;
    // base 1 + two case labels = 3
    expect(methodNamed(src, 'Sw').cyclomaticComplexity).toBe(3);
  });
});

describe('estimate labelling', () => {
  it('the methodology string flags the metric as an estimate, not exact', () => {
    expect(COMPLEXITY_METHODOLOGY.toLowerCase()).toMatch(/estimate|approximate/);
  });
});
