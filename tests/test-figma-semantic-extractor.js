#!/usr/bin/env node
/**
 * Unit tests for Figma Semantic Extractor
 *
 * Tests the core extraction logic without calling the Figma API.
 * Uses mock data to verify:
 * - Sticky color categorization
 * - Story ID extraction
 * - Section building
 * - Deterministic output
 */

// Import the built extractor functions
import {
  categorizeStickyColor,
  extractUserStories,
  extractSemanticData,
} from "../packages/figma/build/figma/extractors/semantic-extractor.js";

// Test utilities
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertArrayEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
  }
}

// ============================================================================
// Test: Sticky Color Categorization
// ============================================================================

console.log("\n=== Sticky Color Categorization Tests ===\n");

test("categorizes red colors as blocker", () => {
  // Red: hue 0°
  assertEqual(categorizeStickyColor("#FF0000"), "blocker", "Pure red");
  assertEqual(categorizeStickyColor("#FF5555"), "blocker", "Light red");
  assertEqual(categorizeStickyColor("#FFAFA3"), "blocker", "Pink/salmon");
});

test("categorizes pink colors as blocker", () => {
  // Pink: hue 330-360°
  assertEqual(categorizeStickyColor("#FF8B8B"), "blocker", "FigJam pink");
  assertEqual(categorizeStickyColor("rgba(255, 139, 139, 1)"), "blocker", "RGBA pink");
});

test("categorizes yellow colors as info", () => {
  // Yellow: hue 45-65°
  assertEqual(categorizeStickyColor("#FFD966"), "info", "FigJam yellow");
  assertEqual(categorizeStickyColor("#FFEB3B"), "info", "Bright yellow");
});

test("categorizes green colors as done", () => {
  // Green: hue 90-150°
  assertEqual(categorizeStickyColor("#85E0A3"), "done", "FigJam green");
  assertEqual(categorizeStickyColor("#00FF00"), "done", "Pure green");
  assertEqual(categorizeStickyColor("#14AE5C"), "done", "Dark green");
});

test("categorizes blue colors as investigation", () => {
  // Blue: hue 200-250°
  assertEqual(categorizeStickyColor("#80CAFF"), "investigation", "FigJam blue");
  assertEqual(categorizeStickyColor("#0D99FF"), "investigation", "Bright blue");
});

test("categorizes purple colors as tbd", () => {
  // Purple: hue 270-320°
  assertEqual(categorizeStickyColor("#D9B8FF"), "tbd", "FigJam purple");
  assertEqual(categorizeStickyColor("#9747FF"), "tbd", "Bright purple");
});

test("categorizes gray colors as note", () => {
  // Low saturation = gray
  assertEqual(categorizeStickyColor("#E6E6E6"), "note", "Light gray");
  assertEqual(categorizeStickyColor("#808080"), "note", "Medium gray");
  assertEqual(categorizeStickyColor("#B3B3B3"), "note", "Silver");
});

test("handles undefined fills as unknown", () => {
  assertEqual(categorizeStickyColor(undefined), "unknown", "Undefined fills");
});

test("respects color overrides", () => {
  const overrides = { "#FF0000": "tbd" };
  assertEqual(
    categorizeStickyColor("#FF0000", undefined, overrides),
    "tbd",
    "Override should take precedence"
  );
});

test("accepts legacy 'si-investigation' override alias and emits 'investigation'", () => {
  const overrides = { "#FF0000": "si-investigation" };
  assertEqual(
    categorizeStickyColor("#FF0000", undefined, overrides),
    "investigation",
    "Legacy alias should be normalized to 'investigation'"
  );
});

test("normalizes legacy alias in extractSemanticData overrides", () => {
  const design = {
    name: "Test Design",
    nodes: [
      {
        id: "sticky1",
        name: "Sticky",
        type: "STICKY_NOTE",
        text: "Hello",
        fills: "#FF0000",
      },
    ],
    components: {},
    componentSets: {},
    globalVars: { styles: {} },
  };
  const result = extractSemanticData(design, "testKey", undefined, {
    stickyColorOverrides: { "#FF0000": "si-investigation" },
  });
  assertEqual(result.stickies[0].category, "investigation", "Emitted category must be 'investigation'");
});

