#!/usr/bin/env node
import { config } from "dotenv";
import { PowerPlatformService } from "../build/PowerPlatformService.js";

config({ debug: false });

console.log("Testing get-plugin-assemblies...\n");

const service = new PowerPlatformService({
  organizationUrl: process.env.POWERPLATFORM_URL,
  clientId: process.env.POWERPLATFORM_CLIENT_ID,
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
  tenantId: process.env.POWERPLATFORM_TENANT_ID
});

async function test() {
  try {
    const result = await service.getPluginAssemblies(false, 10);
    console.log("Success!");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

test();
