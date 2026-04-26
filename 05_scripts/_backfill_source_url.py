"""_backfill_source_url.py — 依 source 欄位批次補 source_url。

使用內建 mapping 表(來自 dgbas.gov.tw 法規系統與解釋彙編索引頁)。

寫入位置:front-matter 的 `source_url` 欄位(無則新增,有則跳過不蓋)。

Mapping 來源
------------
- 國內出差旅費報支要點   → law.dgbas FL017585
- 國外出差旅費報支要點   → law.dgbas FL017584
- 政府支出憑證處理要點   → law.dgbas FL017556
- 國內外解釋彙編         → 解釋彙編索引頁 News.aspx?n=1522
- 經費結報問答集         → dgbas cp.aspx?n=4322

未在表內的 source 印警告,不寫入(可手動補表後重跑)。

用法
----
    python 05_scripts/_backfill_source_url.py            # dry-run
    python 05_scripts/_backfill_source_url.py --apply
    python 05_scripts/_backfill_source_url.py --overwrite --apply  # 連已有的也覆寫
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"

# ─────────────────────────────────────────────
# Source 名稱 → 官方 URL
# 鍵採「子字串包含比對」,愈長愈精確愈優先
# ─────────────────────────────────────────────
SOURCE_URL_MAP: list[tuple[str, str]] = [
    # 法規本身(law.dgbas.gov.tw 法規系統)
    ("政府支出憑證處理要點",
     "https://law.dgbas.gov.tw/LawContent.aspx?id=FL017556"),
    ("國外出差旅費報支要點解釋彙編",
     "https://www.dgbas.gov.tw/News.aspx?n=1522&sms=10692"),
    ("國外出差旅費報支要點",
     "https://law.dgbas.gov.tw/LawContent.aspx?id=FL017584"),
    ("國內出差旅費報支要點問答集",
     "https://www.dgbas.gov.tw/cp.aspx?n=4342"),
    ("國內出差旅費報支要點暨各機關派員參加國內各項訓練或講習費用補助要點解釋彙編",
     "https://www.dgbas.gov.tw/News.aspx?n=1522&sms=10692"),
    ("國內出差旅費報支要點",
     "https://law.dgbas.gov.tw/LawContent.aspx?id=FL017585"),
    ("國內旅費報支要點",
     "https://law.dgbas.gov.tw/LawContent.aspx?id=FL017585"),
    # 標準表
    ("派赴大陸地區香港及澳門出差人員生活費日支數額表",
     "https://law.dgbas.gov.tw/LawContent.aspx?id=FL017584"),
    ("中央各機關派赴國外進修研究實習人員補助項目及數額表",
     "https://www.dgbas.gov.tw/News.aspx?n=1522&sms=10692"),
    # 問答集
    ("經費結報常見疑義問答集",
     "https://www.dgbas.gov.tw/cp.aspx?n=4322"),
    # 個別函釋(主計總處解釋彙編索引)
    ("函釋",
     "https://www.dgbas.gov.tw/News.aspx?n=1522&sms=10692"),
]


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


def lookup_url(source: str) -> str | None:
    """子字串包含比對(由長至短),回傳第一個命中的 URL。"""
    if not source:
        return None
    for keyword, url in SOURCE_URL_MAP:
        if keyword in source:
            return url
    return None


def upsert_source_url(fm: dict, url: str) -> dict:
    """把 source_url 插入,位置在 source 之後 / 結尾。"""
    new_fm: dict = {}
    inserted = False
    for k, v in fm.items():
        if k == "source_url":
            continue
        new_fm[k] = v
        if k == "source" and not inserted:
            new_fm["source_url"] = url
            inserted = True
    if not inserted:
        new_fm["source_url"] = url
    return new_fm


def process(path: Path, apply: bool, overwrite: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    out = {
        "id": fm.get("id") if fm else None,
        "source": fm.get("source") if fm else None,
        "url": None,
        "action": "skip",
    }
    if fm is None:
        out["action"] = "error"
        return out

    if fm.get("source_url") and not overwrite:
        out["action"] = "skip_existing"
        return out

    url = lookup_url(str(fm.get("source", "")))
    if not url:
        out["action"] = "no_match"
        return out

    out["url"] = url
    out["action"] = "fix"

    if apply:
        new_fm = upsert_source_url(fm, url)
        new_text = "---\n" + render_fm(new_fm) + "\n---\n\n" + body.lstrip("\n")
        new_text = new_text.rstrip() + "\n"
        path.write_text(new_text, encoding="utf-8", newline="\n")

    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--overwrite", action="store_true",
                    help="連已有 source_url 的也覆寫")
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'} {'(覆寫已存在)' if args.overwrite else ''}")
    print("─" * 90)

    fixed = 0
    skipped_existing = 0
    no_match: dict[str, int] = {}
    errors = 0

    for f in files:
        r = process(f, apply=args.apply, overwrite=args.overwrite)
        if r["action"] == "error":
            errors += 1
        elif r["action"] == "fix":
            fixed += 1
        elif r["action"] == "skip_existing":
            skipped_existing += 1
        elif r["action"] == "no_match":
            src = str(r["source"]) or "(空)"
            no_match[src] = no_match.get(src, 0) + 1

    print(f"已補:{fixed} 份")
    print(f"已存在跳過:{skipped_existing} 份")
    if no_match:
        print(f"未在 mapping 表(共 {sum(no_match.values())} 份):")
        for src, cnt in sorted(no_match.items(), key=lambda kv: -kv[1]):
            print(f"  {cnt:4d}  {src}")
    print(f"錯誤:{errors}")
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
