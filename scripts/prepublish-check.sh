#!/usr/bin/env bash
# Refuse to publish anything that is not reviewable, pushed code on a release branch.
# Run immediately before fetching the npm token. Exit 0 = safe to publish.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

branch=$(git rev-parse --abbrev-ref HEAD)
if [[ ! "$branch" =~ ^release/[0-9]+(\.[0-9]+)?$ ]]; then
  echo "❌ Publish refused: on '$branch', not a release/X.Y branch." >&2; exit 1
fi

# .claude/log.md is appended by every session's /log hook, so it never blocks a release.
dirty=$(git status --porcelain --untracked-files=no | grep -v ' \.claude/log\.md$' || true)
if [ -n "$dirty" ]; then
  echo "❌ Publish refused: uncommitted changes to tracked files:" >&2; echo "$dirty" >&2; exit 1
fi

git fetch --quiet origin "$branch"
local_head=$(git rev-parse HEAD)
remote_head=$(git rev-parse "origin/$branch")
if [ "$local_head" != "$remote_head" ]; then
  echo "❌ Publish refused: HEAD ($local_head) does not match origin/$branch ($remote_head). Push first." >&2; exit 1
fi

echo "✅ Pre-publish check passed: $branch at $local_head, clean and pushed."
