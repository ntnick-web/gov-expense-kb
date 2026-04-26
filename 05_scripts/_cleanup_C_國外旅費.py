r"""清理 02_markdown/C_解釋函令/國內旅費/ 內 PDF 抽取殘渣與占位符。

任務(對應 task plan A2):
1. 偵測「TOC 殘渣」函釋(函釋全文只有目錄頁碼)→ 列出/刪除
2. 修整 title 尾巴的 `....` / `…`
3. 重點摘要尾巴 `_(自動初校,待人工潤飾)_` → 移除
4. 重點摘要本身仍是 placeholder 的 → 改成「(摘要待補)」
5. 函釋全文尾段的 TOC 殘渣行(`\.{3,}\s*\d+`、孤立「目 / 次 / I」、單獨章節編號)→ 截掉
6. 相關規定區塊 `(待人工補)` → 改成「— 暫無已標記之相關條文」

模式:
- `--dry-run` (預設):列印每份檔的判斷與將執行動作,不寫入
- `--apply`:實際寫入
- `--delete-toc`:同時實際刪除被判定為 TOC 殘渣的 .md 檔(否則 dry-run 只列出)

執行範例:
    python 05_scripts/_cleanup_C_國內旅費.py
    python 05_scripts/_cleanup_C_國內旅費.py --apply --delete-toc
"""

from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

import yaml

# Windows console 預設 cp950 無法輸出 unicode 標記,強制 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = ROOT / "02_markdown" / "C_解釋函令" / "國外旅費"

DOT_LEADER_RE = re.compile(r"\.{3,}|…{2,}|…{2,}")
DOT_LEADER_PAGE_RE = re.compile(r"[\.……]{3,}\s*\d+\s*$")
ISOLATED_TOC_LINE_RE = re.compile(
    r"^\s*("
    r"[壹貳參肆伍陸柒捌玖拾]+\s*[、,].*"      # 壹、xxx
    r"|◎\s*[一二三四五六七八九十]+\s*[、,].*"  # ◎二、xxx
    r"|目\s*$|次\s*$|目\s*次\s*$"
    r"|[IⅠ]\s*$"
    r"|附\s*[一二三四五六七八九十]\s*$"
    r")\s*$"
)
PLACEHOLDER_RELATED = "(待人工補)"
AUTO_NOTICE_RE = re.compile(r"\n*_+\(自動初校[,，]待人工潤飾\)_+\s*$", re.M)
SUMMARY_PLACEHOLDERS = ("(摘要待補)", "(待人工補)", "TODO")


# ─────────────────────────────────────────────
# Front-matter / body 處理
# ─────────────────────────────────────────────


def split_front_matter(text: str):
    if not text.startswith("---"):
        return None, text, None
    end = text.find("\n---", 3)
    if end < 0:
        return None, text, None
    raw = text[3:end]
    try:
        fm = yaml.safe_load(raw)
    except yaml.YAMLError:
        return None, text, None
    if not isinstance(fm, dict):
        return None, text, None
    body = text[end + 4:].lstrip("\n")
    return fm, body, raw


def render_front_matter(fm: dict) -> str:
    return yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()


def extract_section(body: str, heading: str) -> tuple[int, int, str]:
    """回傳 (section start idx, end idx, content)。找不到回 (-1, -1, '')。"""
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    if not m:
        return -1, -1, ""
    return m.start(1), m.end(1), m.group(1)


def replace_section(body: str, heading: str, new_content: str) -> str:
    s, e, _ = extract_section(body, heading)
    if s < 0:
        return body
    if not new_content.endswith("\n"):
        new_content = new_content + "\n"
    return body[:s] + new_content + body[e:]


# ─────────────────────────────────────────────
# 偵測:是否為 TOC 殘渣?
# ─────────────────────────────────────────────


