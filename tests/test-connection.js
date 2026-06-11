#!/usr/bin/env node
import { config } from "dotenv";
import { PowerPlatformService } from "../build/PowerPlatformService.js";

// Load environment variables
config();

console.log("Testing PowerPlatform MCP Connection...\n");

// Check if credentials are set
const required = {
  "POWERPLATFORM_URL": process.env.POWERPLATFORM_URL,
  "POWERPLATFORM_CLIENT_ID": process.env.POWERPLATFORM_CLIENT_ID,
  "POWERPLATFORM_CLIENT_SECRET": process.env.POWERPLATFORM_CLIENT_SECRET,
  "POWERPLATFORM_TENANT_ID": process.env.POWERPLATFORM_TENANT_ID
};

let missingVars = [];
for (const [key, value] of Object.entries(required)) {
  if (!value) {
    missingVars.push(key);
  }
}

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error("\nPlease update your .env file with these values.");
  process.exit(1);
}

console.log("✓ Environment variables loaded");
console.log(`✓ Organization URL: ${process.env.POWERPLATFORM_URL}\n`);

// Initialize service
const service = new PowerPlatformService({
  organizationUrl: process.env.POWERPLATFORM_URL,
  clientId: process.env.POWERPLATFORM_CLIENT_ID,
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
  tenantId: process.env.POWERPLATFORM_TENANT_ID
});

console.log("Testing connection with simple queries...\n");

async function runTests() {
  try {
    // Test 1: Get Account entity metadata
    console.log("Test 1: Getting Account entity metadata...");
    const accountMetadata = await service.getEntityMetadata("account");
    console.log(`✓ Success! Account entity found`);
    console.log(`  - Display Name: ${accountMetadata.DisplayName?.UserLocalizedLabel?.Label}`);
    console.log(`  - Primary Key: ${accountMetadata.PrimaryIdAttribute}`);
    console.log(`  - Primary Name: ${accountMetadata.PrimaryNameAttribute}\n`);

    // Test 2: Get Account attributes
    console.log("Test 2: Getting Account entity attributes...");
    const attributes = await service.getEntityAttributes("account");
    console.log(`✓ Success! Found ${attributes.value.length} attributes`);
    console.log(`  - Sample attributes: ${attributes.value.slice(0, 5).map(a => a.LogicalName).join(', ')}\n`);

    // Test 3: Query a few account records
    console.log("Test 3: Querying account records (top 3)...");
    const records = await service.queryRecords("accounts", "statecode eq 0", 3);
    console.log(`✓ Success! Found ${records.value?.length || 0} active accounts`);
    if (records.value && records.value.length > 0) {
      records.value.forEach((record, idx) => {
        console.log(`  ${idx + 1}. ${record.name || '(no name)'} (ID: ${record.accountid})`);
      });
    }
    console.log("");

    // Test 4: Get relationships
    console.log("Test 4: Getting Account entity relationships...");
    const relationships = await service.getEntityRelationships("account");
    console.log(`✓ Success!`);
    console.log(`  - One-to-Many: ${relationships.oneToMany.value.length}`);
    console.log(`  - Many-to-Many: ${relationships.manyToMany.value.length}\n`);

    console.log("🎉 All tests passed! Your MCP server is ready to use.\n");
    console.log("Next steps:");
    console.log("1. Run the MCP server with: npm start");
    console.log("2. Or test with MCP Inspector");
    console.log("3. Or configure in Claude Desktop/Cursor\n");

  } catch (error) {
    console.error("❌ Test failed:");
    console.error(error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    process.exit(1);
  }
}

runTests();
