"""一次性工具:重新命名母題(parent),含 02_markdown / 01_extracted 的
資料夾與檔內 front-matter / id / meta.json。

使用:
    python 05_scripts/_rename_parent.py 支出憑證 支出憑證與結報
"""

from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def rename_in_md(md_path: Path, old: str, new: str) -> bool:
    """更新 MD 檔內的 parent: 與 id: 欄位。回傳是否有變更。"""
    text = md_path.read_text(encoding="utf-8")
    new_text = text
    # parent 欄位(YAML)
    new_text = re.sub(
        rf"^(parent:\s*){re.escape(old)}\s*$",
        rf"\1{new}",
        new_text,
        flags=re.MULTILINE,
    )
    # id 欄位:[ABCDN]-{old}-NNN → [ABCDN]-{new}-NNN
    new_text = re.sub(
        rf"^(id:\s*[ABCDN]-){re.escape(old)}(-\d+\s*)$",
        rf"\1{new}\2",
        new_text,
        flags=re.MULTILINE,
    )
    # related: 列表中可能引用同 parent 內節點(目前皆空,但保險起見也處理)
    new_text = re.sub(
        rf"(\b[ABCDN]-){re.escape(old)}(-\d{{3}}\b)",
        rf"\1{new}\2",
        new_text,
    )
    if new_text != text:
        md_path.write_text(new_text, encoding="utf-8", newline="\n")
        return True
    return False


def rename_in_meta(meta_path: Path, old: str, new: str) -> bool:
    """更新 .meta.json 的 parent / output_path 字串。"""
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    changed = False
    if data.get("parent") == old:
        data["parent"] = new
        changed = True
    op = data.get("output_path", "")
    if f"/{old}/" in op:
        data["output_path"] = op.replace(f"/{old}/", f"/{new}/")
        changed = True
    if changed:
        meta_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )
    return changed


def rename_dirs(base: Path, old: str, new: str) -> list[Path]:
    """把 base/**/{old}/ 子資料夾改名為 base/**/{new}/。"""
    moved: list[Path] = []
    # 收集所有目標資料夾(避免遞迴改名相互影響)
    candidates = [p for p in base.rglob(old) if p.is_dir()]
    for src in candidates:
        dst = src.parent / new
        if dst.exists():
            print(f"  ! 目標已存在,跳過 {src} → {dst}")
            continue
        src.rename(dst)
        moved.append(dst)
        print(f"  資料夾 {src.relative_to(ROOT)} → {dst.relative_to(ROOT)}")
    return moved


def main() -> int:
    if len(sys.argv) != 3:
        print("用法: python _rename_parent.py <舊母題> <新母題>")
        return 1
    old, new = sys.argv[1], sys.argv[2]

    print(f"重新命名母題: {old!r} → {new!r}")

    # 1) 先改 02_markdown / 01_extracted 的資料夾
    print("\n[1/3] 改名資料夾")
    rename_dirs(ROOT / "02_markdown", old, new)
    rename_dirs(ROOT / "01_extracted", old, new)

    # 2) 改 02_markdown 內所有 MD 檔的 parent / id
    print("\n[2/3] 改 02_markdown MD 檔內容")
    md_changed = 0
    for md in (ROOT / "02_markdown").rglob("*.md"):
        if rename_in_md(md, old, new):
            md_changed += 1
    print(f"  變更 {md_changed} 個 MD 檔")

    # 3) 改 01_extracted 內所有 .meta.json 的 parent / output_path
    print("\n[3/3] 改 01_extracted meta.json")
    meta_changed = 0
    for meta in (ROOT / "01_extracted").rglob("*.meta.json"):
        if rename_in_meta(meta, old, new):
            meta_changed += 1
    print(f"  變更 {meta_changed} 個 meta.json")

    print("\n完成。請接續執行 03_build_index.py 重建索引。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
