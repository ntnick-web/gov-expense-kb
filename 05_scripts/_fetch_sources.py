"""母題法源自動發現 + 下載工具。

從母題名(e.g. 酬勞費)→ 自動產生候選法源 URL CSV → 人工審後下載到 00_source/。

兩階段使用:
    Stage 1 — Discovery(產候選 URL CSV):
        python 05_scripts/_fetch_sources.py --parent 酬勞費 --discover
        → 寫出 00_source/_candidates_酬勞費.csv 含 URL/title/category/status/confidence/decision

    Stage 2 — Fetch(下載已批准的 URL):
        # 人工編輯 _candidates_酬勞費.csv,在 decision 欄填 keep/skip/manual
        python 05_scripts/_fetch_sources.py --parent 酬勞費 --fetch
        → 下載到 00_source/06_酬勞費/{機關}/{filename}.{html|pdf|docx|odt}
        → 同時寫對應的 Markdown 到 00_source/06_酬勞費/{機關}/{filename}.md(若可從 HTML 直接轉)

法源優先序(per source):
    1. HTML render(dgbas LawContent.aspx?media=print)— 最乾淨,可直接轉 MD
    2. ODT / DOCX(Download.ashx FileID)— 結構化好
    3. PDF 文字型(pdfplumber 處理)
    4. PDF 掃描型(需 --ocr)— 最後手段

新增母題支援:在 PARENT_SPECS dict 加新 entry。

依賴:requests / beautifulsoup4 / lxml(已 install)。需 Python 3.10+。
"""
from __future__ import annotations
import sys, os, re, csv, json, time, argparse, hashlib, urllib.parse
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional, Iterable
from urllib.parse import urlparse, urljoin, parse_qs

import requests
from bs4 import BeautifulSoup
import urllib3

ROOT = Path(__file__).resolve().parent.parent
SOURCE_ROOT = ROOT / "00_source"

# 政府網站 SSL 憑證(GCA 自簽)有時 Subject Key Identifier 缺失,需 verify=False
TRUSTED_GOV_HOSTS = {
    "law.dgbas.gov.tw", "www.dgbas.gov.tw", "ebasnew.dgbas.gov.tw",
    "law.dgpa.gov.tw", "www.dgpa.gov.tw",
    "law.moj.gov.tw",
    "gazette.nat.gov.tw",
    "www.nhi.gov.tw",  # 衛福部健保署(二代健保費率公告)
    "law.lia-roc.org.tw",  # 保險相關法規查詢系統(二代健保補充保費施行辦法等)
}

UA = "Mozilla/5.0 (gov-expense-kb research bot; +https://github.com/ntnick-web/gov-expense-kb)"
RATE_LIMIT_SEC = 1.0   # 每請求至少間隔 1 秒(尊重政府網站)
TIMEOUT_SEC = 20

# ─────────────────────────────────────────────────────────────
# 母題規格(parent_specs)— 新增母題在這裡加 entry
# ─────────────────────────────────────────────────────────────

@dataclass
class ParentSpec:
    """母題的法源蒐集規格。"""
    parent_name: str
    keywords: list[str]                  # 關鍵字集合(用於 search + filter)
    folder_suffix: str                   # 00_source/{folder_suffix}/ 子目錄名
    # 已知法源 URL 種子(來自報告 §1.1.2 + 既有 SOURCE_URL_MAP)
    # 格式:(url, expected_category, hint_title, agency)
    seed_urls: list[tuple[str, str, str, str]]
    # 在 dgbas 解釋彙編索引頁尋找這些關鍵字的 PDF/連結
    dgbas_interpretation_keywords: list[str] = field(default_factory=list)
    # 在 dgbas 問答集索引頁找
    dgbas_qa_keywords: list[str] = field(default_factory=list)
    # 跨機關法規(law.moj.gov.tw)PCode list
    moj_law_pcodes: list[tuple[str, str]] = field(default_factory=list)  # (PCode, hint_title)


@dataclass
class ParentSpec:
    parent_name: str
    keywords: list[str]
    folder_suffix: str
    # 排除關鍵字:標題若含這些就視為其他母題的法源,不收(防雜訊)
    exclude_keywords: list[str] = field(default_factory=list)
    seed_urls: list[tuple[str, str, str, str]] = field(default_factory=list)
    dgbas_category_ids: list[str] = field(default_factory=list)
    dgbas_interpretation_keywords: list[str] = field(default_factory=list)
    dgbas_qa_keywords: list[str] = field(default_factory=list)
    moj_law_pcodes: list[tuple[str, str]] = field(default_factory=list)
    ebasnew_categories: list[tuple[str, str, str]] = field(default_factory=list)
    manual_todo: list[str] = field(default_factory=list)


