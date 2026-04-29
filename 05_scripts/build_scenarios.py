"""build_scenarios.py — Phase 3a:從 02_markdown/ 規則式生成情境草稿(auto)。

策略
----
- 掃 02_markdown/ 找「未被 scenarios_manual.json 覆蓋」且 `status: 現行` 的 A/D 類節點
- A 類核心法規:每條變一張情境(question 從新 title + summary 推)
- D 類問答集:Q 本身就是情境,直接轉(question = 「QN ...」核心問句)
- C 類函釋與 B 類標準表:**不**自動生成情境(C 是補充,B 是查詢表),但會被 manual 情境的 tag 自動撈
- 輸出 `04_web/data/scenarios_auto.json`,標 `source: auto`
- 手寫 manual + 自動 auto 由前端載入時合併,前端對 `source: auto` 顯示灰色「🤖 自動產生」徽章

summary → question 轉換規則
--------------------------
規則式為主,LLM 不在 runtime 介入(免費、可重現)。

1. **句尾**:句尾為「報支」「為限」「給付」「核定」「比照」等動詞 → 加「?」並前綴「如何」
   例:「出差搭高鐵以對號座為上限,憑票據覈實報支」 → 「出差搭高鐵交通費如何報支?」
2. **「應/須/得」開頭**:轉成「需要/可以」+ 主題詞 + 嗎
   例:「應檢附保險費單據覈實報支」 → 「報保險費需要檢附單據嗎?」
3. **「依」開頭**:轉成「依...怎麼算?」
   例:「依日支表給付,內含住宿 70%、膳食 20%」 → 「日支生活費怎麼算?」
4. **fallback**:用 title 直接生成「{title} 怎麼處理?」/「{title} 如何認定?」

輸出 schema(同 scenarios_manual.json,但簡化)
-----------------------------------------------
{
  "id": "auto_A-國內旅費-005",
  "title": "新 title",          # 取自節點 title
  "subtitle": "auto-generated 30 字 summary",
  "icon": "🔍",
  "parent": "...",
  "expense": "...",            # 從 tags 套 EXPENSE_LAYER
  "primary_ids": ["A-..."],
  "tags": [...],               # 從節點 tags 抽前 2
  "source": "auto",            # ← 區分 auto vs manual 用
  "question": "推導出的問句"    # 給前端顯示用(可選)
}

用法
----
    python 05_scripts/build_scenarios.py             # dry-run 印出統計
    python 05_scripts/build_scenarios.py --apply     # 寫入 scenarios_auto.json
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
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"
SCN_MANUAL = ROOT / "04_web" / "data" / "scenarios_manual.json"
SCN_AUTO = ROOT / "04_web" / "data" / "scenarios_auto.json"

# expense layer 推斷:tags 子集 → expense 名稱
# 與 04_web/assets/app.js:EXPENSE_LAYER 對齊
EXPENSE_LAYER: dict[tuple[str, ...], str] = {
    # 國內旅費
    ("交通費", "公差派遣", "高鐵", "機票", "自駕租賃", "計程車"): "交通費",
    ("住宿費",): "住宿費",
    ("膳食費", "雜費"): "雜費",
    # 國外旅費
    ("大陸港澳",): "大陸港澳",
    ("出國進修",): "出國進修",
    ("生活費", "膳食費", "住宿費"): "生活費",
    ("手續費", "結匯", "簽證"): "手續費",
    ("保險費",): "保險費",
    ("禮品交際", "雜費"): "禮品交際及雜費",
    # 支出憑證與結報
    ("收據", "原始憑證", "電子憑證", "統一發票"): "收據與發票",
    ("採購",): "採購結報",
    ("經費結報系統",): "系統化結報",
    ("補助", "分攤"): "補助與分攤",
    ("差旅費", "出差"): "差旅費結報",
    ("出席費", "鐘點費", "稿費"): "酬勞與會議",
}

ICON_BY_EXPENSE: dict[str, str] = {
    "交通費": "🚆", "住宿費": "🏨", "雜費": "🪣",
    "大陸港澳": "🇭🇰", "出國進修": "🎓",
    "生活費": "🍱", "手續費": "📝", "保險費": "🛡️",
    "禮品交際及雜費": "🎁",
    "收據與發票": "🧾", "採購結報": "📋", "系統化結報": "💻",
    "補助與分攤": "🤝", "差旅費結報": "✈️", "酬勞與會議": "💼",
    "通則與其他": "📌",
}

# C 類為主的「程序總則 / 通則」 fallback
DEFAULT_EXPENSE = "通則與其他"

# Meta 條文(立法目的、適用範圍、體例、修正生效等)不該變情境
# 因情境是「使用者具體案件入口」,meta 條文是法源說明
META_TITLE_PATTERNS = (
    "立法目的", "訂定目的", "適用範圍", "用語定義",
    "彙編", "體例", "修正生效", "新舊規定銜接",
    "地方公營準用", "地方機關準用", "主管機關自訂",
    "員工誠信責任", "誠信原則",
)


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


def infer_expense(tags: list[str], parent: str) -> str:
    """套 EXPENSE_LAYER 表,以節點 tags 推 expense 子類別。"""
    if not tags:
        return DEFAULT_EXPENSE
    tag_set = set(tags)
    # 用 tag 命中數最多的 group 取勝
    best_match = ("", 0)
    for keys, expense in EXPENSE_LAYER.items():
        hits = sum(1 for k in keys if k in tag_set)
        if hits > best_match[1]:
            best_match = (expense, hits)
    return best_match[0] or DEFAULT_EXPENSE


# ─────────────────────────────────────────────
# summary → question 轉換規則
# ─────────────────────────────────────────────

QUESTION_RULES: list[tuple[str, str]] = [
    # (regex pattern, question template — {0} = title-derived noun phrase)
    (r".*覈實報支$|.*憑.+?(?:單據|憑證).*報支", "如何覈實報支?"),
    (r".*為限$|.*上限$", "上限怎麼算?"),
    (r".*得.*報支|.*得.*核銷", "什麼情況得報支?"),
    (r".*不得.+", "什麼情況不能報支?"),
    (r".*依.*規定", "依什麼規定?"),
]


def derive_question(title: str, summary: str, category: str, serial: int) -> str:
    """從 title + summary 推導問句。簡單規則式。"""
    # 剝掉 「第N條」「QN」前綴,留核心關鍵字
    kernel = re.sub(r"^第\s*[一二三四五六七八九十百〇○零\d]+\s*條\s*", "", title).strip()
    kernel = re.sub(r"^Q\s*\d+\s*", "", kernel).strip()
    if not kernel:
        kernel = title

    # D 類:問答本身就是問句結構
    if category == "D":
        return f"{kernel}怎麼處理?"

    # 套規則
    for pattern, q_suffix in QUESTION_RULES:
        if re.search(pattern, summary):
            return f"{kernel} — {q_suffix}"

    # fallback
    return f"{kernel} 如何認定?"


# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────


def load_covered_ids() -> set[str]:
    """從 manual 情境載入已覆蓋的節點 ID。"""
    if not SCN_MANUAL.exists():
        return set()
    data = json.loads(SCN_MANUAL.read_text(encoding="utf-8"))
    covered: set[str] = set()
    for s in data.get("scenarios", []):
        for nid in s.get("primary_ids", []):
            covered.add(str(nid))
    return covered


def collect_candidates() -> list[dict]:
    """掃 02_markdown,收集 A/D 類 + 現行 + 未被 manual 覆蓋的節點。"""
    covered = load_covered_ids()
    out: list[dict] = []
    for md in sorted(MD_DIR.rglob("*.md")):
        text = md.read_text(encoding="utf-8")
        fm, body = split_fm(text)
        if not fm:
            continue
        nid = str(fm.get("id", ""))
        if not nid or nid in covered:
            continue
        if fm.get("status") == "已廢止":
            continue
        m = re.match(r"^([ABCDN])-([^-]+)-(\d{3})$", nid)
        if not m:
            continue
        category = m.group(1)
        if category not in ("A", "D"):  # 只生成 A/D
            continue
        parent = str(fm.get("parent", ""))
        title = str(fm.get("title", ""))
        # 過濾 meta 條文
        if any(p in title for p in META_TITLE_PATTERNS):
            continue
        tags = fm.get("tags") or []
        if not isinstance(tags, list):
            tags = []
        summary = extract_section(body, "重點摘要").strip()
        # 去除自動初校標記
        summary = re.sub(r"_\(自動初校,待人工潤飾\)_", "", summary).strip()
        out.append({
            "id": nid,
            "category": category,
            "parent": parent,
            "title": title,
            "tags": tags,
            "summary": summary,
            "serial": int(m.group(3)),
        })
    return out


def build_auto_scenario(node: dict) -> dict:
    """把候選節點轉成 scenario JSON object。"""
    expense = infer_expense(node["tags"], node["parent"])
    icon = ICON_BY_EXPENSE.get(expense, "🔍")
    question = derive_question(node["title"], node["summary"], node["category"], node["serial"])

    # subtitle 取 summary 前 30 字
    subtitle = node["summary"][:30].rstrip()
    if len(node["summary"]) > 30:
        subtitle += "…"

    return {
        "id": f"auto_{node['id']}",
        "title": node["title"],
        "icon": icon,
        "subtitle": subtitle,
        "parent": node["parent"],
        "expense": expense,
        "primary_ids": [node["id"]],
        "tags": node["tags"][:3],  # 前 3 個 tags 用於延伸搜尋
        "source": "auto",
        "question": question,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="實際寫入 scenarios_auto.json")
    ap.add_argument("--show", type=int, default=10, help="dry-run 顯示前 N 筆 sample")
    args = ap.parse_args()

    if not SCN_MANUAL.exists():
        print(f"找不到 {SCN_MANUAL},先跑分檔步驟。", file=sys.stderr)
        return 1

    candidates = collect_candidates()
    print(f"未覆蓋的 A/D 類現行節點:{len(candidates)} 個")

    by_cat: dict[str, int] = {}
    by_parent: dict[str, int] = {}
    by_expense: dict[str, int] = {}
    auto_scenarios: list[dict] = []
    for node in candidates:
        sc = build_auto_scenario(node)
        auto_scenarios.append(sc)
        by_cat[node["category"]] = by_cat.get(node["category"], 0) + 1
        by_parent[node["parent"]] = by_parent.get(node["parent"], 0) + 1
        by_expense[sc["expense"]] = by_expense.get(sc["expense"], 0) + 1

    print(f"\n按類別:{by_cat}")
    print(f"按母題:{by_parent}")
    print(f"\n按 expense 分布(top 8):")
    for k, v in sorted(by_expense.items(), key=lambda x: -x[1])[:8]:
        print(f"  {k}: {v}")

    print(f"\n前 {args.show} 筆 sample:")
    for sc in auto_scenarios[:args.show]:
        print(f"  [{sc['expense']:8s}] {sc['title']}")
        print(f"      Q: {sc['question']}")
        print(f"      → {', '.join(sc['primary_ids'])}")

    if args.apply:
        out = {
            "version": "2026-04-29",
            "note": "build_scenarios.py 自動生成。Push 02_markdown/ 後重建。**勿手改**。",
            "scenarios": auto_scenarios,
        }
        SCN_AUTO.write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\n寫入 {SCN_AUTO}({len(auto_scenarios)} 個情境)")
    else:
        print(f"\n[DRY-RUN] 加 --apply 寫入 {SCN_AUTO.name}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
