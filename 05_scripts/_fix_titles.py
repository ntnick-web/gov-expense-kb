"""_fix_titles.py — 為截斷/檔名直譯/含 TODO 的 title 自動重生新標題。

判定為「需修正」的 title:
  - 含「TODO」字串
  - 結尾為「,」「，」「(」「（」「:」「:」(語意未完)
  - 括號未配對(只有左括號沒右括號)
  - 結尾為省略號 / 連續點(`...` / `…`)
  - 結尾單字為「以」「之」「及」「等」「為」「按」「依」(常見截斷收尾)且總長 < 20 字
  - 長度 < 6 字(過短;Q1~Q9 排除)

不動
  - 已是「（刪除）」者(由 _mark_status.py 處理)
  - 從 H2 區塊抽不到可用內容者(僅警告)

新 title 生成規則
  - A 類:「第{中文 N}條 {正文首段提綱 ≤15 字}」
  - C 類:「{函釋全文首段提綱 ≤22 字}」(去掉 PDF 殘渣前綴)
  - D 類:「Q{N} {問題首段 ≤22 字}」

使用範例
--------
    python 05_scripts/_fix_titles.py            # dry-run 列建議
    python 05_scripts/_fix_titles.py --apply
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

A_HEADINGS = ("條文全文",)
C_HEADINGS = ("函釋全文", "標準全文")
D_HEADINGS = ("問題", "回答")
B_HEADINGS = ("標準全文", "條文全文")

DELETED_MARKERS = ("（刪除）", "(刪除)", "（刪除)", "(刪除）")

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


def extract_first_section(body: str, headings: tuple[str, ...]) -> str:
    for h in headings:
        s = extract_section(body, h)
        if s:
            return s
    return ""


def needs_fix(title: str) -> tuple[bool, str]:
    if not title:
        return True, "空白"
    t = title.strip()
    if any(t == m for m in DELETED_MARKERS):
        return False, ""
    if "TODO" in t:
        return True, "含 TODO"
    # 結尾語意未完
    if re.search(r"[，,（(:：、]$", t):
        return True, "結尾不完整(標點)"
    # 括號未配對
    op = t.count("(") + t.count("（")
    cl = t.count(")") + t.count("）")
    if op != cl:
        return True, "括號未配對"
    # 結尾省略號
    if re.search(r"[\.……]+$", t):
        return True, "結尾為省略號"
    # 結尾常見截斷字(只在較短時觸發)
    if re.search(r"[以之及等為按依與或暨僅未且自若有作其]$", t) and len(t) <= 22:
        return True, "結尾為截斷常見字"
    # 過短
    if len(t) < 6 and not re.match(r"^Q\d+", t):
        return True, "過短"
    return False, ""


# 提綱抽取
PREFIX_STRIP_PATTERNS = [
    r"^[目次]\s*$",
    r"^[壹貳參肆伍陸柒捌玖拾]+\s*[、,].*?(?=\S)",
    r"^◎\s*",
    r"^[（(][一二三四五六七八九十百]+[）)]\s*",
    r"^[（(]\d+[）)]\s*",
    r"^[一二三四五六七八九十]+\s*[、,]\s*",
    r"^\d+\s*[、,\.]\s*",
    r"^主旨[::]\s*",
    r"^說明[::]\s*",
    r"^第\s*[一二三四五六七八九十百零〇○\d]+\s*[條點項款]\s*",
]


def clean_first_clause(text: str, max_len: int) -> str:
    """從 H2 區塊文字抽提綱。"""
    text = text.strip()
    # 多次剝前綴(可能巢狀)
    for _ in range(3):
        before = text
        for pat in PREFIX_STRIP_PATTERNS:
            text = re.sub(pat, "", text, count=1).strip()
        if text == before:
            break
    # 壓縮空白
    flat = re.sub(r"\s+", "", text)
    if not flat:
        return ""
    # 在合理位置斷句
    best_cut = 0
    for ch in "。；;":
        idx = flat.find(ch)
        if 0 < idx <= max_len:
            if idx > best_cut:
                best_cut = idx
    if not best_cut:
        for ch in ",,":
            idx = flat.find(ch)
            if 6 <= idx <= max_len:
                if idx > best_cut:
                    best_cut = idx
    if best_cut:
        result = flat[:best_cut]
    elif len(flat) > max_len:
        result = flat[:max_len]
    else:
        result = flat
    return result.strip()


def gen_new_title(fm: dict, body: str) -> tuple[str | None, str]:
    """產生新 title。回傳 (新 title, 來源說明)。新 title 為 None 表示無法產生。"""
    node_id = str(fm.get("id", ""))
    m = re.match(r"^([ABCD])-([^-]+)-(\d{3})$", node_id)
    if not m:
        return None, "ID 格式不符"
    cat, _parent, serial_str = m.group(1), m.group(2), m.group(3)
    serial = int(serial_str)

    if cat == "A":
        section = extract_first_section(body, A_HEADINGS)
        if not section:
            return None, "找不到 條文全文"
        kernel = clean_first_clause(section, max_len=15)
        if not kernel:
            return None, "提綱抽取為空"
        return f"第{num_to_cn(serial)}條 {kernel}", "A:條文全文"

    if cat == "B":
        section = extract_first_section(body, B_HEADINGS)
        if not section:
            return None, "找不到 標準全文"
        kernel = clean_first_clause(section, max_len=22)
        if not kernel:
            return None, "提綱抽取為空"
        return kernel, "B:標準全文"

    if cat == "C":
        section = extract_first_section(body, C_HEADINGS)
        if not section:
            return None, "找不到 函釋/標準全文"
        kernel = clean_first_clause(section, max_len=22)
        if not kernel:
            return None, "提綱抽取為空"
        return kernel, "C:函釋全文"

    if cat == "D":
        section = extract_first_section(body, D_HEADINGS)
        if not section:
            return None, "找不到 問題/回答"
        kernel = clean_first_clause(section, max_len=22)
        if not kernel:
            return None, "提綱抽取為空"
        return f"Q{serial} {kernel}", "D:問題"

    return None, "未知類別"


def process(path: Path, apply: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    out: dict = {
        "path": path.relative_to(ROOT).as_posix(),
        "id": fm.get("id") if fm else None,
        "old": fm.get("title") if fm else None,
        "new": None,
        "reason": "",
        "source": "",
        "action": "skip",
    }
    if fm is None:
        out["action"] = "error"
        out["reason"] = "front-matter 解析失敗"
        return out

    old_title = str(fm.get("title", ""))
    need, reason = needs_fix(old_title)
    if not need:
        return out

    out["reason"] = reason
    new_title, src = gen_new_title(fm, body)
    out["source"] = src
    if not new_title:
        out["action"] = "skip"
        out["reason"] = f"{reason} → 無法生成({src})"
        return out

    if new_title == old_title:
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
    ap.add_argument("--apply", action="store_true", help="實際寫入(預設 dry-run)")
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
    skipped_unfixable: list[dict] = []
    errors = 0

    for f in files:
        r = process(f, apply=args.apply)
        if r["action"] == "error":
            errors += 1
            print(f"  [!!] {r['path']}: {r['reason']}")
        elif r["action"] == "fix":
            fixed.append(r)
            tag = "[改名]" if args.apply else "[擬改名]"
            print(f"  {tag} {r['id']}")
            print(f"        舊: {r['old']!r}")
            print(f"        新: {r['new']!r}  ({r['reason']} via {r['source']})")
        elif r["reason"] and "無法生成" in r["reason"]:
            skipped_unfixable.append(r)
            if args.verbose:
                print(f"  [跳過] {r['id']}: {r['reason']}")

    print("─" * 100)
    print(f"已改名:{len(fixed)} 份")
    print(f"判定需改但無法生成:{len(skipped_unfixable)} 份")
    print(f"錯誤:{errors}")
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 2 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
