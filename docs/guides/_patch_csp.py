#!/usr/bin/env python3
from pathlib import Path

p = Path("/tmp/arta-main.js")
t = p.read_text(encoding="utf-8")
old = 'frameAncestors: ["\'none\'"]'
new = 'frameAncestors: ["\'self\'"]'
if old not in t:
    raise SystemExit(f"pattern not found: {old!r}")
t2 = t.replace(old, new)
# optional: allow object embeds
t2 = t2.replace('objectSrc: ["\'none\'"]', 'objectSrc: ["\'self\'"]')
# also patch imgSrc if we want blob - skip
p.write_text(t2, encoding="utf-8")
print("patched ok")
print([line for line in t2.splitlines() if "frameAncestors" in line][:3])
