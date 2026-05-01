"""03_build_index.py — 把 02_markdown/*.md 建立成 03_index/ 的 JSON 索引。

職責
----
產出四份 JSON 供前端三視圖載入:

- ``nodes.json`` — 所有節點清單(類別、母題、標題、tags、版本、summary)
- ``edges.json`` — 節點關聯(由 front-matter ``related`` 推導,relation 類型由
  類別組合決定)
- ``tags.json`` — 母標籤(來自 ``docs/06_tags_taxonomy.md``)+ 自由標籤統計
- ``search_index.json`` — FlexSearch corpus(documents 陣列,前端建索引)

**索引是衍生產物**:每次重建。SSOT 是 ``02_markdown/``,本腳本不修改它。

使用範例
--------
    python 05_scripts/03_build_index.py
    python 05_scripts/03_build_index.py --validate    # 僅驗證,不寫檔
    python 05_scripts/03_build_index.py -v

退出代碼
--------
0  全部成功
1  啟動環境錯誤
2  ID 衝突或解析失敗(阻擋寫檔)
3  --strict 且有警告
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.stderr.write("缺少 PyYAML,請執行 pip install PyYAML\n")
    sys.exit(1)

# Windows console 預設 cp950 無法輸出 unicode emoji,強制 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass


# ─────────────────────────────────────────────
# 路徑
# ─────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
MARKDOWN_DIR = ROOT / "02_markdown"
INDEX_DIR = ROOT / "03_index"
TAXONOMY_PATH = ROOT / "docs" / "06_tags_taxonomy.md"

SUMMARY_LIMIT = 100  # 字
SEARCH_BODY_LIMIT = 2000  # 字(避免 search corpus 過肥)

PLACEHOLDER_MARKERS = ("(待人工補)", "TODO", "待補")


# ─────────────────────────────────────────────
# 結構
# ─────────────────────────────────────────────


@dataclass
class Node:
    id: str
    type: str
    parent: str
    title: str
    tags: list[str]
    related: list[str]
    related_inferred: list[str]  # 2026-05-01 加:推斷邊獨立追蹤(原全混入 related)
    file_path: str
    version: str
    summary: str = ""
    agency: Optional[str] = None
    doc_no: Optional[str] = None
    reviewed: Optional[str] = None
    review_level: Optional[str] = None  # 人工 / 自動初校 / llm精校 / 草稿
    status: str = "現行"          # 現行 / 被取代 / 修正中 / 已廢止
    source_url: Optional[str] = None
    summary_pending: bool = False
    rate_table: Optional[dict] = None  # 結構化費率表(B 類標準表用)
    effective_period: Optional[str] = None  # 適用期間(已廢止費率表用)
    superseded_by: Optional[str] = None  # 被哪個節點取代
    # Phase 4 加(2026-04-29):信度系統
    certainty: str = "explicit"   # explicit / inferred / contested
    disclaimer_level: str = "standard"  # standard / strong
    no_inference_note: Optional[str] = None
    body_plain: str = field(default="", repr=False)


@dataclass
class BuildResult:
    nodes: list[Node]
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


# ─────────────────────────────────────────────
# 母標籤解析(從 docs/06_tags_taxonomy.md)
# ─────────────────────────────────────────────


def parse_taxonomy(path: Path) -> dict[str, list[str]]:
    """解析 06_tags_taxonomy.md ``## 2. 母標籤體系`` 區塊。

    回傳 {parent: [母標籤,...]}。只認 §2.X(母標籤),不抓 §4.X(常用自由標籤)。
    """
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    # 只取 "## 2." 區塊
    section_m = re.search(
        r"(?ms)^##\s+2\.\s+.+?(?=^##\s+\d+\.\s|\Z)", text
    )
    if not section_m:
        return {}
    result: dict[str, list[str]] = {}
    current_parent: Optional[str] = None
    in_table = False
    for line in section_m.group(0).splitlines():
        s = line.strip()
        sub = re.match(r"^###\s+\d+\.\d+\s+(.+)$", s)
        if sub:
            current_parent = sub.group(1).strip()
            result[current_parent] = []
            in_table = False
            continue
        if current_parent is None:
            continue
        if re.match(r"^\|[\s\-:|]+\|\s*$", s):
            in_table = True
            continue
        if in_table:
            row = re.match(r"^\|\s*(.+?)\s*\|", s)
            if row:
                tag = row.group(1).strip()
                if tag and tag != "母標籤":
                    result[current_parent].append(tag)
            else:
                in_table = False
    return {k: v for k, v in result.items() if v}


# ─────────────────────────────────────────────
# Front-matter / 內文解析
# ─────────────────────────────────────────────


def split_front_matter(text: str) -> tuple[Optional[dict], str]:
    """切出 (front-matter dict, body 字串)。"""
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


def extract_section(body: str, heading: str) -> str:
    """抽出 ## {heading} 區塊內容(下一個 ## 之前)。"""
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    return m.group(1).strip() if m else ""


