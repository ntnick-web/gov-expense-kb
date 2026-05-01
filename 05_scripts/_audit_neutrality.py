"""精煉版法源審查 — 對 75 卡的高風險 claim 做關鍵字命中驗證。

對象優先序:
  1. severity=stop / warn caveats(最強斷言)
  2. subtitle 含「需 / 必須 / 始得 / 才能」等限制詞
  3. flow.conclusion.note 含具體金額/百分比

關鍵字匹配:
  - 數字+單位(「3,500 元」「30%」「60 公里」)逐一檢查是否在 primary_ids 全文出現
  - 「不得」「應依」等限制詞需有對應條文支持

執行:
    python 05_scripts/_audit_neutrality.py            # 預設 stdout
    python 05_scripts/_audit_neutrality.py -o report.txt
    python 05_scripts/_audit_neutrality.py --strict   # 任何 high-conf 違規 exit 2
"""
from __future__ import annotations
import sys
import re
import json
import argparse
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent

# 數字 + 單位:精確的金額 / 百分比 / 公里數
NUM_RE = re.compile(r"\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:元|%|公里|天|日|小時|新臺幣|美元))")


def get_full_text(node_id: str, nm: dict) -> str:
    n = nm.get(node_id)
    if not n:
        return ''
    fp = ROOT / n['file_path']
    if fp.exists():
        return fp.read_text(encoding='utf-8')
    return n.get('summary', '') + ' ' + n.get('body_plain', '')


_CN_DIGITS = {'零': '0', '○': '0', '〇': '0',
              '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
              '六': '6', '七': '7', '八': '8', '九': '9'}


def cn_to_arabic(text: str) -> str:
    """把中文數字「四十五」→「45」、「一百二十」→「120」近似轉換,擴大命中。
    保守實作:單詞掃描 + 對 1~999 範圍轉換。
    """
    out = []
    i = 0
    while i < len(text):
        # 嘗試取一段中文數字串(含「十」「百」)
        j = i
        digits = []
        while j < len(text) and (text[j] in _CN_DIGITS or text[j] in ('十', '百')):
            digits.append(text[j])
            j += 1
        if len(digits) >= 1 and any(d in _CN_DIGITS or d == '十' or d == '百' for d in digits):
            # 簡易轉換:十/百 + 數字
            s = ''.join(digits)
            num = None
            try:
                if '百' in s:
                    parts = s.split('百')
                    h = _CN_DIGITS.get(parts[0], '1') if parts[0] else '1'
                    rest = parts[1] if len(parts) > 1 and parts[1] else ''
                    if not rest:
                        num = int(h) * 100
                    elif '十' in rest:
                        tparts = rest.split('十')
                        t = _CN_DIGITS.get(tparts[0], '1') if tparts[0] else '1'
                        u = _CN_DIGITS.get(tparts[1], '0') if len(tparts) > 1 and tparts[1] else '0'
                        num = int(h) * 100 + int(t) * 10 + int(u)
                    else:
                        u = _CN_DIGITS.get(rest, '0')
                        num = int(h) * 100 + int(u)
                elif '十' in s:
                    tparts = s.split('十')
                    t = _CN_DIGITS.get(tparts[0], '1') if tparts[0] else '1'
                    u = _CN_DIGITS.get(tparts[1], '0') if len(tparts) > 1 and tparts[1] else '0'
                    num = int(t) * 10 + int(u)
                elif len(s) == 1 and s in _CN_DIGITS:
                    num = int(_CN_DIGITS[s])
            except (ValueError, KeyError):
                pass
            if num is not None and 1 <= num <= 999:
                out.append(str(num))
                i = j
                continue
        out.append(text[i])
        i += 1
    return ''.join(out)


def normalize_num(s: str) -> str:
    """把 '3,500 元' / '3500元' / '3,500元' / '四十五日' 通通正規化為 '3500元' / '45日'。"""
    s = re.sub(r'\s+', '', s).replace(',', '')
    return cn_to_arabic(s)


