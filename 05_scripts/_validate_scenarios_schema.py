"""對 scenarios_manual.json 跑 JSON Schema 驗證。

使用 jsonschema(若無則 fallback 到輕量手動檢查)。

執行:
    python 05_scripts/_validate_scenarios_schema.py            # 預設輸出 + exit 0/2
    python 05_scripts/_validate_scenarios_schema.py --strict   # 任何錯都 exit 2

CI 步驟:
    - run: pip install jsonschema
    - run: python 05_scripts/_validate_scenarios_schema.py --strict
"""
from __future__ import annotations
import sys
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "04_web" / "data" / "scenarios.schema.json"
DATA_PATH = ROOT / "04_web" / "data" / "scenarios_manual.json"


def validate_with_jsonschema(schema: dict, data: dict) -> list[str]:
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        return ["[skip] jsonschema 未安裝(pip install jsonschema);僅做 fallback 檢查"]
    validator = Draft202012Validator(schema)
    errors: list[str] = []
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        path = "/".join(str(p) for p in err.absolute_path) or "(root)"
        errors.append(f"  {path}: {err.message}")
    return errors


def fallback_check(data: dict) -> list[str]:
    """無 jsonschema 時的最低限度檢查。"""
    errors: list[str] = []
    scenarios = data.get("scenarios")
    if not isinstance(scenarios, list):
        errors.append("  scenarios 非陣列")
        return errors
    seen_ids = set()
    for i, s in enumerate(scenarios):
        if not isinstance(s, dict):
            errors.append(f"  scenarios[{i}] 非物件")
            continue
        sid = s.get("id")
        if not sid:
            errors.append(f"  scenarios[{i}] 缺 id")
        elif sid in seen_ids:
            errors.append(f"  scenarios[{i}] id={sid!r} 重複")
        else:
            seen_ids.add(sid)
        if not s.get("parent"):
            errors.append(f"  scenarios[{sid}] 缺 parent")
        if not s.get("expense"):
            errors.append(f"  scenarios[{sid}] 缺 expense")
        for j, c in enumerate(s.get("caveats", []) or []):
            if c.get("severity") not in ("stop", "warn", "info"):
                errors.append(f"  scenarios[{sid}].caveats[{j}].severity 非 stop/warn/info")
    return errors


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--strict", action="store_true", help="有錯時 exit 2")
    args = p.parse_args()

    if not SCHEMA_PATH.exists():
        print(f"[err] schema 不存在:{SCHEMA_PATH}")
        sys.exit(1)
    if not DATA_PATH.exists():
        print(f"[err] data 不存在:{DATA_PATH}")
        sys.exit(1)

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    errors = validate_with_jsonschema(schema, data)
    if any(e.startswith("[skip]") for e in errors):
        print(errors[0])
        errors = fallback_check(data)
    elif not errors:
        # also run fallback for redundancy
        fb = fallback_check(data)
        # only add fallback errors not already reported
        errors = fb

    n_scenarios = len(data.get("scenarios", []))
    print(f"驗證 scenarios_manual.json — {n_scenarios} 張卡 / schema:{SCHEMA_PATH.name}")
    if errors:
        print(f"❌ 發現 {len(errors)} 項問題:")
        for e in errors:
            print(e)
        if args.strict:
            sys.exit(2)
    else:
        print("✓ 通過 schema 驗證")


if __name__ == "__main__":
    main()
