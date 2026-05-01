"""
_pipeline_config.py — 管線全流程與模型分配設定（2026-05-02）

架構說明
--------
本專案批次 LLM 工作流程分三段：
  1. build_batches.py  → 準備 inputs/batch_NN.jsonl + PROMPT.md
  2. **Claude Code**   → 讀取批次檔，以指定模型逐批跑子代理，產出 outputs/batch_NN.jsonl
  3. apply.py          → 讀取 outputs，回寫 02_markdown/ SSOT

本設定檔是第 2 步的「選模型依據」。_pipeline.py 執行非 LLM 階段並輸出 LLM 任務佇列，
Claude Code 按佇列以正確模型跑各批次。

模型選用原則（以最佳結果為優先）
---------------------------------
Opus   → 需要法律推理、跨語境判斷才能確保正確性的任務
Sonnet → 格式約束明確、輸出樣板固定的任務（Sonnet 4.6 已足夠）
Haiku  → 純結構偵測、是非判斷、無需語義理解的任務
無 LLM → 規則式腳本直接處理
"""

from __future__ import annotations
from dataclasses import dataclass

# ── 模型 ID ───────────────────────────────────────────────────────────────────
HAIKU  = 'haiku'    # claude-haiku-4-5-20251001
SONNET = 'sonnet'   # claude-sonnet-4-6
OPUS   = 'opus'     # claude-opus-4-7


@dataclass
class StageConfig:
    label:       str            # 人類可讀說明
    script:      str            # 對應 Python 腳本（05_scripts/ 下）
    model:       str  = ''      # 空字串 = 不需 LLM
    batch_size:  int  = 0       # 每批幾筆（0 = 不分批）
    parallel:    int  = 1       # 同時跑幾個子代理
    proposals_dir: str = ''     # inputs/outputs 所在子目錄名稱
    apply_script:  str = ''     # apply 腳本（若與 script 不同）
    why:         str  = ''      # 選此模型的理由


