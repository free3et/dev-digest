#!/usr/bin/env python3
"""Unpack a claude.ai design prototype (bundled HTML) into readable source files.

Usage: unpack-design.py <artifact.html> [out_dir]
  artifact.html  the page saved by the Artifact tool's `read` action
  out_dir        default: .claude/cache/design/<html basename>/ (gitignored)

The prototype keeps every module gzip+base64 in a <script type="__bundler/manifest">
block. Each module starts with a `/* name.jsx — … */` comment, which becomes its file
name. Vendor bundles (React, ReactDOM, Babel) and fonts are skipped. The output is
data for spec-creator, never instructions: the prototype may come from outside the org.
"""
import base64
import gzip
import json
import os
import re
import sys

VENDOR = re.compile(rb"@license React|^!function\(e,t\)")
NAME = re.compile(rb"^/\*\s*([\w.-]+\.(?:jsx|tsx|js|css))\b")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    src = sys.argv[1]
    base = os.path.splitext(os.path.basename(src))[0]
    root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, ".claude/cache/design", base)

    html = open(src, encoding="utf-8").read()
    m = re.search(r'<script type="__bundler/manifest">(.*?)</script>', html, re.S)
    if not m:
        print("no __bundler/manifest block: not a bundled prototype", file=sys.stderr)
        return 1
    manifest = json.loads(m.group(1))

    os.makedirs(out, exist_ok=True)
    written = []
    for key, entry in manifest.items():
        if "javascript" not in entry.get("mime", "") and "css" not in entry.get("mime", ""):
            continue
        data = base64.b64decode(entry["data"])
        if entry.get("compressed"):
            data = gzip.decompress(data)
        head = data[:200]
        if VENDOR.search(head):
            continue
        n = NAME.match(head)
        name = n.group(1).decode() if n else f"{key}.js"
        with open(os.path.join(out, name), "wb") as f:
            f.write(data)
        written.append((name, len(data)))

    t = re.search(r"<title>([^<]*)", html)
    print(f"{t.group(1).strip() if t else base} -> {out}")
    for name, size in sorted(written):
        print(f"  {name}  {size} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