def is_toc_residue(text_section: str) -> tuple[bool, str]:
    """判定函釋全文是否為純 TOC 殘渣。

    回傳 (是否殘渣, 原因說明)。
    判準:
      - 移除頁碼引導行(.+\.{3,}\s*\d+$)與孤立 TOC 行後,剩下實質內容 <30 字 → 殘渣
      - 或所有非空白行都符合 TOC pattern → 殘渣
    """
    lines = [ln.rstrip() for ln in text_section.splitlines()]
    nonempty = [ln for ln in lines if ln.strip()]
    if not nonempty:
        return True, "整個區塊空白"

    toc_lines = []
    real_lines = []
    for ln in nonempty:
        s = ln.strip()
        if DOT_LEADER_PAGE_RE.search(s):
            toc_lines.append(ln)
            continue
        if ISOLATED_TOC_LINE_RE.match(s):
            toc_lines.append(ln)
            continue
        if DOT_LEADER_RE.search(s) and re.search(r"\d", s):
            toc_lines.append(ln)
            continue
        real_lines.append(ln)

    real_text = "".join(re.sub(r"\s+", "", l) for l in real_lines)
    if len(real_text) < 30 and len(toc_lines) >= 1:
        return True, f"扣除 {len(toc_lines)} 行 TOC 後實質內容僅 {len(real_text)} 字"
    if len(toc_lines) >= len(nonempty):
        return True, "全部行皆為 TOC pattern"
    return False, ""


def trim_toc_tail(text_section: str) -> str:
    """從尾端往前剝掉 TOC pattern 行,直到遇到實質內容。"""
    lines = text_section.splitlines()
    while lines:
        s = lines[-1].strip()
        if not s:
            lines.pop()
            continue
        if DOT_LEADER_PAGE_RE.search(s) or ISOLATED_TOC_LINE_RE.match(s):
            lines.pop()
            continue
        if DOT_LEADER_RE.search(s) and re.search(r"\d", s):
            lines.pop()
            continue
        break
    out = "\n".join(lines).rstrip()
    return out + "\n" if out else ""


def trim_title(title: str) -> str:
    """去掉 title 尾端的 dots/ellipsis/whitespace。"""
    return re.sub(r"[\s\.……]+$", "", title).strip()


def clean_summary(section_text: str) -> tuple[str | None, bool]:
    """清整重點摘要區塊。回傳 (新內容 or None 表示無變更, 是否仍為 placeholder)。"""
    text_no_notice = AUTO_NOTICE_RE.sub("", section_text).rstrip()
    flat = re.sub(r"\s+", "", text_no_notice)
    # 摘要本身就是 TOC 殘渣或極短
    if not flat or len(flat) < 15 or DOT_LEADER_RE.search(flat):
        return "(摘要待補)\n\n", True
    if any(p in flat for p in SUMMARY_PLACEHOLDERS):
        return "(摘要待補)\n\n", True
    # 只有當原本含「自動初校」尾巴時才算變更
    if AUTO_NOTICE_RE.search(section_text):
        return text_no_notice + "\n\n", False
    return None, False


def clean_related(section_text: str) -> str | None:
    if PLACEHOLDER_RELATED in section_text:
        return "— 暫無已標記之相關條文\n\n"
    return None


# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────


