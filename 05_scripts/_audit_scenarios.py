"""_audit_scenarios.py — 盤點情境卡是否違反原則 2(過時規定)+ 找重複/類似情境。

輸出 _scenario_audit.txt 供人工 review。
"""
import json, sys, re
try: sys.stdout.reconfigure(encoding="utf-8")
except: pass
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
SCN_M = ROOT / "04_web/data/scenarios_manual.json"
SCN_A = ROOT / "04_web/data/scenarios_auto.json"
OUT = ROOT / "05_scripts/_scenario_audit.txt"

# 已知過時規定的關鍵字模式(要 flag 出來人工 review)
STALE_PATTERNS = [
    # 機票憑證:最新只 2 項(行程 + 付款),「出國事實/登機證」非法規必要
    (r"機票.*三項|3\s*項.*機票|出國事實證明", "機票:最新法規僅 2 項(行程證明 + 付款證明),已無「出國事實證明」要求"),
    (r"登機證(存根)?", "登機證存根:不在最新 A-國外-006 之 2 項憑證內(可作補強但非必要)"),
    # 其他常見過時情形
    (r"(舊|原)\s*\d+\s*[%％]", "百分比修訂?可能舊規定數字"),
    (r"114\s*年.*日支|114\s*年版.*數額表", "114 年版日支表已廢止 → B-國外-004 / 005"),
    (r"114\s*年.*保險|114\s*年版.*保險", "114 年版保險表已廢止 → B-國外-007"),
]

def load_scenarios():
    out = []
    for p in [SCN_M, SCN_A]:
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
            for s in d.get("scenarios", []):
                s["_source"] = p.stem
                out.append(s)
    return out

def serialize_scenario(s: dict) -> str:
    """把卡的所有可能含過時規定的欄位扁平成一個字串。"""
    parts = [s.get("title",""), s.get("subtitle","")]
    parts.extend(s.get("attachments") or [])
    parts.extend(s.get("approvers") or [])
    flow = s.get("flow") or {}
    for q in (flow.get("questions") or {}).values():
        parts.append(q.get("label",""))
        parts.append(q.get("hint",""))
        for o in (q.get("options") or []):
            parts.append(o.get("label",""))
    for c in (flow.get("conclusions") or {}).values():
        parts.append(c.get("title",""))
        parts.append(c.get("limit",""))
        parts.append(c.get("note",""))
    return "\n".join(p for p in parts if p)

def main():
    scenarios = load_scenarios()
    lines = []
    lines.append(f"=== 情境卡 audit({len(scenarios)} 張)===\n")

    # 1. 過時規定偵測
    flagged = []
    for s in scenarios:
        blob = serialize_scenario(s)
        hits = []
        for pat, note in STALE_PATTERNS:
            m = re.search(pat, blob)
            if m:
                hits.append((pat, note, m.group(0)))
        if hits:
            flagged.append((s, hits))

    lines.append(f"## 1. 違反原則 2 之疑慮({len(flagged)} 張)\n")
    for s, hits in flagged:
        lines.append(f"⚠ [{s['id']}] {s['title']}  ({s['parent']} · {s.get('expense','?')})  source={s['_source']}")
        for pat, note, match in hits:
            lines.append(f"   - 命中「{match}」→ {note}")
        lines.append("")

    # 2. 重複/類似偵測:依 primary_ids 集合比對
    by_pids = defaultdict(list)
    for s in scenarios:
        if s.get("source") == "auto":
            continue  # auto 卡是 long-tail,不算重複
        pids = tuple(sorted(s.get("primary_ids") or []))
        if pids:
            by_pids[pids].append(s)

    dupe_count = 0
    lines.append(f"\n## 2. 重複(primary_ids 完全相同)\n")
    for pids, group in sorted(by_pids.items()):
        if len(group) > 1:
            dupe_count += 1
            lines.append(f"⚠ primary_ids={list(pids)} 有 {len(group)} 張卡:")
            for s in group:
                lines.append(f"   - [{s['id']}] {s['title']}  parent={s['parent']}")
            lines.append("")
    if dupe_count == 0:
        lines.append("(無 primary_ids 完全相同的卡)\n")

    # 3. 高重疊偵測:title 高度相似 / primary_ids 子集關係
    lines.append(f"\n## 3. 高重疊(primary_ids 子集 / title 相似)\n")
    overlap_count = 0
    manual = [s for s in scenarios if s.get("source") != "auto"]
    for i, s1 in enumerate(manual):
        p1 = set(s1.get("primary_ids") or [])
        if not p1: continue
        for s2 in manual[i+1:]:
            if s1["parent"] != s2["parent"]: continue
            p2 = set(s2.get("primary_ids") or [])
            if not p2: continue
            # primary_ids 一方完全包含另一方,且差異不大
            if (p1 < p2 and len(p2) - len(p1) <= 1) or (p2 < p1 and len(p1) - len(p2) <= 1):
                overlap_count += 1
                lines.append(f"⚠ {s1['id']} ({s1['title']}) ⊂/⊃ {s2['id']} ({s2['title']})")
                lines.append(f"   p1={sorted(p1)} p2={sorted(p2)}")
                lines.append("")
    if overlap_count == 0:
        lines.append("(無高重疊)\n")

    # 4. 標題類似(編輯距離) — 簡易 token 重疊
    lines.append(f"\n## 4. 標題語意相似(可能是不同切角的同主題)\n")
    title_pairs = []
    for i, s1 in enumerate(manual):
        toks1 = set(s1["title"])
        for s2 in manual[i+1:]:
            if s1["parent"] != s2["parent"]: continue
            toks2 = set(s2["title"])
            if not toks1 or not toks2: continue
            inter = toks1 & toks2
            ratio = len(inter) / max(len(toks1), len(toks2))
            if ratio >= 0.6 and inter:
                title_pairs.append((ratio, s1, s2))
    title_pairs.sort(key=lambda x: -x[0])
    for ratio, s1, s2 in title_pairs[:30]:
        lines.append(f"  · ({ratio:.2f}) {s1['id']} 「{s1['title']}」  vs  {s2['id']} 「{s2['title']}」")
    if not title_pairs:
        lines.append("(無)")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"輸出:{OUT}")
    print(f"  違反原則 2 候選:{len(flagged)} 張")
    print(f"  primary_ids 重複:{dupe_count} 組")
    print(f"  primary_ids 高重疊:{overlap_count} 對")
    print(f"  標題相似:{len(title_pairs)} 對(列前 30)")

if __name__ == "__main__":
    main()
