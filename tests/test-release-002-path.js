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

async function testRelease002() {
  const wikiId = "5a23b2eb-0059-44f9-a233-24bc57dd6627";

  // The search shows: /Release-Notes/Release_002-[Online-Joining]-%2D-Go%2DLive-Check-List.md
  // But the actual path format should probably be with spaces like Release_003

  const pathVariations = [
    "/Release Notes/Release_002 [Online Joining]",
    "/Release Notes/Release_002 [Online Joining] - Go-Live Check List",
    "/Release Notes/Release_002-[Online-Joining]---Go-Live-Check-List",
    "/Release Notes/Release_002 [Online-Joining] - Go-Live Check List",
  ];

  for (const path of pathVariations) {
    console.log(`Trying: "${path}"`);
    try {
      const page = await service.getWikiPage("RTPI", wikiId, path, false);
      console.log(`  ✓ SUCCESS! Git path: ${page.gitItemPath}`);

      // Now get with content
      const pageWithContent = await service.getWikiPage("RTPI", wikiId, path, true);
      console.log(`  Content length: ${pageWithContent.content.length} chars`);
      console.log(`  First 200 chars: ${pageWithContent.content.substring(0, 200)}`);
      break;
    } catch (error) {
      console.log(`  ✗ Failed: ${error.message.split('.')[0]}`);
    }
  }
}

testRelease002();
