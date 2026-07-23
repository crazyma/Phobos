#!/usr/bin/env python3
"""PostToolUse hook：Write/Edit 存檔後，若動到 docs/**/*.md 就重建對應 .html。

讀取 hook 從 stdin 傳入的 JSON，取 tool_input.file_path 判斷；
非 docs 下的 .md 一律略過，靜默結束（不干擾一般編輯）。
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = (ROOT / "docs").resolve()

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

fp = (data.get("tool_input") or {}).get("file_path") or ""
if not fp:
    sys.exit(0)

p = Path(fp).resolve()
if p.suffix != ".md":
    sys.exit(0)
try:
    p.relative_to(DOCS)
except ValueError:
    sys.exit(0)

subprocess.run([sys.executable, str(ROOT / "scripts" / "build_docs.py"), str(p)], check=False)
