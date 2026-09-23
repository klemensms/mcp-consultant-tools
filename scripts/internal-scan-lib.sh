#!/bin/bash
# SOURCE OF TRUTH: mcp-consultant-tools/scripts/internal-scan-lib.sh - mirrored to sibling repos verbatim.
# Shared internal-identifier scanning functions.
# Consumers: scripts/hooks/pre-commit, scripts/hooks/commit-msg, scripts/scan-tarball.sh
#
# This is a PUBLIC repo developed against internal client projects. Secrets are not the
# only leak class - client identifiers (org names, environment URLs, file keys, work-item
# IDs) must never be committed either. Two pattern sources:
#
#   1. .internal-strings.local (repo root) - PRIVATE denylist of known client/internal
#      identifiers. Untracked by design (gitignored via *.local); restore it from the
#      private claude-config repo if missing. Sections:
#        [SUBSTRING] - extended regex, matched case-insensitively anywhere
#        [WORD]      - whole-word match, case-sensitive (for short codes)
#      Denylist hits are NEVER false positives - do not bypass.
#
#   2. .internal-scan-placeholders (repo root, committed) - sanctioned placeholder tokens.
#      Endpoint-heuristic hits containing one of these tokens are allowed.

INTERNAL_LIST="${INTERNAL_LIST:-$REPO_ROOT/.internal-strings.local}"
PLACEHOLDER_LIST="${PLACEHOLDER_LIST:-$REPO_ROOT/.internal-scan-placeholders}"

# Real-looking internal endpoints (committable heuristics - work even without the private list)
ENDPOINT_PATTERNS='([a-z0-9-]+\.crm[0-9]*\.dynamics\.com|dev\.azure\.com/[A-Za-z0-9_-]+|[a-z0-9-]+\.sharepoint\.com|figma\.com/(board|file|design)/[A-Za-z0-9]{20,24}|[a-z0-9-]+\.b2clogin\.com|[a-z0-9-]+\.servicebus\.windows\.net|[a-z0-9-]+\.azurewebsites\.net)'

_internal_section() {
    # $1 = list file, $2 = section name → prints that section's patterns
    awk -v sec="[$2]" '$0==sec{on=1;next} /^\[/{on=0} on && !/^#/ && NF {print}' "$1"
}

_placeholder_filter() {
    # stdin (one extracted endpoint per line) → stdout, dropping lines matching a
    # sanctioned placeholder pattern (extended regex, case-insensitive, anchorable).
    # Exit status is grep's: 0 = lines remain, 1 = none remain, 2 = grep failed.
    if [ -f "$PLACEHOLDER_LIST" ]; then
        grep -viE -f <(grep -v '^#' "$PLACEHOLDER_LIST" | grep -v '^$')
    else
        cat
    fi
}

grep_ok() {
    # $1 = a grep exit status, $2 = what was being scanned. grep exits 0 on a match and 1
    # on none, and both are normal. 2 means grep failed and the scan did not run, which
    # must block rather than pass: print why and return 1.
    [ "$1" -le 1 ] && return 0
    echo "❌ ERROR: the scan of $2 failed (grep exit $1), so it did not run."
    return 1
}

_numbered_patterns() {
    # $1 = list file, $2 = optional section → "line<TAB>pattern" for every pattern a scan
    # reads from it, using the same comment and blank-line rules as the scans themselves
    if [ -n "${2:-}" ]; then
        awk -v sec="[$2]" '$0==sec{on=1;next} /^\[/{on=0} on && !/^#/ && NF {print NR "\t" $0}' "$1"
    else
        awk '!/^#/ && length($0) {print NR "\t" $0}' "$1"
    fi
}

check_pattern_list() {
    # $1 = pattern list file, $2 = optional [SECTION] name. grep exits 2 on an invalid
    # pattern, and a scan fed that list then matches nothing, so one bad line switches
    # off the whole list and the scan passes. Prints file:line for each invalid pattern
    # and returns 1. Call it in the script's own shell, never inside $(...), so the
    # caller can stop. The pattern itself is not printed: denylist entries are private.
    local file="$1" section="${2:-}" n pat rc bad=0
    [ -f "$file" ] || return 0
    rc=0
    grep -Ef <(_numbered_patterns "$file" "$section" | cut -f2-) </dev/null >/dev/null 2>&1 || rc=$?
    [ $rc -le 1 ] && return 0
    while IFS=$'\t' read -r n pat; do
        rc=0
        grep -Ee "$pat" </dev/null >/dev/null 2>&1 || rc=$?
        if [ $rc -gt 1 ]; then
            echo "❌ ERROR: invalid regex at $file:$n${section:+ ([$section])}"
            bad=1
        fi
    done < <(_numbered_patterns "$file" "$section")
    [ $bad -eq 1 ] || echo "❌ ERROR: $file${section:+ ([$section])} does not compile as a pattern list"
    return 1
}

