"""輕量 smoke test — 純 Python,不需 Node/Playwright,可在 CI 跑。

驗證:
  T1  03_index 6 份 JSON 全部可 parse
  T2  nodes.json 節點數 >= 500
  T3  edges.json 邊數 >= 400
  T4  scenarios_manual.json 經 JSON Schema 驗證(若 jsonschema 安裝)
  T5  04_web/index.html 含關鍵函式 / 常數(DATA_VERSION / loadAllData / openDrawer 等)
  T6  city_aliases / country_neighbors / synonyms 可載且非空
  T7  baseline_attachments.json 有 5 組 group key

執行:
    python 05_scripts/_smoke_test.py            # 預設 stdout 輸出
    python 05_scripts/_smoke_test.py --strict   # 任一失敗 exit 2

未來若加 Playwright e2e:
    1. 安裝 Node 18+
    2. npm init -y && npm install -D @playwright/test
    3. 寫 tests/smoke.spec.js 跑 5 條 golden path(載入 / 切 view / 開抽屜 / 試算 / Ctrl+K)
    4. CI 加 actions/setup-node + npx playwright install
"""
from __future__ import annotations
import sys
import re
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX_DIR = ROOT / "03_index"
WEB_DIR = ROOT / "04_web"
DATA_DIR = WEB_DIR / "data"


class TestResult:
    def __init__(self, name: str):
        self.name = name
        self.passed = False
        self.message = ""

    def ok(self, msg=""):
        self.passed = True
        self.message = msg or "ok"

    def fail(self, msg):
        self.passed = False
        self.message = msg


def t1_index_json_parseable() -> TestResult:
    r = TestResult("T1 03_index/*.json 可 parse")
    expected = ["nodes.json", "edges.json", "tags.json", "search_index.json", "_meta.json", "rate_lookup.json"]
    missing, errors = [], []
    for name in expected:
        p = INDEX_DIR / name
        if not p.exists():
            missing.append(name)
            continue
        try:
            json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append(f"{name}: {e}")
    if missing or errors:
        return r.fail(f"missing={missing} errors={errors}") or r
    r.ok(f"全 {len(expected)} 份")
    return r


def t2_nodes_count() -> TestResult:
    r = TestResult("T2 nodes.json >= 500 節點")
    try:
        nodes = json.loads((INDEX_DIR / "nodes.json").read_text(encoding="utf-8"))
        n = len(nodes)
        if n < 500:
            r.fail(f"only {n} nodes")
        else:
            r.ok(f"{n} nodes")
    except Exception as e:
        r.fail(str(e))
    return r


def t3_edges_count() -> TestResult:
    r = TestResult("T3 edges.json >= 400 邊")
    try:
        edges = json.loads((INDEX_DIR / "edges.json").read_text(encoding="utf-8"))
        n = len(edges)
        if n < 400:
            r.fail(f"only {n} edges")
        else:
            r.ok(f"{n} edges")
    except Exception as e:
        r.fail(str(e))
    return r


def t4_scenarios_schema() -> TestResult:
    r = TestResult("T4 scenarios_manual.json schema")
    schema_path = DATA_DIR / "scenarios.schema.json"
    data_path = DATA_DIR / "scenarios_manual.json"
    if not schema_path.exists() or not data_path.exists():
        return r.fail("schema 或 data 不存在") or r
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        r.ok("(jsonschema 未安裝,跳過)")
        return r
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    data = json.loads(data_path.read_text(encoding="utf-8"))
    errs = list(Draft202012Validator(schema).iter_errors(data))
    if errs:
        r.fail(f"{len(errs)} schema errors")
    else:
        r.ok(f"{len(data.get('scenarios', []))} scenarios")
    return r


def t5_index_html_required_constants() -> TestResult:
    r = TestResult("T5 04_web/index.html 關鍵符號")
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    required = [
        ("DATA_VERSION", r"const\s+DATA_VERSION\s*="),
        ("loadAllData", r"function\s+loadAllData\s*\("),
        ("openDrawer", r"function\s+openDrawer\s*\("),
        ("renderRateTableHtml", r"function\s+renderRateTableHtml\s*\("),
        ("LOOKUP_TYPE_RENDERERS", r"const\s+LOOKUP_TYPE_RENDERERS\s*="),
        ("scenarios_manual", r"data/scenarios_manual\.json"),
        ("city_aliases", r"data/city_aliases\.json"),
        ("country_neighbors", r"data/country_neighbors\.json"),
    ]
    missing = [name for name, pat in required if not re.search(pat, html)]
    if missing:
        r.fail(f"missing: {missing}")
    else:
        r.ok(f"全 {len(required)} 個符號存在")
    return r


def t6_data_files_loadable() -> TestResult:
    r = TestResult("T6 04_web/data/*.json 可載")
    files = {
        "synonyms": ("synonyms.json", "groups", 30),
        "city_aliases": ("city_aliases.json", "aliases", 20),
        "country_neighbors": ("country_neighbors.json", "neighbors", 30),
    }
    issues = []
    counts = {}
    for key, (name, field, min_count) in files.items():
        try:
            data = json.loads((DATA_DIR / name).read_text(encoding="utf-8"))
            container = data.get(field) or {}
            n = len(container) if isinstance(container, (list, dict)) else 0
            counts[key] = n
            if n < min_count:
                issues.append(f"{key}: only {n} (need {min_count}+)")
        except Exception as e:
            issues.append(f"{key}: {e}")
    if issues:
        r.fail("; ".join(issues))
    else:
        r.ok(f"counts={counts}")
    return r


def t7_baseline_attachments() -> TestResult:
    r = TestResult("T7 baseline_attachments.json 5 groups")
    try:
        data = json.loads((DATA_DIR / "baseline_attachments.json").read_text(encoding="utf-8"))
        groups = data.get("groups", {})
        expected = {"domestic_trip", "abroad_trip", "voucher_general", "procurement", "honorarium"}
        missing = expected - set(groups.keys())
        if missing:
            r.fail(f"missing groups: {missing}")
        else:
            r.ok(f"{len(groups)} groups")
    except Exception as e:
        r.fail(str(e))
    return r


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--strict", action="store_true", help="任一失敗 exit 2")
    args = p.parse_args()

    tests = [t1_index_json_parseable, t2_nodes_count, t3_edges_count, t4_scenarios_schema,
             t5_index_html_required_constants, t6_data_files_loadable, t7_baseline_attachments]
    print("=" * 60)
    print("Smoke Test — 政府支出法規知識庫")
    print("=" * 60)
    failed = 0
    for f in tests:
        r = f()
        mark = "✓" if r.passed else "✗"
        print(f"  {mark} {r.name}: {r.message}")
        if not r.passed:
            failed += 1
    print("-" * 60)
    print(f"通過 {len(tests) - failed}/{len(tests)}")
    if failed and args.strict:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
