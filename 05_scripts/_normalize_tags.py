"""_normalize_tags.py — 統一同義 tag、補強單 tag 檔、移除冗餘泛 tag。

三步驟同時完成:

1. **同義詞合併**(SYNONYMS)
   - 把同義/近義的 tag 合併為單一 canonical 形式
   - 例:「大陸港澳旅費」→「大陸港澳」、「護照簽證」→「簽證費」

2. **內容驅動補強**(ENRICH)
   - 掃描 title + body,命中關鍵字即加對應 tag(若不在現有 tags 中)
   - 解決「國外旅費 C 類大量單 tag『結報核銷』」的歸類問題
   - 命中後該檔可被 EXPENSE_LAYER 推斷到具體支出類別,而非全卡在「程序總則」

3. **移除冗餘泛 tag**(DROP_IF_HAS_SPECIFIC)
   - 若檔已有具體費用 tag,移除「結報核銷」這類兜底 tag
   - 保留:「結報核銷」(僅當無其他費用類 tag) / 「教育訓練費」/「補助核定」(這些都是實質類別)

用法
----
    python 05_scripts/_normalize_tags.py            # dry-run
    python 05_scripts/_normalize_tags.py --apply
"""

from __future__ import annotations

import argparse
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

# ───────────────────────────────────────
# 同義詞合併:source tag → canonical tag
# ───────────────────────────────────────
SYNONYMS: dict[str, str] = {
    # 國外旅費
    "大陸港澳旅費": "大陸港澳",
    "護照簽證": "簽證費",
    "短程車資": "國外交通",
    # 國內旅費
    "自用汽車": "自駕租賃",
    "共享汽車": "自駕租賃",
    "公里數": "必要路程",
    "六十公里": "必要路程",
    # 通用
    "個案核處": "機關核處",
    "個案核定": "機關核處",
    "主管機關核定": "機關自訂",
    "中央政府機關": "中央機關",
    "事先簽准": "事先核定",
    "例外簽准": "例外情形",
    # 同字異形
    "上限內": "報支上限",
    "報支限額": "報支上限",
    "核實報支": "覈實報支",
    # 2026-05-XX 加(實務口語包,搭配 04_web/data/synonyms.json)
    "報帳": "經費結報",
    "請款": "經費結報",
    "結算": "經費結報",
    "核銷": "經費結報",
    "公務必要": "業務需要",
    "因公": "業務需要",
    "因業務": "業務需要",
    "公務需要": "業務需要",
    "退單": "退件",
    "補件": "退件",
    "不予核銷": "退件",
    "彈性支應": "彈性支用",
    "計畫支用": "彈性支用",
    "招呼車": "計程車",
    "小黃": "計程車",
    "比價": "採購",
    "詢價": "採購",
    "議價": "採購",
    "招標": "採購",
    # 酬勞費 tag 對齊 EXPENSE_LIST
    "鐘點費": "講座鐘點費",
}

# ───────────────────────────────────────
# 內容驅動 tag 補強
# 順序:具體費用 > 文件類型 > 對象 > 程序
# 命中 keyword (regex) 即補上 tag(若無)
# ───────────────────────────────────────
ENRICH_RULES: list[tuple[str, str]] = [
    # 具體費用類別
    ("住宿費", r"住宿費|住宿事實|旅館"),
    ("交通費", r"交通費(?!.*{)|計程車|搭乘.*?(汽車|火車|高鐵)"),
    ("機票", r"機票|搭乘飛機|頭等艙|商務艙|經濟艙|商務.*?座位|艙等"),
    ("日支生活費", r"日支(數額|生活費)|生活費"),
    ("膳費", r"膳費|膳食費|供膳|供餐"),
    ("保險費", r"保險費|平安保險|旅平險"),
    ("簽證費", r"簽證費|護照規費|護照(?!證號)"),
    ("國外交通", r"國外當地交通|當地車資"),
    ("自駕租賃", r"自用汽車|自駕|租賃汽車|共享汽車|每公里"),
    ("必要路程", r"必要路程"),
    ("手續費", r"出國手續費|手續費"),
    ("行政費", r"行政費"),
    ("禮品交際", r"禮品|交際費"),
    ("雜費", r"雜費"),
    ("會議費", r"會議費|會議茶點|會議便當"),
    ("出席費", r"出席費"),
    ("講座鐘點費", r"鐘點費|講座.{0,4}費"),
    ("稿費", r"稿費|翻譯費|編輯費"),
    ("審查費", r"審查費"),
    ("兼職費", r"兼職費|兼任.*?職務.*?費"),
    ("健保補充保費", r"補充保費|補充保險費|二代健保"),
    ("採購", r"政府採購法|採購法|決標|履約"),
    # 大陸港澳 / 出國進修
    ("大陸港澳", r"大陸地區|香港|澳門|港澳"),
    ("出國進修", r"出國進修|赴國外進修|國外實習|國外研究"),
    # 文件 / 憑證
    ("原始憑證", r"原始憑證|統一發票|電子發票|電子收據|單據"),
    ("電子憑證", r"電子發票|電子簽章|電子憑證"),
    ("憑證存管", r"憑證保存|憑證存管|憑證銷毀"),
    # 對象別
    ("機關所在地", r"機關所在地"),
    ("駐外人員", r"駐外人員|駐在地|駐外機構"),
    ("地方政府", r"地方政府機關|各級地方"),
    ("公營事業", r"公營事業機構"),
    # 程序
    ("覈實報支", r"覈實報支|覈實|實支實付"),
    ("報支上限", r"報支上限|上限.{0,4}報支"),
    ("當日往返", r"當日往返"),
    ("公差派遣", r"公差派遣|奉派出差"),
    ("休職", r"休職|停職"),
    # 訓練
    ("教育訓練費", r"訓練|講習|研習(?!.*?月刊)"),
]

