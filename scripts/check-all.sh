#!/usr/bin/env bash
# Run typecheck + hermetic tests for server, reviewer-core, devdigest-mcp and client ONCE per
# working-tree state, and cache the result keyed by a hash of that state.
# In an SDD run the main session (orchestrator) runs this: once as the baseline before the
# implementers start, once after each wave. Implementers use scripts/check-pkg.sh per step.
#
#   scripts/check-all.sh            # reuse the cached result when the tree is unchanged
#   scripts/check-all.sh --force    # ignore the cache and re-run
#   scripts/check-all.sh --build    # also run `pnpm build` in client (separate cache key)
#
# Never runs *.it.test.ts (Docker, and a real OpenRouter key would make paid calls),
# e2e flows, migrations or lint. Exit code is non-zero if any step failed.
# Cache: .claude/cache/checks-<tree-hash>[-build].txt (gitignored).
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 2

force=0; build=0
for a in "$@"; do
  case "$a" in
    --force) force=1 ;;
    --build) build=1 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

# Hash of everything that can change a result: HEAD, tracked diff, untracked file contents.
tree_hash() {
  {
    git rev-parse HEAD
    git diff HEAD --
    git ls-files -o --exclude-standard -z | xargs -0 shasum 2>/dev/null
  } | shasum | cut -d' ' -f1
}

hash="$(tree_hash)"
suffix=""; [ "$build" = 1 ] && suffix="-build"
mkdir -p .claude/cache
out=".claude/cache/checks-${hash}${suffix}.txt"

if [ "$force" = 0 ] && [ -f "$out" ]; then
  echo "CACHE HIT — tree ${hash:0:12} unchanged, no commands re-run. Result file: $out"
  cat "$out"
  grep -q '^OVERALL: PASS' "$out"; exit $?
fi

failed=0
{
  echo "tree: ${hash}"
  echo "ran:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$out"

# Each package goes through scripts/check-pkg.sh: one summary line per part on success,
# the TS errors / failed-test details on failure (no blind `tail`, which used to cut them off).
for pkg in server reviewer-core devdigest-mcp client; do
  log="$("$root/scripts/check-pkg.sh" "$pkg" 2>&1)"; code=$?
  [ "$code" -ne 0 ] && failed=1
  { echo; echo "## ${pkg}  (exit ${code})"; printf '%s\n' "$log"; } >> "$out"
done

if [ "$build" = 1 ]; then
  start=$(date +%s)
  log="$( (cd client && pnpm build) 2>&1 )"; code=$?
  [ "$code" -ne 0 ] && failed=1
  {
    echo
    echo "## client build  (exit ${code}, $(( $(date +%s) - start ))s)"
    if [ "$code" -ne 0 ]; then printf '%s\n' "$log" | grep -iE -A 6 'error|failed' | head -n 60; fi
  } >> "$out"
fi

{
  echo
  if [ "$failed" = 0 ]; then echo "OVERALL: PASS"; else echo "OVERALL: FAIL"; fi
  echo "not run: *.it.test.ts, e2e, lint (see .claude/references/skill-routing.md)"
} >> "$out"

echo "ran fresh — tree ${hash:0:12}. Result file: $out"
cat "$out"
exit "$failed"
