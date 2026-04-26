"""_fix_pending_summaries.py — 修補 summary_pending: true 的摘要。

對 17 份 placeholder 摘要,從 ## 函釋全文 重抽:
  1. 削掉 PDF 殘渣(目次、頁碼引導行、孤立 ◎ 章節編號)
  2. 壓縮空白、合併多行為一段
  3. 取前 200 字(或截到第一個合理句末)
  4. 結尾若像是「問題未答覆」(以「?」「?」「為何」「可否」結尾)→ 加註
  5. 若清整後仍 < 30 字 → 保留 summary_pending,僅印警告

寫入後移除 summary_pending: true(若還是 placeholder 則保留)。

用法
----
    python 05_scripts/_fix_pending_summaries.py            # dry-run
    python 05_scripts/_fix_pending_summaries.py --apply
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

H2_HEADINGS = ("函釋全文", "條文全文", "標準全文", "回答", "問題")

DOT_LEADER_PAGE_RE = re.compile(r"[\.……]{3,}\s*\d+\s*$")
DOT_LEADER_RE = re.compile(r"\.{3,}|…{2,}|…{2,}")
ISOLATED_TOC_LINE_RE = re.compile(
    r"^\s*("
    r"[壹貳參肆伍陸柒捌玖拾]+\s*[、,].*"
    r"|◎\s*[一二三四五六七八九十]+\s*[、,].*"
    r"|目\s*$|次\s*$|目\s*次\s*$"
    r"|[IⅠ]\s*$"
    r")\s*$"
)
SUMMARY_LIMIT = 200


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


def extract_section(body: str, heading: str) -> tuple[int, int, str]:
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    if not m:
        return -1, -1, ""
    return m.start(1), m.end(1), m.group(1)


def first_section(body: str) -> str:
    for h in H2_HEADINGS:
        _, _, content = extract_section(body, h)
        if content.strip():
            return content
    return ""


def clean_body(text: str) -> str:
    """削掉 PDF 殘渣行 + 壓縮空白。"""
    lines = []
    for ln in text.splitlines():
        s = ln.strip()
        if not s:
            continue
        if DOT_LEADER_PAGE_RE.search(s):
            continue
        if ISOLATED_TOC_LINE_RE.match(s):
            continue
        if DOT_LEADER_RE.search(s) and re.search(r"\d", s):
            continue
        lines.append(s)
    if not lines:
        return ""
    joined = "".join(lines)
    # 刪頁碼殘渣(阿拉伯 / 羅馬數字)結尾
    joined = re.sub(r"\d{1,3}\s*$", "", joined)
    joined = re.sub(r"[IVXⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]{1,5}\s*$", "", joined)
    joined = re.sub(r"\d{1,3}\s*$", "", joined)
    return joined.strip()


def looks_like_unanswered_question(text: str) -> bool:
    if not text:
        return False
    end = text[-2:]
    if "?" in end or "?" in end:
        return True
    last10 = text[-10:]
    if any(kw in last10 for kw in ("可否", "為何", "如何辦理")):
        return True
    return False


def gen_summary(body_text: str) -> str | None:
    cleaned = clean_body(body_text)
    if not cleaned or len(cleaned) < 30:
        return None
    summary = cleaned[:SUMMARY_LIMIT]
    # 切到合理句末
    for ch in "。;;":
        idx = summary.rfind(ch)
        if idx >= 60:
            summary = summary[: idx + 1]
            break
    if looks_like_unanswered_question(summary):
        summary += "(本彙編僅列出問題,未含答覆)"
    return summary


def replace_summary_section(body: str, new_summary: str) -> str:
    s, e, _ = extract_section(body, "重點摘要")
    if s < 0:
        return body
    new_block = new_summary.rstrip() + "\n\n"
    return body[:s] + new_block + body[e:]


def process(path: Path, apply: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    out = {
        "id": fm.get("id") if fm else None,
        "old_pending": False,
        "new_summary": None,
        "action": "skip",
    }
    if fm is None:
        out["action"] = "error"
        return out
    if not fm.get("summary_pending"):
        return out
    out["old_pending"] = True

    src = first_section(body)
    new_sum = gen_summary(src)
    if not new_sum:
        out["action"] = "still_pending"
        return out

    out["new_summary"] = new_sum
    out["action"] = "fix"

    if apply:
        new_body = replace_summary_section(body, new_sum)
        # 移除 summary_pending: true 欄位
        if "summary_pending" in fm:
            fm.pop("summary_pending", None)
        new_text = "---\n" + render_fm(fm) + "\n---\n\n" + new_body.lstrip("\n")
        new_text = new_text.rstrip() + "\n"
        path.write_text(new_text, encoding="utf-8", newline="\n")

    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 100)

    fixed = 0
    still_pending = 0
    errors = 0
    for f in files:
        r = process(f, apply=args.apply)
        if r["action"] == "error":
            errors += 1
            print(f"  [!!] {f.relative_to(ROOT).as_posix()}")
        elif r["action"] == "fix":
            fixed += 1
            tag = "[修補]" if args.apply else "[擬修補]"
            print(f"  {tag} {r['id']}")
            print(f"        新摘要: {r['new_summary'][:80]}{'...' if len(r['new_summary'])>80 else ''}")
        elif r["action"] == "still_pending":
            still_pending += 1
            print(f"  [仍待補] {r['id']}: 函釋全文清整後仍不足 30 字")

    print("─" * 100)
    print(f"已修補:{fixed} 份")
    print(f"仍待補:{still_pending} 份")
    print(f"錯誤:{errors}")
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
