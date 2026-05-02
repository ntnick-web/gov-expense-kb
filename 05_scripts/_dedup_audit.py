"""
_dedup_audit.py — 重複與完整性檢查（規則式，無 LLM）

偵測以下四類問題：
  1. source_url 重複   : 同一 URL 出現在多個節點
  2. 標題高度相似      : SequenceMatcher ratio > TITLE_SIM_THRESH（同母題內）
  3. A 類條次序號缺號  : 如 001/002/004 表示 003 遺失
  4. C 類公文字號重複  : 同一 doc_no 出現在多個節點

用法
----
  python 05_scripts/_dedup_audit.py              # 掃全部
  python 05_scripts/_dedup_audit.py --parent 酬勞費
  python 05_scripts/_dedup_audit.py --cat A,C
  python 05_scripts/_dedup_audit.py --apply      # 把 dedup_flags 寫入 front-matter
  python 05_scripts/_dedup_audit.py --json       # JSON 輸出（供其他腳本讀取）
"""
from __future__ import annotations
import argparse
import difflib
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

# Windows 主控台強制 UTF-8 輸出
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))
from _common import split_fm, render_fm, walk_md, ROOT, MD_ROOT  # noqa: E402

# 標題相似度閾值（> 此值視為高度相似）
TITLE_SIM_THRESH = 0.90

# 公文字號偵測 pattern（C 類函釋 front-matter）
DOC_NO_FIELDS = ("doc_no", "document_no", "doc_number")


# ─── 全量掃描 ─────────────────────────────────────────────────────────────────

def load_all_records(cats: list[str], parents: list[str]) -> list[dict]:
    """讀取全部符合條件的 MD，回傳 record 清單。"""
    records: list[dict] = []
    for path in walk_md(MD_ROOT):
        # 類別過濾（從路徑推斷）
        parts = path.parts
        cat = parts[-3][0] if len(parts) >= 3 else ""
        if cats and cat not in cats:
            continue
        parent_dir = parts[-2] if len(parts) >= 2 else ""
        if parents and parent_dir not in parents:
            continue

        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        fm, _ = split_fm(text)
        if not fm:
            continue

        node_id = str(fm.get("id", path.stem))
        m = re.match(r"^([ABCDN])-(.+)-(\d{3})$", node_id)
        if not m:
            continue

        records.append({
            "id": node_id,
            "path": str(path.relative_to(ROOT)).replace("\\", "/"),
            "category": m.group(1),
            "parent": m.group(2),
            "serial": int(m.group(3)),
            "title": str(fm.get("title", "")).strip(),
            "source_url": str(fm.get("source_url", "")).strip(),
            "doc_no": _extract_doc_no(fm),
            "status": str(fm.get("status", "現行")),
        })
    return records


def _extract_doc_no(fm: dict) -> str:
    """從 front-matter 抽公文字號（優先 doc_no 欄，次 source_url 中抽）。"""
    for field in DOC_NO_FIELDS:
        val = fm.get(field)
        if val and isinstance(val, str):
            return val.strip()
    return ""


# ─── 四類偵測 ─────────────────────────────────────────────────────────────────

def check_duplicate_url(records: list[dict]) -> list[dict]:
    """偵測 source_url 重複（空值跳過）。"""
    url_to_ids: dict[str, list[str]] = defaultdict(list)
    for r in records:
        if r["source_url"] and r["status"] != "已廢止":
            url_to_ids[r["source_url"]].append(r["id"])
    issues: list[dict] = []
    for url, ids in url_to_ids.items():
        if len(ids) > 1:
            for nid in ids:
                issues.append({
                    "id": nid,
                    "issue": "duplicate_source_url",
                    "detail": f"URL 與 {', '.join(i for i in ids if i != nid)} 重複",
                })
    return issues


def check_similar_titles(records: list[dict]) -> list[dict]:
    """偵測同母題內標題高度相似（> TITLE_SIM_THRESH），跳過 already 廢止節點。"""
    by_parent: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in records:
        if r["title"] and r["status"] != "已廢止":
            key = (r["category"], r["parent"])
            by_parent[key].append(r)

    issues: list[dict] = []
    seen: set[frozenset[str]] = set()
    for recs in by_parent.values():
        for i, a in enumerate(recs):
            for b in recs[i + 1:]:
                pair = frozenset({a["id"], b["id"]})
                if pair in seen:
                    continue
                ratio = difflib.SequenceMatcher(None, a["title"], b["title"]).ratio()
                if ratio > TITLE_SIM_THRESH:
                    seen.add(pair)
                    issues.append({
                        "id": a["id"],
                        "issue": "similar_title",
                        "detail": f"標題與 {b['id']} 相似度 {ratio:.2f}：「{b['title']}」",
                    })
                    issues.append({
                        "id": b["id"],
                        "issue": "similar_title",
                        "detail": f"標題與 {a['id']} 相似度 {ratio:.2f}：「{a['title']}」",
                    })
    return issues


