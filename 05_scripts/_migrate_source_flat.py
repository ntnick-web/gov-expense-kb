"""
_migrate_source_flat.py — 一次性 00_source/ 扁平化 + _manifest.csv status 欄位升級

功能
----
1. 把 00_source/ 子資料夾內的所有檔案移到 00_source/ 根目錄
2. 重建 _manifest.csv，加入 status 欄位：
   - 來自子資料夾（已跑過 extract/parse）→ parsed
   - 根目錄原有檔案，不在 manifest    → new（尚未處理）
   - _skip.txt 中列出的               → skip
   - 原 manifest 已有 status 值       → 保留
3. 刪除已清空的子資料夾
4. 空目錄（01_國科會/02_成功大學/03_教育部）一並清除

用法
----
  python 05_scripts/_migrate_source_flat.py          # dry-run 預覽
  python 05_scripts/_migrate_source_flat.py --apply  # 實際執行

注意
----
- _ 開頭的 metadata 檔（_manifest.csv/_skip.txt/etc.）不移動
- 名稱衝突時自動加 _2/_3 後綴
"""

from __future__ import annotations

import argparse
import csv
import io
import shutil
import sys
from collections import Counter
from pathlib import Path

# Windows 主控台強制 UTF-8
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ROOT          = Path(__file__).resolve().parent.parent
SOURCE_DIR    = ROOT / '00_source'
MANIFEST_PATH = SOURCE_DIR / '_manifest.csv'
SKIP_PATH     = SOURCE_DIR / '_skip.txt'

SUPPORTED_SUFFIXES = {'.pdf', '.docx', '.md', '.markdown', '.txt', '.html', '.htm', '.odt'}
MANIFEST_HEADERS   = ['filename', 'category', 'parent', 'agency', 'version', 'notes', 'status']


# ── 讀取輔助 ──────────────────────────────────────────────────────────────────

def load_existing_manifest() -> dict[str, dict[str, str]]:
    """讀現有 _manifest.csv（key = filename）。"""
    if not MANIFEST_PATH.exists():
        return {}
    rows: dict[str, dict[str, str]] = {}
    with MANIFEST_PATH.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            fname = (row.get('filename') or '').strip()
            if fname:
                rows[fname] = {k: (v or '').strip() for k, v in row.items()}
    return rows


def load_skip_set() -> set[str]:
    """讀 _skip.txt，回傳檔名 set。"""
    if not SKIP_PATH.exists():
        return set()
    out: set[str] = set()
    for line in SKIP_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            out.add(line)
    return out


# ── 掃描 ─────────────────────────────────────────────────────────────────────

def scan_files() -> tuple[list[Path], list[Path]]:
    """
    回傳 (子資料夾內的檔案, 根目錄的檔案)。
    排除：_ 開頭的 metadata 檔、非 SUPPORTED_SUFFIXES 的格式。
    """
    subdir_files: list[Path] = []
    root_files:   list[Path] = []
    for p in sorted(SOURCE_DIR.rglob('*')):
        if not p.is_file():
            continue
        if p.name.startswith('_'):
            continue
        if p.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        if p.parent == SOURCE_DIR:
            root_files.append(p)
        else:
            subdir_files.append(p)
    return subdir_files, root_files


# ── 名稱衝突解決 ──────────────────────────────────────────────────────────────

def resolve_name(fname: str, occupied: set[str]) -> str:
    """名稱衝突時加 _2/_3 後綴。"""
    if fname not in occupied:
        return fname
    stem   = Path(fname).stem
    suffix = Path(fname).suffix
    i = 2
    while True:
        candidate = f'{stem}_{i}{suffix}'
        if candidate not in occupied:
            return candidate
        i += 1


def plan_migration(
    subdir_files: list[Path],
    root_files: list[Path],
) -> list[tuple[Path, Path]]:
    """規劃 (src, dst) 移動清單，dst 都在 SOURCE_DIR 根目錄。"""
    occupied: set[str] = {f.name for f in root_files}
    moves: list[tuple[Path, Path]] = []
    for src in subdir_files:
        new_name = resolve_name(src.name, occupied)
        dst = SOURCE_DIR / new_name
        occupied.add(new_name)
        moves.append((src, dst))
    return moves


# ── Manifest 建構 ─────────────────────────────────────────────────────────────

