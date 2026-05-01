"""把 D-酬勞費-001(二代健保補充保費 Q&A 整份 PDF)拆成 7 張獨立 D 卡(Q1~Q7)。

原始 D-001 是 1150105二代健保QA.pdf 整份 7 個 Q&A 塞進單一 D 卡 ## Q&A 區塊;
不符合 D 類「QN 一卡」原則(CLAUDE.md §4 D 類 ID 規則)。

輸出:D-酬勞費-001 ~ D-酬勞費-007(原 D-001 變 D-001 改寫為 Q1)
原檔備份至 docs/_archive/D-酬勞費-001_old_combined.md
"""
from __future__ import annotations
import sys
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "02_markdown" / "D_問答集" / "酬勞費" / "Q001_二代健保補充保險費-常見.md"
ARCHIVE = ROOT / "docs" / "_archive" / "D-酬勞費-001_old_combined.md"

QUESTION_TITLES = {
    1: "Q1 哪些所得要繳補充保險費",
    2: "Q2 雇主補充保險費月計算與繳納",
    3: "Q3 保險對象補充保險費扣繳方式",
    4: "Q4 獎金補充保險費計算",
    5: "Q5 兼職所得補充保險費計收",
    6: "Q6 執行業務報酬給付事務所扣費",
    7: "Q7 雇主自投保單位獲股利所得計算",
}

QUESTION_SUMMARIES = {
    1: "依健保法第31條規定,投保單位應就薪資差額按2.11%計收;保險對象6項所得(獎金/兼職/執行業務/股利/利息/租金)單次或累計達門檻時扣繳補充保險費。",
    2: "依健保法第34條,投保單位每月支付薪資總額大於受僱員工當月投保金額總額時,差額按補充保險費率2.11%自計,於次月底前繳納。",
    3: "保險對象補充保險費採就源扣繳,由給付單位在給付6項應計收所得時,依規定上下限及費率扣取,於次月底前交付健保署。",
    4: "投保單位每次給付獎金時,應計算當年累計獎金有否超過該員當月投保金額4倍,超過部分乘以2.11%扣繳補充保險費。",
    5: "兼職所得按單次計收(非累計);單次給付達基本工資(115年1月起29,500元)時,須扣繳補充保險費。",
    6: "投保單位給付執行業務報酬予單獨/聯合執業型態事務所時,投保單位不扣取;由事務所於給付保險對象時扣繳。",
    7: "雇主以負責人身分加保時,公司發放股利可先扣除雇主該年度於該公司加保月份投保金額總額,再就餘額計算股利補充保險費。",
}


def make_md(qn: int, q_text: str, a_text: str) -> str:
    title = QUESTION_TITLES[qn]
    summary = QUESTION_SUMMARIES[qn]
    return (
        "---\n"
        f"id: D-酬勞費-{qn:03d}\n"
        "type: 問答集\n"
        "parent: 酬勞費\n"
        f"title: {title}\n"
        "tags:\n"
        "- 酬勞費\n"
        "- 健保補充保費\n"
        "related: []\n"
        "source: 1150105二代健保QA(衛生福利部中央健康保險署中區業務組)\n"
        "version: '2026-01-05'\n"
        "reviewed: '2026-04-25'\n"
        "review_level: llm精校\n"
        "agency: 衛生福利部中央健康保險署\n"
        "pending_relocation: 健保(待健保母題建立後遷移;與酬勞費關聯為支給時扣繳補充保費)\n"
        "---\n"
        "\n"
        "## 問題\n"
        "\n"
        f"{q_text.strip()}\n"
        "\n"
        "## 回答\n"
        "\n"
        f"{a_text.strip()}\n"
        "\n"
        "## 重點摘要\n"
        "\n"
        f"{summary}\n"
        "\n"
        "## 相關規定\n"
        "\n"
        "(待人工補)\n"
        "\n"
        "## 備註\n"
    )


def main() -> int:
    if not TARGET.exists():
        print(f"找不到 {TARGET}", file=sys.stderr)
        return 1

    text = TARGET.read_text(encoding="utf-8")
    fm_match = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.S)
    if not fm_match:
        print("front-matter 解析失敗", file=sys.stderr)
        return 1
    body = fm_match.group(2)
    qa_block_m = re.search(r"## Q&A\n(.*?)(?=\n## |\Z)", body, re.S)
    if not qa_block_m:
        print("找不到 ## Q&A 區塊", file=sys.stderr)
        return 1
    qa_text = qa_block_m.group(1).strip()

    # 切 Q1~Q7:用「Q\d+[::]」當分隔符 split
    parts = re.split(r"Q(\d+)\s*[::：]", qa_text)
    # parts = [前言, '1', 'Q1 內文', '2', 'Q2 內文', ...]
    chunks: dict[int, tuple[str, str]] = {}
    for i in range(1, len(parts), 2):
        qn = int(parts[i])
        full = parts[i + 1].strip()
        # 切 Q / A
        a_split = re.split(r"\n*A\s*[::：]\s*", full, maxsplit=1)
        if len(a_split) == 2:
            q_text, a_text = a_split[0].strip(), a_split[1].strip()
        else:
            q_text, a_text = full, ""
        # 移除 footer 雜訊
        a_text = re.sub(r"※如尚有疑問.*$", "", a_text, flags=re.S).strip()
        a_text = re.sub(r"衛生福利部中央健康保險署中區業務組\s*第\d+頁.*$", "", a_text, flags=re.S).strip()
        a_text = re.sub(r"政策廣告", "", a_text).strip()
        a_text = re.sub(r"\n{3,}", "\n\n", a_text)
        chunks[qn] = (q_text, a_text)

    print(f"切到 {len(chunks)} 個 Q (預期 7)")
    if len(chunks) != 7:
        print("Q 數不對,請手動檢視", file=sys.stderr)
        return 1

    # 備份原檔
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    ARCHIVE.write_text(text, encoding="utf-8")
    print(f"備份原檔: {ARCHIVE.relative_to(ROOT)}")

    # 刪原檔
    TARGET.unlink()

    # 寫 7 個新檔
    out_dir = TARGET.parent
    for qn, (q_text, a_text) in sorted(chunks.items()):
        new_filename = f"Q{qn:03d}_{QUESTION_TITLES[qn].replace(' ', '_')}.md"
        new_path = out_dir / new_filename
        new_path.write_text(make_md(qn, q_text, a_text), encoding="utf-8")
        print(f"  寫 {new_filename}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
