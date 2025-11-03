# Examples

This folder contains example scripts demonstrating how to use the PowerPlatform MCP service.

## Available Examples

### Azure DevOps Wiki Examples

#### get-release-bugs.js
Demonstrates how to:
- Retrieve a specific wiki page by path
- Extract structured data from wiki content (ADO items/bugs)
- Parse markdown tables
- Display deployment status

**Usage:**
```bash
node examples/get-release-bugs.js
```

**Output:**
```
RELEASE_003 [ONLINE JOINING]
📅 DEPLOYMENT STATUS:
   UAT:  20/10/25 - Deployed
   PROD: 22/10/25 - Planned

🐛 INCLUDED ADO ITEMS:
   1. Bug/Feature #60874
   2. Bug/Feature #68042
   ...
```

#### list-all-wiki-pages.js
Demonstrates how to:
- Get all wikis in a project
- Recursively list all pages in a wiki
- Display wiki structure

**Usage:**
```bash
node examples/list-all-wiki-pages.js
```

## Creating Your Own Examples

1. Import the service:
```javascript
import { AzureDevOpsService } from "../build/AzureDevOpsService.js";
```

2. Configure with environment variables:
```javascript
import { config } from "dotenv";
config();

const service = new AzureDevOpsService({
  organization: process.env.AZUREDEVOPS_ORGANIZATION,
  pat: process.env.AZUREDEVOPS_PAT,
  projects: ["YourProject"],
  apiVersion: "7.1",
});
```

3. Use the service methods:
```javascript
const results = await service.searchWikiPages("search term", "ProjectName");
const page = await service.getWikiPage("ProjectName", wikiId, pagePath, true);
```

## Requirements

- Environment variables configured in `.env`
- Built project: `npm run build`
- Valid Azure DevOps PAT with wiki and search permissions

See [../.env.example](../.env.example) for configuration details.
