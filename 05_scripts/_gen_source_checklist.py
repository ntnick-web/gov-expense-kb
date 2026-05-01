"""
_gen_source_checklist.py — 來源缺口清單

功能
----
1. 依 REQUIRED_SOURCES 定義各母題的「理想完整清單」
2. 比對 03_index/nodes.json 現有節點，找出缺口
3. 輸出缺口報告（含下載 URL），供人工補缺後跑 01_extract → 02_parse

用法
----
  python 05_scripts/_gen_source_checklist.py              # 全部母題
  python 05_scripts/_gen_source_checklist.py --parent 酬勞費   # 限定母題
  python 05_scripts/_gen_source_checklist.py --json        # JSON 輸出（供其他腳本讀取）
  python 05_scripts/_gen_source_checklist.py --all-cats    # 含已達標的 ok 項

狀態說明
--------
  ok         : 現有節點數 >= min_count
  missing    : 完全沒有對應節點
  incomplete : 有節點但數量 < min_count
"""

from __future__ import annotations
import argparse
import io
import json
import sys
from dataclasses import dataclass
from pathlib import Path

# Windows 主控台強制 UTF-8
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, str(Path(__file__).parent))
from _common import ROOT, INDEX_ROOT, MD_ROOT, split_fm


# ── 需求定義 ──────────────────────────────────────────────────────────────────

@dataclass
class SourceReq:
    """單一來源需求。"""
    parent:    str   # 母題名稱
    category:  str   # A / B / C / D
    name:      str   # 在 source / title 欄位中搜尋的子字串
    url:       str   # 下載 URL（主要入口）
    min_count: int   # 最少應有幾份 MD 節點（A 類 = 預期條文數；C/D = 粗略下限）
    note:      str = ''   # 說明（如「修正對照版本不算」）


