"""把 04_web/index.html 的 DATA_VERSION 與 03_index/_meta.json 的 last_indexed 同步。

規則:
  - 讀 _meta.last_indexed(YYYY-MM-DD)
  - 讀 04_web/index.html 的 DATA_VERSION(格式:YYYY-MM-DDx,x 為 a/b/c…)
  - 若 DATA_VERSION 的日期前綴 != last_indexed → 改寫為 last_indexed + 'a'
  - 同日期重建:不動(讓 user 自行手動 bump 後綴若需要)

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
META_JSON = ROOT / "03_index" / "_meta.json"

DATA_VERSION_RE = re.compile(r"const\s+DATA_VERSION\s*=\s*'([^']+)'")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true", help="實際寫入(預設 dry-run)")
    args = p.parse_args()

    if not META_JSON.exists():
        print(f"[skip] {META_JSON} 不存在")
        sys.exit(0)
    if not INDEX_HTML.exists():
        print(f"[err] {INDEX_HTML} 不存在")
        sys.exit(1)

    meta = json.loads(META_JSON.read_text(encoding="utf-8"))
    last_indexed = meta.get("last_indexed")
    if not last_indexed:
        print("[skip] _meta.json 無 last_indexed")
        sys.exit(0)

    html = INDEX_HTML.read_text(encoding="utf-8")
    m = DATA_VERSION_RE.search(html)
    if not m:
        print("[err] 04_web/index.html 找不到 DATA_VERSION 常數")
        sys.exit(1)

    current = m.group(1)
    current_date = current[:10] if len(current) >= 10 else current
    new_version = f"{last_indexed}a"

    # 只在 last_indexed 比 current_date 新時 bump,避免 CI 把 user 手動升的版本降回去
    if current_date >= last_indexed:
        print(f"[no-op] DATA_VERSION = {current!r}(>= last_indexed={last_indexed},不變)")
        sys.exit(0)

    print(f"[bump] DATA_VERSION {current!r} → {new_version!r}(last_indexed={last_indexed})")

    if not args.apply:
        print("(dry-run — 加 --apply 才寫入)")
        sys.exit(0)

    new_html = DATA_VERSION_RE.sub(f"const DATA_VERSION = '{new_version}'", html, count=1)
    INDEX_HTML.write_text(new_html, encoding="utf-8")
    print(f"  ✓ 已寫入 {INDEX_HTML.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