PARENT_SPECS: dict[str, ParentSpec] = {
    "酬勞費": ParentSpec(
        parent_name="酬勞費",
        keywords=[
            "酬勞", "鐘點", "出席費", "稿費",
            "兼職", "兼任", "撰稿", "翻譯費", "委員費",
            "印領清冊", "勞報單", "二代健保",
        ],
        # 標題若含這些屬其他母題,不收(避免 ebasnew 函釋雜訊)
        exclude_keywords=[
            "國內旅費", "國外旅費", "出差旅費",
            "派員參加國內", "派員參加各項訓練",
            "出國案件編審", "赴大陸地區案件",
            "日支數額", "生活費日支",
        ],
        folder_suffix="06_酬勞費",
        # 已知種子(報告 §1.1.2 + 探勘命中 + 使用者提供)
        seed_urls=[
            # 行政院主計總處主管:出席費及稿費支給要點(A 類核心)
            ("https://law.dgbas.gov.tw/LawContent.aspx?id=FL000752",
             "A", "中央政府各機關學校出席費及稿費支給要點", "行政院主計總處"),
            # 行政院人事行政總處主管(使用者提供;名稱含「支給表」但本身是獨立法規 → A 類,
            # 其內含的數額表透過 fm.rate_table 結構化欄位處理,非另立 B 類)
            ("https://law.dgpa.gov.tw/LawContent.aspx?id=GL000341",
             "A", "講座鐘點費支給表", "行政院人事行政總處"),
            ("https://law.dgpa.gov.tw/LawContent.aspx?id=GL000347",
             "A", "軍公教人員兼職費支給表", "行政院人事行政總處"),
            # 二代健保補充保費施行辦法(use 提供 URL #5,2026-05-02)
            ("https://law.lia-roc.org.tw/Law/Content?lsid=FL067880",
             "A", "全民健康保險扣取及繳納補充保險費辦法", "衛生福利部中央健康保險署"),
        ],
        # 走訪這些 dgbas 主管法規分類,找標題含 keyword 的法規
        dgbas_category_ids=[
            "123",  # 預算執行(中央)— 已驗證有 FL000752
            "133",  # 預算執行(地方)
            "143",  # 預算執行(立法/監察/考試/司法)
            "125",  # 其他令函(中央)
            "135",  # 其他令函(地方)
            "145",  # 其他令函(其他)
            "210",  # 主計人事內控
        ],
        # ebasnew 友善專區(主計法規優先來源,2026-05-02 起)
        # 法源位階:A > B = C = D = 支標手冊 = 作業範例(2026-05-02 user 修正,
        # B/C/D + 支標手冊 + 作業範例皆為 A 的補充說明,同級互相比較)
        ebasnew_categories=[
            ("2",  "A", "內審規定"),
            ("15", "C", "解釋彙編及相關函釋"),
            ("16", "D", "問答集"),
            ("17", "C", "內審共通性作業範例"),  # 作業範例(操作性指引,有法源依據)
            ("47", "B", "支標手冊"),             # 支標手冊(彙整精簡版)
        ],
        dgbas_interpretation_keywords=[
            "鐘點", "出席費", "稿費", "兼職", "兼任", "印領清冊", "勞報",
            "委員", "評選", "諮詢", "評審",
        ],
        dgbas_qa_keywords=["鐘點", "出席費", "稿費", "兼職"],
        # moj 跨機關法規(已驗證 PCode)
        moj_law_pcodes=[
            ("G0340003", "所得稅法"),               # §88 扣繳
            ("L0060001", "全民健康保險法"),         # §31 二代健保補充保費
        ],
        manual_todo=[
            # 仍需後續補的(緩緩)
            "[緩緩] 中央政府各機關學校員工待遇授權法 + 施行細則(全國法規資料庫,需查 PCode)",
            "[緩緩] 各類委員出席費個別函令(諮詢/評選/評審/訴願委員)— 主計總處友善專區無獨立函令,部分已含在 B 支標手冊章節中",
            "[緩緩] 印領清冊 / 勞報單格式相關函釋(友善專區 SN=15 無命中,後續需手動補)",
            # 已解決:
            #   - 講座鐘點費支給表 → GL000341(已加 seed,人事總處主管)
            #   - 軍公教兼職費支給表 → GL000347(已加 seed)
            #   - 二代健保補充保費施行辦法 → lia-roc FL067880(已加 seed,使用者提供 URL #5)
            #   - 二代健保 Q&A → 衛福部健保署 PDF(使用者人工提供 1150105二代健保QA.pdf)
        ],
    ),
}

# ─────────────────────────────────────────────────────────────
# HTTP client(rate limit + cache + SSL handling)
# ─────────────────────────────────────────────────────────────

_http_cache: dict[str, "requests.Response"] = {}
_last_request_time = 0.0


def http_get(url: str, *, allow_pdf: bool = True, force_refresh: bool = False) -> requests.Response:
    """GET with rate limit, SSL relax for gov, in-memory cache。"""
    global _last_request_time
    if not force_refresh and url in _http_cache:
        return _http_cache[url]
    # rate limit
    elapsed = time.time() - _last_request_time
    if elapsed < RATE_LIMIT_SEC:
        time.sleep(RATE_LIMIT_SEC - elapsed)
    host = urlparse(url).hostname or ""
    verify_ssl = host not in TRUSTED_GOV_HOSTS
    if not verify_ssl:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    headers = {"User-Agent": UA}
    r = requests.get(url, timeout=TIMEOUT_SEC, headers=headers, verify=verify_ssl)
    # encoding fix(政府網站常宣告 utf-8 但 requests 偵測 ISO)
    if "text" in (r.headers.get("Content-Type", "") or "") or url.endswith(".html") or "aspx" in url.lower():
        r.encoding = "utf-8"
    _http_cache[url] = r
    _last_request_time = time.time()
    return r


