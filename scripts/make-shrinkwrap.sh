#!/bin/bash
# Generate an npm-shrinkwrap.json for one workspace package, so the published
# tarball pins its whole dependency tree. npm never publishes package-lock.json,
# but it does publish npm-shrinkwrap.json and honours it when users install.
#
# A workspace member cannot produce its own lockfile, so the package.json is
# copied to a temp dir OUTSIDE the repo and resolved there against the public
# registry. That means every internal @mcp-consultant-tools/* dependency must
# already be on npm at its pinned version: run this inside the publish loop,
# in dependency order, right before `npm publish`.
#
# Usage:
#   ./scripts/make-shrinkwrap.sh packages/powerplatform-core           # generate + verify
#   ./scripts/make-shrinkwrap.sh --remove packages/powerplatform-core  # delete after publish
#
# The generated file is gitignored and never committed.
# Exit 0 = shrinkwrap in place and inside the tarball, 1 = failed, 2 = usage error.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

REMOVE=0
if [ "${1:-}" = "--remove" ]; then REMOVE=1; shift; fi

PKG="${1:-}"
if [ -z "$PKG" ]; then
    echo "Usage: $0 [--remove] <package-dir>  (e.g. $0 packages/powerplatform-core)" >&2
    exit 2
fi
ABS_PKG=$(cd "$REPO_ROOT/$PKG" 2>/dev/null && pwd) || ABS_PKG=$(cd "$PKG" 2>/dev/null && pwd) || {
    echo "❌ Package dir not found: $PKG" >&2
    exit 2
}
[ -f "$ABS_PKG/package.json" ] || { echo "❌ No package.json in $ABS_PKG" >&2; exit 2; }

if [ "$REMOVE" = 1 ]; then
    rm -f "$ABS_PKG/npm-shrinkwrap.json"
    echo "🧹 Removed $PKG/npm-shrinkwrap.json"
    exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
case "$TMP" in "$REPO_ROOT"/*) echo "❌ Temp dir is inside the repo: $TMP" >&2; exit 1;; esac

# Consumers never install devDependencies, so leave them (and scripts) out of the tree.
node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
delete p.devDependencies;
delete p.scripts;
fs.writeFileSync(process.argv[2], JSON.stringify(p, null, 2) + "\n");
' "$ABS_PKG/package.json" "$TMP/package.json"

echo "🔒 Resolving $PKG outside the workspace ..."
# A dependency published seconds ago can take a few minutes to appear on the
# registry (npm answers "notarget"), so retry that case for up to 5 minutes.
attempt=0
until (cd "$TMP" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund --prefer-online >"$TMP/install.log" 2>&1); do
    attempt=$((attempt + 1))
    if grep -q 'notarget' "$TMP/install.log" && [ "$attempt" -lt 15 ]; then
        echo "⏳ A dependency of $PKG is not on the registry yet; retrying in 20s ($attempt/15) ..." >&2
        sleep 20
        continue
    fi
    echo "❌ npm install --package-lock-only failed for $PKG (is every internal dependency already on npm?):" >&2
    cat "$TMP/install.log" >&2
    exit 1
done

cp "$TMP/package-lock.json" "$ABS_PKG/npm-shrinkwrap.json"

# Prove it ships: npm always packs npm-shrinkwrap.json, but check the real file list.
FILES=$(cd "$ABS_PKG" && npm pack --dry-run --json --ignore-scripts 2>/dev/null) || {
    echo "❌ npm pack --dry-run failed for $PKG" >&2
    exit 1
}
if ! printf '%s' "$FILES" | node -e '
let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
  const files = JSON.parse(s)[0].files.map(f => f.path);
  process.exit(files.includes("npm-shrinkwrap.json") ? 0 : 1);
});'; then
    echo "❌ npm-shrinkwrap.json is NOT in the $PKG tarball - do not publish." >&2
    exit 1
fi

COUNT=$(node -e 'console.log(Object.keys(require(process.argv[1]).packages).length - 1)' "$ABS_PKG/npm-shrinkwrap.json")
echo "✅ $PKG/npm-shrinkwrap.json written ($COUNT packages pinned) and present in the tarball"
