"""_retitle_apply.py — 把 LLM 提案 JSONL 寫回 02_markdown/ front-matter title。

讀 _retitle_proposals/outputs/*.jsonl(每行 {id, new_title, [reason]}),
按 id 找對應 MD,更新 front-matter 的 title 欄位。

安全機制
-------
- 預設 dry-run,`--apply` 才寫
- 跳過 review_level=人工(除非 --include-human)
- 跳過 status=已廢止
- new_title 為空 / 與舊相同 → no_change
- new_title > 20 字 → 警告且**不**寫(避免破壞硬上限)
- A 類缺「第N條」前綴 → 自動補(per CLAUDE.md §1 Title 上限規則,user 確認 A 類保留前綴)
- D 類缺「QN」前綴 → 自動補

用法
----
    python 05_scripts/_retitle_apply.py                   # dry-run,讀全部 outputs/*.jsonl
    python 05_scripts/_retitle_apply.py --apply
    python 05_scripts/_retitle_apply.py --input outputs/batch_01.jsonl --apply
    python 05_scripts/_retitle_apply.py --csv               # 順便輸出對照 CSV
"""

from __future__ import annotations

import argparse
import csv
import json
import re
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
OUT_DIR = ROOT / "05_scripts" / "_retitle_proposals"
OUTPUTS_DIR = OUT_DIR / "outputs"

MAX_LEN = 20

CN_DIGITS = "〇一二三四五六七八九"


def num_to_cn(n: int) -> str:
    if n < 10:
        return CN_DIGITS[n]
    if n == 10:
        return "十"
    if n < 20:
        return f"十{CN_DIGITS[n - 10]}"
    if n < 100:
        tens, ones = divmod(n, 10)
        return f"{CN_DIGITS[tens]}十" + (CN_DIGITS[ones] if ones else "")
    return str(n)


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


def index_md_by_id() -> dict[str, Path]:
    idx: dict[str, Path] = {}
    for f in MD_DIR.rglob("*.md"):
        text = f.read_text(encoding="utf-8")
        fm, _ = split_fm(text)
        if not fm:
            continue
        nid = str(fm.get("id", ""))
        if nid:
            idx[nid] = f
    return idx


def load_proposals(input_paths: list[Path]) -> list[dict]:
    proposals: list[dict] = []
    for p in input_paths:
        if not p.exists():
            print(f"找不到 {p}", file=sys.stderr)
            continue
        with p.open("r", encoding="utf-8") as fh:
            for ln, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"  [{p.name}:{ln}] JSON 解析失敗:{e}", file=sys.stderr)
                    continue
                if "id" not in rec or "new_title" not in rec:
                    print(f"  [{p.name}:{ln}] 缺 id 或 new_title 欄位", file=sys.stderr)
                    continue
                proposals.append(rec)
    return proposals


def normalize_title(category: str, serial: int, raw: str) -> tuple[str, str]:
    """正規化標題:A 類補「第N條」前綴、D 類補「QN」前綴。

    回傳 (final_title, note)。
    """
    t = (raw or "").strip()
    if not t:
        return "", "空"

    # A 類:確保「第N條 」前綴
    if category == "A":
        a_pref = re.match(r"^第\s*[一二三四五六七八九十百〇○零\d]+\s*條\s*", t)
        if not a_pref:
            cn = num_to_cn(serial)
            return f"第{cn}條 {t}", "補 A 前綴"
        return t, ""

    # D 類:確保「QN 」前綴
    if category == "D":
        d_pref = re.match(r"^Q\s*\d+\s*", t)
        if not d_pref:
            return f"Q{serial} {t}", "補 D 前綴"
        return t, ""

    return t, ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--input", action="append",
                    help="指定單一 JSONL(可重複);未指定則讀 outputs/*.jsonl")
    ap.add_argument("--include-human", action="store_true",
                    help="預設跳過 review_level=人工")
    ap.add_argument("--csv", action="store_true",
                    help="額外輸出 review.csv 對照表")
    ap.add_argument("--show", type=int, default=20)
    args = ap.parse_args()

    if args.input:
        input_paths = [ROOT / p for p in args.input]
    else:
        OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
        input_paths = sorted(OUTPUTS_DIR.glob("*.jsonl"))

    if not input_paths:
        print("沒有提案檔可讀。", file=sys.stderr)
        return 1

    print(f"讀 {len(input_paths)} 份提案檔")
    proposals = load_proposals(input_paths)
    print(f"提案總數:{len(proposals)}")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 100)

    md_index = index_md_by_id()

    stats = {"fix": 0, "no_change": 0, "skip_human": 0, "skip_obsolete": 0,
             "too_long": 0, "missing_md": 0, "empty": 0}
    rows: list[dict] = []

    for prop in proposals:
        nid = prop["id"]
        new_title_raw = prop.get("new_title", "")
        path = md_index.get(nid)
        if not path:
            stats["missing_md"] += 1
            print(f"  [缺檔] {nid}")
            continue

        text = path.read_text(encoding="utf-8")
        fm, body = split_fm(text)
        if not fm:
            stats["missing_md"] += 1
            continue

        if str(fm.get("status", "現行")) == "已廢止":
            stats["skip_obsolete"] += 1
            continue
        if not args.include_human and str(fm.get("review_level", "")) == "人工":
            stats["skip_human"] += 1
            continue

        m = re.match(r"^([ABCD])-([^-]+)-(\d{3})$", nid)
        if not m:
            continue
        category = m.group(1)
        serial = int(m.group(3))

        old_title = str(fm.get("title", ""))
        new_title, note = normalize_title(category, serial, new_title_raw)

        if not new_title:
            stats["empty"] += 1
            continue
        if len(new_title) > MAX_LEN:
            stats["too_long"] += 1
            print(f"  [過長 {len(new_title)}>{MAX_LEN}] {nid}: {new_title!r}")
            continue
        if new_title == old_title:
            stats["no_change"] += 1
            continue

        rows.append({
            "id": nid,
            "category": category,
            "parent": str(fm.get("parent", "")),
            "old_title": old_title,
            "new_title": new_title,
            "note": note or prop.get("reason", ""),
            "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        })

        stats["fix"] += 1
        if args.apply:
            fm["title"] = new_title
            new_text = "---\n" + render_fm(fm) + "\n---\n\n" + body.lstrip("\n")
            new_text = new_text.rstrip() + "\n"
            path.write_text(new_text, encoding="utf-8", newline="\n")

    show_n = min(args.show, len(rows))
    for r in rows[:show_n]:
        tag = "[改名]" if args.apply else "[擬改名]"
        print(f"  {tag} {r['id']}  {r['note']}")
        print(f"        舊: {r['old_title']!r}")
        print(f"        新: {r['new_title']!r}")

    print("─" * 100)
    for k, v in stats.items():
        if v:
            print(f"  {k}: {v}")

    if args.csv:
        csv_path = OUT_DIR / "review.csv"
        with csv_path.open("w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["id", "category", "parent",
                                               "old_title", "new_title", "note", "path"])
            w.writeheader()
            for r in rows:
                w.writerow(r)
        print(f"\n對照表:{csv_path}")

    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