# 完整法規清單（依母題 + 類別 + 預期節點數）
REQUIRED_SOURCES: list[SourceReq] = [

    # ══════════════════════════════════════════════════════════════
    # 國內旅費
    # ══════════════════════════════════════════════════════════════
    SourceReq(
        parent='國內旅費', category='A',
        name='國內出差旅費報支要點',
        url='https://law.dgbas.gov.tw/LawContent.aspx?id=FL017585',
        min_count=13,
        note='第1~16條（第8/10/12條現行版本已廢止合併）'
    ),
    SourceReq(
        parent='國內旅費', category='B',
        name='附表一',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=47',
        min_count=1,
        note='附表一：各機關員工國內出差旅費住宿費及日支生活費數額表'
    ),
    SourceReq(
        parent='國內旅費', category='C',
        name='解釋彙編',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=15',
        min_count=120,
        note='主計總處國內旅費解釋彙編（預估 174 份現行）'
    ),
    SourceReq(
        parent='國內旅費', category='D',
        name='問答集',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=16',
        min_count=10,
        note='常見疑義問答（已有 D-014~D-016）'
    ),

    # ══════════════════════════════════════════════════════════════
    # 國外旅費
    # ══════════════════════════════════════════════════════════════
    SourceReq(
        parent='國外旅費', category='A',
        name='國外出差旅費報支要點',
        url='https://law.dgbas.gov.tw/LawContent.aspx?id=FL017584',
        min_count=23,
        note='第1~23條（A-024 為派外進修補助表，屬另一部法規）'
    ),
    SourceReq(
        parent='國外旅費', category='A',
        name='派赴國外進修',
        url='https://law.dgbas.gov.tw/LawContent.aspx?id=FL017584',
        min_count=1,
        note='A-024 中央各機關派赴國外進修研究實習人員補助項目及數額表'
    ),
    SourceReq(
        parent='國外旅費', category='B',
        name='生活費日支數額表',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=47',
        min_count=2,
        note='全球日支數額表（現行 B-003 + 歷史 B-004 至少 2 份）'
    ),
    SourceReq(
        parent='國外旅費', category='B',
        name='大陸港澳',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=47',
        min_count=2,
        note='大陸港澳地區日支數額表（現行 + 歷史）'
    ),
    SourceReq(
        parent='國外旅費', category='B',
        name='外交部出差綜合保險',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=47',
        min_count=2,
        note='外交部出差綜合保險表（現行 + 歷史）'
    ),
    SourceReq(
        parent='國外旅費', category='C',
        name='解釋彙編',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=15',
        min_count=150,
        note='主計總處國外旅費解釋彙編（預估 185 份現行）'
    ),

    # ══════════════════════════════════════════════════════════════
    # 支出憑證與結報
    # ══════════════════════════════════════════════════════════════
    SourceReq(
        parent='支出憑證與結報', category='A',
        name='政府支出憑證處理要點',
        url='https://law.dgbas.gov.tw/LawContent.aspx?id=FL017556',
        min_count=24,
        note='第1~24條'
    ),
    SourceReq(
        parent='支出憑證與結報', category='D',
        name='經費結報常見疑義問答集',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=16',
        min_count=70,
        note='主計總處問答集（現有 77 份）'
    ),

    # ══════════════════════════════════════════════════════════════
    # 酬勞費（目前最不完整，主要缺口）
    # ══════════════════════════════════════════════════════════════

    # A 類核心法規
    SourceReq(
        parent='酬勞費', category='A',
        name='出席費及稿費支給要點',
        url='https://law.dgbas.gov.tw/LawContent.aspx?id=FL000752',
        min_count=8,
        note='中央政府各機關學校出席費及稿費支給要點（含附表）；'
             '目前僅有修正對照版本，缺完整現行條文'
    ),
    SourceReq(
        parent='酬勞費', category='A',
        name='講座鐘點費支給',
        url='https://law.dgpa.gov.tw/LawContent.aspx?id=GL000341',
        min_count=3,
        note='講座鐘點費支給表（人事行政總處主管）'
    ),
    SourceReq(
        parent='酬勞費', category='A',
        name='軍公教人員兼職費',
        url='https://law.dgpa.gov.tw/LawContent.aspx?id=GL000347',
        min_count=3,
        note='軍公教人員兼職費支給表（人事行政總處主管）'
    ),
    SourceReq(
        parent='酬勞費', category='A',
        name='全民健康保險扣取及繳納補充保險費辦法',
        url='https://law.lia-roc.org.tw/Law/Content?lsid=FL067880',
        min_count=5,
        note='二代健保補充保費施行辦法（衛福部 / 健保署主管）；'
             'pending_relocation → 健保母題建立後遷移'
    ),

    # C 類解釋函令（來自 ebasnew 友善專區 SN=15）
    SourceReq(
        parent='酬勞費', category='C',
        name='解釋彙編',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=15',
        min_count=5,
        note='主計總處酬勞費相關解釋彙編；目前可能尚未收錄'
    ),

    # D 類問答集（ebasnew SN=16）
    SourceReq(
        parent='酬勞費', category='D',
        name='問答集',
        url='https://ebasnew.dgbas.gov.tw/cp.aspx?n=18&s=16',
        min_count=1,
        note='酬勞費相關問答集；目前 D-酬勞費-001 qa_split_failed 待人工分段'
    ),
]


# ── 比對邏輯 ──────────────────────────────────────────────────────────────────

CAT_DIR = {
    'A': 'A_核心法規',
    'B': 'B_支出標準',
    'C': 'C_解釋函令',
    'D': 'D_問答集',
}


def _scan_md(parent: str, category: str, name: str) -> list[str]:
    """
    直接掃描 02_markdown/ 下的 MD 檔，回傳符合條件的節點 ID 清單。

    A/B 類：比對 front-matter source + title 含 name 子字串。
    C/D 類：name 為空時列出全部同母題 + 同類別的節點（總量計數）；
            name 有值時額外過濾 source/title。
    """
    folder = CAT_DIR.get(category)
    if not folder:
        return []
    target_dir = MD_ROOT / folder / parent
    if not target_dir.exists():
        return []

    matched_ids: list[str] = []
    for f in sorted(target_dir.glob('*.md')):
        try:
            text = f.read_text(encoding='utf-8', errors='replace')
            fm, _ = split_fm(text)
            if not fm:
                continue
            node_id = str(fm.get('id', f.stem))
            # 若 name 非空，需 source 或 title 含該子字串
            if name:
                src   = str(fm.get('source', ''))
                title = str(fm.get('title', ''))
                if name not in src and name not in title:
                    continue
            matched_ids.append(node_id)
        except Exception:
            continue
    return matched_ids


