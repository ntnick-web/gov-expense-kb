"""
_source_audit.py — 來源品質自動審查

功能
----
1. 掃描 02_markdown/ 的 A 類核心法規（預設），偵測：
   - amendment_only  : 只有修正對照表，缺完整現行條文
   - truncated       : 全文明顯截斷（條文數明顯少於預期）
   - placeholder     : 內容為 TODO / 待補 / 空白
   - rate_table_only : 只有費率表格，非條文
   - ok              : 看起來完整

2. 輸出文字報告（預設）或 JSON（--json）
3. --apply：將偵測結果寫入 front-matter 的 source_quality 欄位

用法
----
  python 05_scripts/_source_audit.py              # 審查全部 A 類
  python 05_scripts/_source_audit.py --parent 酬勞費  # 限定母題
  python 05_scripts/_source_audit.py --cat A,B    # 指定類別
  python 05_scripts/_source_audit.py --apply      # 寫入 source_quality
  python 05_scripts/_source_audit.py --json       # JSON 輸出（供其他腳本讀取）
"""

from __future__ import annotations
import argparse
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

# Windows 主控台強制 UTF-8 輸出
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 加入 05_scripts/ 到 path，讓 import _common 生效
sys.path.insert(0, str(Path(__file__).parent))
from _common import split_fm, render_fm, walk_md, ROOT, MD_ROOT


# ── 偵測信號定義 ──────────────────────────────────────────────────────────────

# 修正對照表信號（內文含這些詞 + 欄位結構）
AMENDMENT_SIGNALS = [
    r'修正規定',
    r'現行規定',
    r'修正對照',
    r'新舊條文對照',
    r'修正前',
    r'修正後',
]

# 截斷信號（條文結尾突然中斷）
TRUNCATION_SIGNALS = [
    r'\.{3,}$',          # 結尾省略號
    r'……$',
    r'（以下略）',
    r'（略）',
]

# Placeholder 信號
# 注意：不含 r'待人工' — 會誤匹配 _(自動初校,待人工潤飾)_ 標準審閱標記
PLACEHOLDER_SIGNALS = [
    r'\bTODO\b',
    r'待補',
    r'\(摘要待補\)',
]

# 純費率表信號（無條次結構）
RATE_TABLE_SIGNALS = [
    r'^[\d,]+\s+美元',      # 費率數字開頭
    r'^日支數額',
    r'支給表單位',
]

# 預期每部法規的最少條次數（粗略下限，低於此數即警告）
MIN_ARTICLES: dict[str, int] = {
    '出席費及稿費支給要點': 10,
    '講座鐘點費支給要點':   5,
    '軍公教人員兼職費':     5,
    '國內出差旅費':        13,
    '國外出差旅費':        20,
    '政府支出憑證處理要點': 22,
}


# ── 單檔審查 ──────────────────────────────────────────────────────────────────

def classify(path: Path) -> dict:
    """讀取一份 MD，回傳 {id, path, quality, signals, note}。"""
    text = path.read_text(encoding='utf-8', errors='replace')
    fm, body = split_fm(text)
    if fm is None:
        return _result(path, 'parse_error', ['front-matter 解析失敗'])

    node_id  = fm.get('id', path.stem)
    category = node_id.split('-')[0] if '-' in node_id else ''

    signals: list[str] = []

    # 1. Placeholder
    for pat in PLACEHOLDER_SIGNALS:
        if re.search(pat, body, re.IGNORECASE):
            signals.append(f'placeholder:{pat}')

    # 2. 修正對照表
    amendment_hits = sum(
        1 for pat in AMENDMENT_SIGNALS
        if re.search(pat, body)
    )
    if amendment_hits >= 2:
        signals.append(f'amendment_only:{amendment_hits} 個信號')

    # 3. 截斷
    for pat in TRUNCATION_SIGNALS:
        if re.search(pat, body, re.MULTILINE):
            signals.append(f'truncated:{pat}')

    # 4. 純費率表（B 類允許，A 類不允許）
    if category == 'A':
        rate_hits = sum(1 for pat in RATE_TABLE_SIGNALS if re.search(pat, body, re.MULTILINE))
        if rate_hits >= 2:
            signals.append(f'rate_table_only:{rate_hits} 個信號')

    # 5. 內文過短（low_article_count 改在 audit() 彙總層做，避免單檔誤判）
    body_stripped = re.sub(r'\s+', '', body)
    if len(body_stripped) < 80:
        signals.append(f'too_short:{len(body_stripped)} 字')

    # 判定品質等級
    quality = _judge(signals)

    return _result(path, quality, signals, node_id)


def _judge(signals: list[str]) -> str:
    if not signals:
        return 'ok'
    tags = [s.split(':')[0] for s in signals]
    if 'placeholder' in tags:
        return 'placeholder'
    if 'amendment_only' in tags:
        return 'amendment_only'
    if 'truncated' in tags or 'too_short' in tags:
        return 'truncated'
    if 'rate_table_only' in tags:
        return 'rate_table_only'
    if 'low_article_count' in tags:
        return 'low_article_count'
    return 'warning'


def _result(path: Path, quality: str, signals: list[str], node_id: str = '') -> dict:
    rel = path.relative_to(ROOT)
    return {
        'id':      node_id or path.stem,
        'path':    str(rel).replace('\\', '/'),
        'quality': quality,
        'signals': signals,
    }


