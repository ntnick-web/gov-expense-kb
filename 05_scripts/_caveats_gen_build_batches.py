"""
_caveats_gen_build_batches.py — 情境卡 Caveats 生成批次準備（Sonnet）

從情境卡的 primary_ids 條文全文中提取禁止/限制/注意事項，
生成 caveats: [{text, severity, legal_ref}] 陣列。

候選條件
--------
  - scenarios_manual.json 中 deprecated != true 的情境
  - caveats 欄位不存在或為空列表
  - primary_ids 至少有一個存在於 02_markdown/

用法
----
  python 05_scripts/_caveats_gen_build_batches.py
  python 05_scripts/_caveats_gen_build_batches.py --batch-size 5
  python 05_scripts/_caveats_gen_build_batches.py --parent 國內旅費
  python 05_scripts/_caveats_gen_build_batches.py --clean
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import (  # noqa: E402
    ROOT, MD_ROOT, split_fm, first_section, extract_section, walk_md
)

SCENARIOS_PATH = ROOT / "04_web" / "data" / "scenarios_manual.json"
OUT_DIR    = ROOT / "05_scripts" / "_caveats_proposals"
INPUTS_DIR = OUT_DIR / "inputs"
PROMPT_PATH   = OUT_DIR / "PROMPT.md"
MANIFEST_PATH = OUT_DIR / "manifest.json"

NODE_BODY_MAX = 1200  # 每個節點取前 N 字供 LLM 判斷

SECTIONS_BY_CAT = {
    "A": ("條文全文",),
    "B": ("標準全文", "條文全文"),
    "C": ("函釋全文",),
    "D": ("問題", "回答"),
}


def load_node_bodies(primary_ids: list[str], id_to_path: dict[str, Path]) -> list[dict]:
    """載入 primary_ids 對應節點的 title + body_excerpt。"""
    results = []
    for nid in primary_ids:
        path = id_to_path.get(nid)
        if not path:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        fm, body = split_fm(text)
        if not fm:
            continue
        cat = nid.split("-")[0] if "-" in nid else "A"
        if cat == "D":
            q = extract_section(body, "問題")
            a = extract_section(body, "回答")
            excerpt = (f"【問題】{q}\n\n【回答】{a}" if (q or a) else body[:NODE_BODY_MAX]).strip()
        else:
            sections = SECTIONS_BY_CAT.get(cat, ())
            excerpt = first_section(body, sections) or body
        excerpt = re.sub(r"\n{3,}", "\n\n", excerpt.strip())
        if len(excerpt) > NODE_BODY_MAX:
            excerpt = excerpt[:NODE_BODY_MAX].rstrip() + "…"
        results.append({
            "id": nid,
            "title": str(fm.get("title", "")).strip(),
            "type": str(fm.get("type", "")).strip(),
            "body_excerpt": excerpt,
        })
    return results


def build_id_to_path() -> dict[str, Path]:
    out: dict[str, Path] = {}
    for f in walk_md():
        try:
            text = f.read_text(encoding="utf-8")
        except OSError:
            continue
        fm, _ = split_fm(text)
        if fm and (nid := str(fm.get("id", ""))):
            out[nid] = f
    return out


def build_record(sc: dict, id_to_path: dict[str, Path]) -> dict | None:
    sc_id = sc.get("id", "")
    primary_ids = sc.get("primary_ids") or []
    node_bodies = load_node_bodies(primary_ids, id_to_path)
    if not node_bodies:
        return None  # 無法取得任何法源全文，跳過
    return {
        "id": sc_id,
        "title": sc.get("title", ""),
        "subtitle": sc.get("subtitle", ""),
        "parent": sc.get("parent", ""),
        "expense": sc.get("expense", ""),
        "primary_ids": primary_ids,
        "existing_caveats": sc.get("caveats") or [],
        "node_bodies": node_bodies,
    }


def should_skip(sc: dict) -> tuple[bool, str]:
    if sc.get("deprecated"):
        return True, "deprecated=true"
    caveats = sc.get("caveats") or []
    if isinstance(caveats, list) and len(caveats) >= 3:
        return True, f"已有 {len(caveats)} 條 caveats"
    return False, ""


PROMPT_TEMPLATE = """\
# Caveats 生成任務（Sonnet 模型）

你是政府支出法規知識庫的情境卡內容編輯。
本任務：從情境卡的 `primary_ids` 法源條文（`node_bodies`）中，
提取**明確禁止事項、限制條件、注意事項**，生成 `caveats` 陣列。

## 核心原則（嚴格遵守）

