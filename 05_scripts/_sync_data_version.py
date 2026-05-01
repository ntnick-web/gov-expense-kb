"""把 DATA_VERSION 與 03_index/_meta.json 的 last_indexed 同步。

規則:
  - 讀 _meta.last_indexed(YYYY-MM-DD)
  - 讀 04_web/static/js/01_state.js 的 DATA_VERSION(2026-05-02 拆檔後在這)
  - 若日期前綴 != last_indexed → 改寫為 last_indexed + 'a'
  - 同日期重建:不動(由人類手動 bump 後綴 a/b/c)
  - 同時 bump 04_web/index.html 內所有 <script src=...?v=X> 為相同版本

執行:python 05_scripts/_sync_data_version.py [--apply]

CI:在 03_build_index.py 之後、commit 之前呼叫,有變動才 commit。
"""
from __future__ import annotations
import sys
import re
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX_HTML = ROOT / "04_web" / "index.html"
STATE_JS = ROOT / "04_web" / "static" / "js" / "01_state.js"
META_JSON = ROOT / "03_index" / "_meta.json"

DATA_VERSION_RE = re.compile(r"const\s+DATA_VERSION\s*=\s*'([^']+)'")
SCRIPT_VER_RE = re.compile(r'(<script src="static/js/[^"]+?\.js)\?v=[^"]+"')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true", help="實際寫入(預設 dry-run)")
    args = p.parse_args()

    if not META_JSON.exists():
        print(f"[skip] {META_JSON} 不存在")
        sys.exit(0)
    if not STATE_JS.exists():
        print(f"[err] {STATE_JS} 不存在")
        sys.exit(1)
    if not INDEX_HTML.exists():
        print(f"[err] {INDEX_HTML} 不存在")
        sys.exit(1)

    meta = json.loads(META_JSON.read_text(encoding="utf-8"))
    last_indexed = meta.get("last_indexed")
    if not last_indexed:
        print("[skip] _meta.json 無 last_indexed")
        sys.exit(0)

    state_js = STATE_JS.read_text(encoding="utf-8")
    m = DATA_VERSION_RE.search(state_js)
    if not m:
        print(f"[err] {STATE_JS.name} 找不到 DATA_VERSION 常數")
        sys.exit(1)

    current = m.group(1)
    current_date = current[:10] if len(current) >= 10 else current
    new_version = f"{last_indexed}a"

    if current_date >= last_indexed:
        print(f"[no-op] DATA_VERSION = {current!r}(>= last_indexed={last_indexed},不變)")
        sys.exit(0)

    print(f"[bump] DATA_VERSION {current!r} → {new_version!r}(last_indexed={last_indexed})")
    if not args.apply:
        print("(dry-run — 加 --apply 才寫入)")
        sys.exit(0)

    # 1. bump 01_state.js 的 DATA_VERSION 常數
    new_state = DATA_VERSION_RE.sub(f"const DATA_VERSION = '{new_version}'", state_js, count=1)
    STATE_JS.write_text(new_state, encoding="utf-8")
    print(f"  ✓ 已寫入 {STATE_JS.relative_to(ROOT)}")

    # 2. bump index.html 內所有 <script src=...?v=...> 為相同版本
    html = INDEX_HTML.read_text(encoding="utf-8")
    new_html = SCRIPT_VER_RE.sub(rf'\1?v={new_version}"', html)
    if new_html != html:
        INDEX_HTML.write_text(new_html, encoding="utf-8")
        print(f"  ✓ 已寫入 {INDEX_HTML.relative_to(ROOT)}(script ?v= bumped)")


if __name__ == "__main__":
    main()
