#!/usr/bin/env python3
"""Collect every local change that would go into a PR and route it to skills.

Covers: commits on the branch since the merge-base, staged, unstaged and
untracked files. Prints one JSON document on stdout:

  {
    "base": "origin/main", "base_sha": "...", "head_sha": "...", "branch": "...",
    "files":   [{"path", "status", "ranges": [[start, end], ...]}],
    "excluded": ["path", ...],
    "groups":  {"<skill>": ["path", ...]},          # skill -> files to review
    "checks":  {"<check-id>": ["path", ...]},       # deterministic checks to run
    "packages": {"<pkg>": {"dir","pm","typecheck","test"}},  # touched packages
    "notes":   ["..."]
  }

`ranges` are 1-based inclusive line ranges of ADDED/CHANGED lines (right side
of `git diff -U0`). Untracked files count as fully changed. A deleted file has
no ranges. Usage: collect_diff.py [--base <ref>]
"""
import fnmatch
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROUTING = os.path.join(HERE, "..", "routing.json")


def git(*args, check=True):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


def glob_to_re(glob):
    """`**` spans directories, `*` and `?` do not; `**/` also matches zero dirs."""
    out, i = "", 0
    while i < len(glob):
        c = glob[i]
        if glob.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif glob.startswith("**", i):
            out += ".*"
            i += 2
        elif c == "*":
            out += "[^/]*"
            i += 1
        elif c == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(c)
            i += 1
    return re.compile("^" + out + "$")


def matcher(globs):
    res = [glob_to_re(g) for g in globs]
    return lambda p: any(r.match(p) for r in res)


def resolve_base(candidates, forced):
    if forced:
        return forced
    for c in candidates:
        if git("rev-parse", "--verify", "-q", c, check=False).strip():
            return c
    sys.exit("No base ref found (tried: %s). Pass --base <ref>." % ", ".join(candidates))


def parse_ranges(diff_text):
    """path -> [[start, end], ...] from a `-U0` diff (new-file side)."""
    ranges, path = {}, None
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("@@") and path:
            m = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", line)
            if m:
                start, count = int(m.group(1)), int(m.group(2) if m.group(2) is not None else 1)
                if count > 0:
                    ranges.setdefault(path, []).append([start, start + count - 1])
    return ranges


def line_count(path):
    try:
        with open(path, "rb") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def main():
    forced = sys.argv[sys.argv.index("--base") + 1] if "--base" in sys.argv else None
    with open(ROUTING) as f:
        routing = json.load(f)

    root = git("rev-parse", "--show-toplevel").strip()
    os.chdir(root)
    base = resolve_base(routing["base_candidates"], forced)
    base_sha = git("merge-base", base, "HEAD").strip()
    head_sha = git("rev-parse", "HEAD").strip()
    branch = git("rev-parse", "--abbrev-ref", "HEAD").strip()

    # Working tree vs merge-base = commits + staged + unstaged in one diff.
    status = {}
    for line in git("diff", "--name-status", "-M", base_sha).splitlines():
        parts = line.split("\t")
        code, path = parts[0][0], parts[-1]
        status[path] = {"A": "added", "M": "modified", "D": "deleted", "R": "renamed"}.get(code, code)
    ranges = parse_ranges(git("diff", "-U0", "--no-color", "-M", base_sha))

    untracked = [p for p in git("ls-files", "--others", "--exclude-standard").splitlines() if p]
    for p in untracked:
        status[p] = "untracked"
        n = line_count(p)
        if n:
            ranges[p] = [[1, n]]

    is_excluded = matcher(routing["exclude"])
    files, excluded = [], []
    for path in sorted(status):
        if is_excluded(path):
            excluded.append(path)
            continue
        files.append({"path": path, "status": status[path], "ranges": ranges.get(path, [])})

    groups, checks, notes, touched = {}, {}, [], set()
    rules = [(r, matcher(r["glob"])) for r in routing["rules"]]
    docs_only_ids = {r["id"] for r in routing["rules"] if r.get("docs_only")}
    matched_by_file = {}
    for f in files:
        p = f["path"]
        ids = set()
        hits = [(rule, m) for rule, m in rules if m(p)]
        # A docs/skills file is only ever a docs file: other rules (e2e/**,
        # security on *.sh, ...) must not pull it into package checks.
        if any(rule.get("docs_only") for rule, _ in hits):
            hits = [(rule, m) for rule, m in hits if rule.get("docs_only")]
        for rule, m in hits:
            ids.add(rule["id"])
            for skill in rule.get("skills", []):
                groups.setdefault(skill, [])
                if p not in groups[skill]:
                    groups[skill].append(p)
            for chk in rule.get("checks", []):
                checks.setdefault(chk, [])
                if p not in checks[chk]:
                    checks[chk].append(p)
            if not rule.get("docs_only"):
                for n in rule.get("notes", []):
                    if n not in notes:
                        notes.append(n)
        matched_by_file[p] = ids
        top = p.split("/", 1)[0]
        # Docs/skills-only files never trigger a package's typecheck/tests.
        if top in routing["packages"] and not (ids and ids <= docs_only_ids):
            touched.add(top)

    if files and all(ids and ids <= docs_only_ids for ids in matched_by_file.values()):
        notes.append("Docs/skills-only diff: run mechanical checks, skip skill review.")

    unrouted = [p for p, ids in matched_by_file.items() if not ids]
    if unrouted:
        notes.append("Files matched by no routing rule (reviewed by no skill): " + ", ".join(unrouted))
    if base_sha == head_sha and not files:
        notes.append("No changes relative to the base.")

    print(json.dumps({
        "base": base, "base_sha": base_sha, "head_sha": head_sha, "branch": branch,
        "files": files, "excluded": excluded, "groups": groups, "checks": checks,
        "packages": {k: v for k, v in routing["packages"].items() if k in touched},
        "notes": notes,
    }, indent=2))


if __name__ == "__main__":
    main()
