"""_strip_summary_noise.py — 對「自動初校」MD 的 ## 重點摘要 區塊做低風險清整。

範圍
----
僅處理 review_level: 自動初校 的檔(485 份),不動 review_level: 人工 的 28 份。

三條規則(只改、不刪)
--------------------
1. **剝 `_(自動初校,待人工潤飾)_` 殘片**:
   原應放在 `## 重點摘要` 區塊尾部作為斜體標記,但有少數因為摘要 < 100 字
   (build_index 的 SUMMARY_LIMIT)就把標記也抽進前端 summary 欄位。
   → 把這行從區塊內**移到尾部單獨一行**,中間留空行,確保摘要本體乾淨。

2. **跳過公文字號 / 主計長信箱 開頭**:
   像「(原行政院主計處99.7.15處忠字第0990004365號『主計長信箱』)本案奉派…」
   實質回答躲在後面。偵測這類括號後設資訊,**從第一個句號或半形括號後切**,
   只在「跳過後仍有實質中文內容(≥ 25 字)」時才動。

3. **過短摘要補長**(≥ 25 字才合格):
   若新摘要長度 < 25 字,且後文(同一 H2 區塊內或下一 H2)有實質敘述,
   就接續補到 ≥ 60 字為止。**不改變整體區塊結構,只是把第一段擴開**。

不動的事
--------
- 不改 `review_level`(維持「自動初校」)
- 不改 `reviewed`、`status`、`tags`、`related` 等欄位
- 不動 `## 條文全文`、`## 函釋全文`、`## 重點摘要` 以外的區塊
- 已是「人工」校對的 MD 跳過(避免覆蓋人工潤飾)

用法
----
    python 05_scripts/_strip_summary_noise.py            # dry-run + diff
    python 05_scripts/_strip_summary_noise.py --apply
    python 05_scripts/_strip_summary_noise.py --limit 5  # 只跑前 5 筆(看效果)

執行流程
--------
- dry-run 顯示前 N 筆變動的 before/after,以及總計改了幾筆、哪些 case
- `--apply` 寫回 02_markdown/*.md
- 寫回後跑 `python 05_scripts/03_build_index.py` 重建 03_index/
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

import yaml

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"

AUTO_NOTICE_RE = re.compile(r"_\(自動初校[,，]\s*待人工潤飾\)_")

# 偵測「公文字號 / 主計長信箱」括號開頭。
# 例:
#   (原行政院主計處99.7.15處忠字第0990004365號「主計長信箱」)
#   (行政院主計總處107.3.20主預字第1070051071號「主計長信箱」)
#   (行政院主計總處106.5.31主預字第1060101159B號書函)
#   (財政部XX年XX月XX日台財XX字第XXXXXXX號函)
# 用全形或半形括號;內含「字第...號」或「主計長信箱」或「書函」等公文標記字眼
# 全形括號 U+FF08 / U+FF09 用 \uXXXX 寫,避免編輯器把全形當半形顯示時改錯
DOC_NO_INLINE_RE = re.compile(
    "[(（]\\s*"
    "(?:原?行政院主計[處總]處|財政部|教育部|考試院|銓敘部|人事行政總?處|審計部)"
    "[^)）]{0,150}?"
    "(?:字第|第[0-9A-Z]+號|主計長信箱|書函|函釋|釋字)"
    "[^)）]{0,40}?"
    "[)）]"
)

# 過短判定門檻
MIN_SUMMARY_LEN = 25
# 補長後目標長度(達此即停)
EXTEND_TARGET = 60


def split_fm(text: str):
    if not text.startswith("---"):
        return None, None, text
    end = text.find("\n---", 3)
    if end < 0:
        return None, None, text
    raw = text[3:end]
    try:
        fm = yaml.safe_load(raw)
    except yaml.YAMLError:
        return None, None, text
    if not isinstance(fm, dict):
        return None, None, text
    body = text[end + 4:].lstrip("\n")
    return raw, fm, body


def extract_h2_block(body: str, heading: str) -> tuple[Optional[str], int, int]:
    """切出 ## {heading} 區塊內容,回傳 (content, start, end) byte 位置。
    若找不到回傳 (None, -1, -1)。
    """
    pat = re.compile(rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)")
    m = pat.search(body)
    if not m:
        return None, -1, -1
    return m.group(1).rstrip(), m.start(1), m.end(1)


def replace_h2_block(body: str, heading: str, new_content: str) -> str:
    """重寫 ## {heading} 區塊內容(content 部分,不含 H2 標題行)。"""
    content, start, end = extract_h2_block(body, heading)
    if content is None:
        return body
    # 確保段落結尾換行;區塊間留空行
    new = new_content.rstrip() + "\n\n"
    return body[:start] + new + body[end:].lstrip("\n")


