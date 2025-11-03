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
console.log("TESTING AUTO-CONVERSION OF GIT PATHS");
console.log("=".repeat(80));
console.log("");

async function testAutoConversion() {
  const wikiId = "5a23b2eb-0059-44f9-a233-24bc57dd6627";

  // Test 1: Pass a git path directly (with .md extension)
  const gitPath = "/Release-Notes/Release_002-[Online-Joining]-%2D-Go%2DLive-Check-List.md";

  console.log("Test: Pass git path directly to get-wiki-page");
  console.log("-".repeat(80));
  console.log(`Git Path: ${gitPath}`);
  console.log("");

  try {
    const page = await service.getWikiPage("RTPI", wikiId, gitPath, false);
    console.log("✓ SUCCESS! Auto-conversion worked:");
    console.log(`  Page ID:   ${page.id}`);
    console.log(`  Wiki Path: ${page.path}`);
    console.log(`  Git Path:  ${page.gitItemPath}`);
    console.log("");
    console.log("=".repeat(80));
    console.log("✅ AUTO-CONVERSION TEST PASSED!");
    console.log("=".repeat(80));
    console.log("");
    console.log("This means get-wiki-page accepts both:");
    console.log("  • Wiki paths (with spaces): /Release Notes/Page Name");
    console.log("  • Git paths (with .md):     /Release-Notes/Page-Name.md");
    console.log("");
    console.log("If a git path is detected, it's automatically converted!");

  } catch (error) {
    console.log("❌ FAILED!");
    console.log(`  Error: ${error.message}`);
    console.log("");
    console.log("Auto-conversion is not working correctly.");
  }
}

testAutoConversion();
