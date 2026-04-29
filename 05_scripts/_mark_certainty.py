"""_mark_certainty.py — Phase 4:標記 certainty 與 disclaimer_level。

規則式偵測「inferred / contested」訊號詞(無 LLM,免費快速)。
其餘節點預設 `explicit`(法規明文)+ `disclaimer_level: standard`。

偵測規則
--------

inferred(法規精神推論,無明文)
- 摘要/內文含:「依個案認定」「視情況認定」「機關自行決定」「機關權責」「機關核處」
  「主計室審核」「核實認定」「斟酌」「酌處」
- 函釋類常見「應由...機關認定」「以...判斷」這類授權語

contested(實務有爭議或各機關解釋不一)
- 摘要/內文含:「實務見解不一」「各機關認定有別」「目前未統一」「函釋疑義」
  「修正意見不一」「待釐清」
- 同主題反覆出現的函釋(如同一條文有 3+ 解釋)→ contested

disclaimer_level
----------------
- explicit  → standard
- inferred  → strong
- contested → strong

也產 `no_inference_note` 預設值(可後續手動覆寫)。

用法
----
    python 05_scripts/_mark_certainty.py            # dry-run + 統計
    python 05_scripts/_mark_certainty.py --apply
    python 05_scripts/_mark_certainty.py --csv      # 加 review.csv
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"
OUT_CSV = ROOT / "05_scripts" / "_certainty_review.csv"


# ─────────────────────────────────────────────
# 規則
# ─────────────────────────────────────────────

# inferred:依法規精神推論 / 機關權責認定
INFERRED_KEYWORDS = [
    "依個案認定", "視情況認定", "視個案", "視情形",
    "機關自行決定", "機關權責認定", "機關權責", "機關核處",
    "主計室審核", "主計室認定", "主計室核實", "主計部門認定",
    "由機關認定", "由各機關依", "依機關權責",
    "覈實認定", "斟酌辦理", "酌處", "酌定", "酌予",
    "視實際情形", "視業務需要", "依需要決定",
]

# contested:實務有爭議 / 各機關解釋不一
CONTESTED_KEYWORDS = [
    "實務見解不一", "見解不一", "各機關解釋不一", "各機關認定有別",
    "目前未統一", "尚未統一", "未有定論",
    "函釋疑義未明", "尚有疑義", "待釐清", "待確認",
    "修正意見不一", "意見分歧",
    # 修法草案/未明確規範
    "修法中", "草案",
]

# 即使命中 inferred/contested 詞,但若 title 含這些「明文設定」型 keyword
# → 還是算 explicit(法規本身定的就是「機關自訂」是 explicit)
EXPLICIT_OVERRIDE = (
    "立法目的", "適用範圍", "用語定義", "彙編更新",
    "主管機關自訂",  # 法規明文授權自訂
    "標準表", "費率表", "支給表",
)

# C 類函釋常見的「明確結論」訊號(覆蓋 inferred 推斷)
CLEAR_CONCLUSION_PATTERNS = [
    r"應[^。]{2,15}(辦理|報支|檢附|不得)",
    r"得[^。]{2,15}(報支|檢附|代替)",
    r"不得[^。]{2,15}(重複|逾|超過)",
]

DEFAULT_INFERRED_NOTE = (
    "此情形依機關權責或實務認定,本站僅彙整法規條文,實際結果以主計室認定為準。"
)
DEFAULT_CONTESTED_NOTE = (
    "此情形實務見解不一或法規未明確規範,本站不提供判斷,請逕洽主計室確認。"
)


def split_fm(text: str):
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


def render_fm(fm: dict) -> str:
    return yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False).strip()


def extract_section(body: str, heading: str) -> str:
    pattern = rf"(?ms)^##\s*{re.escape(heading)}\s*\n(.+?)(?=^##\s|\Z)"
    m = re.search(pattern, body)
    return m.group(1).strip() if m else ""


def detect_certainty(title: str, summary: str, body: str) -> tuple[str, str]:
    """偵測 certainty 與 reason。回傳 (level, reason)。"""
    # 1. EXPLICIT_OVERRIDE — 某些 meta 條文即使用詞模糊,法規本身就是 explicit
    if any(p in title for p in EXPLICIT_OVERRIDE):
        return "explicit", "meta-rule (override)"

    text = title + " " + summary + " " + body[:1500]

    # 2. contested 比 inferred 強,先檢
    contested_hits = [k for k in CONTESTED_KEYWORDS if k in text]
    if contested_hits:
        return "contested", f"contested keyword: {contested_hits[0]}"

    # 3. inferred
    inferred_hits = [k for k in INFERRED_KEYWORDS if k in text]
    if inferred_hits:
        # 但若同時有「明確結論」訊號 → 還是 explicit
        for pat in CLEAR_CONCLUSION_PATTERNS:
            if re.search(pat, summary):
                return "explicit", f"inferred keyword '{inferred_hits[0]}' 但有明確結論"
        return "inferred", f"inferred keyword: {inferred_hits[0]}"

    # 4. fallback
    return "explicit", "default"


def disclaimer_level_for(certainty: str) -> str:
    return "standard" if certainty == "explicit" else "strong"


def default_note_for(certainty: str) -> str | None:
    if certainty == "inferred":
        return DEFAULT_INFERRED_NOTE
    if certainty == "contested":
        return DEFAULT_CONTESTED_NOTE
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--csv", action="store_true")
    ap.add_argument("--show", type=int, default=15, help="顯示前 N 筆 sample")
    args = ap.parse_args()

    if not MD_DIR.exists():
        print(f"找不到 {MD_DIR}", file=sys.stderr)
        return 1

    files = sorted(MD_DIR.rglob("*.md"))
    print(f"掃描 {len(files)} 份 MD")
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print("─" * 100)

    stats: Counter[str] = Counter()
    rows: list[dict] = []

    for f in files:
        text = f.read_text(encoding="utf-8")
        fm, body = split_fm(text)
        if not fm:
            continue

        title = str(fm.get("title", ""))
        summary = extract_section(body, "重點摘要").strip()
        # strip 自動初校標記
        summary = re.sub(r"_\(自動初校,待人工潤飾\)_", "", summary).strip()

        certainty, reason = detect_certainty(title, summary, body)
        disclaimer = disclaimer_level_for(certainty)
        note = default_note_for(certainty)

        old_certainty = fm.get("certainty")
        changed = (
            old_certainty != certainty
            or fm.get("disclaimer_level") != disclaimer
            or (note and fm.get("no_inference_note") != note)
        )

        stats[certainty] += 1
        if changed:
            rows.append({
                "id": fm.get("id"),
                "title": title,
                "old_certainty": old_certainty or "(無)",
                "new_certainty": certainty,
                "disclaimer": disclaimer,
                "reason": reason,
                "path": str(f.relative_to(ROOT)).replace("\\", "/"),
            })
            if args.apply:
                fm["certainty"] = certainty
                fm["disclaimer_level"] = disclaimer
                if note:
                    fm["no_inference_note"] = note
                else:
                    fm.pop("no_inference_note", None)
                new_text = "---\n" + render_fm(fm) + "\n---\n\n" + body.lstrip("\n")
                new_text = new_text.rstrip() + "\n"
                f.write_text(new_text, encoding="utf-8", newline="\n")

    print(f"\nCertainty 分布:")
    for k in ("explicit", "inferred", "contested"):
        print(f"  {k}: {stats[k]}")

    print(f"\n變動 {len(rows)} 筆 — 前 {min(args.show, len(rows))} 筆:")
    for r in rows[:args.show]:
        if r["new_certainty"] != "explicit":
            tag = "⚠"
        else:
            tag = "·"
        print(f"  {tag} {r['id']}  {r['old_certainty']} → {r['new_certainty']:9s}  {r['title'][:25]}  ({r['reason']})")

    if args.csv:
        with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["id", "title", "old_certainty",
                                               "new_certainty", "disclaimer",
                                               "reason", "path"])
            w.writeheader()
            for r in rows:
                w.writerow(r)
        print(f"\n對照表:{OUT_CSV}")

    if not args.apply:
        print("\n[DRY-RUN] 加 --apply 寫入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
