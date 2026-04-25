"""04_validate.py — 對 02_markdown/ 做一致性檢查。

職責
----
依 ``docs/02_data_schema.md §5`` 與 ``docs/03_id_convention.md §6`` 的規則,
逐檔檢查 02_markdown/*.md 的 front-matter 與檔案結構。

檢查項(對照 docs)
------------------
errors(阻擋,exit 2)
  E1  ID 唯一
  E2  ID 格式 ``^[ABCDN]-[\\u4e00-\\u9fa5]+-\\d{3}$``
  E3  必填欄位齊全(id/type/parent/title/tags/source/version)
  E4  類別代碼合法(A/B/C/D/N)
  E5  type 對應 ID 類別代碼(A↔核心法規 等)
  E6  類別與所在子資料夾一致(A 類須在 A_核心法規/)
  E7  母題在合法清單內
  E8  母題與所在子資料夾一致
  E9  related 內 ID 都實際存在於 nodes
  E10 tags 至少 1 個

warnings(報告,不擋,--strict 才視為失敗)
  W1  version 為 ``TODO`` 或非 ISO 日期格式
  W2  summary 為 placeholder「(待人工補)」
  W3  source 找不到對應檔(manifest 或 00_source/ 任一檔)
  W4  reviewed 缺(草稿狀態)
  W5  C 類缺 doc_no
  W6  title 含 TODO 後綴(02_parse fallback)

合法母題清單來源
----------------
從 ``docs/03_id_convention.md`` §3.1 與 §3.2 的表格動態解析。

CLI
---
    python 05_scripts/04_validate.py
    python 05_scripts/04_validate.py --strict   # 警告也視為失敗
    python 05_scripts/04_validate.py -v

退出代碼
--------
0  全部通過
1  啟動環境錯誤
2  有 error
3  --strict 且有 warning
"""

from __future__ import annotations

import argparse
import csv
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


# ─────────────────────────────────────────────
# 路徑與常數
# ─────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
MARKDOWN_DIR = ROOT / "02_markdown"
SOURCE_DIR = ROOT / "00_source"
MANIFEST_PATH = SOURCE_DIR / "_manifest.csv"
ID_CONVENTION_PATH = ROOT / "docs" / "03_id_convention.md"

CATEGORY_DIR_NAMES: dict[str, str] = {
    "A": "A_核心法規",
    "B": "B_支出標準",
    "C": "C_解釋函令",
    "D": "D_問答集",
}
TYPE_BY_CATEGORY: dict[str, str] = {
    "A": "核心法規",
    "B": "支出標準",
    "C": "解釋函令",
    "D": "問答集",
    "N": "分類節點",
}
VALID_CATEGORIES = set(TYPE_BY_CATEGORY.keys())
REQUIRED_FIELDS = ("id", "type", "parent", "title", "tags", "source", "version")

ID_PATTERN = re.compile(r"^([ABCDN])-([一-龥]+)-(\d{3})$")
ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PLACEHOLDER_MARKERS = ("(待人工補)", "TODO", "待補")


# ─────────────────────────────────────────────
# 結構
# ─────────────────────────────────────────────


@dataclass
class Issue:
    code: str  # E1, W1, ...
    file_path: str
    message: str
    severity: str  # "error" | "warning"


@dataclass
class NodeRecord:
    file_path: Path
    rel_path: str
    fm: dict
    body: str


# ─────────────────────────────────────────────
# 合法母題清單(從 docs/03_id_convention.md 解析)
# ─────────────────────────────────────────────