def rule1_strip_auto_notice(content: str) -> tuple[str, bool]:
    """規則 1:把摘要本體內的 _(自動初校,待人工潤飾)_ 剝出來,
    若不在末尾單獨一行,把它移到末尾並前後留空行。
    """
    if not AUTO_NOTICE_RE.search(content):
        return content, False
    # 把所有出現位置移除,最後加回末尾單獨一行
    body_only = AUTO_NOTICE_RE.sub("", content).rstrip()
    if not body_only:
        return content, False  # 整段都是 marker,不要動
    new = body_only + "\n\n_(自動初校,待人工潤飾)_"
    return new, new != content


def rule2_strip_doc_no_inline(content: str) -> tuple[str, bool]:
    """規則 2:刪除中間或開頭出現的公文字號/主計長信箱括號(整段刪除)。
    刪除後若剩餘實質字數 < 25,放棄(避免把太多東西刪光)。
    """
    notice_m = AUTO_NOTICE_RE.search(content)
    body = content[:notice_m.start()].rstrip() if notice_m else content
    notice = content[notice_m.start():] if notice_m else ""

    new_body = DOC_NO_INLINE_RE.sub("", body)
    if new_body == body:
        return content, False
    # 把刪除括號後產生的相鄰多餘空白壓平,但保留段落換行
    new_body = re.sub(r"[ \t]+", " ", new_body)
    new_body = re.sub(r"\n{3,}", "\n\n", new_body).strip()

    flat = re.sub(r"\s+", "", new_body)
    if len(flat) < MIN_SUMMARY_LEN:
        return content, False
    new = new_body + ("\n\n" + notice if notice else "")
    return new, new != content


def rule3_extend_short(content: str, body_full: str, h2_name: str) -> tuple[str, bool]:
    """規則 3:摘要過短(< MIN_SUMMARY_LEN)時,從同一檔的後續 H2 區塊
    (條文全文 / 函釋全文 / Q&A / 標準全文)抽接續內容補長,直到 EXTEND_TARGET 字。

    僅對 ## 重點摘要 區塊套用(h2_name 必須是「重點摘要」)。
    """
    if h2_name != "重點摘要":
        return content, False

    notice_m = AUTO_NOTICE_RE.search(content)
    body = content[:notice_m.start()].rstrip() if notice_m else content
    notice = content[notice_m.start():] if notice_m else ""

    # 防呆:若 body 是 placeholder(由 _cleanup 腳本標記為 summary_pending 的檔),
    # 不要硬補,讓它維持 placeholder 狀態
    if any(mark in body for mark in ("(摘要待補)", "(待人工補)", "TODO", "待補")):
        return content, False

    flat = re.sub(r"\s+", "", body)
    if len(flat) >= MIN_SUMMARY_LEN:
        return content, False

    # 從後續 H2 撈接續內容
    candidate_h2 = ["條文全文", "函釋全文", "標準全文", "問題", "答覆", "Q&A"]
    extra_chunks: list[str] = []
    for h2 in candidate_h2:
        sub, _, _ = extract_h2_block(body_full, h2)
        if sub:
            # 移除 markdown 連結與列表記號,保持純文字
            cleaned = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", sub)
            cleaned = re.sub(r"(?m)^\s*[-*+]\s+", "", cleaned)
            cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
            if cleaned and cleaned not in body:
                extra_chunks.append(cleaned)

    if not extra_chunks:
        return content, False

    # 串接並截至 EXTEND_TARGET 之後最近的句號為止
    combined = body + "\n\n" + "\n\n".join(extra_chunks)
    flat_combined = re.sub(r"\s+", "", combined)
    if len(flat_combined) <= EXTEND_TARGET:
        new_body = combined
    else:
        # 找 EXTEND_TARGET 字後面第一個句號 / 分號 / 問號斷點(避免硬切)
        target = EXTEND_TARGET
        # 在 flat 上找,但要對應回 combined
        # 簡化:直接截 combined 到 ~target*1.5 字然後找句號
        soft_limit = target * 2
        truncated = ""
        flat_count = 0
        for ch in combined:
            truncated += ch
            if not ch.isspace():
                flat_count += 1
            if flat_count >= soft_limit:
                break
        # 再找最近的句號 / 全形分號 / 全形問號
        match = re.search(r"^(.+?[。;?!；?!])", truncated, re.DOTALL)
        if match:
            new_body = match.group(1)
        else:
            new_body = truncated

    new = new_body.rstrip() + ("\n\n" + notice if notice else "")
    return new, new != content


