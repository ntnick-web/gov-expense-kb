"""_redact_pii.py — 從 02_markdown/ 移除 PII(地址/電話/email/聯絡人姓名)。

PDF 抽取的函釋常含「函稿表頭」:機關地址、傳真、聯絡人姓名+分機、email、
受文者、發文字號等。這些對讀者無實質意義,反而暴露個資。

處理規則
--------

1. **行刪除**(整行符合即移除):
   行首為下列 label 之一,且後接「:」/「:」者:
     機關地址 / 地址 / 傳真 / 電話 / 聯絡人 / 聯 絡 人 /
     電子郵件 / 電子信箱 / 受文者 / 發文日期 / 發文字號 /
     速別 / 密等及解密... / 附件 / 正本 / 副本

   也偵測「行政院XXX 函機關地址:」這類混合行。

2. **內嵌字串遮蔽**(在保留行內):
   - email:   `xxx@xxx.xxx`           → `(電子郵件已遮蔽)`
   - 電話:    `(02)23910790` / 0X-XXX-XXXX → `(電話已遮蔽)`
   - 不動主計處發文字號(如「主預字第1090051074B號」)— 這是法律檔案編號,非個資

3. **段落級摘要清整**:
   重點摘要區塊去頭時若起頭即為 PII 句(含「機關地址」「電子郵件」),
   整段視為髒摘要,改為 `(摘要待補)` + 加 `summary_pending: true`。

範圍:處理 ## 函釋全文 / 條文全文 / 標準全文 / 重點摘要 / 回答 / 問題 區塊。

用法
----
    python 05_scripts/_redact_pii.py            # dry-run
    python 05_scripts/_redact_pii.py --apply
"""

from __future__ import annotations

import argparse
import re
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
# Patterns
# ─────────────────────────────────────────────

# 行內含下列子字串 → 整行刪除(用 substring 比對,不限行首)
# 半形冒號 ":" 與全形冒號 "：" (U+FF1A) 都要列入,法規 PDF 多用全形
_HC = ":"        # half-width colon
_FC = "："   # fullwidth colon
PII_LINE_SUBSTRINGS: tuple[str, ...] = tuple(
    label + col
    for col in (_HC, _FC)
    for label in (
        "機關地址", "聯絡人", "電子郵件", "電子信箱",
        "受文者", "發文字號", "速別", "正本", "副本",
    )
) + (
    "聯 絡 人", "發文日期", "發文機關", "密等及解密",
)

# 整行符合下列 regex 即刪除(處理 PDF 斷行殘片,如「真:」「址:」「附件:」獨立成行)
PII_LINE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^\s*真\s*[:：]"),                  # 「傳真:」被 PDF 抽取斷成「真:...」
    re.compile(r"^\s*址\s*[:：]\s*\d"),             # 「地址:」斷成「址:10058...」
    re.compile(r"^\s*電\s*話\s*[:：]"),
    re.compile(r"^\s*傳\s*真\s*[:：]"),
    re.compile(r"^\s*[Ee][\-]?[Mm]ail\s*[:：]"),
    re.compile(r"^\s*附\s*件\s*[:：]"),              # 函釋表頭 (有少數情況可能誤殺,接受)
    re.compile(r"^\s*第\s*\d+\s*頁\s*$"),
    re.compile(r"^\s*共\s*\d+\s*頁\s*$"),
    re.compile(r"^\s*~\d+~\s*$"),                   # 抽取出來的頁碼標記
]

# 內嵌正則(於保留行內遮蔽)
EMAIL_RE = re.compile(r"[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+")
# Taiwan phone — **必須有分隔符**(括號或 dash),否則會誤抓公文字號(如 0940006759)
PHONE_RE = re.compile(
    r"(?:"
    r"\(0\d{1,2}\)\s*\d{3,4}[\s\-]?\d{3,4}"   # (02)23910790 / (03) 1234-5678
    r"|0\d{1,2}\-\d{3,4}\-\d{3,4}"             # 02-2391-0790
    r"|\b09\d{2}\-\d{3}\-?\d{3}\b"             # 0912-345-678
    r")"
)