def process_file(path: Path, apply: bool, delete_toc: bool = False) -> dict:
    """處理單一 .md。回傳變更摘要 dict。"""
    raw_text = path.read_text(encoding="utf-8")
    fm, body, _ = split_front_matter(raw_text)
    result = {
        "path": path.relative_to(ROOT).as_posix(),
        "actions": [],
        "is_toc": False,
        "toc_reason": "",
        "title_before": fm.get("title") if fm else None,
        "title_after": None,
        "summary_pending": False,
    }
    if fm is None:
        result["actions"].append("ERROR: 無法解析 front-matter")
        return result

    # 1. 函釋全文 → 是否殘渣
    s, e, full_section = extract_section(body, "函釋全文")
    if s >= 0:
        is_residue, reason = is_toc_residue(full_section)
        result["is_toc"] = is_residue
        result["toc_reason"] = reason
        if is_residue:
            result["actions"].append(f"DELETE: {reason}")
            if apply and delete_toc:
                path.unlink()
            return result
        # 非殘渣:嘗試剝掉尾端 TOC 行(僅在實質內容變動才寫)
        trimmed = trim_toc_tail(full_section)
        if trimmed.rstrip() != full_section.rstrip():
            # 後面接 \n\n 維持 H2 區塊間距
            body = body[:s] + trimmed.rstrip() + "\n\n" + body[e:]
            result["actions"].append("trim TOC tail in 函釋全文")

    # 2. title trim
    new_title = trim_title(str(fm.get("title", "")))
    if new_title != fm.get("title"):
        result["actions"].append(f"trim title")
        result["title_after"] = new_title
        fm["title"] = new_title

    # 3. 重點摘要
    s, e, sum_section = extract_section(body, "重點摘要")
    if s >= 0:
        new_sum, pending = clean_summary(sum_section)
        if new_sum is not None:
            body = body[:s] + new_sum + body[e:]
            result["actions"].append("clean 重點摘要" + (" (placeholder)" if pending else ""))
        if pending:
            fm["summary_pending"] = True
            result["summary_pending"] = True

    # 4. 相關規定
    s, e, rel_section = extract_section(body, "相關規定")
    if s >= 0:
        new_rel = clean_related(rel_section)
        if new_rel is not None:
            body = body[:s] + new_rel + body[e:]
            result["actions"].append("clean 相關規定")

    if not result["actions"]:
        return result

    if apply:
        out = "---\n" + render_front_matter(fm) + "\n---\n\n" + body.lstrip("\n")
        # 確保結尾恰一個換行
        out = out.rstrip() + "\n"
        path.write_text(out, encoding="utf-8")

    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="實際寫入(預設 dry-run)")
    ap.add_argument("--delete-toc", action="store_true",
                    help="實際刪除判定為 TOC 殘渣的 .md(僅在 --apply 同時生效)")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    if not TARGET_DIR.exists():
        print(f"目標資料夾不存在:{TARGET_DIR}", file=sys.stderr)
        return 1

    apply = bool(args.apply)
    delete_toc = bool(args.delete_toc and apply)

    files = sorted(TARGET_DIR.glob("*.md"))
    if not files:
        print(f"無 .md 檔:{TARGET_DIR}")
        return 0

    print(f"目標:{TARGET_DIR.relative_to(ROOT)}({len(files)} 份)")
    print(f"模式:{'APPLY' if apply else 'DRY-RUN'}"
          + (" (含刪除 TOC 檔)" if delete_toc else ""))
    print("─" * 60)

    toc_files: list[dict] = []
    cleaned_files: list[dict] = []
    untouched = 0
    errors = 0

    for f in files:
        result = process_file(f, apply=apply, delete_toc=delete_toc)
        if any(a.startswith("ERROR") for a in result["actions"]):
            errors += 1
            print(f"  [!!] {result['path']}: {result['actions']}")
            continue
        if result["is_toc"]:
            toc_files.append(result)
            tag = "[DEL]" if (apply and delete_toc) else "[TOC]"
            print(f"  {tag} {result['path']} ({result['toc_reason']})")
        elif result["actions"]:
            cleaned_files.append(result)
            if args.verbose:
                print(f"  [ok] {result['path']}: {', '.join(result['actions'])}")
        else:
            untouched += 1

    print("─" * 60)
    print(f"摘要:")
    print(f"  TOC 殘渣 = {len(toc_files)}{' (已刪除)' if (apply and delete_toc) else ' (未刪除)'}")
    print(f"  已清整    = {len(cleaned_files)}")
    print(f"  未動      = {untouched}")
    if errors:
        print(f"  錯誤      = {errors}")

    if not apply:
        print("\n[DRY-RUN] 加 --apply 實際寫入,加 --delete-toc 同時刪除 TOC 檔")
    return 2 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
