#!/usr/bin/env node
import { config } from "dotenv";
import { AzureDevOpsService } from "../build/AzureDevOpsService.js";

// Load environment variables
config();

console.log("Testing Azure DevOps Work Items Tools...\n");

const service = new AzureDevOpsService({
  organization: process.env.AZUREDEVOPS_ORGANIZATION,
  pat: process.env.AZUREDEVOPS_PAT,
  projects: (process.env.AZUREDEVOPS_PROJECTS || "").split(",").map(p => p.trim()).filter(p => p),
  apiVersion: process.env.AZUREDEVOPS_API_VERSION || "7.1",
  enableWorkItemWrite: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE === "true",
  enableWorkItemDelete: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE === "true",
});

async function testWorkItemTools() {
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

    // Test 1: Query Work Items
    console.log("TEST 1: Query Work Items (last 10)");
    console.log("-".repeat(40));
    const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType] FROM WorkItems WHERE [System.TeamProject] = '${project}' ORDER BY [System.ChangedDate] DESC`;
    const queryResult = await service.queryWorkItems(project, wiql, 10);

    console.log(`WIQL: ${wiql.substring(0, 80)}...`);
    console.log(`Total Results: ${queryResult.totalCount}`);

    if (queryResult.workItems && queryResult.workItems.length > 0) {
      console.log("\nWork Items:");
      queryResult.workItems.forEach((item, idx) => {
        const fields = item.fields || {};
        console.log(`  ${idx + 1}. #${item.id}: ${fields['System.Title'] || 'Untitled'}`);
        console.log(`     Type: ${fields['System.WorkItemType'] || 'N/A'}`);
        console.log(`     State: ${fields['System.State'] || 'N/A'}`);
        console.log(`     Assigned: ${fields['System.AssignedTo']?.displayName || 'Unassigned'}`);
      });

      // Test 2: Get specific work item with details
      const firstWorkItemId = queryResult.workItems[0].id;
      console.log("");
      console.log("TEST 2: Get Work Item Details");
      console.log("-".repeat(40));
      const workItem = await service.getWorkItem(project, firstWorkItemId);
      const fields = workItem.fields || {};

      console.log(`Work Item #${firstWorkItemId}`);
      console.log(`  Title: ${fields['System.Title'] || 'Untitled'}`);
      console.log(`  Type: ${fields['System.WorkItemType'] || 'N/A'}`);
      console.log(`  State: ${fields['System.State'] || 'N/A'}`);
      console.log(`  Created: ${fields['System.CreatedDate'] || 'N/A'}`);
      console.log(`  Created By: ${fields['System.CreatedBy']?.displayName || 'N/A'}`);
      console.log(`  Assigned To: ${fields['System.AssignedTo']?.displayName || 'Unassigned'}`);
      console.log(`  Area Path: ${fields['System.AreaPath'] || 'N/A'}`);
      console.log(`  Iteration: ${fields['System.IterationPath'] || 'N/A'}`);

      if (fields['System.Tags']) {
        console.log(`  Tags: ${fields['System.Tags']}`);
      }

      if (workItem.relations && workItem.relations.length > 0) {
        console.log(`  Relations: ${workItem.relations.length}`);
      }

      // Test 3: Get work item comments
      console.log("");
      console.log("TEST 3: Get Work Item Comments");
      console.log("-".repeat(40));
      const comments = await service.getWorkItemComments(project, firstWorkItemId);

      console.log(`Work Item #${firstWorkItemId} - Comments: ${comments.totalCount}`);
      if (comments.comments && comments.comments.length > 0) {
        comments.comments.slice(0, 5).forEach((comment, idx) => {
          console.log(`  ${idx + 1}. ${comment.createdBy} - ${new Date(comment.createdDate).toLocaleString()}`);
          const preview = comment.text.substring(0, 80).replace(/\n/g, ' ');
          console.log(`     ${preview}${comment.text.length > 80 ? '...' : ''}`);
        });
        if (comments.comments.length > 5) {
          console.log(`  ... and ${comments.comments.length - 5} more comments`);
        }
      } else {
        console.log(`  No comments found`);
      }

    } else {
      console.log("  No work items found in this project.");
      console.log("  The project may be empty or you may not have access.");
    }

    console.log("");
    console.log("=".repeat(80));

    // Test 4: Query by specific criteria
    console.log("\nTEST 4: Query Active Bugs");
    console.log("-".repeat(40));
    const bugWiql = `SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.TeamProject] = '${project}' AND [System.WorkItemType] = 'Bug' AND [System.State] = 'Active'`;
    const bugResult = await service.queryWorkItems(project, bugWiql, 5);

    console.log(`Total Active Bugs: ${bugResult.totalCount}`);
    if (bugResult.workItems && bugResult.workItems.length > 0) {
      bugResult.workItems.forEach((item, idx) => {
        const fields = item.fields || {};
        console.log(`  ${idx + 1}. #${item.id}: ${fields['System.Title'] || 'Untitled'}`);
      });
    } else {
      console.log("  No active bugs found (this is good!)");
    }

    console.log("");
    console.log("=".repeat(80));
    console.log("✓ Work item tests completed successfully");
    console.log("=".repeat(80));

    // Show write capabilities status
    console.log("\nWrite Operations Status:");
    console.log(`  Create/Update Work Items: ${service['config'].enableWorkItemWrite ? '✓ ENABLED' : '✗ DISABLED'}`);
    console.log(`  Delete Work Items: ${service['config'].enableWorkItemDelete ? '✓ ENABLED' : '✗ DISABLED'}`);
    console.log("\nTo enable write operations, set environment variables:");
    console.log("  AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE=true");
    console.log("  AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE=true");

  } catch (error) {
    console.error("Error:", error.message);
    if (error.message.includes("authentication")) {
      console.error("\nPlease ensure:");
      console.error("  1. AZUREDEVOPS_ORGANIZATION is set correctly");
      console.error("  2. AZUREDEVOPS_PAT is valid and has 'vso.work' scope");
      console.error("  3. AZUREDEVOPS_PROJECTS contains valid project names");
    }
  }
}

testWorkItemTools();