check_internal_lists() {
    # Checks every list internal_scan and internal_scan_dir read. Returns 1 if any is invalid.
    local rc=0
    check_pattern_list "$PLACEHOLDER_LIST" || rc=1
    if [ -f "$INTERNAL_LIST" ]; then
        check_pattern_list "$INTERNAL_LIST" SUBSTRING || rc=1
        check_pattern_list "$INTERNAL_LIST" WORD || rc=1
    fi
    return $rc
}

_warn_missing_denylist() {
    echo "⚠️  $INTERNAL_LIST not found - internal-identifier denylist scan SKIPPED." >&2
    echo "   Restore it from the private claude-config repo (it is intentionally untracked)." >&2
}

internal_scan() {
    # Scan stdin text. $1 = label for messages. Returns 1 on any hit, or if a scan failed.
    local label="$1" found=0 text subs words shits="" whits="" hits ep
    text=$(cat)
    [ -z "$text" ] && return 0

    if [ ! -f "$INTERNAL_LIST" ]; then
        _warn_missing_denylist
    else
        subs=$(_internal_section "$INTERNAL_LIST" SUBSTRING)
        words=$(_internal_section "$INTERNAL_LIST" WORD)
        if [ -n "$subs" ]; then
            shits=$(printf '%s\n' "$text" | grep -iE -f <(printf '%s\n' "$subs")) || grep_ok $? "$label for denylist substrings" || found=1
        fi
        if [ -n "$words" ]; then
            whits=$(printf '%s\n' "$text" | grep -wE -f <(printf '%s\n' "$words")) || grep_ok $? "$label for denylist words" || found=1
        fi
        hits=$(printf '%s\n' "$shits" "$whits" | sed '/^$/d' | sort -u)
        if [ -n "$hits" ]; then
            echo "🛑 INTERNAL IDENTIFIER detected in $label:"
            head -10 <<<"$hits" | sed 's/^/     /'
            found=1
        fi
    fi

    ep=$(printf '%s\n' "$text" | grep -oiE "$ENDPOINT_PATTERNS" 2>/dev/null | sort -u | _placeholder_filter) || grep_ok $? "$label for endpoints" || found=1
    if [ -n "$ep" ]; then
        echo "🛑 REAL-LOOKING INTERNAL ENDPOINT in $label (use sanctioned placeholders - CLAUDE.md → Public Repo Hygiene):"
        head -10 <<<"$ep" | sed 's/^/     /'
        found=1
    fi
    return $found
}

internal_scan_dir() {
    # Scan a directory tree (text files only). $1 = dir, $2 = label. Returns 1 on any hit,
    # or if a scan failed.
    local dir="$1" label="$2" found=0 subs words shits="" whits="" hits ep
    if [ ! -f "$INTERNAL_LIST" ]; then
        _warn_missing_denylist
    else
        subs=$(_internal_section "$INTERNAL_LIST" SUBSTRING)
        words=$(_internal_section "$INTERNAL_LIST" WORD)
        if [ -n "$subs" ]; then
            shits=$(grep -rinIE -f <(printf '%s\n' "$subs") "$dir") || grep_ok $? "$label for denylist substrings" || found=1
        fi
        if [ -n "$words" ]; then
            whits=$(grep -rnwIE -f <(printf '%s\n' "$words") "$dir") || grep_ok $? "$label for denylist words" || found=1
        fi
        hits=$(printf '%s\n' "$shits" "$whits" | sed '/^$/d' | sort -u)
        if [ -n "$hits" ]; then
            echo "🛑 INTERNAL IDENTIFIER detected in $label:"
            head -10 <<<"$hits" | sed 's/^/     /'
            found=1
        fi
    fi

    ep=$(grep -rhoiIE "$ENDPOINT_PATTERNS" "$dir" 2>/dev/null | sort -u | _placeholder_filter) || grep_ok $? "$label for endpoints" || found=1
    if [ -n "$ep" ]; then
        echo "🛑 REAL-LOOKING INTERNAL ENDPOINT in $label (use sanctioned placeholders - CLAUDE.md → Public Repo Hygiene):"
        head -10 <<<"$ep" | sed 's/^/     /'
        found=1
    fi
    return $found
}
