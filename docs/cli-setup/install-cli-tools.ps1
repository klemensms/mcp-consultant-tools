# =============================================================================
# MCP Consultant Tools — CLI Install/Update Script (Windows PowerShell)
# Installs or updates all CLI tools globally via npm.
# Safe to re-run at any time — idempotent.
#
# Usage:
#   .\install-cli-tools.ps1              # Install/update all tools (@beta)
#   .\install-cli-tools.ps1 -Tag latest  # Install/update all tools (@latest)
#   .\install-cli-tools.ps1 -Check       # Check installed versions only
# =============================================================================

param(
    [string]$Tag = "beta",
    [switch]$Check
)

$ErrorActionPreference = "Continue"

# All packages and their CLI binary names
$Packages = [ordered]@{
    "1password"                   = "mcp-op-cli"
    "application-insights"        = "mcp-appins-cli"
    "azure-b2c"                   = "mcp-azure-b2c-cli"
    "azure-data-factory"          = "mcp-adf-cli"
    "azure-devops"                = "mcp-ado-cli"
    "azure-devops-admin"          = "mcp-ado-admin-cli"
    "azure-management"            = "mcp-azure-mgmt-cli"
    "azure-sql"                   = "mcp-sql-cli"
    "azure-storage"               = "mcp-storage-cli"
    "fabric"                      = "mcp-fabric-cli"
    "audit-cli"                   = "mcp-audit-cli"
    "figma"                       = "mcp-figma-cli"
    "github-enterprise"           = "mcp-ghe-cli"
    "log-analytics"               = "mcp-loganalytics-cli"
    "powerplatform"               = "mcp-pp-cli"
    "powerplatform-customization" = "mcp-pp-custom-cli"
    "powerplatform-data"          = "mcp-pp-data-cli"
    "rest-api"                    = "mcp-rest-api-cli"
    "service-bus"                 = "mcp-sb-cli"
    "sharepoint"                  = "mcp-spo-cli"
    "teams"                       = "mcp-teams-cli"
}

# Check Node.js
$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCheck) {
    Write-Host "ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host "Install it: winget install OpenJS.NodeJS.LTS"
    Write-Host "Or download from https://nodejs.org/"
    exit 1
}

Write-Host "Node.js: $(node --version)"
Write-Host "npm: $(npm --version)"
Write-Host ""

if ($Check) {
    Write-Host "=== Installed CLI Tools ===" -ForegroundColor Cyan
    Write-Host ""
    $installed = 0
    $missing = 0
    foreach ($pkg in $Packages.Keys) {
        $binary = $Packages[$pkg]
        $found = Get-Command $binary -ErrorAction SilentlyContinue
        if ($found) {
            try { $version = & $binary --version 2>$null } catch { $version = "unknown" }
            Write-Host ("  {0,-30} {1,-25} {2}" -f $binary, $pkg, $version)
            $installed++
        } else {
            Write-Host ("  {0,-30} {1,-25} {2}" -f $binary, $pkg, "NOT INSTALLED") -ForegroundColor Yellow
            $missing++
        }
    }
    Write-Host ""
    Write-Host "Installed: $installed / $($installed + $missing)"
    if ($missing -gt 0) {
        Write-Host "Missing: $missing - run this script without -Check to install" -ForegroundColor Yellow
    }
    exit 0
}

Write-Host "=== Installing/Updating MCP CLI Tools (tag: @$Tag) ===" -ForegroundColor Cyan
Write-Host ""

$success = 0
$failed = 0

foreach ($pkg in $Packages.Keys) {
    $fullPkg = "@mcp-consultant-tools/$pkg@$Tag"
    Write-Host -NoNewline ("  {0,-45} " -f $fullPkg)
    $output = npm install -g $fullPkg 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK" -ForegroundColor Green
        $success++
    } else {
        Write-Host "FAILED" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Installed/Updated: $success"
if ($failed -gt 0) {
    Write-Host "Failed: $failed (re-run individual package with npm install -g to debug)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Verify with: .\install-cli-tools.ps1 -Check"
