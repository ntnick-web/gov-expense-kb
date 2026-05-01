"""為酬勞費 50 卡專用 retitle 切批次工具。

輸入:`02_markdown/{A,B,C,D}_*/酬勞費/*.md`
輸出:`05_scripts/_retitle_proposals/inputs/batch_NN.jsonl`(每批 25 筆)

相對 _retitle_build_batches.py:
  - 只看酬勞費母題
  - 不論 review_level 全納入
  - 過濾條件:current_title 含 TODO / 「第?」 / 含「支標手冊 / 第壹篇」 / 過長 > 25
"""
from __future__ import annotations
import sys
import json
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT, MD_ROOT, split_fm, extract_section, first_section, walk_md  # noqa: E402

OUT_DIR = ROOT / "05_scripts" / "_retitle_proposals"
INPUTS_DIR = OUT_DIR / "inputs"
BATCH_SIZE = 25
BODY_MAX = 1200

SECTIONS_BY_CAT = {
    "A": ("條文全文",),
    "B": ("標準全文", "條文全文"),
    "C": ("函釋全文", "標準全文"),
    "D": ("問題", "回答"),
}


def needs_retitle(title: str) -> bool:
    if not title:
        return True
    t = title.strip().strip("'").strip('"')
    if "TODO" in t:
        return True
    if "第?" in t or "第?條" in t:
        return True
    if t.startswith("支標手冊"):
        return True
    if len(t) > 25:
        return True
    if t.endswith(("、", "(", "（", "...", "：", "，")):
        return True
    return False


def build_record(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    if not fm:
        return None
    cid = fm.get("id", "")
    if not cid or not cid.split("-")[0] in ("A", "B", "C", "D"):
        return None
    cat = cid.split("-")[0]
    parent = fm.get("parent", "")
    if parent != "酬勞費":
        return None
    title = fm.get("title", "").strip().strip("'").strip('"')
    if not needs_retitle(title):
        return None

    # 抽出 body 主要區塊
    sections = SECTIONS_BY_CAT.get(cat, ("條文全文",))
    body_text = first_section(body, sections)
    summary = extract_section(body, "重點摘要").strip()
    summary = re.sub(r"_\(自動初校,待人工潤飾\)_", "", summary).strip()
    if not body_text:
        body_text = summary
    body_text = re.sub(r"\n{3,}", "\n\n", body_text).strip()
    if len(body_text) > BODY_MAX:
        body_text = body_text[:BODY_MAX].rstrip() + "…"

    serial_m = re.search(r"-(\d+)$", cid)
    serial = int(serial_m.group(1)) if serial_m else 0

    return {
        "id": cid,
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "type": fm.get("type", ""),
        "category": cat,
        "parent": parent,
        "serial": serial,
        "current_title": title,
        "summary": summary[:200],
        "body_excerpt": body_text,
    }


def main() -> int:
    INPUTS_DIR.mkdir(parents=True, exist_ok=True)
    for p in INPUTS_DIR.glob("batch_*.jsonl"):
        p.unlink()

    # 收集需 retitle 的酬勞費卡
    candidates: list[dict] = []
    for f in MD_ROOT.rglob("*.md"):
        if "酬勞費" not in str(f):
            continue
        rec = build_record(f)
        if rec:
            candidates.append(rec)

    candidates.sort(key=lambda r: (r["category"], r["serial"]))
    print(f"酬勞費 retitle 候選:{len(candidates)} 筆")

    batches: list[dict] = []
    for i in range(0, len(candidates), BATCH_SIZE):
        batch_no = i // BATCH_SIZE + 1
        chunk = candidates[i:i + BATCH_SIZE]
        out_path = INPUTS_DIR / f"batch_remu_{batch_no:02d}.jsonl"
        with out_path.open("w", encoding="utf-8", newline="\n") as fh:
            for rec in chunk:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        batches.append({"batch": batch_no, "count": len(chunk), "ids": [r["id"] for r in chunk]})
        print(f"  批 {batch_no:02d}: {len(chunk)} 筆 → {out_path.name}")

    manifest = OUT_DIR / "manifest_remuneration.json"
    manifest.write_text(json.dumps({
        "total": len(candidates),
        "batch_size": BATCH_SIZE,
        "batches": batches,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest: {manifest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