def safe_filename(s: str, max_len: int = 80) -> str:
    """Windows-safe filename(刪非法字元 + 截斷)。"""
    s = re.sub(r'[\\/:*?"<>|\r\n\t]', "_", s).strip(" ._")
    if len(s) > max_len:
        s = s[:max_len].rstrip()
    return s or "untitled"


# ─────────────────────────────────────────────────────────────
# Candidate model
# ─────────────────────────────────────────────────────────────

@dataclass
class Candidate:
    url: str
    category: str            # A / B / C / D / unknown
    title: str = ""
    agency: str = ""
    status: str = ""         # 現行 / 廢止 / unknown
    last_revised: str = ""   # YYYY-MM-DD if known
    publication_date: str = ""
    file_format: str = ""    # html / pdf / docx / odt
    confidence: str = "low"  # low / medium / high
    decision: str = ""       # 留空,人工填 keep/skip/manual
    notes: str = ""

    def to_dict(self):
        return asdict(self)


# ─────────────────────────────────────────────────────────────
# Source: law.dgbas.gov.tw / law.dgpa.gov.tw(共用 ASPX 法規系統)
# ─────────────────────────────────────────────────────────────

DGBAS_LAW_BASE = "https://law.dgbas.gov.tw"
DGPA_LAW_BASE = "https://law.dgpa.gov.tw"


def aspx_law_base(host_or_id: str) -> str:
    """依 law_id 前綴判斷主機:FL=主計總處 / GL=人事總處。"""
    if host_or_id.startswith("FL"):
        return DGBAS_LAW_BASE
    if host_or_id.startswith("GL"):
        return DGPA_LAW_BASE
    return DGBAS_LAW_BASE  # default


def dgbas_get_law_meta(law_id: str) -> dict:
    """抓 LawContent.aspx?id=FLNNNNNN / GLNNNNNN 的 metadata + 可下載連結。
    自動依 law_id 前綴(FL=dgbas / GL=dgpa)選對主機。"""
    base = aspx_law_base(law_id)
    url = f"{base}/LawContent.aspx?id={law_id}"
    r = http_get(url)
    if r.status_code != 200:
        return {"_error": f"status {r.status_code}"}
    soup = BeautifulSoup(r.text, "lxml")
    title_tag = soup.find("title")
    page_title = title_tag.text.strip() if title_tag else ""
    # 法規名稱通常在 page title 結尾「-法規內容-XXXX」
    m = re.search(r"-法規內容-(.+?)$", page_title)
    law_title = m.group(1) if m else page_title
    text = soup.get_text()
    # 修正 / 廢止狀態
    is_obsolete = ("廢止" in text and ("已廢止" in text or "本要點廢止" in text or "本辦法廢止" in text))
    # 修正日期(取 沿革 內最近一筆)
    last_revised = ""
    for m in re.finditer(r"(中華民國\s*)?(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:[^\n]{0,40}?(?:訂定|修正|發布|公布|令發布))", text):
        # 取最後一個(通常時間排序)
        y, mo, d = m.group(2), m.group(3), m.group(4)
        last_revised = f"{int(y)+1911}-{int(mo):02d}-{int(d):02d}"
    # 下載連結(Download.ashx)— 用同一 base host 解析(dgbas / dgpa)
    downloads = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "Download.ashx" in href:
            file_url = urljoin(base + "/", href)
            file_name = a.get_text(strip=True)
            downloads.append({"name": file_name, "url": file_url})
    # 主管機關依 base 推定
    agency = "行政院主計總處" if base == DGBAS_LAW_BASE else "行政院人事行政總處"
    return {
        "law_id": law_id,
        "title": law_title,
        "page_title": page_title,
        "is_obsolete": is_obsolete,
        "last_revised": last_revised,
        "downloads": downloads,
        "agency": agency,
    }


def dgbas_search_laws(keyword: str) -> list[dict]:
    """嘗試從 dgbas 搜尋 — 用 GET 到 LawSearchAll.aspx。
    dgbas 用 ASPX ViewState,GET 通常無結果但會列出全法規索引,我們 grep title。
    """
    url = f"{DGBAS_LAW_BASE}/LawSearchAll.aspx?ty=L&kw={urllib.parse.quote(keyword)}"
    r = http_get(url)
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, "lxml")
    out = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "LawContent.aspx" in href:
            m = re.search(r"id=([A-Z]+\d+)", href)
            if not m:
                continue
            law_id = m.group(1)
            title = a.get_text(strip=True)
            if keyword in title:
                out.append({"law_id": law_id, "title": title,
                            "url": urljoin(DGBAS_LAW_BASE + "/", href)})
    return out


