#!/usr/bin/env node
import { config } from "dotenv";
import axios from "axios";

config();

const org = process.env.AZUREDEVOPS_ORGANIZATION;
const pat = process.env.AZUREDEVOPS_PAT;
const project = "RTPI";
const apiVersion = "7.1";

const authHeader = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;

async function listAllWikiPages() {
  try {
    console.log("=".repeat(80));
    console.log("LISTING ALL WIKI PAGES");
    console.log("=".repeat(80));
    console.log("");

    // Get wiki
    const wikiUrl = `https://dev.azure.com/${org}/${project}/_apis/wiki/wikis/RTPI.Crm.wiki?api-version=${apiVersion}`;
    const wikiResponse = await axios({
      method: 'GET',
      url: wikiUrl,
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    console.log(`Wiki: ${wikiResponse.data.name}`);
    console.log(`ID: ${wikiResponse.data.id}`);
    console.log("");

    // List all pages recursively
    const pagesUrl = `https://dev.azure.com/${org}/${project}/_apis/wiki/wikis/${wikiResponse.data.id}/pages?recursionLevel=full&api-version=${apiVersion}`;

    console.log("Fetching all pages...");
    const pagesResponse = await axios({
      method: 'GET',
      url: pagesUrl,
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    console.log("");
    console.log("=".repeat(80));
    console.log("ALL PAGES IN WIKI:");
    console.log("=".repeat(80));
    console.log("");

    function printPages(page, indent = 0) {
      const prefix = "  ".repeat(indent);
      console.log(`${prefix}📄 ${page.path || '(root)'}`);
      if (page.gitItemPath) {
        console.log(`${prefix}   Git: ${page.gitItemPath}`);
      }
      if (page.id) {
        console.log(`${prefix}   ID: ${page.id}`);
      }

      if (page.subPages && page.subPages.length > 0) {
        page.subPages.forEach(subPage => printPages(subPage, indent + 1));
      }
    }

    if (pagesResponse.data.page) {
      printPages(pagesResponse.data.page);
    } else {
      console.log("No pages found or unexpected response structure");
      console.log(JSON.stringify(pagesResponse.data, null, 2));
    }

    console.log("");
    console.log("=".repeat(80));

    // Now search for release notes specifically
    console.log("");
    console.log("SEARCHING FOR RELEASE NOTE PAGES:");
    console.log("=".repeat(80));
    console.log("");

    function findReleaseNotes(page, results = []) {
      if (page.path && page.path.toLowerCase().includes('release')) {
        results.push({
          path: page.path,
          gitItemPath: page.gitItemPath,
          id: page.id
        });
      }

      if (page.subPages && page.subPages.length > 0) {
        page.subPages.forEach(subPage => findReleaseNotes(subPage, results));
      }

      return results;
    }

    const releasePages = findReleaseNotes(pagesResponse.data.page);

    if (releasePages.length > 0) {
      console.log(`Found ${releasePages.length} release-related pages:`);
      releasePages.forEach((page, idx) => {
        console.log(`  ${idx + 1}. ${page.path}`);
        console.log(`     Git: ${page.gitItemPath}`);
        console.log(`     ID: ${page.id}`);
        console.log("");
      });

      // Try to get one of them by ID instead of path
      if (releasePages.length > 0) {
        const testPage = releasePages[0];
        console.log("=".repeat(80));
        console.log("TRYING TO GET PAGE BY ID (not path):");
        console.log("=".repeat(80));
        console.log("");
        console.log(`Page ID: ${testPage.id}`);

        try {
          const pageByIdUrl = `https://dev.azure.com/${org}/${project}/_apis/wiki/wikis/${wikiResponse.data.id}/pages/${testPage.id}?includeContent=true&api-version=${apiVersion}`;
          const pageContent = await axios({
            method: 'GET',
            url: pageByIdUrl,
            headers: {
              'Authorization': authHeader,
              'Accept': 'application/json'
            }
          });

          console.log("✓ SUCCESS! Got page by ID");
          console.log(`Content length: ${pageContent.data.content ? pageContent.data.content.length : 0} characters`);
          if (pageContent.data.content) {
            console.log(`Preview: ${pageContent.data.content.substring(0, 200)}...`);
          }
        } catch (error) {
          console.log(`✗ Failed to get by ID: ${error.response?.data?.message || error.message}`);
        }
      }
    } else {
      console.log("No release-related pages found");
    }

  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

listAllWikiPages();