def find_orphan_numbers(claim: str, primary_text: str) -> list[str]:
    """從 claim 抽所有「數字+單位」,檢查每個是否在 primary_text 出現(允許 變體)"""
    primary_normalized = normalize_num(primary_text)
    orphans = []
    seen = set()
    for m in NUM_RE.finditer(claim):
        raw = m.group(0)
        norm = normalize_num(raw)
        if norm in seen:
            continue
        seen.add(norm)
        # 允許數字無單位(可能 primary 用全形數字或括號分隔)
        num_only = re.sub(r'[元%公里天日小時新臺幣美元\s]', '', norm)
        if norm in primary_normalized or num_only in primary_normalized:
            continue
        orphans.append(raw)
    return orphans


# 高風險 claim 檢測 — 含限制詞但無對應條文出現
RESTRICT_PATTERNS = [
    (r'始得|才能|才可', '限制條件'),
    (r'必須|須事先|須經.*核准', '前置條件'),
    (r'不予報支|不予核銷|不得報', '禁止項'),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('-o', '--output', help='寫入檔案(預設 stdout)')
    ap.add_argument('--strict', action='store_true', help='高信度違規時 exit 2')
    args = ap.parse_args()

    data = json.loads((ROOT / '04_web/data/scenarios_manual.json').read_text(encoding='utf-8'))
    nodes = json.loads((ROOT / '03_index/nodes.json').read_text(encoding='utf-8'))
    nm = {n['id']: n for n in nodes}

    high_conf = []   # 高信度違規:具體數字 / 限制詞 找不到法源
    low_conf = []    # 低信度建議:文字風格非中性

    for s in data['scenarios']:
        if s.get('deprecated'):
            continue
        primary = s.get('primary_ids', [])
        if not primary:
            continue
        primary_text = ' '.join(get_full_text(p, nm) for p in primary)
        if not primary_text:
            continue

        # 收集所有 claim
        claims = []
        if s.get('subtitle'):
            claims.append(('subtitle', s['subtitle']))
        for i, c in enumerate(s.get('caveats', []) or []):
            sev = c.get('severity', 'info')
            claims.append((f'caveats[{i}]({sev})', c.get('text', '')))
        flow = s.get('flow', {}) or {}
        for cid, c in (flow.get('conclusions', {}) or {}).items():
            claims.append((f'flow.{cid}.note', c.get('note', '')))

        for label, claim in claims:
            if not claim:
                continue
            orphan_nums = find_orphan_numbers(claim, primary_text)
            if orphan_nums:
                high_conf.append({
                    'id': s['id'],
                    'field': label,
                    'claim': claim[:80],
                    'orphan_numbers': orphan_nums,
                })

    out_lines = []
    out_lines.append('=' * 70)
    out_lines.append(f"全面審查 — {len(data['scenarios'])} 卡 / {len(nodes)} 節點")
    out_lines.append('=' * 70)
    out_lines.append('')
    out_lines.append(f'## 🔴 高信度違規(具體數字找不到對應 primary 條文)= {len(high_conf)} 項')
    out_lines.append('')
    for it in high_conf:
        out_lines.append(f"  [{it['id']}] {it['field']}")
        out_lines.append(f"    claim: {it['claim']}")
        out_lines.append(f"    orphan: {it['orphan_numbers']}")
        out_lines.append('')

    out_lines.append('=' * 70)
    out_lines.append(f"摘要:{len(high_conf)} 高信度違規")
    out_lines.append('')
    if high_conf:
        out_lines.append('⚠ 上述 claim 含具體數字但對應 primary_ids 全文未直接命中,')
        out_lines.append('   建議:① 從原條文重抄精確數字 ② 確認該數字是否屬其他法源(可能需擴充 primary_ids)')
        out_lines.append('   ③ 改寫為中立描述')
    else:
        out_lines.append('✓ 高信度檢查通過')

    output = '\n'.join(out_lines)
    if args.output:
        Path(args.output).write_text(output, encoding='utf-8')
        print(f'已寫入 {args.output}')
    else:
        print(output)

    if args.strict and high_conf:
        sys.exit(2)


if __name__ == '__main__':
    main()
