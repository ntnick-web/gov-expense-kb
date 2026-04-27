"""One-shot: migrate B-001→A-024 + create B-004/005/006/007 (rate tables).

Reads parsed JSON from /tmp:
- global_114_parsed.json
- mainland_114_parsed.json
- insurance_113_parsed.json
- insurance_114_parsed.json
"""
import json
import sys
from pathlib import Path
import yaml

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path("C:/Users/user/OneDrive/桌面/支出規定視覺化資料庫")
TMP = Path("C:/Users/user/AppData/Local/Temp")


def write_md(path: Path, frontmatter: dict, body: str) -> None:
    fm = yaml.safe_dump(
        frontmatter, allow_unicode=True, sort_keys=False, default_flow_style=False
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{fm}---\n\n{body}", encoding="utf-8")


# ──────────────────────────────────────────────
# 1) MIGRATE B-國外旅費-001 → A-國外旅費-024
# ──────────────────────────────────────────────
old_path = ROOT / "02_markdown/B_支出標準/國外旅費/B001_中央各機關(含事業機構).md"
new_path = ROOT / "02_markdown/A_核心法規/國外旅費/A024_中央各機關派赴國外進修補助表.md"

content = old_path.read_text(encoding="utf-8")
content = content.replace("id: B-國外旅費-001", "id: A-國外旅費-024")
content = content.replace("type: 支出標準", "type: 核心法規")

new_path.parent.mkdir(parents=True, exist_ok=True)
new_path.write_text(content, encoding="utf-8")
old_path.unlink()
print(f"OK Migrated B-001 -> A-024: {new_path.name}")


# ──────────────────────────────────────────────
# 2) B-國外旅費-004: 國外日支表 114年版 (已逾期)
# ──────────────────────────────────────────────
with open(TMP / "global_114_parsed.json", encoding="utf-8") as f:
    global_114 = json.load(f)

sections_b004 = []
for region in global_114:
    sect = {
        "title": region["title"],
        "searchable": True,
        "search_label_idx": 2,
        "search_value_idx": 3,
        "search_country_idx": 1,
        "search_placeholder": "搜尋國家或城市…例:日本、Tokyo、東京、其他",
        "headers": ["編號", "國家", "城市", "數額"],
        "rows": region["rows"],
    }
    sections_b004.append(sect)

fm_b004 = {
    "id": "B-國外旅費-004",
    "type": "支出標準",
    "parent": "國外旅費",
    "title": "國外日支數額表(114年版,已逾期)",
    "tags": ["日支生活費", "出差規定", "國外旅費", "已逾期"],
    "related": ["B-國外旅費-003", "A-國外旅費-007"],
    "source": "行政院主計總處_中央政府各機關派赴國外各地區出差人員生活費日支數額表(113年10月15日修正)",
    "source_url": "https://law.dgbas.gov.tw/LawContent.aspx?id=FL028084",
    "version": "2025-01-01",
    "reviewed": "2026-04-28",
    "review_level": "人工",
    "agency": "行政院主計總處",
    "status": "已廢止",
    "effective_period": "2025-01-01 ~ 2025-12-31",
    "superseded_by": "B-國外旅費-003",
    "rate_table": {
        "caption": "中央政府各機關派赴國外各地區出差人員生活費日支數額表(114年1月1日生效,已於115年1月1日由新版取代)",
        "unit": "美元",
        "effective": "2025-01-01",
        "sections": sections_b004,
    },
}

body_b004 = """## 標準全文

中央政府各機關派赴國外各地區出差人員生活費日支數額表（中華民國 113 年 10 月 15 日行政院院授主預字第 1120103155 號函修正，自民國 114 年 1 月 1 日生效，單位：美元）

> ⚠️ **此表已於民國 115 年 1 月 1 日（西元 2026-01-01）由新版取代，請參考 B-國外旅費-003。**
> 適用期間：2025-01-01 ~ 2025-12-31（民國 114 年）

完整費率資料請見上方結構化費率表（共 524 列、6 大區域）。

## 重點摘要

中央政府各機關派赴國外各地區出差人員生活費日支數額表 114 年版（已逾期）。本表自民國 114 年 1 月 1 日生效至民國 114 年 12 月 31 日，已由 115 年 1 月 1 日生效之新版（B-國外旅費-003）取代。涵蓋 6 大區域：A 亞太、B 亞西、C 歐洲、D 北美、E 拉丁美洲及加勒比海、F 非洲，共約 524 列城市/國家費率。**仍可用於民國 114 年度出差案之事後申報核銷。**

## 相關規定

- [B-國外旅費-003](../../B_支出標準/國外旅費/B003_國外出差生活費日支數額表全球.md) — 現行版本（115 年 1 月 1 日生效）
- [A-國外旅費-007](../../A_核心法規/國外旅費/第07條_各機關派赴國外各地區出差.md) — 母法

## 備註

本表為歷史版本歸檔，供民國 114 年度差旅費結報參考。
"""
write_md(
    ROOT / "02_markdown/B_支出標準/國外旅費/B004_國外日支數額表114年版.md",
    fm_b004,
    body_b004,
)
print(f"OK Created B-004: {sum(len(s['rows']) for s in sections_b004)} city rows")


# ──────────────────────────────────────────────
# 3) B-國外旅費-005: 大陸港澳日支表 114年版 (已逾期)
# ──────────────────────────────────────────────
with open(TMP / "mainland_114_parsed.json", encoding="utf-8") as f:
    mainland_114 = json.load(f)

fm_b005 = {
    "id": "B-國外旅費-005",
    "type": "支出標準",
    "parent": "國外旅費",
    "title": "大陸港澳日支表(114年版,已逾期)",
    "tags": ["大陸港澳", "日支生活費", "國外旅費", "已逾期"],
    "related": ["B-國外旅費-002"],
    "source": "行政院主計總處_中央政府各機關派赴大陸地區、香港及澳門出差人員生活費日支數額表(113年10月15日修正)",
    "source_url": "https://law.dgbas.gov.tw/LawContent.aspx?id=FL028084",
    "version": "2025-01-01",
    "reviewed": "2026-04-28",
    "review_level": "人工",
    "agency": "行政院主計總處",
    "status": "已廢止",
    "effective_period": "2025-01-01 ~ 2025-12-31",
    "superseded_by": "B-國外旅費-002",
    "rate_table": {
        "caption": "中央政府各機關派赴大陸地區、香港及澳門出差人員生活費日支數額表(114年1月1日生效,已逾期)",
        "unit": "美元",
        "effective": "2025-01-01",
        "searchable": True,
        "search_placeholder": "搜尋城市…例:成都、Beijing、香港",
        "search_label_idx": 1,
        "search_value_idx": 2,
        "headers": ["編號", "名稱(城市或其他)", "日支數額"],
        "rows": mainland_114,
        "notes": [
            "赴本表未列載之城市及「內蒙古」出差，按「其他」支給。",
            "出差人員生活費日支數額按百分率計算，其總計後尾數不足一元者，進位為一元。",
        ],
    },
}

mainland_table_md = "\n".join(
    f"| {r[0]} | {r[1]} | {r[2]} |" for r in mainland_114
)
body_b005 = f"""## 標準全文

中央政府各機關派赴大陸地區、香港及澳門出差人員生活費日支數額表（中華民國 113 年 10 月 15 日行政院院授主預字第 1130102991 號函修正，自民國 114 年 1 月 1 日生效）

> ⚠️ **此表已於民國 115 年 1 月 1 日由新版取代，請參考 B-國外旅費-002。**
> 適用期間：2025-01-01 ~ 2025-12-31（民國 114 年）

| 編號 | 名稱 | 日支數額(美元) |
|------|------|---------------|
{mainland_table_md}

附註：

1. 赴本表未列載之城市及「內蒙古」出差，按「其他」支給。
2. 出差人員生活費日支數額按百分率計算，其總計後尾數不足一元者，進位為一元。

## 重點摘要

中央政府各機關派赴大陸地區、香港及澳門出差人員生活費日支數額表 114 年版（已逾期）。共列載 33 城市（含香港、澳門），其他城市按「其他」支給。本表自民國 114 年 1 月 1 日生效至民國 114 年 12 月 31 日，已由 B-國外旅費-002 取代。**仍可用於民國 114 年度出差案之事後申報核銷。**

## 相關規定

- [B-國外旅費-002](../../B_支出標準/國外旅費/B002_中央政府各機關派赴大陸地.md) — 現行版本

## 備註

歷史版本歸檔，供民國 114 年度差旅費結報參考。
"""
write_md(
    ROOT / "02_markdown/B_支出標準/國外旅費/B005_大陸港澳日支表114年版.md",
    fm_b005,
    body_b005,
)
print(f"OK Created B-005: {len(mainland_114)} city rows")


# ──────────────────────────────────────────────
# Helpers for insurance tables
# ──────────────────────────────────────────────
def build_ins_section(name: str, data: list) -> dict:
    return {
        "title": f"{name} 15足歲(含)以上",
        "headers": ["天數", "保費(新臺幣元)"],
        "rows": [[str(d), f"{p:,}"] for d, p in data],
    }


# ──────────────────────────────────────────────
# 4) B-國外旅費-006: 外交部保險表 (115年版,現行)
# ──────────────────────────────────────────────
with open(TMP / "insurance_114_parsed.json", encoding="utf-8") as f:
    ins_114 = json.load(f)

fm_b006 = {
    "id": "B-國外旅費-006",
    "type": "支出標準",
    "parent": "國外旅費",
    "title": "外交部出差綜合保險表(115年版)",
    "tags": ["保險費", "綜合保險", "國外旅費", "外交部", "共同供應契約"],
    "related": ["A-國外旅費-014"],
    "source": "外交部_因公赴國外出差或返國述職人員綜合保險共同供應契約(114-115年期)",
    "source_url": "https://www.mofa.gov.tw/",
    "version": "2025-06-21",
    "reviewed": "2026-04-28",
    "review_level": "人工",
    "agency": "外交部",
    "status": "現行",
    "effective_period": "2025-06-21 ~ 2026-06-20",
    "rate_table": {
        "caption": "外交部因公赴國外出差或返國述職人員綜合保險表(15足歲含以上)",
        "unit": "新臺幣元",
        "effective": "2025-06-21",
        "lookup_type": "insurance",
        "sections": [
            build_ins_section("一般險", ins_114["一般險"]),
            build_ins_section("申根險", ins_114["申根險"]),
        ],
        "notes": [
            "本表為共同供應契約 114-115 年期(2025-06-21 ~ 2026-06-20)費率。",
            "15 足歲(含)以上適用此費率。未滿 15 足歲另有費率(本資料庫未收錄)。",
        ],
    },
}
body_b006 = """## 標準全文

外交部 因公赴國外出差或返國述職人員綜合保險共同供應契約 — 一般險 / 申根險 15 足歲(含)以上 保費表

**契約適用期間：民國 114 年 6 月 21 日 ~ 民國 115 年 6 月 20 日**

完整 365 天 × 2 險種費率資料請見上方結構化費率表，下方並提供互動式試算（選險種、輸入天數即得保費）。

## 重點摘要

外交部因公赴國外出差或返國述職人員綜合保險表（共同供應契約，115 年版，現行）。本表為一般險與申根險 15 足歲(含)以上適用，提供 1~365 天保費對照。**現行契約期間：2025-06-21 ~ 2026-06-20。**

範例：一般險 30 天 = NT$525；申根險 30 天 = NT$600。

## 相關規定

- [A-國外旅費-014](../../A_核心法規/國外旅費/第14條_出差人員應辦理保險.md) — 出差人員辦理保險規定

## 備註

本表來源為外交部共同供應契約，屬機關採購外保險服務之費率，與一般商業保險公司報價可能不同。
"""
write_md(
    ROOT / "02_markdown/B_支出標準/國外旅費/B006_外交部出差綜合保險表115年版.md",
    fm_b006,
    body_b006,
)
print(
    f"OK Created B-006: insurance 115 with {len(ins_114['一般險']) + len(ins_114['申根險'])} rows"
)


# ──────────────────────────────────────────────
# 5) B-國外旅費-007: 外交部保險表 (114年版,已逾期)
# ──────────────────────────────────────────────
with open(TMP / "insurance_113_parsed.json", encoding="utf-8") as f:
    ins_113 = json.load(f)

fm_b007 = {
    "id": "B-國外旅費-007",
    "type": "支出標準",
    "parent": "國外旅費",
    "title": "外交部出差綜合保險表(114年版,已逾期)",
    "tags": [
        "保險費",
        "綜合保險",
        "國外旅費",
        "外交部",
        "共同供應契約",
        "已逾期",
    ],
    "related": ["B-國外旅費-006", "A-國外旅費-014"],
    "source": "外交部_因公赴國外出差或返國述職人員綜合保險共同供應契約(113-114年期)",
    "source_url": "https://www.mofa.gov.tw/",
    "version": "2024-06-21",
    "reviewed": "2026-04-28",
    "review_level": "人工",
    "agency": "外交部",
    "status": "已廢止",
    "effective_period": "2024-06-21 ~ 2025-06-20",
    "superseded_by": "B-國外旅費-006",
    "rate_table": {
        "caption": "外交部因公赴國外出差或返國述職人員綜合保險表 114 年版(已逾期)",
        "unit": "新臺幣元",
        "effective": "2024-06-21",
        "lookup_type": "insurance",
        "sections": [
            build_ins_section("一般險", ins_113["一般險"]),
            build_ins_section("申根險", ins_113["申根險"]),
        ],
        "notes": [
            "此契約已於 2025-06-20 屆期，現行版本請見 B-國外旅費-006(115 年版)。",
            "本表保留供 113 年 6 月 21 日至 114 年 6 月 20 日期間出差案事後核銷參考。",
        ],
    },
}
body_b007 = """## 標準全文

外交部 因公赴國外出差或返國述職人員綜合保險共同供應契約 — 一般險 / 申根險 15 足歲(含)以上 保費表

> ⚠️ **此契約已於民國 114 年 6 月 20 日屆期，現行版本請見 B-國外旅費-006（115 年版，2025-06-21 ~ 2026-06-20）。**
> 適用期間：民國 113 年 6 月 21 日 ~ 民國 114 年 6 月 20 日（2024-06-21 ~ 2025-06-20）

## 重點摘要

外交部因公赴國外出差或返國述職人員綜合保險表（共同供應契約，114 年版，已逾期）。本表保留供 113 年 6 月 21 日至 114 年 6 月 20 日期間出差案事後核銷參考。

範例：一般險 30 天 = NT$547；申根險 30 天 = NT$999。

## 相關規定

- [B-國外旅費-006](../../B_支出標準/國外旅費/B006_外交部出差綜合保險表115年版.md) — 現行版本（115 年版）
- [A-國外旅費-014](../../A_核心法規/國外旅費/第14條_出差人員應辦理保險.md) — 出差人員辦理保險規定

## 備註

歷史版本歸檔。
"""
write_md(
    ROOT / "02_markdown/B_支出標準/國外旅費/B007_外交部出差綜合保險表114年版.md",
    fm_b007,
    body_b007,
)
print(
    f"OK Created B-007: insurance 113 with {len(ins_113['一般險']) + len(ins_113['申根險'])} rows"
)

print("\n=== All 5 file operations done ===")