def process_md(md_path: Path) -> Optional[dict]:
    text = md_path.read_text(encoding="utf-8")
    raw, fm, body = split_fm(text)
    if fm is None:
        return None
    # 只處理自動初校;人工跳過
    if fm.get("review_level") != "自動初校":
        return None

    content, start, end = extract_h2_block(body, "重點摘要")
    if content is None:
        return None

    new_content = content
    rules_fired: list[str] = []

    # 規則 1
    after1, fired1 = rule1_strip_auto_notice(new_content)
    if fired1:
        new_content = after1
        rules_fired.append("strip_notice")

    # 規則 2
    after2, fired2 = rule2_strip_doc_no_inline(new_content)
    if fired2:
        new_content = after2
        rules_fired.append("strip_docno")

    # 規則 3 (extend_short) 已停用:現存「過短摘要」對應的 H2 區塊本身就破碎
    # (PDF 抽取殘渣居多),強行補長反而把垃圾拉出來,造成 regression。
    # 留 rule3_extend_short 函式以備未來資料品質提升後可重新啟用。

    if new_content == content:
        return None

    new_body = replace_h2_block(body, "重點摘要", new_content)
    new_text = "---\n" + raw + "\n---\n\n" + new_body

    return {
        "path": md_path,
        "id": fm.get("id"),
        "title": fm.get("title"),
        "before": content,
        "after": new_content,
        "rules": rules_fired,
        "new_text": new_text,
    }


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true", help="實際寫回 02_markdown/*.md")
    p.add_argument("--limit", type=int, default=0, help="僅處理前 N 筆(0=全部)")
    p.add_argument("--show-diff", type=int, default=15, help="顯示前 N 筆 diff")
    args = p.parse_args(argv)

    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    results: list[dict] = []
    for md in sorted(MD_DIR.rglob("*.md")):
        r = process_md(md)
        if r:
            results.append(r)
        if args.limit and len(results) >= args.limit:
            break

    print(f"=== Strip summary noise ({'APPLY' if args.apply else 'DRY-RUN'}) ===")
    print(f"自動初校 MD 中,有變動者:{len(results)} 筆")
    rule_counts = Counter(rule for r in results for rule in r["rules"])
    for rule, n in rule_counts.most_common():
        print(f"  - {rule}: {n}")

    print(f"\n--- 前 {min(args.show_diff, len(results))} 筆 diff ---")
    for r in results[: args.show_diff]:
        print(f"\n[{r['id']}] {(r['title'] or '')[:30]} (rules: {','.join(r['rules'])})")
        print(f"  BEFORE: {r['before'][:160]}")
        print(f"   AFTER: {r['after'][:160]}")

    if args.apply:
        for r in results:
            r["path"].write_text(r["new_text"], encoding="utf-8")
        print(f"\n已寫入 {len(results)} 份 MD。記得跑 python 05_scripts/03_build_index.py 重建索引。")
    else:
        print("\n(dry-run,未寫檔。加 --apply 實際寫入)")
        print("提示:先用 --limit 5 看效果,確認規則沒誤判再 --apply")

    return 0


if __name__ == "__main__":
    sys.exit(main())
