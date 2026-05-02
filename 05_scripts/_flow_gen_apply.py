"""
_flow_gen_apply.py — 套用 Decision Tree 生成 verdicts 到情境來源檔

輸入：_flow_proposals/outputs/batch_NN.jsonl
      每行 JSON：
      {
        "id": "taxi",
        "flow": { "start":"Q1", "questions":{...}, "conclusions":{...} },
        "reason": "..."
      }
      若 flow == null，表示法源不足，跳過此情境。

驗證規則（每個 verdict 套用前）：
  1. flow.start 必須存在於 questions 中
  2. 每個 option 的 next/conclude 必須指向已存在的 question/conclusion key
  3. 每個 conclusion.refs 的節點 ID 必須符合格式（不驗證是否在 nodes.json，避免依賴）
  4. conclusions 必須非空

注意：
  本腳本**不**修改 scenarios_manual.json（由 CI 的 _build_scenarios_manual.py 重新合併）。

用法：
  python 05_scripts/_flow_gen_apply.py            # dry-run
  python 05_scripts/_flow_gen_apply.py --apply    # 真寫入
  python 05_scripts/_flow_gen_apply.py --batch 03
  python 05_scripts/_flow_gen_apply.py --force    # 覆蓋已有 flow（謹慎使用）
"""
from __future__ import annotations
import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT  # noqa: E402

OUTPUTS_DIR = ROOT / "05_scripts" / "_flow_proposals" / "outputs"
REPORT_PATH = ROOT / "05_scripts" / "_flow_proposals" / "apply_report.csv"
SCENARIOS_DIR = ROOT / "04_web" / "data" / "scenarios"

PARENT_TO_FILE: dict[str, Path] = {
    "國內旅費":      SCENARIOS_DIR / "domestic.json",
    "國外旅費":      SCENARIOS_DIR / "abroad.json",
    "支出憑證與結報": SCENARIOS_DIR / "voucher.json",
    "酬勞費":        SCENARIOS_DIR / "voucher.json",
}

NODE_ID_RE = re.compile(r"^[ABCDN]-[^-]+-\d{3}$")


def load_source_files() -> dict[str, dict]:
    loaded: dict[str, dict] = {}
    for path in SCENARIOS_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            loaded[str(path)] = data
        except Exception as e:
            print(f"[warn] 無法讀取 {path.name}：{e}")
    return loaded


def find_scenario(sc_id: str, sources: dict[str, dict]) -> tuple[str, dict] | None:
    for fpath, data in sources.items():
        for sc in data.get("scenarios", []):
            if sc.get("id") == sc_id:
                return fpath, sc
    return None


