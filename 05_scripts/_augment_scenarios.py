"""_augment_scenarios.py — 為 04_web/data/scenarios.json 既有情境補
attachments / approvers / flow 三欄位。

設計原則
- 不刪改既有欄位 (id/title/icon/subtitle/parent/primary_ids/tags 維持)
- approvers 預設用 DEFAULT_APPROVERS,各情境可覆寫
- attachments 逐情境列出(短語句)
- flow 僅 6 個 PoC(每母題 2 個):跨夜住宿(已內建)、自駕、機票艙等、住宿生活費、
  採購結報、憑證遺失。flow 結論文字保守,具體數字與適用條件由 refs 連到 SSOT。

用法
    python 05_scripts/_augment_scenarios.py            # dry-run
    python 05_scripts/_augment_scenarios.py --apply

輸出
    寫回 04_web/data/scenarios.json,版本欄 → 今日。

可重跑;若 overnight 已有 flow 會以本檔為主覆蓋(因為內容同步到此處)。
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCENARIOS_PATH = ROOT / "04_web" / "data" / "scenarios.json"

# ─────────────────────────────────────────────
# 預設簽核層級(大多數情境通用)
# ─────────────────────────────────────────────
DEFAULT_APPROVERS = [
    "申請/出差人員填表",
    "單位主管(直屬)核章",
    "主辦會計核章",
    "機關首長核定(依授權表層級;機關首長得授權單位主管)",
]

# 採購類加 政風與驗收
APPROVERS_PROCUREMENT = [
    "申請/承辦人員填表",
    "採購經辦或驗收小組核章",
    "單位主管核章",
    "主辦會計核章",
    "機關首長核定(若涉政府採購法第 105/106 條情形,加會政風)",
]

# 跨機關/數計畫分攤
APPROVERS_SHARED = [
    "主辦/承辦人員填表",
    "單位主管核章",
    "各受益機關/計畫主辦人或會辦同意",
    "主辦會計核章",
    "機關首長核定",
]

# 員工待遇/匯款支付:加會人事
APPROVERS_PAYMENT = [
    "承辦人員填表",
    "人事單位核章(若涉薪資/酬勞印領)",
    "單位主管核章",
    "主辦會計核章",
    "機關首長核定",
]

# 憑證遺失:特別核處
APPROVERS_LOST = [
    "申請人具結書(說明遺失原因、金額、用途)",
    "單位主管證明文件",
    "主辦會計核章",
    "機關首長特別核處",
]


# ─────────────────────────────────────────────
# 各情境 attachments(必要附件) 與 approvers(若需覆寫預設)
# 鍵 = scenarios.json 內 id
# ─────────────────────────────────────────────
SCENARIO_DATA: dict[str, dict] = {
    # === 國內旅費 ===
    "day-trip": {
        "attachments": [
            "車票/票根 或 高鐵/火車購票證明",
            "出差行程表 / 派令",
            "若使用經費結報系統:無須檢附票根(B-國內旅費-001 備註一)",
        ],
    },
    "overnight": {
        # 跨夜住宿 — flow 已在主檔手動寫入,此處保留 attachments/approvers 同步,
        # flow 也再寫一次以利可重跑。
        "attachments": [
            "住宿發票或收據(必須有住宿事實)",
            "出差行程表 / 派令",
            "若 < 60 公里:事前機關核准之簽呈或核准函",
            "若購買含住宿之套裝行程:行程憑證且加計後不超過住宿費 + 交通費規定數額",
        ],
    },
    "premium-class": {
        "attachments": [
            "票根或購票證明(搭乘商務艙/車廂者必附)",
            "出差行程表 / 派令",
            "搭乘商務艙者:身分為部會及相當部會以上首長/副首長之證明,或經主管機關核准上提艙等之文件",
        ],
    },
    "self-drive": {
        "attachments": [
            "出差行程表(列必要路程公里數與起訖點)",
            "公里數計算依據(地圖軟體截圖、機關核處表)",
            "車輛行照影本(初次申請或更換時)",
            "不得另檢附油料費、過路費、停車費收據",
        ],
    },
    "from-home": {
        "attachments": [
            "出差行程表(註明起訖點與居住地)",
            "車票/票根 或 購票證明",
            "若距機關所在地較短:覈實報支實付金額",
        ],
    },
    "necessary-distance": {
        "attachments": [
            "公里數計算依據(地圖軟體 / 機關核處表)",
            "出差行程表",
            "若採機關自訂公里數標準:援引依據之機關內規",
        ],
    },
    "discount-ticket": {
        "attachments": [
            "車票/票根",
            "購票證明(顯示優惠價或票種)",
            "出差行程表",
            "若使用敬老/愛心票:身分證明影本(首次申請時)",
        ],
    },
    "change-transport": {
        "attachments": [
            "實際搭乘之車票/票根",
            "出差行程表",
            "改搭原因說明(若超過原核定報支上限,需事前簽准)",
        ],
    },
    "taxi": {
        "attachments": [
            "計程車收據或發票(載明日期、金額)",
            "搭乘原因說明(載重物、夜間無大眾運輸、出差地點偏遠等)",
            "出差行程表",
        ],
    },
    "package-tour": {
        "attachments": [
            "套裝行程憑證(列住宿+交通內容、總金額)",
            "出差行程表",
            "確認加計後不超過住宿費 + 交通費規定數額(B-國內旅費-001 備註一)",
        ],
    },
    "incidental": {
        "attachments": [
            "雜費單據(覈實,例如停車費、過路費、行李托運費等)",
            "出差行程表(列出差日數)",
            "雜費每日上限 400 元(B-國內旅費-001)",
        ],
    },
    "training": {
        "attachments": [
            "訓練/講習公文或開課通知",
            "出差行程表 / 派令",
            "報名費收據(若有)",
            "結業/出席證明(返後檢附)",
        ],
    },
    # === 國外旅費 ===
    "abroad-basic": {
        "attachments": [
            "奉准出國行程及日數核定文件",
            "派令 / 出國申請書",
            "預算單位簽認之經費來源文件",
            "返國後 1 個月內歸國報告",
        ],
    },
    "abroad-airfare": {
        "attachments": [
            "電子機票或機票收據(顯示艙等與票價)",
            "登機證(返後檢附)",
            "搭商務艙以上者:身分證明或主管機關核准上提艙等之公文",
        ],
    },
    "abroad-living": {
        "attachments": [
            "出差行程表(列出每日駐留地點與日期)",
            "住宿憑證(若採覈實住宿項目時)",
            "30 日後遞減 2/3、60 日後遞減 1/2 之計算表(同地長期出差)",
        ],
    },
    "abroad-insurance": {
        "attachments": [
            "保險繳費憑證(平安保險/綜合保險)",
            "護照規費收據、簽證費收據",
            "出國照片費收據(以 2 吋彩色照規定範圍內為準)",
        ],
    },
    "abroad-meeting": {
        "attachments": [
            "會議邀請函或議程",
            "註冊費收據 / 會議報名費發票",
            "出席證明",
            "返國後歸國報告(含會議要旨摘要)",
        ],
    },
    "abroad-china": {
        "attachments": [
            "赴陸 / 港澳出差核准文件(兩岸條例第 9 條相關)",
            "派令 / 行程表",
            "保險證明",
            "返後歸國報告",
        ],
        "approvers": [
            "申請/出差人員填表",
            "單位主管核章",
            "主管機關核准赴陸或港澳出差(兩岸條例)",
            "主辦會計核章",
            "機關首長核定",
        ],
    },
    "abroad-incident": {
        "attachments": [
            "事件證明文件(司法/醫療/警察單位開立)",
            "原派令或行程表",
            "改期或終止公差之核定文件",
            "後續申請或停發旅費之計算表",
        ],
        "approvers": [
            "出差人員或代理人",
            "單位主管核章",
            "主辦會計核章",
            "機關首長即時核處",
        ],
    },
    # === 支出憑證與結報 ===
    "voucher-types": {
        "attachments": [
            "原始憑證(發票、收據、匯款單、印領清冊等)",
            "經費結報單 / 傳票",
            "用途說明(必要時)",
        ],
    },
    "voucher-receipt": {
        "attachments": [
            "統一發票或收據(載明賣方名稱、統編、品名、金額、日期)",
            "若收據:加蓋負責人或發票人印章",
            "若需外幣折算:匯率依據(銀行牌價或結匯水單)",
        ],
    },
    "voucher-electronic": {
        "attachments": [
            "電子發票證明聯(列印或下載 PDF)",
            "網路交易付款證明(信用卡帳單、線上轉帳收據、第三方支付對帳單)",
            "商品/服務說明(必要時截圖訂單)",
        ],
    },
    "voucher-procurement": {
        "attachments": [
            "決標公告或契約",
            "驗收紀錄 / 履約確認單",
            "原始憑證(發票或請款單)",
            "若涉政府採購法第 105/106 條:加附情形說明",
        ],
        "approvers": APPROVERS_PROCUREMENT,
    },
    "voucher-payment": {
        "attachments": [
            "薪資/酬勞印領清冊(具領訖簽章)",
            "匯款證明 / 轉帳明細",
            "扣繳憑單(若涉所得稅扣繳)",
            "二代健保補充保費繳款證明(若達門檻)",
        ],
        "approvers": APPROVERS_PAYMENT,
    },
    "voucher-shared": {
        "attachments": [
            "經費分攤依據之計畫或契約",
            "分攤計算表(列各機關/計畫分攤比例)",
            "各受益機關或計畫主辦人之同意函",
            "原始憑證影本(已分攤予他機關時)",
        ],
        "approvers": APPROVERS_SHARED,
    },
    "voucher-lost": {
        "attachments": [
            "申請人具結書(載明遺失原因、金額、品名、用途、日期)",
            "替代證明:信用卡帳單、銀行匯款紀錄、廠商出具之證明書",
            "單位主管證明文件",
        ],
        "approvers": APPROVERS_LOST,
    },
    "voucher-foreign": {
        "attachments": [
            "國外發票 / Invoice(載明賣方、品項、金額、日期)",
            "信用卡帳單 或 匯款證明",
            "結匯水單或銀行牌告匯率截圖(換算新臺幣依據)",
            "服務內容說明(網路研討會註冊頁、會議議程截圖等)",
        ],
    },
}


# ─────────────────────────────────────────────
# 條件問答 flow(6 個 PoC,每母題 2 個)
# 為避免錯標金額/條件,結論盡量簡短,具體規範由 refs 連到 SSOT。
# ─────────────────────────────────────────────
FLOWS: dict[str, dict] = {
    # 1. 國內 跨夜住宿(完整 flow,與 scenarios.json 主檔內容一致)
    "overnight": {
        "start": "distance",
        "questions": {
            "distance": {
                "label": "出差地距機關所在地是否 ≥ 60 公里?",
                "options": [
                    {"label": "≥ 60 公里(一般情況)", "next": "weekday"},
                    {"label": "< 60 公里(例外)",   "conclude": "under60"},
                ],
            },
            "weekday": {
                "label": "投宿日是平日還是行政院公告之假日?",
                "hint": "假日含放假日前一天,不含放假日最後一天(B-國內旅費-001 備註二)。",
                "options": [
                    {"label": "平日",                       "next": "long_stay_wk"},
                    {"label": "假日(含放假日前一天)",     "next": "long_stay_hd"},
                ],
            },
            "long_stay_wk": {
                "label": "在同一地點出差是否超過 1 個月?",
                "options": [
                    {"label": "未滿 1 個月",                  "conclude": "wk_normal"},
                    {"label": "超過 1 個月、未滿 2 個月部分", "conclude": "wk_long_8"},
                    {"label": "2 個月以上部分",                "conclude": "wk_long_7"},
                ],
            },
            "long_stay_hd": {
                "label": "在同一地點出差是否超過 1 個月?",
                "options": [
                    {"label": "未滿 1 個月",                  "conclude": "hd_normal"},
                    {"label": "超過 1 個月、未滿 2 個月部分", "conclude": "hd_long_8"},
                    {"label": "2 個月以上部分",                "conclude": "hd_long_7"},
                ],
            },
        },
        "conclusions": {
            "under60": {
                "title": "< 60 公里:原則不得報支住宿費",
                "limit": "—",
                "note": "因業務需要、事前經機關核准且確有住宿事實者,得依例外規定辦理(A-國內旅費-009 第 2 項)。",
                "refs": ["A-國內旅費-009"],
            },
            "wk_normal": {
                "title": "平日,1 個月內 — 可報住宿費",
                "limit": "上限 3,500 元/夜,覈實報支",
                "refs": ["A-國內旅費-009", "B-國內旅費-001"],
            },
            "wk_long_8": {
                "title": "平日,超過 1 個月、未滿 2 個月部分 — 8 折",
                "limit": "上限 2,800 元/夜(3,500 × 0.8),覈實報支",
                "refs": ["A-國內旅費-009", "A-國內旅費-011", "B-國內旅費-001"],
            },
            "wk_long_7": {
                "title": "平日,2 個月以上部分 — 7 折",
                "limit": "上限 2,450 元/夜(3,500 × 0.7),覈實報支",
                "refs": ["A-國內旅費-009", "A-國內旅費-011", "B-國內旅費-001"],
            },
            "hd_normal": {
                "title": "假日,1 個月內 — 可報住宿費",
                "limit": "上限 4,500 元/夜,覈實報支",
                "refs": ["A-國內旅費-009", "B-國內旅費-001"],
            },
            "hd_long_8": {
                "title": "假日,超過 1 個月、未滿 2 個月部分 — 8 折",
                "limit": "上限 3,600 元/夜(4,500 × 0.8),覈實報支",
                "refs": ["A-國內旅費-009", "A-國內旅費-011", "B-國內旅費-001"],
            },
            "hd_long_7": {
                "title": "假日,2 個月以上部分 — 7 折",
                "limit": "上限 3,150 元/夜(4,500 × 0.7),覈實報支",
                "refs": ["A-國內旅費-009", "A-國內旅費-011", "B-國內旅費-001"],
            },
        },
    },
    # 2. 國內 自駕汽機車
    "self-drive": {
        "start": "vehicle",
        "questions": {
            "vehicle": {
                "label": "使用何種車輛出差?",
                "hint": "汽機車交通費依公里數覈計;不得另報油料、過路、停車費。",
                "options": [
                    {"label": "自用或租賃汽車",     "next": "necessary"},
                    {"label": "機車",                 "next": "necessary"},
                    {"label": "自行車",               "conclude": "bike"},
                    {"label": "共享汽車(GoShare 等)", "next": "necessary"},
                ],
            },
            "necessary": {
                "label": "是否符合「必要路程」(機關核處公里數)?",
                "options": [
                    {"label": "是,有機關核處公里數",     "next": "rate"},
                    {"label": "否,自由路徑",             "conclude": "no_necessary"},
                ],
            },
            "rate": {
                "label": "車輛種類(再次確認)?",
                "options": [
                    {"label": "汽車(含租賃 / 共享)", "conclude": "car"},
                    {"label": "機車",                   "conclude": "scooter"},
                ],
            },
        },
        "conclusions": {
            "car": {
                "title": "汽車 — 依公里數報支",
                "limit": "每公里 3 元,以機關核處之必要路程為準;不得另報油料、過路、停車費",
                "refs": ["A-國內旅費-005", "D-國內旅費-009", "D-國內旅費-010"],
            },
            "scooter": {
                "title": "機車 — 依公里數報支",
                "limit": "每公里 2 元,以機關核處之必要路程為準;不得另報油料、過路、停車費",
                "refs": ["A-國內旅費-005", "D-國內旅費-009", "D-國內旅費-010"],
            },
            "bike": {
                "title": "自行車 — 不另計交通費",
                "limit": "—",
                "note": "現行國內出差旅費要點未對自行車訂報支標準。",
                "refs": ["A-國內旅費-005"],
            },
            "no_necessary": {
                "title": "未符必要路程 — 原則不得報支",
                "limit": "—",
                "note": "公里數須由機關核處;若無核處依據,應補簽核或改採實際大眾運輸覈實報支。",
                "refs": ["A-國內旅費-005", "D-國內旅費-009"],
            },
        },
    },
    # 3. 國外 機票艙等
    "abroad-airfare": {
        "start": "rank",
        "questions": {
            "rank": {
                "label": "出差人員身分?",
                "options": [
                    {"label": "部會及相當部會以上首長 / 副首長", "conclude": "senior"},
                    {"label": "其他人員",                           "next": "upgrade"},
                ],
            },
            "upgrade": {
                "label": "是否經主管機關 / 機關首長核准上提艙等?",
                "hint": "上提艙等須有具體事由(連續飛行時數、業務性質、體況等)及核准文件。",
                "options": [
                    {"label": "是,有上提核准", "conclude": "upgraded"},
                    {"label": "否",             "conclude": "economy"},
                ],
            },
        },
        "conclusions": {
            "senior": {
                "title": "首長 / 副首長 — 可乘商務艙",
                "limit": "得乘坐商務艙(車廂)或相同等級之座(艙)位",
                "refs": ["A-國外旅費-005", "A-國外旅費-006"],
            },
            "upgraded": {
                "title": "其他人員 + 經核准上提 — 可乘核准等級",
                "limit": "依主管機關核准之艙等(通常為商務艙)報支",
                "refs": ["A-國外旅費-005", "A-國外旅費-006", "A-國外旅費-016"],
            },
            "economy": {
                "title": "其他人員 — 經濟艙",
                "limit": "搭乘經濟(標準)艙;機票價依各地區規定上限報支",
                "refs": ["A-國外旅費-005", "A-國外旅費-006", "A-國外旅費-017"],
            },
        },
    },
    # 4. 國外 住宿與生活費
    "abroad-living": {
        "start": "days",
        "questions": {
            "days": {
                "label": "在同一地點出差總日數?",
                "hint": "同一地點長期出差日支生活費有遞減規定。",
                "options": [
                    {"label": "30 日以內",      "conclude": "short"},
                    {"label": "31 ~ 60 日部分", "conclude": "mid"},
                    {"label": "61 日以上部分",  "conclude": "long"},
                ],
            },
        },
        "conclusions": {
            "short": {
                "title": "30 日以內 — 全額日支",
                "limit": "依各地區附表規定數額(住宿費 + 生活費 + 零用費)全額報支",
                "refs": ["A-國外旅費-007", "A-國外旅費-011"],
            },
            "mid": {
                "title": "31 ~ 60 日部分 — 遞減為 2/3",
                "limit": "在同一地點停留逾 30 日後,自第 31 日起減為原規定數額之 2/3",
                "refs": ["A-國外旅費-011"],
            },
            "long": {
                "title": "61 日以上部分 — 遞減為 1/2",
                "limit": "在同一地點停留逾 60 日後,自第 61 日起減為原規定數額之 1/2",
                "refs": ["A-國外旅費-011"],
            },
        },
    },
    # 5. 結報 採購案
    "voucher-procurement": {
        "start": "amount",
        "questions": {
            "amount": {
                "label": "本次採購金額在哪個級距?",
                "hint": "公告金額目前為新臺幣 150 萬元(工程/財物/勞務)。",
                "options": [
                    {"label": "未達公告金額(150 萬以下)", "next": "small"},
                    {"label": "公告金額以上",                 "conclude": "above"},
                ],
            },
            "small": {
                "label": "是否屬政府採購法第 22 條限制性招標 / 105 / 106 條情形?",
                "options": [
                    {"label": "否,一般小額採購",    "conclude": "small_normal"},
                    {"label": "是,有特殊事由",      "conclude": "small_special"},
                ],
            },
        },
        "conclusions": {
            "small_normal": {
                "title": "小額採購 — 一般原始憑證",
                "limit": "—",
                "note": "檢附發票/收據與經費結報單即可,毋須決標公告;若超過小額採購金額仍須符合招標規定。",
                "refs": ["A-支出憑證與結報-007", "D-支出憑證與結報-007"],
            },
            "small_special": {
                "title": "小額但有特殊事由 — 加附事由說明",
                "limit": "—",
                "note": "依政府採購法相關條文(限制性招標、緊急、獨家等)檢附事由及核准文件。",
                "refs": ["A-支出憑證與結報-007", "D-支出憑證與結報-009", "D-支出憑證與結報-023"],
            },
            "above": {
                "title": "公告金額以上 — 須完整採購程序",
                "limit": "—",
                "note": "依政府採購法辦理招標、決標、簽約、驗收;結報應檢附決標公告、契約、驗收紀錄與原始憑證。",
                "refs": ["A-支出憑證與結報-007", "D-支出憑證與結報-009"],
            },
        },
    },
    # 6. 結報 憑證遺失
    "voucher-lost": {
        "start": "alt",
        "questions": {
            "alt": {
                "label": "是否能取得替代證明?(信用卡帳單 / 銀行匯款 / 廠商證明書 等)",
                "options": [
                    {"label": "是,可取得",     "next": "amount"},
                    {"label": "否,無法取得",   "conclude": "none"},
                ],
            },
            "amount": {
                "label": "金額大小?",
                "options": [
                    {"label": "小額(不影響審計重大性)",     "conclude": "small"},
                    {"label": "重大金額或審計關注事項",       "conclude": "large"},
                ],
            },
        },
        "conclusions": {
            "small": {
                "title": "小額 + 有替代證明 — 機關首長核處可代用",
                "limit": "—",
                "note": "檢附申請人具結書 + 替代證明,經機關首長核處後得替代原始憑證。",
                "refs": ["A-支出憑證與結報-012"],
            },
            "large": {
                "title": "重大金額 + 有替代證明 — 專案核處",
                "limit": "—",
                "note": "金額較大或屬審計重大事項時,除替代證明外,應由機關專案簽報、必要時函詢主辦會計或審計機關意見。",
                "refs": ["A-支出憑證與結報-012"],
            },
            "none": {
                "title": "無替代證明 — 原則不得報支",
                "limit": "—",
                "note": "若無任何足以證明支出事實之文件,該筆支出原則不得報支;申請人應自行賠償或請款失敗。",
                "refs": ["A-支出憑證與結報-012"],
            },
        },
    },
}


# ─────────────────────────────────────────────
# 新增情境(Phase 2-C)— 限現有 3 母題範圍
# 從 64 筆未覆蓋的 D-支出憑證與結報-* 整理出 7 個高頻主題,各自綁 5~10 個 Q&A
# 原則:primary_ids 一定指向現有 SSOT 節點,否則點進去 0 卡
# ─────────────────────────────────────────────
NEW_SCENARIOS: list[dict] = [
    {
        "id": "voucher-grants",
        "title": "捐助 / 補助民間團體",
        "icon": "🤲",
        "subtitle": "對民間團體捐助案件的核銷、銷毀、抽查",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-003",
            "D-支出憑證與結報-053",
            "D-支出憑證與結報-054",
            "D-支出憑證與結報-055",
            "D-支出憑證與結報-056",
            "D-支出憑證與結報-057",
        ],
        "tags": ["補助核定", "原始憑證", "憑證存管"],
        "attachments": [
            "捐助 / 補助核定文件",
            "受捐助團體出具之收據",
            "經費執行成果報告 / 核結文件",
            "原始憑證留存清冊(若依規定銷毀則留銷毀紀錄)",
        ],
    },
    {
        "id": "meeting-meals",
        "title": "會議便當 / 茶水 / 出席費",
        "icon": "🍱",
        "subtitle": "會議費用、便當、茶水、出席費的核銷要件",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-004",
            "D-支出憑證與結報-035",
            "D-支出憑證與結報-038",
            "D-支出憑證與結報-048",
            "D-支出憑證與結報-049",
            "D-支出憑證與結報-050",
            "D-支出憑證與結報-051",
        ],
        "tags": ["會議費", "膳費", "出席費", "原始憑證"],
        "attachments": [
            "會議簽呈 / 開會通知",
            "出(列)席名冊或簽到紀錄",
            "便當/茶水之原始憑證(統一發票或收據)",
            "出席費印領清冊(若涉學者專家出席費)",
        ],
    },
    {
        "id": "year-end-closing",
        "title": "跨年度結報 / 會計關帳",
        "icon": "📅",
        "subtitle": "未及關帳前辦理之採購與經費結報處理",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-042",
            "D-支出憑證與結報-044",
            "D-支出憑證與結報-045",
        ],
        "tags": ["原始憑證", "採購", "公差派遣", "補助核定"],
        "attachments": [
            "跨年度權責採購之契約 / 履約紀錄",
            "次年度開立之原始憑證(如統一發票)",
            "會計年度關帳前後核銷之說明文件",
            "預算保留 / 應付款項簽報",
        ],
    },
    {
        "id": "voucher-receipts",
        "title": "普通收據與發票要件",
        "icon": "🧾",
        "subtitle": "統一發票、普通收據、電子發票的格式與必要記載",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-006",
            "D-支出憑證與結報-010",
            "D-支出憑證與結報-011",
            "D-支出憑證與結報-013",
            "D-支出憑證與結報-014",
            "D-支出憑證與結報-015",
            "D-支出憑證與結報-016",
            "D-支出憑證與結報-017",
        ],
        "tags": ["原始憑證", "電子憑證"],
        "attachments": [
            "統一發票(載明買方為機關名稱、統編)",
            "普通收據(具名、金額、品名、日期 + 開立人簽章)",
            "電子發票證明聯",
            "若發票買方為個人:加附差旅費 / 出差核定文件作為連結",
        ],
    },
    {
        "id": "procurement-detail",
        "title": "採購履約 / 驗收 / 保證金退還",
        "icon": "📋",
        "subtitle": "採購案件履約、退保、結算結報的常見疑義",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-034",
            "D-支出憑證與結報-039",
            "D-支出憑證與結報-040",
            "D-支出憑證與結報-047",
            "D-支出憑證與結報-059",
            "D-支出憑證與結報-060",
            "D-支出憑證與結報-061",
            "D-支出憑證與結報-062",
            "D-支出憑證與結報-063",
        ],
        "tags": ["採購", "原始憑證", "保險費"],
        "approvers": APPROVERS_PROCUREMENT,
        "attachments": [
            "契約 / 決標公告",
            "履約紀錄 / 工程結算書",
            "驗收紀錄",
            "原始憑證(發票或請款單)",
            "保證金退還申請書(若涉退保)",
        ],
    },
    {
        "id": "voucher-misc",
        "title": "訂閱報紙 / 水電 / 印刷 / 禮品",
        "icon": "📰",
        "subtitle": "報紙訂閱、水電、印刷、禮品(券)等雜項憑證要件",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-006",
            "D-支出憑證與結報-024",
            "D-支出憑證與結報-036",
            "D-支出憑證與結報-037",
            "D-支出憑證與結報-070",
        ],
        "tags": ["原始憑證", "電子憑證", "禮品交際", "採購"],
        "attachments": [
            "訂閱契約 / 訂閱單(報紙、期刊)",
            "水電費繳費單 / 銀行扣繳證明",
            "印刷品樣張或目錄(若為印刷費)",
            "禮品(券)發放清冊(具領訖簽章)",
        ],
    },
    {
        "id": "voucher-welfare",
        "title": "員工健檢 / 進修補助 / 國旅卡",
        "icon": "💼",
        "subtitle": "員工福利衍生支出之核銷與所需文件",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-028",
            "D-支出憑證與結報-030",
            "D-支出憑證與結報-041",
            "D-支出憑證與結報-043",
        ],
        "tags": ["原始憑證", "補助核定", "出國進修", "教育訓練費"],
        "approvers": APPROVERS_PAYMENT,
        "attachments": [
            "核定文件(健檢核定、進修補助、休假補助辦法)",
            "個人領據或匯款證明",
            "原始憑證(健檢、進修課程發票)",
            "扣繳憑單(若涉所得稅扣繳)",
        ],
    },
    # ── 國內旅費 13 補充情境(2026-04-27n)──
    # 內部已存:day-trip / overnight / premium-class / self-drive / from-home /
    #          necessary-distance / discount-ticket / change-transport /
    #          taxi / package-tour / incidental / training
    # 跨母題已存(支出憑證):voucher-lost / voucher-receipt / voucher-receipts
    # 故略過用戶清單之 #1 (from-home) #6 (discount-ticket) #10 (self-drive)
    #              #12 (taxi) #18 (incidental) #19 (voucher-receipt) #20 (voucher-lost)
    {
        "id": "advance-postpone",
        "title": "提前出發或延後返回",
        "icon": "⏱️",
        "subtitle": "個人因素改期,以原核定行程之交通費上限報支",
        "parent": "國內旅費",
        "primary_ids": [
            "A-國內旅費-005",
            "A-國內旅費-003",
            "D-國內旅費-002",
        ],
        "tags": ["交通費", "報支上限", "出差行程"],
        "attachments": [
            "原核定出差行程之簽核",
            "實際使用之票根 / 購票證明",
            "差異原因說明(若日期不符)",
        ],
    },
    {
        "id": "holiday-via-office",
        "title": "放假日經辦公室出發",
        "icon": "🏢",
        "subtitle": "居住地→辦公室路段不得報支,以辦公室為起點計算",
        "parent": "國內旅費",
        "primary_ids": [
            "D-國內旅費-003",
            "A-國內旅費-005",
        ],
        "tags": ["交通費", "必要路程"],
        "attachments": [
            "派令 / 出差核定文件",
            "由辦公室出發之行程記錄",
            "票根",
        ],
    },
    {
        "id": "station-choice",
        "title": "鄰近多站點選擇",
        "icon": "🚉",
        "subtitle": "機關鄰近多個站(臺北/南港),依事先核定行程或機關規定",
        "parent": "國內旅費",
        "primary_ids": [
            "D-國內旅費-007",
            "A-國內旅費-005",
        ],
        "tags": ["交通費", "必要路程", "高鐵"],
        "attachments": [
            "事先核定之行程簽核",
            "機關內部統一站點規定(如有)",
            "實際票根",
        ],
    },
    {
        "id": "holiday-temporary",
        "title": "休假期間臨時奉派",
        "icon": "🏖️",
        "subtitle": "休假在外地臨時受命,視必要性可按實際出發地報支",
        "parent": "國內旅費",
        "primary_ids": [
            "D-國內旅費-008",
            "A-國內旅費-003",
            "A-國內旅費-005",
        ],
        "tags": ["交通費", "必要路程", "業務需要"],
        "attachments": [
            "緊急派令 / 簽核",
            "實際出發地之合理性說明",
            "票根 / 購票證明",
        ],
    },
    {
        "id": "senior-premium",
        "title": "優惠票搭商務車廂",
        "icon": "🎟️",
        "subtitle": "敬老/愛心票搭商務,優惠價未超經濟全票即覈實報支",
        "parent": "國內旅費",
        "primary_ids": [
            "D-國內旅費-005",
            "A-國內旅費-005",
            "B-國內旅費-001",
        ],
        "tags": ["交通費", "高鐵", "商務車廂", "覈實報支"],
        "attachments": [
            "優惠票根",
            "同程經濟車廂之全票票價證明",
        ],
    },
    {
        "id": "transport-substitute",
        "title": "自行變更交通工具",
        "icon": "🔁",
        "subtitle": "原核定機票改搭高鐵商務,不得超過原核定上限",
        "parent": "國內旅費",
        "primary_ids": [
            "D-國內旅費-006",
            "A-國內旅費-005",
            "B-國內旅費-001",
        ],
        "tags": ["交通費", "報支上限", "高鐵", "機票", "商務車廂"],
        "attachments": [
            "原核定簽核(含原定交通工具)",
            "改搭原因說明",
            "實際票根",
        ],
    },
    {
        "id": "mileage-calc",
        "title": "里程數計算標準",
        "icon": "📏",
        "subtitle": "由各機關擇定地圖軟體與小數位四捨五入規則",
        "parent": "國內旅費",
        "primary_ids": [
            "D-國內旅費-009",
            "A-國內旅費-005",
        ],
        "tags": ["必要路程", "公里數", "自駕租賃"],
        "attachments": [
            "地圖軟體截圖或計算記錄",
            "機關內部里程計算標準(如有)",
        ],
    },
    {
        "id": "car-rental",
        "title": "租賃汽機車報支",
        "icon": "🚙",
        "subtitle": "比照自駕按公里計;特定計畫(彈性支用)才可報租金",
        "parent": "國內旅費",
        "primary_ids": [
            "D-國內旅費-011",
            "A-國內旅費-005",
        ],
        "tags": ["交通費", "自駕租賃", "租賃汽車", "公里數"],
        "attachments": [
            "租車合約 / 收據",
            "出差行程與里程數計算",
            "若以租金報支:特定計畫核定文件(彈性支用額度)",
        ],
    },
    {
        "id": "taxi-overtime",
        "title": "加班搭乘計程車",
        "icon": "🌙",
        "subtitle": "夜間急要公務無大眾運輸,經機關衡酌核准始可",
        "parent": "國內旅費",
        "primary_ids": [
            "A-國內旅費-005",
            "D-國內旅費-011",
        ],
        "tags": ["交通費", "業務需要"],
        "attachments": [
            "加班簽到 / 加班單",
            "計程車收據",
            "業務急要性與時段說明簽核",
        ],
    },
    {
        "id": "period-pass",
        "title": "使用個人定期票",
        "icon": "🎫",
        "subtitle": "按當次出差優待價或平均攤提金額,不超原上限",
        "parent": "國內旅費",
        "primary_ids": [
            "A-國內旅費-005",
            "D-國內旅費-001",
        ],
        "tags": ["交通費", "報支上限", "覈實報支"],
        "attachments": [
            "定期票購買證明(含期間)",
            "出差日數",
            "當次應負擔交通費攤提計算說明",
        ],
    },
    {
        "id": "lodging-distance-60km",
        "title": "住宿距離 60 公里",
        "icon": "📍",
        "subtitle": "未達 60 公里須事前機關核准之業務需要",
        "parent": "國內旅費",
        "primary_ids": [
            "A-國內旅費-009",
            "D-國內旅費-012",
        ],
        "tags": ["住宿費", "業務需要"],
        "attachments": [
            "出差地與機關所在地距離計算",
            "若 < 60 公里:事前機關核准之簽呈或核准函",
            "住宿發票或收據(必須有住宿事實)",
        ],
    },
    {
        "id": "lodging-weekday-holiday",
        "title": "住宿費平假日認定",
        "icon": "📆",
        "subtitle": "假日含放假日前一天,不含放假日最後一天",
        "parent": "國內旅費",
        "primary_ids": [
            "B-國內旅費-001",
            "A-國內旅費-009",
        ],
        "tags": ["住宿費"],
        "attachments": [
            "出差日期與行政院辦公日曆對照",
            "投宿日(check-in 日)之住宿單據",
        ],
    },
    {
        "id": "lodging-long-discount",
        "title": "長期出差住宿折扣",
        "icon": "🗓️",
        "subtitle": "同地超過 1 月按 8 折、超過 3 月按 7 折報支",
        "parent": "國內旅費",
        "primary_ids": [
            "A-國內旅費-011",
            "B-國內旅費-001",
            "A-國內旅費-009",
        ],
        "tags": ["住宿費", "長期派駐", "同一地點超過一個月"],
        "attachments": [
            "派令(含起迄日期、地點)",
            "各月份住宿發票 / 收據",
            "折扣後計算明細",
        ],
    },
    # ── 國外旅費 18 補充情境(2026-04-27o)──
    # 內部已存:abroad-basic / abroad-airfare / abroad-living / abroad-insurance /
    #          abroad-meeting / abroad-china / abroad-incident
    # 故略過用戶清單之 #3 (艙等職級 → abroad-airfare) #9 (供膳宿扣減 → abroad-meeting)
    {
        "id": "abroad-airfare-receipts",
        "title": "機票三項憑證齊備",
        "icon": "🛫",
        "subtitle": "票根/電子機票 + 購票證明 + 登機證存根,缺一不可",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-006",
            "A-國外旅費-005",
        ],
        "tags": ["機票", "票根", "購票證明", "登機證"],
        "attachments": [
            "機票票根或電子機票收據",
            "國際線購票證明單(或旅行業代收轉付收據)",
            "登機證存根(含電子登機證)",
        ],
    },
    {
        "id": "boarding-pass-lost",
        "title": "登機證存根遺失",
        "icon": "🎫",
        "subtitle": "向航空公司取得搭機證明,或自行出具切結",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-006",
        ],
        "tags": ["機票", "登機證", "憑證遺失"],
        "attachments": [
            "向航空公司取得之搭機證明(優先)",
            "出差人切結:自行出具證明、註明無法提出原本原因並簽名",
            "票根或購票證明影本",
        ],
    },
    {
        "id": "low-cost-carrier",
        "title": "廉航附加費用",
        "icon": "🛬",
        "subtitle": "行李/選位/餐飲於合理範圍可併報,須非屬奢侈項目",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-006",
            "A-國外旅費-005",
        ],
        "tags": ["機票", "行李費", "覈實報支"],
        "attachments": [
            "機票票根 / 電子機票收據",
            "行李費、選位費、餐飲費明細",
            "與一般航空相比之合理性說明(如有需要)",
        ],
    },
    {
        "id": "passport-photo-fee",
        "title": "護照照片費",
        "icon": "📷",
        "subtitle": "因本次公差衍生之必要支出,得與護照費併同報支",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-013",
        ],
        "tags": ["出國手續費", "護照", "照片費"],
        "attachments": [
            "照相費收據",
            "因公差須辦護照 / 簽證之核准文件",
            "護照辦理事證(申請日期接近出差日期)",
        ],
    },
    {
        "id": "passport-rush-fee",
        "title": "護照速件費",
        "icon": "⚡",
        "subtitle": "因公務緊急需要(出差命令下達過晚)所致始得報支",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-013",
        ],
        "tags": ["出國手續費", "護照", "速件費", "業務需要"],
        "attachments": [
            "速件費收據",
            "出差命令下達日期與行程日期對照",
            "緊急性簽核文件",
        ],
    },
    {
        "id": "exchange-rate-no-receipt",
        "title": "匯率基準日(無水單)",
        "icon": "💱",
        "subtitle": "未提供結匯水單時,以奉派出差日前一日臺銀牌價為準",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-004",
        ],
        "tags": ["匯率", "結匯水單", "原始憑證"],
        "attachments": [
            "結匯水單(優先;有則使用其匯率)",
            "若無水單:臺銀奉派日前一日賣出現金匯價截圖",
            "非美元貨幣:現金匯價(無則用即期匯價)截圖",
        ],
    },
    {
        "id": "foreign-receipt-translate",
        "title": "外幣憑證品名翻譯",
        "icon": "🈳",
        "subtitle": "非本國文或僅列代號者,經手人加註譯文",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-004",
        ],
        "tags": ["原始憑證", "翻譯"],
        "attachments": [
            "原始外幣收據 / 發票",
            "經手人加註之中文譯文(必要時含廠牌、規格)",
        ],
    },
    {
        "id": "return-day-living-30",
        "title": "返國當日生活費 30%",
        "icon": "🛬",
        "subtitle": "返國當日按起飛地生活費日支數額之 30% 限額報支",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-007",
            "B-國外旅費-003",
        ],
        "tags": ["日支生活費", "返國"],
        "attachments": [
            "返國機票 / 行程文件(顯示起飛地與時間)",
            "返國當日生活費明細",
        ],
    },
    {
        "id": "abroad-long-stay-discount",
        "title": "同地駐留逾月折扣",
        "icon": "📆",
        "subtitle": "同地超過 1 月按 8 折、超過 3 月按 7 折(指定旅館等例外)",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-011",
            "B-國外旅費-003",
        ],
        "tags": ["日支生活費", "長期派駐", "同一地點超過一個月"],
        "attachments": [
            "派令(含起迄日期、地點)",
            "各月份生活費計算明細(含折扣)",
            "若屬例外情形:國際會議指定旅館 / 紅色警示地區之核定文件",
        ],
    },
    {
        "id": "registration-credit-card",
        "title": "註冊費信用卡手續費",
        "icon": "💳",
        "subtitle": "主辦限定須以個人信用卡支付者,刷卡手續費可併報",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-015",
            "A-國外旅費-013",
        ],
        "tags": ["行政費", "註冊費", "手續費"],
        "attachments": [
            "註冊費 / 報名費收據",
            "信用卡手續費明細 / 對帳單",
            "主辦限定刷卡支付之文件 / 公告",
        ],
    },
    {
        "id": "abroad-incidental-receipts",
        "title": "禮品雜費須檢據",
        "icon": "🎁",
        "subtitle": "1,100 / 600 元每日額度仍須檢附原始單據覈實報支",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-016",
            "A-國外旅費-017",
            "A-國外旅費-015",
        ],
        "tags": ["禮品交際", "雜費", "行政費", "原始憑證", "覈實報支"],
        "attachments": [
            "禮品 / 交際 / 雜費之原始發票或收據",
            "用途與對象說明簽核",
        ],
    },
    {
        "id": "abroad-taxi-classification",
        "title": "計程車租車歸類",
        "icon": "🚖",
        "subtitle": "歸入禮品交際及雜費,須具業務必要或節省說明",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-017",
            "A-國外旅費-015",
        ],
        "tags": ["雜費", "業務需要", "覈實報支"],
        "attachments": [
            "計程車 / 租車收據",
            "業務必要性說明(或節省大眾運輸費用之比較)",
            "簽核文件",
        ],
    },
    {
        "id": "abroad-lodging-over-cap",
        "title": "住宿費超 70% 例外",
        "icon": "🏨",
        "subtitle": "國際會議指定旅館或紅色警示地區可檢據覈實報支",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-008",
            "A-國外旅費-007",
            "B-國外旅費-003",
        ],
        "tags": ["住宿費", "國際會議", "紅色警示"],
        "attachments": [
            "原核定生活費上限與實際支出對比",
            "國際會議指定旅館之主辦公告 或 紅色警示地區核定文件",
            "住宿原始收據 / 發票",
        ],
    },
    {
        "id": "international-date-line",
        "title": "國際換日線時間",
        "icon": "🌐",
        "subtitle": "旅費日期/時間一律按本國日期時間計算(駐外人員除外)",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-007",
            "A-國外旅費-019",
            "A-國外旅費-010",
        ],
        "tags": ["出差行程", "時間計算"],
        "attachments": [
            "完整出差行程表(含本國日期時間換算)",
            "若涉駐外人員之特殊處理:核定文件",
        ],
    },
    {
        "id": "onboard-overnight-living",
        "title": "飛機歇夜生活費",
        "icon": "✈️",
        "subtitle": "在飛機過夜按供宿扣 70%,僅報膳食費及零用費(30%)",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-007",
            "B-國外旅費-003",
        ],
        "tags": ["日支生活費", "供宿"],
        "attachments": [
            "機票 / 登機證(含過夜飛行時段)",
            "該日生活費明細(僅膳食費 + 零用費)",
        ],
    },
    {
        "id": "illness-delay-return",
        "title": "病故意外延遲返國",
        "icon": "🏥",
        "subtitle": "醫院證明或航班延誤證明 + 機關首長核准方可補發",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-012",
            "A-國外旅費-007",
        ],
        "tags": ["出差行程", "業務需要"],
        "attachments": [
            "醫院診斷證明 或 航空公司航班延誤證明",
            "延遲日期之相關單據",
            "機關首長核准之延誤簽核",
        ],
    },
    {
        "id": "credit-card-fee-cap",
        "title": "信用卡手續費限額",
        "icon": "💳",
        "subtitle": "若該費用定有限額,信用卡手續費併報後仍不得超原限額",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-013",
            "A-國外旅費-015",
        ],
        "tags": ["出國手續費", "註冊費", "手續費", "報支上限"],
        "attachments": [
            "原費用收據(含限額對照)",
            "信用卡手續費對帳單",
            "費用 + 手續費合計之上限驗算",
        ],
    },
    {
        "id": "foreign-receipt-payee",
        "title": "國外收據買受人抬頭",
        "icon": "🧾",
        "subtitle": "國外慣例可加註說明簽名;國內憑證須記明機關名稱/統編",
        "parent": "國外旅費",
        "primary_ids": [
            "A-國外旅費-004",
            "D-支出憑證與結報-006",
        ],
        "tags": ["原始憑證", "買受人"],
        "attachments": [
            "原始收據 / 發票",
            "若國外慣例未記抬頭:申請人加註說明並簽名",
            "若國內開立:機關名稱或統一編號之記明",
        ],
    },
    # ── 支出憑證與結報 14 錯誤樣態情境(2026-04-27p)──
    # 既有覆蓋:voucher-types / voucher-receipt / voucher-electronic / voucher-procurement /
    #          voucher-payment / voucher-shared / voucher-lost / voucher-foreign /
    #          voucher-grants / meeting-meals / year-end-closing / voucher-receipts /
    #          procurement-detail / voucher-misc / voucher-welfare
    # 故略過用戶清單之 #8 (voucher-lost) #14 (voucher-payment) #15 (voucher-shared)
    #              #16 (voucher-misc-水電) #17 (voucher-receipt-寺廟) #18 (year-end-closing)
    {
        "id": "invoice-tax-id-missing",
        "title": "統編漏填或錯誤",
        "icon": "🆔",
        "subtitle": "通知商家補正;無法補正時由經手人加註簽名",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-010",
            "D-支出憑證與結報-016",
            "A-支出憑證與結報-004",
        ],
        "tags": ["統一發票", "統一編號", "原始憑證"],
        "attachments": [
            "原始發票 / 收據",
            "商家補正之新發票(優先)",
            "若無法補正:經手人於憑證上加註統編並簽名",
        ],
    },
    {
        "id": "invoice-payee-wrong",
        "title": "買受人抬頭錯誤",
        "icon": "🏛️",
        "subtitle": "差旅費等收據應記明機關名稱(非個人姓名)",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-016",
            "D-支出憑證與結報-013",
            "A-支出憑證與結報-004",
        ],
        "tags": ["買受人", "原始憑證"],
        "attachments": [
            "原始發票 / 收據(顯示誤填之買受人)",
            "請廠商重新開立或加註更正之新憑證",
            "若無法重開:經手人加註說明並簽名",
        ],
    },
    {
        "id": "agency-abbreviation",
        "title": "機關簡稱辨識度",
        "icon": "🔤",
        "subtitle": "簡稱(如「成大」)若足以辨識機關全銜即無須補正",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-016",
            "A-支出憑證與結報-004",
        ],
        "tags": ["買受人"],
        "attachments": [
            "原始憑證(含簡稱)",
            "若無法辨識:經手人加註全銜說明並簽名",
        ],
    },
    {
        "id": "e-invoice-tax-id-missing",
        "title": "電子發票漏統編",
        "icon": "📱",
        "subtitle": "可由經手人在證明聯註記統編並簽名辦理補正",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-019",
            "D-支出憑證與結報-012",
            "D-支出憑證與結報-015",
        ],
        "tags": ["電子發票", "統一編號"],
        "attachments": [
            "電子發票證明聯(漏打統編)",
            "經手人加註機關統編並簽名",
        ],
    },
    {
        "id": "foreign-receipt-no-payee",
        "title": "國外/港澳憑證無抬頭",
        "icon": "🌏",
        "subtitle": "國外慣例未記機關抬頭/統編,可加註說明並簽名",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-025",
            "D-支出憑證與結報-026",
            "A-支出憑證與結報-004",
        ],
        "tags": ["原始憑證", "買受人", "國外採購"],
        "attachments": [
            "國外/港澳原始收據",
            "申請人加註說明國外慣例與支付事實",
            "申請人簽名",
        ],
    },
    {
        "id": "item-name-code-only",
        "title": "品名代號或外文",
        "icon": "🏷️",
        "subtitle": "電腦代碼/非本國文須由經手人加註譯文(必要時含廠牌規格)",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-006",
            "D-支出憑證與結報-026",
            "A-支出憑證與結報-004",
        ],
        "tags": ["原始憑證", "翻譯"],
        "attachments": [
            "原始憑證(含代碼/外文品名)",
            "經手人加註之中文擇要譯文",
            "如有需要:廠牌、規格說明",
        ],
    },
    {
        "id": "amount-correction",
        "title": "金額書寫錯誤",
        "icon": "✏️",
        "subtitle": "普通收據可劃線註銷簽名更正;統一發票須重新開立",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-011",
            "D-支出憑證與結報-014",
            "A-支出憑證與結報-004",
        ],
        "tags": ["原始憑證", "統一發票", "普通收據"],
        "attachments": [
            "原始憑證(含書寫錯誤痕跡)",
            "若普通收據:劃線註銷之更正紀錄(由原出具者簽名)",
            "若統一發票:重新開立之新發票",
        ],
    },
    {
        "id": "personal-credit-card-payment",
        "title": "個人信用卡支付公款",
        "icon": "💳",
        "subtitle": "非專任採購人員墊付須符內控機制,不得作為常態",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-023",
            "A-支出憑證與結報-005",
        ],
        "tags": ["採購", "原始憑證"],
        "attachments": [
            "刷卡簽單 / 信用卡明細",
            "原始發票或收據",
            "墊付申請與機關核准文件(若涉公務先墊付)",
        ],
    },
    {
        "id": "credit-card-rewards-discount",
        "title": "紅利或會員點數折抵",
        "icon": "🎁",
        "subtitle": "報支金額以扣除折扣後之實付金額為準",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-014",
            "D-支出憑證與結報-011",
            "A-支出憑證與結報-004",
        ],
        "tags": ["原始憑證", "覈實報支"],
        "attachments": [
            "原始發票 / 收據(顯示原價與折抵後金額)",
            "若折抵後金額不明:會員點數折抵明細",
        ],
    },
    {
        "id": "receipt-no-quantity",
        "title": "收據無單價/數量",
        "icon": "🧮",
        "subtitle": "法規未強制,但機關有管理需要可要求補註",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-011",
            "A-支出憑證與結報-004",
        ],
        "tags": ["普通收據", "原始憑證"],
        "attachments": [
            "原始普通收據",
            "若機關要求:商家補開含單價/數量之新收據,或經手人加註",
        ],
    },
    {
        "id": "e-invoice-no-stamp",
        "title": "電子發票無發票章",
        "icon": "🪑",
        "subtitle": "符合特定格式之電子發票證明聯依法得免加蓋",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-012",
            "D-支出憑證與結報-015",
            "D-支出憑證與結報-019",
        ],
        "tags": ["電子發票", "統一發票"],
        "attachments": [
            "電子發票證明聯(顯示完整載具資料)",
            "(免再要求補蓋發票章)",
        ],
    },
    {
        "id": "online-tx-no-receipt",
        "title": "網路交易無正式收據",
        "icon": "🛒",
        "subtitle": "電子憑證(如開立通知)+ 經手人簽名,證明支付事實",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-018",
            "D-支出憑證與結報-019",
            "D-支出憑證與結報-026",
        ],
        "tags": ["電子發票", "網路交易", "原始憑證"],
        "attachments": [
            "網路電子憑證(如電子發票開立通知 / Email 確認)",
            "信用卡明細或匯款證明(支付事實佐證)",
            "經手人簽名",
        ],
    },
    {
        "id": "stamp-tax-missing",
        "title": "收據未貼印花稅票",
        "icon": "🏷️",
        "subtitle": "依《印花稅法》貼足;漏貼可請商家補貼或加註說明",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-001",
            "A-支出憑證與結報-004",
        ],
        "tags": ["普通收據", "原始憑證"],
        "attachments": [
            "原始普通收據",
            "若漏貼:商家補貼之印花稅票,或經手人依機關慣例加註說明",
        ],
    },
    {
        "id": "handwritten-correction",
        "title": "手寫修正未簽章",
        "icon": "✍️",
        "subtitle": "應記明事項手寫修正須由原出具者簽名或蓋章",
        "parent": "支出憑證與結報",
        "primary_ids": [
            "D-支出憑證與結報-001",
            "D-支出憑證與結報-014",
            "A-支出憑證與結報-004",
        ],
        "tags": ["原始憑證"],
        "attachments": [
            "原始憑證(含手寫修正處)",
            "原出具者於修正處之簽名 / 蓋章",
        ],
    },
]


def merge_scenarios(data: dict) -> tuple[dict, list[str]]:
    """把 SCENARIO_DATA / FLOWS 合併進現有 scenarios.json。
    回傳 (new_data, change_log)。
    """
    log: list[str] = []
    by_id = {sc["id"]: sc for sc in data["scenarios"]}

    for sid, patch in SCENARIO_DATA.items():
        if sid not in by_id:
            log.append(f"[skip] 找不到情境 id: {sid}")
            continue
        sc = by_id[sid]
        if "attachments" in patch:
            sc["attachments"] = list(patch["attachments"])
        if "approvers" in patch:
            sc["approvers"] = list(patch["approvers"])
        else:
            # 補預設 approvers(若沒有覆寫且原本沒設)
            if "approvers" not in sc:
                sc["approvers"] = list(DEFAULT_APPROVERS)
        log.append(f"[ok]   {sid}: attachments={len(sc.get('attachments') or [])}, approvers={len(sc.get('approvers') or [])}")

    for sid, flow in FLOWS.items():
        if sid not in by_id:
            log.append(f"[skip flow] 找不到情境 id: {sid}")
            continue
        by_id[sid]["flow"] = flow
        log.append(f"[flow] {sid}: questions={len(flow['questions'])}, conclusions={len(flow['conclusions'])}")

    # 新增情境(若 id 尚未存在)
    for new_sc in NEW_SCENARIOS:
        if new_sc["id"] in by_id:
            log.append(f"[exists] 跳過已存在情境 id: {new_sc['id']}")
            continue
        sc = dict(new_sc)
        if "approvers" not in sc:
            sc["approvers"] = list(DEFAULT_APPROVERS)
        data["scenarios"].append(sc)
        by_id[sc["id"]] = sc
        log.append(f"[new]  + {sc['id']} ({sc['title']})  primary={len(sc.get('primary_ids') or [])}")

    # 沒有列在 SCENARIO_DATA 的情境也要補預設 approvers
    for sc in data["scenarios"]:
        if "approvers" not in sc:
            sc["approvers"] = list(DEFAULT_APPROVERS)
            log.append(f"[default] {sc['id']}: 套用預設 approvers")

    data["version"] = date.today().isoformat()
    return data, log


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true", help="實際寫回 scenarios.json")
    args = p.parse_args(argv)

    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    data = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    new_data, log = merge_scenarios(data)

    print(f"=== Augment scenarios ({'APPLY' if args.apply else 'DRY-RUN'}) ===")
    for line in log:
        print(line)
    print(f"--- 共 {len(new_data['scenarios'])} 個情境")

    if args.apply:
        SCENARIOS_PATH.write_text(
            json.dumps(new_data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"已寫入 {SCENARIOS_PATH}")
    else:
        print("(dry-run,未寫檔。加 --apply 實際寫入)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