# ── 完整管線設定 ──────────────────────────────────────────────────────────────
#
# 執行順序即為 PIPELINE_ORDER 的順序。
# key 同時作為 --stages 的參數值（可逗號分隔，或用群組名）。
#
STAGES: dict[str, StageConfig] = {

    # ══════════════════════════════════════════════════════
    # P0  資料準備層（無 LLM）
    # ══════════════════════════════════════════════════════
    'checklist': StageConfig(
        label      = '來源缺口清單',
        script     = '_gen_source_checklist.py',
        why        = '純規則：比對 nodes.json 與 REQUIRED_SOURCES，輸出 gap 報告'
    ),
    # ▶ [人工] 依缺口報告下載補缺文件到 00_source/

    # ══════════════════════════════════════════════════════
    # P1  結構化層（無 LLM）
    # ══════════════════════════════════════════════════════
    'extract': StageConfig(
        label  = '抽取 PDF/DOCX/HTML → 純文字',
        script = '01_extract.py',
        why    = 'pdfplumber/python-docx 規則式抽取'
    ),
    'parse': StageConfig(
        label  = '純文字 → 結構化 MD',
        script = '02_parse.py',
        why    = '規則式 regex 解析，產出 front-matter + 條文區塊'
    ),
    'redact': StageConfig(
        label  = 'PII 清理',
        script = '_redact_pii.py',
        why    ='regex-based，無需語義理解'
    ),
    'dedup': StageConfig(
        label  = '重複與完整性檢查',
        script = '_dedup_audit.py',
        why    = '同 URL / 相似 title / 條次缺號偵測，規則式'
    ),

    # ══════════════════════════════════════════════════════
    # P1.5  來源品質審查（Haiku — 簡單結構偵測）
    # ══════════════════════════════════════════════════════
    'source_audit': StageConfig(
        label         = '來源品質審查',
        script        = '_source_audit_build_batches.py',
        apply_script  = '_source_audit_apply.py',
        model         = HAIKU,
        batch_size    = 30,
        parallel      = 5,
        proposals_dir = '_source_audit_proposals',
        why           = (
            'Haiku：偵測「修正對照表 vs 全文」、截斷內容、頁殼重複。'
            '模式固定（含/不含「修正規定」欄），Haiku 判斷足夠且速度快。'
        )
    ),

    # ══════════════════════════════════════════════════════
    # P2  跨母題分類（Opus — 法律語境推理）
    # ══════════════════════════════════════════════════════
    'cross_topic': StageConfig(
        label         = '跨母題歸屬驗證',
        script        = '_cross_topic_build_batches.py',
        apply_script  = '_cross_topic_apply.py',
        model         = OPUS,
        batch_size    = 5,
        parallel      = 2,
        proposals_dir = '_cross_topic_proposals',
        why           = (
            'Opus：需理解一份文件的法律主體（例如補充保費辦法應歸健保/酬勞費），'
            '表面關鍵字不夠，需要法規體系語境推理。錯誤歸類會污染 nodes.json。'
        )
    ),

    # ══════════════════════════════════════════════════════
    # P3  LLM 精煉層
    # ══════════════════════════════════════════════════════

    # A 類核心法規 → Opus（高位階，錯誤直接影響使用者查法）
    'llm_review_A': StageConfig(
        label         = 'A 類核心法規精校',
        script        = '_llm_review_build_batches.py',
        apply_script  = '_llm_review_apply.py',
        model         = OPUS,
        batch_size    = 8,
        parallel      = 3,
        proposals_dir = '_llm_review_proposals',
        why           = (
            'Opus：A 類條文是使用者引用的最高依據，'
            '修正對照表識別、條文完整性判斷需要強推理。'
            'pass/fix/flag 的 flag 決策影響後續人工複核範圍。'
        )
    ),

    # B/C/D 類 → Sonnet（格式較固定，判斷標準明確）
    'llm_review_BCD': StageConfig(
        label         = 'B/C/D 類精校',
        script        = '_llm_review_build_batches.py',
        apply_script  = '_llm_review_apply.py',
        model         = SONNET,
        batch_size    = 10,
        parallel      = 4,
        proposals_dir = '_llm_review_proposals',
        why           = (
            'Sonnet：B 支出標準/C 函釋/D 問答集的精校標準明確（格式、摘要品質、PII），'
            'pass/fix/flag 三態判斷 Sonnet 4.6 已足夠，批次量大用 Sonnet 效率更高。'
        )
    ),

    # 標題重抽 → Sonnet（20 字上限 + 格式前綴，強約束）
    'retitle': StageConfig(
        label         = '標題重抽（20 字硬上限）',
        script        = '_retitle_build_batches.py',
        apply_script  = '_retitle_apply.py',
        model         = SONNET,
        batch_size    = 25,
        parallel      = 4,
        proposals_dir = '_retitle_proposals',
        why           = (
            'Sonnet：A 類加「第N條」前綴、D 類加「QN」前綴、20 字硬上限。'
            '約束明確，格式驗證在 apply 端做，Sonnet 速度與品質均衡最佳。'
        )
    ),

    # 摘要重寫 → Sonnet（情境句型，格式固定）
    'resummary': StageConfig(
        label         = '摘要情境句型化',
        script        = '_resummary_build_batches.py',
        apply_script  = '_resummary_apply.py',
        model         = SONNET,
        batch_size    = 25,
        parallel      = 4,
        proposals_dir = '_resummary_proposals',
        why           = (
            'Sonnet：「適用場景 + 核心規定 + 關鍵限制」三段式，'
            '50 字目標長度，輸出格式固定，Sonnet 已達標。'
        )
    ),

    # Caveats / 紅線生成 → Sonnet
    'caveats_gen': StageConfig(
        label         = 'Caveats 紅線生成',
        script        = '_caveats_gen_build_batches.py',
        apply_script  = '_caveats_gen_apply.py',
        model         = SONNET,
        batch_size    = 8,
        parallel      = 3,
        proposals_dir = '_caveats_proposals',
        why           = (
            'Sonnet：從 primary_ids 的條文 body 提取禁止/限制條款，'
            '輸出 [{text, severity, legal_ref}] 結構，格式固定。'
            '法源來源已由前序 legal_ref_check 驗證，Sonnet 執行提取即可。'
        )
    ),

    # Decision tree 生成 → Sonnet（有既有 schema 範本）
    'flow_gen': StageConfig(
        label         = 'Decision tree 生成',
        script        = '_flow_gen_build_batches.py',
        apply_script  = '_flow_gen_apply.py',
        model         = SONNET,
        batch_size    = 5,
        parallel      = 3,
        proposals_dir = '_flow_proposals',
        why           = (
            'Sonnet：有既有 flow schema（questions/conclusions/refs），'
            '照格式生成 5-8 問題的樹狀結構，Sonnet 4.6 品質已達標。'
            '若需 >10 問題的複雜樹，單次改用 Opus 即可。'
        )
    ),

    # ══════════════════════════════════════════════════════
    # P4  品質把關層
    # ══════════════════════════════════════════════════════

    # 法源位階驗證 → Opus（最關鍵品質關卡）
    'legal_ref_check': StageConfig(
        label         = '法源位階驗證',
        script        = '_audit_scenario_sources.py',
        model         = OPUS,
        batch_size    = 5,
        parallel      = 2,
        proposals_dir = '_legal_check_proposals',
        why           = (
            'Opus：驗證「情境卡結論是否真的在 primary_ids 節點的 body 中有依據」，'
            'A>B>C>D 位階不可顛倒，需要理解法律條文語義而非關鍵字比對。'
            '這是發佈前最後一道人工可信度關卡，用最強模型確保正確。'
        )
    ),

    # 中立角色 audit → 無 LLM（數字比對規則式）
    'neutrality_audit': StageConfig(
        label  = '中立角色 audit',
        script = '_audit_neutrality.py',
        why    = 'bigram + 中文數字 normalize 比對，規則式'
    ),

    # ══════════════════════════════════════════════════════
    # P5  發佈層（無 LLM）
    # ══════════════════════════════════════════════════════
    'build_index': StageConfig(
        label  = '索引重建',
        script = '03_build_index.py',
        why    = '純 Python，產出 nodes/edges/tags/rate_lookup JSON'
    ),
    'validate': StageConfig(
        label  = '全套驗證',
        script = '04_validate.py',
        why    = 'MD schema + JSON Schema + link check + smoke test'
    ),
    'sync_version': StageConfig(
        label  = 'DATA_VERSION 同步',
        script = '_sync_data_version.py',
        why    = 'bump 01_state.js DATA_VERSION + 5 個 script ?v= cache-bust'
    ),
    # ▶ [人工] git add . && git commit && git push → CI/CD 自動部署
}


