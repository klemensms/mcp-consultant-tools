/**
 * Tool Description Examples Helper
 *
 * Provides a helper function to embed usage examples in Zod `.describe()` strings.
 * Anthropic research shows 72% -> 90% accuracy improvement when tools include examples.
 *
 * Centralized here so all packages import from one place.
 */

/**
 * Append formatted examples to a parameter description string.
 * Use in Zod `.describe()` to improve LLM accuracy when calling tools.
 *
 * @param description - Base parameter description
 * @param examples - Array of { label, value } pairs
 * @returns Description with formatted example list appended
 */
export function descWithExamples(
  description: string,
  examples: { label: string; value: string }[]
): string {
  if (examples.length === 0) return description;
  const exampleLines = examples
    .map(ex => `  - ${ex.label}: \`${ex.value}\``)
    .join('\n');
  return `${description}\n\nExamples:\n${exampleLines}`;
}
