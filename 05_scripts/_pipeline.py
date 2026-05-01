"""
_pipeline.py — 管線主控腳本（2026-05-02）

用法
----
  python 05_scripts/_pipeline.py --list                     # 列出所有 stage 與模型分配
  python 05_scripts/_pipeline.py --stages all               # 完整流程
  python 05_scripts/_pipeline.py --stages publish           # 只跑發佈層
  python 05_scripts/_pipeline.py --stages ingest --parent 酬勞費  # 限定母題
  python 05_scripts/_pipeline.py --stages retitle,resummary # 指定特定 stage
  python 05_scripts/_pipeline.py --stages llm --dry-run     # 只印指令，不執行

非 LLM 階段
-----------
直接 subprocess 執行對應腳本，成功繼續，失敗中止。

LLM 階段（需 Claude Code 子代理）
----------------------------------
1. 本腳本執行 build_batches 腳本，準備 inputs/batch_NN.jsonl + PROMPT.md
2. 輸出「LLM 任務佇列」，告知 Claude Code：
     - 要處理哪個 proposals_dir
     - 用哪個模型（Haiku / Sonnet / Opus）
     - 每批幾筆、建議同時跑幾個子代理
3. Claude Code 依佇列以正確模型跑子代理，產出 outputs/batch_NN.jsonl
4. 執行 apply 腳本，回寫 02_markdown/ SSOT
"""

import argparse
import subprocess
import sys
from pathlib import Path

ROOT       = Path(__file__).parent.parent
SCRIPTS    = Path(__file__).parent

try:
    from _pipeline_config import STAGES, PIPELINE_ORDER, get, resolve_group
except ImportError:
    sys.exit('找不到 _pipeline_config.py，請確認在 05_scripts/ 目錄下執行')


# ── 顯示管線清單 ──────────────────────────────────────────────────────────────
def cmd_list() -> None:
    header = f'{"Stage":<20} {"模型":<8} {"批次":>4} {"並行":>4}  說明'
    print(header)
    print('─' * 72)
    for key in PIPELINE_ORDER:
        cfg = STAGES[key]
        model  = cfg.model or '—'
        bsize  = str(cfg.batch_size) if cfg.batch_size else '—'
        par    = str(cfg.parallel)   if cfg.parallel   else '—'
        print(f'{key:<20} {model:<8} {bsize:>4} {par:>4}  {cfg.label}')
    print()
    print('選模型理由（只列有 LLM 的 stage）：')
    print('─' * 72)
    for key in PIPELINE_ORDER:
        cfg = STAGES[key]
        if cfg.model:
            print(f'\n[{key}]  {cfg.model.upper()}')
            # 換行縮排顯示 why
            lines = cfg.why.replace('。', '。\n').split('\n')
            for ln in lines:
                if ln.strip():
                    print(f'  {ln.strip()}')


