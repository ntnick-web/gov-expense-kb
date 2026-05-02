"""02_parse.py — 把 01_extracted/*.txt 結構化為 02_markdown/*.md。

職責
----
讀 ``01_extracted/{類別}/{母題}/{slug}.txt`` 與同名 ``.meta.json``,
產出帶 YAML front-matter 的 ``02_markdown/{類別}/{母題}/{slug}.md`` 草稿。

- A 類條文:## 條文全文(逐字保留)
- D 類 Q&A:## 問題 / ## 回答
- C 類函釋:## 函釋全文(本批無樣本,骨架)
- B 類標準:## 標準全文(本批無樣本,骨架)

不做的事
--------
- 重點摘要、相關規定、備註 由人工校對時補(留 placeholder)
- ``reviewed:`` 由人工校對時加入(腳本不寫入)
- ``_unsorted/`` 之檔案略過(印警告引導使用者補 manifest 或手動拆 source)

使用範例
--------
    python 05_scripts/02_parse.py --dry-run -v
    python 05_scripts/02_parse.py --category A
    python 05_scripts/02_parse.py --file *Q001*

退出代碼
--------
0  全部成功
1  啟動環境錯誤
2  有檔案失敗或序號衝突
3  --strict 且有警告
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from fnmatch import fnmatch
from pathlib import Path
from typing import Literal, Optional

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.stderr.write("缺少 PyYAML,請執行 pip install PyYAML\n")
    sys.exit(1)


# ─────────────────────────────────────────────
# 路徑與常數
# ─────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
EXTRACT_DIR = ROOT / "01_extracted"
MARKDOWN_DIR = ROOT / "02_markdown"
MANIFEST_PATH = ROOT / "00_source" / "_manifest.csv"

CATEGORY_DIR_NAMES: dict[str, str] = {
    "A": "A_核心法規",
    "B": "B_支出標準",
    "C": "C_解釋函令",
    "D": "D_問答集",
    "E": "E_附屬資料",
}
TYPE_BY_CATEGORY: dict[str, str] = {
    "A": "核心法規",
    "B": "支出標準",
    "C": "解釋函令",
    "D": "問答集",
    "E": "附屬資料",
}

UNSORTED = "_unsorted"
TAG_LIMIT = 8
PLACEHOLDER = "(待人工補)"
TODO_MARK = "TODO"

# 過濾掉的太通用標籤(與 parent / type / 文件類型常重疊)
GENERIC_TAGS: set[str] = {
    "要點", "問答集", "QA", "Q&A", "問答集_QA",
    "函釋", "解釋令", "解釋函", "釋示",
    "核心法規", "支出標準", "解釋函令",
}

# 母題對應的常見冗餘前綴(從標題短描述開頭剝除)
COMMON_PREFIXES_BY_PARENT: dict[str, list[str]] = {
    "國內旅費": ["國內出差", "國內"],
    "國外旅費": ["國外出差", "派赴國外", "派赴大陸", "國外"],
}

CN_DIGITS: dict[str, int] = {
    "零": 0, "〇": 0, "○": 0,
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}

PUNCT_BREAK = "，、。?？!!:;;\n"
SENTENCE_END = set("。!?!?;;…」』")


# ─────────────────────────────────────────────
# 結果結構
# ─────────────────────────────────────────────

ParseMethod = Literal[
    "written", "skipped_uptodate", "skipped_reviewed", "dry-run", "failed"
]


@dataclass
class ParseResult:
    input_txt: str
    output_md: Optional[str] = None
    id: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    parent: Optional[str] = None
    method: ParseMethod = "failed"
    warnings: list[str] = field(default_factory=list)
    error: Optional[str] = None
    parsed_at: str = ""

    @property
    def ok(self) -> bool:
        return self.error is None and self.method != "failed"


@dataclass
class Pair:
    txt: Path
    meta_path: Path
    meta: dict

    @property
    def category(self) -> Optional[str]:
        return self.meta.get("category")

    @property
    def parent(self) -> Optional[str]:
        return self.meta.get("parent")


@dataclass
class ParsedContent:
    title_short: Optional[str]
    title_display: str
    blocks: list[tuple[str, str]]
    short_warnings: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────
# 中文數字 → 阿拉伯
# ─────────────────────────────────────────────


def cn2int(s: str) -> Optional[int]:
    """把中文數字字串轉阿拉伯整數,涵蓋 0-99。

    範例:
        cn2int("五") → 5
        cn2int("十") → 10
        cn2int("十一") → 11
        cn2int("十六") → 16
        cn2int("二十") → 20
        cn2int("二十三") → 23
        cn2int("第五條") → 5(剝掉「第」「條」)
        cn2int("第五點") → 5
        cn2int("Q1") → None(非中文數字)
        cn2int("123") → 123(純阿拉伯也支援)
    """
    if not s:
        return None
    raw = s.strip()
    raw = re.sub(r"^第", "", raw)
    raw = re.sub(r"[條點章節款項則]$", "", raw)
    raw = raw.strip()
    if not raw:
        return None
    if raw.isdigit():
        return int(raw)
    chars = list(raw)
    if not all(c in CN_DIGITS for c in chars):
        return None
    if len(chars) == 1:
        return CN_DIGITS[chars[0]]
    if "十" not in chars:
        return None
    idx = chars.index("十")
    if idx == 0:
        tens = 1
        ones = CN_DIGITS[chars[1]] if len(chars) > 1 else 0
    elif idx == len(chars) - 1:
        tens = CN_DIGITS[chars[0]]
        ones = 0
    else:
        tens = CN_DIGITS[chars[0]]
        ones = CN_DIGITS[chars[idx + 1]]
    return tens * 10 + ones


# ─────────────────────────────────────────────
# 文字清理
# ─────────────────────────────────────────────


def _is_cjk(ch: str) -> bool:
    if not ch:
        return False
    cp = ord(ch)
    return 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or 0xF900 <= cp <= 0xFAFF


def reflow_text(text: str) -> str:
    """把 PDF 風格硬換行併接(中文非句末標點 + 中文起始)。"""
    out: list[str] = []
    for ln in text.splitlines():
        if not out or not ln.strip() or not out[-1].strip():
            out.append(ln)
            continue
        prev = out[-1]
        last_char = prev.rstrip()[-1] if prev.rstrip() else ""
        first_char = ln.lstrip()[0] if ln.lstrip() else ""
        if (
            _is_cjk(last_char)
            and last_char not in SENTENCE_END
            and _is_cjk(first_char)
        ):
            out[-1] = prev.rstrip() + ln.lstrip()
        else:
            out.append(ln)
    return "\n".join(out)


def clean_body(text: str) -> str:
    """二次清理:reflow + 壓縮連續空行為單一空行。"""
    text = reflow_text(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


# ─────────────────────────────────────────────
# 標題抽取
# ─────────────────────────────────────────────


def extract_short_title(
    text: str,
    *,
    parent: Optional[str] = None,
    max_len: int = 12,
) -> tuple[Optional[str], list[str]]:
    """從文本首句抽 4-12 字短描述。

    步驟:
        1. 剝除 A 類首行 N、 標記
        2. 剝除 D 類 Q/A: 前綴
        3. 依 parent 剝除冗餘前綴(如「國內出差」)
        4. 取首段(到第一個句末標點為止)
        5. 移除虛字 之/的
        6. 過短(<4)→ None;過長(>max_len)→ 截斷並警告

    回傳 (title, warnings)。
    """
    if not text:
        return None, ["empty"]
    s = text.strip()
    s = re.sub(r"^[一二三四五六七八九十百零〇○]+、\s*", "", s)
    s = re.sub(r"^[QA]\d*\s*[:：]\s*", "", s, flags=re.IGNORECASE)
    if parent and parent in COMMON_PREFIXES_BY_PARENT:
        for pfx in COMMON_PREFIXES_BY_PARENT[parent]:
            if s.startswith(pfx):
                s = s[len(pfx):].lstrip("、,, ")
                break

    m = re.match(rf"^([^{re.escape(PUNCT_BREAK)}]+)", s)
    if not m:
        return None, ["no_first_phrase"]
    phrase = m.group(1).strip()
    phrase = re.sub(r"[之的]", "", phrase)
    if len(phrase) < 4:
        return None, ["too_short"]
    warnings: list[str] = []
    if len(phrase) > max_len:
        phrase = phrase[:max_len]
        warnings.append("title_truncated")
    return phrase, warnings


def extract_clause_number_from_text(text: str) -> Optional[int]:
    """從正文首行 「N、」 抽中文數字。"""
    m = re.match(r"^\s*([一二三四五六七八九十百零〇○]+)、", text)
    return cn2int(m.group(1)) if m else None


# ─────────────────────────────────────────────
# Q&A 切分
# ─────────────────────────────────────────────


def split_qa(text: str) -> tuple[str, Optional[str], list[str]]:
    """把 Q…A… 文本切成 (question, answer, warnings)。切失敗時 answer = None。"""
    m = re.search(r"(?m)^A\d+\s*[:：]", text)
    if not m:
        return text.strip(), None, ["qa_split_failed"]
    q_part = text[: m.start()].strip()
    a_part = text[m.start():].strip()
    q_part = re.sub(r"^Q\d+\s*[:：]\s*", "", q_part, flags=re.IGNORECASE).strip()
    a_part = re.sub(r"^A\d+\s*[:：]\s*", "", a_part, flags=re.IGNORECASE).strip()
    return q_part, a_part, []


# ─────────────────────────────────────────────
# Tags / source / agency / version
# ─────────────────────────────────────────────


def derive_tags(
    source_metadata: dict, parent: str, type_str: str
) -> tuple[list[str], list[str]]:
    raw = source_metadata.get("標籤", "")
    if not raw:
        return [parent], ["tags_missing"]
    items = [t.strip() for t in raw.split(",") if t.strip()]
    drop = {parent, type_str} | GENERIC_TAGS
    out: list[str] = []
    for t in items:
        if t in drop or t in out:
            continue
        out.append(t)
    warnings: list[str] = []
    if len(out) > TAG_LIMIT:
        warnings.append(f"tags_excess({len(out)}→{TAG_LIMIT})")
        out = out[:TAG_LIMIT]
    if not out:
        out = [parent]
        warnings.append("tags_empty_after_filter")
    return out, warnings


def derive_source_field(source_metadata: dict, fallback: str) -> str:
    raw = source_metadata.get("來源法規", "").strip()
    if raw:
        return re.sub(r"[｜|]", "_", raw)
    return fallback


def derive_agency(
    source_metadata: dict, manifest_row: Optional[dict]
) -> Optional[str]:
    if manifest_row and manifest_row.get("agency"):
        return manifest_row["agency"]
    raw = source_metadata.get("來源法規", "")
    parts = re.split(r"[｜|]", raw, maxsplit=1)
    if parts and parts[0].strip():
        return parts[0].strip()
    return None


def derive_version(manifest_row: Optional[dict]) -> tuple[str, list[str]]:
    if manifest_row and manifest_row.get("version"):
        return manifest_row["version"], []
    return TODO_MARK, ["version_missing"]


# ─────────────────────────────────────────────
# Manifest
# ─────────────────────────────────────────────


def load_manifest(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [
            {k: (v or "").strip() for k, v in row.items()}
            for row in csv.DictReader(f)
        ]


def find_manifest_row(
    manifest: list[dict], category: str, parent: str, source_metadata: dict
) -> Optional[dict]:
    """以 (category, parent) 篩,多候選時用名稱關鍵字消歧。"""
    candidates = [
        r for r in manifest
        if r.get("category") == category and r.get("parent") == parent
    ]
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    src_blob = source_metadata.get("來源法規", "")
    for r in candidates:
        stem = Path(r.get("filename", "")).stem
        keyword = stem.split("_", 1)[-1]
        if keyword and (keyword in src_blob or src_blob in keyword):
            return r
    return candidates[0]


# ─────────────────────────────────────────────
# 序號分配(全批計算)
# ─────────────────────────────────────────────


def assign_serials(
    pairs: list[Pair], log: logging.Logger
) -> tuple[dict[Path, str], list[ParseResult]]:
    """全批計算 ID。回傳 (mapping, errors)。

    A:cn2int(meta.條次)
    D:Q\\d+ 抽數字
    C/B:依 manifest 順序 → fallback mtime
    """
    id_map: dict[Path, str] = {}
    errors: list[ParseResult] = []
    by_group: dict[tuple[str, str], list[Pair]] = {}
    for p in pairs:
        if not p.category or not p.parent:
            continue
        by_group.setdefault((p.category, p.parent), []).append(p)

    for (cat, parent), group in by_group.items():
        used: dict[int, Path] = {}
        unassigned: list[Pair] = []
        for p in group:
            tiao = p.meta.get("source_metadata", {}).get("條次", "")
            n: Optional[int] = None
            if cat == "A":
                n = cn2int(tiao)
            elif cat == "D":
                m = re.match(r"Q(\d+)", tiao, flags=re.IGNORECASE)
                if m:
                    n = int(m.group(1))
            if n is None:
                unassigned.append(p)
                continue
            if n in used:
                errors.append(ParseResult(
                    input_txt=p.txt.relative_to(ROOT).as_posix(),
                    method="failed",
                    error=(
                        f"序號衝突:{cat}-{parent}-{n:03d} 同時來自 "
                        f"{used[n].name} 與 {p.txt.name}"
                    ),
                ))
                continue
            used[n] = p.txt
            id_map[p.txt] = f"{cat}-{parent}-{n:03d}"

        if unassigned:
            # 用字典序排序(較 mtime 穩定),確保 ID 跨次重建一致
            unassigned.sort(key=lambda p: p.txt.name)
            next_serial = 1
            for p in unassigned:
                while next_serial in used:
                    next_serial += 1
                used[next_serial] = p.txt
                id_map[p.txt] = f"{cat}-{parent}-{next_serial:03d}"
                log.warning(
                    f"{p.txt.name}: 條次無法解析,以 mtime 順序給序號 "
                    f"{next_serial:03d}"
                )
                next_serial += 1

    return id_map, errors


# ─────────────────────────────────────────────
# Discover
# ─────────────────────────────────────────────


def discover_pairs(
    file_filter: Optional[str],
    category_filter: Optional[str],
    parent_filter: Optional[str],
    log: logging.Logger,
) -> tuple[list[Pair], list[Pair], list[Path]]:
    """掃 01_extracted。回傳 (all_pairs, filtered, unsorted)。"""
    if not EXTRACT_DIR.exists():
        return [], [], []
    all_pairs: list[Pair] = []
    unsorted_paths: list[Path] = []
    for txt in sorted(EXTRACT_DIR.rglob("*.txt")):
        rel_parts = txt.relative_to(EXTRACT_DIR).parts
        if any(part == UNSORTED for part in rel_parts):
            unsorted_paths.append(txt)
            continue
        meta_path = txt.with_suffix(".meta.json")
        if not meta_path.exists():
            log.warning(f"{txt.name}: 缺 .meta.json,跳過")
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            log.error(f"{txt.name}: meta JSON 格式錯誤 {e}")
            continue
        if not meta.get("category") or not meta.get("parent"):
            log.warning(f"{txt.name}: meta 缺 category/parent,跳過")
            continue
        all_pairs.append(Pair(txt=txt, meta_path=meta_path, meta=meta))

    filtered: list[Pair] = []
    for p in all_pairs:
        if category_filter and p.category != category_filter:
            continue
        if parent_filter and p.parent != parent_filter:
            continue
        if file_filter and not (
            fnmatch(p.txt.name, file_filter)
            or fnmatch(p.txt.stem, file_filter)
        ):
            continue
        filtered.append(p)
    return all_pairs, filtered, unsorted_paths


# ─────────────────────────────────────────────
# 內容剖析(各 category)
# ─────────────────────────────────────────────


def parse_clause(body: str, source_metadata: dict, parent: str) -> ParsedContent:
    cn_clause = source_metadata.get("條次", "").strip() or "第?條"
    short, sw = extract_short_title(body, parent=parent)
    title = f"{cn_clause} {short}" if short else f"{cn_clause}_{TODO_MARK}"
    return ParsedContent(
        title_short=short,
        title_display=title,
        blocks=[("條文全文", body)],
        short_warnings=sw,
    )


def parse_qa(
    body: str, source_metadata: dict, parent: str
) -> tuple[ParsedContent, list[str]]:
    raw_q = source_metadata.get("條次", "").strip()
    m = re.match(r"Q(\d+)", raw_q, flags=re.IGNORECASE)
    q_num = m.group(1) if m else "?"
    q_part, a_part, qa_warnings = split_qa(body)
    short, sw = extract_short_title(q_part, parent=parent)
    title = f"Q{q_num} {short}" if short else f"Q{q_num}_{TODO_MARK}"
    if a_part is None:
        blocks = [("Q&A", body)]
    else:
        blocks = [("問題", q_part), ("回答", a_part)]
    return (
        ParsedContent(
            title_short=short,
            title_display=title,
            blocks=blocks,
            short_warnings=sw,
        ),
        qa_warnings,
    )


def parse_letter(body: str, source_metadata: dict, parent: str) -> ParsedContent:
    """C 類函釋(本批無樣本)。"""
    short, sw = extract_short_title(body, parent=parent)
    title = short or TODO_MARK
    return ParsedContent(
        title_short=short,
        title_display=title,
        blocks=[("函釋全文", body)],
        short_warnings=sw,
    )


def parse_standard(body: str, source_metadata: dict, parent: str) -> ParsedContent:
    """B 類支出標準(本批無樣本)。"""
    short, sw = extract_short_title(body, parent=parent)
    title = short or TODO_MARK
    return ParsedContent(
        title_short=short,
        title_display=title,
        blocks=[("標準全文", body)],
        short_warnings=sw,
    )


# ─────────────────────────────────────────────
# Front-matter / Markdown 組裝
# ─────────────────────────────────────────────


def build_front_matter(
    *,
    id_str: str,
    category: str,
    parent: str,
    title: str,
    tags: list[str],
    source: str,
    version: str,
    agency: Optional[str],
    doc_no: Optional[str],
) -> dict:
    fm: dict = {
        "id": id_str,
        "type": TYPE_BY_CATEGORY[category],
        "parent": parent,
        "title": title,
        "tags": tags,
        "related": [],
        "source": source,
        "version": version,
    }
    if agency:
        fm["agency"] = agency
    if doc_no:
        fm["doc_no"] = doc_no
    return fm


def compose_markdown(fm: dict, blocks: list[tuple[str, str]]) -> str:
    yaml_text = yaml.safe_dump(
        fm,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    ).rstrip()
    parts: list[str] = ["---", yaml_text, "---", ""]
    for heading, body in blocks:
        parts.append(f"## {heading}")
        parts.append("")
        parts.append(body.strip())
        parts.append("")
    placeholders: list[tuple[str, str]] = [
        ("重點摘要", PLACEHOLDER),
        ("相關規定", PLACEHOLDER),
        ("備註", ""),
    ]
    for heading, content in placeholders:
        parts.append(f"## {heading}")
        parts.append("")
        if content:
            parts.append(content)
            parts.append("")
    return "\n".join(parts).rstrip() + "\n"


def validate_yaml_roundtrip(md_text: str) -> Optional[str]:
    if not md_text.startswith("---"):
        return "front-matter 不以 --- 開頭"
    end = md_text.find("\n---", 3)
    if end < 0:
        return "找不到 front-matter 結尾 ---"
    raw = md_text[3:end]
    try:
        parsed = yaml.safe_load(raw)
    except yaml.YAMLError as e:
        return f"YAML 解析失敗: {e}"
    if not isinstance(parsed, dict):
        return "front-matter 不是 dict"
    return None


# ─────────────────────────────────────────────
# 已校對偵測 / 既存檔搜尋 / skip
# ─────────────────────────────────────────────


def _read_front_matter(md_path: Path) -> Optional[dict]:
    if not md_path.exists():
        return None
    try:
        text = md_path.read_text(encoding="utf-8")
    except OSError:
        return None
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    try:
        fm = yaml.safe_load(text[3:end])
    except yaml.YAMLError:
        return None
    return fm if isinstance(fm, dict) else None


def is_reviewed(md_path: Path) -> bool:
    fm = _read_front_matter(md_path)
    return bool(fm and "reviewed" in fm)


def find_existing_by_id(parent_dir: Path, id_str: str) -> Optional[Path]:
    """搜尋 parent_dir 內 front-matter id 等於 id_str 的檔。"""
    if not parent_dir.exists():
        return None
    for md in parent_dir.glob("*.md"):
        fm = _read_front_matter(md)
        if fm and fm.get("id") == id_str:
            return md
    return None


def should_skip(
    txt: Path,
    meta: Path,
    dst: Path,
    *,
    force: bool,
    force_reviewed: bool,
) -> tuple[bool, Optional[str]]:
    if not dst.exists():
        return False, None
    if is_reviewed(dst) and not force_reviewed:
        return True, "skipped_reviewed"
    if force:
        return False, None
    src_mtime = max(txt.stat().st_mtime, meta.stat().st_mtime)
    if dst.stat().st_mtime >= src_mtime:
        return True, "skipped_uptodate"
    return False, None


# ─────────────────────────────────────────────
# Slug / filename
# ─────────────────────────────────────────────


def slugify_part(s: str) -> str:
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", s)
    s = s.strip(" ._")
    return s or TODO_MARK


def build_filename(category: str, n: int, short: Optional[str]) -> str:
    title_part = slugify_part(short) if short else TODO_MARK
    if category == "A":
        return f"第{n:02d}條_{title_part}.md"
    if category == "D":
        return f"Q{n:03d}_{title_part}.md"
    if category == "C":
        return f"C{n:03d}_{title_part}.md"
    if category == "B":
        return f"B{n:03d}_{title_part}.md"
    return f"{category}{n:03d}_{title_part}.md"


# ─────────────────────────────────────────────
# 處理單檔
# ─────────────────────────────────────────────


def parse_one(
    pair: Pair,
    id_map: dict[Path, str],
    manifest: list[dict],
    *,
    force: bool,
    force_reviewed: bool,
    dry_run: bool,
    log: logging.Logger,
) -> ParseResult:
    rel = pair.txt.relative_to(ROOT).as_posix()
    result = ParseResult(
        input_txt=rel,
        category=pair.category,
        parent=pair.parent,
        parsed_at=datetime.now().isoformat(timespec="seconds"),
    )

    try:
        category = pair.category
        parent = pair.parent
        if category not in CATEGORY_DIR_NAMES:
            raise ValueError(f"未知類別:{category}")

        id_str = id_map.get(pair.txt)
        if not id_str:
            raise ValueError("序號未分配")
        result.id = id_str
        n_arabic = int(id_str.rsplit("-", 1)[-1])

        body = clean_body(pair.txt.read_text(encoding="utf-8"))
        source_metadata = pair.meta.get("source_metadata", {}) or {}

        if category == "A":
            from_text = extract_clause_number_from_text(body)
            if from_text is not None and from_text != n_arabic:
                result.warnings.append(
                    f"clause_number_mismatch(meta={n_arabic} 正文={from_text})"
                )
            parsed = parse_clause(body, source_metadata, parent)
        elif category == "D":
            parsed, qa_warns = parse_qa(body, source_metadata, parent)
            result.warnings.extend(qa_warns)
        elif category == "C":
            parsed = parse_letter(body, source_metadata, parent)
            result.warnings.append("c_class_unverified")
        else:
            parsed = parse_standard(body, source_metadata, parent)
            result.warnings.append("b_class_unverified")

        result.warnings.extend(parsed.short_warnings)
        if not parsed.title_short:
            result.warnings.append("title_fallback_TODO")

        manifest_row = find_manifest_row(manifest, category, parent, source_metadata)

        tags, tag_warns = derive_tags(
            source_metadata, parent, TYPE_BY_CATEGORY[category]
        )
        result.warnings.extend(tag_warns)
        source_field = derive_source_field(source_metadata, fallback=pair.txt.stem)
        agency = derive_agency(source_metadata, manifest_row)
        version, version_warns = derive_version(manifest_row)
        result.warnings.extend(version_warns)
        doc_no = manifest_row.get("doc_no") if manifest_row else None
        if category == "C" and not doc_no:
            result.warnings.append("doc_no_missing")

        fm = build_front_matter(
            id_str=id_str,
            category=category,
            parent=parent,
            title=parsed.title_display,
            tags=tags,
            source=source_field,
            version=version,
            agency=agency,
            doc_no=doc_no,
        )
        md = compose_markdown(fm, parsed.blocks)

        err = validate_yaml_roundtrip(md)
        if err:
            raise ValueError(f"yaml_roundtrip_failed: {err}")

        result.title = parsed.title_display

        # 路徑解析:既存檔(by id)優先,沿用其檔名;否則用 auto filename
        parent_dir = MARKDOWN_DIR / CATEGORY_DIR_NAMES[category] / parent
        existing = find_existing_by_id(parent_dir, id_str)
        if existing:
            dst = existing
        else:
            dst = parent_dir / build_filename(category, n_arabic, parsed.title_short)
        result.output_md = dst.relative_to(ROOT).as_posix()

        skip, reason = should_skip(
            pair.txt, pair.meta_path, dst,
            force=force, force_reviewed=force_reviewed,
        )
        if skip:
            result.method = reason or "skipped_uptodate"
            if reason == "skipped_reviewed":
                result.warnings.append("已校對檔(含 reviewed),需 --force-reviewed 才覆寫")
            log.info(f"{result.method} {dst.relative_to(ROOT)}")
            return result

        if dry_run:
            result.method = "dry-run"
            log.info(f"[dry-run] {dst.relative_to(ROOT)}")
            return result

        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(md, encoding="utf-8", newline="\n")
        result.method = "written"
        log.info(f"written {dst.relative_to(ROOT)}")

    except Exception as e:
        result.error = str(e)
        result.method = "failed"
        log.error(f"處理失敗 {pair.txt.name}: {e}")

    return result


# ─────────────────────────────────────────────
# 彙整表
# ─────────────────────────────────────────────


def _display_width(s: str) -> int:
    return sum(2 if _is_cjk(c) or 0x3000 <= ord(c) <= 0x303F else 1 for c in s)


def _pad_display(s: str, width: int) -> str:
    return s + " " * max(0, width - _display_width(s))


def _truncate_display(s: str, width: int) -> str:
    out: list[str] = []
    used = 0
    for ch in s:
        w = 2 if _is_cjk(ch) or 0x3000 <= ord(ch) <= 0x303F else 1
        if used + w > width - 1:
            break
        out.append(ch)
        used += w
    return "".join(out) + "…"


def print_summary(
    results: list[ParseResult],
    dry_run: bool,
    unsorted: list[Path],
) -> None:
    if unsorted:
        print()
        print(f"⚠ _unsorted/ 未處理({len(unsorted)} 檔):")
        for p in unsorted:
            print(f"  • {p.relative_to(EXTRACT_DIR)}")
        print("  → 請補 _manifest.csv 或人工拆 source 後重跑 01_extract")

    if not results:
        return
    print()
    print("=" * 84)
    print(f"{'ID':<22}{'方法':<22}{'警':<4}{'title':<32}")
    print("-" * 84)
    counts: dict[str, int] = {}
    for r in results:
        title = r.title or "-"
        if _display_width(title) > 30:
            title = _truncate_display(title, 30)
        print(
            f"{(r.id or '-'):<22}"
            f"{r.method:<22}"
            f"{len(r.warnings):<4}"
            f"{_pad_display(title, 32)}"
        )
        counts[r.method] = counts.get(r.method, 0) + 1
    print("-" * 84)
    tag = " (dry-run)" if dry_run else ""
    print(
        f"總計 {len(results)} 檔{tag}: "
        + ", ".join(f"{k}={v}" for k, v in sorted(counts.items()))
    )

    warned = [r for r in results if r.warnings]
    if warned:
        print(f"\n有警告的檔案({len(warned)}):")
        for r in warned:
            label = Path(r.input_txt).name
            if r.id:
                label += f" → {r.id}"
            print(f"  • {label}")
            for w in r.warnings:
                print(f"      - {w}")

    failed = [r for r in results if r.method == "failed"]
    if failed:
        print(f"\n失敗({len(failed)}):")
        for r in failed:
            print(f"  • {Path(r.input_txt).name}: {r.error}")


# ─────────────────────────────────────────────
# main
# ─────────────────────────────────────────────


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="把 01_extracted/*.txt 結構化為 02_markdown/*.md"
    )
    parser.add_argument("--file", help="檔名 glob;比對 01_extracted/**/*.txt")
    parser.add_argument("--category", choices=["A", "B", "C", "D", "E"])
    parser.add_argument("--parent", help="只跑某母題(如「國內旅費」)")
    parser.add_argument(
        "--force", action="store_true",
        help="覆寫較新 dst,但不蓋已校對檔(含 reviewed)",
    )
    parser.add_argument(
        "--force-reviewed", action="store_true",
        help="連已校對檔也蓋(配合 --force 使用)",
    )
    parser.add_argument("--dry-run", action="store_true", help="只列計畫,不寫檔")
    parser.add_argument("--strict", action="store_true", help="任一警告即 exit 3")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )
    log = logging.getLogger("parse")

    if not EXTRACT_DIR.exists():
        log.error(f"找不到 {EXTRACT_DIR}")
        return 1
    MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)

    manifest = load_manifest(MANIFEST_PATH)
    if not manifest:
        log.warning(
            f"找不到 {MANIFEST_PATH.name},"
            "version/agency/doc_no 將靠 metadata 推斷或填 TODO"
        )

    all_pairs, filtered, unsorted = discover_pairs(
        args.file, args.category, args.parent, log
    )
    if not all_pairs and not unsorted:
        log.warning("01_extracted/ 內沒有可處理的檔案")
        return 0

    id_map, serial_errors = assign_serials(all_pairs, log)
    if serial_errors:
        for e in serial_errors:
            log.error(e.error)
        print_summary(serial_errors, args.dry_run, unsorted)
        return 2

    if not filtered:
        log.warning("filter 後沒有匹配檔案")
        print_summary([], args.dry_run, unsorted)
        return 0

    log.info(
        f"準備處理 {len(filtered)} 個檔案"
        + (" (dry-run)" if args.dry_run else "")
    )
    results: list[ParseResult] = []
    for p in filtered:
        results.append(parse_one(
            p, id_map, manifest,
            force=args.force,
            force_reviewed=args.force_reviewed,
            dry_run=args.dry_run,
            log=log,
        ))

    print_summary(results, args.dry_run, unsorted)

    n_failed = sum(1 for r in results if r.method == "failed")
    n_warn = sum(1 for r in results if r.warnings)
    if n_failed:
        return 2
    if args.strict and n_warn:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
