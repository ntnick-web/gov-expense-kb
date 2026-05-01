"""法源審查自動檢查 — 對 scenarios_manual.json 執行 5 項檢查。

依 docs/_review_log.md 第 1 章 SOP:
- 每 primary_id / legal_ref / flow.refs 必須在 nodes.json 找到
- 違反者列出供人工處理(不自動修)

執行:
    python 05_scripts/_audit_scenario_sources.py            # 預設輸出到 stdout
    python 05_scripts/_audit_scenario_sources.py --strict   # 有錯時 exit 2
    python 05_scripts/_audit_scenario_sources.py -o report.txt
"""
from __future__ import annotations
import sys
import json
import argparse
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT, INDEX_ROOT, WEB_ROOT  # noqa: E402

NODES_JSON = INDEX_ROOT / "nodes.json"
SCENARIOS_JSON = WEB_ROOT / "data" / "scenarios_manual.json"

# ─────────────────────────────────────────────────────────────
# 檢查項目
# ─────────────────────────────────────────────────────────────

def check_primary_ids_exist(scenarios: list, node_ids: set) -> list[str]:
    """C1: primary_ids 全部要在 nodes.json"""
    issues = []
    for s in scenarios:
        for pid in s.get("primary_ids", []):
            if pid not in node_ids:
                issues.append(f"[C1] {s['id']}: primary_id {pid!r} 不存在於 nodes.json")
    return issues


def check_caveats_legal_ref(scenarios: list, node_ids: set) -> list[str]:
    """C2: caveats[].legal_ref(若有)必須在 nodes.json,且 stop/warn 嚴重度應有 legal_ref"""
    issues = []
    for s in scenarios:
        for i, c in enumerate(s.get("caveats", [])):
            severity = c.get("severity", "info")
            ref = c.get("legal_ref")
            if severity in ("stop", "warn") and not ref:
                issues.append(
                    f"[C2-warn] {s['id']}: caveats[{i}] severity={severity} 但無 legal_ref"
                    f" — 文字: {c.get('text', '')[:40]}…"
                )
            if ref and ref not in node_ids:
                issues.append(f"[C2-err] {s['id']}: caveats[{i}].legal_ref {ref!r} 不存在於 nodes.json")
    return issues


def check_flow_refs(scenarios: list, node_ids: set) -> list[str]:
    """C3: flow.conclusions[].refs 必須在 nodes.json"""
    issues = []
    for s in scenarios:
        flow = s.get("flow")
        if not flow:
            continue
        conclusions = flow.get("conclusions", {})
        for cid, c in conclusions.items():
            for ref in c.get("refs", []):
                if ref not in node_ids:
                    issues.append(
                        f"[C3] {s['id']}.flow.conclusions[{cid}].refs: {ref!r} 不存在於 nodes.json"
                    )
    return issues


def check_sub_scenarios_exist(scenarios: list) -> list[str]:
    """C4: flow_root 卡的 sub_scenarios 全部要在 scenarios 內"""
    issues = []
    sc_ids = {s["id"] for s in scenarios}
    for s in scenarios:
        if not s.get("flow_root"):
            continue
        for sub in s.get("sub_scenarios", []):
            if sub not in sc_ids:
                issues.append(f"[C4] root {s['id']}.sub_scenarios: {sub!r} 不存在於 scenarios")
    return issues


def check_deprecated_parent(scenarios: list) -> list[str]:
    """C5: deprecated 卡應有 parent_scenario,且該 root 應 flow_root=true"""
    issues = []
    sc_by_id = {s["id"]: s for s in scenarios}
    for s in scenarios:
        if not s.get("deprecated"):
            continue
        ps = s.get("parent_scenario")
        if not ps:
            issues.append(f"[C5-warn] {s['id']} deprecated=true 但無 parent_scenario")
            continue
        root = sc_by_id.get(ps)
        if not root:
            issues.append(f"[C5-err] {s['id']} parent_scenario {ps!r} 不存在")
        elif not root.get("flow_root"):
            issues.append(f"[C5-warn] {s['id']} parent_scenario {ps!r} 不是 flow_root")
    return issues


def check_neutral_language(scenarios: list) -> list[str]:
    """C6: subtitle / caveats[].text / flow.conclusions[].note 不應出現「應該/不得/才能/始得」
    (若條文原文如此,可加 legal_ref 表示原文出處,腳本仍會列出供人工複核)"""
    issues = []
    NON_NEUTRAL_RE = ["應該", "不得", "才能", "始得"]
    for s in scenarios:
        for term in NON_NEUTRAL_RE:
            if term in (s.get("subtitle") or ""):
                issues.append(f"[C6-info] {s['id']}.subtitle 含「{term}」 — 確認原文是否如此")
            for i, c in enumerate(s.get("caveats", [])):
                if term in (c.get("text") or ""):
                    issues.append(f"[C6-info] {s['id']}.caveats[{i}] 含「{term}」(legal_ref={c.get('legal_ref')})")
    return issues


# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────

def load_data():
    nodes = json.loads(NODES_JSON.read_text(encoding="utf-8"))
    sc_data = json.loads(SCENARIOS_JSON.read_text(encoding="utf-8"))
    scenarios = sc_data.get("scenarios", sc_data) if isinstance(sc_data, dict) else sc_data
    node_ids = {n["id"] for n in nodes}
    return scenarios, node_ids


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--strict", action="store_true", help="有錯時 exit 2")
    p.add_argument("-o", "--output", help="寫入檔案(預設 stdout)")
    args = p.parse_args()

    scenarios, node_ids = load_data()

    checks = [
        ("C1 primary_ids 存在", check_primary_ids_exist(scenarios, node_ids)),
        ("C2 caveats legal_ref", check_caveats_legal_ref(scenarios, node_ids)),
        ("C3 flow refs", check_flow_refs(scenarios, node_ids)),
        ("C4 sub_scenarios", check_sub_scenarios_exist(scenarios)),
        ("C5 deprecated parent", check_deprecated_parent(scenarios)),
        ("C6 中性化用語", check_neutral_language(scenarios)),
    ]

    lines = [
        "=" * 70,
        f"法源審查自動檢查 — 對 {len(scenarios)} 張情境卡 / {len(node_ids)} 節點",
        "=" * 70,
        "",
    ]

    counts = defaultdict(int)
    has_err = False
    for name, issues in checks:
        lines.append(f"## {name} ({len(issues)} 項)")
        for issue in issues:
            lines.append(f"  {issue}")
            counts[issue.split("]")[0] + "]"] += 1
            if "-err" in issue.split("]")[0] or issue.startswith(("[C1]", "[C3]")):
                has_err = True
        lines.append("")

    lines.append("=" * 70)
    lines.append("摘要:")
    for label, n in sorted(counts.items()):
        lines.append(f"  {label}: {n}")
    lines.append(f"總計: {sum(counts.values())} 項")
    lines.append("")
    if has_err:
        lines.append("⚠ 有 *-err 級別問題 — 請人工處理(refer docs/_review_log.md SOP)")
    else:
        lines.append("✓ 無 *-err 級別問題(*-warn / *-info 屬建議性,非阻擋)")

    output = "\n".join(lines)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"已寫入 {args.output}({sum(counts.values())} 項)")
    else:
        print(output)

    if args.strict and has_err:
        sys.exit(2)


if __name__ == "__main__":
    main()
