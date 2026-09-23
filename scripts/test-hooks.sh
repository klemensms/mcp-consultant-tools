#!/bin/bash
# SOURCE OF TRUTH: mcp-consultant-tools/scripts/test-hooks.sh - mirrored to sibling repos verbatim.
# Test the pre-commit and commit-msg hooks in throwaway git repos. Run after any hook edit.
#
# Usage: ./scripts/test-hooks.sh [src-dir]
#   src-dir holds scripts/ plus the three committed pattern lists (default: this repo).
# Every case builds a fresh repo under mktemp -d, installs the hooks with
# scripts/install-hooks.sh and asserts block or pass. Exit 0 = all cases passed.
#
# Everything here is synthetic: the denylist is written by this script (the private
# .internal-strings.local is never read), the planted secrets are random and generated at
# run time, and the one real-looking endpoint is assembled at run time so this file does
# not trip the endpoint scan itself.
set -u

SRC=$(cd "${1:-$(dirname "$0")/..}" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
unset INTERNAL_LIST PLACEHOLDER_LIST   # the scan library honours these; never let one point at a real list
PASS=0; FAIL=0

PLANTED_NAME=dbPassword   # the variable name every planted secret uses; also the needle in the hook output
ENDPOINT_HOST="widgetco-prod.crm4"

rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c "$1"; }
plant() { printf 'const %s = "%s";\n' "$PLANTED_NAME" "$(rand 24)"; }

DENYLIST_OK='[SUBSTRING]
zebracorp-internal
[WORD]
ZQX9'

new_repo() {
    # $1 = case name. Creates a repo with hooks installed and cd's into it.
    local d="$WORK/$1"
    mkdir -p "$d" && cd "$d" || exit 1
    git init -q
    git config user.email t@example.com; git config user.name t; git config commit.gpgsign false
    git config core.hooksPath .git/hooks
    cp -R "$SRC/scripts" .
    cp "$SRC/.secret-scan-allowlist" "$SRC/.secret-scan-longstr-allowlist" "$SRC/.internal-scan-placeholders" .
    printf '%s\n' "$DENYLIST_OK" > .internal-strings.local
    printf 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\nconst f = 6;\n' > orig.ts
    echo seed > README.md
    git add -A && git commit -q --no-verify -m base
    ./scripts/install-hooks.sh >/dev/null
}

check() {
    # $1 = case name, $2 = block|pass, $3 = substring the hook output must contain ("" = none),
    # then the command to run. A "Broken pipe" anywhere in the output fails the case.
    local name="$1" want="$2" needle="$3" out rc ok=1 why=""
    shift 3
    out=$("$@" 2>&1); rc=$?
    if [ "$want" = block ] && [ $rc -eq 0 ]; then ok=0; why="expected block, hook passed"; fi
    if [ "$want" = pass ] && [ $rc -ne 0 ]; then ok=0; why="expected pass, hook blocked (rc=$rc)"; fi
    if [ $ok -eq 1 ] && [ -n "$needle" ] && ! grep -qF -- "$needle" <<<"$out"; then ok=0; why="output lacks: $needle"; fi
    if [ $ok -eq 1 ] && grep -q 'Broken pipe' <<<"$out"; then ok=0; why="Broken pipe in output"; fi
    if [ $ok -eq 1 ]; then
        PASS=$((PASS+1)); echo "PASS  $name"
    else
        FAIL=$((FAIL+1)); echo "FAIL  $name - $why"
        tail -4 <<<"$out" | sed 's/^/        | /'
    fi
}

commit() { git commit -q -m "test commit" ; }
msg_hook() { printf '%s\n' "$1" > "$WORK/msg.txt"; bash .git/hooks/commit-msg "$WORK/msg.txt"; }

# Break a pattern list: append an invalid ERE, commit it with hooks off, print its line number.
break_list() {
    printf '%s\n' "$2" >> "$1"
    git add "$1" && git commit -q --no-verify -m "break $1"
    wc -l < "$1" | tr -d ' '
}

# ── pre-commit ────────────────────────────────────────────────────────────────
new_repo clean
echo 'export const answer = 42;' > clean.ts; git add clean.ts
check "pre-commit: clean commit passes" pass "No obvious secrets detected" commit

