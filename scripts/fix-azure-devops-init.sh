#!/bin/bash

# Fix Azure DevOps package service initialization

FILE="packages/azure-devops/src/index.ts"

# Create a temp file with the fixed initialization
cat > /tmp/azdo-init-fix.txt << 'EOF'
  function getAzureDevOpsService(): AzureDevOpsService {
    if (!service) {
      const missingConfig: string[] = [];
      if (!process.env.AZUREDEVOPS_ORGANIZATION) missingConfig.push("AZUREDEVOPS_ORGANIZATION");
      if (!process.env.AZUREDEVOPS_PAT) missingConfig.push("AZUREDEVOPS_PAT");
      if (!process.env.AZUREDEVOPS_PROJECTS) missingConfig.push("AZUREDEVOPS_PROJECTS");

      if (missingConfig.length > 0) {
        throw new Error(
          `Missing required Azure DevOps configuration: ${missingConfig.join(", ")}. ` +
          `Set environment variables for organization, PAT, and allowed projects.`
        );
      }

      const config: AzureDevOpsConfig = {
        organization: process.env.AZUREDEVOPS_ORGANIZATION!,
        pat: process.env.AZUREDEVOPS_PAT!,
        projects: process.env.AZUREDEVOPS_PROJECTS!.split(",").map(p => p.trim()).filter(p => p),
        apiVersion: process.env.AZUREDEVOPS_API_VERSION || "7.1",
        enableWorkItemWrite: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_WRITE === "true",
        enableWorkItemDelete: process.env.AZUREDEVOPS_ENABLE_WORK_ITEM_DELETE === "true",
        enableWikiWrite: process.env.AZUREDEVOPS_ENABLE_WIKI_WRITE === "true",
      };

      service = new AzureDevOpsService(config);
      console.error("Azure DevOps service initialized");
    }

    return service;
  }
EOF

# Use sed to replace the getAzureDevOpsService function
# First, find the line numbers
START_LINE=$(grep -n "function getAzureDevOpsService" "$FILE" | cut -d: -f1)
END_LINE=$(awk -v start="$START_LINE" 'NR > start && /^  }$/ {print NR; exit}' "$FILE")

echo "Replacing lines $START_LINE to $END_LINE in $FILE"

# Create backup
cp "$FILE" "$FILE.bak2"

# Replace the function
{
  head -n $((START_LINE - 1)) "$FILE"
  cat /tmp/azdo-init-fix.txt
  tail -n +$((END_LINE + 1)) "$FILE"
} > "$FILE.tmp"

mv "$FILE.tmp" "$FILE"

echo "✅ Fixed Azure DevOps service initialization"