def check_serial_gaps(records: list[dict]) -> list[dict]:
    """偵測 A 類節點在同母題內的序號缺號。"""
    # 只看 A 類
    a_recs = [r for r in records if r["category"] == "A"]
    by_parent: dict[str, list[int]] = defaultdict(list)
    for r in a_recs:
        by_parent[r["parent"]].append(r["serial"])

    issues: list[dict] = []
    for parent, serials in by_parent.items():
        serials_set = set(serials)
        # 序號從 1 到 max，確認無缺失
        max_serial = max(serials_set)
        for expected in range(1, max_serial + 1):
            if expected not in serials_set:
                issues.append({
                    "id": f"[缺號] A-{parent}-{expected:03d}",
                    "issue": "serial_gap",
                    "detail": f"A-{parent} 序號 {expected:03d} 不存在（範圍 001~{max_serial:03d}）",
                })
    return issues


def check_duplicate_doc_no(records: list[dict]) -> list[dict]:
    """偵測 C 類節點公文字號重複。"""
    c_recs = [r for r in records if r["category"] == "C" and r["doc_no"]]
    doc_to_ids: dict[str, list[str]] = defaultdict(list)
    for r in c_recs:
        doc_to_ids[r["doc_no"]].append(r["id"])

    issues: list[dict] = []
    for doc_no, ids in doc_to_ids.items():
        if len(ids) > 1:
            for nid in ids:
                issues.append({
                    "id": nid,
                    "issue": "duplicate_doc_no",
                    "detail": f"公文字號「{doc_no}」與 {', '.join(i for i in ids if i != nid)} 重複",
                })
    return issues


# ─── 彙整 ────────────────────────────────────────────────────────────────────

def run_audit(cats: list[str], parents: list[str]) -> list[dict]:
    records = load_all_records(cats, parents)
    issues: list[dict] = []
    issues += check_duplicate_url(records)
    issues += check_similar_titles(records)
    issues += check_serial_gaps(records)
    issues += check_duplicate_doc_no(records)
    return issues


# ─── apply：寫入 dedup_flags ───────────────────────────────────────────────

def apply_results(issues: list[dict]) -> None:
    """把每個節點的 dedup_flags 清單寫入 front-matter。"""
    by_id: dict[str, list[str]] = defaultdict(list)
    for issue in issues:
        if issue["id"].startswith("["):
            continue  # 缺號等虛擬 ID 跳過
        by_id[issue["id"]].append(f"{issue['issue']}:{issue['detail']}")

    written = 0
    for path in walk_md(MD_ROOT):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        fm, body = split_fm(text)
        if not fm:
            continue
        node_id = str(fm.get("id", ""))
        flags = by_id.get(node_id)
        if not flags:
            # 若之前有標記但現在不再有問題，清掉
            if "dedup_flags" in fm:
                fm.pop("dedup_flags")
                path.write_text(f"---\n{render_fm(fm)}\n---\n\n{body.lstrip()}",
                                encoding="utf-8")
                written += 1
            continue
        current = fm.get("dedup_flags", []) or []
        if sorted(current) == sorted(flags):
            continue
        fm["dedup_flags"] = flags
        path.write_text(f"---\n{render_fm(fm)}\n---\n\n{body.lstrip()}",
                        encoding="utf-8")
        written += 1
    print(f"已寫入 dedup_flags：{written} 個檔案")


# ─── 報告 ────────────────────────────────────────────────────────────────────

ISSUE_ICON = {
    "duplicate_source_url": "🔴",
    "similar_title":        "🟠",
    "serial_gap":           "🟡",
    "duplicate_doc_no":     "🟠",
}


def print_report(issues: list[dict]) -> None:
    by_issue: dict[str, list[dict]] = defaultdict(list)
    for issue in issues:
        by_issue[issue["issue"]].append(issue)

    total = len(issues)
    print(f"\n{'─'*64}")
    print(f"重複與完整性審查報告  （共 {total} 個問題）")
    print(f"{'─'*64}")

    order = ["duplicate_source_url", "duplicate_doc_no", "similar_title", "serial_gap"]
    for itype in order:
        items = by_issue.get(itype, [])
        if not items:
            continue
        icon = ISSUE_ICON.get(itype, "⚠️")
        print(f"\n{icon}  {itype}  ({len(items)} 筆)")
        for item in items:
            print(f"   {item['id']:<35}  {item['detail']}")

    if not issues:
        print("\n✅ 無重複或缺號問題")
    print()


# ─── 主程式 ──────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="重複與完整性檢查（規則式）")
    ap.add_argument("--parent", default="", help="限定母題（逗號分隔）")
    ap.add_argument("--cat",   default="",  help="類別 A/B/C/D，逗號分隔，預設全部")
    ap.add_argument("--apply", action="store_true", help="把 dedup_flags 寫入 front-matter")
    ap.add_argument("--json",  action="store_true", help="JSON 輸出")
    args = ap.parse_args()

    cats    = [c.strip().upper() for c in args.cat.split(",")    if c.strip()]
    parents = [p.strip()         for p in args.parent.split(",") if p.strip()]

    issues = run_audit(cats, parents)

    if args.json:
        print(json.dumps(issues, ensure_ascii=False, indent=2))
    else:
        print_report(issues)

    if args.apply:
        apply_results(issues)

    if issues:
        if not args.json:
            print(f"共 {len(issues)} 個問題，建議處理後重新執行。")
        sys.exit(2)


if __name__ == "__main__":
    main()
