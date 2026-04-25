"""一次性工具:掃 00_source/ 找出重複的條/Q檔,選 keep 與 skip。

策略:
- 經費結報常見疑義問答集_QN_*: 同 Q 多檔時,**保留檔案大小最小者**(乾淨單題)
- 政府支出憑證處理要點_第N條_*: 同條多檔時,人工指定要保留的版本
- 國內出差旅費報支要點問答集_QN_*: 同 Q 多檔時,**保留檔案大小最小者**

輸出 00_source/_skip.txt(每行一個要跳過的檔名),供 01_extract.py 讀取。
"""

from __future__ import annotations
import os
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "00_source"
SKIP_FILE = SOURCE_DIR / "_skip.txt"

# 政府支出憑證處理要點 — 人工指定要保留的版本(其餘同條的跳過)
A_KEEP_OVERRIDES: dict[str, str] = {
    # 第一條:保留正式條文(政府及其所屬機關...);跳過片段(訂有契約或未訂契約)
    "第一條": "政府支出憑證處理要點_第一條_一_政府及其所屬機關_構__學校_以下簡稱各機關.md",
    # 第二條:保留正式條文(本要點所稱支出憑證);跳過格式表(第○○次付款)
    "第二條": "政府支出憑證處理要點_第二條_二_本要點所稱支出憑證_指為證明支付事實所取得之收.md",
}

# 其他要永久跳過的檔(網頁剪輯、與既存 .md 重複的 PDF 等)
EXTRA_SKIP: set[str] = {
    # PDF 與既有 .md(中央各機關派赴國外進修研究實習人員補助項目及數額表)重複,且本機無 pdfplumber
    "中央各機關(含事業機構)派赴國外進修、研究、實習人員補助項目及數額表.pdf",
    # 網頁剪輯(整頁 HTML 抓取),非結構化條文/Q&A,先擱置
    "行政院主計總處-友善經費報支專區-(國內旅費報支要點-第5點1)國內出差交通費報支相關事項問答集.md",
}


def collect_files() -> list[Path]:
    return sorted(
        p for p in SOURCE_DIR.rglob("*")
        if p.is_file() and not p.name.startswith("_")
    )


def dedup_qa_smallest(files: list[Path], prefix: str) -> set[str]:
    """同前綴 + 同 Q 號 多檔時,跳過所有非最小者。回傳要跳過的檔名集。"""
    groups: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for f in files:
        if not f.name.startswith(prefix):
            continue
        m = re.search(r"_(Q\d+)_", f.name)
        if not m:
            continue
        groups[m.group(1)].append((f.stat().st_size, f.name))
    skip: set[str] = set()
    for q, items in groups.items():
        if len(items) <= 1:
            continue
        items.sort()  # smallest first
        for _size, name in items[1:]:
            skip.add(name)
    return skip


def dedup_a_overrides(files: list[Path], prefix: str, overrides: dict[str, str]) -> set[str]:
    """同前綴 + 同 第N條 多檔時,只留下 overrides 指定的版本,其餘跳過。"""
    groups: dict[str, list[str]] = defaultdict(list)
    for f in files:
        if not f.name.startswith(prefix):
            continue
        m = re.search(r"_(第[一二三四五六七八九十百零〇○\d]+條)_", f.name)
        if not m:
            continue
        groups[m.group(1)].append(f.name)
    skip: set[str] = set()
    for clause, names in groups.items():
        if len(names) <= 1:
            continue
        keep = overrides.get(clause)
        if not keep:
            print(f"  ! 警告:{clause} 有 {len(names)} 個版本但無人工指定 keep:")
            for n in names:
                print(f"      - {n}")
            continue
        for n in names:
            if n != keep:
                skip.add(n)
    return skip


def main() -> int:
    if not SOURCE_DIR.exists():
        print(f"找不到 {SOURCE_DIR}")
        return 1

    files = collect_files()
    print(f"掃描 {len(files)} 個來源檔")

    skip: set[str] = set()
    skip |= dedup_qa_smallest(files, "經費結報常見疑義問答集_")
    skip |= dedup_qa_smallest(files, "國內出差旅費報支要點問答集_")
    skip |= dedup_a_overrides(files, "政府支出憑證處理要點_", A_KEEP_OVERRIDES)
    skip |= EXTRA_SKIP

    skip_list = sorted(skip)
    SKIP_FILE.write_text(
        "# 由 _compute_skip_list.py 產生;01_extract.py 讀取此檔以跳過重複/雜訊檔\n"
        "# 每行一個檔名(不含路徑)\n"
        + "\n".join(skip_list) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"寫入 {SKIP_FILE.relative_to(ROOT)}({len(skip_list)} 筆)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
