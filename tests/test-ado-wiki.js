#!/usr/bin/env node
import { config } from "dotenv";
import { AzureDevOpsService } from "../build/AzureDevOpsService.js";

// Load environment variables
config();

console.log("Testing Azure DevOps Wiki Tools...\n");

const service = new AzureDevOpsService({
  organization: process.env.AZUREDEVOPS_ORGANIZATION,
  pat: process.env.AZUREDEVOPS_PAT,
  projects: (process.env.AZUREDEVOPS_PROJECTS || "").split(",").map(p => p.trim()).filter(p => p),
  apiVersion: process.env.AZUREDEVOPS_API_VERSION || "7.1",
  enableWikiWrite: process.env.AZUREDEVOPS_ENABLE_WIKI_WRITE === "true",
});

async function testWikiTools() {
  try {
    const project = service['config'].projects[0]; // Get first allowed project

    if (!project) {
      console.error("No projects configured. Set AZUREDEVOPS_PROJECTS environment variable.");
      return;
    }

    console.log("=".repeat(80));
    console.log(`TESTING PROJECT: ${project}`);
    console.log("=".repeat(80));
    console.log("");

    // Test 1: Get Wikis
    console.log("TEST 1: Get Wikis");
    console.log("-".repeat(40));
    const wikisResult = await service.getWikis(project);
    console.log(`Total Wikis: ${wikisResult.totalCount}`);
    if (wikisResult.wikis && wikisResult.wikis.length > 0) {
      wikisResult.wikis.forEach((wiki, idx) => {
        console.log(`  ${idx + 1}. ${wiki.name}`);
        console.log(`     ID: ${wiki.id}`);
        console.log(`     Type: ${wiki.type}`);
      });
    }
    console.log("");

    // Test 2: Search Wiki Pages
    console.log("TEST 2: Search Wiki Pages");
    console.log("-".repeat(40));
    const searchTerm = "authentication"; // Change this to a term that exists in your wikis
    const searchResult = await service.searchWikiPages(searchTerm, project, 5);
    console.log(`Search Term: "${searchTerm}"`);
    console.log(`Total Results: ${searchResult.totalCount}`);
    if (searchResult.results && searchResult.results.length > 0) {
      searchResult.results.forEach((result, idx) => {
        console.log(`  ${idx + 1}. ${result.fileName}`);
        console.log(`     Path: ${result.path}`);
        console.log(`     Wiki: ${result.wikiName}`);
        if (result.highlights && result.highlights.length > 0) {
          console.log(`     Highlights: ${result.highlights.length} matches`);
        }
      });
    } else {
      console.log(`  No results found for "${searchTerm}"`);
      console.log(`  Try searching for a different term that exists in your wiki.`);
    }
    console.log("");

    // Test 3: Get Wiki Page (only if we have wikis)
    if (wikisResult.wikis && wikisResult.wikis.length > 0) {
      console.log("TEST 3: Get Wiki Page");
      console.log("-".repeat(40));
      const wikiId = wikisResult.wikis[0].id;
      const pagePath = "/"; // Root page - change this to a specific page path if needed

      try {
        const pageResult = await service.getWikiPage(project, wikiId, pagePath, true);
        console.log(`Wiki: ${wikiId}`);
        console.log(`Page Path: ${pagePath}`);
        console.log(`Git Path: ${pageResult.gitItemPath}`);
        console.log(`Content Length: ${pageResult.content ? pageResult.content.length : 0} characters`);
        if (pageResult.subPages && pageResult.subPages.length > 0) {
          console.log(`Sub-pages: ${pageResult.subPages.length}`);
        }
      } catch (error) {
        console.log(`  Could not retrieve page "${pagePath}"`);
        console.log(`  Error: ${error.message}`);
        console.log(`  Try specifying a different page path that exists in your wiki.`);
      }
      console.log("");
    }

    console.log("=".repeat(80));
    console.log("✓ Wiki tests completed successfully");
    console.log("=".repeat(80));

  } catch (error) {
    console.error("Error:", error.message);
    if (error.message.includes("authentication")) {
      console.error("\nPlease ensure:");
      console.error("  1. AZUREDEVOPS_ORGANIZATION is set correctly");
      console.error("  2. AZUREDEVOPS_PAT is valid and has 'vso.wiki' and 'vso.search' scopes");
      console.error("  3. AZUREDEVOPS_PROJECTS contains valid project names");
    }
  }
}

testWikiTools();
