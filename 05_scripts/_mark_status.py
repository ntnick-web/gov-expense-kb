"""_mark_status.py — 自動標記已廢止/部分修正的 status。

掃 02_markdown/ 全部 .md,根據以下規則加 front-matter `status` 欄位:

判定為「已廢止」(status: 已廢止)
  - title 為「(刪除)」或「(刪除)」單獨字樣
  - 條文全文 / 函釋全文 / 標準全文 H2 區塊去頭尾空白後純為「(刪除)」
  - 條文 / 函釋首段以「(刪除)」起頭(後接被取代的舊條文殘留)

不判定(暫保留為「現行」)
  - body 含「修正」「修訂」字樣 → 不一定廢止,可能是「規定 N 經修正後...」之引用
  - 「廢止」字樣出現於正文討論中(談他法被廢止)而非本條被廢止

使用範例
--------
    python 05_scripts/_mark_status.py            # dry-run 列報表
    python 05_scripts/_mark_status.py --apply    # 寫入

退出代碼:0 成功 / 1 環境錯誤 / 2 解析錯誤
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"

DELETED_MARKERS = ("（刪除）", "(刪除)", "（刪除)", "(刪除）")
HEADINGS = ("條文全文", "函釋全文", "標準全文")


def split_fm(text: str):
    if not text.startswith("---"):
        return None, text, None
    end = text.find("\n---", 3)
    if end < 0:
        return None, text, None
    raw = text[3:end]
    try:
        fm = yaml.safe_load(raw)
    except yaml.YAMLError:
        return None, text, None
    if not isinstance(fm, dict):
        return None, text, None
    body = text[end + 4:].lstrip("\n")
    return fm, body, raw


def render_fm(fm: dict) -> str:
    return yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()


def extract_section(body: str, heading: str) -> str:
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    return m.group(1).strip() if m else ""


def detect_obsolete(fm: dict, body: str) -> tuple[bool, str]:
    """回傳 (是否已廢止, 原因)。"""
    title = str(fm.get("title", "")).strip()
    if any(marker == title for marker in DELETED_MARKERS):
        return True, f"title 為「{title}」"
    if title.startswith(DELETED_MARKERS):
        return True, f"title 開頭為刪除標記:{title!r}"

    for h in HEADINGS:
        section = extract_section(body, h)
        if not section:
            continue
        flat = re.sub(r"\s+", "", section)
        # 整段純為「（刪除）」
        if any(flat == m for m in DELETED_MARKERS):
            return True, f"H2「{h}」純為刪除標記"
        # 起頭即為「（刪除）」(後面殘留舊條文)
        if any(flat.startswith(m) for m in DELETED_MARKERS):
            return True, f"H2「{h}」首段起頭為刪除標記"

    return False, ""


def upsert_status(fm: dict, status: str) -> dict:
    """把 status 插入 front-matter,若已存在則覆寫;插入位置在 reviewed 後 / 結尾前。"""
    if fm.get("status") == status:
        return fm
    new_fm: dict = {}
    inserted = False
    for k, v in fm.items():
        if k == "status":
            continue  # 之後重新插入
        new_fm[k] = v
        if k == "reviewed" and not inserted:
            new_fm["status"] = status
            inserted = True
    if not inserted:
        new_fm["status"] = status
    return new_fm


def process(path: Path, apply: bool) -> tuple[str, str]:
    """回傳 (action, reason)。action ∈ {marked, unchanged, error}"""
    text = path.read_text(encoding="utf-8")
    fm, body, _ = split_fm(text)
    if fm is None:
        return "error", "front-matter 解析失敗"

    is_obs, reason = detect_obsolete(fm, body)
    if not is_obs:
        return "unchanged", ""

    if fm.get("status") == "已廢止":
        return "unchanged", "(已標)"

    new_fm = upsert_status(fm, "已廢止")

    if apply:
        out = "---\n" + render_fm(new_fm) + "\n---\n\n" + body.lstrip("\n")
        out = out.rstrip() + "\n"
        path.write_text(out, encoding="utf-8", newline="\n")

    return "marked", reason


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="實際寫入(預設 dry-run)")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 72)

    marked: list[tuple[Path, str]] = []
    errors = 0
    for f in files:
        action, reason = process(f, apply=args.apply)
        if action == "marked":
            marked.append((f, reason))
            tag = "[標記]" if args.apply else "[擬標記]"
            rel = f.relative_to(ROOT).as_posix()
            print(f"  {tag} {rel}  ← {reason}")
        elif action == "error":
            errors += 1
            print(f"  [!!] {f.relative_to(ROOT).as_posix()}: {reason}")

    print("─" * 72)
    print(f"判定為已廢止:{len(marked)} 份")
    print(f"錯誤:{errors} 份")
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 2 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
