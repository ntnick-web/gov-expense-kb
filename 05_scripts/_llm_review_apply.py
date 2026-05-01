"""LLM 精校 — 套用 subagent verdicts 到 SSOT。

輸入:_llm_review_proposals/outputs/batch_NN.jsonl(由 subagent 產出,每行一筆 verdict)
規格:每行 JSON {"id": "...", "verdict": "pass|fix|flag", "new_summary": "..."?, "reason": "..."}

動作:
- pass : 把 fm.review_level 改 'llm精校'
- fix  : 替換 ## 重點摘要 內容為 new_summary,清掉「自動初校,待人工潤飾」尾標,
         把 fm.review_level 改 'llm精校'
- flag : 不改 summary,把 fm.review_level 改 'llm待人工'(新值,前端需相應處理 fallback 為「自動初校」樣式)

執行:
    python 05_scripts/_llm_review_apply.py            # dry-run
    python 05_scripts/_llm_review_apply.py --apply    # 真寫入
    python 05_scripts/_llm_review_apply.py --batch 03 # 只跑特定批次
"""
from __future__ import annotations
import sys
import re
import json
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT, MD_ROOT, split_fm, render_fm, walk_md  # noqa: E402

OUTPUTS_DIR = ROOT / "05_scripts" / "_llm_review_proposals" / "outputs"
INPUTS_DIR = ROOT / "05_scripts" / "_llm_review_proposals" / "inputs"
REPORT_PATH = ROOT / "05_scripts" / "_llm_review_proposals" / "apply_report.csv"


def parse_verdicts_from_jsonl(path: Path) -> list[dict]:
    out: list[dict] = []
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln or ln.startswith("//") or ln.startswith("#"):
                continue
            try:
                v = json.loads(ln)
            except json.JSONDecodeError:
                continue
            if v.get("id") and v.get("verdict") in ("pass", "fix", "flag"):
                out.append(v)
    return out


def build_id_to_path(md_files: list[Path]) -> dict[str, Path]:
    """一次性建 id → path map(避免 O(n²) 線性掃描每個 verdict)。"""
    out: dict[str, Path] = {}
    for f in md_files:
        try:
            text = f.read_text(encoding="utf-8")
        except Exception:
            continue
        fm, _ = split_fm(text)
        if fm and (nid := str(fm.get("id", ""))):
            out[nid] = f
    return out


def replace_summary_section(body: str, new_summary: str) -> str:
    """把 ## 重點摘要 區塊內容換掉(保留標題行)。若無此區塊,在最前面插入。"""
    # remove autoreview tail marker if present in new_summary
    new_summary = re.sub(r"_\(自動初校,待人工潤飾\)_", "", new_summary).strip()
    pattern = re.compile(r"(?ms)(^##\s*重點摘要\s*\n)(.+?)(?=^##\s|\Z)")
    if pattern.search(body):
        return pattern.sub(lambda m: m.group(1) + "\n" + new_summary + "\n\n", body)
    # 無 section → 在開頭加(罕見)
    return f"## 重點摘要\n\n{new_summary}\n\n" + body


def apply_one(verdict: dict, md_path: Path, apply: bool) -> dict:
    out = {"id": verdict.get("id"), "verdict": verdict["verdict"], "applied": False, "error": None}
    text = md_path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    if not fm:
        out["error"] = "fm 解析失敗"
        return out
    if str(fm.get("id", "")) != verdict["id"]:
        out["error"] = f"id 不符:{fm.get('id')!r} vs {verdict['id']!r}"
        return out

    new_review_level = {
        "pass": "llm精校",
        "fix": "llm精校",
        "flag": "llm待人工",
    }[verdict["verdict"]]

    fm_changed = fm.get("review_level") != new_review_level
    if fm_changed:
        fm["review_level"] = new_review_level

    body_changed = False
    if verdict["verdict"] == "fix":
        new_sum = (verdict.get("new_summary") or "").strip()
        if new_sum:
            body = replace_summary_section(body, new_sum)
            # 清掉 fm 的 summary_pending(若存在)
            if fm.get("summary_pending"):
                fm.pop("summary_pending", None)
            body_changed = True
        else:
            out["error"] = "fix 但 new_summary 為空"
            return out

    if not (fm_changed or body_changed):
        return out

    if apply:
        new_text = f"---\n{render_fm(fm)}\n---\n\n{body.lstrip()}"
        md_path.write_text(new_text, encoding="utf-8", newline="\n")
    out["applied"] = True
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="實際寫入 SSOT(預設 dry-run)")
    ap.add_argument("--batch", help="只套特定批次(例 03 或 03,07,11);預設所有 batch")
    args = ap.parse_args()

    if not OUTPUTS_DIR.exists():
        print(f"[err] outputs 不存在:{OUTPUTS_DIR}")
        print("先讓 subagent 把 verdicts 寫到 _llm_review_proposals/outputs/batch_NN.jsonl")
        return 1

    batch_filter: set[str] | None = None
    if args.batch:
        batch_filter = {b.strip().zfill(2) for b in args.batch.split(",")}

    output_files = sorted(OUTPUTS_DIR.glob("batch_*.jsonl"))
    if batch_filter:
        output_files = [f for f in output_files if f.stem.split("_")[1] in batch_filter]
    if not output_files:
        print("[err] 找不到任何 outputs/batch_*.jsonl")
        return 1

    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"批次:{len(output_files)} 個")

    md_files = list(walk_md())
    id_to_path = build_id_to_path(md_files)
    print(f"建立 id → path map: {len(id_to_path)} entries")

    counts = {"pass": 0, "fix": 0, "flag": 0, "skipped": 0, "error": 0}
    rows: list[dict] = []
    for of in output_files:
        verdicts = parse_verdicts_from_jsonl(of)
        print(f"\n[{of.stem}] {len(verdicts)} 筆 verdict")
        for v in verdicts:
            md_path = id_to_path.get(v["id"])
            if not md_path:
                counts["error"] += 1
                rows.append({"id": v["id"], "verdict": v["verdict"], "applied": False, "error": "找不到 MD"})
                continue
            res = apply_one(v, md_path, args.apply)
            if res.get("error"):
                counts["error"] += 1
            elif res["applied"]:
                counts[v["verdict"]] += 1
            else:
                counts["skipped"] += 1
            rows.append({**res, "reason": v.get("reason", "")})

    print(f"\n摘要(模式:{'APPLY' if args.apply else 'DRY-RUN'}):")
    for k in ("pass", "fix", "flag", "skipped", "error"):
        print(f"  {k}: {counts[k]}")

    if args.apply:
        import csv
        with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=["id", "verdict", "applied", "error", "reason"])
            wr.writeheader()
            wr.writerows(rows)
        print(f"\n  apply 報告:{REPORT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
