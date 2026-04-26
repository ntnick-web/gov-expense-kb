"""_write_inferred_related.py — 把 03_index/edges.json 的推斷邊回寫到 SSOT。

目的:把 `cites_inferred` / `answers_inferred` / `explains_inferred` 推斷邊
合併進對應 MD 的 `related` 陣列(去重、保留現有人工邊),提升人工關聯密度。

寫回後,下次 `03_build_index.py` 會視為人工邊(inferred=false),不再重複推斷。

讀取
----
    03_index/edges.json   ← 必須先跑 `python 05_scripts/03_build_index.py`

寫入(若 --apply)
----
    每份 02_markdown/*.md 的 front-matter `related` 陣列

去重規則
--------
- 同 (from, to) 已存在於 related 跳過
- 跨母題邊(`cross_parent: true`)也寫入
- 寫回後依 ID 排序,確保 deterministic

用法
----
    python 05_scripts/_write_inferred_related.py            # dry-run
    python 05_scripts/_write_inferred_related.py --apply
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"
EDGES_PATH = ROOT / "03_index" / "edges.json"

INFERRED_RELATIONS = {"cites_inferred", "answers_inferred", "explains_inferred"}


def split_fm(text: str):
    if not text.startswith("---"):
        return None, text
    end = text.find("\n---", 3)
    if end < 0:
        return None, text
    raw = text[3:end]
    try:
        fm = yaml.safe_load(raw)
    except yaml.YAMLError:
        return None, text
    if not isinstance(fm, dict):
        return None, text
    body = text[end + 4:].lstrip("\n")
    return fm, body


def render_fm(fm: dict) -> str:
    return yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()


def load_inferred_by_source(edges_path: Path) -> dict[str, list[str]]:
    """從 edges.json 載入推斷邊,依 from 分組。回傳 {from_id: sorted unique to_ids}。"""
    edges = json.loads(edges_path.read_text(encoding="utf-8"))
    grouped: dict[str, set[str]] = {}
    for e in edges:
        if e.get("relation") not in INFERRED_RELATIONS:
            continue
        if not e.get("inferred"):
            continue
        grouped.setdefault(e["from"], set()).add(e["to"])
    return {k: sorted(v) for k, v in grouped.items()}


def build_id_to_path(md_dir: Path) -> dict[str, Path]:
    """掃 02_markdown/ 建立 id → path map。"""
    out: dict[str, Path] = {}
    for md in md_dir.rglob("*.md"):
        text = md.read_text(encoding="utf-8")
        fm, _ = split_fm(text)
        if fm and fm.get("id"):
            out[str(fm["id"])] = md
    return out


def merge_related(existing: list[str], to_add: list[str]) -> tuple[list[str], list[str]]:
    """合併。回傳 (合併後 list, 新增的 IDs)。"""
    s = set(existing)
    added: list[str] = []
    for t in to_add:
        if t not in s:
            s.add(t)
            added.append(t)
    return sorted(s), added


def write_md(path: Path, fm: dict, body: str) -> None:
    out = "---\n" + render_fm(fm) + "\n---\n\n" + body.lstrip("\n")
    out = out.rstrip() + "\n"
    path.write_text(out, encoding="utf-8", newline="\n")


def process_one(path: Path, to_add: list[str], apply: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    out = {"id": None, "added": [], "total_after": 0, "error": None}
    if fm is None:
        out["error"] = "front-matter 解析失敗"
        return out

    out["id"] = fm.get("id")
    existing = fm.get("related") or []
    if not isinstance(existing, list):
        existing = []
    existing = [str(r) for r in existing]

    new_related, added = merge_related(existing, to_add)
    out["added"] = added
    out["total_after"] = len(new_related)

    if not added:
        return out

    if apply:
        fm["related"] = new_related
        write_md(path, fm, body)

    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if not EDGES_PATH.exists():
        print(f"找不到 {EDGES_PATH}。請先跑 `python 05_scripts/03_build_index.py`",
              file=sys.stderr)
        return 1
    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    print(f"讀取 {EDGES_PATH.relative_to(ROOT).as_posix()}")
    inferred = load_inferred_by_source(EDGES_PATH)
    total_inferred = sum(len(v) for v in inferred.values())
    print(f"推斷邊:{total_inferred} 條,涵蓋 {len(inferred)} 個來源節點")

    print("建立 id → path map ...")
    id_path = build_id_to_path(MD_DIR)
    print(f"找到 {len(id_path)} 個節點")

    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 100)

    sources_processed = 0
    sources_with_added = 0
    total_added = 0
    errors = 0

    for src_id, to_ids in sorted(inferred.items()):
        path = id_path.get(src_id)
        if not path:
            print(f"  [!!] 來源節點 {src_id} 找不到對應 MD")
            errors += 1
            continue
        sources_processed += 1
        r = process_one(path, to_ids, apply=args.apply)
        if r.get("error"):
            errors += 1
            print(f"  [!!] {src_id}: {r['error']}")
            continue
        if r["added"]:
            sources_with_added += 1
            total_added += len(r["added"])
            if args.verbose:
                print(f"  + {src_id} → {len(r['added'])} 新關聯 (合併後共 {r['total_after']})")
                for tid in r["added"]:
                    print(f"      {tid}")

    print("─" * 100)
    print(f"處理來源節點:{sources_processed}")
    print(f"  其中有新增:{sources_with_added}")
    print(f"總新增關聯:{total_added}")
    print(f"錯誤:{errors}")
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 2 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
