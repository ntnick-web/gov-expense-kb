"""_retitle_quality_check.py — 對 review.csv 做一次自動品質檢查。

檢查項目:
1. 過短(關鍵字部分 < 3 字)
2. PII 殘留(機關地址 / 聯絡人 / @ / 函機關 等)
3. 截斷殘渣(結尾為標點、含括號編號開頭、含「(一)」未閉合)
4. 過度泛化(只「規定」「程序」「處理」「辦法」這類兜底字)
5. 同母題內 new_title 重複(若新 title 一樣可能不夠精準)
6. 法規前言式殘留(「為規範...特訂定本要點」「本要點所稱...」)
7. 公文字號殘留(「行政院 N 年 N 月 N 日」「字第」)
8. 全形與半形括號未配對
"""

from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "05_scripts" / "_retitle_proposals" / "review.csv"

PII_INDICATORS = ["機關地址", "聯絡人", "電子郵件", "電子信箱", "受文者",
                  "發文字號", "@dgbas", "@gov.tw", "函機關"]
TRUNCATION_TAILS = ("、", ",", ":", "(", "（", "之", "及", "與", "或", "其", "等")
PREFACE_PATTERNS = [
    r"為規範.*?特訂定",
    r"本要點所稱",
    r"本彙編須配合",
]
JUNK_TITLES = {"規定", "程序", "處理", "辦法", "辦理", "結報", "報支"}


def strip_prefix(title: str) -> str:
    """剝掉「第N條 」「QN 」前綴,回傳關鍵字部分。"""
    m = re.match(r"^第\s*[一二三四五六七八九十百〇○零\d]+\s*條\s+(.+)$", title)
    if m:
        return m.group(1).strip()
    m = re.match(r"^Q\s*\d+\s+(.+)$", title)
    if m:
        return m.group(1).strip()
    return title.strip()


def check_row(r: dict) -> list[str]:
    issues: list[str] = []
    new = r["new_title"]
    kernel = strip_prefix(new)

    if len(kernel) < 3:
        issues.append(f"過短({len(kernel)})")

    for ind in PII_INDICATORS:
        if ind in new:
            issues.append(f"PII({ind})")

    if new.endswith(TRUNCATION_TAILS):
        issues.append(f"結尾標點({new[-1]})")

    if re.match(r"^[(（][一二三四五六七八九十\d]+[)）]", new):
        issues.append("括號編號開頭")

    for pat in PREFACE_PATTERNS:
        if re.search(pat, new):
            issues.append(f"前言式({pat})")

    if re.search(r"行政院.*?[年月]", new) or "字第" in new:
        issues.append("公文字號殘留")

    if kernel in JUNK_TITLES:
        issues.append(f"過度泛化({kernel})")

    if "(" in new and ")" not in new:
        issues.append("半形括號未配對")
    if "（" in new and "）" not in new:
        issues.append("全形括號未配對")

    return issues


def main() -> int:
    if not CSV_PATH.exists():
        print(f"找不到 {CSV_PATH}", file=sys.stderr)
        return 1

    rows: list[dict] = []
    with CSV_PATH.open("r", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            rows.append(r)

    print(f"檢查 {len(rows)} 筆 proposal\n")

    flagged: list[tuple[dict, list[str]]] = []
    for r in rows:
        issues = check_row(r)
        if issues:
            flagged.append((r, issues))

    by_issue: dict[str, int] = defaultdict(int)
    for _r, issues in flagged:
        for i in issues:
            i_key = i.split("(")[0]
            by_issue[i_key] += 1

    if flagged:
        print(f"[標記] {len(flagged)} 筆有疑慮:")
        for r, issues in flagged:
            print(f"  {r['id']}  {' / '.join(issues)}")
            print(f"    舊: {r['old_title']}")
            print(f"    新: {r['new_title']}")
    else:
        print("[OK] 無自動偵測到的疑慮")

    print()
    print("─" * 60)
    print(f"統計:{len(flagged)} / {len(rows)} 筆有疑慮")
    for k, v in sorted(by_issue.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")

    # 重複檢查
    by_parent_title: dict[tuple[str, str], list[str]] = defaultdict(list)
    for r in rows:
        kernel = strip_prefix(r["new_title"])
        by_parent_title[(r["parent"], kernel)].append(r["id"])
    dup_count = 0
    print("\n[重複檢查] 同母題 new_title 關鍵字相同(可能不夠精準):")
    for (parent, kernel), ids in sorted(by_parent_title.items()):
        if len(ids) > 1:
            dup_count += 1
            print(f"  {parent} / {kernel!r}  ←  {', '.join(ids)}")
    if dup_count == 0:
        print("  無重複")

    # 長度分布
    print("\n[長度分布] kernel 長度(去掉前綴):")
    bucket: dict[int, int] = defaultdict(int)
    for r in rows:
        bucket[len(strip_prefix(r["new_title"]))] += 1
    for ln in sorted(bucket):
        bar = "█" * min(bucket[ln], 60)
        print(f"  {ln:>2} 字: {bucket[ln]:>3} {bar}")

    return 0 if not flagged else 0  # 永遠 0,僅供 review


if __name__ == "__main__":
    sys.exit(main())