1. **每一條 caveats 必須有法源依據**：`legal_ref` 必須是 `primary_ids` 中真實存在的節點 ID。
2. **不得補充無法源的實務知識**：只從 `body_excerpt` 內容提取，不靠背景知識補充。
3. **中立角色**：用語須中性，用「條文規定...」「依...條...」，
   避免「應該...」「必須...」（除非條文原文如此）。
4. **caveats 是「紅線/注意」，不是說明文字**：只寫限制、禁止、例外條件，
   一般流程說明不放這裡。

## 三種 severity

| severity | 說明 | 範例 |
|---|---|---|
| `stop` | 硬性禁止（條文寫「不得」「不准」「禁止」）| 不得超過上限 |
| `warn` | 需特別注意的條件（例外、限制情境）| 須事前核准 |
| `info` | 補充資訊（流程提醒、計算基準）| 以機關所在地為計算起點 |

## 輸出格式（嚴格 JSON，逐筆 newline-delimited）

每筆情境對應一行 JSON：

```
{"id":"overnight","caveats":[{"text":"住宿 < 60 公里原則不得報支","severity":"stop","legal_ref":"A-國內旅費-009"},{"text":"假日含放假日前一天","severity":"warn","legal_ref":"A-國內旅費-008"}],"reason":"從 A-009 提取禁止規定 + A-008 假日定義"}
{"id":"taxi","caveats":[{"text":"公民營客運可達區計程車原則不得報支","severity":"stop","legal_ref":"A-國內旅費-005"}],"reason":"A-005 明文限制"}
```

**禁止**輸出多餘文字。只輸出 N 行 JSON，N = 輸入 record 數。

## 品質要求

- 每張情境卡建議輸出 1-4 條 caveats（過多反而失焦）
- text 限 50 字以內（精簡）
- 若法源中找不到明確的禁止/限制，輸出 `"caveats":[]`（空陣列，不要硬湊）
- 若情境卡 `existing_caveats` 已有部分內容，不必重複；補充未涵蓋的即可

---

（輸入接在此標記之後；請只輸出 N 行 verdict JSON）

"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--parent", default="", help="限定母題（逗號分隔）")
    ap.add_argument("--clean", action="store_true", help="清除舊批次")
    args = ap.parse_args()

    parents = [p.strip() for p in args.parent.split(",") if p.strip()]

    if not SCENARIOS_PATH.exists():
        print(f"[err] 找不到 {SCENARIOS_PATH.relative_to(ROOT)}")
        return 1

    data = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    all_scenarios = data.get("scenarios", [])
    print(f"情境卡總數：{len(all_scenarios)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    INPUTS_DIR.mkdir(parents=True, exist_ok=True)
    if args.clean:
        for p in INPUTS_DIR.glob("batch_*.jsonl"):
            p.unlink()

    print("建立節點 id → path map…")
    id_to_path = build_id_to_path()
    print(f"  {len(id_to_path)} 個節點")

    candidates: list[dict] = []
    skipped: dict[str, int] = {}
    for sc in all_scenarios:
        if parents and sc.get("parent", "") not in parents:
            continue
        skip, reason = should_skip(sc)
        if skip:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        rec = build_record(sc, id_to_path)
        if rec is None:
            skipped["無法取得法源全文"] = skipped.get("無法取得法源全文", 0) + 1
            continue
        candidates.append(rec)

    print(f"候選（需補 caveats 情境）：{len(candidates)} 張")
    for k, v in sorted(skipped.items(), key=lambda x: -x[1]):
        print(f"  跳過（{k}）：{v}")

    batches: list[dict] = []
    for i in range(0, len(candidates), args.batch_size):
        batch_no = i // args.batch_size + 1
        chunk = candidates[i:i + args.batch_size]
        out_path = INPUTS_DIR / f"batch_{batch_no:02d}.jsonl"
        with out_path.open("w", encoding="utf-8", newline="\n") as fh:
            for rec in chunk:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        batches.append({
            "batch": batch_no,
            "count": len(chunk),
            "first_id": chunk[0]["id"],
            "last_id": chunk[-1]["id"],
            "input_path": str(out_path.relative_to(ROOT)).replace("\\", "/"),
        })

    PROMPT_PATH.write_text(PROMPT_TEMPLATE, encoding="utf-8")

    manifest = {
        "version": "2026-05-02",
        "model_hint": "sonnet",
        "total_candidates": len(candidates),
        "batch_size": args.batch_size,
        "batch_count": len(batches),
        "batches": batches,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\n已寫出 {len(batches)} 批次至 {INPUTS_DIR.relative_to(ROOT)}")
    print(f"  manifest : {MANIFEST_PATH.relative_to(ROOT)}")
    print(f"  prompt   : {PROMPT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