def build_new_manifest(
    moves: list[tuple[Path, Path]],
    root_files: list[Path],
    existing_manifest: dict[str, dict[str, str]],
    skip_set: set[str],
) -> list[dict[str, str]]:
    """建立新的 manifest rows（含 status 欄位）。"""

    def make_row(dst_name: str, orig_path: Path) -> dict[str, str]:
        # 用原始或新名查現有 manifest（可能已有 category/parent/agency）
        existing = (
            existing_manifest.get(orig_path.name)
            or existing_manifest.get(dst_name)
            or {}
        )
        # 判斷 status
        if dst_name in skip_set or orig_path.name in skip_set:
            status = 'skip'
        elif existing.get('status'):
            status = existing['status']       # 保留已有值
        elif orig_path.parent != SOURCE_DIR:
            status = 'parsed'                 # 子資料夾 = 已跑過管線
        else:
            status = 'new'                    # 根目錄新檔 = 待處理
        return {
            'filename': dst_name,
            'category': existing.get('category', ''),
            'parent':   existing.get('parent', ''),
            'agency':   existing.get('agency', ''),
            'version':  existing.get('version', ''),
            'notes':    existing.get('notes', ''),
            'status':   status,
        }

    rows: list[dict[str, str]] = []
    for src, dst in moves:
        rows.append(make_row(dst.name, src))
    for p in root_files:
        rows.append(make_row(p.name, p))
    return rows


def write_manifest(rows: list[dict[str, str]]) -> None:
    with MANIFEST_PATH.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_HEADERS, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)


# ── 主程式 ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(
        description='00_source/ 扁平化 + _manifest.csv status 欄位升級'
    )
    ap.add_argument('--apply', action='store_true', help='實際執行（預設 dry-run）')
    args = ap.parse_args()
    dry_run = not args.apply

    existing_manifest          = load_existing_manifest()
    skip_set                   = load_skip_set()
    subdir_files, root_files   = scan_files()
    moves                      = plan_migration(subdir_files, root_files)
    new_manifest               = build_new_manifest(moves, root_files, existing_manifest, skip_set)

    conflicts     = [(s, d) for s, d in moves if s.name != d.name]
    status_counts = Counter(r['status'] for r in new_manifest)

    print(f'\n{"─"*64}')
    print(f'00_source/ 扁平化計畫  {"(dry-run)" if dry_run else "(執行中)"}')
    print(f'{"─"*64}')
    print(f'  子資料夾檔案（待移動）: {len(subdir_files):>5} 個')
    print(f'  根目錄已有檔案        : {len(root_files):>5} 個')
    print(f'  名稱衝突需改名        : {len(conflicts):>5} 個')
    print(f'  manifest 新總筆數     : {len(new_manifest):>5} 筆')
    print()
    print('  新 status 分布：')
    for st, cnt in sorted(status_counts.items()):
        print(f'    {st:<15} {cnt:>5} 個')

    if conflicts:
        print(f'\n  名稱衝突改名清單（{len(conflicts)} 個）：')
        for s, d in conflicts:
            print(f'    {s.name}  →  {d.name}')

    if dry_run:
        print(f'\n加 --apply 才會實際執行。')
        return

    # ── 執行移動 ──
    moved = skipped_exist = 0
    for src, dst in moves:
        if dst.exists():
            print(f'  ⚠  目標已存在，跳過: {dst.name}')
            skipped_exist += 1
            continue
        shutil.move(str(src), str(dst))
        moved += 1

    print(f'\n  已移動 {moved} 個檔案' + (f'（{skipped_exist} 個因衝突跳過）' if skipped_exist else ''))

    # ── 刪除空目錄（從最深層開始）──
    deleted: list[str] = []
    for d in sorted(SOURCE_DIR.rglob('*'), key=lambda x: len(x.parts), reverse=True):
        if d.is_dir() and d != SOURCE_DIR:
            try:
                d.rmdir()           # 只有空目錄才會成功
                deleted.append(str(d.relative_to(SOURCE_DIR)))
            except OSError:
                pass                # 仍有檔案，跳過
    if deleted:
        print(f'  已刪除空目錄: {", ".join(deleted)}')

    # ── 寫 manifest ──
    write_manifest(new_manifest)
    print(f'  已寫入 _manifest.csv（{len(new_manifest)} 筆，含 status 欄位）')
    print(f'\n✅ 扁平化完成')


if __name__ == '__main__':
    main()