_AUTO_NOTICE_RE = re.compile(r"_\(自動初校[,，]\s*待人工潤飾\)_")


def extract_summary(body: str, limit: int = SUMMARY_LIMIT) -> tuple[str, list[str]]:
    """從 ## 重點摘要 抽前 N 字。placeholder 則回空字串 + 警告。

    剝掉「自動初校,待人工潤飾」斜體標記後再計算長度與抽取,避免標記溢出到 summary。
    """
    section = extract_section(body, "重點摘要")
    if not section:
        return "", ["summary_section_missing"]
    if any(mark in section for mark in PLACEHOLDER_MARKERS):
        return "", ["summary_placeholder"]
    # 剝掉斜體標記,只做摘要本體
    section = _AUTO_NOTICE_RE.sub("", section).strip()
    if not section:
        return "", ["summary_placeholder"]
    flat = re.sub(r"\s+", "", section)
    if len(flat) <= limit:
        return section, []
    return flat[:limit] + "…", []


def md_body_to_plain(body: str) -> str:
    """把 markdown body 轉純文字(供 search corpus)。

    切成 ## H2 區塊,跳過內容含 placeholder marker 者,其餘合併並去 markdown 語法。
    """
    parts = re.split(r"(?m)^##\s+(.+?)\s*$", body)
    # parts: [前言, h2_1_title, h2_1_body, h2_2_title, h2_2_body, ...]
    kept: list[str] = [parts[0]] if parts and parts[0].strip() else []
    for i in range(1, len(parts), 2):
        content = parts[i + 1] if i + 1 < len(parts) else ""
        if any(m in content for m in PLACEHOLDER_MARKERS):
            continue
        kept.append(content)
    text = "\n".join(kept)
    # 移除 markdown link [text](url) → text
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    # 移除列表記號
    text = re.sub(r"(?m)^\s*[-*+]\s+", "", text)
    # 壓縮空白
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ─────────────────────────────────────────────
# 載入所有節點
# ─────────────────────────────────────────────


