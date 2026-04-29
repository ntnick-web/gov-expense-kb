# Retitle 工作交接 — 2026-04-29

> 本檔由 Claude 在 conversation 即將結束前寫入,作為 context 保險。
> 若 thread 被 compact 或下次從新 session 重啟,把本檔內容 paste 給 Claude 即可無縫接手。
> 工作完全完成後可以刪除。

---

## 已完成(已 push 到 GitHub Pages)

### Commit `251f8d3` — LLM 重抽 460 張卡 title

- 16 批 subagent 讀內文 + 摘要推核心關鍵字
- A 類保留「第N條」前綴、D 類「QN」前綴(由 helper 自動補)
- 20 字硬上限把關
- 跳過 36 份人工精校 + 5 份已廢止 → 處理 479 候選 → 460 改、19 沿用、0 異常
- C-國外-128 結尾斷句手動 patch(`商務艙資格僅能搭經濟艙`)
- 4 張內容重複 C 類已 spawn 另案 task 處理(C-國外-165/174、166/175)

### Commit `1e9b834` — 行動版底部 tabbar

- 修復 ≤880px 完全找不到「條文庫 / 試算表」入口的 bug(原 v2 sidebar `display:none` 又沒替代)
- 加 fixed bottom 3-tab(情境/條文庫/試算表),只在 mobile 顯示
- switchView 同步高亮、切 view 自動捲頂
- DATA_VERSION → `2026-04-29b`

---

## Audit trail(本機 untracked)

位於 `05_scripts/_retitle_proposals/`,**未進 git**(若要進讓我加):

| 檔 | 說明 |
|-----|-----|
| `inputs/batch_NN.jsonl` × 16 | 每批 30 筆 agent 輸入(id / current_title / summary / body_excerpt / tags) |
| `outputs/batch_NN.jsonl` × 16 | 460 筆 LLM 提案(id / new_title / reason) |
| `manifest.json` | 批次索引 + 排除統計 |
| `review.csv` | Excel 對照表(id / category / parent / 舊 / 新 / reason / path)|
| `quality_report.txt` | sanity check 結果 |

## Helper 腳本(已進 git,可重跑)

| 腳本 | 用途 |
|------|------|
| `05_scripts/_retitle_build_batches.py` | 掃 02_markdown,排除人工精校與已廢止,切 30 筆 / batch JSONL |
| `05_scripts/_retitle_apply.py` | JSONL → 寫回 front-matter title(A 類前綴自動補 + 20 字上限)|
| `05_scripts/_retitle_quality_check.py` | 偵測 PII 殘留 / 截斷 / 公文字號 / 重複 / 過短 |

執行範例:
```bash
python 05_scripts/_retitle_build_batches.py --batch-size 30 --clean
# ... 派 agent 讀 inputs/batch_*.jsonl 寫 outputs/batch_*.jsonl ...
python 05_scripts/_retitle_apply.py --csv          # dry-run + 寫 review.csv
python 05_scripts/_retitle_quality_check.py        # 自動 sanity check
python 05_scripts/_retitle_apply.py --apply        # 寫回
python 05_scripts/03_build_index.py                # rebuild
python 05_scripts/04_validate.py                   # 驗證
```

---

## 我目前手上的記憶(非完整內文)

- ✅ review.csv 全 460 筆 reason(每筆一句話)
- ✅ 16 個 subagent 主題分組報告(例:「146-151:護照與簽證」「157-159:行程核准與膳宿費」「269-271:加班與差旅費關係」)
- ✅ ~10 份手讀完整 MD(A-國外-001/002、D-001、C-國內-006、C-國外-128、C-國外-165/166/174/175 等)

**❌ 沒有**:其他 ~470 張卡的完整內文。Subagent context 已釋放,下輪若需要看內文要再開 subagent。

---

## 下次接手:5 個「重整標記」選項(使用者待選)

| 選項 | 內容 | 工法 | 推薦度 |
|------|------|------|--------|
| (1) **重整 `tags:`** | 用新 title + 內文重抽 tags | 16 批 subagent,輸入加新 title 當 hint | ★★★ 最值得做 |
| (2) **重整 `related:`** | 偵測「第 N 條 / QN / 字第」交叉引用 | 程式 grep,擴 `03_build_index.py:_resolve_target_parents` | ★★ |
| (3) **重整 `status:` 部分修正** | 偵測「已被新函釋部分取代」 | 需 LLM 看上下文比對,程式難 | ★ |
| (4) **重整 `review_level:`** | 481 份「自動初校」升二輪精校 | 16 批 subagent + 改進 summary + 補 related | ★★ 但耗工 |
| (5) **重整 `summary` 摘要** | 用新 title + 內文重生「重點摘要」 | 16 批 subagent,可一次同時做 (1) | ★★ |

**推薦組合**:選 (1) + (5) 一起做,因為 subagent 反正要讀內文,順手出兩樣。

---

## 知道但尚未動的待辦

- **dedup 4 張重複內容**:C-國外-165 vs 174、166 vs 175 內容兩兩相同(已 spawn task,prompt 含完整指引)
- **19 份「沿用」proposal**:名義 no_change,有些是原 title 已 OK,有些是邊緣 case 可二次精修
- **`05_scripts/_retitle_proposals/` 進 git?**:audit 用,目前 untracked

---

## 環境 / 操作提示給接手 Claude

- 專案 root:`C:\Users\user\OneDrive\桌面\支出規定視覺化資料庫`
- `CLAUDE.md` git ignored 但本機完整(2026-04-25 起 untrack,避免敏感資訊)
- Preview server:port 8765,serverId 動態(用 `mcp__Claude_Preview__preview_list` 拿)
- **Bash 中文 stdout 會 mojibake** — 看 file 內容用 Read tool,不要用 `grep | head | python` 接 stdin
- 啟動指令:`python -m http.server 8765` 從 root 跑,訪問 `http://localhost:8765/04_web/`

---

## Paste 給接手 Claude 的 prompt 範本

> 我要繼續 retitle 後的標記重整工作。先讀 `docs/_handoff_retitle.md` 了解進度,再讀 CLAUDE.md。我選擇 [(1)/(2)/(3)/(4)/(5) 或組合]。動手前簡述方案讓我確認。