# ── 執行單一 stage ────────────────────────────────────────────────────────────
def run_stage(key: str, extra_args: list[str], dry_run: bool) -> bool:
    cfg = STAGES[key]
    print(f'\n{"─"*64}')
    print(f'[{key}]  {cfg.label}')

    # 非 LLM：直接跑腳本
    if not cfg.model:
        cmd = ['python', str(SCRIPTS / cfg.script)] + extra_args
        if dry_run:
            print(f'  DRY  {" ".join(cmd)}')
            return True
        result = subprocess.run(cmd, cwd=str(ROOT))
        ok = result.returncode in (0, 3)   # 3 = warnings only
        print(f'  {"✅" if ok else "❌"}  exit {result.returncode}')
        return ok

    # LLM 階段：build batches → 佇列提示 → apply
    props_dir = SCRIPTS / cfg.proposals_dir if cfg.proposals_dir else None

    # 1. 執行 build_batches
    build_cmd = ['python', str(SCRIPTS / cfg.script)] + extra_args
    if cfg.batch_size:
        build_cmd += ['--batch-size', str(cfg.batch_size)]
    if dry_run:
        print(f'  DRY (build)  {" ".join(build_cmd)}')
    else:
        print(f'  建立批次檔…')
        r = subprocess.run(build_cmd, cwd=str(ROOT))
        if r.returncode not in (0, 3):
            print(f'  ❌ build_batches 失敗（exit {r.returncode}）')
            return False

    # 計算批次數
    batch_count = 0
    if props_dir and (props_dir / 'inputs').exists():
        batch_count = len(list((props_dir / 'inputs').glob('batch_*.jsonl')))

    # 2. 輸出 LLM 任務佇列（供 Claude Code 執行）
    model_display = cfg.model.upper()
    print()
    print(f'  ┌─ LLM 任務佇列 ──────────────────────────────────────────')
    print(f'  │  模型   : {model_display}')
    print(f'  │  批次數 : {batch_count} 個（{cfg.batch_size} 筆/批）')
    print(f'  │  並行   : 建議同時跑 {cfg.parallel} 個子代理')
    if props_dir:
        print(f'  │  目錄   : 05_scripts/{cfg.proposals_dir}/')
        print(f'  │  輸入   : {cfg.proposals_dir}/inputs/batch_01~{batch_count:02d}.jsonl')
        print(f'  │  提示詞 : {cfg.proposals_dir}/PROMPT.md')
        print(f'  │  輸出   : {cfg.proposals_dir}/outputs/batch_NN.jsonl（子代理寫入）')
    print(f'  │  理由   : {cfg.why[:80]}…')
    print(f'  └─────────────────────────────────────────────────────────')
    print()
    print(f'  ⏸  請以 {model_display} 執行上述批次後，按 Enter 繼續 apply…')

    if not dry_run:
        try:
            input()
        except EOFError:
            pass   # 非互動模式（CI）直接跳過

    # 3. 執行 apply
    apply_script = cfg.apply_script or cfg.script.replace('_build_batches', '_apply')
    apply_path   = SCRIPTS / apply_script
    if not apply_path.exists():
        print(f'  ⚠  找不到 apply 腳本 {apply_script}，跳過 apply')
        return True

    apply_cmd = ['python', str(apply_path), '--apply'] + extra_args
    if dry_run:
        print(f'  DRY (apply)  {" ".join(apply_cmd)}')
        return True

    print(f'  套用結果…')
    r = subprocess.run(apply_cmd, cwd=str(ROOT))
    ok = r.returncode in (0, 3)
    print(f'  {"✅" if ok else "❌"}  exit {r.returncode}')
    return ok


# ── 主程式 ────────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(
        description='管線主控：從資料取得到發佈，自動分配 LLM 模型',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
群組快捷（--stages 值）:
  all        完整流程
  ingest     抽取 → 解析 → 來源審查 → 跨母題分類
  llm        全部 LLM 精煉（review/retitle/resummary/caveats/flow）
  qa         法源驗證 + 中立 audit + 驗證
  publish    索引重建 + 驗證 + 版本同步
  new_A      新增 A 類核心法規後的快速通道
  new_scenario  新增情境卡後的驗證 + 發佈
'''
    )
    ap.add_argument('--stages',   default='all',
                    help='stage 名稱（逗號分隔）或群組名，預設 all')
    ap.add_argument('--parent',   default='',
                    help='限定母題，例如 酬勞費（傳給各腳本）')
    ap.add_argument('--dry-run',  action='store_true',
                    help='只印指令，不實際執行')
    ap.add_argument('--list',     action='store_true',
                    help='列出所有 stage 與模型分配後離開')
    ap.add_argument('--skip',     default='',
                    help='跳過的 stage（逗號分隔），例如 checklist,dedup')
    args, extra = ap.parse_known_args()

    if args.list:
        cmd_list()
        return

    stages_to_run = resolve_group(args.stages)
    skip_set      = {s.strip() for s in args.skip.split(',') if s.strip()}
    stages_to_run = [s for s in stages_to_run if s not in skip_set]

    extra_args = list(extra)
    if args.parent:
        extra_args += ['--parent', args.parent]

    mode = '[DRY RUN] ' if args.dry_run else ''
    print(f'=== {mode}管線啟動 ===')
    print(f'Stages : {" → ".join(stages_to_run)}')
    if args.parent:
        print(f'母題   : {args.parent}')
    if skip_set:
        print(f'跳過   : {", ".join(skip_set)}')

    # LLM 模型彙整預覽
    llm_stages = [(k, STAGES[k].model) for k in stages_to_run if STAGES[k].model]
    if llm_stages:
        print('\nLLM 模型分配：')
        for k, m in llm_stages:
            print(f'  {k:<20} → {m.upper()}')

    print()
    failed = []
    for key in stages_to_run:
        if key not in STAGES:
            print(f'⚠  未知 stage: {key}，跳過')
            continue
        ok = run_stage(key, extra_args, args.dry_run)
        if not ok:
            failed.append(key)
            print(f'\n❌ [{key}] 失敗，中止管線')
            sys.exit(2)

    print(f'\n{"─"*64}')
    if failed:
        print(f'❌ 管線完成（有失敗: {", ".join(failed)}）')
        sys.exit(1)
    else:
        print(f'✅ 管線完成 — {len(stages_to_run)} 個 stage')


if __name__ == '__main__':
    main()