def dgbas_iter_category(category_id: str, max_pages: int = 20) -> Iterable[dict]:
    """走訪某個 dgbas 主管法規分類的所有頁,yield {law_id, title, url}。
    每頁 10 筆,自動偵測下一頁無新內容時停止。
    """
    seen_ids: set[str] = set()
    for page in range(1, max_pages + 1):
        url = f"{DGBAS_LAW_BASE}/LawCategoryMain.aspx?CategoryID={category_id}&Page={page}"
        try:
            r = http_get(url)
            if r.status_code != 200:
                return
            soup = BeautifulSoup(r.text, "lxml")
            page_ids = []
            for a in soup.find_all("a", href=True):
                if "LawContent.aspx" not in a["href"]:
                    continue
                m = re.search(r"id=([A-Z]+\d+)", a["href"])
                if not m:
                    continue
                lid = m.group(1)
                if lid in seen_ids:
                    continue
                seen_ids.add(lid)
                page_ids.append(lid)
                yield {
                    "law_id": lid,
                    "title": a.get_text(strip=True),
                    "url": urljoin(DGBAS_LAW_BASE + "/", a["href"]),
                    "category_id": category_id,
                }
            if not page_ids:
                return  # 此頁無新內容 → 停
        except Exception:
            return


def dgbas_fetch_print_html(law_id: str) -> str:
    """抓 print mode HTML(完整法條;dgbas FL 與 dgpa GL 共用)。"""
    base = aspx_law_base(law_id)
    url = f"{base}/LawContent.aspx?media=print&id={law_id}"
    r = http_get(url)
    return r.text if r.status_code == 200 else ""


def dgbas_html_to_md(html: str, law_title: str) -> str:
    """把 dgbas LawContent print HTML 轉為結構化 MD(條 / 點分段)。"""
    soup = BeautifulSoup(html, "lxml")
    # 先剝掉 nav / header / footer 雜訊
    for tag in soup.find_all(["nav", "header", "footer", "script", "style"]):
        tag.decompose()
    text = soup.get_text("\n")
    # 重組:每個「第N點」/「第N條」前換行
    text = re.sub(r"([。!?])\s*\n+", r"\1\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    # 抓條文段落(以「一、」「二、」… 或「第N點」「第N條」起頭)
    # dgbas print mode 通常用「一、」「二、」(數字點)
    sections = []
    current = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # 新條/新點的開頭
        if re.match(r"^[一二三四五六七八九十百零0-9]+、", line) or re.match(r"^第[一二三四五六七八九十百零0-9]+[條點]", line):
            if current:
                sections.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current))
    body = "\n\n".join(sections)
    return f"# {law_title}\n\n{body}\n"


# ─────────────────────────────────────────────────────────────
# Source: www.dgbas.gov.tw(主計總處 公告 / 解釋彙編 / 問答集)
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# Source: ebasnew.dgbas.gov.tw 友善專區(主計法規優先來源)
# ─────────────────────────────────────────────────────────────

EBASNEW_BASE = "https://ebasnew.dgbas.gov.tw"


def ebasnew_iter_category(category_sn: str, max_pages: int = 30) -> Iterable[dict]:
    """走訪 ebasnew 友善專區某分區,yield 每筆條目 {detail_id, title, date, sub_category, url}。
    detail URL pattern: /PublicinsideAudit/Detail/0/{detail_id}
    """
    seen: set[str] = set()
    for page in range(1, max_pages + 1):
        url = f"{EBASNEW_BASE}/PublicInsideAudit/Index2?pageNo={page}&Q_InsideCategorySN={category_sn}&Q_SearchType=2&pagesize=10"
        try:
            r = http_get(url)
            if r.status_code != 200:
                return
            soup = BeautifulSoup(r.text, "lxml")
            page_count = 0
            for tr in soup.find_all("tr"):
                tds = tr.find_all("td")
                if len(tds) < 2:
                    continue
                # 找含 onclick 開新視窗到 Detail 的 a
                title_a = None
                for td in tds:
                    a = td.find("a", attrs={"onclick": True})
                    if a:
                        m = re.search(r"/PublicinsideAudit/Detail/\d+/(\d+)", a.get("onclick", ""), re.IGNORECASE)
                        if m:
                            title_a = a
                            detail_id = m.group(1)
                            break
                if not title_a:
                    continue
                if detail_id in seen:
                    continue
                seen.add(detail_id)
                title = title_a.get_text(strip=True)
                # 抽分類 / 日期
                sub_cat = ""
                date_str = ""
                for td in tds:
                    dt = td.attrs.get("data-title", "")
                    val = td.get_text(strip=True)
                    if dt == "分類":
                        sub_cat = val
                    elif dt in ("日期", "公布日期", "更新日期"):
                        date_str = val
                page_count += 1
                yield {
                    "detail_id": detail_id,
                    "title": title,
                    "sub_category": sub_cat,
                    "date": date_str,
                    "url": f"{EBASNEW_BASE}/PublicinsideAudit/Detail/0/{detail_id}",
                    "category_sn": category_sn,
                }
            if page_count == 0:
                return
        except Exception:
            return