def validate_flow(flow: dict) -> list[str]:
    """驗證 flow 結構，回傳錯誤清單（空 = 合法）。"""
    errors: list[str] = []
    if not isinstance(flow, dict):
        errors.append("flow 非 dict")
        return errors

    questions = flow.get("questions")
    conclusions = flow.get("conclusions")
    start = flow.get("start")

    if not isinstance(questions, dict) or not questions:
        errors.append("questions 為空或非 dict")
        return errors
    if not isinstance(conclusions, dict) or not conclusions:
        errors.append("conclusions 為空或非 dict")
        return errors
    if not start:
        errors.append("start 為空")
        return errors
    if start not in questions:
        errors.append(f"start={start!r} 不在 questions 中")

    all_q_keys = set(questions.keys())
    all_c_keys = set(conclusions.keys())

    for qkey, qval in questions.items():
        if not isinstance(qval, dict):
            errors.append(f"questions.{qkey} 非 dict")
            continue
        label = qval.get("label", "")
        if not label:
            errors.append(f"questions.{qkey}.label 為空")
        options = qval.get("options")
        if not isinstance(options, list) or not options:
            errors.append(f"questions.{qkey}.options 為空")
            continue
        for i, opt in enumerate(options):
            if not isinstance(opt, dict):
                errors.append(f"questions.{qkey}.options[{i}] 非 dict")
                continue
            has_next    = "next"    in opt
            has_conclude = "conclude" in opt
            if not (has_next or has_conclude):
                errors.append(f"questions.{qkey}.options[{i}] 缺 next 或 conclude")
                continue
            if has_next and opt["next"] not in all_q_keys:
                errors.append(f"questions.{qkey}.options[{i}].next={opt['next']!r} 不在 questions")
            if has_conclude and opt["conclude"] not in all_c_keys:
                errors.append(f"questions.{qkey}.options[{i}].conclude={opt['conclude']!r} 不在 conclusions")

    for ckey, cval in conclusions.items():
        if not isinstance(cval, dict):
            errors.append(f"conclusions.{ckey} 非 dict")
            continue
        if not cval.get("title"):
            errors.append(f"conclusions.{ckey}.title 為空")
        refs = cval.get("refs") or []
        if isinstance(refs, list):
            for ref in refs:
                if ref and not NODE_ID_RE.match(str(ref)):
                    errors.append(f"conclusions.{ckey}.refs 中 {ref!r} 格式不符")

    return errors


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
            if v.get("id"):
                out.append(v)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="實際寫入來源 JSON（預設 dry-run）")
    ap.add_argument("--batch", help="只套特定批次號碼，如 03 或 03,05")
    ap.add_argument("--force", action="store_true", help="覆蓋已有 flow（預設跳過）")
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

    sources = load_source_files()
    print(f"載入 {len(sources)} 個來源 JSON")

    counts = {"written": 0, "skipped": 0, "null_skipped": 0, "error": 0}
    rows: list[dict] = []
    dirty_files: set[str] = set()

    for of in output_files:
        verdicts = parse_verdicts(of)
        print(f"\n[{of.stem}] {len(verdicts)} 筆 verdict")
        for v in verdicts:
            sc_id = v["id"]
            flow = v.get("flow")
            reason = (v.get("reason") or "").strip()

            if flow is None:
                counts["null_skipped"] += 1
                rows.append({"id": sc_id, "status": "null_skipped",
                             "detail": f"flow=null：{reason}"})
                continue

            found = find_scenario(sc_id, sources)
            if not found:
                counts["error"] += 1
                rows.append({"id": sc_id, "status": "error",
                             "detail": "在來源 JSON 中找不到此情境 id"})
                continue

            fpath, sc = found

            if sc.get("flow") and not args.force:
                counts["skipped"] += 1
                rows.append({"id": sc_id, "status": "skipped",
                             "detail": "已有 flow（用 --force 覆蓋）"})
                continue

            errs = validate_flow(flow)
            if errs:
                counts["error"] += 1
                detail = "; ".join(errs[:3])
                rows.append({"id": sc_id, "status": "error", "detail": detail})
                print(f"  ⚠ {sc_id}: {detail}")
                continue

            if args.apply:
                sc["flow"] = flow
                dirty_files.add(fpath)

            counts["written"] += 1
            rows.append({
                "id": sc_id, "status": "written",
                "detail": (f"{len(flow.get('questions',{}))} 問 / "
                           f"{len(flow.get('conclusions',{}))} 結論"),
                "reason": reason,
            })

    if args.apply and dirty_files:
        for fpath in dirty_files:
            data = sources[fpath]
            Path(fpath).write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8", newline="\n"
            )
        print(f"\n已重寫 {len(dirty_files)} 個來源 JSON 檔")
        print("  下一步：執行 python 05_scripts/_build_scenarios_manual.py --apply 重新合併")

    print(f"\n摘要（模式：{'APPLY' if args.apply else 'DRY-RUN'}）：")
    for k, n in counts.items():
        if n:
            print(f"  {k}: {n}")

    if args.apply:
        with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=["id", "status", "detail", "reason"],
                                extrasaction="ignore")
            wr.writeheader()
            wr.writerows(rows)
        print(f"\n  apply 報告：{REPORT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