// ============================================================================
// Test: Story ID Extraction
// ============================================================================

console.log("\n=== Story ID Extraction Tests ===\n");

test("extracts US prefix story IDs", () => {
  const nodes = [
    { id: "1", name: "US787 - Test Story", type: "TEXT" },
  ];
  const stories = extractUserStories(nodes);
  assertEqual(stories.length, 1, "Should find one story");
  assertEqual(stories[0].id, 787, "Story ID should be 787");
  assertEqual(stories[0].type, "US", "Type should be US");
});

test("extracts Story prefix IDs", () => {
  const nodes = [
    { id: "1", name: "Story #123 - Another Story", type: "TEXT" },
  ];
  const stories = extractUserStories(nodes);
  assertEqual(stories.length, 1, "Should find one story");
  assertEqual(stories[0].id, 123, "Story ID should be 123");
});

test("extracts Task prefix IDs", () => {
  const nodes = [
    { id: "1", name: "Task456 implementation", type: "TEXT" },
  ];
  const stories = extractUserStories(nodes);
  assertEqual(stories.length, 1, "Should find one story");
  assertEqual(stories[0].id, 456, "Story ID should be 456");
});

test("extracts Bug prefix IDs", () => {
  const nodes = [
    { id: "1", name: "Bug #789 - Critical fix", type: "TEXT" },
  ];
  const stories = extractUserStories(nodes);
  assertEqual(stories.length, 1, "Should find one story");
  assertEqual(stories[0].id, 789, "Story ID should be 789");
});

test("does NOT extract bare numbers (strict pattern)", () => {
  const nodes = [
    { id: "1", name: "There are 1234 users in the system", type: "TEXT" },
  ];
  const stories = extractUserStories(nodes);
  assertEqual(stories.length, 0, "Should NOT match bare numbers");
});

test("does NOT extract numbers without prefix", () => {
  const nodes = [
    { id: "1", name: "#999 is not a story", type: "TEXT" },
  ];
  const stories = extractUserStories(nodes);
  // Note: This depends on the exact regex - #999 should NOT match without prefix
  assertEqual(stories.length, 0, "Should NOT match #number without prefix");
});

test("extracts multiple story IDs from nested nodes", () => {
  const nodes = [
    {
      id: "1",
      name: "Parent",
      type: "FRAME",
      children: [
        { id: "2", name: "US100 - First", type: "TEXT" },
        { id: "3", name: "US200 - Second", type: "TEXT" },
      ],
    },
  ];
  const stories = extractUserStories(nodes);
  assertEqual(stories.length, 2, "Should find two stories");
  assertEqual(stories[0].id, 100, "First story should be 100");
  assertEqual(stories[1].id, 200, "Second story should be 200");
});

test("deduplicates story IDs across multiple nodes", () => {
  const nodes = [
    { id: "1", name: "US787 mentioned here", type: "TEXT" },
    { id: "2", name: "US787 mentioned again", type: "TEXT" },
  ];
  const stories = extractUserStories(nodes);
  assertEqual(stories.length, 1, "Should deduplicate to one story");
  assertEqual(stories[0].foundIn.length, 2, "Should track both nodes");
});

test("extracts from component properties", () => {
  const nodes = [
    {
      id: "1",
      name: "ADO User Story",
      type: "INSTANCE",
      componentProperties: [
        { name: "ID", value: "US555" },
        { name: "Title", value: "Test Story" },
      ],
    },
  ];
  const stories = extractUserStories(nodes);
  assertEqual(stories.length, 1, "Should find story in properties");
  assertEqual(stories[0].id, 555, "Story ID should be 555");
});

// ============================================================================
// Test: Section Building
// ============================================================================

console.log("\n=== Section Building Tests ===\n");

test("identifies SECTION nodes as sections", () => {
  const design = {
    name: "Test Design",
    nodes: [
      {
        id: "1",
        name: "My Section",
        type: "SECTION",
        children: [],
      },
    ],
    components: {},
    componentSets: {},
    globalVars: { styles: {} },
  };
  const result = extractSemanticData(design, "testKey");
  assertEqual(result.sections.length, 1, "Should find one section");
  assertEqual(result.sections[0].name, "My Section", "Section name matches");
});