DGBAS_WWW_BASE = "https://www.dgbas.gov.tw"
# 主計總處解釋彙編 / 函釋索引 — 嘗試多個已知索引頁
INTERPRETATION_INDICES = [
    f"{DGBAS_WWW_BASE}/cl.aspx?n=2876",         # 主計法令 / 解釋彙編 主索引
    f"{DGBAS_WWW_BASE}/News.aspx?n=1522&sms=10692",  # 旅費類解釋彙編(2026 既知)
]
# 經費結報問答集
QA_INDICES = [
    f"{DGBAS_WWW_BASE}/cp.aspx?n=4322",
    f"{DGBAS_WWW_BASE}/cp.aspx?n=4342",
]


def dgbas_www_parse_link_index(index_url: str, link_text_keywords: list[str]) -> list[dict]:
    """從主計總處 News / cp index 頁爬連結,filter 有命中 keyword 的。"""
    r = http_get(index_url)
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, "lxml")
    out = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        text = a.get_text(strip=True)
        if not text or len(text) < 4:
            continue
        if any(kw in text for kw in link_text_keywords):
            full_url = href if href.startswith("http") else urljoin(index_url, href)
            out.append({"title": text, "url": full_url})
    return out


# ─────────────────────────────────────────────────────────────
# Source: law.moj.gov.tw(全國法規資料庫)
# ─────────────────────────────────────────────────────────────

MOJ_BASE = "https://law.moj.gov.tw"


def moj_get_law_meta(pcode: str) -> dict:
    """抓 LawAll.aspx?pcode=XXX 的 metadata。"""
    url = f"{MOJ_BASE}/LawClass/LawAll.aspx?pcode={pcode}"
    r = http_get(url)
    if r.status_code != 200:
        return {"_error": f"status {r.status_code}"}
    soup = BeautifulSoup(r.text, "lxml")
    title_tag = soup.find("title")
    page_title = title_tag.text.strip() if title_tag else ""
    text = soup.get_text()
    # 法規狀態(moj 也標 廢止 / 廢止日期)
    is_obsolete = bool(re.search(r"廢止日期[\s::]*[\d中民國年月日]+", text))
    # 修正日期
    last_revised = ""
    m = re.search(r"修正日期[\s::]*中華民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", text)
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        last_revised = f"{int(y)+1911}-{int(mo):02d}-{int(d):02d}"
    # 法規名稱
    name_m = re.search(r"^([^\n]+?)(?:-全國法規資料庫|$)", page_title)
    law_title = name_m.group(1).strip() if name_m else page_title
    return {
        "pcode": pcode,
        "title": law_title,
        "is_obsolete": is_obsolete,
        "last_revised": last_revised,
        "url": url,
        "agency": "法務部 全國法規資料庫",
    }


# ─────────────────────────────────────────────────────────────
# Discovery orchestrator
# ─────────────────────────────────────────────────────────────

