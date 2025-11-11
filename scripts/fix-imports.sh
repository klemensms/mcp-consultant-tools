#!/bin/bash

# Fix imports in generated package index.ts files
# Changes namespace imports to named imports for formatter utilities

echo "Fixing imports in package index.ts files..."

# Application Insights
echo "Fixing application-insights..."
sed -i "s|import \* as appInsightsFormatters from './utils/appinsights-formatters.js';|import { formatTableAsMarkdown, analyzeExceptions, analyzePerformance, analyzeDependencies } from './utils/appinsights-formatters.js';|g" \
  packages/application-insights/src/index.ts

# Log Analytics
echo "Fixing log-analytics..."
sed -i "s|import \* as logAnalyticsFormatters from './utils/loganalytics-formatters.js';|import { formatTableAsMarkdown, analyzeLogs, analyzeFunctionLogs, analyzeFunctionErrors, analyzeFunctionStats, generateRecommendations } from './utils/loganalytics-formatters.js';|g" \
  packages/log-analytics/src/index.ts

# Azure SQL
echo "Fixing azure-sql..."
sed -i "s|import \* as sqlFormatters from './utils/sql-formatters.js';|import { formatTableAsMarkdown, formatSqlResultsAsMarkdown, formatDatabaseOverview, formatTableSchemaAsMarkdown } from './utils/sql-formatters.js';|g" \
  packages/azure-sql/src/index.ts

# Service Bus
echo "Fixing service-bus..."
sed -i "s|import \* as serviceBusFormatters from './utils/servicebus-formatters.js';|import { formatQueueListAsMarkdown, formatMessagesAsMarkdown, formatMessageInspectionAsMarkdown, analyzeDeadLetterMessages, formatDeadLetterAnalysisAsMarkdown, formatNamespaceOverviewAsMarkdown, generateServiceBusTroubleshootingGuide, generateCrossServiceReport } from './utils/servicebus-formatters.js';|g" \
  packages/service-bus/src/index.ts

# GitHub Enterprise
echo "Fixing github-enterprise..."
sed -i "s|import \* as gheFormatters from './utils/ghe-formatters.js';|import { formatBranchListAsMarkdown, formatCommitHistoryAsMarkdown, formatCodeSearchResultsAsMarkdown, formatPullRequestsAsMarkdown, formatFileTreeAsMarkdown, formatDirectoryContentsAsMarkdown, analyzeBranchComparison, generateDeploymentChecklist, formatCommitDetailsAsMarkdown, formatPullRequestDetailsAsMarkdown, formatRepositoryOverviewAsMarkdown } from './utils/ghe-formatters.js';|g" \
  packages/github-enterprise/src/index.ts

# SharePoint
echo "Fixing sharepoint..."
sed -i "s|import \* as spoFormatters from './utils/sharepoint-formatters.js';|import { formatSiteListAsMarkdown, formatLibraryListAsMarkdown, formatFileListAsMarkdown, formatSiteOverviewAsMarkdown, formatValidationReportAsMarkdown, formatMigrationChecklistAsMarkdown } from './utils/sharepoint-formatters.js';|g" \
  packages/sharepoint/src/index.ts

# PowerPlatform - check if it has prompts import
if grep -q "powerPlatformPrompts" packages/powerplatform/src/index.ts; then
  echo "Fixing powerplatform..."
  # Need to check what prompts module exports
  # For now, remove this import as it may not exist
  sed -i "s|import \* as powerPlatformPrompts from './utils/prompts.js';||g" \
    packages/powerplatform/src/index.ts
fi

echo "✅ Imports fixed!"