def load_nodes(
    md_dir: Path, log: logging.Logger
) -> tuple[list[Node], list[str], list[str]]:
    """掃 02_markdown/*.md 載入節點。回傳 (nodes, warnings, errors)。"""
    warnings: list[str] = []
    errors: list[str] = []
    nodes: list[Node] = []
    seen_ids: dict[str, Path] = {}

    if not md_dir.exists():
        errors.append(f"找不到 {md_dir}")
        return [], warnings, errors

    for md in sorted(md_dir.rglob("*.md")):
        rel = md.relative_to(ROOT).as_posix()
        try:
            text = md.read_text(encoding="utf-8")
        except OSError as e:
            errors.append(f"{rel}: 讀檔失敗 {e}")
            continue

        fm, body = split_front_matter(text)
        if fm is None:
            errors.append(f"{rel}: front-matter 缺失或格式錯誤")
            continue

        # 必填欄位檢查
        missing = [k for k in ("id", "type", "parent", "title") if not fm.get(k)]
        if missing:
            errors.append(f"{rel}: 缺必填欄位 {missing}")
            continue

        node_id = str(fm["id"])
        if node_id in seen_ids:
            errors.append(
                f"ID 衝突:{node_id} 同時出現於 "
                f"{seen_ids[node_id].relative_to(ROOT).as_posix()} 與 {rel}"
            )
            continue
        seen_ids[node_id] = md

        # tags
        tags = fm.get("tags") or []
        if not isinstance(tags, list):
            warnings.append(f"{rel}: tags 非 list,視為空")
            tags = []
        tags = [str(t) for t in tags]
        if not tags:
            warnings.append(f"{rel}: tags 為空")

        # related(人工邊)
        related = fm.get("related") or []
        if not isinstance(related, list):
            warnings.append(f"{rel}: related 非 list,視為空")
            related = []
        related = [str(r) for r in related]

        # related_inferred(2026-05-01 加:推斷邊獨立追蹤,由 _write_inferred_related.py 寫入)
        related_inferred = fm.get("related_inferred") or []
        if not isinstance(related_inferred, list):
            warnings.append(f"{rel}: related_inferred 非 list,視為空")
            related_inferred = []
        related_inferred = [str(r) for r in related_inferred]

        # version
        version = fm.get("version", "")
        if version is None:
            version = ""
        version = str(version)
        if not version or version == "TODO":
            warnings.append(f"{rel}: version 未填(TODO)")

        # summary
        summary, summary_warns = extract_summary(body)
        for w in summary_warns:
            warnings.append(f"{rel}: {w}")

        # body plain
        body_plain = md_body_to_plain(body)
        if len(body_plain) > SEARCH_BODY_LIMIT:
            body_plain = body_plain[:SEARCH_BODY_LIMIT]

        status_val = str(fm.get("status") or "現行")
        # 2026-04-29 起 4 值制(原「部分修正」拆兩值);舊值兼容
        if status_val not in ("現行", "被取代", "修正中", "已廢止", "部分修正"):
            warnings.append(f"{rel}: status='{status_val}' 不在允許值內,視為「現行」")
            status_val = "現行"

        # Phase 4 加(2026-04-29):certainty / disclaimer_level / no_inference_note
        certainty_val = str(fm.get("certainty") or "explicit")
        if certainty_val not in ("explicit", "inferred", "contested"):
            warnings.append(f"{rel}: certainty='{certainty_val}' 不在允許值內,視為 explicit")
            certainty_val = "explicit"
        disclaimer_val = str(fm.get("disclaimer_level") or
                             ("standard" if certainty_val == "explicit" else "strong"))
        if disclaimer_val not in ("standard", "strong"):
            disclaimer_val = "standard" if certainty_val == "explicit" else "strong"

        node = Node(
            id=node_id,
            type=str(fm.get("type", "")),
            parent=str(fm.get("parent", "")),
            title=str(fm.get("title", "")),
            tags=tags,
            related=related,
            related_inferred=related_inferred,
            file_path=rel,
            version=version,
            summary=summary,
            agency=str(fm["agency"]) if fm.get("agency") else None,
            doc_no=str(fm["doc_no"]) if fm.get("doc_no") else None,
            reviewed=str(fm["reviewed"]) if fm.get("reviewed") else None,
            review_level=str(fm["review_level"]) if fm.get("review_level") else None,
            status=status_val,
            source_url=str(fm["source_url"]) if fm.get("source_url") else None,
            summary_pending=bool(fm.get("summary_pending")),
            rate_table=fm["rate_table"] if isinstance(fm.get("rate_table"), dict) else None,
            effective_period=str(fm["effective_period"]) if fm.get("effective_period") else None,
            superseded_by=str(fm["superseded_by"]) if fm.get("superseded_by") else None,
            certainty=certainty_val,
            disclaimer_level=disclaimer_val,
            no_inference_note=str(fm["no_inference_note"]) if fm.get("no_inference_note") else None,
            body_plain=body_plain,
        )
        nodes.append(node)

    return nodes, warnings, errors


