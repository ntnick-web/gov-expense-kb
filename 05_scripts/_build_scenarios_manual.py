"""把 04_web/data/scenarios/{parent}.json 多檔合併為單一 scenarios_manual.json。

設計:
  source(編輯來源) → 04_web/data/scenarios/{domestic,abroad,voucher,honorarium}.json
  build(前端載入) → 04_web/data/scenarios_manual.json(merged)

人工編輯時改 source 各別檔(diff 易讀);CI 跑此腳本重 build merged。

執行:
    python 05_scripts/_build_scenarios_manual.py            # 預設 dry-run + 計數
    python 05_scripts/_build_scenarios_manual.py --apply    # 寫入 scenarios_manual.json
    python 05_scripts/_build_scenarios_manual.py --check    # 驗 source 與 merged 內容一致(CI 用)
"""
from __future__ import annotations
import sys
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "04_web" / "data" / "scenarios"
MERGED_PATH = ROOT / "04_web" / "data" / "scenarios_manual.json"

# 順序決定情境視圖預設展開順序(同 EXPENSE_LAYER 母題序)
PARENT_ORDER = ["國內旅費", "國外旅費", "支出憑證與結報", "酬勞費"]


def load_sources() -> tuple[list[dict], dict[str, int]]:
    if not SRC_DIR.exists():
        return [], {}
    by_parent: dict[str, list[dict]] = {}
    for f in sorted(SRC_DIR.glob("*.json")):
        if f.name.startswith("_"):
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        parent = data.get("parent")
        items = data.get("scenarios", [])
        if not parent or not isinstance(items, list):
            print(f"[warn] {f.name}: 缺 parent 或 scenarios 欄位,跳過")
            continue
        by_parent[parent] = items

    # 依 PARENT_ORDER 平展
    merged: list[dict] = []
    counts: dict[str, int] = {}
    seen = set(PARENT_ORDER)
    for parent in PARENT_ORDER:
        items = by_parent.get(parent, [])
        merged.extend(items)
        counts[parent] = len(items)
    # 落單未在 PARENT_ORDER 的母題附在最後
    for parent, items in by_parent.items():
        if parent not in seen:
            merged.extend(items)
            counts[parent] = len(items)
            print(f"[info] {parent} 不在 PARENT_ORDER,附在尾端")
    return merged, counts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="驗源檔與 merged 內容一致(CI 用,不一致 exit 2)")
    args = ap.parse_args()

    merged, counts = load_sources()
    print(f"從 {SRC_DIR.relative_to(ROOT)} 載入 {sum(counts.values())} 卡")
    for p, n in counts.items():
        print(f"  {p}: {n}")

    # 檢查 ID 唯一
    ids = [s.get("id") for s in merged]
    dups = [i for i in ids if ids.count(i) > 1]
    if dups:
        print(f"[err] 重複 ID:{set(dups)}")
        return 2

    # 取既有 version / note(若 merged 已存在)
    existing_meta = {}
    if MERGED_PATH.exists():
        try:
            old = json.loads(MERGED_PATH.read_text(encoding="utf-8"))
            existing_meta["version"] = old.get("version", "2026-05-01")
            existing_meta["note"] = old.get("note", "")
        except Exception:
            pass

    out = {
        "version": existing_meta.get("version", "2026-05-01"),
        "note": existing_meta.get("note") or
            "由 _build_scenarios_manual.py 從 04_web/data/scenarios/{parent}.json 合併產出。"
            "編輯請改各 parent 檔,勿直接改本檔。",
        "scenarios": merged,
    }
    new_text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"

    if args.check:
        if not MERGED_PATH.exists():
            print(f"[err] {MERGED_PATH.name} 不存在")
            return 2
        old_text = MERGED_PATH.read_text(encoding="utf-8")
        if old_text.strip() != new_text.strip():
            print("[err] source 與 merged 內容不一致 — 跑 --apply 重 build")
            return 2
        print("✓ source 與 merged 內容一致")
        return 0

    if args.apply:
        MERGED_PATH.write_text(new_text, encoding="utf-8")
        print(f"✓ 已寫入 {MERGED_PATH.relative_to(ROOT)}")
    else:
        print("(dry-run — 加 --apply 才寫入 merged JSON)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
