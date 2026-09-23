# Brief: make the pre-commit and commit-msg scans fail closed

**Monitor:** session `mcp-consultant-tools-07` (tab `🔭 monitor · m365-mcp (07)`). Report to it by name with `SendMessage`. Another session (`m365-build`) is committing in this same working tree: stage only your own paths, never `git add -A`, never stage `.claude/log.md`.

**Your tab label:** `hook-fix · <what you are doing>`.

## The defect (confirmed by a read-only investigation, 2026-09-23)

The secret-keyword scan in `scripts/hooks/pre-commit` has been silently off on macOS since commit `8d748cb` (2026-08-24).

- `.secret-scan-allowlist` line 436 reads `/** Password recipe types - discriminated union`. BSD grep (macOS) rejects `**` as an invalid ERE and exits 2; GNU grep accepts it.
- `filter_allowlist()` (pre-commit around line 35) runs `grep -vEf <(...) 2>/dev/null || true`, so the exit 2 is hidden and swallowed, the filter emits nothing, `KEYWORD_HITS` is always empty, and the hook reports "No obvious secrets detected".
- The intermittent `grep: stdout: Broken pipe` is the upstream `grep -v "SECRET_PATTERNS"` (around line 47) writing into the dead filter on large diffs.
- The same fail-open shape exists wherever a list is fed to `grep -Ef` with errors swallowed: `_placeholder_filter` and the `hits=$(...)` lines in `scripts/internal-scan-lib.sh`, and `scripts/hooks/commit-msg` around line 34. An invalid line in any list switches off the whole list.
- Separately, `STAGED_FILES` uses `--diff-filter=ACM`, so a commit that only renames a file (and adds a secret to it) skips the scan with exit 0.

Reproductions, including a synthetic credential that passes today, are in the investigation's scratch repos: `/private/tmp/claude-501/-Users-klemensstelk-repo-klemensms-github-mcp-consultant-tools/2dbe68e4-52fd-481c-b2fa-296b1780769b/scratchpad/hooktest`. Read them; do not rerun anything against the real repo that would commit.

## What to do

1. **Test first**, in a throwaway `git init` repo under your own scratchpad (never in this repo): a script that installs the hooks from `scripts/` and asserts, for each case, that the commit is **blocked**: a keyword-line secret with the live allowlists; a secret added in a rename-only commit; an allowlist, placeholder list or denylist section containing an invalid ERE (the hook must stop with an error naming the file and line, not pass); and a large diff that previously produced the broken pipe. Also assert a clean commit still passes. Confirm the tests fail on the current hooks.
2. **Fix**, minimal:
   - Escape or remove the `/**` in `.secret-scan-allowlist` line 436 (a literal match on that doc comment is what it was for).
   - At the top of each hook, before any pipeline, validate every pattern list it will use (`grep -Ef <list-without-comments> </dev/null`; exit status 2 means invalid) and exit 1 with the file and the offending line. A check inside `$(...)` cannot block the commit, so it must run in the hook's own shell.
   - Remove `2>/dev/null || true` from the list-driven greps; treat exit 0 and 1 as normal and 2 as fatal.
   - `--diff-filter=ACMR`.
   - Where a producer is piped into a reader that can stop early, capture the producer into a variable first (root `~/.claude/CLAUDE.md` coding principle 6 explains why pipefail guards invert).
3. Run your test script green, then run the real hooks once on a no-op staged change in this repo to prove they still pass a clean commit here.
4. **Re-check history**: scan the diffs of every commit since `8d748cb` with the fixed hook logic and list any keyword hit that is a credential-shaped value. The investigation found 105 keyword lines and no credential-shaped values; confirm or refute. If anything real turns up, stop and tell the monitor at once (it becomes a rotation, not a code fix). Never print a suspected secret; describe its location only.
5. Mirror note: these files are copied verbatim to the sibling repo `mcp-computer-use`, which is not checked out here. Add a dated line to the root `CLAUDE.md` "Unmirrored divergence" note saying this fix must be applied there too.
6. Commit (`fix(hooks): fail closed on invalid pattern lists and scan renamed files`), push to `origin release/35.0`, `/log`, report to the monitor with the commit hash, then print the closing block from the `monitoring-sessions` skill, closeable line last.

## Session banner (print once after reading this brief)

```
=== SESSION: hook-fix ===
Purpose:   make the repo's pre-commit secret and internal-identifier scans fail closed instead of silently passing.
Goal:      tested fix committed and pushed today; history since 2026-08-24 re-checked for missed secrets.
For you:   nothing unless the history re-check finds a real secret, which the monitor would raise with you.
Not here:  the Outlook / SharePoint build (tab m365-build) and the sibling repo's copy of the hooks.
Monitor:   mcp-consultant-tools-07; brief .claude/briefs/2026-09-23-pre-commit-fail-open-fix.md
```
