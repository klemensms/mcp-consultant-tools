#!/usr/bin/env node
import { config } from "dotenv";
import { PowerPlatformService } from "../build/PowerPlatformService.js";

config({ debug: false });

const service = new PowerPlatformService({
  organizationUrl: process.env.POWERPLATFORM_URL,
  clientId: process.env.POWERPLATFORM_CLIENT_ID,
  clientSecret: process.env.POWERPLATFORM_CLIENT_SECRET,
  tenantId: process.env.POWERPLATFORM_TENANT_ID
});

async function debug() {
  try {
    // Query without filtering hidden
    const result = await service.queryRecords("pluginassemblies", "ismanaged eq false", 10);
    console.log("Found assemblies:", result.value.length);
    result.value.forEach(a => {
      console.log(`- ${a.name}: ishidden=${a.ishidden}, ismanaged=${a.ismanaged}`);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

debug();
