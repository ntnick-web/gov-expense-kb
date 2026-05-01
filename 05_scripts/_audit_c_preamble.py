"""偵測 C 類卡片中「彙編前言/凡例/緒論/立法目的」非實際函釋的卡。

訊號:
  (1) Title 含彙編後設詞:彙編/凡例/目次/目錄/索引/體例/緒論/總則/本要點所稱/本表所稱/立法目的
  (2) Body 含強後設句型:本彙編收錄.../為規範...特訂定本要點/本要點分為.../目次/目錄

精準度策略:
  - title hit + body >= 30 字 → 高信心
  - body 強 hit + body >= 80 字 → 高信心
  - 不偵測短函釋(< 30 字)避免誤判
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

META_TITLE = re.compile(r'(彙編|凡例|目次|目錄|索引|體例|緒論|本要點所稱|本表所稱|立法目的|本辦法所稱)')
META_BODY_STRONG = re.compile(
    r'(本(彙編|要點|辦法|表)(收錄|蒐集|彙整|彙集|整理|包含|包括|分為|計分|涵蓋|主要)|'
    r'本(彙編|要點|辦法|表|手冊)(係|乃|為)(彙整|蒐集|收錄|參考|參酌)|'
    r'為(規範|簡化|落實|有效).{2,40}特(訂定|彙編|編訂)本要點|'
    r'本要點所稱.{0,30}指|本表所稱.{0,30}指|'
    r'本(彙編|要點)分(為|成).{0,10}(章|節|篇|部|類))'
)

def main() -> int:
    results: list[tuple[Path, str, str, str]] = []
    total = 0
    for md_path in (ROOT / '02_markdown' / 'C_解釋函令').rglob('*.md'):
        total += 1
        text = md_path.read_text(encoding='utf-8')
        fm_match = re.match(r'^---\n(.*?)\n---\n(.*)', text, re.S)
        if not fm_match:
            continue
        fm, body = fm_match.group(1), fm_match.group(2)
        title_m = re.search(r'^title:\s*[\'\"]?(.+?)[\'\"]?$', fm, re.M)
        title = ''
        if title_m:
            title = title_m.group(1).strip().strip("'").strip('"')
        full_m = re.search(r'## 函釋全文\n(.*?)(?=\n## |\Z)', body, re.S)
        full = full_m.group(1).strip() if full_m else ''

        title_hit = META_TITLE.search(title)
        body_hit = META_BODY_STRONG.search(full[:600])

        flag = None
        if title_hit and len(full) >= 30:
            flag = 'title:' + title_hit.group()
        elif body_hit and len(full) >= 80:
            flag = 'body:' + body_hit.group()[:25]
        if flag:
            results.append((md_path, title, full[:120], flag))

    print(f'掃 {total} C 類卡 / 高信心前言/彙編後設:{len(results)}')
    print()
    for p, t, b, flag in results:
        rel = str(p.relative_to(ROOT)).replace('\\', '/')
        print(f'{rel}')
        print(f'  title: {t}')
        print(f'  flag : {flag}')
        print(f'  body : {b}')
        print()
    return 0

if __name__ == '__main__':
    sys.exit(main())