test("identifies FRAME nodes as sections", () => {
  const design = {
    name: "Test Design",
    nodes: [
      {
        id: "1",
        name: "My Frame",
        type: "FRAME",
        children: [],
      },
    ],
    components: {},
    componentSets: {},
    globalVars: { styles: {} },
  };
  const result = extractSemanticData(design, "testKey");
  assertEqual(result.sections.length, 1, "Should find one section");
  assertEqual(result.sections[0].name, "My Frame", "Section name matches");
});

test("assigns stickies to parent sections", () => {
  const design = {
    name: "Test Design",
    nodes: [
      {
        id: "section1",
        name: "Parent Section",
        type: "SECTION",
        children: [
          {
            id: "sticky1",
            name: "Sticky",
            type: "STICKY_NOTE",
            text: "Hello world",
            fills: "#FF0000",
          },
        ],
      },
    ],
    components: {},
    componentSets: {},
    globalVars: { styles: {} },
  };
  const result = extractSemanticData(design, "testKey");
  assertEqual(result.stickies.length, 1, "Should find one sticky");
  assertEqual(result.stickies[0].parentSectionId, "section1", "Sticky should belong to section");
});

// ============================================================================
// Test: Connector Extraction
// ============================================================================

console.log("\n=== Connector Extraction Tests ===\n");

test("extracts connectors with resolved names", () => {
  const design = {
    name: "Test Design",
    nodes: [
      {
        id: "node1",
        name: "Start Node",
        type: "FRAME",
        children: [],
      },
      {
        id: "node2",
        name: "End Node",
        type: "FRAME",
        children: [],
      },
      {
        id: "conn1",
        name: "Connection",
        type: "CONNECTOR",
        startNodeId: "node1",
        endNodeId: "node2",
        text: "triggers",
      },
    ],
    components: {},
    componentSets: {},
    globalVars: { styles: {} },
  };
  const result = extractSemanticData(design, "testKey");
  assertEqual(result.connectors.length, 1, "Should find one connector");
  assertEqual(result.connectors[0].label, "triggers", "Label should match");
  assertEqual(result.connectors[0].fromNodeName, "Start Node", "From name should be resolved");
  assertEqual(result.connectors[0].toNodeName, "End Node", "To name should be resolved");
});

// ============================================================================
// Test: Deterministic Output
// ============================================================================

console.log("\n=== Deterministic Output Tests ===\n");

test("produces identical JSON for same input", () => {
  const design = {
    name: "Test Design",
    nodes: [
      { id: "c", name: "C", type: "SECTION", children: [] },
      { id: "a", name: "A", type: "SECTION", children: [] },
      { id: "b", name: "B", type: "SECTION", children: [] },
    ],
    components: {},
    componentSets: {},
    globalVars: { styles: {} },
  };

  const result1 = extractSemanticData(design, "testKey");
  const result2 = extractSemanticData(design, "testKey");

  // Remove fetchedAt for comparison (timestamps will differ)
  delete result1.fetchedAt;
  delete result2.fetchedAt;

  const json1 = JSON.stringify(result1);
  const json2 = JSON.stringify(result2);

  assertEqual(json1, json2, "JSON output should be identical");
});

test("sorts sections by ID for determinism", () => {
  const design = {
    name: "Test Design",
    nodes: [
      { id: "z", name: "Z", type: "SECTION", children: [] },
      { id: "a", name: "A", type: "SECTION", children: [] },
      { id: "m", name: "M", type: "SECTION", children: [] },
    ],
    components: {},
    componentSets: {},
    globalVars: { styles: {} },
  };

  const result = extractSemanticData(design, "testKey");
  const ids = result.sections.map(s => s.id);

  assertArrayEqual(ids, ["a", "m", "z"], "Sections should be sorted by ID");
});

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "=".repeat(50));
console.log(`Tests completed: ${passed + failed} total`);
console.log(`  ✓ Passed: ${passed}`);
console.log(`  ✗ Failed: ${failed}`);
console.log("=".repeat(50) + "\n");

if (failed > 0) {
  process.exit(1);
}
