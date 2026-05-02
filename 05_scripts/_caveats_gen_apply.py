"""
_caveats_gen_apply.py — 套用 Caveats 生成 verdicts 到情境來源檔

輸入：_caveats_proposals/outputs/batch_NN.jsonl
      每行 JSON：
      {
        "id": "overnight",
        "caveats": [{"text":"...","severity":"stop|warn|info","legal_ref":"A-xxx-001"},...],
        "reason": "..."
      }

動作：
  - 找到對應情境在 04_web/data/scenarios/{domestic,abroad,voucher}.json
  - 如情境已有 caveats：合併（去重文字），不覆蓋已有內容
  - 如情境無 caveats：直接寫入

注意：
  本腳本**不**修改 scenarios_manual.json（由 CI 的 _build_scenarios_manual.py 重新合併）。

用法：
  python 05_scripts/_caveats_gen_apply.py            # dry-run
  python 05_scripts/_caveats_gen_apply.py --apply    # 真寫入
  python 05_scripts/_caveats_gen_apply.py --batch 02
  python 05_scripts/_caveats_gen_apply.py --overwrite  # 覆蓋已有 caveats（謹慎使用）
"""
from __future__ import annotations
import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT  # noqa: E402

OUTPUTS_DIR  = ROOT / "05_scripts" / "_caveats_proposals" / "outputs"
REPORT_PATH  = ROOT / "05_scripts" / "_caveats_proposals" / "apply_report.csv"

SCENARIOS_DIR = ROOT / "04_web" / "data" / "scenarios"

# 母題 → 來源 JSON 對應表
PARENT_TO_FILE: dict[str, Path] = {
    "國內旅費":      SCENARIOS_DIR / "domestic.json",
    "國外旅費":      SCENARIOS_DIR / "abroad.json",
    "支出憑證與結報": SCENARIOS_DIR / "voucher.json",
    "酬勞費":        SCENARIOS_DIR / "voucher.json",  # 暫歸 voucher，待建立獨立母題
}

VALID_SEVERITIES = {"stop", "warn", "info"}


def load_source_files() -> dict[str, dict]:
    """載入所有來源 JSON 檔（path → data）。"""
    loaded: dict[str, dict] = {}
    for path in SCENARIOS_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            loaded[str(path)] = data
        except Exception as e:
            print(f"[warn] 無法讀取 {path.name}：{e}")
    return loaded


def find_scenario(sc_id: str, sources: dict[str, dict]) -> tuple[str, dict] | None:
    """在所有來源檔中尋找指定 id 的情境，回傳 (file_path, scenario_dict) 或 None。"""
    for fpath, data in sources.items():
        for sc in data.get("scenarios", []):
            if sc.get("id") == sc_id:
                return fpath, sc
    return None


def validate_caveats(caveats: list) -> tuple[list[dict], list[str]]:
    """驗證 caveats 格式，回傳 (valid_caveats, errors)。"""
    valid: list[dict] = []
    errors: list[str] = []
    if not isinstance(caveats, list):
        errors.append("caveats 非 list")
        return valid, errors
    for i, c in enumerate(caveats):
        if not isinstance(c, dict):
            errors.append(f"caveats[{i}] 非 dict")
            continue
        text = (c.get("text") or "").strip()
        severity = (c.get("severity") or "").strip()
        legal_ref = (c.get("legal_ref") or "").strip()
        if not text:
            errors.append(f"caveats[{i}].text 為空")
            continue
        if severity not in VALID_SEVERITIES:
            errors.append(f"caveats[{i}].severity={severity!r} 非合法值")
            continue
        entry: dict = {"text": text, "severity": severity}
        if legal_ref:
            entry["legal_ref"] = legal_ref
        valid.append(entry)
    return valid, errors


def merge_caveats(existing: list[dict], new_items: list[dict]) -> list[dict]:
    """合併 caveats，以 text 去重（已存在的不覆蓋）。"""
    existing_texts = {c.get("text", "") for c in existing}
    merged = list(existing)
    for item in new_items:
        if item.get("text", "") not in existing_texts:
            merged.append(item)
            existing_texts.add(item.get("text", ""))
    return merged


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
            if v.get("id") and "caveats" in v:
                out.append(v)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply",     action="store_true", help="實際寫入來源 JSON（預設 dry-run）")
    ap.add_argument("--batch",     help="只套特定批次號碼，如 02 或 02,05")
    ap.add_argument("--overwrite", action="store_true",
                    help="覆蓋已有 caveats（預設合併模式）")
    args = ap.parse_args()

    if not OUTPUTS_DIR.exists():
        print(f"[err] outputs 不存在：{OUTPUTS_DIR}")
        print("請先讓 subagent 把結果寫到 _caveats_proposals/outputs/batch_NN.jsonl")
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

    # 載入所有來源 JSON（一次性）
    sources = load_source_files()
    print(f"載入 {len(sources)} 個來源 JSON")

    counts = {"written": 0, "merged": 0, "skipped": 0, "error": 0}
    rows: list[dict] = []
    # 追蹤哪些檔案需要重寫
    dirty_files: set[str] = set()

    for of in output_files:
        verdicts = parse_verdicts(of)
        print(f"\n[{of.stem}] {len(verdicts)} 筆 verdict")
        for v in verdicts:
            sc_id = v["id"]
            raw_caveats = v.get("caveats", [])
            reason = (v.get("reason") or "").strip()

            found = find_scenario(sc_id, sources)
            if not found:
                counts["error"] += 1
                rows.append({"id": sc_id, "status": "error",
                             "detail": "在來源 JSON 中找不到此情境 id"})
                continue

            fpath, sc = found
            valid_caveats, errs = validate_caveats(raw_caveats)
            if errs:
                counts["error"] += 1
                rows.append({"id": sc_id, "status": "error", "detail": "; ".join(errs)})
                continue

            if not valid_caveats:
                counts["skipped"] += 1
                rows.append({"id": sc_id, "status": "skipped", "detail": "空陣列，跳過"})
                continue

            existing = sc.get("caveats") or []
            if args.overwrite or not existing:
                final_caveats = valid_caveats
                action = "written"
            else:
                final_caveats = merge_caveats(existing, valid_caveats)
                action = "merged" if len(final_caveats) > len(existing) else "skipped"

            if action == "skipped":
                counts["skipped"] += 1
                rows.append({"id": sc_id, "status": "skipped",
                             "detail": f"全部 {len(valid_caveats)} 條已存在，無需更新"})
                continue

            if args.apply:
                sc["caveats"] = final_caveats
                dirty_files.add(fpath)

            counts[action] = counts.get(action, 0) + 1
            rows.append({
                "id": sc_id, "status": action,
                "detail": f"{len(final_caveats)} 條 caveats（新增 {len(final_caveats)-len(existing)} 條）",
                "reason": reason,
            })

    # 批次寫回來源 JSON
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