def discover(parent_name: str) -> list[Candidate]:
    """主流程:給定母題名,回傳所有候選法源 Candidate。"""
    spec = PARENT_SPECS.get(parent_name)
    if not spec:
        raise SystemExit(f"未定義母題 {parent_name!r}。請在 PARENT_SPECS 加 entry。")
    candidates: list[Candidate] = []

    print(f"=== 1. 已知種子 URL ({len(spec.seed_urls)}) ===")
    for url, cat, hint, agency in spec.seed_urls:
        # 對 dgbas LawContent.aspx 抓 metadata
        if "law.dgbas.gov.tw" in url and "LawContent" in url:
            m = re.search(r"id=([A-Z]+\d+)", url)
            if m:
                meta = dgbas_get_law_meta(m.group(1))
                candidates.append(Candidate(
                    url=url, category=cat,
                    title=meta.get("title", hint),
                    agency=meta.get("agency", agency),
                    status="廢止" if meta.get("is_obsolete") else "現行",
                    last_revised=meta.get("last_revised", ""),
                    file_format="html",
                    confidence="high",
                    notes=f"已知種子;Download.ashx 連結 {len(meta.get('downloads', []))} 條",
                ))
        else:
            candidates.append(Candidate(url=url, category=cat, title=hint, agency=agency,
                                        confidence="medium", notes="已知種子(未驗證)"))

    print(f"=== 2. dgbas 主管法規分類走訪({len(spec.dgbas_category_ids)} categories) ===")
    seen = set()
    # 既有 seed_urls 的 law_id 也計入,避免重複加
    for url, _, _, _ in spec.seed_urls:
        m = re.search(r"id=([A-Z]+\d+)", url)
        if m:
            seen.add(m.group(1))
    for cid in spec.dgbas_category_ids:
        cat_hits = 0
        cat_total = 0
        for entry in dgbas_iter_category(cid):
            cat_total += 1
            if entry["law_id"] in seen:
                continue
            title = entry["title"]
            # filter:title 必須含關鍵字
            if not any(k in title for k in spec.keywords):
                continue
            seen.add(entry["law_id"])
            cat_hits += 1
            # 抓 metadata
            try:
                meta = dgbas_get_law_meta(entry["law_id"])
                cat = guess_category_from_title(title)
                candidates.append(Candidate(
                    url=entry["url"], category=cat, title=title,
                    agency=meta.get("agency", "行政院主計總處"),
                    status="廢止" if meta.get("is_obsolete") else "現行",
                    last_revised=meta.get("last_revised", ""),
                    file_format="html",
                    confidence="high",
                    notes=f"dgbas 分類 {cid} 命中(關鍵字 filter)",
                ))
            except Exception as e:
                print(f"  ERROR meta {entry['law_id']}: {e}")
        print(f"  Category {cid}: 走訪 {cat_total} 法規,命中 {cat_hits}")

    print(f"=== 3. dgbas 解釋彙編索引({len(INTERPRETATION_INDICES)} 索引頁 × {len(spec.dgbas_interpretation_keywords)} 關鍵字)===")
    for idx_url in INTERPRETATION_INDICES:
        try:
            ints = dgbas_www_parse_link_index(idx_url, spec.dgbas_interpretation_keywords)
            print(f"  {idx_url[-30:]}: {len(ints)} 連結")
            for it in ints[:30]:
                # 跳過已加入的 URL
                if any(c.url == it["url"] for c in candidates):
                    continue
                candidates.append(Candidate(
                    url=it["url"], category="C",
                    title=it["title"], agency="行政院主計總處",
                    status="現行", file_format="html",
                    confidence="medium",
                    notes=f"解釋彙編索引命中(C 候選)",
                ))
        except Exception as e:
            print(f"  ERROR {idx_url[-30:]}: {e}")

    print(f"=== 4. dgbas 經費結報問答集索引({len(QA_INDICES)} 索引頁 × {len(spec.dgbas_qa_keywords)} 關鍵字)===")
    for idx_url in QA_INDICES:
        try:
            qas = dgbas_www_parse_link_index(idx_url, spec.dgbas_qa_keywords)
            print(f"  {idx_url[-30:]}: {len(qas)} 連結")
            for it in qas[:20]:
                if any(c.url == it["url"] for c in candidates):
                    continue
                candidates.append(Candidate(
                    url=it["url"], category="D",
                    title=it["title"], agency="行政院主計總處",
                    status="現行", file_format="html",
                    confidence="medium",
                    notes="問答集索引命中(D 候選)",
                ))
        except Exception as e:
            print(f"  ERROR {idx_url[-30:]}: {e}")

    print(f"=== 5. ebasnew 友善專區 ({len(spec.ebasnew_categories)} 分區走訪) ===")
    # 去重策略:用 normalized title 比對(去括號空白)。
    # 任一 ebasnew 候選若與既有 candidates 同名 → 跳過(避免重複)
    def norm_title(t: str) -> str:
        return re.sub(r'[\(\)\s（）]', '', t)[:30]
    existing_titles_normalized = {norm_title(c.title) for c in candidates}
    for sn, ebcat, label in spec.ebasnew_categories:
        cat_total = 0
        cat_hits = 0
        cat_dedup = 0
        cat_excluded = 0
        for entry in ebasnew_iter_category(sn):
            cat_total += 1
            title = entry["title"]
            # 1) 必須含 spec.keywords 至少一個
            if not any(k in title for k in spec.keywords):
                continue
            # 2) 排除關鍵字 — 屬其他母題就跳
            if any(ex in title for ex in spec.exclude_keywords):
                cat_excluded += 1
                continue
            # 3) 去重:跟既有同名跳過
            tnorm = norm_title(title)
            if tnorm in existing_titles_normalized:
                cat_dedup += 1
                continue
            existing_titles_normalized.add(tnorm)
            cat_hits += 1
            candidates.append(Candidate(
                url=entry["url"], category=ebcat, title=title,
                agency="行政院主計總處(友善專區)",
                status="現行",
                last_revised=entry.get("date", ""),
                file_format="html",
                confidence="medium",
                notes=f"ebasnew SN={sn}({label});sub={entry.get('sub_category','')}",
            ))
        msg = f"  SN={sn} ({label}): 走訪 {cat_total},命中 {cat_hits}"
        if cat_excluded:
            msg += f",排除 {cat_excluded}(其他母題)"
        if cat_dedup:
            msg += f",去重 {cat_dedup}(同名)"
        print(msg)

    print(f"=== 6. moj 跨機關法規 ({len(spec.moj_law_pcodes)} PCode) ===")
    for pcode, hint in spec.moj_law_pcodes:
        try:
            meta = moj_get_law_meta(pcode)
            if meta.get("_error"):
                continue
            candidates.append(Candidate(
                url=meta["url"], category="A",
                title=meta.get("title", hint),
                agency=meta.get("agency", "法務部"),
                status="廢止" if meta.get("is_obsolete") else "現行",
                last_revised=meta.get("last_revised", ""),
                file_format="html",
                confidence="high",
                notes=f"moj 跨機關法規(PCode {pcode}),用於跨母題引用",
            ))
        except Exception as e:
            print(f"  PCode {pcode}: ERROR {e}")

    # 6. dedup by URL
    by_url: dict[str, Candidate] = {}
    for c in candidates:
        if c.url in by_url:
            # 若已存在,信度高的覆蓋
            if {"low": 0, "medium": 1, "high": 2}[c.confidence] > {"low": 0, "medium": 1, "high": 2}[by_url[c.url].confidence]:
                by_url[c.url] = c
        else:
            by_url[c.url] = c

    return list(by_url.values())


