"""_retitle_build_batches.py — 為 LLM 重抽 title 任務切批次。

掃 02_markdown/,排除人工精校與已廢止,把每張卡的關鍵內容(現有 title、摘要、
條文/函釋/問答主體前 N 字)序列化為 JSONL,每 batch_size 筆一檔。

輸出位置:05_scripts/_retitle_proposals/inputs/batch_NN.jsonl
        05_scripts/_retitle_proposals/manifest.json (彙總統計)

每筆 record 結構:
{
  "id": "C-國內旅費-006",
  "path": "02_markdown/C_解釋函令/國內旅費/C006_xxx.md",
  "type": "解釋函令",
  "category": "C",
  "parent": "國內旅費",
  "serial": 6,
  "current_title": "彙編更新原則",
  "summary": "...",
  "body_excerpt": "...前 800 字..."
}

用法
----
    python 05_scripts/_retitle_build_batches.py            # 預設 batch_size=30
    python 05_scripts/_retitle_build_batches.py --batch-size 50
    python 05_scripts/_retitle_build_batches.py --include-human  # 含 review_level=人工
"""

from __future__ import annotations

import argparse
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
INPUTS_DIR = OUT_DIR / "inputs"

BODY_MAX = 800  # body_excerpt 取前 N 字
SUMMARY_MAX = 400


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


SECTIONS_BY_CAT = {
    "A": ("條文全文",),
    "B": ("標準全文", "條文全文"),
    "C": ("函釋全文", "標準全文"),
    "D": ("問題", "回答"),
}


def clean_excerpt(text: str, limit: int) -> str:
    text = text.strip()
    text = re.sub(r"_\(自動初校,待人工潤飾\)_", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if len(text) > limit:
        text = text[:limit].rstrip() + "…"
    return text


def build_record(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    if not fm:
        return None
    node_id = str(fm.get("id", ""))
    m = re.match(r"^([ABCD])-([^-]+)-(\d{3})$", node_id)
    if not m:
        return None
    category, parent, serial_str = m.group(1), m.group(2), m.group(3)

    sections = SECTIONS_BY_CAT.get(category, ())
    body_section = first_section(body, sections)
    summary_section = extract_section(body, "重點摘要")

    rec = {
        "id": node_id,
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "type": str(fm.get("type", "")),
        "category": category,
        "parent": parent,
        "serial": int(serial_str),
        "current_title": str(fm.get("title", "")),
        "summary": clean_excerpt(summary_section, SUMMARY_MAX),
        "body_excerpt": clean_excerpt(body_section, BODY_MAX),
        "tags": fm.get("tags", []) or [],
        "review_level": str(fm.get("review_level", "")),
        "status": str(fm.get("status", "現行")),
    }
    return rec


def should_skip(rec: dict, include_human: bool) -> tuple[bool, str]:
    if rec["status"] == "已廢止":
        return True, "已廢止"
    if not include_human and rec["review_level"] == "人工":
        return True, "人工精校"
    if not rec["body_excerpt"] and not rec["summary"]:
        return True, "無內文"
    return False, ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--batch-size", type=int, default=30)
    ap.add_argument("--include-human", action="store_true",
                    help="預設跳過 review_level=人工 的卡;加此旗標連人工卡也送進批次")
    ap.add_argument("--clean", action="store_true",
                    help="清空 inputs/ 重建")
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    INPUTS_DIR.mkdir(parents=True, exist_ok=True)
    if args.clean:
        for p in INPUTS_DIR.glob("batch_*.jsonl"):
            p.unlink()

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")

    candidates: list[dict] = []
    skipped = {"已廢止": 0, "人工精校": 0, "無內文": 0}
    errors = 0

    for f in files:
        rec = build_record(f)
        if not rec:
            errors += 1
            continue
        skip, reason = should_skip(rec, args.include_human)
        if skip:
            skipped[reason] += 1
            continue
        candidates.append(rec)

    print(f"候選:{len(candidates)} 份")
    for k, v in skipped.items():
        print(f"  跳過({k}):{v}")
    if errors:
        print(f"  解析失敗:{errors}")

    # 按 id 排序好讓批次穩定可重現
    candidates.sort(key=lambda r: (r["category"], r["parent"], r["serial"]))

    # 寫批次
    batch_size = args.batch_size
    batches: list[dict] = []
    for i in range(0, len(candidates), batch_size):
        batch_no = i // batch_size + 1
        chunk = candidates[i:i + batch_size]
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
        "total_candidates": len(candidates),
        "batch_size": batch_size,
        "batch_count": len(batches),
        "skipped": skipped,
        "include_human": args.include_human,
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