# ── 常用群組（--stages 的快捷值）────────────────────────────────────────────
STAGE_GROUPS: dict[str, list[str]] = {
    # 完整流程（新母題從零開始）
    'all': list(STAGES.keys()),

    # 只跑新資料進來的前段（到 cross_topic）
    'ingest': ['extract', 'parse', 'redact', 'dedup', 'source_audit', 'cross_topic'],

    # LLM 精煉全部
    'llm': ['llm_review_A', 'llm_review_BCD', 'retitle', 'resummary',
            'caveats_gen', 'flow_gen'],

    # 品質把關 + 法源驗證
    'qa': ['legal_ref_check', 'neutrality_audit', 'validate'],

    # 索引重建到發佈
    'publish': ['build_index', 'validate', 'sync_version'],

    # 單純跑 A 類（新增核心法規後）
    'new_A': ['source_audit', 'cross_topic', 'llm_review_A', 'retitle',
              'resummary', 'legal_ref_check', 'build_index', 'validate', 'sync_version'],

    # 新增情境卡後
    'new_scenario': ['legal_ref_check', 'neutrality_audit', 'validate',
                     'build_index', 'sync_version'],
}

# ── 執行順序（用於 _pipeline.py 的預設 all 模式）────────────────────────────
PIPELINE_ORDER: list[str] = [
    'checklist',
    # ▶ [人工] 下載補缺文件
    'extract', 'parse', 'redact', 'dedup',
    'source_audit',       # Haiku
    'cross_topic',        # Opus
    'llm_review_A',       # Opus
    'llm_review_BCD',     # Sonnet
    'retitle',            # Sonnet
    'resummary',          # Sonnet
    'caveats_gen',        # Sonnet
    'flow_gen',           # Sonnet
    'legal_ref_check',    # Opus ← 最關鍵
    'neutrality_audit',
    'build_index',
    'validate',
    'sync_version',
    # ▶ [人工] git push
]


def get(stage: str) -> StageConfig:
    if stage not in STAGES:
        available = ', '.join(STAGES.keys())
        raise KeyError(f'未知 stage: {stage}。可用: {available}')
    return STAGES[stage]


def resolve_group(name: str) -> list[str]:
    """將群組名或逗號分隔 stage 列表解析為 stage 名稱列表。"""
    if name in STAGE_GROUPS:
        return STAGE_GROUPS[name]
    return [s.strip() for s in name.split(',') if s.strip()]
