"""
_source_audit_apply.py — 套用 Haiku 來源品質審查 verdicts 到 SSOT

輸入：_source_audit_proposals/outputs/batch_NN.jsonl
      每行 JSON：{"id":"...","verdict":"ok|amendment_only|truncated|placeholder|rate_table_only","reason":"..."}

動作：
  - ok              : 寫入 fm.source_quality = 'ok'，清掉 source_quality_signals（若存在）
  - 其餘 verdict    : 寫入 fm.source_quality = <verdict>，fm.source_quality_reason = <reason>

用法：
  python 05_scripts/_source_audit_apply.py            # dry-run
  python 05_scripts/_source_audit_apply.py --apply    # 真寫入
  python 05_scripts/_source_audit_apply.py --batch 03
"""
from __future__ import annotations
import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT, MD_ROOT, split_fm, render_fm, walk_md  # noqa: E402

OUTPUTS_DIR  = ROOT / "05_scripts" / "_source_audit_proposals" / "outputs"
REPORT_PATH  = ROOT / "05_scripts" / "_source_audit_proposals" / "apply_report.csv"

VALID_VERDICTS = {"ok", "amendment_only", "truncated", "placeholder", "rate_table_only"}


def parse_verdicts(path: Path) -> list[dict]:
    out: list[dict] = []
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln or ln.startswith("#") or ln.startswith("//"):
                continue
            try:
                v = json.loads(ln)
            except json.JSONDecodeError:
                continue
            if v.get("id") and v.get("verdict") in VALID_VERDICTS:
                out.append(v)
    return out


def build_id_to_path(md_files: list[Path]) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for f in md_files:
        try:
            text = f.read_text(encoding="utf-8")
        except OSError:
            continue
        fm, _ = split_fm(text)
        if fm and (nid := str(fm.get("id", ""))):
            out[nid] = f
    return out


def apply_one(verdict: dict, md_path: Path, apply: bool) -> dict:
    result = {"id": verdict["id"], "verdict": verdict["verdict"], "applied": False, "error": None}
    try:
        text = md_path.read_text(encoding="utf-8")
    except OSError as e:
        result["error"] = str(e)
        return result
    fm, body = split_fm(text)
    if not fm:
        result["error"] = "fm 解析失敗"
        return result
    if str(fm.get("id", "")) != verdict["id"]:
        result["error"] = f"id 不符：{fm.get('id')!r}"
        return result

    v = verdict["verdict"]
    changed = False

    if fm.get("source_quality") != v:
        fm["source_quality"] = v
        changed = True

    if v == "ok":
        # 清掉舊信號
        for key in ("source_quality_signals", "source_quality_reason"):
            if key in fm:
                fm.pop(key)
                changed = True
    else:
        reason = (verdict.get("reason") or "").strip()
        if reason and fm.get("source_quality_reason") != reason:
            fm["source_quality_reason"] = reason
            changed = True

    if not changed:
        return result

    if apply:
        new_text = f"---\n{render_fm(fm)}\n---\n\n{body.lstrip()}"
        md_path.write_text(new_text, encoding="utf-8", newline="\n")
    result["applied"] = True
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="實際寫入 SSOT（預設 dry-run）")
    ap.add_argument("--batch", help="只套特定批次號碼，如 03 或 03,07；預設全部")
    args = ap.parse_args()

    if not OUTPUTS_DIR.exists():
        print(f"[err] outputs 不存在：{OUTPUTS_DIR}")
        print("請先讓 subagent 把 verdicts 寫到 _source_audit_proposals/outputs/batch_NN.jsonl")
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

    print(f"模式：{'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"批次：{len(output_files)} 個")

    md_files = list(walk_md())
    id_to_path = build_id_to_path(md_files)
    print(f"建立 id → path map：{len(id_to_path)} entries")

    counts: dict[str, int] = {v: 0 for v in VALID_VERDICTS}
    counts.update({"skipped": 0, "error": 0})
    rows: list[dict] = []

    for of in output_files:
        verdicts = parse_verdicts(of)
        print(f"\n[{of.stem}] {len(verdicts)} 筆 verdict")
        for v in verdicts:
            md_path = id_to_path.get(v["id"])
            if not md_path:
                counts["error"] += 1
                rows.append({"id": v["id"], "verdict": v["verdict"],
                             "applied": False, "error": "找不到 MD"})
                continue
            res = apply_one(v, md_path, args.apply)
            if res.get("error"):
                counts["error"] += 1
            elif res["applied"]:
                counts[v["verdict"]] = counts.get(v["verdict"], 0) + 1
            else:
                counts["skipped"] += 1
            rows.append({**res, "reason": v.get("reason", "")})

    print(f"\n摘要（模式：{'APPLY' if args.apply else 'DRY-RUN'}）：")
    for k, n in counts.items():
        if n:
            print(f"  {k}: {n}")

    if args.apply:
        with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=["id", "verdict", "applied", "error", "reason"])
            wr.writeheader()
            wr.writerows(rows)
        print(f"\n  apply 報告：{REPORT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