def guess_category_from_title(title: str) -> str:
    """從 title 推斷 A/B/C/D 類別。"""
    if any(k in title for k in ["要點", "辦法", "規則", "法", "規定", "授權法"]):
        return "A"
    if any(k in title for k in ["支給表", "標準表", "限額表", "表"]):
        return "B"
    if any(k in title for k in ["問答", "Q&A", "疑義", "問題"]):
        return "D"
    if any(k in title for k in ["函釋", "函令", "解釋"]):
        return "C"
    return "unknown"


# ─────────────────────────────────────────────────────────────
# CSV I/O
# ─────────────────────────────────────────────────────────────

CSV_HEADERS = ["url", "category", "title", "agency", "status", "last_revised",
               "publication_date", "file_format", "confidence", "decision", "notes"]


def write_candidates_csv(candidates: list[Candidate], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8-sig", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        wr.writeheader()
        # 排序:status=廢止 沉底,confidence high 在前,然後 category 與 title
        cat_order = {"A": 0, "B": 1, "C": 2, "D": 3, "unknown": 9}
        conf_order = {"high": 0, "medium": 1, "low": 2}

        def key(c):
            return (c.status == "廢止", cat_order.get(c.category, 9),
                    conf_order.get(c.confidence, 9), c.title)
        for c in sorted(candidates, key=key):
            wr.writerow({k: getattr(c, k, "") or "" for k in CSV_HEADERS})


def read_candidates_csv(in_path: Path) -> list[Candidate]:
    out: list[Candidate] = []
    with in_path.open("r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            out.append(Candidate(**{k: r.get(k, "") or "" for k in CSV_HEADERS}))
    return out


# ─────────────────────────────────────────────────────────────
# Fetch(Stage 2)
# ─────────────────────────────────────────────────────────────

def fetch_candidate(c: Candidate, out_dir: Path) -> dict:
    """下載一個已批准的 candidate。"""
    out: dict = {"url": c.url, "saved": [], "error": None}
    out_dir.mkdir(parents=True, exist_ok=True)
    base_name = safe_filename(c.title)
    is_dgbas_or_dgpa = ("law.dgbas.gov.tw" in c.url or "law.dgpa.gov.tw" in c.url) and "LawContent" in c.url
    if is_dgbas_or_dgpa:
        m = re.search(r"id=([A-Z]+\d+)", c.url)
        if not m:
            out["error"] = "law_id 解析失敗"; return out
        law_id = m.group(1)
        # 1. 抓 print HTML(已驗證有完整法條;FL/GL 自動分流)
        html = dgbas_fetch_print_html(law_id)
        if html:
            md = dgbas_html_to_md(html, c.title)
            md_path = out_dir / f"{base_name}_{law_id}.md"
            md_path.write_text(md, encoding="utf-8")
            out["saved"].append(str(md_path.relative_to(SOURCE_ROOT)))
            # 同時存 raw HTML 備援
            html_path = out_dir / f"{base_name}_{law_id}.html"
            html_path.write_text(html, encoding="utf-8")
        # 2. 抓 Download.ashx 附件(ODT/PDF — 通常含修正對照表/附表)
        meta = dgbas_get_law_meta(law_id)
        for dl in meta.get("downloads", []):
            ext = dl["url"].split(".")[-1].split("&")[0].lower() if "." in dl["url"] else "bin"
            ext = ext if ext in ("pdf", "odt", "docx", "doc") else None
            # 從連結文字猜副檔名
            if not ext:
                m2 = re.search(r"\.(pdf|odt|docx|doc)$", dl["name"], re.I)
                ext = m2.group(1).lower() if m2 else "pdf"
            try:
                rdl = http_get(dl["url"])
                if rdl.status_code == 200 and len(rdl.content) > 200:
                    fname = safe_filename(dl["name"])
                    if not fname.endswith(f".{ext}"):
                        fname += f".{ext}"
                    (out_dir / fname).write_bytes(rdl.content)
                    out["saved"].append(str((out_dir / fname).relative_to(SOURCE_ROOT)))
            except Exception as e:
                pass
    elif "law.moj.gov.tw" in c.url or "law.lia-roc.org.tw" in c.url:
        # moj / lia-roc 法規:抓完整 HTML(內含全條文)
        r = http_get(c.url)
        if r.status_code == 200:
            html_path = out_dir / f"{base_name}.html"
            html_path.write_text(r.text, encoding="utf-8")
            out["saved"].append(str(html_path.relative_to(SOURCE_ROOT)))
    elif "ebasnew.dgbas.gov.tw" in c.url:
        # ebasnew Detail 頁:抓 HTML + 嘗試提取附件 PDF/DOCX 連結
        r = http_get(c.url)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "lxml")
            # 主內容(去 nav/footer)
            for tag in soup.find_all(["nav", "header", "footer", "script", "style"]):
                tag.decompose()
            html_path = out_dir / f"{base_name}.html"
            html_path.write_text(str(soup), encoding="utf-8")
            out["saved"].append(str(html_path.relative_to(SOURCE_ROOT)))
            # 找下載附件
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if any(href.lower().endswith(ext) for ext in (".pdf", ".docx", ".doc", ".odt")):
                    file_url = urljoin(c.url, href)
                    try:
                        rdl = http_get(file_url)
                        if rdl.status_code == 200 and len(rdl.content) > 200:
                            ext = href.split(".")[-1].split("?")[0].lower()
                            fname = safe_filename(a.get_text(strip=True) or f"attachment.{ext}")
                            if not fname.endswith(f".{ext}"):
                                fname += f".{ext}"
                            (out_dir / fname).write_bytes(rdl.content)
                            out["saved"].append(str((out_dir / fname).relative_to(SOURCE_ROOT)))
                    except Exception:
                        pass
    elif "www.dgbas.gov.tw" in c.url or any(c.url.lower().endswith(ext) for ext in (".pdf", ".odt", ".docx", ".doc")):
        # 通用下載
        r = http_get(c.url)
        if r.status_code == 200:
            ext = c.url.split(".")[-1].split("?")[0].split("&")[0].lower()
            if ext not in ("pdf", "odt", "docx", "doc", "html"):
                ext = "html"
            fname = f"{base_name}.{ext}"
            if ext == "html":
                (out_dir / fname).write_text(r.text, encoding="utf-8")
            else:
                (out_dir / fname).write_bytes(r.content)
            out["saved"].append(str((out_dir / fname).relative_to(SOURCE_ROOT)))
    else:
        out["error"] = "未知 URL pattern,跳過(可手動加 fetcher)"
    return out


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parent", required=True, help="母題名(e.g. 酬勞費)— 須在 PARENT_SPECS 有 entry")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--discover", action="store_true", help="Stage 1: 產候選 URL CSV")
    g.add_argument("--fetch", action="store_true", help="Stage 2: 依 CSV decision=keep 下載")
    ap.add_argument("--csv", help="CSV 路徑(預設 00_source/_candidates_{parent}.csv)")
    ap.add_argument("--limit", type=int, default=0, help="限制處理數量(測試用,0 = 不限)")
    args = ap.parse_args()

    csv_path = Path(args.csv) if args.csv else (SOURCE_ROOT / f"_candidates_{args.parent}.csv")

    if args.discover:
        print(f"\n模式: DISCOVER 母題={args.parent}\n輸出 CSV: {csv_path.relative_to(ROOT)}")
        print("=" * 60)
        candidates = discover(args.parent)
        if args.limit:
            candidates = candidates[:args.limit]
        write_candidates_csv(candidates, csv_path)
        print()
        print(f"=== 完成 ===")
        print(f"候選總數: {len(candidates)}")
        from collections import Counter
        cat_counts = Counter(c.category for c in candidates)
        status_counts = Counter(c.status for c in candidates)
        print(f"  by category: {dict(cat_counts)}")
        print(f"  by status:   {dict(status_counts)}")
        spec = PARENT_SPECS[args.parent]
        if spec.manual_todo:
            print(f"\n=== ⚠️ 自動化抓不到的法源(需人工提供 URL 加進 seed_urls)===")
            for i, todo in enumerate(spec.manual_todo, 1):
                print(f"  {i}. {todo}")

        print(f"\n下一步: 編輯 {csv_path.name},在 decision 欄填 keep / skip / manual,然後跑:")
        print(f"  python 05_scripts/_fetch_sources.py --parent {args.parent} --fetch")

    elif args.fetch:
        if not csv_path.exists():
            print(f"[err] CSV 不存在: {csv_path}")
            print("先跑 --discover 產生 CSV")
            sys.exit(1)
        candidates = read_candidates_csv(csv_path)
        approved = [c for c in candidates if c.decision.strip().lower() == "keep"]
        print(f"\n模式: FETCH 母題={args.parent}")
        print(f"CSV 總筆數: {len(candidates)}, decision=keep: {len(approved)}")
        if not approved:
            print("無 decision=keep 的條目。請編輯 CSV 後重跑。")
            return
        spec = PARENT_SPECS[args.parent]
        out_dir = SOURCE_ROOT / spec.folder_suffix / "04_主計總處"
        results = []
        for i, c in enumerate(approved):
            if args.limit and i >= args.limit:
                break
            print(f"  [{i+1}/{len(approved)}] {c.title[:50]}")
            r = fetch_candidate(c, out_dir)
            if r["error"]:
                print(f"    ❌ {r['error']}")
            else:
                print(f"    ✓ {len(r['saved'])} 檔")
                for f in r["saved"]:
                    print(f"      → {f}")
            results.append(r)
        # 寫 fetch_log
        log_path = csv_path.parent / f"_fetch_log_{args.parent}.json"
        log_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nlog: {log_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
