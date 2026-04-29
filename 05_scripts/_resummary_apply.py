"""_resummary_apply.py — Phase 2:把 LLM 提案 JSONL 寫回 ## 重點摘要 區塊。

讀 _resummary_proposals/outputs/*.jsonl(每行 {id, new_summary, [reason]}),
按 id 找對應 MD,取代 ## 重點摘要 區塊內容(保留其他區塊與 front-matter)。

安全機制
-------
- 預設 dry-run,`--apply` 才寫
- 跳過 review_level=人工(除非 --include-human)
- 跳過 status=已廢止
- new_summary 為空 / 與舊相同 → no_change
- new_summary > 80 字 → 警告且**不**寫(雙倍上限 buffer,目標 ≤40 字)
- 寫入時:刪除既有 `_(自動初校,待人工潤飾)_` 標記、移除 summary_pending 旗標

用法
----
    python 05_scripts/_resummary_apply.py                   # dry-run,讀全部 outputs/*.jsonl
    python 05_scripts/_resummary_apply.py --apply
    python 05_scripts/_resummary_apply.py --csv             # 順便輸出對照 CSV
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
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"
OUT_DIR = ROOT / "05_scripts" / "_resummary_proposals"
OUTPUTS_DIR = OUT_DIR / "outputs"

MAX_LEN_HARD = 80   # 寫入硬上限(目標 40,給 100% buffer)


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
                if "id" not in rec or "new_summary" not in rec:
                    print(f"  [{p.name}:{ln}] 缺 id 或 new_summary 欄位", file=sys.stderr)
                    continue
                proposals.append(rec)
    return proposals


def replace_summary_block(body: str, new_summary: str) -> str:
    """取代 ## 重點摘要 區塊內容。若不存在,在 ## 條文/函釋/問題 之後插入。"""
    pattern = r"(?ms)^##\s*重點摘要\s*\n(.+?)(?=^##\s|\Z)"
    if re.search(pattern, body):
        return re.sub(
            pattern,
            f"## 重點摘要\n\n{new_summary.strip()}\n\n",
            body,
            count=1,
        )
    # 區塊不存在:在 body 結尾(在 ## 相關規定 / ## 備註 之前)插入
    insert_pattern = r"(?m)^##\s*相關規定"
    insert_m = re.search(insert_pattern, body)
    if insert_m:
        idx = insert_m.start()
        return body[:idx] + f"## 重點摘要\n\n{new_summary.strip()}\n\n" + body[idx:]
    # 找不到,append 到尾
    return body.rstrip() + f"\n\n## 重點摘要\n\n{new_summary.strip()}\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--input", action="append")
    ap.add_argument("--include-human", action="store_true")
    ap.add_argument("--csv", action="store_true")
    ap.add_argument("--show", type=int, default=15)
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
        new_summary = (prop.get("new_summary") or "").strip()
        path = md_index.get(nid)
        if not path:
            stats["missing_md"] += 1
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

        if not new_summary:
            stats["empty"] += 1
            continue
        if len(new_summary) > MAX_LEN_HARD:
            stats["too_long"] += 1
            print(f"  [過長 {len(new_summary)}>{MAX_LEN_HARD}] {nid}: {new_summary[:50]}…")
            continue

        # 撈舊 summary 比對
        old_m = re.search(r"(?ms)^##\s*重點摘要\s*\n(.+?)(?=^##\s|\Z)", body)
        old_summary = old_m.group(1).strip() if old_m else ""
        old_summary_clean = re.sub(r"_\(自動初校,待人工潤飾\)_", "", old_summary).strip()

        if new_summary == old_summary_clean:
            stats["no_change"] += 1
            continue

        rows.append({
            "id": nid,
            "category": nid.split("-")[0],
            "parent": str(fm.get("parent", "")),
            "old_summary": old_summary_clean[:80] + ("…" if len(old_summary_clean) > 80 else ""),
            "new_summary": new_summary,
            "new_len": len(new_summary),
            "reason": prop.get("reason", ""),
            "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        })

        stats["fix"] += 1
        if args.apply:
            new_body = replace_summary_block(body, new_summary)
            # 移除 summary_pending 旗標
            if "summary_pending" in fm:
                del fm["summary_pending"]
            new_text = "---\n" + render_fm(fm) + "\n---\n\n" + new_body.lstrip("\n")
            new_text = new_text.rstrip() + "\n"
            path.write_text(new_text, encoding="utf-8", newline="\n")

    show_n = min(args.show, len(rows))
    for r in rows[:show_n]:
        tag = "[改寫]" if args.apply else "[擬改寫]"
        print(f"  {tag} {r['id']}  ({r['new_len']} 字)")
        print(f"        舊: {r['old_summary']!r}")
        print(f"        新: {r['new_summary']!r}")

    print("─" * 100)
    for k, v in stats.items():
        if v:
            print(f"  {k}: {v}")

    if args.csv:
        csv_path = OUT_DIR / "review.csv"
        with csv_path.open("w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["id", "category", "parent",
                                               "old_summary", "new_summary",
                                               "new_len", "reason", "path"])
            w.writeheader()
            for r in rows:
                w.writerow(r)
        print(f"\n對照表:{csv_path}")

    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
