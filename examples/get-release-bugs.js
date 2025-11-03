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

async function getReleaseBugs() {
  console.log("Fetching Release_003 [Online Joining] from RTPI wiki...\n");

  const wikiId = "5a23b2eb-0059-44f9-a233-24bc57dd6627"; // RTPI.Crm.wiki
  const pagePath = "/Release Notes/Release_003 [Online Joining]";

  try {
    const page = await service.getWikiPage("RTPI", wikiId, pagePath, true);

    console.log("=".repeat(80));
    console.log("RELEASE_003 [ONLINE JOINING]");
    console.log("=".repeat(80));
    console.log("");

    // Extract deployment status from the content
    const statusMatch = page.content.match(/\|\s*UAT\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
    const prodMatch = page.content.match(/\|\s*PROD\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);

    if (statusMatch) {
      console.log("📅 DEPLOYMENT STATUS:");
      console.log(`   UAT:  ${statusMatch[1].trim()} - ${statusMatch[2].trim()}`);
    }
    if (prodMatch) {
      console.log(`   PROD: ${prodMatch[1].trim()} - ${prodMatch[2].trim()}`);
    }
    console.log("");

    // Extract ADO items (bugs/features)
    console.log("🐛 INCLUDED ADO ITEMS:");
    console.log("-".repeat(80));

    // Parse the table of ADO items
    const adoItemsSection = page.content.match(/<!--⭐️Header⭐️-->\n#Included ADO items[\s\S]*?\n([\s\S]*?)(?=\n\n<!--⭐️Header⭐️-->)/);

    if (adoItemsSection) {
      const tableContent = adoItemsSection[1];
      const itemMatches = tableContent.matchAll(/\|\s*#(\d+)\s*\|/g);

      const items = Array.from(itemMatches).map(match => match[1]);

      if (items.length > 0) {
        console.log(`Found ${items.length} items:\n`);
        items.forEach((item, idx) => {
          console.log(`   ${idx + 1}. Bug/Feature #${item}`);
        });
      }
    }

    console.log("");
    console.log("=".repeat(80));
    console.log("");

    // Show the actual ADO items for reference
    console.log("📋 RAW ADO ITEMS TABLE:");
    console.log("-".repeat(80));
    const tableMatch = page.content.match(/\| Items \|Comment \|[\s\S]*?(?=\n\n)/);
    if (tableMatch) {
      console.log(tableMatch[0]);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

getReleaseBugs();
