#!/usr/bin/env python3 -X utf8
"""
酬勞費分類大整理 (2026-05-02)

1. B-酬勞費-001~038 (支標手冊) → C-酬勞費-002~039 (解釋函令)
2. A-酬勞費-004 (稿費基準附表) → B-酬勞費-039 (支出標準)
3. 更新 scenarios/remuneration.json 所有 ID 引用
4. 更新 02_markdown/ 內的 related: 連結
5. 修正 酬勞費節點多餘 EXPENSE_LIST tag (保留 6 個正確類別)
6. 在 A-010 / A-012 / B-039 加入 rate_table front-matter

Usage:
    python 05_scripts/_migrate_remuneration_reclassify.py --dry-run
    python 05_scripts/_migrate_remuneration_reclassify.py --apply
"""
import sys, re, json, shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent
MD_ROOT = ROOT / '02_markdown'
SC_FILE = ROOT / '04_web/data/scenarios/remuneration.json'
APPLY = '--apply' in sys.argv

# ─── ID 對應表 ───────────────────────────────────────────────────────────────
# B-酬勞費-NNN → C-酬勞費-(NNN+1)
B_TO_C = {f'B-酬勞費-{n:03d}': f'C-酬勞費-{n+1:03d}' for n in range(1, 39)}
# A-酬勞費-004 → B-酬勞費-039
A004_NEW_ID = 'B-酬勞費-039'
# 舊 ID → 新 ID 全表 (供文字替換)
ALL_MAP = {**B_TO_C, 'A-酬勞費-004': A004_NEW_ID}

# ─── 需要清除的 tag (酬勞費節點不應有這些 EXPENSE_LIST tag) ────────────────
WRONG_EXPENSE_TAGS_PER_ID = {
    'A-酬勞費-005': ['保險費'],
    'A-酬勞費-010': ['交通費', '住宿費', '教育訓練費'],
    'A-酬勞費-018': ['交通費', '住宿費'],
}

# ─── rate_table front-matter 插入文字 ─────────────────────────────────────
# 在 reviewed: 行之前插入
RATE_TABLE_A010 = """\
rate_table:
  caption: 講座鐘點費支給表
  unit: 新臺幣元/節
  effective: '2018-02-01'
  headers: [類別, 對象, 支給上限]
  rows:
    - [外聘, 國內專家學者, '2,000']
    - [外聘, '與主辦機關（構）、學校有隸屬關係之機關（構）學校人員', '1,500']
    - [內聘, 主辦機關（構）、學校人員, '1,000']
  notes:
    - 本表所定內聘及外聘講座鐘點費係屬上限規範，主辦機關得參酌預算狀況及實際需要等因素，於本表所定範圍內自行訂定。
    - 授課時間每節為50分鐘；連續上課2節者為90分鐘，未滿減半支給。
    - 協助教學並實際授課之講座助理，支給數額按同一課程講座鐘點費減半支給。
    - 主辦機關辦理專題演講，得衡酌國際（內）聲譽、學術地位、演講內容及延聘難易程度等因素自行核定支給。
    - 本表自107年2月1日生效。
"""

RATE_TABLE_A012 = """\
rate_table:
  caption: 軍公教人員兼職費支給表
  unit: 新臺幣元/月
  effective: '2018-09-01'
  headers: [官等, 月支數額上限]
  rows:
    - [簡任, '3,500']
    - [薦任, '3,000']
    - [委任, '2,500']
  notes:
    - 基於法令規定或經權責機關核准有數個兼職者，每月最多得領受2個兼職費，且總額以17,000元為限。
    - 單一兼任職務兼職費領受以8,500元為限，但兼任公司常務董事或常駐監察人以12,750元為限。
    - 按實際出席會議次數支給者，每次最高2,500元。
    - 本表自107年9月1日生效。
"""

