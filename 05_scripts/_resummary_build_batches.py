"""_resummary_build_batches.py — Phase 2 切批次:重寫 summary 為情境句型。

跟 _retitle_build_batches.py 結構一樣,但
- 帶上**已重抽過**的新 title(供 agent 參考核心關鍵字)
- 加 retitle 階段的 reason(若 review.csv 有)
- 輸出到不同資料夾

每筆 record:
{
  "id": "...",
  "category": "C",
  "parent": "國內旅費",
  "serial": 6,
  "title": "新版 title",         # ← retitle 之後的版本
  "retitle_reason": "...",       # ← 從 review.csv 撈
  "current_summary": "...",      # ← 目前 ## 重點摘要 區塊全文
  "body_excerpt": "...前 1200 字...",
  "tags": [...]
}
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
RETITLE_REVIEW_CSV = ROOT / "05_scripts" / "_retitle_proposals" / "review.csv"
OUT_DIR = ROOT / "05_scripts" / "_resummary_proposals"
INPUTS_DIR = OUT_DIR / "inputs"

BODY_MAX = 1200    # body_excerpt 多給一些字,以便寫好 summary

SECTIONS_BY_CAT = {
    "A": ("條文全文",),
    "B": ("標準全文", "條文全文"),
    "C": ("函釋全文", "標準全文"),
    "D": ("問題", "回答"),
}


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


def extract_section(body: str, heading: str) -> str:
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    return m.group(1).strip() if m else ""


def first_section(body: str, headings: tuple[str, ...]) -> str:
    for h in headings:
        s = extract_section(body, h)
        if s:
            return s
    return ""


def clean_excerpt(text: str, limit: int) -> str:
    text = text.strip()
    text = re.sub(r"_\(自動初校,待人工潤飾\)_", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if len(text) > limit:
        text = text[:limit].rstrip() + "…"
    return text


def load_retitle_reasons() -> dict[str, str]:
    """從 review.csv 讀 retitle 階段的 reason 欄位,作為 hint。"""
    if not RETITLE_REVIEW_CSV.exists():
        return {}
    out: dict[str, str] = {}
    with RETITLE_REVIEW_CSV.open("r", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            nid = r.get("id")
            note = r.get("note") or ""
            if nid:
                out[nid] = note
    return out


def build_record(path: Path, retitle_reasons: dict[str, str]) -> dict | None:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    if not fm:
        return None
    nid = str(fm.get("id", ""))
    m = re.match(r"^([ABCDN])-([^-]+)-(\d{3})$", nid)
    if not m:
        return None
    category, parent, serial_str = m.group(1), m.group(2), m.group(3)

    sections = SECTIONS_BY_CAT.get(category, ())
    body_section = first_section(body, sections)
    summary_section = extract_section(body, "重點摘要")

    return {
        "id": nid,
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "type": str(fm.get("type", "")),
        "category": category,
        "parent": parent,
        "serial": int(serial_str),
        "title": str(fm.get("title", "")),
        "retitle_reason": retitle_reasons.get(nid, ""),
        "current_summary": clean_excerpt(summary_section, 600),
        "body_excerpt": clean_excerpt(body_section, BODY_MAX),
        "tags": fm.get("tags", []) or [],
        "review_level": str(fm.get("review_level", "")),
        "status": str(fm.get("status", "現行")),
    }


def should_skip(rec: dict) -> tuple[bool, str]:
    if rec["status"] == "已廢止":
        return True, "已廢止"
    if rec["review_level"] == "人工":
        return True, "人工精校"
    if not rec["body_excerpt"] and not rec["current_summary"]:
        return True, "無內文"
    return False, ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--batch-size", type=int, default=30)
    ap.add_argument("--clean", action="store_true")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    INPUTS_DIR.mkdir(parents=True, exist_ok=True)
    if args.clean:
        for p in INPUTS_DIR.glob("batch_*.jsonl"):
            p.unlink()

    retitle_reasons = load_retitle_reasons()
    print(f"從 {RETITLE_REVIEW_CSV.name} 載入 {len(retitle_reasons)} 筆 retitle reason")

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")

    candidates: list[dict] = []
    skipped = {"已廢止": 0, "人工精校": 0, "無內文": 0}
    errors = 0

    for f in files:
        rec = build_record(f, retitle_reasons)
        if not rec:
            errors += 1
            continue
        skip, reason = should_skip(rec)
        if skip:
            skipped[reason] += 1
            continue
        candidates.append(rec)

    print(f"候選:{len(candidates)} 份")
    for k, v in skipped.items():
        print(f"  跳過({k}):{v}")
    if errors:
        print(f"  解析失敗:{errors}")

    candidates.sort(key=lambda r: (r["category"], r["parent"], r["serial"]))

    batches: list[dict] = []
    for i in range(0, len(candidates), args.batch_size):
        batch_no = i // args.batch_size + 1
        chunk = candidates[i:i + args.batch_size]
        out_path = INPUTS_DIR / f"batch_{batch_no:02d}.jsonl"
        with out_path.open("w", encoding="utf-8", newline="\n") as fh:
            for rec in chunk:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        batches.append({
            "batch": batch_no,
            "input": str(out_path.relative_to(ROOT)).replace("\\", "/"),
            "count": len(chunk),
            "ids": [r["id"] for r in chunk],
        })
        print(f"  寫 batch_{batch_no:02d}.jsonl ({len(chunk)} 筆)")

    manifest = {
        "phase": "Phase 2 — summary 重寫",
        "total_candidates": len(candidates),
        "batch_size": args.batch_size,
        "batch_count": len(batches),
        "skipped": skipped,
        "batches": batches,
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nmanifest:{OUT_DIR / 'manifest.json'}")
    print(f"批次數:{len(batches)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
