"""
_flow_gen_build_batches.py — 情境卡 Decision Tree 生成批次準備（Sonnet / Opus）

從情境卡的 primary_ids 條文全文生成 flow: {start, questions, conclusions} 決策樹。

候選條件
--------
  - scenarios_manual.json 中 deprecated != true 的情境
  - flow 欄位不存在
  - primary_ids 至少有一個存在於 02_markdown/
  - 非 flow_root（root 卡不需要獨立 flow，靠子情境組合）

模型選擇
--------
  --model sonnet  (預設)：適合 ≤8 個問題的常見費目情境
  --model opus    ：適合 >8 問題、法規條件複雜、多分支的情境

用法
----
  python 05_scripts/_flow_gen_build_batches.py
  python 05_scripts/_flow_gen_build_batches.py --model opus
  python 05_scripts/_flow_gen_build_batches.py --batch-size 4
  python 05_scripts/_flow_gen_build_batches.py --parent 國外旅費
  python 05_scripts/_flow_gen_build_batches.py --clean
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
OUT_DIR    = ROOT / "05_scripts" / "_flow_proposals"
INPUTS_DIR = OUT_DIR / "inputs"
PROMPT_PATH   = OUT_DIR / "PROMPT.md"
MANIFEST_PATH = OUT_DIR / "manifest.json"

NODE_BODY_MAX = 1500  # 決策樹需要更完整的條文

SECTIONS_BY_CAT = {
    "A": ("條文全文",),
    "B": ("標準全文", "條文全文"),
    "C": ("函釋全文",),
    "D": ("問題", "回答"),
}


def load_node_bodies(primary_ids: list[str], id_to_path: dict[str, Path]) -> list[dict]:
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
        return None
    return {
        "id": sc_id,
        "title": sc.get("title", ""),
        "subtitle": sc.get("subtitle", ""),
        "parent": sc.get("parent", ""),
        "expense": sc.get("expense", ""),
        "primary_ids": primary_ids,
        "caveats": sc.get("caveats") or [],
        "attachments": sc.get("attachments") or [],
        "node_bodies": node_bodies,
    }


def should_skip(sc: dict) -> tuple[bool, str]:
    if sc.get("deprecated"):
        return True, "deprecated=true"
    if sc.get("flow"):
        return True, "已有 flow"
    if sc.get("flow_root"):
        return True, "flow_root=true（根節點不需獨立 flow）"
    return False, ""


PROMPT_TEMPLATE = """\
# Decision Tree 生成任務（Sonnet / Opus 模型）

你是政府支出法規知識庫的情境卡決策樹設計師。
本任務：根據情境卡的法源條文（`node_bodies`），設計一棵決策樹 `flow`，
幫助使用者透過問答判斷自己的出差/核銷情形適用哪個規定。

## 核心原則（嚴格遵守）

1. **所有 refs 必須是真實節點 ID**：只能用 `primary_ids` 中列出的節點 ID。
2. **conclusion.note 只引用原文**：不推論、不補充，只從 `body_excerpt` 複述。
3. **中立角色**：結論的 limit/note 用「條文規定...」「依...條...」，
   不下判斷（「應該」「必須」除條文原文如此用語外應避免）。
4. **不超過 8 個問題**（若情境複雜到需要更多，請改用 Opus 模型處理）。

## Flow 結構規格

```json
{
  "start": "Q1",
  "questions": {
    "Q1": {
      "label": "問題文字（15-30 字）",
      "hint": "補充說明（可選，20 字以內）",
      "options": [
        {"label": "選項文字（5-15 字）", "next": "Q2"},
        {"label": "選項文字", "conclude": "C1"}
      ]
    }
  },
  "conclusions": {
    "C1": {
      "title": "結論標題（10-25 字）",
      "limit": "金額上限或適用條件（20-40 字）",
      "note": "引用條文的規定（30-80 字，直接引用原文）",
      "refs": ["A-國內旅費-005"]
    }
  }
}
```

## 設計要求

- 問題要能**真正幫助使用者判斷**自身情境，不是重複已知資訊
- 每個問題的選項要**互斥且完整**（覆蓋所有情況）
- 結論要**可操作**（知道可以報什麼、上限多少）
- 若情境只有一個顯然結論（例如「核算公里費」），也可以只有 1 個問題 + 1-2 個結論

## 輸出格式（嚴格 JSON，逐筆 newline-delimited）

每筆對應一行 JSON：

```
{"id":"taxi","flow":{"start":"Q1","questions":{...},"conclusions":{...}},"reason":"從 A-005 提取 3 種計程車情境"}
{"id":"incidental","flow":{"start":"Q1","questions":{...},"conclusions":{...}},"reason":"依雜費上限表設計"}
```

**禁止**輸出多餘文字。只輸出 N 行 JSON，N = 輸入 record 數。

## 若條文不足以設計有意義的決策樹

輸出 `"flow": null` 並在 reason 說明原因（apply 端遇到 null 會跳過此情境）。

---

（輸入接在此標記之後；請只輸出 N 行 verdict JSON）

"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--batch-size", type=int, default=5)
    ap.add_argument("--model", choices=["sonnet", "opus"], default="sonnet",
                    help="Sonnet（預設）或 Opus（複雜多分支情境）")
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

    print(f"候選（需建立 flow 情境）：{len(candidates)} 張（模型：{args.model}）")
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
        "model_hint": args.model,
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
    print(f"\n  模型提示：{args.model.upper()}")
    print(f"  ⚠ 複雜情境（>8 問題）建議重跑：--model opus")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
