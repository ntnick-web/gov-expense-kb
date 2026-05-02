"""
_cross_topic_apply.py — 套用跨母題歸屬驗證 verdicts

輸入：_cross_topic_proposals/outputs/batch_NN.jsonl
      每行 JSON：{"id":"...","verdict":"confirm|suggest:<母題>|flag","reason":"..."}

動作：
  confirm         : 寫入 fm.cross_topic_verified = true
  suggest:<母題>  : 寫入 fm.cross_topic_suggestion = <母題>，fm.cross_topic_reason = <reason>
                    （不自動修改 parent — 需人工確認後手動遷移，或用 _rename_parent.py）
  flag            : 寫入 fm.cross_topic_flag = true，fm.cross_topic_reason = <reason>

注意：
  本腳本**不**自動修改 parent 欄位，避免未經人工確認的批次遷移。
  若 suggest 結果已人工確認，請在 02_markdown/ 中手動更新 parent/id，
  再用 03_build_index.py 重建索引。

用法：
  python 05_scripts/_cross_topic_apply.py            # dry-run
  python 05_scripts/_cross_topic_apply.py --apply    # 真寫入
  python 05_scripts/_cross_topic_apply.py --batch 03
  python 05_scripts/_cross_topic_apply.py --summary  # 只印摘要，不套用
"""
from __future__ import annotations
import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT, MD_ROOT, split_fm, render_fm, walk_md  # noqa: E402

OUTPUTS_DIR = ROOT / "05_scripts" / "_cross_topic_proposals" / "outputs"
REPORT_PATH = ROOT / "05_scripts" / "_cross_topic_proposals" / "apply_report.csv"

KNOWN_PARENTS = {"國內旅費", "國外旅費", "支出憑證與結報", "酬勞費"}
SUGGEST_RE    = re.compile(r"^suggest:(.+)$")


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
            verdict = v.get("verdict", "")
            if v.get("id") and (
                verdict in ("confirm", "flag")
                or SUGGEST_RE.match(verdict)
            ):
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
    result = {
        "id": verdict["id"], "verdict": verdict["verdict"],
        "applied": False, "error": None,
    }
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
    reason = (verdict.get("reason") or "").strip()
    changed = False

    # 清掉舊的 cross_topic_* 欄位（統一重寫）
    old_keys = {k for k in fm if k.startswith("cross_topic_")}

    if v == "confirm":
        new_fields = {"cross_topic_verified": True}
    elif m := SUGGEST_RE.match(v):
        suggested_parent = m.group(1).strip()
        if suggested_parent not in KNOWN_PARENTS:
            result["error"] = f"suggest 目標非已知母題：{suggested_parent!r}"
            return result
        new_fields = {
            "cross_topic_suggestion": suggested_parent,
            "cross_topic_reason": reason,
        }
    else:  # flag
        new_fields = {
            "cross_topic_flag": True,
            "cross_topic_reason": reason,
        }

    # 比對是否真的有變化
    current_new = {k: fm.get(k) for k in new_fields}
    if current_new != new_fields or old_keys - set(new_fields.keys()):
        for k in old_keys:
            fm.pop(k, None)
        fm.update(new_fields)
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
    ap.add_argument("--apply",   action="store_true", help="實際寫入 SSOT（預設 dry-run）")
    ap.add_argument("--batch",   help="只套特定批次號碼（如 03 或 03,07）")
    ap.add_argument("--summary", action="store_true", help="只印建議摘要，不套用")
    args = ap.parse_args()

    if not OUTPUTS_DIR.exists():
        print(f"[err] outputs 不存在：{OUTPUTS_DIR}")
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

    counts = {"confirm": 0, "suggest": 0, "flag": 0, "skipped": 0, "error": 0}
    rows: list[dict] = []
    suggestions: list[dict] = []

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
            if args.summary:
                if SUGGEST_RE.match(v["verdict"]) or v["verdict"] == "flag":
                    suggestions.append(v)
                continue
            res = apply_one(v, md_path, args.apply)
            if res.get("error"):
                counts["error"] += 1
            elif res["applied"]:
                cat = "suggest" if SUGGEST_RE.match(v["verdict"]) else v["verdict"]
                counts[cat] = counts.get(cat, 0) + 1
            else:
                counts["skipped"] += 1
            rows.append({**res, "reason": v.get("reason", "")})

    if args.summary:
        print(f"\n建議遷移（suggest / flag）：{len(suggestions)} 筆")
        for s in suggestions:
            print(f"  {s['id']:<35} {s['verdict']:<30}  {s.get('reason','')[:60]}")
        return 0

    print(f"\n摘要（模式：{'APPLY' if args.apply else 'DRY-RUN'}）：")
    for k, n in counts.items():
        if n:
            print(f"  {k}: {n}")

    if suggestions_in_rows := [r for r in rows if SUGGEST_RE.match(r.get("verdict", ""))]:
        print(f"\n建議遷移（需人工確認）：")
        for r in suggestions_in_rows:
            print(f"  {r['id']:<35} → {r['verdict']}")
            if r.get("error"):
                print(f"    ⚠ {r['error']}")

    if args.apply:
        with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=["id", "verdict", "applied", "error", "reason"])
            wr.writeheader()
            wr.writerows(rows)
        print(f"\n  apply 報告：{REPORT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
