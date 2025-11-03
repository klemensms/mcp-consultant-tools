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
console.log("PATH CONVERSION ANALYSIS");
console.log("=".repeat(80));
console.log("");

console.log("The Issue:");
console.log("-".repeat(80));
console.log("Search API returns GIT PATHS (file paths in the repository):");
console.log("  Example: /Release-Notes/Release_002-[Online-Joining]-%2D-Go%2DLive-Check-List.md");
console.log("");
console.log("Get Page API expects WIKI PATHS (user-facing page paths):");
console.log("  Example: /Release Notes/Release_002 [Online Joining] - Go-Live Check List");
console.log("");
console.log("Key Differences:");
console.log("  1. Git path uses dashes in folder names: /Release-Notes/");
console.log("     Wiki path uses spaces: /Release Notes/");
console.log("  2. Git path has .md extension, wiki path doesn't");
console.log("  3. Git path URL-encodes special chars (%2D for -), wiki path doesn't");
console.log("  4. Git path uses dashes in page names, wiki path may use spaces or dashes");
console.log("");

console.log("=".repeat(80));
console.log("TESTING PATH CONVERSION STRATEGIES");
console.log("=".repeat(80));
console.log("");

async function testConversionStrategies() {
  try {
    // Search for the page
    console.log("Step 1: Search for Release_002...");
    const searchResult = await service.searchWikiPages("Release_002", "RTPI", 5);

    if (searchResult.results.length === 0) {
      console.log("No results found!");
      return;
    }

    const result = searchResult.results[0];
    const gitPath = result.path;

    console.log(`  Found: ${result.fileName}`);
    console.log(`  Git Path: ${gitPath}`);
    console.log("");

    console.log("Step 2: Trying simple conversion strategies...");
    console.log("");

    // Strategy 1: Remove .md extension only
    const strategy1 = gitPath.replace(/\.md$/, '');
    console.log(`Strategy 1 - Remove .md only:`);
    console.log(`  "${strategy1}"`);
    try {
      await service.getWikiPage("RTPI", result.wikiId, strategy1, false);
      console.log(`  ✓ SUCCESS!`);
    } catch (error) {
      console.log(`  ✗ Failed`);
    }

    // Strategy 2: Remove .md and replace dashes with spaces in folders
    const strategy2 = gitPath
      .replace(/\.md$/, '')
      .replace(/\/([^/]+)\//g, (match, folder) => `/${folder.replace(/-/g, ' ')}/`);
    console.log(`Strategy 2 - Remove .md + replace folder dashes with spaces:`);
    console.log(`  "${strategy2}"`);
    try {
      await service.getWikiPage("RTPI", result.wikiId, strategy2, false);
      console.log(`  ✓ SUCCESS!`);
    } catch (error) {
      console.log(`  ✗ Failed`);
    }

    // Strategy 3: Remove .md, replace dashes with spaces everywhere
    const strategy3 = gitPath
      .replace(/\.md$/, '')
      .replace(/-/g, ' ')
      .replace(/%2D/gi, '-');
    console.log(`Strategy 3 - Replace all dashes with spaces + decode %2D:`);
    console.log(`  "${strategy3}"`);
    try {
      await service.getWikiPage("RTPI", result.wikiId, strategy3, false);
      console.log(`  ✓ SUCCESS!`);
    } catch (error) {
      console.log(`  ✗ Failed`);
    }

    // Strategy 4: Decode URI and remove .md
    const strategy4 = decodeURIComponent(gitPath).replace(/\.md$/, '');
    console.log(`Strategy 4 - Decode URI + remove .md:`);
    console.log(`  "${strategy4}"`);
    try {
      await service.getWikiPage("RTPI", result.wikiId, strategy4, false);
      console.log(`  ✓ SUCCESS!`);
    } catch (error) {
      console.log(`  ✗ Failed`);
    }

    // Strategy 5: Complex conversion (what seems to work)
    const strategy5 = gitPath
      .replace(/\.md$/, '')  // Remove extension
      .replace(/\/([^/]+)\//g, (match, folder) => `/${folder.replace(/-/g, ' ')}/`)  // Spaces in folders
      .replace(/([^/]+)$/, (match) => decodeURIComponent(match.replace(/-/g, ' ')));  // Decode and spaces in filename
    console.log(`Strategy 5 - Complex: folders spaces + decode filename:`);
    console.log(`  "${strategy5}"`);
    try {
      await service.getWikiPage("RTPI", result.wikiId, strategy5, false);
      console.log(`  ✓ SUCCESS!`);
    } catch (error) {
      console.log(`  ✗ Failed`);
    }

    console.log("");
    console.log("=".repeat(80));
    console.log("CONCLUSION");
    console.log("=".repeat(80));
    console.log("");
    console.log("The path conversion is NOT straightforward because:");
    console.log("  1. Folder names use dashes in git but spaces in wiki paths");
    console.log("  2. Page names may legitimately contain dashes (e.g., Release_002)");
    console.log("  3. Special characters are URL-encoded differently");
    console.log("");
    console.log("RECOMMENDED SOLUTION:");
    console.log("  1. Get the folder path by listing subpages recursively");
    console.log("  2. Or add a 'wikiPath' field to search results (API enhancement)");
    console.log("  3. Or provide a 'get-wiki-page-by-git-path' tool that does the conversion");
    console.log("");

  } catch (error) {
    console.error("Error:", error.message);
  }
}

testConversionStrategies();