def parse_valid_parents(path: Path) -> set[str]:
    """從 docs/03_id_convention.md ``## 3. 母題清單`` 抓出合法母題。"""
    if not path.exists():
        return set()
    text = path.read_text(encoding="utf-8")
    section_m = re.search(
        r"(?ms)^##\s+3\.\s+母題清單.+?(?=^##\s+\d+\.\s|\Z)", text
    )
    if not section_m:
        return set()
    parents: set[str] = set()
    in_table = False
    for line in section_m.group(0).splitlines():
        s = line.strip()
        if re.match(r"^\|[\s\-:|]+\|\s*$", s):
            in_table = True
            continue
        if not s.startswith("|"):
            in_table = False
            continue
        if in_table:
            row = re.match(r"^\|\s*`?([^`|]+?)`?\s*\|", s)
            if row:
                name = row.group(1).strip()
                if name and name != "母題":
                    parents.add(name)
    return parents


# ─────────────────────────────────────────────
# Front-matter 切分
# ─────────────────────────────────────────────


def split_front_matter(text: str) -> tuple[Optional[dict], str, Optional[str]]:
    """切出 (fm, body, error)。fm 為 None 時 error 給原因。"""
    if not text.startswith("---"):
        return None, text, "front-matter 不以 --- 開頭"
    end = text.find("\n---", 3)
    if end < 0:
        return None, text, "找不到 front-matter 結尾 ---"
    raw = text[3:end]
    try:
        fm = yaml.safe_load(raw)
    except yaml.YAMLError as e:
        return None, text, f"YAML 解析失敗: {e}"
    if not isinstance(fm, dict):
        return None, text, "front-matter 不是 dict"
    return fm, text[end + 4:].lstrip("\n"), None


def extract_section(body: str, heading: str) -> str:
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    return m.group(1).strip() if m else ""


# ─────────────────────────────────────────────
# Manifest / source 對照
# ─────────────────────────────────────────────


def load_manifest_filenames(path: Path) -> set[str]:
    """讀 manifest 取所有 filename(去副檔名)。"""
    if not path.exists():
        return set()
    names: set[str] = set()
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            fname = (row.get("filename") or "").strip()
            if fname:
                names.add(Path(fname).stem)
    return names


def collect_source_filenames(source_dir: Path) -> set[str]:
    """蒐集 00_source/ 下所有檔名(stem)。"""
    if not source_dir.exists():
        return set()
    return {
        p.stem
        for p in source_dir.rglob("*")
        if p.is_file() and not p.name.startswith("_")
    }


def source_field_matches(
    source_value: str,
    manifest_stems: set[str],
    source_stems: set[str],
) -> bool:
    """source 欄位是否能對應到任一已知檔(manifest 或 00_source/)。

    比對方式:雙向 substring(source 包含於某 stem,或某 stem 包含於 source)。
    """
    if not source_value:
        return False
    candidates = manifest_stems | source_stems
    for stem in candidates:
        if source_value in stem or stem in source_value:
            return True
    return False


# ─────────────────────────────────────────────
# 載入所有節點
# ─────────────────────────────────────────────


def load_nodes(md_dir: Path) -> tuple[list[NodeRecord], list[Issue]]:
    """掃 02_markdown/ 載入所有 MD。回傳 (nodes, parse_errors)。"""
    nodes: list[NodeRecord] = []
    issues: list[Issue] = []
    if not md_dir.exists():
        return nodes, issues
    for md in sorted(md_dir.rglob("*.md")):
        rel = md.relative_to(ROOT).as_posix()
        try:
            text = md.read_text(encoding="utf-8")
        except OSError as e:
            issues.append(Issue("E0", rel, f"讀檔失敗: {e}", "error"))
            continue
        fm, body, err = split_front_matter(text)
        if err or fm is None:
            issues.append(Issue("E0", rel, err or "front-matter 缺失", "error"))
            continue
        nodes.append(NodeRecord(file_path=md, rel_path=rel, fm=fm, body=body))
    return nodes, issues


# ─────────────────────────────────────────────
# 各檢查器
# ─────────────────────────────────────────────


