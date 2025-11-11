#!/bin/bash

##############################################################################
# publish-all.sh - Publish all MCP Consultant Tools packages to npm
#
# This script publishes all 11 packages in dependency order:
# 1. core (no dependencies)
# 2. service packages (depend on core)
# 3. meta (depends on all services)
#
# Usage:
#   ./scripts/publish-all.sh [--dry-run] [--skip-build]
#
# Options:
#   --dry-run     Simulate publishing without actually publishing
#   --skip-build  Skip the build step (assumes packages are already built)
#
# Prerequisites:
#   - npm login completed (run 'npm login' first)
#   - All packages built (unless --skip-build is used)
#   - Git working directory is clean
#   - You are on the main branch
#
# Environment Variables:
#   NPM_TOKEN     Optional: npm authentication token (alternative to npm login)
#
##############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
DRY_RUN=false
SKIP_BUILD=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $arg${NC}"
      echo "Usage: $0 [--dry-run] [--skip-build]"
      exit 1
      ;;
  esac
done

# Package list in dependency order
PACKAGES=(
  "core"
  "application-insights"
  "azure-devops"
  "azure-sql"
  "figma"
  "github-enterprise"
  "log-analytics"
  "powerplatform"
  "service-bus"
  "sharepoint"
  "meta"
)

##############################################################################
# Helper Functions
##############################################################################

log_info() {
  echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
  echo -e "${GREEN}✅ ${NC}$1"
}

log_warning() {
  echo -e "${YELLOW}⚠️  ${NC}$1"
}

log_error() {
  echo -e "${RED}❌ ${NC}$1"
}

check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check if we're in the project root
  if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
    log_error "This script must be run from the project root directory"
    exit 1
  fi

  # Check npm login status (unless NPM_TOKEN is set)
  if [ -z "${NPM_TOKEN:-}" ]; then
    if ! npm whoami &> /dev/null; then
      log_error "You are not logged in to npm. Run 'npm login' first."
      exit 1
    fi
    log_success "npm login verified ($(npm whoami))"
  else
    log_info "Using NPM_TOKEN from environment"
  fi

  # Check git status
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    log_warning "Git working directory has uncommitted changes"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      log_error "Aborted by user"
      exit 1
    fi
  fi

  # Check current branch
  CURRENT_BRANCH=$(git branch --show-current)
  if [ "$CURRENT_BRANCH" != "main" ]; then
    log_warning "You are on branch '$CURRENT_BRANCH', not 'main'"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      log_error "Aborted by user"
      exit 1
    fi
  fi

  log_success "Prerequisites check passed"
}

build_packages() {
  if [ "$SKIP_BUILD" = true ]; then
    log_warning "Skipping build step (--skip-build flag)"
    return
  fi

  log_info "Building all packages..."
  npm run build

  # Verify build outputs
  for pkg in "${PACKAGES[@]}"; do
    if [ ! -d "packages/$pkg/build" ]; then
      log_error "Build directory not found for package: $pkg"
      exit 1
    fi
  done

  log_success "All packages built successfully"
}

get_package_version() {
  local pkg=$1
  local pkg_json="packages/$pkg/package.json"

  if [ ! -f "$pkg_json" ]; then
    log_error "package.json not found: $pkg_json"
    exit 1
  fi

  node -p "require('./$pkg_json').version"
}

get_package_name() {
  local pkg=$1
  local pkg_json="packages/$pkg/package.json"

  if [ "$pkg" = "meta" ]; then
    echo "mcp-consultant-tools"
  else
    echo "@mcp-consultant-tools/$pkg"
  fi
}

check_if_published() {
  local pkg_name=$1
  local version=$2

  # Check if version already exists on npm
  if npm view "$pkg_name@$version" version &> /dev/null; then
    return 0  # Already published
  else
    return 1  # Not published
  fi
}

publish_package() {
  local pkg=$1
  local pkg_name=$(get_package_name "$pkg")
  local version=$(get_package_version "$pkg")

  log_info "Publishing $pkg_name@$version..."

  # Check if already published
  if check_if_published "$pkg_name" "$version"; then
    log_warning "$pkg_name@$version is already published on npm"
    read -p "Skip this package? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      log_info "Skipping $pkg_name"
      return
    fi
  fi

  cd "packages/$pkg"

  if [ "$DRY_RUN" = true ]; then
    log_info "[DRY RUN] Would publish: $pkg_name@$version"
    npm publish --access public --dry-run
  else
    npm publish --access public

    # Verify publication
    sleep 2  # Give npm registry a moment to update
    if npm view "$pkg_name@$version" version &> /dev/null; then
      log_success "$pkg_name@$version published successfully"
    else
      log_error "Failed to verify publication of $pkg_name@$version"
      exit 1
    fi
  fi

  cd ../..
}

##############################################################################
# Main Script
##############################################################################

main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║     MCP Consultant Tools - Publish All Packages (v15)         ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""

  if [ "$DRY_RUN" = true ]; then
    log_warning "DRY RUN MODE - No packages will be published"
  fi

  check_prerequisites
  build_packages

  echo ""
  log_info "Publishing packages in dependency order..."
  echo ""

  # Publish packages
  local success_count=0
  local skip_count=0

  for pkg in "${PACKAGES[@]}"; do
    publish_package "$pkg"
    ((success_count++))
  done

  echo ""
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                      Publishing Complete!                      ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""

  if [ "$DRY_RUN" = false ]; then
    log_success "$success_count packages published successfully"
    echo ""
    log_info "Verify at: https://www.npmjs.com/org/mcp-consultant-tools"
    echo ""
    log_info "Next steps:"
    echo "  1. Create GitHub release: gh release create v15.0.0"
    echo "  2. Update CHANGELOG.md"
    echo "  3. Announce the release"
  else
    log_info "DRY RUN completed - no packages were actually published"
  fi

  echo ""
}

# Run main function
main

exit 0
