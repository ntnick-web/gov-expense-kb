"""對 02_markdown / docs / README 內的 markdown 連結做存在性檢查。

只檢查相對連結(內部連結),不檢查外部 http(s)。

執行:
    python 05_scripts/_link_check.py            # 預設 stdout 輸出
    python 05_scripts/_link_check.py --strict   # 有錯時 exit 2
"""
from __future__ import annotations
import sys
import re
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 掃描範圍
SCAN_PATHS = [
    ROOT / "02_markdown",
    ROOT / "docs",
    ROOT / "README.md",
    ROOT / "LICENSE.md",
]

# Markdown 連結 [text](url) — 抓 url 部分
LINK_RE = re.compile(r"\[([^\]\n]+)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")

# 跳過外部 / 特殊 schema
EXTERNAL_SCHEMES = ("http://", "https://", "mailto:", "tel:", "ftp:", "data:")


def iter_md_files() -> list[Path]:
    files: list[Path] = []
    for p in SCAN_PATHS:
        if not p.exists():
            continue
        if p.is_file() and p.suffix == ".md":
            files.append(p)
        elif p.is_dir():
            files.extend(p.rglob("*.md"))
    return sorted(set(files))


def check_link(source: Path, target_url: str) -> str | None:
    """回傳錯誤訊息(若連結損壞)或 None(連結有效或為外部)。"""
    if target_url.startswith(EXTERNAL_SCHEMES):
        return None
    # 拆掉 anchor (#xxx) 與 query (?xxx)
    target_clean = target_url.split("#", 1)[0].split("?", 1)[0]
    if not target_clean:
        # 純 anchor (#section),內文錨點;無法用檔案系統驗證,跳過
        return None
    target_path = (source.parent / target_clean).resolve()
    # 不能跑出 repo 邊界
    try:
        target_path.relative_to(ROOT)
    except ValueError:
        return f"連結目標跑出 repo 邊界: {target_url}"
    if not target_path.exists():
        return f"連結目標不存在: {target_url} → {target_path.relative_to(ROOT)}"
    return None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--strict", action="store_true", help="有錯時 exit 2")
    args = p.parse_args()

    files = iter_md_files()
    print(f"Link check — 掃 {len(files)} 個 markdown 檔")

    errors: list[str] = []
    total_links = 0
    skipped_in_code = 0
    for src in files:
        try:
            text = src.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"  {src.relative_to(ROOT)}: 無法以 utf-8 讀取")
            continue
        # 標記 code block(```...```)範圍,fenced links 不檢查(屬範例 placeholder)
        in_code = False
        code_ranges: list[tuple[int, int]] = []
        for m in re.finditer(r"^```", text, re.MULTILINE):
            if not in_code:
                start = m.start()
                in_code = True
            else:
                code_ranges.append((start, m.end()))
                in_code = False
        # inline code(`...`)單行同理跳過
        def in_code_block(pos: int) -> bool:
            return any(s <= pos < e for s, e in code_ranges)
        for m in LINK_RE.finditer(text):
            if in_code_block(m.start()):
                skipped_in_code += 1
                continue
            total_links += 1
            url = m.group(2).strip()
            err = check_link(src, url)
            if err:
                errors.append(f"  {src.relative_to(ROOT)}: {err}")

    print(f"檢查 {total_links} 條連結(跳過 code block 內 {skipped_in_code} 條範例連結)")
    if errors:
        print(f"❌ 發現 {len(errors)} 條損壞連結:")
        for e in errors:
            print(e)
        if args.strict:
            sys.exit(2)
    else:
        print("✓ 全部連結正常")


if __name__ == "__main__":
    main()
