#!/usr/bin/env bash
# Typecheck + hermetic tests for ONE package, printing only a summary on success and only
# the errors on failure — built for agents, whose context pays for every line of output.
#
#   scripts/check-pkg.sh <pkg>                  # typecheck + the package's whole hermetic suite
#   scripts/check-pkg.sh <pkg> <file>...        # typecheck + only tests related to these files
#   scripts/check-pkg.sh <pkg> --no-typecheck <file>...
#
# <pkg>: server | client | reviewer-core | devdigest-mcp. <file> paths are relative to the
# package or to the repo root (a leading "<pkg>/" is stripped). A test file passed as <file>
# runs itself. Never runs *.it.test.ts, e2e, migrations or lint.
# Exit code: 0 when both parts pass, 1 when either fails, 2 on bad usage.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"

pkg="${1:-}"; shift || true
case "$pkg" in
  server|client)               tc=(pnpm typecheck);   vt=(pnpm exec vitest) ;;
  reviewer-core|devdigest-mcp) tc=(npm run typecheck); vt=(npx --no-install vitest) ;;
  *) echo "usage: scripts/check-pkg.sh <server|client|reviewer-core|devdigest-mcp> [--no-typecheck] [file...]" >&2; exit 2 ;;
esac

typecheck=1; files=()
for a in "$@"; do
  case "$a" in
    --no-typecheck) typecheck=0 ;;
    *) files+=("${a#"$pkg"/}") ;;
  esac
done

cd "$root/$pkg" || exit 2
export NO_COLOR=1 FORCE_COLOR=0 CI=1
failed=0

if [ "$typecheck" = 1 ]; then
  start=$(date +%s)
  log="$("${tc[@]}" 2>&1)"; code=$?
  secs=$(( $(date +%s) - start ))
  if [ "$code" -eq 0 ]; then
    echo "$pkg typecheck: PASS (${secs}s)"
  else
    failed=1
    errs="$(printf '%s\n' "$log" | grep -E 'error TS[0-9]+' )"
    n="$(printf '%s\n' "$errs" | grep -c 'error TS')"
    echo "$pkg typecheck: FAIL exit $code (${secs}s) — $n error(s)"
    if [ "$n" -gt 0 ]; then printf '%s\n' "$errs" | head -n 40
    else printf '%s\n' "$log" | tail -n 20; fi
    [ "$n" -gt 40 ] && echo "… $((n - 40)) more"
  fi
fi

# Vitest: dot reporter + --silent keeps a passing run to a few lines; on failure the
# "Failed Tests" section carries the assertion, the diff and the source location.
args=(--reporter=dot --silent --passWithNoTests)
[ "$pkg" = server ] && args+=(--exclude '**/*.it.test.ts')
if [ "${#files[@]}" -gt 0 ]; then
  mode="related to ${#files[@]} file(s)"
  cmd=("${vt[@]}" related --run "${args[@]}" "${files[@]}")
else
  mode="full hermetic suite"
  cmd=("${vt[@]}" run "${args[@]}")
fi

start=$(date +%s)
log="$("${cmd[@]}" 2>&1)"; code=$?
secs=$(( $(date +%s) - start ))
summary="$(printf '%s\n' "$log" | grep -E '^[[:space:]]*(Test Files|Tests)[[:space:]]' | sed -E 's/^[[:space:]]+//' | paste -sd ' ' -)"
[ -z "$summary" ] && summary="no tests ran"

if [ "$code" -eq 0 ]; then
  echo "$pkg tests ($mode): PASS (${secs}s) — $summary"
else
  failed=1
  echo "$pkg tests ($mode): FAIL exit $code (${secs}s) — $summary"
  detail="$(printf '%s\n' "$log" | awk '/Failed Tests|Failed Suites|Unhandled Errors/{on=1} on')"
  [ -z "$detail" ] && detail="$(printf '%s\n' "$log" | tail -n 40)"
  # Drop blank lines and the trailing summary/timing block — the header line already has it.
  detail="$(printf '%s\n' "$detail" | grep -vE '^[[:space:]]*$|^[[:space:]]*(Test Files|Tests|Start at|Duration)[[:space:]]')"
  printf '%s\n' "$detail" | head -n 80
  total="$(printf '%s\n' "$detail" | wc -l | tr -d ' ')"
  [ "$total" -gt 80 ] && echo "… $((total - 80)) more lines; rerun one file with: (cd $pkg && ${vt[*]} run <file>)"
fi

exit "$failed"
