"""_migrate_review_level.py — 為 02_markdown/*.md 加 review_level 欄位。

背景
----
前 27 份國內旅費為人工精校(version=2024-01-15);
其餘 485 份為 `_batch_autoreview.py` 自動初校(version=2024-01-01 placeholder);
1 份特殊版本(2023-08-10)。

但目前 nodes.json 一律標 reviewed,前端徽章看不出差別,
有「全 reviewed」名不副實的問題(CLAUDE.md §三 提到的可信度落差)。

本腳本依 version 自動分類,在 front-matter 加 review_level 欄位:
- version=2024-01-15 或 2023-08-10 → review_level: 人工
- version=2024-01-01 (placeholder)  → review_level: 自動初校
- 已有 review_level 者:不動

之後 `03_build_index.py` 會把此欄位寫入 nodes.json,前端依此分綠勾(人工)/灰勾(自動)。

用法
    python 05_scripts/_migrate_review_level.py            # dry-run
    python 05_scripts/_migrate_review_level.py --apply
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"

# version → review_level 對照
HUMAN_VERSIONS = {"2024-01-15", "2023-08-10"}
AUTO_VERSIONS = {"2024-01-01"}


def split_fm(text: str):
    if not text.startswith("---"):
        return None, None, text
    end = text.find("\n---", 3)
    if end < 0:
        return None, None, text
    raw = text[3:end]
    try:
        fm = yaml.safe_load(raw)
    except yaml.YAMLError:
        return None, None, text
    if not isinstance(fm, dict):
        return None, None, text
    body = text[end + 4:].lstrip("\n")
    return raw, fm, body


def render_fm(fm: dict) -> str:
    return yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()


def insert_review_level(fm: dict, level: str) -> dict:
    """在 reviewed 之後插入 review_level(若無 reviewed 則放最後)。"""
    new_fm: dict = {}
    inserted = False
    for k, v in fm.items():
        new_fm[k] = v
        if k == "reviewed" and not inserted:
            new_fm["review_level"] = level
            inserted = True
    if not inserted:
        new_fm["review_level"] = level
    return new_fm


def classify(version: str) -> str | None:
    if version in HUMAN_VERSIONS:
        return "人工"
    if version in AUTO_VERSIONS:
        return "自動初校"
    return None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true", help="實際寫回 02_markdown")
    args = p.parse_args(argv)

    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    stats = Counter()
    changes: list[tuple[Path, str]] = []
    skips: list[tuple[Path, str]] = []

    for md in sorted(MD_DIR.rglob("*.md")):
        text = md.read_text(encoding="utf-8")
        raw, fm, body = split_fm(text)
        if fm is None:
            stats["no_fm"] += 1
            continue
        if "review_level" in fm:
            stats["already_has"] += 1
            continue
        version = str(fm.get("version", ""))
        level = classify(version)
        if level is None:
            stats["unknown_version"] += 1
            skips.append((md, f"未知 version='{version}'"))
            continue
        new_fm = insert_review_level(fm, level)
        new_text = "---\n" + render_fm(new_fm) + "\n---\n\n" + body
        changes.append((md, level))
        stats[f"set_{level}"] += 1
        if args.apply:
            md.write_text(new_text, encoding="utf-8")

    print(f"=== Migrate review_level ({'APPLY' if args.apply else 'DRY-RUN'}) ===")
    for k, n in stats.most_common():
        print(f"  {k}: {n}")
    if skips:
        print("\n跳過(未知 version):")
        for m, why in skips[:10]:
            print(f"  {m.relative_to(ROOT)} — {why}")

    if not args.apply:
        print("\n(dry-run,未寫檔。加 --apply 實際寫入)")
    else:
        print(f"\n已寫入 {len(changes)} 份 MD。")

    return 0


if __name__ == "__main__":
    sys.exit(main())
