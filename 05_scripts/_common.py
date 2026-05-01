"""共用工具模組 — 從 13+ 個 _*.py 抽出的高重複 helper。

設計原則:
- 只放「至少 3 個腳本同時用」的工具(門檻已過才抽)
- 純函式優先,無副作用
- 不依賴其他 _*.py(避免循環)

匯入方式(任一腳本):
    from _common import split_fm, render_fm, extract_section, walk_md, ROOT
"""
from __future__ import annotations
import re
import yaml
from pathlib import Path
from typing import Iterable, Optional

# ─────────────────────────────────────────────────────────────
# 路徑常數
# ─────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
MD_ROOT = ROOT / "02_markdown"
EXTRACTED_ROOT = ROOT / "01_extracted"
INDEX_ROOT = ROOT / "03_index"
SOURCE_ROOT = ROOT / "00_source"
WEB_ROOT = ROOT / "04_web"

# ─────────────────────────────────────────────────────────────
# Front-matter 解析 / 序列化
# ─────────────────────────────────────────────────────────────

def split_fm(text: str) -> tuple[Optional[dict], str]:
    """切出 front-matter dict 與 body。失敗回 (None, text)。"""
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
    """把 dict 序列化為不含 --- 包夾的 YAML 字串(allow_unicode + 不排序)。"""
    return yaml.safe_dump(
        fm, allow_unicode=True, sort_keys=False, default_flow_style=False
    ).strip()


def assemble_md(fm: dict, body: str) -> str:
    """把 fm + body 組回完整 MD 文字。"""
    return f"---\n{render_fm(fm)}\n---\n\n{body.lstrip()}"


# ─────────────────────────────────────────────────────────────
# 內文區塊抽取
# ─────────────────────────────────────────────────────────────

def extract_section(body: str, heading: str) -> str:
    """抽 ## {heading} 到下一個 ## 或檔尾的內容(不含標題本身),已 strip。"""
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    return m.group(1).strip() if m else ""


def first_section(body: str, headings: Iterable[str]) -> str:
    """依序試多個標題,回傳第一個有內容的 section。"""
    for h in headings:
        s = extract_section(body, h)
        if s:
            return s
    return ""


def split_paragraphs(text: str) -> list[str]:
    """把文字依空行切段,過濾空段。"""
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


# ─────────────────────────────────────────────────────────────
# MD 檔遍歷
# ─────────────────────────────────────────────────────────────

def walk_md(root: Path = MD_ROOT) -> Iterable[Path]:
    """遞迴吐出所有 .md 檔(已 sort,順序穩定)。"""
    return sorted(root.rglob("*.md"))


def read_md(path: Path) -> tuple[Optional[dict], str, str]:
    """讀檔 + split_fm,回 (fm, body, raw_text)。"""
    raw = path.read_text(encoding="utf-8")
    fm, body = split_fm(raw)
    return fm, body, raw


def write_md(path: Path, fm: dict, body: str) -> None:
    """重寫 MD 檔(fm + body)。"""
    path.write_text(assemble_md(fm, body), encoding="utf-8")


# ─────────────────────────────────────────────────────────────
# PII 偵測常用 regex(共用避免各腳本重新發明 + 出 bug)
# ─────────────────────────────────────────────────────────────

# 電話 — 必須有分隔符(括號或 dash),否則 10 位連續數字會誤抓公文字號(如 0940006759)
PHONE_RE = re.compile(r"\(?0\d{1,3}\)?[-\s]?\d{3,4}[-\s]?\d{3,4}")

# Email
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# 公文字號(用於識別 / 過濾,不刪)— 形如「主會字第1090051074B號」
DOC_NO_RE = re.compile(r"[一-鿿]+字第[\dA-Za-z]+號")

# PII 段落指示詞(子字串比對 — 全形 / 半形冒號都涵蓋)
PII_PARA_INDICATORS = (
    "機關地址", "機關地址:", "機關地址:",
    "聯絡人", "聯絡人:", "聯絡人:",
    "電子郵件", "電子郵件:", "電子郵件:",
    "受文者:", "受文者:",
    "速別:", "速別:",
    "密等及解密條件", "密等及解密條件:", "密等及解密條件:",
    "正本:", "正本:",
    "副本:", "副本:",
    "發文字號:", "發文字號:",
    "發文日期:", "發文日期:",
    "函機關:", "函機關:",
    "函機關地", "函機關地:", "函機關地:",
    "傳真:", "傳真:",
    "電話:", "電話:",
    "址:", "址:",  # 機關地址 PDF 斷行殘片
    "真:", "真:",  # 傳真 PDF 斷行殘片
)


def is_pii_paragraph(para: str) -> bool:
    """偵測是否為 PII 段落(機關地址 / 聯絡人 / email 等函稿表頭)。"""
    flat = re.sub(r"\s+", "", para)[:200]
    return any(ind in flat for ind in PII_PARA_INDICATORS)


# ─────────────────────────────────────────────────────────────
# 簡易 dry-run / apply 樣板
# ─────────────────────────────────────────────────────────────

def parse_apply_flag(argv: list[str]) -> bool:
    """檢查命令列是否含 --apply,回 True 表寫入。預設 dry-run。"""
    return "--apply" in argv


def log_change(rel_path: Path | str, before: str, after: str, max_len: int = 80) -> None:
    """印出單行 before→after 對照(供 dry-run 預覽)。"""
    b = (before or "").replace("\n", "\\n")[:max_len]
    a = (after or "").replace("\n", "\\n")[:max_len]
    print(f"  {rel_path}")
    print(f"    -: {b}")
    print(f"    +: {a}")
