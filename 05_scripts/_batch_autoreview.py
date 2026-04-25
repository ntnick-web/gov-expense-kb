"""批次自動初校:把 02_markdown 內草稿(無 reviewed)補摘要與 reviewed。

對每份草稿:
- 抽 ## 條文全文 / 函釋全文 / 標準全文 / 問題 區塊首段(到第一個「。」)為摘要
- 在 front-matter 加 reviewed: 2026-04-25(自動)
- version=TODO → 推合理 placeholder(2024-01-01)
- 重點摘要末尾加「_(自動初校,待人工潤飾)_」斜體記號
- 不動 related(讓推斷邊機制接手)
- 不動已 reviewed 的檔

一次性工具,不在標準管線內。
"""

from __future__ import annotations
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
MD_DIR = ROOT / "02_markdown"
TODAY = '2026-04-25'
VERSION_FALLBACK = '2024-01-01'

# 抽摘要時找這些 H2 區塊
HEADINGS = ['條文全文', '函釋全文', '標準全文', '回答', '問題']

PLACEHOLDER_LINE = '(待人工補)'
AUTO_NOTICE = '_(自動初校,待人工潤飾)_'


def strip_front_matter(text: str):
    if not text.startswith('---'):
        return None, text, None
    end = text.find('\n---', 3)
    if end < 0:
        return None, text, None
    raw = text[3:end]
    try:
        fm = yaml.safe_load(raw)
    except yaml.YAMLError:
        return None, text, None
    if not isinstance(fm, dict):
        return None, text, None
    body = text[end + 4:].lstrip('\n')
    return fm, body, raw


def extract_first_sentence(body: str) -> str | None:
    """從 H2 區塊抽首段,取至第一個句末標點。"""
    for h in HEADINGS:
        pattern = rf'(?ms)^##\s*{re.escape(h)}\s*\n(.+?)(?=^##\s|\Z)'
        m = re.search(pattern, body)
        if not m:
            continue
        section = m.group(1).strip()
        if not section:
            continue
        # 去前綴編號:「N、」「(一)」「(N)」
        text = re.sub(r'^[一二三四五六七八九十]+、\s*', '', section)
        text = re.sub(r'^[（(][一二三四五六七八九十]+[）)]\s*', '', text)
        text = re.sub(r'^[一二三四五六七八九十]+[、,]\s*', '', text)
        # 移除多餘空白
        text = re.sub(r'\s+', '', text)
        # 取到第一個 「。」
        stop = text.find('。')
        if stop >= 30:
            return text[:stop + 1]
        if stop > 0:
            stop2 = text.find('。', stop + 1)
            if stop2 > 0:
                return text[:stop2 + 1]
        return text[:200] + ('...' if len(text) > 200 else '')
    return None


def process(path: Path) -> tuple[bool, str]:
    text = path.read_text(encoding='utf-8')
    fm, body, _ = strip_front_matter(text)
    if fm is None:
        return False, 'no_fm'
    if 'reviewed' in fm:
        return False, 'already_reviewed'

    summary = extract_first_sentence(body)
    if not summary:
        return False, 'no_summary_extractable'

    # 構建新 fm,保留欄位順序:在 source/version 之後加 reviewed
    new_fm = {}
    inserted = False
    for k, v in fm.items():
        new_fm[k] = v
        if k == 'version' and not inserted:
            if v == 'TODO' or v is None or v == '':
                new_fm[k] = VERSION_FALLBACK
            new_fm['reviewed'] = TODAY
            inserted = True
    if not inserted:
        new_fm['reviewed'] = TODAY

    new_yaml = yaml.safe_dump(
        new_fm, allow_unicode=True, sort_keys=False, default_flow_style=False
    ).rstrip()

    # 替換摘要區塊內的 placeholder
    summary_block = f'## 重點摘要\n\n{summary}\n\n{AUTO_NOTICE}'
    new_body = re.sub(
        rf'## 重點摘要\s*\n\s*\n\(待人工補\)',
        summary_block,
        body,
        count=1,
    )

    new_text = '---\n' + new_yaml + '\n---\n\n' + new_body
    if not new_text.endswith('\n'):
        new_text += '\n'
    path.write_text(new_text, encoding='utf-8', newline='\n')
    return True, 'ok'


def main() -> int:
    if not MD_DIR.exists():
        print(f'找不到 {MD_DIR}', file=sys.stderr)
        return 1
    stats = {'ok': 0, 'already_reviewed': 0, 'no_fm': 0, 'no_summary_extractable': 0}
    for md in sorted(MD_DIR.rglob('*.md')):
        ok, reason = process(md)
        stats[reason] = stats.get(reason, 0) + 1
        if not ok and reason == 'no_summary_extractable':
            print(f'  ! 無法抽摘要:{md.relative_to(ROOT)}')
    print()
    print('批次自動初校結果:')
    for k, v in stats.items():
        print(f'  {k}: {v}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