def check_unique_ids(nodes: list[NodeRecord]) -> list[Issue]:
    """E1: ID 唯一。"""
    issues: list[Issue] = []
    seen: dict[str, str] = {}
    for n in nodes:
        nid = n.fm.get("id")
        if not nid:
            continue
        nid = str(nid)
        if nid in seen:
            issues.append(Issue(
                "E1",
                n.rel_path,
                f"ID 重複:{nid} 已用於 {seen[nid]}",
                "error",
            ))
        else:
            seen[nid] = n.rel_path
    return issues


def check_required_fields(node: NodeRecord) -> list[Issue]:
    """E3: 必填欄位齊全。"""
    issues: list[Issue] = []
    for field_name in REQUIRED_FIELDS:
        v = node.fm.get(field_name)
        if v is None or (isinstance(v, str) and not v.strip()) or v == []:
            issues.append(Issue(
                "E3",
                node.rel_path,
                f"必填欄位缺漏:{field_name}",
                "error",
            ))
    return issues


def check_id_format(node: NodeRecord) -> list[Issue]:
    """E2/E4: ID 格式 + 類別代碼合法。"""
    nid = node.fm.get("id")
    if not nid:
        return []
    nid = str(nid)
    m = ID_PATTERN.match(nid)
    if not m:
        return [Issue("E2", node.rel_path, f"ID 格式不符: {nid}", "error")]
    cat = m.group(1)
    if cat not in VALID_CATEGORIES:
        return [Issue("E4", node.rel_path, f"類別代碼非法: {cat}", "error")]
    return []


def check_type_matches_category(node: NodeRecord) -> list[Issue]:
    """E5: type 對應 ID 第一碼。"""
    nid = node.fm.get("id")
    type_val = node.fm.get("type")
    if not nid or not type_val:
        return []
    m = ID_PATTERN.match(str(nid))
    if not m:
        return []
    cat = m.group(1)
    expected = TYPE_BY_CATEGORY.get(cat)
    if expected and type_val != expected:
        return [Issue(
            "E5",
            node.rel_path,
            f"type/類別不對應:ID 為 {cat} 但 type={type_val!r}(應為 {expected!r})",
            "error",
        )]
    return []


def check_directory_layout(node: NodeRecord) -> list[Issue]:
    """E6/E8: 類別與母題對應到所在子資料夾。"""
    issues: list[Issue] = []
    nid = node.fm.get("id")
    parent = node.fm.get("parent")
    if not nid:
        return issues
    m = ID_PATTERN.match(str(nid))
    if not m:
        return issues
    cat = m.group(1)
    expected_cat_dir = CATEGORY_DIR_NAMES.get(cat)
    rel_parts = node.file_path.relative_to(MARKDOWN_DIR).parts
    if expected_cat_dir and (not rel_parts or rel_parts[0] != expected_cat_dir):
        issues.append(Issue(
            "E6",
            node.rel_path,
            f"類別與資料夾不一致:ID 類別={cat} "
            f"預期 {expected_cat_dir}/,實際 {rel_parts[0] if rel_parts else '?'}/",
            "error",
        ))
    if parent and len(rel_parts) >= 2 and rel_parts[1] != parent:
        issues.append(Issue(
            "E8",
            node.rel_path,
            f"母題與資料夾不一致:parent={parent!r} 但位於 {rel_parts[1]!r}/",
            "error",
        ))
    return issues


def check_parent_in_list(node: NodeRecord, valid_parents: set[str]) -> list[Issue]:
    """E7: 母題在合法清單內。"""
    parent = node.fm.get("parent")
    if not parent or not valid_parents:
        return []
    if parent not in valid_parents:
        return [Issue(
            "E7",
            node.rel_path,
            f"母題不在合法清單:{parent!r}(合法:{sorted(valid_parents)})",
            "error",
        )]
    return []


