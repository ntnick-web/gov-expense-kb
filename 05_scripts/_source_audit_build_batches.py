"""
_source_audit_build_batches.py — 來源品質審查批次準備（Haiku）

將「尚未確認來源品質 OK」的節點切成 batch_NN.jsonl，
供 Claude Code subagent 以 Haiku 模型逐批判斷。

規則式 _source_audit.py 的補強：LLM 用於發現規則難以捕捉的邊界案例：
  - 修正對照表（只有 1 個信號，未觸發規則閾值 2）
  - 輕微截斷（省略號不在結尾，但語意明顯中斷）
  - 內容空洞（有文字但無實質規定，僅為目次或前言）

候選條件
--------
  - status != 已廢止
  - source_quality 未設或 == 'warning'（規則式未確認 OK 者）
  - 有足夠內文（body_excerpt 非空，> 30 字）

用法
----
  python 05_scripts/_source_audit_build_batches.py
  python 05_scripts/_source_audit_build_batches.py --batch-size 20
  python 05_scripts/_source_audit_build_batches.py --clean
  python 05_scripts/_source_audit_build_batches.py --cat A,B
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

OUT_DIR    = ROOT / "05_scripts" / "_source_audit_proposals"
INPUTS_DIR = OUT_DIR / "inputs"
PROMPT_PATH    = OUT_DIR / "PROMPT.md"
MANIFEST_PATH  = OUT_DIR / "manifest.json"

BODY_MAX = 1200  # 來源品質判斷不需要全文，取前 1200 字足夠

SECTIONS_BY_CAT = {
    "A": ("條文全文",),
    "B": ("標準全文", "條文全文"),
    "C": ("函釋全文", "標準全文"),
    "D": ("問題", "回答"),
}


def _body_excerpt(category: str, body: str) -> str:
    if category == "D":
        q = extract_section(body, "問題")
        a = extract_section(body, "回答")
        text = (f"【問題】{q}\n\n【回答】{a}" if (q or a) else body[:BODY_MAX]).strip()
    else:
        sections = SECTIONS_BY_CAT.get(category, ())
        text = first_section(body, sections) or body
    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    if len(text) > BODY_MAX:
        text = text[:BODY_MAX].rstrip() + "…"
    return text


def build_record(path: Path) -> dict | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    fm, body = split_fm(text)
    if not fm:
        return None
    node_id = str(fm.get("id", ""))
    m = re.match(r"^([ABCDN])-(.+)-(\d{3})$", node_id)
    if not m:
        return None
    category, parent, serial_str = m.group(1), m.group(2), m.group(3)
    excerpt = _body_excerpt(category, body)
    return {
        "id": node_id,
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "category": category,
        "parent": parent,
        "serial": int(serial_str),
        "title": str(fm.get("title", "")).strip(),
        "type": str(fm.get("type", "")).strip(),
        "status": str(fm.get("status", "現行")),
        "source_quality": str(fm.get("source_quality", "")).strip(),
        "body_excerpt": excerpt,
    }


def should_skip(rec: dict) -> tuple[bool, str]:
    if rec["status"] == "已廢止":
        return True, "已廢止"
    if rec["source_quality"] == "ok":
        return True, "source_quality=ok(已確認)"
    # 已確認有問題的也不必重送（規則式已標記，LLM 不會推翻嚴重問題）
    if rec["source_quality"] in ("amendment_only", "truncated", "placeholder",
                                  "rate_table_only"):
        return True, f"source_quality={rec['source_quality']}(已標記問題)"
    if len(rec["body_excerpt"]) < 30:
        return True, "內文過短(<30字)"
    return False, ""


PROMPT_TEMPLATE = """\
# 來源品質審查任務（Haiku 模型）

你是政府支出法規知識庫的來源品質檢核助手。
請對每一筆 record 判斷其 `body_excerpt` 的內容品質，輸出 verdict。

## 五種 verdict

| verdict | 說明 |
|---|---|
| `ok` | 內容完整、有實質規定，無明顯截斷或修正對照 |
| `amendment_only` | 主要是修正對照表（「修正規定」「現行規定」「修正前」「修正後」欄位），缺乏現行完整條文 |
| `truncated` | 內容明顯截斷，語意不完整（省略號、「以下略」、條文僅列部分） |
| `placeholder` | 內容為待補/TODO/僅有標題無正文 |
| `rate_table_only` | A 類核心法規卻只有費率表，無條次結構（B 類費率表請判 ok） |

## 輸出格式（嚴格 JSON，逐筆 newline-delimited）

每一筆 record 對應輸出**一行** JSON：

```
{"id":"A-國內旅費-005","verdict":"ok","reason":"完整條文，有第五條規定"}
{"id":"C-國外旅費-099","verdict":"amendment_only","reason":"全文為修正對照表格"}
```

**禁止**輸出多餘文字、markdown、解釋段落。只輸出 N 行 JSON，N = 輸入 record 數。

## 注意

- B 類費率表（`category=B`）如果只有費率行列，請判 `ok`（費率表是其正常形式）
- D 類問答集若「問題」有、「回答」空，判 `placeholder`
- 摘要標記 `_(自動初校,待人工潤飾)_` 是系統標記，不影響品質判斷
- 若 body_excerpt 有「…」截斷符但語意看起來仍完整，判 `ok`；若截斷導致規定不完整，判 `truncated`

---

（輸入接在此標記之後；請在你的回應中**只**輸出 N 行 verdict JSON）

"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--batch-size", type=int, default=30)
    ap.add_argument("--cat",   default="", help="限定類別 A/B/C/D（逗號分隔）")
    ap.add_argument("--clean", action="store_true", help="清除舊批次再重建")
    args = ap.parse_args()

    cats = [c.strip().upper() for c in args.cat.split(",") if c.strip()]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    INPUTS_DIR.mkdir(parents=True, exist_ok=True)
    if args.clean:
        for p in INPUTS_DIR.glob("batch_*.jsonl"):
            p.unlink()

    files = list(walk_md())
    print(f"掃描 {len(files)} 份 MD")

    candidates: list[dict] = []
    skipped: dict[str, int] = {}
    errors = 0
    for f in files:
        rec = build_record(f)
        if not rec:
            errors += 1
            continue
        if cats and rec["category"] not in cats:
            continue
        skip, reason = should_skip(rec)
        if skip:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        candidates.append(rec)

    print(f"候選（未確認來源品質）：{len(candidates)} 份")
    for k, v in sorted(skipped.items(), key=lambda x: -x[1]):
        print(f"  跳過（{k}）：{v}")
    if errors:
        print(f"  解析失敗：{errors}")

    candidates.sort(key=lambda r: (r["category"], r["parent"], r["serial"]))

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
        "model_hint": "haiku",
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