RATE_TABLE_B039 = """\
rate_table:
  caption: 中央政府各機關學校稿費支給基準數額表
  unit: 新臺幣元
  effective: '2022-12-20'
  sections:
    - title: 撰稿
      headers: [語別, 稿件類型, 支給基準]
      rows:
        - [中文, 一般稿件, '1,100～1,600元/每千字']
        - [中文, 特別稿件, '1,600～3,000元/每千字，或2,000～6,400元/每件（由各機關學校本於權責自行認定）']
        - [外文, 一般稿件, '2,000～3,750元/每千字']
        - [外文, 特別稿件, '3,000～8,000元/每件']
    - title: 校對
      headers: [項目, 支給基準]
      rows:
        - [校對, 撰稿費之5%至10%]
    - title: 審查
      headers: [語別, 支給基準]
      rows:
        - [中文, '300～380元/每千字，或1,220～1,830元/每件']
        - [外文, '380元/每千字，或1,830元/每件']
  notes:
    - 譯稿、潤稿、整冊書籍濃縮、編稿、圖片使用等：由各機關學校依政府採購法相關規定，或本於權責自訂基準辦理。
    - 國家語言除中文以外其他語種之撰稿及審查基準，各機關得衡酌語種項目之特殊性，依政府採購法相關規定或本於權責自訂基準辦理。
"""

RATE_TABLES = {
    'A-酬勞費-010': RATE_TABLE_A010,
    'A-酬勞費-012': RATE_TABLE_A012,
    A004_NEW_ID:    RATE_TABLE_B039,
}

# ─── 輔助：前後端 front-matter 分割 ─────────────────────────────────────────
def split_fm(text: str):
    """回傳 (front_matter_str, body_str)；front_matter 含 ---\n ... ---\n"""
    if not text.startswith('---'):
        return '', text
    end = text.find('\n---', 3)
    if end == -1:
        return '', text
    fm = text[:end + 4]   # 含結尾 ---
    body = text[end + 4:]
    return fm, body

def replace_id_in_fm(fm: str, old_id: str, new_id: str) -> str:
    """替換 front-matter 中的 id: 值"""
    return re.sub(r'^(id:\s*)' + re.escape(old_id) + r'(\s*)$',
                  r'\g<1>' + new_id + r'\g<2>', fm, flags=re.M)

def replace_type_in_fm(fm: str, new_type: str) -> str:
    return re.sub(r'^(type:\s*).*$', r'\g<1>' + new_type, fm, flags=re.M)

def remove_tags_from_fm(fm: str, tags_to_remove: list) -> str:
    """從 YAML list 格式的 tags: 欄位移除指定 tag"""
    for tag in tags_to_remove:
        fm = re.sub(r'^- ' + re.escape(tag) + r'\s*$\n?', '', fm, flags=re.M)
    return fm

def insert_rate_table_before_reviewed(fm: str, rate_table_yaml: str) -> str:
    """在 reviewed: 行之前插入 rate_table block"""
    if 'rate_table:' in fm:
        return fm  # 已存在，跳過
    return re.sub(r'^(reviewed:)', rate_table_yaml + r'\1', fm, flags=re.M)

def bulk_replace_ids(text: str) -> str:
    """把 text 內所有 B-酬勞費-NNN 與 A-酬勞費-004 換成新 ID"""
    for old, new in ALL_MAP.items():
        text = text.replace(old, new)
    return text

# ─── Step 1: 移動並更新 B_支出標準/酬勞費 → C_解釋函令/酬勞費 ───────────────
b_dir = MD_ROOT / 'B_支出標準/酬勞費'
c_dir = MD_ROOT / 'C_解釋函令/酬勞費'

moved = []
for b_file in sorted(b_dir.glob('*.md')):
    content = b_file.read_text(encoding='utf-8')
    fm, body = split_fm(content)
    if not fm:
        print(f'[WARN] 無 front-matter: {b_file.name}')
        continue
    # 取得舊 ID
    m = re.search(r'^id:\s*(.+)', fm, re.M)
    if not m:
        print(f'[WARN] 找不到 id: {b_file.name}')
        continue
    old_id = m.group(1).strip()
    new_id = B_TO_C.get(old_id)
    if not new_id:
        print(f'[WARN] 無對應新 ID: {old_id}')
        continue

    # 更新 fm
    new_fm = replace_id_in_fm(fm, old_id, new_id)
    new_fm = replace_type_in_fm(new_fm, '解釋函令')
    new_content = new_fm + body

    # 目的檔名：保留原檔名（換目錄）
    dest = c_dir / b_file.name
    print(f'  MOVE {old_id} → {new_id}  ({b_file.name})')
    if APPLY:
        dest.write_text(new_content, encoding='utf-8')
        b_file.unlink()
    moved.append((old_id, new_id))

