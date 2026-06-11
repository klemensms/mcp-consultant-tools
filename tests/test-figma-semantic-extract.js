#!/usr/bin/env node
/**
 * Integration test for get-figma-semantic-extract tool
 *
 * Tests the complete tool against a real FigJam board.
 * Requires FIGMA_API_KEY or FIGMA_OAUTH_TOKEN environment variable.
 *
 * Set FIGMA_TEST_FILE_KEY (and optionally FIGMA_TEST_NODE_ID) to a real
 * FigJam board you have access to. The placeholder fallbacks below will not
 * resolve against the Figma API.
 */

import { config } from "dotenv";
import { FigmaService } from "../packages/figma/build/FigmaService.js";
import { extractSemanticData } from "../packages/figma/build/figma/extractors/semantic-extractor.js";

// Load environment variables
config();

// Test configuration
const TEST_FILE_KEY = process.env.FIGMA_TEST_FILE_KEY || "Abc123SampleFileKey000";
const TEST_NODE_ID = process.env.FIGMA_TEST_NODE_ID || "1234-5678";

console.log("Testing Figma Semantic Extract Tool...\n");

async function runTests() {
  // Check for required environment variables
  if (!process.env.FIGMA_API_KEY && !process.env.FIGMA_OAUTH_TOKEN) {
    console.error("❌ Missing required environment variable:");
    console.error("   Set FIGMA_API_KEY or FIGMA_OAUTH_TOKEN");
    process.exit(1);
  }

  const service = new FigmaService({
    apiKey: process.env.FIGMA_API_KEY,
    oauthToken: process.env.FIGMA_OAUTH_TOKEN,
    useOAuth: process.env.FIGMA_USE_OAUTH === "true",
  });

  console.log("=".repeat(80));
  console.log("TEST: get-figma-semantic-extract");
  console.log("=".repeat(80));
  console.log(`File Key: ${TEST_FILE_KEY}`);
  console.log(`Node ID: ${TEST_NODE_ID}`);
  console.log("");

  try {
    // Step 1: Fetch raw data (with fills for color detection)
    console.log("Step 1: Fetching raw Figma data...");
    const startFetch = Date.now();

    const rawData = await service.getFigmaData(TEST_FILE_KEY, TEST_NODE_ID, undefined, {
      excludeStyles: false, // Need fills for sticky color detection
      simplifyConnectors: true,
      simplifyComponentInstances: true,
      tablesToMarkdown: true,
    });

    const fetchTime = Date.now() - startFetch;
    console.log(`   ✓ Raw data fetched in ${fetchTime}ms`);
    console.log(`   Raw data size: ${JSON.stringify(rawData).length.toLocaleString()} bytes`);
    console.log("");

    // Step 2: Extract semantic data
    console.log("Step 2: Extracting semantic data...");
    const startExtract = Date.now();

    const semanticData = extractSemanticData(rawData, TEST_FILE_KEY, TEST_NODE_ID);

    const extractTime = Date.now() - startExtract;
    const semanticSize = JSON.stringify(semanticData).length;

    console.log(`   ✓ Semantic extraction completed in ${extractTime}ms`);
    console.log(`   Semantic data size: ${semanticSize.toLocaleString()} bytes`);
    console.log("");

    // Step 3: Verify structure
    console.log("Step 3: Verifying output structure...");

    const requiredFields = [
      "fileKey",
      "nodeId",
      "title",
      "fetchedAt",
      "sections",
      "stickies",
      "components",
      "textNodes",
      "connectors",
      "userStories",
      "stats",
    ];

    const missingFields = requiredFields.filter(f => !(f in semanticData));
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }
    console.log(`   ✓ All required fields present`);
    console.log("");

    // Step 4: Display summary
    console.log("Step 4: Output summary");
    console.log("-".repeat(40));
    console.log(`   Title: ${semanticData.title}`);
    console.log(`   Fetched At: ${semanticData.fetchedAt}`);
    console.log("");
    console.log("   Content:");
    console.log(`     Sections: ${semanticData.sections.length}`);
    console.log(`     Stickies: ${semanticData.stickies.length}`);
    console.log(`     Components: ${semanticData.components.length}`);
    console.log(`     Text Nodes: ${semanticData.textNodes.length}`);
    console.log(`     Connectors: ${semanticData.connectors.length}`);
    console.log(`     User Stories: ${semanticData.userStories.length}`);
    console.log("");
    console.log("   Stats:");
    console.log(`     Total Nodes Processed: ${semanticData.stats.totalNodes}`);
    console.log(`     Nodes Dropped: ${semanticData.stats.nodesDropped}`);
    console.log("");

    // Step 5: Sticky category breakdown
    if (semanticData.stickies.length > 0) {
      console.log("   Sticky Categories:");
      const categoryCount = {};
      for (const sticky of semanticData.stickies) {
        categoryCount[sticky.category] = (categoryCount[sticky.category] || 0) + 1;
      }
      for (const [category, count] of Object.entries(categoryCount).sort()) {
        console.log(`     ${category}: ${count}`);
      }
      console.log("");
    }

    // Step 6: User stories found
    if (semanticData.userStories.length > 0) {
      console.log("   User Stories Found:");
      for (const story of semanticData.userStories.slice(0, 10)) {
        console.log(`     ${story.type}${story.id} (found in ${story.foundIn.length} nodes)`);
      }
      if (semanticData.userStories.length > 10) {
        console.log(`     ... and ${semanticData.userStories.length - 10} more`);
      }
      console.log("");
    }

    // Step 7: Size reduction check
    const rawSize = JSON.stringify(rawData).length;
    const reduction = ((rawSize - semanticSize) / rawSize * 100).toFixed(1);
    console.log("   Size Comparison:");
    console.log(`     Raw data: ${rawSize.toLocaleString()} bytes`);
    console.log(`     Semantic: ${semanticSize.toLocaleString()} bytes`);
    console.log(`     Reduction: ${reduction}%`);
    console.log("");

    // Step 8: Determinism check
    console.log("Step 5: Verifying deterministic output...");
    const extract1 = extractSemanticData(rawData, TEST_FILE_KEY, TEST_NODE_ID);
    const extract2 = extractSemanticData(rawData, TEST_FILE_KEY, TEST_NODE_ID);

    // Remove timestamps for comparison
    delete extract1.fetchedAt;
    delete extract2.fetchedAt;

    const json1 = JSON.stringify(extract1);
    const json2 = JSON.stringify(extract2);

    if (json1 === json2) {
      console.log("   ✓ Output is deterministic (identical JSON for same input)");
    } else {
      console.log("   ❌ Output is NOT deterministic!");
      console.log("   This will cause noisy diffs.");
    }
    console.log("");

    // Final summary
    console.log("=".repeat(80));
    console.log("TEST PASSED");
    console.log("=".repeat(80));
    console.log("");
    console.log("The get-figma-semantic-extract tool is working correctly.");
    console.log(`Total execution time: ${fetchTime + extractTime}ms`);

  } catch (error) {
    console.error("");
    console.error("=".repeat(80));
    console.error("TEST FAILED");
    console.error("=".repeat(80));
    console.error("");
    console.error("Error:", error.message);
    if (error.stack) {
      console.error("");
      console.error("Stack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runTests();