new_repo keyword
plant > cfg.ts; git add cfg.ts
check "pre-commit: keyword-line secret, live allowlists" block "$PLANTED_NAME" commit

new_repo rename
git mv orig.ts renamed.ts
plant >> renamed.ts; git add renamed.ts
if git diff --cached --name-status | grep -q '^R'; then
    check "pre-commit: secret added in a rename-only commit" block "$PLANTED_NAME" commit
else
    FAIL=$((FAIL+1)); echo "FAIL  rename precondition - git did not record a rename"
fi

new_repo large
for i in $(seq 1 5000); do printf 'const v%d = process.env.APP_SECRET_%d; // allowlisted keyword line\n' "$i" "$i"; done > big.ts
plant >> big.ts; git add big.ts
check "pre-commit: large diff (5000 allowlisted keyword lines, secret last)" block "$PLANTED_NAME" commit

new_repo denylist-hit
echo 'const env = "zebracorp-internal";' > a.ts; git add a.ts
check "pre-commit: denylist hit still blocks" block "INTERNAL IDENTIFIER" commit

new_repo endpoint-hit
echo "const url = \"https://$ENDPOINT_HOST.dynamics.com/api\";" > a.ts; git add a.ts
check "pre-commit: real-looking endpoint still blocks" block "REAL-LOOKING INTERNAL ENDPOINT" commit

new_repo endpoint-placeholder
echo 'const url = "https://yourorg.crm.dynamics.com/api";' > a.ts; git add a.ts
check "pre-commit: placeholder endpoint passes" pass "No obvious secrets detected" commit

for spec in \
    ".secret-scan-allowlist|/** broken doc comment" \
    ".secret-scan-allowlist|(unclosed" \
    ".secret-scan-longstr-allowlist|(unclosed" \
    ".internal-scan-placeholders|(unclosed"; do
    file="${spec%%|*}"; bad="${spec#*|}"
    new_repo "pc-invalid-$(echo "$file$bad" | tr -c 'a-z' '-')"
    n=$(break_list "$file" "$bad")
    echo 'export const answer = 42;' > clean.ts; git add clean.ts
    check "pre-commit: invalid ERE '$bad' in $file" block "$file:$n" commit
done

new_repo pc-invalid-substring
printf '[SUBSTRING]\nzebracorp-internal\n(unclosed\n[WORD]\nZQX9\n' > .internal-strings.local
echo 'export const answer = 42;' > clean.ts; git add clean.ts
check "pre-commit: invalid ERE in denylist [SUBSTRING]" block ".internal-strings.local:3" commit

new_repo pc-invalid-word
printf '[SUBSTRING]\nzebracorp-internal\n[WORD]\nZQX9\n(unclosed\n' > .internal-strings.local
echo 'export const answer = 42;' > clean.ts; git add clean.ts
check "pre-commit: invalid ERE in denylist [WORD]" block ".internal-strings.local:5" commit

# ── commit-msg ───────────────────────────────────────────────────────────────
new_repo msg
check "commit-msg: clean message passes" pass "" msg_hook "fix: tidy the readme"
check "commit-msg: long credential-like string blocks" block "long credential-like string" msg_hook "fix: rotate $(rand 40)"
check "commit-msg: denylist hit blocks" block "INTERNAL IDENTIFIER" msg_hook "fix: zebracorp-internal flow"

for spec in \
    ".secret-scan-longstr-allowlist|(unclosed" \
    ".internal-scan-placeholders|(unclosed"; do
    file="${spec%%|*}"; bad="${spec#*|}"
    new_repo "cm-invalid-$(echo "$file" | tr -c 'a-z' '-')"
    n=$(break_list "$file" "$bad")
    check "commit-msg: invalid ERE in $file" block "$file:$n" msg_hook "fix: tidy the readme"
done

new_repo cm-invalid-substring
printf '[SUBSTRING]\nzebracorp-internal\n(unclosed\n[WORD]\nZQX9\n' > .internal-strings.local
check "commit-msg: invalid ERE in denylist [SUBSTRING]" block ".internal-strings.local:3" msg_hook "fix: tidy the readme"

cd /
echo ""
echo "passed $PASS, failed $FAIL"
[ $FAIL -eq 0 ]
