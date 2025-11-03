#!/usr/bin/env node
import { config } from "dotenv";
import axios from "axios";

config();

const org = process.env.AZUREDEVOPS_ORGANIZATION;
const pat = process.env.AZUREDEVOPS_PAT;
const authHeader = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;

async function test() {
  console.log("Testing RAW API response...\n");

  const wikiId = "5a23b2eb-0059-44f9-a233-24bc57dd6627";
  const path = "/Release Notes/Release_003 [Online Joining]";
  const url = `https://dev.azure.com/${org}/RTPI/_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(path)}&includeContent=true&api-version=7.1`;

  console.log(`URL: ${url}\n`);

  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    console.log("✅ API Response:");
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error("❌ Failed:", error.response?.data || error.message);
  }
}

test();