def check_requirement(req: SourceReq) -> dict:
    """回傳單一需求的比對結果。"""
    matched_ids = _scan_md(req.parent, req.category, req.name)
    count = len(matched_ids)

    if count == 0:
        status = 'missing'
    elif count < req.min_count:
        status = 'incomplete'
    else:
        status = 'ok'

    return {
        'parent':      req.parent,
        'category':    req.category,
        'name':        req.name,
        'url':         req.url,
        'min_count':   req.min_count,
        'actual':      count,
        'status':      status,
        'note':        req.note,
        'matched_ids': matched_ids[:5],  # 最多列 5 個，供診斷
    }


def run_checklist(parents: list[str]) -> list[dict]:
    reqs = REQUIRED_SOURCES
    if parents:
        reqs = [r for r in reqs if r.parent in parents]
    return [check_requirement(r) for r in reqs]


# ── 報告輸出 ──────────────────────────────────────────────────────────────────

STATUS_ICON = {'ok': '✅', 'missing': '❌', 'incomplete': '⚠️'}

def print_report(results: list[dict], show_ok: bool = False) -> None:
    # 依母題分組
    by_parent: dict[str, list[dict]] = {}
    for r in results:
        by_parent.setdefault(r['parent'], []).append(r)

    total   = len(results)
    ok_cnt  = sum(1 for r in results if r['status'] == 'ok')
    gap_cnt = total - ok_cnt

    print(f'\n{"─"*70}')
    print(f'來源缺口清單報告  （共 {total} 項需求，✅ 齊全 {ok_cnt}，缺口 {gap_cnt}）')
    print(f'{"─"*70}')

    for parent, items in by_parent.items():
        parent_ok  = sum(1 for i in items if i['status'] == 'ok')
        parent_gap = len(items) - parent_ok
        marker = '✅' if parent_gap == 0 else '⚠️'
        print(f'\n{marker}  【{parent}】  齊全 {parent_ok}/{len(items)}')

        for r in items:
            if r['status'] == 'ok' and not show_ok:
                continue
            icon = STATUS_ICON.get(r['status'], '?')
            count_str = f'{r["actual"]}/{r["min_count"]}'
            print(f'   {icon} [{r["category"]}] {r["name"]:<26}  {count_str:>6} 節點')
            if r['status'] != 'ok':
                print(f'       📥 {r["url"]}')
                if r['note']:
                    print(f'       📝 {r["note"]}')
                if r['matched_ids']:
                    print(f'       現有: {", ".join(r["matched_ids"])}')

    if gap_cnt == 0:
        print('\n✅ 全部來源均已齊全')
    else:
        print(f'\n共 {gap_cnt} 項缺口，建議依上列 URL 補齊後重跑管線。')


# ── 主程式 ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description='來源缺口清單')
    ap.add_argument('--parent',   default='', help='限定母題（逗號分隔）')
    ap.add_argument('--json',     action='store_true', help='輸出 JSON')
    ap.add_argument('--all-cats', action='store_true', help='含已齊全項目一起顯示')
    args = ap.parse_args()

    parents = [p.strip() for p in args.parent.split(',') if p.strip()]
    results = run_checklist(parents)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print_report(results, show_ok=args.all_cats)

    missing_or_incomplete = [r for r in results if r['status'] != 'ok']
    if missing_or_incomplete:
        if not args.json:
            pass  # 訊息已在 print_report 內
        sys.exit(2)


if __name__ == '__main__':
    main()