# ─── Step 2: 移動 A-酬勞費-004 → B_支出標準/酬勞費/ 並更新 ─────────────────
a004_file = None
for f in (MD_ROOT / 'A_核心法規/酬勞費').glob('*.md'):
    content = f.read_text(encoding='utf-8')
    if re.search(r'^id:\s*A-酬勞費-004', content, re.M):
        a004_file = f
        break

if a004_file:
    content = a004_file.read_text(encoding='utf-8')
    fm, body = split_fm(content)
    new_fm = replace_id_in_fm(fm, 'A-酬勞費-004', A004_NEW_ID)
    new_fm = replace_type_in_fm(new_fm, '支出標準')
    new_fm = insert_rate_table_before_reviewed(new_fm, RATE_TABLE_B039)
    new_content = new_fm + body
    dest = MD_ROOT / 'B_支出標準/酬勞費' / a004_file.name
    print(f'  MOVE A-酬勞費-004 → {A004_NEW_ID}  ({a004_file.name})')
    if APPLY:
        dest.write_text(new_content, encoding='utf-8')
        a004_file.unlink()
else:
    print('[WARN] 找不到 A-酬勞費-004 檔案')

# ─── Step 3: 更新 02_markdown 內所有 related: 引用 ───────────────────────────
updated_md = []
for mdf in (MD_ROOT / 'A_核心法規/酬勞費').glob('*.md'):
    content = mdf.read_text(encoding='utf-8')
    new_content = bulk_replace_ids(content)
    if new_content != content:
        print(f'  UPDATE related: {mdf.name}')
        updated_md.append(mdf)
        if APPLY:
            mdf.write_text(new_content, encoding='utf-8')

# ─── Step 4: 更新 scenarios/remuneration.json ────────────────────────────────
sc_text = SC_FILE.read_text(encoding='utf-8')
sc_new = bulk_replace_ids(sc_text)
if sc_new != sc_text:
    diff_count = sum(1 for o, n in ALL_MAP.items() if o in sc_text)
    print(f'  UPDATE scenarios/remuneration.json ({diff_count} 種 ID 替換)')
    if APPLY:
        SC_FILE.write_text(sc_new, encoding='utf-8')

# ─── Step 5: 修正多餘的 EXPENSE_LIST tag ──────────────────────────────────────
a_dir = MD_ROOT / 'A_核心法規/酬勞費'
for node_id, bad_tags in WRONG_EXPENSE_TAGS_PER_ID.items():
    found = None
    for mdf in a_dir.glob('*.md'):
        content = mdf.read_text(encoding='utf-8')
        if re.search(rf'^id:\s*{re.escape(node_id)}', content, re.M):
            found = mdf
            break
    if not found:
        print(f'[WARN] 找不到節點 {node_id}')
        continue
    content = found.read_text(encoding='utf-8')
    fm, body = split_fm(content)
    new_fm = remove_tags_from_fm(fm, bad_tags)
    if new_fm != fm:
        print(f'  REMOVE tags {bad_tags} from {node_id}')
        if APPLY:
            found.write_text(new_fm + body, encoding='utf-8')

# ─── Step 6: 加入 rate_table 到 A-010、A-012 ─────────────────────────────────
for node_id, rt_yaml in [('A-酬勞費-010', RATE_TABLE_A010),
                          ('A-酬勞費-012', RATE_TABLE_A012)]:
    found = None
    for mdf in a_dir.glob('*.md'):
        content = mdf.read_text(encoding='utf-8')
        if re.search(rf'^id:\s*{re.escape(node_id)}', content, re.M):
            found = mdf
            break
    if not found:
        print(f'[WARN] 找不到節點 {node_id}')
        continue
    content = found.read_text(encoding='utf-8')
    fm, body = split_fm(content)
    new_fm = insert_rate_table_before_reviewed(fm, rt_yaml)
    if new_fm != fm:
        print(f'  ADD rate_table to {node_id}')
        if APPLY:
            found.write_text(new_fm + body, encoding='utf-8')
    else:
        print(f'  [SKIP] rate_table already in {node_id}')

# ─── 總結 ─────────────────────────────────────────────────────────────────────
print()
if APPLY:
    print(f'✓ 完成！移動 {len(moved)} 個 B→C 卡片，A-004→{A004_NEW_ID}，更新情境 + MD 引用')
else:
    print(f'[DRY-RUN] 將移動 {len(moved)} 個 B→C 卡片。用 --apply 執行。')
