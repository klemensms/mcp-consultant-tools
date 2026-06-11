#!/usr/bin/env node
import { config } from "dotenv";
import { AzureDevOpsService } from "../build/AzureDevOpsService.js";

config();

const service = new AzureDevOpsService({
  organization: process.env.AZUREDEVOPS_ORGANIZATION,
  pat: process.env.AZUREDEVOPS_PAT,
  projects: ["Acme"],
  apiVersion: "7.1",
});

async function test() {
  console.log("Testing with correct display path...\n");

  const wikiId = "00000000-0000-0000-0000-000000000000";
  const correctPath = "/Release Notes/Release_003 [Online Joining]"; // With SPACES!

  try {
    const page = await service.getWikiPage("Acme", wikiId, correctPath, true);

    console.log("✅ SUCCESS!");
    console.log("");
    console.log("Full response:");
    console.log(JSON.stringify(page, null, 2));

  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
}

test();
