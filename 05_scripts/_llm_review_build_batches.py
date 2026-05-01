"""LLM 精校 — 切批次:對 review_level=自動初校 節點,讀 body_plain 驗證 summary 準確性。

每筆 record(JSONL,每行一筆):
{
  "id": "...",
  "category": "C",
  "parent": "國內旅費",
  "serial": 6,
  "title": "...",
  "current_summary": "...",         # ← ## 重點摘要 區塊全文(去自動初校尾標)
  "body_excerpt": "...前 1500 字...",
  "tags": [...]
}

執行:
    python 05_scripts/_llm_review_build_batches.py            # 預設批次 30 筆
    python 05_scripts/_llm_review_build_batches.py --clean    # 清舊批次再生
    python 05_scripts/_llm_review_build_batches.py --batch-size 25

輸出:
    05_scripts/_llm_review_proposals/inputs/batch_NN.jsonl
    05_scripts/_llm_review_proposals/manifest.json
    05_scripts/_llm_review_proposals/PROMPT.md   (subagent 用 prompt 模板)
"""
from __future__ import annotations
import sys
import re
import json
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT, MD_ROOT, split_fm, extract_section, first_section, walk_md  # noqa: E402

OUT_DIR = ROOT / "05_scripts" / "_llm_review_proposals"
INPUTS_DIR = OUT_DIR / "inputs"
PROMPT_PATH = OUT_DIR / "PROMPT.md"
MANIFEST_PATH = OUT_DIR / "manifest.json"

BODY_MAX = 1500   # 比 resummary 多一點,因為要驗證準確性

SECTIONS_BY_CAT = {
    "A": ("條文全文",),
    "B": ("標準全文", "條文全文"),
    "C": ("函釋全文", "標準全文"),
    "D": ("問題", "回答"),
}


def clean_excerpt(text: str, limit: int) -> str:
    text = text.strip()
    text = re.sub(r"_\(自動初校,待人工潤飾\)_", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if len(text) > limit:
        text = text[:limit].rstrip() + "…"
    return text


def build_record(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")
    fm, body = split_fm(text)
    if not fm:
        return None
    nid = str(fm.get("id", ""))
    m = re.match(r"^([ABCDN])-([^-]+)-(\d{3})$", nid)
    if not m:
        return None
    category, parent, serial_str = m.group(1), m.group(2), m.group(3)
    # D 類問答集:問題 + 回答 都要(原 first_section 只回第一個,subagent 看不到回答無法驗證)
    if category == "D":
        q = extract_section(body, "問題")
        a = extract_section(body, "回答")
        body_section = (f"【問題】{q}\n\n【回答】{a}" if (q or a) else "").strip()
    else:
        sections = SECTIONS_BY_CAT.get(category, ())
        body_section = first_section(body, sections)
    summary_section = extract_section(body, "重點摘要")
    return {
        "id": nid,
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "type": str(fm.get("type", "")),
        "category": category,
        "parent": parent,
        "serial": int(serial_str),
        "title": str(fm.get("title", "")),
        "current_summary": clean_excerpt(summary_section, 600),
        "body_excerpt": clean_excerpt(body_section, BODY_MAX),
        "tags": fm.get("tags", []) or [],
        "review_level": str(fm.get("review_level", "")),
        "status": str(fm.get("status", "現行")),
    }


def should_skip(rec: dict) -> tuple[bool, str]:
    if rec["status"] == "已廢止":
        return True, "已廢止"
    if rec["review_level"] == "人工":
        return True, "人工(已精校)"
    if rec["review_level"] == "llm精校":
        return True, "已 LLM 精校"
    if rec["review_level"] != "自動初校":
        return True, f"非自動初校(={rec['review_level']!r})"
    if not rec["body_excerpt"]:
        return True, "無內文"
    return False, ""


PROMPT_TEMPLATE = """\
# LLM 精校任務 — 驗證自動初校節點的 summary 準確性

你是政府支出法規知識庫的精校助手。本次任務:逐筆驗證 `current_summary` 是否準確
反映 `body_excerpt` 的內容,並依結果輸出 verdict。

## 核心原則(嚴格遵守)

1. **中立角色** — 不下判斷、不加入無法源依據的內容。summary 只能複述條文/函釋說了什麼,
   不能補實務經驗或個人意見。
2. **法源位階** — A 核心法規 > B 支出標準 > C 解釋函令 > D 問答集。語意不可超越原文。
3. **數字與條件絕對精確** — 金額、天數、百分比、年齡、職等等任何數字必須與 body_excerpt 一致;
   若 summary 寫的數字 body 中找不到 → verdict: fix。
4. **限制詞精確** — 「應」「不得」「得」「以...為限」等用語 body_excerpt 怎麼寫,
   summary 就怎麼寫;不能改弱或改強。

## 三種 verdict

| verdict | 條件 | 動作 |
|---|---|---|
| `pass` | summary 準確、無冗詞、無錯誤 | 不改 summary,僅升 review_level → llm精校 |
| `fix`  | summary 有可校正錯誤(數字錯/詞義偏離/過度推論) | 提供 new_summary;後端會更新內容並升 llm精校 |
| `flag` | 內容無法用 body_excerpt 驗證(body 不完整 / 現有 summary 性質本就模糊) | 不改;標 llm待人工 |

## 輸出格式(嚴格 JSON,逐筆 newline-delimited)

對輸入 batch 中**每一筆** record,輸出**一行** JSON,結構如下:

```
{"id":"A-國內旅費-005","verdict":"pass","reason":"摘要與第五條條文一致"}
{"id":"C-國外旅費-088","verdict":"fix","new_summary":"...","reason":"原摘要把 30% 寫成 50%"}
{"id":"D-國內旅費-016","verdict":"flag","reason":"body 缺結論段,無法驗證"}
```

**禁止**輸出多餘文字、markdown、解釋段落 — 只輸出 N 行 JSON,N = 輸入 record 數。

## summary 寫作規則(verdict=fix 時)

- 長度:30-80 字之間
- 句型:「適用場景 + 核心規定 + 關鍵限制」
- 用語中性化:用「條文規定」「依○○條」「本表規定」,避免「應該」「才能」(除非條文原文如此)
- 不複述全文,只取**最具決策價值**的 2-3 個重點
- 結尾句點全形「。」

## 輸入

每行一筆 JSON,欄位見上方規格。請逐筆處理,不要批次合併。

---

(輸入內容會接在此標記之下;請在你的回應中**只**輸出 N 行 verdict JSON,不含任何解釋)

"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--batch-size", type=int, default=30)
    ap.add_argument("--clean", action="store_true")
    args = ap.parse_args()

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
        skip, reason = should_skip(rec)
        if skip:
            skipped[reason] = skipped.get(reason, 0) + 1
            continue
        candidates.append(rec)

    print(f"候選(自動初校 + 有內文):{len(candidates)} 份")
    for k, v in sorted(skipped.items(), key=lambda x: -x[1]):
        print(f"  跳過({k}):{v}")
    if errors:
        print(f"  解析失敗:{errors}")

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
        "version": "2026-05-01",
        "total_candidates": len(candidates),
        "batch_size": args.batch_size,
        "batch_count": len(batches),
        "batches": batches,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\n已寫出 {len(batches)} 批次至 {INPUTS_DIR.relative_to(ROOT)}")
    print(f"  manifest: {MANIFEST_PATH.relative_to(ROOT)}")
    print(f"  prompt:   {PROMPT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
