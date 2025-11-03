#!/usr/bin/env node
import { config } from "dotenv";
import { AzureDevOpsService } from "../build/AzureDevOpsService.js";

config();

const service = new AzureDevOpsService({
  organization: process.env.AZUREDEVOPS_ORGANIZATION,
  pat: process.env.AZUREDEVOPS_PAT,
  projects: ["RTPI"],
  apiVersion: "7.1",
});

console.log("=".repeat(80));
console.log("TESTING WIKI PATH FIX - END-TO-END");
console.log("=".repeat(80));
console.log("");

async function testWikiFix() {
  try {
    // Step 1: Search for Release_002
    console.log("Step 1: Search for 'Release_002' in RTPI wiki...");
    console.log("-".repeat(80));
    const searchResult = await service.searchWikiPages("Release_002", "RTPI", 5);

    if (searchResult.totalCount === 0) {
      console.log("❌ No results found!");
      return;
    }

    console.log(`✓ Found ${searchResult.totalCount} result(s)`);
    console.log("");

    const result = searchResult.results[0];
    console.log("Search Result:");
    console.log(`  File Name: ${result.fileName}`);
    console.log(`  Git Path:  ${result.gitPath}`);
    console.log(`  Wiki Path: ${result.path}`);
    console.log(`  Wiki ID:   ${result.wikiId}`);
    console.log("");

    // Step 2: Try to get the page using the path from search results
    console.log("Step 2: Get wiki page using the 'path' from search results...");
    console.log("-".repeat(80));

    try {
      const page = await service.getWikiPage("RTPI", result.wikiId, result.path, true);
      console.log("✓ SUCCESS! Page retrieved:");
      console.log(`  Page ID:       ${page.id}`);
      console.log(`  Page Path:     ${page.path}`);
      console.log(`  Git Item Path: ${page.gitItemPath}`);
      console.log(`  Content Length: ${page.content.length} characters`);
      console.log("");

      // Extract ADO items
      console.log("Step 3: Extract ADO items from page content...");
      console.log("-".repeat(80));

      const adoItemMatches = page.content.matchAll(/\|\s*#(\d+)\s*\|/g);
      const items = Array.from(adoItemMatches).map(match => match[1]);

      if (items.length > 0) {
        console.log(`✓ Found ${items.length} ADO items:`);
        items.forEach((item, idx) => {
          console.log(`  ${idx + 1}. #${item}`);
        });
      } else {
        console.log("⚠️  No ADO items found in page content");
      }

      console.log("");
      console.log("=".repeat(80));
      console.log("✅ ALL TESTS PASSED!");
      console.log("=".repeat(80));
      console.log("");
      console.log("The fix allows Claude Desktop to:");
      console.log("  1. Search for wiki pages");
      console.log("  2. Use the 'path' field directly to retrieve pages");
      console.log("  3. Extract and display content without errors");

    } catch (error) {
      console.log("❌ FAILED to retrieve page!");
      console.log(`  Error: ${error.message}`);
      console.log("");
      console.log("This means the fix is NOT working correctly.");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testWikiFix();