# ─────────────────────────────────────────────
# 各 JSON 建構
# ─────────────────────────────────────────────


def build_nodes_json(nodes: list[Node]) -> list[dict]:
    out: list[dict] = []
    for n in nodes:
        d: dict = {
            "id": n.id,
            "type": n.type,
            "parent": n.parent,
            "title": n.title,
            "tags": n.tags,
            "related": n.related,
            "related_inferred": n.related_inferred,
            "file_path": n.file_path,
            "version": n.version,
            "summary": n.summary,
            "status": n.status,
        }
        if n.agency:
            d["agency"] = n.agency
        if n.doc_no:
            d["doc_no"] = n.doc_no
        if n.reviewed:
            d["reviewed"] = n.reviewed
        if n.review_level:
            d["review_level"] = n.review_level
        if n.source_url:
            d["source_url"] = n.source_url
        if n.summary_pending:
            d["summary_pending"] = True
        if n.rate_table:
            d["rate_table"] = n.rate_table
        if n.effective_period:
            d["effective_period"] = n.effective_period
        if n.superseded_by:
            d["superseded_by"] = n.superseded_by
        # Phase 4 信度系統(2026-04-29):前端會用來顯示免責層級
        if n.certainty and n.certainty != "explicit":
            d["certainty"] = n.certainty
        if n.disclaimer_level and n.disclaimer_level != "standard":
            d["disclaimer_level"] = n.disclaimer_level
        if n.no_inference_note:
            d["no_inference_note"] = n.no_inference_note
        out.append(d)
    return out


# 類別組合 → relation 推斷
def infer_relation(from_cat: str, to_cat: str) -> str:
    """依類別代碼推斷 relation。

    - C → A:explains(函釋說明條文)
    - D → A/B/C:answers(問答對應)
    - 任何 → N:belongs_to
    - 同類:cites
    - 預設:cites
    """
    if to_cat == "N" or from_cat == "N":
        return "belongs_to"
    if from_cat == "C" and to_cat == "A":
        return "explains"
    if from_cat == "A" and to_cat == "C":
        return "explains"  # 雙向同名,前端可去重
    if from_cat == "D":
        return "answers"
    if to_cat == "D":
        return "answers"
    return "cites"


def category_of(node_id: str) -> str:
    """從 ID 抽類別代碼(首字母)。"""
    return node_id.split("-", 1)[0] if "-" in node_id else "?"


def build_edges_json(
    nodes: list[Node], log: logging.Logger
) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    node_ids = {n.id for n in nodes}
    seen: set[tuple[str, str, str]] = set()
    edges: list[dict] = []
    # 1) 人工邊 — 從 fm.related
    for n in nodes:
        for rel_id in n.related:
            if rel_id not in node_ids:
                warnings.append(
                    f"{n.id}.related → {rel_id} 不存在於 nodes(可能尚未建立或拼寫錯)"
                )
                continue
            relation = infer_relation(category_of(n.id), category_of(rel_id))
            key = (n.id, rel_id, relation)
            if key in seen:
                continue
            seen.add(key)
            edges.append({
                "from": n.id, "to": rel_id, "relation": relation,
                "inferred": False,
            })
    # 2) 推斷邊 — 從 fm.related_inferred(2026-05-01 加;原全混入 related)
    for n in nodes:
        for rel_id in n.related_inferred:
            if rel_id not in node_ids:
                warnings.append(
                    f"{n.id}.related_inferred → {rel_id} 不存在於 nodes"
                )
                continue
            base_rel = infer_relation(category_of(n.id), category_of(rel_id))
            relation = f"{base_rel}_inferred"
            key = (n.id, rel_id, relation)
            if key in seen:
                continue
            # 若同 (from, to) 已有人工邊則跳過(人工優先)
            if any((n.id, rel_id, r) in seen for r in ("cites", "explains", "answers", "belongs_to")):
                continue
            seen.add(key)
            edges.append({
                "from": n.id, "to": rel_id, "relation": relation,
                "inferred": True, "source": "fm",  # 來自 fm.related_inferred(可重建)
            })
    return edges, warnings


