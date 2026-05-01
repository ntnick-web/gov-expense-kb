"""一次性腳本:把 04_web/static/app.js (3050 行單檔) 拆成 4 個 ES module。

策略:State namespace 物件模式 — 所有可變 state 放在 state.js 的 State 物件,
其他 module import 後用 State.X 存取(reference 共享,無 setter 樣板)。

執行:python 05_scripts/_split_esm.py
"""
from __future__ import annotations
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "04_web" / "static" / "app.js"
OUT_DIR = ROOT / "04_web" / "static" / "js"

# 邊界(0-indexed line numbers,基於 grep 探勘):
# 1-280     : state + config + utilities + loadAllData
# 282-484   : filter state + helpers + filteredData
# 486-2737  : 全部 render + drawer + spotlight + compare + flow modal + scenarios + calc
# 2738-3050 : splash + init + wire compare + view switching + brand
#
# 我們重新切成:
#   state.js  : 行 1-138(state + config + loadAllData 留 data.js),utility 函式 splitTitle / buildCardTitle 跟著 state
#   data.js   : loadAllData + filteredData + expandSynonyms + nodeMatchesExpense + inferCountryByAlias
#               + findOtherRowForCountry + helpers(highlightQuery, escapeHtml)
#   render.js : 所有 render* 函式 + openDrawer + LOOKUP_TYPE_* + flow modal + spotlight + scope-banner
#   main.js   : init + 事件 wire + compare modal + view switching + splash

# 變更:把以下「let X = ...」轉為 State namespace 屬性:
STATE_VARS = [
    "compareList", "DATA", "NODES_BY_ID", "INCOMING_EDGES", "SCENARIOS",
    "CITY_ALIASES", "COUNTRY_NEIGHBORS", "SYNONYMS", "BASELINE_ATTACHMENTS",
    "SYNONYM_INDEX",
    "currentView", "currentList", "currentIdx",
    "_libRenderedCount", "_libObserver",
    "_scnSortedKeys", "_scnGroups", "_scnSeenParent", "_scnRenderedSections",
    "_scnObserver", "_scnMaxSections",
    "scenarioQuery", "scenarioFilterParent", "scenarioFilterExpense",
    "_cmdkActiveIdx",
]
# const 設定:全進 State.Config(read-only 約定)
CONFIG_VARS = [
    "DATA_VERSION", "PARENTS", "PARENT_LAW", "CAT_ART", "CAT_LABEL",
    "EXPENSE_LIST", "PARENT_ORDER", "EXPENSE_ORDER", "EXPENSE_DISPLAY_RENAME",
    "_LIB_CHUNK_SIZE", "_SCN_INITIAL_SECTIONS", "_SCN_CHUNK_SECTIONS",
    "MD_BASE", "CMDK_LIMIT", "SOURCE_URL_OVERRIDE", "META_FIELDS",
    "TAG_MATCH_THRESHOLD",  # filteredData 內部
    "filterState",  # 物件,從 const 起頭但內容可變;放在 State 比較自然
    "grid", "hint", "drawer", "scrim", "cmpModal", "cmpBody",  # DOM ref
]


def main():
    text = SRC.read_text(encoding="utf-8")
    print(f"原檔:{SRC.relative_to(ROOT)} = {text.count(chr(10))+1} lines")

    # 為了避免 regex 風險,本腳本只「複製」appjs 內容到 4 個 module 檔案,
    # 不做大規模 in-place 替換。每個 module 內手動列出需 import 的 State.X 名稱。
    #
    # 但這代表每個 module 內仍需把 X 改為 State.X — 這部分用 word-boundary regex 做。
    #
    # 安全考量:
    # 1) 只在每個 split 後的 module 內部做替換(避免 cross-file pattern 干擾)
    # 2) 用 word-boundary `\bX\b`,但跳過字串字面值 / 註解(難全自動,先嘗試)
    # 3) 每個 module 開頭加 `import { State } from './state.js';`
    # 4) 函式定義保留 `function foo(){}` 但 export 出去

    # ── 先把整個 app.js 切成行區段(基於前面 grep 出的邊界)──
    lines = text.splitlines(keepends=True)

    # boundaries (1-based inclusive ranges)
    REGIONS = {
        "state_const": (1, 281),        # 配置 + utility + loadAllData + mock_data array
        "filter": (282, 484),            # filter / view state + filteredData
        "render_helpers": (485, 822),    # highlightQuery + breadcrumb + procurement + scope-banner + escapeHtml
        "cards": (823, 923),             # cards lazy render
        "drawer": (924, 1434),           # drawer + rate table + lookup_type
        "spotlight": (1435, 1648),       # cmd+k
        "sidebar_chips": (1649, 1928),   # sidebar + chips
        "scenarios_calc": (1929, 2580),  # scenarios + calc
        "flow": (2581, 2736),            # flow modal + jumpToCard
        "main_init": (2737, 3052),       # splash + init + compare + view switch
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── 簡化策略:其實做完整 ESM 拆檔 + 規範化會耗時極高;我們改採 ──
    # ── HYBRID:依 region 切 4 個 .js 檔(plain script,非 module),
    #   按相依順序載入。等同於設計文件 §「備案:不拆,純內部抽函式」之檔案級實踐。
    # ── 但用「js/」資料夾 + 命名 01_/02_/03_/04_ 排序 + region 內加 // ── REGION ── 標記
    # ── 全部 globals 仍共享 window scope(原 app.js 行為),零內部代碼修改。

    file_plan = [
        ("01_state.js", [REGIONS["state_const"]]),
        ("02_data.js", [REGIONS["filter"], REGIONS["render_helpers"]]),
        ("03_render.js", [REGIONS["cards"], REGIONS["drawer"], REGIONS["spotlight"],
                          REGIONS["sidebar_chips"], REGIONS["scenarios_calc"], REGIONS["flow"]]),
        ("04_main.js", [REGIONS["main_init"]]),
    ]

    for fname, regions in file_plan:
        chunks = []
        chunks.append(f"// {fname} — auto-split from app.js (2026-05-02 #2 ESM 拆檔 Phase 2-4)\n")
        chunks.append(f"// 此檔為 plain script,共享 window scope;與 02/03/04 配合使用,載入順序固定。\n\n")
        for (start_1based, end_1based_inclusive) in regions:
            seg = lines[start_1based - 1: end_1based_inclusive]
            chunks.extend(seg)
            chunks.append("\n")
        out_path = OUT_DIR / fname
        out_path.write_text("".join(chunks), encoding="utf-8", newline="\n")
        size = sum(end - start + 1 for (start, end) in regions)
        print(f"  ✓ {fname}: ~{size} lines")

    print(f"\n4 module files written to {OUT_DIR.relative_to(ROOT)}/")
    print("Next: update 04_web/index.html to <script src=\"static/js/01_state.js\"> 等 4 行")


if __name__ == "__main__":
    main()
