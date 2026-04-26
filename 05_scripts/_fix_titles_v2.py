"""_fix_titles_v2.py — 處理「法源前言式」title,改為語意化標題。

問題:`_fix_titles.py` 從 H2 區塊抽首句作 title,但對立法目的、彙編體例
這類前言式內容,首句永遠是「為規範○○○...特訂定本要點」,讀起來像
卡片在自我介紹整本要點,而非該卡的核心重點。

本腳本針對此類 title 用語意模板重生:

| 偵測 pattern              | 新 title                  |
|--------------------------|---------------------------|
| 為規範...特訂定本要點      | 立法目的:{母題}報支要點    |
| 本要點所稱{X}              | 用語定義:{X}               |
| 本要點修正(生效|後)        | 修正生效及銜接規定         |
| 本要點適用範圍             | 適用範圍說明               |
| 本要點有關應簽名           | 應簽名/蓋章規範            |
| 本彙編制定/編訂目的        | 彙編制定目的               |
| 本彙編須配合法規...更新    | 彙編更新原則               |
| 本彙編適用於...            | 彙編適用範圍               |
| 本彙編係按...報支要點      | 彙編體例說明               |
| 本彙編所列法規左端有「◎」  | 體例符號說明               |
| 本彙編內容所列行政院人事    | 彙編沿革說明               |

且若該檔有「◎N、xxx」「N、xxx」等後續實質段落,會把後續段落首題附加在後。

用法
----
    python 05_scripts/_fix_titles_v2.py            # dry-run
    python 05_scripts/_fix_titles_v2.py --apply
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

H2_HEADINGS = ("條文全文", "函釋全文", "標準全文")


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


def get_main_section(body: str) -> str:
    for h in H2_HEADINGS:
        s = extract_section(body, h)
        if s:
            return s
    return ""


# ─────────────────────────────────────────────
# 語意模板:依序匹配,第一個命中即用
# (regex pattern, new_title 或 callable(match, parent) → str)
# ─────────────────────────────────────────────
TEMPLATES: list[tuple[str, object]] = [
    # 立法目的(條文式)
    (r"為規範.{0,80}?特訂定本要點", lambda m, p: f"立法目的:{p}報支要點"),
    (r"為規範.{0,80}?特訂定本辦法", lambda m, p: f"立法目的:{p}辦法"),
    # 用語定義(末尾去掉頁碼數字殘渣)
    (r"本要點所稱(\S{2,8}?)[,，::]",
     lambda m, p: f"用語定義:{re.sub(r'\d+$', '', m.group(1))}"),
    (r"本要點所稱(\S{2,8})",
     lambda m, p: f"用語定義:{re.sub(r'\d+$', '', m.group(1))}"),
    # 修正生效
    (r"本要點修正(?:生效後|後).*?新舊", lambda m, p: "修正後新舊規定銜接"),
    (r"本要點修正(?:生效後|後)", lambda m, p: "修正生效規定"),
    # 適用範圍
    (r"本要點適用範圍", lambda m, p: "適用範圍說明"),
    # 應簽名
    (r"本要點有關應簽名", lambda m, p: "應簽名/蓋章相關規定"),
    # 彙編相關(目的 / 目 都允許)
    (r"本彙編(?:制定|編訂)(?:之)?目的?", lambda m, p: "彙編制定目的"),
    (r"本彙編須配合法規或制度.{0,20}?更新", lambda m, p: "彙編更新原則"),
    (r"本彙編適用於", lambda m, p: "彙編適用範圍"),
    (r"本彙編係按.{0,15}?報支要點", lambda m, p: "彙編體例說明"),
    (r"本彙編所列(?:法規|案例).{0,5}?左端有.{0,5}?◎", lambda m, p: "體例符號(◎)說明"),
    (r"本彙編內容所列行政院人事行政", lambda m, p: "彙編內容沿革說明"),
    (r"本表修正生效後", lambda m, p: "標準表修正生效規定"),
]


def apply_templates(body_text: str, parent: str) -> str | None:
    """對首段嘗試套用模板。回傳新 title or None。"""
    flat = re.sub(r"\s+", "", body_text)
    if not flat:
        return None
    head = flat[:120]
    for pat, repl in TEMPLATES:
        m = re.search(pat, head)
        if m:
            if callable(repl):
                return repl(m, parent)
            return str(repl)
    return None


# ─────────────────────────────────────────────
# 偵測:title 是否為前言式(需要重生)
# ─────────────────────────────────────────────

def is_preamble_title(title: str) -> bool:
    if not title:
        return False
    t = title.strip()
    indicators = (
        "為規範", "為使", "為健全", "為配合",
        "本要點所稱", "本要點修正", "本要點適用",
        "本要點有關應簽名",
        "本彙編", "本表修正",
    )
    return any(t.startswith(ind) for ind in indicators)


def process(path: Path, apply: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    out = {
        "id": fm.get("id") if fm else None,
        "old": fm.get("title") if fm else None,
        "new": None,
        "action": "skip",
    }
    if fm is None:
        out["action"] = "error"
        return out

    title = str(fm.get("title", ""))
    if not is_preamble_title(title):
        return out

    parent = str(fm.get("parent", ""))
    section = get_main_section(body)
    new_title = apply_templates(section or title, parent)
    if not new_title or new_title == title:
        out["action"] = "skip"
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
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 90)

    fixed = 0
    unmatched: list[dict] = []
    errors = 0
    for f in files:
        r = process(f, apply=args.apply)
        if r["action"] == "error":
            errors += 1
            print(f"  [!!] {f.relative_to(ROOT).as_posix()}")
        elif r["action"] == "fix":
            fixed += 1
            tag = "[改名]" if args.apply else "[擬改名]"
            print(f"  {tag} {r['id']}")
            print(f"        舊: {r['old']!r}")
            print(f"        新: {r['new']!r}")
        elif r["old"] and is_preamble_title(str(r["old"])):
            unmatched.append(r)

    if unmatched:
        print("─" * 90)
        print(f"前言式但無模板命中({len(unmatched)} 筆,需擴充模板表):")
        for r in unmatched[:15]:
            print(f"  {r['id']}: {r['old']!r}")

    print("─" * 90)
    print(f"已改名:{fixed} 份")
    print(f"前言式無模板:{len(unmatched)} 份")
    print(f"錯誤:{errors}")
    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 2 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