# ─────────────────────────────────────────────
# 正文引用偵測(自動推斷邊)
# ─────────────────────────────────────────────

# 中文數字 → 阿拉伯
_CN_DIGITS: dict[str, int] = {
    "零": 0, "〇": 0, "○": 0,
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}


def _cn2int(s: str) -> Optional[int]:
    """涵蓋 1~99 的中文數字轉阿拉伯,失敗回 None。"""
    if not s:
        return None
    if s.isdigit():
        return int(s)
    chars = list(s)
    if not all(c in _CN_DIGITS for c in chars):
        return None
    if len(chars) == 1:
        return _CN_DIGITS[chars[0]]
    if "十" not in chars:
        return None
    idx = chars.index("十")
    if idx == 0:
        tens, ones = 1, _CN_DIGITS[chars[1]] if len(chars) > 1 else 0
    elif idx == len(chars) - 1:
        tens, ones = _CN_DIGITS[chars[0]], 0
    else:
        tens, ones = _CN_DIGITS[chars[0]], _CN_DIGITS[chars[idx + 1]]
    return tens * 10 + ones


# 引用 pattern:抓出「第 N 條/點/項」的數字部分
_REF_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"第\s*([零〇○一二三四五六七八九十百]+|\d+)\s*[條點]"),
]
_QA_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bQ\s*(\d+)\b", flags=re.IGNORECASE),
]


def _resolve_target_parents(
    body: str, match_start: int, default_parent: str, all_parents: list[str]
) -> list[str]:
    """根據引用前的上下文決定目標母題。

    預設用本節點所屬母題;若引用前 40 字內出現其他母題名,改連到該母題。
    例:國外旅費 C 函釋寫「依國內旅費報支要點第 5 點」→ 跨母題連到 A-國內旅費-005。
    """
    start = max(0, match_start - 40)
    context = body[start:match_start]
    for p in all_parents:
        if p != default_parent and p in context:
            return [p]
    return [default_parent]


def build_inferred_edges(
    nodes: list[Node], existing_edges: list[dict]
) -> tuple[list[dict], list[str]]:
    """掃 body_plain 找「第 N 點/條」「QN」引用,加自動推斷邊。

    規則:
    - 預設同 parent 內查 ID
    - 上下文若提到其他母題名(如國外 C 寫「依國內旅費報支要點第 5 點」)→ 跨母題連結
    - A 類條文引用 → cites_inferred(指向 A 類)
    - 任意類引用 Q → answers_inferred(指向 D 類)
    - 自指(本節點引用自己)跳過
    - 已存在於人工 edges 的 (from, to) 跳過
    """
    warnings: list[str] = []
    by_parent_serial: dict[tuple[str, str, int], str] = {}
    for n in nodes:
        m = re.match(r"^([ABCD])-([^-]+)-(\d{3})$", n.id)
        if m:
            cat, parent, serial = m.group(1), m.group(2), int(m.group(3))
            by_parent_serial[(cat, parent, serial)] = n.id

    all_parents = sorted({n.parent for n in nodes})
    existing_pairs = {(e["from"], e["to"]) for e in existing_edges}
    inferred: list[dict] = []
    seen: set[tuple[str, str]] = set()
    cross_parent_count = 0

    for n in nodes:
        if not n.body_plain:
            continue
        body = n.body_plain

        # 條文/點 引用 → A 類
        for pat in _REF_PATTERNS:
            for m in pat.finditer(body):
                serial = _cn2int(m.group(1))
                if serial is None or serial < 1 or serial > 99:
                    continue
                target_parents = _resolve_target_parents(
                    body, m.start(), n.parent, all_parents
                )
                for tp in target_parents:
                    target = by_parent_serial.get(("A", tp, serial))
                    if not target or target == n.id:
                        continue
                    if (n.id, target) in existing_pairs or (n.id, target) in seen:
                        continue
                    seen.add((n.id, target))
                    if tp != n.parent:
                        cross_parent_count += 1
                    inferred.append({
                        "from": n.id, "to": target,
                        "relation": "cites_inferred",
                        "inferred": True,
                        "matched": m.group(0),
                        "cross_parent": tp != n.parent,
                    })

        # QN 引用 → D 類
        for pat in _QA_PATTERNS:
            for m in pat.finditer(body):
                serial = int(m.group(1))
                if serial < 1 or serial > 999:
                    continue
                target_parents = _resolve_target_parents(
                    body, m.start(), n.parent, all_parents
                )
                for tp in target_parents:
                    target = by_parent_serial.get(("D", tp, serial))
                    if not target or target == n.id:
                        continue
                    if (n.id, target) in existing_pairs or (n.id, target) in seen:
                        continue
                    seen.add((n.id, target))
                    if tp != n.parent:
                        cross_parent_count += 1
                    inferred.append({
                        "from": n.id, "to": target,
                        "relation": "answers_inferred",
                        "inferred": True,
                        "matched": m.group(0),
                        "cross_parent": tp != n.parent,
                    })

    if inferred:
        msg = f"自動推斷 {len(inferred)} 條邊(relation 含 _inferred 後綴)"
        if cross_parent_count:
            msg += f"(含 {cross_parent_count} 條跨母題)"
        warnings.append(msg)
    return inferred, warnings


