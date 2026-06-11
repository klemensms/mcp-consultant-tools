#!/usr/bin/env bash
# =============================================================================
# MCP Consultant Tools — CLI Install/Update Script
# Installs or updates all CLI tools globally via npm.
# Safe to re-run at any time — idempotent.
#
# Compatible with Bash 3.2+ (macOS default) and Bash 4+/5+.
#
# Usage:
#   bash install-cli-tools.sh           # Install/update all tools (@beta)
#   bash install-cli-tools.sh --latest  # Install/update all tools (@latest)
#   bash install-cli-tools.sh --check   # Check installed versions only
# =============================================================================

set -euo pipefail

TAG="${1:-@beta}"

if [[ "$TAG" == "--check" ]]; then
  CHECK_ONLY=true
  TAG="@beta"
elif [[ "$TAG" == "--latest" ]]; then
  TAG="@latest"
  CHECK_ONLY=false
else
  CHECK_ONLY=false
  if [[ "$TAG" != @* ]]; then
    TAG="@beta"
  fi
fi

# All packages and their CLI binary names (Bash 3.2-compatible — no associative arrays)
# Format: "package-name:binary-name"
PACKAGES="
1password:mcp-op-cli
application-insights:mcp-appins-cli
azure-b2c:mcp-azure-b2c-cli
azure-data-factory:mcp-adf-cli
azure-devops:mcp-ado-cli
azure-devops-admin:mcp-ado-admin-cli
azure-management:mcp-azure-mgmt-cli
azure-sql:mcp-sql-cli
azure-storage:mcp-storage-cli
fabric:mcp-fabric-cli
audit-cli:mcp-audit-cli
figma:mcp-figma-cli
github-enterprise:mcp-ghe-cli
log-analytics:mcp-loganalytics-cli
powerplatform:mcp-pp-cli
powerplatform-customization:mcp-pp-custom-cli
powerplatform-data:mcp-pp-data-cli
rest-api:mcp-rest-api-cli
service-bus:mcp-sb-cli
sharepoint:mcp-spo-cli
teams:mcp-teams-cli
"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed."
  echo "Install it from https://nodejs.org/ (LTS recommended)"
  echo "  macOS: brew install node"
  echo "  Windows: winget install OpenJS.NodeJS.LTS"
  exit 1
fi

NODE_VERSION=$(node --version)
echo "Node.js: $NODE_VERSION"
echo "npm: $(npm --version)"
echo ""

if $CHECK_ONLY; then
  echo "=== Installed CLI Tools ==="
  echo ""
  INSTALLED=0
  MISSING=0
  for entry in $PACKAGES; do
    pkg="${entry%%:*}"
    binary="${entry##*:}"
    if command -v "$binary" &> /dev/null; then
      version=$("$binary" --version 2>/dev/null || echo "unknown")
      printf "  %-30s %-25s %s\n" "$binary" "$pkg" "$version"
      INSTALLED=$((INSTALLED + 1))
    else
      printf "  %-30s %-25s %s\n" "$binary" "$pkg" "NOT INSTALLED"
      MISSING=$((MISSING + 1))
    fi
  done
  echo ""
  echo "Installed: $INSTALLED / $((INSTALLED + MISSING))"
  if [[ $MISSING -gt 0 ]]; then
    echo "Missing: $MISSING — run this script without --check to install"
  fi
  exit 0
fi

echo "=== Installing/Updating MCP CLI Tools (tag: $TAG) ==="
echo ""

SUCCESS=0
FAILED=0

for entry in $PACKAGES; do
  pkg="${entry%%:*}"
  binary="${entry##*:}"
  FULL_PKG="@mcp-consultant-tools/${pkg}${TAG}"
  printf "  %-55s " "$FULL_PKG"
  if npm install -g "$FULL_PKG" &> /dev/null; then
    echo "OK"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "FAILED"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "=== Done ==="
echo "Installed/Updated: $SUCCESS"
if [[ $FAILED -gt 0 ]]; then
  echo "Failed: $FAILED (re-run with verbose: npm install -g <package> to debug)"
fi
echo ""
echo "Verify with: bash $0 --check"
