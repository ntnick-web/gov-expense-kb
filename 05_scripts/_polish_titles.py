"""_polish_titles.py — 全面 title 品質統一(2026-04-27 v3)。

問題與目標
----------

1. **20 字硬上限**:卡片版面寬度有限,title 需精煉
2. **PII title 偵測**:title 由含「機關地址/聯絡人/電子郵件/受文者」的 PII 段落
   抽出時(如「行政院主計總處 函機關地」)→ 重新從乾淨段落抽
3. **B 類條目 title 過於空泛**:常為「中央各機關(含事業機構)」這種開頭名詞,
   應補關鍵字成「補助項目及數額表」之類
4. **跳過 contact-block 段落**:抽提綱時若首段為 PII / 函稿表頭,跳到下個段落

不動哪些
--------
- 已是「(刪除)」的 title(由 _mark_status.py 處理)
- 已由 _fix_titles_v2.py 套用語意模板的 title(如「立法目的:XXX」「彙編更新原則」)
- 短於 20 字且不含 PII 標記的 title

用法
----
    python 05_scripts/_polish_titles.py            # dry-run
    python 05_scripts/_polish_titles.py --apply
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

MAX_LEN = 20  # 卡片 title 最大字元數(總長,包含「第N條 」「QN 」等 prefix)

A_HEADINGS = ("條文全文",)
C_HEADINGS = ("函釋全文", "標準全文")
D_HEADINGS = ("問題", "回答")
B_HEADINGS = ("標準全文", "條文全文")

DELETED_MARKERS = ("(刪除)", "(刪除)")

# Title 含這些字串視為 PII title,需重新抽
PII_TITLE_INDICATORS = (
    "機關地址", "機關地",  # 後者抓被 PDF 截斷的「機關地」
    "聯絡人", "電子郵件", "電子信箱", "受文者", "發文字號",
    "傳真:", "傳真:",
    "函機關", "函機",       # 「行政院XX 函機關地址...」這類 PDF 抽函稿表頭
)

# 段落含這些字串視為 PII / 函稿表頭段,抽提綱時跳過
PII_PARA_INDICATORS = (
    "機關地址:", "機關地址:",
    "聯絡人:", "聯絡人:", "聯 絡 人",
    "電子郵件:", "電子郵件:", "電子信箱",
    "受文者:", "受文者:",
    "發文字號:", "發文字號:",
    "速別:", "速別:",
    "正本:", "正本:", "副本:", "副本:",
    "@dgbas", "@gov.tw",
)

# 已是語意模板形式的 title,不重抽
TEMPLATE_PREFIXES = (
    "立法目的:", "立法目的:",
    "用語定義:", "用語定義:",
    "彙編", "適用範圍說明",
    "修正生效規定", "修正後新舊規定銜接",
    "應簽名/蓋章相關規定",
    "體例符號", "標準表修正生效規定",
    "(刪除)", "(刪除)",
)

CN_DIGITS = "〇一二三四五六七八九"


def num_to_cn(n: int) -> str:
    if n < 10:
        return CN_DIGITS[n]
    if n == 10:
        return "十"
    if n < 20:
        return f"十{CN_DIGITS[n - 10]}"
    if n < 100:
        tens, ones = divmod(n, 10)
        return f"{CN_DIGITS[tens]}十" + (CN_DIGITS[ones] if ones else "")
    return str(n)


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


def extract_section(body: str, heading: str) -> str:
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    return m.group(1).strip() if m else ""


def first_section(body: str, headings: tuple[str, ...]) -> str:
    for h in headings:
        s = extract_section(body, h)
        if s:
            return s
    return ""


def is_pii_paragraph(para: str) -> bool:
    flat = re.sub(r"\s+", "", para)[:200]
    return any(ind in flat for ind in PII_PARA_INDICATORS)


def split_paragraphs(text: str) -> list[str]:
    paras = re.split(r"\n\s*\n", text)
    return [p.strip() for p in paras if p.strip()]


def find_first_substantive(text: str) -> str:
    """跳過 PII / 函稿表頭段,回傳第一個實質段落。

    優先順序:
    1. `◎` 起頭的「行」(主計總處函釋的案由標記,可能在段落中間)
    2. 第一個非 PII / 非「主旨:檢送...」cover-letter 段落
    3. 「主旨:」段落,取冒號後內容
    """
    # 1. 任何位置的 ◎ 行(逐段內逐行掃)
    for p in split_paragraphs(text):
        for line in p.split("\n"):
            ls = line.lstrip()
            if ls.startswith("◎"):
                cleaned = ls.lstrip("◎").strip()
                if len(cleaned) >= 6:  # 排除「◎」單獨行
                    return cleaned

    # 2 + 3. 略過 PII + cover letter 段落
    for p in split_paragraphs(text):
        if is_pii_paragraph(p):
            continue
        flat = re.sub(r"\s+", "", p)
        # cover letter:「主旨:檢送/檢陳...」 開頭 — 半 / 全形冒號都檢
        if re.match(r"^主旨\s*[:：]\s*(檢送|檢陳)", flat):
            continue
        m = re.match(r"^主旨\s*[:：]\s*(.+)$", flat)
        if m:
            return m.group(1)
        return p

    paras = split_paragraphs(text)
    return paras[0] if paras else ""


# 提綱清整 — 半形與全形括號/標點都要列(全形:( = U+FF08, ) = U+FF09, : = U+FF1A, , = U+FF0C, , = U+3001)
PREFIX_STRIP_PATTERNS = [
    r"^[目次]\s*$",
    r"^[壹貳參肆伍陸柒捌玖拾]+\s*[、,,].*?(?=\S)",
    r"^◎\s*",
    r"^[(（][一二三四五六七八九十百]+[)）]\s*",
    r"^[(（]\d+[)）]\s*",
    r"^[一二三四五六七八九十]+\s*[、,,]\s*",
    r"^\d+\s*[、,,.]\s*",
    r"^主旨\s*[:：]\s*",
    r"^說明\s*[:：]\s*",
    r"^第\s*[一二三四五六七八九十百零〇○\d]+\s*[條點項款]\s*",
]


def clean_first_clause(text: str, max_len: int) -> str:
    text = text.strip()
    for _ in range(3):
        before = text
        for pat in PREFIX_STRIP_PATTERNS:
            text = re.sub(pat, "", text, count=1).strip()
        if text == before:
            break
    flat = re.sub(r"\s+", "", text)
    if not flat:
        return ""
    # 找到第一個合理斷句點
    best_cut = 0
    for ch in "。;;":
        idx = flat.find(ch)
        if 0 < idx <= max_len:
            best_cut = max(best_cut, idx)
    if not best_cut:
        for ch in ",,":
            idx = flat.find(ch)
            if 6 <= idx <= max_len:
                best_cut = max(best_cut, idx)
    if best_cut:
        result = flat[:best_cut]
    elif len(flat) > max_len:
        # 硬切前 max_len 字
        result = flat[:max_len]
    else:
        result = flat
    return result.strip()


def gen_new_title(fm: dict, body: str) -> str | None:
    node_id = str(fm.get("id", ""))
    m = re.match(r"^([ABCD])-([^-]+)-(\d{3})$", node_id)
    if not m:
        return None
    cat, _parent, serial_str = m.group(1), m.group(2), m.group(3)
    serial = int(serial_str)

    if cat == "A":
        section = first_section(body, A_HEADINGS)
        substantive = find_first_substantive(section)
        prefix = f"第{num_to_cn(serial)}條 "
        kernel = clean_first_clause(substantive, max_len=MAX_LEN - len(prefix))
        if not kernel:
            return None
        return prefix + kernel

    if cat == "B":
        section = first_section(body, B_HEADINGS)
        substantive = find_first_substantive(section)
        kernel = clean_first_clause(substantive, max_len=MAX_LEN)
        return kernel or None

    if cat == "C":
        section = first_section(body, C_HEADINGS)
        substantive = find_first_substantive(section)
        kernel = clean_first_clause(substantive, max_len=MAX_LEN)
        return kernel or None

    if cat == "D":
        section = first_section(body, D_HEADINGS)
        substantive = find_first_substantive(section)
        prefix = f"Q{serial} "
        kernel = clean_first_clause(substantive, max_len=MAX_LEN - len(prefix))
        if not kernel:
            return None
        return prefix + kernel

    return None


def needs_polish(title: str) -> tuple[bool, str]:
    if not title:
        return True, "空白"
    t = title.strip()
    # 已廢止標記留著
    if any(t == m for m in DELETED_MARKERS):
        return False, ""
    # 已套用語意模板的不動
    if any(t.startswith(p) for p in TEMPLATE_PREFIXES):
        return False, ""
    # PII title
    if any(ind in t for ind in PII_TITLE_INDICATORS):
        return True, "PII title"
    # 過長
    if len(t) > MAX_LEN:
        return True, f"過長({len(t)}>{MAX_LEN})"
    return False, ""


def truncate_to_max(title: str) -> str:
    """簡單截斷:若 > MAX_LEN,先在合理斷句點截,否則硬切。保留 prefix。"""
    if len(title) <= MAX_LEN:
        return title
    # 找前綴(第N條 / QN)
    m = re.match(r"^(第[一二三四五六七八九十百〇○零\d]+條\s*)(.+)$", title)
    if m:
        prefix, rest = m.group(1), m.group(2)
    else:
        m = re.match(r"^(Q\d+\s*)(.+)$", title)
        if m:
            prefix, rest = m.group(1), m.group(2)
        else:
            prefix, rest = "", title
    avail = MAX_LEN - len(prefix)
    if avail <= 2:
        return title[:MAX_LEN]
    # 在合理位置斷
    for ch in "。;;":
        idx = rest.find(ch)
        if 0 < idx <= avail:
            return prefix + rest[:idx]
    for ch in ",,":
        idx = rest.find(ch)
        if 6 <= idx <= avail:
            return prefix + rest[:idx]
    return prefix + rest[:avail]


def process(path: Path, apply: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    out = {
        "id": fm.get("id") if fm else None,
        "old": fm.get("title") if fm else None,
        "new": None,
        "reason": "",
        "action": "skip",
    }
    if fm is None:
        out["action"] = "error"
        return out

    title = str(fm.get("title", ""))
    need, reason = needs_polish(title)
    if not need:
        return out

    out["reason"] = reason

    # PII title → 全部重抽
    if reason == "PII title":
        new_title = gen_new_title(fm, body)
        if not new_title:
            out["action"] = "skip_no_source"
            return out
        new_title = truncate_to_max(new_title)
    else:
        # 過長 → 先試重抽,若重抽失敗就硬截斷
        new_title = gen_new_title(fm, body)
        if not new_title or len(new_title) > MAX_LEN:
            new_title = truncate_to_max(new_title or title)

    if not new_title or new_title == title:
        out["action"] = "no_change"
        return out

    out["new"] = new_title
    out["action"] = "fix"

    if apply:
        fm["title"] = new_title
        new_text = "---\n" + render_fm(fm) + "\n---\n\n" + body.lstrip("\n")
        new_text = new_text.rstrip() + "\n"
        path.write_text(new_text, encoding="utf-8", newline="\n")

    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--show", type=int, default=20, help="dry-run 顯示前 N 筆變動範例")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 100)

    fixed: list[dict] = []
    by_reason: dict[str, int] = {}
    errors = 0

    for f in files:
        r = process(f, apply=args.apply)
        if r["action"] == "error":
            errors += 1
        elif r["action"] == "fix":
            fixed.append(r)
            by_reason[r["reason"]] = by_reason.get(r["reason"], 0) + 1

    show_n = args.show if not args.verbose else len(fixed)
    for r in fixed[:show_n]:
        tag = "[改名]" if args.apply else "[擬改名]"
        print(f"  {tag} {r['id']}  ({r['reason']})")
        print(f"        舊: {r['old']!r}")
        print(f"        新: {r['new']!r}")

    print("─" * 100)
    print(f"已修整:{len(fixed)} 份")
    for k, v in sorted(by_reason.items()):
        print(f"  {k}: {v}")
    print(f"錯誤:{errors}")
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 2 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