def build_tags_json(
    nodes: list[Node], taxonomy: dict[str, list[str]]
) -> dict:
    free_tags: dict[str, dict] = {}
    for n in nodes:
        for tag in n.tags:
            entry = free_tags.setdefault(tag, {"count": 0, "node_ids": []})
            entry["count"] += 1
            entry["node_ids"].append(n.id)
    # 排序:依出現次數降序
    free_tags_sorted = dict(
        sorted(free_tags.items(), key=lambda kv: (-kv[1]["count"], kv[0]))
    )
    return {
        "母標籤": taxonomy,
        "自由標籤": free_tags_sorted,
    }


def _row_cell_text(cell) -> str:
    """rate_table row cell may be string/number or {v, colspan} dict — get displayable text."""
    if cell is None:
        return ""
    if isinstance(cell, dict):
        return str(cell.get("v", ""))
    return str(cell)


def _is_other_label(s: str) -> bool:
    s = (s or "").strip().lower()
    return s.startswith("其他") or s.startswith("other")


def build_rate_lookup(nodes: list[Node]) -> dict:
    """從 rate_table.searchable=true 的節點抽出可查詢列。

    每筆 entry:{node_id, node_title, table_caption, label, value, unit, row_index,
              country?, region?, is_other?, section_title?, section_index?}
    支援 flat 模式 與 sectioned 模式(per-section searchable)。

    Schema 新欄位(用於「未列載城市自動 fallback」):
    - rt.search_country_idx 或 sec.search_country_idx:rows 中代表「國家」的欄位 index
    - region 來自 sec.title(若 sectioned)
    - is_other 自動偵測 label 是否為「其他/Other」
    """
    entries: list[dict] = []
    for n in nodes:
        rt = n.rate_table
        if not isinstance(rt, dict):
            continue
        unit = str(rt.get("unit") or "")
        node_caption = str(rt.get("caption") or n.title)

        def _emit(rows, label_idx, value_idx, country_idx, sec_title=None, s_idx=None):
            for i, row in enumerate(rows):
                if not isinstance(row, list) or not row:
                    continue
                lbl = _row_cell_text(row[label_idx]) if 0 <= label_idx < len(row) else ""
                val = _row_cell_text(row[value_idx]) if 0 <= value_idx < len(row) else ""
                if not lbl:
                    continue
                country = ""
                if country_idx is not None and 0 <= country_idx < len(row):
                    country = _row_cell_text(row[country_idx])
                # 單城市國家:country 欄空,但 city = country,fallback 抓不到。
                # 規則:若 country 空且非 「其他」,把 city 也視作 country
                if not country and not _is_other_label(lbl):
                    country = lbl
                entry = {
                    "node_id": n.id,
                    "node_title": n.title,
                    "table_caption": node_caption,
                    "label": lbl,
                    "value": val,
                    "unit": unit,
                    "row_index": i,
                }
                if country:
                    entry["country"] = country
                if _is_other_label(lbl):
                    entry["is_other"] = True
                if sec_title:
                    entry["section_title"] = sec_title
                    entry["section_index"] = s_idx
                entries.append(entry)

        # flat 模式
        if rt.get("searchable") and isinstance(rt.get("rows"), list):
            rows = rt["rows"]
            cols = len(rows[0]) if rows else 0
            label_idx = rt.get("search_label_idx")
            value_idx = rt.get("search_value_idx")
            country_idx = rt.get("search_country_idx")
            if label_idx is None:
                label_idx = 1 if cols >= 3 else 0
            if value_idx is None:
                value_idx = cols - 1
            _emit(rows, label_idx, value_idx, country_idx)

        # sectioned 模式
        for s_idx, sec in enumerate(rt.get("sections") or []):
            if not (isinstance(sec, dict) and sec.get("searchable") and isinstance(sec.get("rows"), list)):
                continue
            rows = sec["rows"]
            cols = len(rows[0]) if rows else 0
            label_idx = sec.get("search_label_idx")
            value_idx = sec.get("search_value_idx")
            country_idx = sec.get("search_country_idx")
            if label_idx is None:
                label_idx = 1 if cols >= 3 else 0
            if value_idx is None:
                value_idx = cols - 1
            sec_title = str(sec.get("title") or "")
            _emit(rows, label_idx, value_idx, country_idx, sec_title=sec_title, s_idx=s_idx)

    return {"version": 1, "entries": entries}