def check_related_exist(
    node: NodeRecord, all_ids: set[str]
) -> list[Issue]:
    """E9: related 內 ID 都實際存在。"""
    related = node.fm.get("related") or []
    if not isinstance(related, list):
        return [Issue("E9", node.rel_path, "related 非 list", "error")]
    issues: list[Issue] = []
    for rid in related:
        rid = str(rid)
        if rid not in all_ids:
            issues.append(Issue(
                "E9",
                node.rel_path,
                f"related 引用不存在的 ID: {rid}",
                "error",
            ))
    return issues


def check_tags_nonempty(node: NodeRecord) -> list[Issue]:
    """E10: tags 至少 1 個。"""
    tags = node.fm.get("tags")
    if not isinstance(tags, list) or len(tags) == 0:
        return [Issue("E10", node.rel_path, "tags 為空", "error")]
    return []


def check_version_format(node: NodeRecord) -> list[Issue]:
    """W1: version 是 ISO 日期格式;TODO 或非法格式 → warning。"""
    v = node.fm.get("version", "")
    if v is None:
        v = ""
    v = str(v).strip()
    if not v:
        return []  # 由 E3 必填檢查處理
    if v == "TODO":
        return [Issue("W1", node.rel_path, "version 為 TODO(待補)", "warning")]
    if not ISO_DATE_PATTERN.match(v):
        return [Issue(
            "W1",
            node.rel_path,
            f"version 非 ISO 日期(YYYY-MM-DD):{v!r}",
            "warning",
        )]
    return []


def check_summary_placeholder(node: NodeRecord) -> list[Issue]:
    """W2: 重點摘要為 placeholder。"""
    section = extract_section(node.body, "重點摘要")
    if not section:
        return [Issue("W2", node.rel_path, "## 重點摘要 區塊不存在", "warning")]
    if any(m in section for m in PLACEHOLDER_MARKERS):
        return [Issue("W2", node.rel_path, "## 重點摘要 為 placeholder", "warning")]
    return []


def check_source_exists(
    node: NodeRecord,
    manifest_stems: set[str],
    source_stems: set[str],
) -> list[Issue]:
    """W3: source 對應 manifest 或 00_source/ 內檔。"""
    src = node.fm.get("source", "")
    if not src:
        return []
    if not source_field_matches(str(src), manifest_stems, source_stems):
        return [Issue(
            "W3",
            node.rel_path,
            f"source 找不到對應檔(manifest 或 00_source/):{src!r}",
            "warning",
        )]
    return []


def check_reviewed(node: NodeRecord) -> list[Issue]:
    """W4: reviewed 欄位缺(草稿)。"""
    if not node.fm.get("reviewed"):
        return [Issue("W4", node.rel_path, "尚未人工校對(無 reviewed)", "warning")]
    return []


def check_doc_no_for_c(node: NodeRecord) -> list[Issue]:
    """W5: C 類缺 doc_no。"""
    nid = node.fm.get("id", "")
    if str(nid).startswith("C-") and not node.fm.get("doc_no"):
        return [Issue("W5", node.rel_path, "C 類函釋缺 doc_no", "warning")]
    return []


def check_title_todo(node: NodeRecord) -> list[Issue]:
    """W6: title 含 TODO 後綴。"""
    title = node.fm.get("title", "")
    if any(m in str(title) for m in PLACEHOLDER_MARKERS):
        return [Issue("W6", node.rel_path, f"title 含 TODO 標記:{title!r}", "warning")]
    return []


# ─────────────────────────────────────────────
# 全檢查
# ─────────────────────────────────────────────


def run_checks(
    nodes: list[NodeRecord],
    valid_parents: set[str],
    manifest_stems: set[str],
    source_stems: set[str],
) -> list[Issue]:
    issues: list[Issue] = []

    # 全域檢查
    issues.extend(check_unique_ids(nodes))
    all_ids = {str(n.fm.get("id")) for n in nodes if n.fm.get("id")}

    # 逐節點檢查
    for n in nodes:
        issues.extend(check_required_fields(n))
        issues.extend(check_id_format(n))
        issues.extend(check_type_matches_category(n))
        issues.extend(check_directory_layout(n))
        issues.extend(check_parent_in_list(n, valid_parents))
        issues.extend(check_related_exist(n, all_ids))
        issues.extend(check_tags_nonempty(n))
        issues.extend(check_version_format(n))
        issues.extend(check_summary_placeholder(n))
        issues.extend(check_source_exists(n, manifest_stems, source_stems))
        issues.extend(check_reviewed(n))
        issues.extend(check_doc_no_for_c(n))
        issues.extend(check_title_todo(n))

    return issues


