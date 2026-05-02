"""
_cross_topic_build_batches.py — 跨母題歸屬驗證批次準備（Sonnet）

驗證每個節點的 parent（母題）欄位是否正確。目前母題：
  國內旅費 / 國外旅費 / 支出憑證與結報 / 酬勞費

候選條件
--------
  - status != 已廢止
  - 尚未有 cross_topic_verified: true（確認過歸屬的跳過）
  - 有足夠內文（body_excerpt > 50 字）

verdicts
--------
  confirm          : 目前 parent 正確
  suggest:<母題>   : 建議改歸到指定母題（如 suggest:酬勞費）
  flag             : 無法確定，請人工判斷

用法
----
  python 05_scripts/_cross_topic_build_batches.py
  python 05_scripts/_cross_topic_build_batches.py --batch-size 5
  python 05_scripts/_cross_topic_build_batches.py --cat C
  python 05_scripts/_cross_topic_build_batches.py --clean
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

OUT_DIR    = ROOT / "05_scripts" / "_cross_topic_proposals"
INPUTS_DIR = OUT_DIR / "inputs"
PROMPT_PATH   = OUT_DIR / "PROMPT.md"
MANIFEST_PATH = OUT_DIR / "manifest.json"

BODY_MAX = 1000  # 跨母題判斷不需要全文

KNOWN_PARENTS = [
    "國內旅費", "國外旅費", "支出憑證與結報", "酬勞費",
]

SECTIONS_BY_CAT = {
    "A": ("條文全文",),
    "B": ("標準全文", "條文全文"),
    "C": ("函釋全文",),
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
        "source": str(fm.get("source", "")).strip(),
        "status": str(fm.get("status", "現行")),
        "cross_topic_verified": bool(fm.get("cross_topic_verified", False)),
        "pending_relocation": bool(fm.get("pending_relocation", False)),
        "body_excerpt": excerpt,
    }


def should_skip(rec: dict) -> tuple[bool, str]:
    if rec["status"] == "已廢止":
        return True, "已廢止"
    if rec["cross_topic_verified"]:
        return True, "cross_topic_verified=true"
    # 已標記待遷移的跳過（人工已知問題）
    if rec["pending_relocation"]:
        return True, "pending_relocation=true（人工已知）"
    if len(rec["body_excerpt"]) < 50:
        return True, "內文過短(<50字)"
    # parent 不在已知清單的（可能是新母題或格式異常）跳過
    if rec["parent"] not in KNOWN_PARENTS:
        return True, f"parent={rec['parent']!r}(不在已知母題清單)"
    return False, ""


PROMPT_TEMPLATE = """\
# 跨母題歸屬驗證任務（Sonnet 模型）

你是政府支出法規知識庫的母題分類審核員。
本知識庫目前有四個母題（類別）：
  - **國內旅費**：國內出差交通費、住宿費、雜費等
  - **國外旅費**：出國進修/出差生活費、機票、保險費等
  - **支出憑證與結報**：發票、收據、核銷程序、支出憑證處理要點等
  - **酬勞費**：講座鐘點費、出席費、稿費、兼職費、補充保費等

請對每一筆 record 判斷其 `parent`（目前母題）是否正確，輸出 verdict。

## 三種 verdict

| verdict | 說明 |
|---|---|
| `confirm` | 目前 parent 正確 |
| `suggest:<母題>` | 建議改歸到指定母題，如 `suggest:酬勞費` |
| `flag` | 橫跨多個母題、難以確定，請人工判斷 |

## 輸出格式（嚴格 JSON，逐筆 newline-delimited）

每筆對應一行，如：
```
{"id":"C-國內旅費-155","verdict":"confirm","reason":"內容確實為國內出差交通費解釋函"}
{"id":"A-酬勞費-005","verdict":"suggest:支出憑證與結報","reason":"全文為二代健保補充保費，屬結報程序而非酬勞費本身"}
{"id":"C-支出憑證與結報-099","verdict":"flag","reason":"涉及國內旅費與憑證雙主題，無法單一歸屬"}
```

**禁止**輸出多餘文字。只輸出 N 行 JSON，N = 輸入 record 數。

## 注意

- C 類解釋函令與 D 類問答集可能涉及多個主題，以**主要內容**決定歸屬
- `suggest` 只能用四個已知母題之一（不可發明新母題）
- 目前資料庫**未**含加班費/公務車輛/教育部等母題，若內容屬這些範疇請判 `flag`
- 依規則`pending_relocation=true`的已由人工標記，本批次不會出現此類記錄

---

（輸入接在此標記之後；請只輸出 N 行 verdict JSON）

"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--batch-size", type=int, default=5)
    ap.add_argument("--cat",   default="", help="限定類別 A/B/C/D（逗號分隔）")
    ap.add_argument("--clean", action="store_true", help="清除舊批次")
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

    print(f"候選（待驗證母題歸屬）：{len(candidates)} 份")
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