def build_search_corpus(nodes: list[Node]) -> dict:
    return {
        "version": 1,
        "documents": [
            {
                "id": n.id,
                "type": n.type,
                "parent": n.parent,
                "title": n.title,
                "tags": n.tags,
                "summary": n.summary,
                "body": n.body_plain,
            }
            for n in nodes
        ],
    }


# ─────────────────────────────────────────────
# 寫檔
# ─────────────────────────────────────────────


def write_json(path: Path, data, *, dry_run: bool, log: logging.Logger) -> None:
    if dry_run:
        log.info(f"[validate-only] 不寫 {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )
    size = path.stat().st_size
    log.info(f"寫入 {path.relative_to(ROOT)} ({size:,} bytes)")


# ─────────────────────────────────────────────
# 彙整表
# ─────────────────────────────────────────────


def print_summary(
    nodes: list[Node],
    edges: list[dict],
    tags_json: dict,
    warnings: list[str],
    errors: list[str],
    validate_only: bool,
) -> None:
    print()
    print("=" * 60)
    print("索引建構彙整")
    print("-" * 60)
    by_type: dict[str, int] = {}
    by_parent: dict[str, int] = {}
    reviewed = 0
    for n in nodes:
        by_type[n.type] = by_type.get(n.type, 0) + 1
        by_parent[n.parent] = by_parent.get(n.parent, 0) + 1
        if n.reviewed:
            reviewed += 1
    print(f"節點總數:{len(nodes)}(已校對 {reviewed})")
    print(f"  依類別:{', '.join(f'{k}={v}' for k, v in sorted(by_type.items()))}")
    print(f"  依母題:{', '.join(f'{k}={v}' for k, v in sorted(by_parent.items()))}")
    relation_counts: dict[str, int] = {}
    for e in edges:
        relation_counts[e["relation"]] = relation_counts.get(e["relation"], 0) + 1
    print(
        f"邊數:{len(edges)} "
        f"({', '.join(f'{k}={v}' for k, v in sorted(relation_counts.items())) or '-'})"
    )
    free_tags = tags_json.get("自由標籤", {})
    print(f"自由標籤:{len(free_tags)} 個")
    if free_tags:
        top = list(free_tags.items())[:8]
        print("  前 8 高頻:")
        for tag, info in top:
            print(f"    - {tag} ({info['count']})")
    parent_tags = tags_json.get("母標籤", {})
    print(f"母標籤分類:{len(parent_tags)} 個母題")

    if errors:
        print(f"\n錯誤({len(errors)}):")
        for e in errors:
            print(f"  ✗ {e}")
    if warnings:
        print(f"\n警告({len(warnings)}):")
        for w in warnings:
            print(f"  ⚠ {w}")

    print("-" * 60)
    if validate_only:
        print("(--validate 模式,未寫檔)")
    else:
        print(f"輸出至:{INDEX_DIR.relative_to(ROOT)}/")


# ─────────────────────────────────────────────
# main
# ─────────────────────────────────────────────


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="把 02_markdown/*.md 建立為 03_index/ 的 JSON 索引"
    )
    parser.add_argument(
        "--validate", action="store_true", help="僅驗證,不寫檔"
    )
    parser.add_argument("--strict", action="store_true", help="任一警告即 exit 3")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )
    log = logging.getLogger("build-index")

    if not MARKDOWN_DIR.exists():
        log.error(f"找不到 {MARKDOWN_DIR}")
        return 1

    taxonomy = parse_taxonomy(TAXONOMY_PATH)
    if not taxonomy:
        log.warning(f"未能解析 {TAXONOMY_PATH.name},母標籤將為空")

    nodes, warnings, errors = load_nodes(MARKDOWN_DIR, log)
    if errors:
        for e in errors:
            log.error(e)
        print_summary(nodes, [], {}, warnings, errors, args.validate)
        return 2

    if not nodes:
        log.warning("沒有可處理的節點")
        return 0

    edges, edge_warns = build_edges_json(nodes, log)
    warnings.extend(edge_warns)

    inferred_edges, inferred_warns = build_inferred_edges(nodes, edges)
    warnings.extend(inferred_warns)
    edges.extend(inferred_edges)

    tags_json = build_tags_json(nodes, taxonomy)
    nodes_json = build_nodes_json(nodes)
    search_corpus = build_search_corpus(nodes)
    rate_lookup = build_rate_lookup(nodes)

    # _meta.json:索引建構時間 + 節點統計,前端 footer 顯示「資料更新日」
    from datetime import datetime, timezone, timedelta
    tz_tw = timezone(timedelta(hours=8))
    now_tw = datetime.now(tz_tw)
    obsolete_n = sum(1 for n in nodes if n.status == "已廢止")
    revising_n = sum(1 for n in nodes if n.status == "部分修正")
    reviewed_n = sum(1 for n in nodes if n.reviewed)
    level_counts: dict[str, int] = {}
    for n in nodes:
        lv = n.review_level or "未標"
        level_counts[lv] = level_counts.get(lv, 0) + 1
    meta = {
        "last_indexed": now_tw.strftime("%Y-%m-%d"),
        "last_indexed_iso": now_tw.isoformat(timespec="seconds"),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "status_counts": {
            "現行": len(nodes) - obsolete_n - revising_n,
            "部分修正": revising_n,
            "已廢止": obsolete_n,
        },
        "reviewed_count": reviewed_n,
        "review_level_counts": level_counts,
    }

    write_json(INDEX_DIR / "nodes.json", nodes_json, dry_run=args.validate, log=log)
    write_json(INDEX_DIR / "edges.json", edges, dry_run=args.validate, log=log)
    write_json(INDEX_DIR / "tags.json", tags_json, dry_run=args.validate, log=log)
    write_json(
        INDEX_DIR / "search_index.json", search_corpus,
        dry_run=args.validate, log=log,
    )
    write_json(INDEX_DIR / "_meta.json", meta, dry_run=args.validate, log=log)
    write_json(INDEX_DIR / "rate_lookup.json", rate_lookup, dry_run=args.validate, log=log)

    print_summary(nodes, edges, tags_json, warnings, errors, args.validate)

    if args.strict and warnings:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