# ── 批次審查 ──────────────────────────────────────────────────────────────────

def audit(cats: list[str], parents: list[str]) -> list[dict]:
    results = []
    # A 類各法規已收錄幾份條文檔（彙總用）
    law_file_counts: dict[str, int] = defaultdict(int)

    for path in walk_md(MD_ROOT):
        # 過濾類別
        cat = path.parts[-3][0] if len(path.parts) >= 3 else ''
        if cats and cat not in cats:
            continue
        # 過濾母題
        parent_dir = path.parts[-2] if len(path.parts) >= 2 else ''
        if parents and parent_dir not in parents:
            continue

        results.append(classify(path))

        # 追蹤 A 類各法規已收錄條文檔數（用 source / title 比對 MIN_ARTICLES key）
        if cat == 'A':
            try:
                text = path.read_text(encoding='utf-8', errors='replace')
                fm, _ = split_fm(text)
                if fm:
                    source = str(fm.get('source', ''))
                    title  = str(fm.get('title', ''))
                    for law_key in MIN_ARTICLES:
                        if law_key in source or law_key in title:
                            law_file_counts[law_key] += 1
                            break
            except Exception:
                pass

    # 彙總：法規條文檔數不足警告（在母題/法規層級，非個別檔）
    # 只在確實有掃到該法規的情況下才加警告（count==0 表示不在此次範圍）
    if not cats or 'A' in cats:
        for law_key, min_count in MIN_ARTICLES.items():
            count = law_file_counts.get(law_key, 0)
            if count == 0:
                continue  # 此次未掃到，跳過（可能被 --parent 過濾）
            if count < min_count:
                results.append({
                    'id':      f'[彙總] {law_key}',
                    'path':    '02_markdown/A_核心法規/',
                    'quality': 'low_article_count',
                    'signals': [f'low_article_count:{count}/{min_count} 份條文檔'],
                })

    return results


# ── apply：寫入 source_quality ──────────────────────────────────────────────

def apply_results(results: list[dict]) -> None:
    written = 0
    for r in results:
        if r['quality'] == 'ok':
            continue
        if r['id'].startswith('[彙總]'):
            continue  # 彙總結果無對應單一檔
        p = ROOT / r['path']
        if not p.exists():
            continue
        text = p.read_text(encoding='utf-8', errors='replace')
        fm, body = split_fm(text)
        if fm is None:
            continue
        if fm.get('source_quality') == r['quality']:
            continue   # 已是最新，跳過
        fm['source_quality'] = r['quality']
        if r['signals']:
            fm['source_quality_signals'] = r['signals']
        new_text = render_fm(fm) + '\n' + body
        p.write_text(new_text, encoding='utf-8')
        written += 1
    print(f'已寫入 source_quality：{written} 個檔案')


# ── 報告輸出 ──────────────────────────────────────────────────────────────────

QUALITY_ICON = {
    'ok':                '✅',
    'amendment_only':    '🔴',
    'truncated':         '🟠',
    'placeholder':       '🟡',
    'rate_table_only':   '🟡',
    'low_article_count': '🟠',
    'warning':           '⚠️',
    'parse_error':       '❌',
}

def print_report(results: list[dict]) -> None:
    by_quality: dict[str, list[dict]] = {}
    for r in results:
        by_quality.setdefault(r['quality'], []).append(r)

    total = len(results)
    ok    = len(by_quality.get('ok', []))
    print(f'\n{"─"*64}')
    print(f'來源品質審查報告  （共 {total} 筆，✅ 正常 {ok}，⚠ 問題 {total-ok}）')
    print(f'{"─"*64}')

    order = ['amendment_only', 'placeholder', 'truncated',
             'rate_table_only', 'low_article_count', 'warning', 'parse_error']
    for q in order:
        items = by_quality.get(q, [])
        if not items:
            continue
        icon = QUALITY_ICON.get(q, '?')
        print(f'\n{icon}  {q}  ({len(items)} 筆)')
        for r in items:
            print(f'   {r["id"]:<30}  {r["path"]}')
            for sig in r['signals']:
                print(f'      └ {sig}')

    if ok == total:
        print('\n✅ 全部來源品質正常')


# ── 主程式 ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description='來源品質自動審查')
    ap.add_argument('--parent', default='',   help='限定母題，例如 酬勞費（逗號分隔）')
    ap.add_argument('--cat',    default='A',  help='類別 A/B/C/D，逗號分隔，預設 A')
    ap.add_argument('--apply',  action='store_true', help='將 source_quality 寫入 front-matter')
    ap.add_argument('--json',   action='store_true', help='輸出 JSON（供其他腳本讀取）')
    args = ap.parse_args()

    cats    = [c.strip().upper() for c in args.cat.split(',')    if c.strip()]
    parents = [p.strip()         for p in args.parent.split(',') if p.strip()]

    results = audit(cats, parents)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print_report(results)

    if args.apply:
        apply_results(results)

    # 有問題就 exit 2，讓 CI 攔截
    problems = [r for r in results if r['quality'] != 'ok']
    if problems:
        if not args.json:
            print(f'\n共 {len(problems)} 筆品質問題，建議處理後重新執行。')
        sys.exit(2)


if __name__ == '__main__':
    main()