# 用於偵測重點摘要是否已被 PII 污染(只檢查前 80 字)
# 必須是「label + 冒號」或實際 email 格式才算,避免「電子郵件等通訊工具」這類正文誤判
PII_KEYWORDS = tuple(
    label + col
    for col in (_HC, _FC)
    for label in ("機關地址", "電子郵件", "聯絡人", "受文者", "發文字號")
) + (
    "@dgbas", "@gov.tw",  # 限 email 格式;單獨 .gov.tw 是合法官網 URL,不算 PII
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


def render_fm(fm: dict) -> str:
    return yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()


def line_is_pii(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if any(sub in s for sub in PII_LINE_SUBSTRINGS):
        return True
    for p in PII_LINE_PATTERNS:
        if p.match(s):
            return True
    return False


def redact_inline(text: str) -> tuple[str, int]:
    """遮蔽行內 email / 電話。回傳 (新文字, 遮蔽次數)。"""
    n = 0
    new_text, count = EMAIL_RE.subn("(電子郵件已遮蔽)", text)
    n += count
    new_text, count = PHONE_RE.subn("(電話已遮蔽)", new_text)
    n += count
    return new_text, n


def clean_block(block: str) -> tuple[str, dict]:
    """清整一個 H2 block。回傳 (新內容, stats dict)。"""
    stats = {"lines_removed": 0, "inline_redacted": 0}
    out_lines: list[str] = []
    for ln in block.splitlines():
        if line_is_pii(ln):
            stats["lines_removed"] += 1
            continue
        new_ln, n = redact_inline(ln)
        stats["inline_redacted"] += n
        out_lines.append(new_ln)
    return "\n".join(out_lines), stats


def is_summary_pii_polluted(summary: str) -> bool:
    """判定重點摘要是否被 PII 污染(前 80 字含關鍵字)。"""
    head = re.sub(r"\s+", "", summary)[:80]
    return any(kw in head for kw in PII_KEYWORDS)


def replace_section(body: str, heading: str, new_content: str) -> str:
    pattern = rf"(?ms)^(##\s*{re.escape(heading)}\s*\n)(.+?)(?=^##\s|\Z)"
    return re.sub(
        pattern,
        lambda m: m.group(1) + new_content.rstrip() + "\n\n",
        body,
        count=1,
    )


def extract_section(body: str, heading: str) -> str:
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    return m.group(1).strip() if m else ""


HEADINGS_TO_SCAN = ("函釋全文", "條文全文", "標準全文", "回答", "問題")


def process(path: Path, apply: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    out = {
        "id": fm.get("id") if fm else None,
        "lines_removed": 0,
        "inline_redacted": 0,
        "summary_blanked": False,
        "changed": False,
    }
    if fm is None:
        return out

    new_body = body
    total_lines = 0
    total_inline = 0

    for h in HEADINGS_TO_SCAN:
        section = extract_section(new_body, h)
        if not section:
            continue
        cleaned, stats = clean_block(section)
        if cleaned != section:
            new_body = replace_section(new_body, h, cleaned)
            total_lines += stats["lines_removed"]
            total_inline += stats["inline_redacted"]

    out["lines_removed"] = total_lines
    out["inline_redacted"] = total_inline

    # 處理重點摘要(若 PII 污染 → 改 placeholder + summary_pending)
    summary_section = extract_section(new_body, "重點摘要")
    summary_blanked = False
    if summary_section and is_summary_pii_polluted(summary_section):
        new_body = replace_section(new_body, "重點摘要", "(摘要待補)")
        if "summary_pending" not in fm or not fm.get("summary_pending"):
            fm["summary_pending"] = True
        summary_blanked = True
    elif summary_section:
        # 即使沒污染,也要做 inline 遮蔽
        cleaned_sum, sstats = clean_block(summary_section)
        if cleaned_sum != summary_section:
            new_body = replace_section(new_body, "重點摘要", cleaned_sum)
            total_lines += sstats["lines_removed"]
            total_inline += sstats["inline_redacted"]
            out["lines_removed"] = total_lines
            out["inline_redacted"] = total_inline

    out["summary_blanked"] = summary_blanked
    if total_lines == 0 and total_inline == 0 and not summary_blanked:
        return out

    out["changed"] = True
    if apply:
        new_text = "---\n" + render_fm(fm) + "\n---\n\n" + new_body.lstrip("\n")
        new_text = new_text.rstrip() + "\n"
        path.write_text(new_text, encoding="utf-8", newline="\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 90)

    affected = 0
    total_lines = 0
    total_inline = 0
    blanked = 0

    for f in files:
        r = process(f, apply=args.apply)
        if r["changed"]:
            affected += 1
            total_lines += r["lines_removed"]
            total_inline += r["inline_redacted"]
            if r["summary_blanked"]:
                blanked += 1
            if args.verbose or r["lines_removed"] >= 3 or r["summary_blanked"]:
                print(f"  {r['id']}: 刪 {r['lines_removed']} 行,"
                      f"內嵌遮蔽 {r['inline_redacted']} 處"
                      + (" + 摘要重設" if r["summary_blanked"] else ""))

    print("─" * 90)
    print(f"異動檔數:{affected} / {len(files)}")
    print(f"  總刪除行數:{total_lines}")
    print(f"  總內嵌遮蔽:{total_inline}")
    print(f"  摘要重設為待補:{blanked}")
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
