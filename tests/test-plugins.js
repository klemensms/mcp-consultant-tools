#!/usr/bin/env node
import { config } from "dotenv";
import { PowerPlatformService } from "../build/PowerPlatformService.js";

// Load environment variables
config();

console.log("Checking for plugin assemblies in your environment...\n");

const service = new PowerPlatformService({
  organizationUrl: process.env.POWERPLATFORM_URL,
  clientId: process.env.POWERPLATFORM_CLIENT_ID,
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
  tenantId: process.env.POWERPLATFORM_TENANT_ID
});

async function findPlugins() {
  try {
    // Query for plugin assemblies
    const assemblies = await service.queryRecords(
      "pluginassemblies",
      "ismanaged eq false",
      10
    );

    if (assemblies.value && assemblies.value.length > 0) {
      console.log(`✓ Found ${assemblies.value.length} custom plugin assemblies:\n`);

      assemblies.value.forEach((assembly, idx) => {
        console.log(`${idx + 1}. ${assembly.name}`);
        console.log(`   Version: ${assembly.version}`);
        console.log(`   Modified: ${assembly.modifiedon}`);
        console.log("");
      });

      console.log("\nYou can test the new tools with these assembly names!");
      console.log("\nExample in MCP Inspector:");
      console.log(`  Tool: get-plugin-assembly-complete`);
      console.log(`  assemblyName: "${assemblies.value[0].name}"`);
      console.log(`  includeDisabled: false`);
    } else {
      console.log("No custom plugin assemblies found in this environment.");
      console.log("The tools are ready but you'll need to deploy a plugin first to test them.");
    }

  } catch (error) {
    console.error("Error:", error.message);
  }
}

findPlugins();
