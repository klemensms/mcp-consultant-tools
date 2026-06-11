# =============================================================================
# Create Azure AD App Registration for MCP Teams Integration
# Run this as an Azure AD admin
# =============================================================================

# Variables - customize if needed
$appName = "MCP Teams Integration"

Write-Host "Creating app registration: $appName" -ForegroundColor Cyan

# Create the app registration
$app = az ad app create `
    --display-name $appName `
    --sign-in-audience "AzureADMyOrg" `
    --enable-id-token-issuance false `
    --enable-access-token-issuance false `
    --is-fallback-public-client true `
    --output json | ConvertFrom-Json

$clientId = $app.appId
Write-Host "App created with Client ID: $clientId" -ForegroundColor Green

# Microsoft Graph API ID
$graphApiId = "00000003-0000-0000-c000-000000000000"

# Required delegated permissions (scope IDs for Microsoft Graph)
# User.Read
$userRead = "e1fe6dd8-ba31-4d61-89e7-88639da4683d"
# Team.ReadBasic.All
$teamReadBasicAll = "485be79e-c497-4b35-9400-0e3fa7f2a5d4"
# Channel.ReadBasic.All
$channelReadBasicAll = "9d8982ae-4365-4f57-95e9-d6032a4c0b87"
# ChannelMessage.Send
$channelMessageSend = "ebf0f66e-9fb1-49e4-a278-222f76911cf4"
# Group.Read.All
$groupReadAll = "5f8c59db-677d-491f-a6b8-5f174b11ec1d"

Write-Host "Adding API permissions..." -ForegroundColor Cyan

# Add permissions
az ad app permission add `
    --id $clientId `
    --api $graphApiId `
    --api-permissions "$userRead=Scope $teamReadBasicAll=Scope $channelReadBasicAll=Scope $channelMessageSend=Scope $groupReadAll=Scope"

Write-Host "Granting admin consent..." -ForegroundColor Cyan

# Grant admin consent (requires admin privileges)
az ad app permission admin-consent --id $clientId

# Get tenant ID
$tenantId = az account show --query tenantId -o tsv

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "App Registration Complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Add these to your MCP configuration:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  TEAMS_TENANT_ID=$tenantId"
Write-Host "  TEAMS_CLIENT_ID=$clientId"
Write-Host ""
Write-Host "Or for claude_desktop_config.json:" -ForegroundColor Yellow
Write-Host ""
Write-Host @"
{
  "mcpServers": {
    "teams": {
      "command": "npx",
      "args": ["-y", "@mcp-consultant-tools/teams@beta"],
      "env": {
        "TEAMS_TENANT_ID": "$tenantId",
        "TEAMS_CLIENT_ID": "$clientId"
      }
    }
  }
}
"@