# ───────────────────────────────────────
# 移除冗餘:若檔已有任一具體 tag,移除這些泛 tag
# ───────────────────────────────────────
SPECIFIC_TAGS: set[str] = {
    "交通費", "住宿費", "機票", "日支生活費", "膳費", "保險費", "簽證費",
    "國外交通", "自駕租賃", "必要路程", "手續費", "行政費", "禮品交際",
    "雜費", "會議費", "出席費", "講座鐘點費", "稿費", "審查費", "兼職費",
    "健保補充保費", "採購",
    "大陸港澳", "出國進修", "原始憑證", "電子憑證", "憑證存管",
    "機關所在地", "駐外人員", "地方政府", "公營事業", "覈實報支",
    "報支上限", "當日往返", "公差派遣", "休職", "教育訓練費",
}

# 若有具體 tag 就移除這些泛 tag
DROP_IF_HAS_SPECIFIC: set[str] = {
    "結報核銷", "出差規定", "支出憑證",
}


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


def render_fm(fm: dict) -> str:
    return yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()


def normalize_tag_list(tags: list[str], title: str, body: str) -> tuple[list[str], list[str]]:
    """回傳 (新 tag list, 變動說明)"""
    actions: list[str] = []
    s: set[str] = set()

    # 1. 同義詞合併
    for t in tags:
        canonical = SYNONYMS.get(t, t)
        if canonical != t:
            actions.append(f"merge:{t}→{canonical}")
        s.add(canonical)

    # 2. 內容補強
    haystack = title + "\n" + body
    for tag, pat in ENRICH_RULES:
        if tag in s:
            continue
        if re.search(pat, haystack):
            s.add(tag)
            actions.append(f"add:{tag}")

    # 3. 移除冗餘
    has_specific = bool(s & SPECIFIC_TAGS)
    if has_specific:
        for vague in DROP_IF_HAS_SPECIFIC:
            if vague in s:
                s.discard(vague)
                actions.append(f"drop:{vague}")

    # 排序:具體類在前,然後其他依字母
    specific_present = sorted([t for t in s if t in SPECIFIC_TAGS])
    others = sorted([t for t in s if t not in SPECIFIC_TAGS])
    new_tags = specific_present + others

    return new_tags, actions


def process(path: Path, apply: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    out = {
        "path": path.relative_to(ROOT).as_posix(),
        "id": fm.get("id") if fm else None,
        "old_tags": [],
        "new_tags": [],
        "actions": [],
        "changed": False,
    }
    if fm is None:
        return out

    old_tags = fm.get("tags") or []
    if not isinstance(old_tags, list):
        old_tags = []
    old_tags = [str(t) for t in old_tags]
    out["old_tags"] = old_tags

    title = str(fm.get("title", ""))
    new_tags, actions = normalize_tag_list(old_tags, title, body)
    out["new_tags"] = new_tags
    out["actions"] = actions

    if set(new_tags) == set(old_tags) and new_tags == old_tags:
        return out

    out["changed"] = True
    if apply:
        fm["tags"] = new_tags
        new_text = "---\n" + render_fm(fm) + "\n---\n\n" + body.lstrip("\n")
        new_text = new_text.rstrip() + "\n"
        path.write_text(new_text, encoding="utf-8", newline="\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true",
                    help="列印每份檔的 actions(預設僅列摘要)")
    ap.add_argument("--show", type=int, default=20,
                    help="dry-run 時列出前 N 個變動範例(預設 20)")
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 100)

    changed: list[dict] = []
    actions_count: dict[str, int] = {}

    for f in files:
        r = process(f, apply=args.apply)
        if r["changed"]:
            changed.append(r)
            for a in r["actions"]:
                kind = a.split(":")[0]
                actions_count[kind] = actions_count.get(kind, 0) + 1

    # 樣本
    show_n = args.show if not args.verbose else len(changed)
    for r in changed[:show_n]:
        print(f"  {r['id']}")
        print(f"    舊: {r['old_tags']}")
        print(f"    新: {r['new_tags']}")
        print(f"    {', '.join(r['actions'])}")

    print("─" * 100)
    print(f"變動檔數:{len(changed)} / {len(files)}")
    print("動作統計:" + ", ".join(f"{k}={v}" for k, v in sorted(actions_count.items())))
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