# ─────────────────────────────────────────────
# 報表
# ─────────────────────────────────────────────


def print_report(
    nodes: list[NodeRecord],
    issues: list[Issue],
    valid_parents: set[str],
) -> None:
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]

    print()
    print("=" * 60)
    print("驗證報告")
    print("-" * 60)
    print(f"檢查節點:{len(nodes)}")
    print(f"合法母題清單({len(valid_parents)}):{sorted(valid_parents)}")
    print(f"錯誤:{len(errors)} 警告:{len(warnings)}")

    by_code: dict[str, int] = {}
    for i in issues:
        by_code[i.code] = by_code.get(i.code, 0) + 1
    if by_code:
        print(
            "  代碼分佈:"
            + ", ".join(f"{k}={v}" for k, v in sorted(by_code.items()))
        )

    if errors:
        print(f"\n錯誤({len(errors)}):")
        for e in errors:
            print(f"  ✗ [{e.code}] {Path(e.file_path).name}")
            print(f"      {e.message}")

    if warnings:
        # 群組顯示警告
        print(f"\n警告({len(warnings)}):")
        # 依 code 分組
        by_code_w: dict[str, list[Issue]] = {}
        for w in warnings:
            by_code_w.setdefault(w.code, []).append(w)
        for code in sorted(by_code_w.keys()):
            grp = by_code_w[code]
            sample_msg = grp[0].message if len(grp) > 3 else None
            if sample_msg:
                print(f"  ⚠ [{code}] {len(grp)} 筆 — 例:{sample_msg}")
                for w in grp[:3]:
                    print(f"      {Path(w.file_path).name}")
                if len(grp) > 3:
                    print(f"      ... 另 {len(grp) - 3} 筆")
            else:
                for w in grp:
                    print(f"  ⚠ [{code}] {Path(w.file_path).name}")
                    print(f"      {w.message}")

    print("-" * 60)
    if not errors and not warnings:
        print("✓ 全部通過")
    elif not errors:
        print("✓ 無錯誤(僅警告)")
    else:
        print("✗ 有錯誤,請修正")


# ─────────────────────────────────────────────
# main
# ─────────────────────────────────────────────


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="對 02_markdown/ 做一致性檢查"
    )
    parser.add_argument("--strict", action="store_true", help="任一警告即 exit 3")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )
    log = logging.getLogger("validate")

    if not MARKDOWN_DIR.exists():
        log.error(f"找不到 {MARKDOWN_DIR}")
        return 1

    valid_parents = parse_valid_parents(ID_CONVENTION_PATH)
    if not valid_parents:
        log.warning(f"未能解析 {ID_CONVENTION_PATH.name},母題清單檢查將跳過")

    manifest_stems = load_manifest_filenames(MANIFEST_PATH)
    source_stems = collect_source_filenames(SOURCE_DIR)

    nodes, parse_issues = load_nodes(MARKDOWN_DIR)
    if not nodes and not parse_issues:
        log.warning("02_markdown/ 沒有 MD 檔")
        return 0

    issues = list(parse_issues) + run_checks(
        nodes, valid_parents, manifest_stems, source_stems
    )
    print_report(nodes, issues, valid_parents)

    n_err = sum(1 for i in issues if i.severity == "error")
    n_warn = sum(1 for i in issues if i.severity == "warning")
    if n_err:
        return 2
    if args.strict and n_warn:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
