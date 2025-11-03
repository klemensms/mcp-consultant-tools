#!/usr/bin/env node
import { config } from "dotenv";
import { AzureDevOpsService } from "../build/AzureDevOpsService.js";

config();

const service = new AzureDevOpsService({
  organization: process.env.AZUREDEVOPS_ORGANIZATION,
  pat: process.env.AZUREDEVOPS_PAT,
  projects: (process.env.AZUREDEVOPS_PROJECTS || "").split(",").map(p => p.trim()).filter(p => p),
  apiVersion: process.env.AZUREDEVOPS_API_VERSION || "7.1",
});

const project = "RTPI";

async function debugWikiPage() {
  console.log("=".repeat(80));
  console.log("DEBUGGING WIKI PAGE ACCESS");
  console.log("=".repeat(80));
  console.log("");

  try {
    // Step 1: Get all wikis
    console.log("STEP 1: Getting all wikis in project...");
    const wikis = await service.getWikis(project);
    console.log(`Found ${wikis.totalCount} wikis:`);
    wikis.wikis.forEach(wiki => {
      console.log(`  - Name: ${wiki.name}`);
      console.log(`    ID: ${wiki.id}`);
      console.log(`    Type: ${wiki.type}`);
      console.log("");
    });

    if (wikis.wikis.length === 0) {
      console.log("No wikis found. Cannot continue test.");
      return;
    }

    // Step 2: Try different path formats
    const wikiId = wikis.wikis[0].id;
    const wikiName = wikis.wikis[0].name;

    console.log("=".repeat(80));
    console.log("STEP 2: Testing different page path formats");
    console.log("=".repeat(80));
    console.log("");

    const pathVariations = [
      "/Release-Notes/Release_003-[Online-Joining]",
      "/Release-Notes/Release_003-[Online-Joining].md",
      "Release-Notes/Release_003-[Online-Joining]",
      "Release-Notes/Release_003-[Online-Joining].md",
      "/Release Notes/Release_003-[Online-Joining]",
    ];

    for (const path of pathVariations) {
      console.log(`Trying path: "${path}"`);
      console.log(`  With wiki ID: ${wikiId}`);

      try {
        const page = await service.getWikiPage(project, wikiId, path, false);
        console.log(`  ✓ SUCCESS!`);
        console.log(`    Page ID: ${page.id}`);
        console.log(`    Git Path: ${page.gitItemPath}`);
        console.log("");
        break; // Stop on first success
      } catch (error) {
        console.log(`  ✗ Failed: ${error.message}`);
        console.log("");
      }
    }

    // Step 3: Try with wiki name instead of ID
    console.log("=".repeat(80));
    console.log("STEP 3: Testing with wiki name instead of ID");
    console.log("=".repeat(80));
    console.log("");

    for (const path of pathVariations) {
      console.log(`Trying path: "${path}"`);
      console.log(`  With wiki name: ${wikiName}`);

      try {
        const page = await service.getWikiPage(project, wikiName, path, false);
        console.log(`  ✓ SUCCESS!`);
        console.log(`    Page ID: ${page.id}`);
        console.log(`    Git Path: ${page.gitItemPath}`);
        console.log("");
        break; // Stop on first success
      } catch (error) {
        console.log(`  ✗ Failed: ${error.message}`);
        console.log("");
      }
    }

    // Step 4: Search for the page
    console.log("=".repeat(80));
    console.log("STEP 4: Searching for the page");
    console.log("=".repeat(80));
    console.log("");

    const searchResult = await service.searchWikiPages("Release_003 Online-Joining", project, 5);
    console.log(`Search results: ${searchResult.totalCount} found`);
    if (searchResult.results && searchResult.results.length > 0) {
      searchResult.results.forEach((result, idx) => {
        console.log(`  ${idx + 1}. ${result.fileName}`);
        console.log(`     Path: ${result.path}`);
        console.log(`     Wiki: ${result.wikiName} (${result.wikiId})`);
        console.log("");
      });

      // Try to get the first result
      const firstResult = searchResult.results[0];
      console.log(`Trying to get page from search result:`);
      console.log(`  Wiki ID: ${firstResult.wikiId}`);
      console.log(`  Path: ${firstResult.path}`);

      try {
        const page = await service.getWikiPage(project, firstResult.wikiId, firstResult.path, true);
        console.log(`  ✓ SUCCESS!`);
        console.log(`    Content length: ${page.content ? page.content.length : 0} characters`);
        if (page.content) {
          console.log(`    Content preview: ${page.content.substring(0, 200)}...`);
        }
      } catch (error) {
        console.log(`  ✗ Failed: ${error.message}`);
      }
    }

  } catch (error) {
    console.error("Error:", error.message);
  }

  console.log("");
  console.log("=".repeat(80));
  console.log("Debug complete");
  console.log("=".repeat(80));
}

debugWikiPage();
