"""_fix_stale_scenarios.py — Phase 5b:依使用者「原則 2」修正過時情境卡。

原則 2:情境卡內容必須遵循最新法規(A 類),如函釋或 Q&A 在最新法規之前,
        卡片內容應以最新法規為準,然後才是函釋/Q&A 補充。

本次修正(對 04_web/data/scenarios_manual.json):

1. abroad-airfare-receipts (機票三項憑證齊備)
   依 A-國外旅費-006 最新規定,機票檢附僅 2 項(不再 3 項)。
   - title:三項 → 二項
   - subtitle:刪「出國事實證明」
   - attachments:刪「③出國事實證明」與舊註解

2. abroad-airfare (機票艙等與報支)
   - attachments 第二項「出國事實證明(...)」→「購票證明單 / 代收轉付收據(付款證明)」

3. boarding-pass-lost (登機證存根遺失) → 刪除整張
   理由:最新法規 A-國外-006 已不要求出國事實證明,登機證存根不在 2 項憑證內。
        整張卡前提不再成立。歷史核銷可由 search 找到 C 函釋。

4. low-cost-carrier (廉航附加費用)
   - attachments 第二項「出國事實證明(...)」→「購票證明單 / 旅行業代收轉付收據(付款證明)」

5. onboard-overnight-living (飛機歇夜生活費)
   - attachments 第一項「機票 / 登機證(含過夜飛行時段)」→「機票或行程證明(含過夜飛行時段)」

另外:**重複合併**(2 組)

6. credit-card-fee-cap 合併到 registration-credit-card
   - 兩張 primary_ids 完全相同(A-國外-013 + A-國外-015)
   - 都是「信用卡手續費」議題
   - 保留 registration-credit-card,把 credit-card-fee-cap 的「上限驗算」資訊合進其 attachments
   - 刪除 credit-card-fee-cap

7. voucher-receipt vs voucher-receipts(收據與發票要件 vs 普通收據與發票要件)
   - 兩張皆在「收據與發票」expense,標題太像但實際主題不同
   - voucher-receipt:聚焦個人收據 / 寺廟感謝狀 / 紅白帖等特殊情形(D-002/005/027)
   - voucher-receipts:聚焦統一發票 / 普通收據 / 電子發票常規格式(D-006/010/011/013/014/015/016/017)
   - 改 title 讓差異化更明顯,不刪除

用法
----
    python 05_scripts/_fix_stale_scenarios.py            # dry-run
    python 05_scripts/_fix_stale_scenarios.py --apply
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
SCN = ROOT / "04_web" / "data" / "scenarios_manual.json"


def fix_abroad_airfare_receipts(s: dict) -> bool:
    """機票三項 → 二項憑證。"""
    if s["title"] != "機票三項憑證齊備":
        return False
    s["title"] = "機票二項憑證齊備"
    s["subtitle"] = "行程證明 + 付款證明,各項皆可用替代文件(依 A-國外-006 最新規定僅 2 項)"
    s["attachments"] = [
        "①行程證明:機票票根 / 電子機票 / 其他足資證明行程之文件 (任一即可)",
        "②付款證明:購票證明單 / 旅行業代收轉付現金收據 / 其他足資證明支付票款之文件 (任一即可)",
        "依 A-國外旅費-006 最新規定,僅需上述 2 項憑證(原 3 項要求之「出國事實證明」已刪除)",
    ]
    return True


def fix_abroad_airfare(s: dict) -> bool:
    """機票艙等卡:刪舊「出國事實證明」附件項。"""
    if s["title"] != "機票艙等與報支":
        return False
    new_attach = []
    for a in s.get("attachments") or []:
        if "出國事實證明" in a:
            new_attach.append("購票證明單 / 旅行業代收轉付收據(付款證明)")
        else:
            new_attach.append(a)
    s["attachments"] = new_attach
    return True


def remove_boarding_pass_lost(scenarios: list) -> int:
    """刪除 boarding-pass-lost 整張。"""
    before = len(scenarios)
    scenarios[:] = [s for s in scenarios if s["id"] != "boarding-pass-lost"]
    return before - len(scenarios)


def fix_low_cost_carrier(s: dict) -> bool:
    if s["title"] != "廉航附加費用":
        return False
    new_attach = []
    for a in s.get("attachments") or []:
        if "出國事實證明" in a:
            new_attach.append("購票證明單 / 旅行業代收轉付收據(付款證明)")
        else:
            new_attach.append(a)
    s["attachments"] = new_attach
    return True


def fix_onboard_overnight_living(s: dict) -> bool:
    if s["title"] != "飛機歇夜生活費":
        return False
    new_attach = []
    for a in s.get("attachments") or []:
        if "登機證" in a:
            new_attach.append("機票或行程證明(含過夜飛行時段)")
        else:
            new_attach.append(a)
    s["attachments"] = new_attach
    return True


def merge_credit_card_scenarios(scenarios: list) -> bool:
    """合併 credit-card-fee-cap → registration-credit-card。"""
    target = next((s for s in scenarios if s["id"] == "registration-credit-card"), None)
    source = next((s for s in scenarios if s["id"] == "credit-card-fee-cap"), None)
    if not target or not source:
        return False
    # 把 credit-card-fee-cap 的 attachments / approvers / tags 補進 registration-credit-card
    target["title"] = "信用卡手續費(可報 + 上限)"
    target["subtitle"] = "主辦限定須以個人信用卡支付者,刷卡手續費可併報;費用 + 手續費合計不得超過該費目上限"
    target["attachments"] = [
        "註冊費 / 報名費收據",
        "信用卡手續費明細 / 對帳單",
        "主辦限定刷卡支付之文件 / 公告",
        "驗算:原費用 + 信用卡手續費合計 ≤ 該費目上限(超過部分不得報支)",
    ]
    # tags 合併去重
    target_tags = set(target.get("tags") or [])
    target_tags.update(source.get("tags") or [])
    target["tags"] = sorted(target_tags)
    # 刪 source
    scenarios[:] = [s for s in scenarios if s["id"] != "credit-card-fee-cap"]
    return True


def fix_voucher_receipt_naming(scenarios: list) -> bool:
    """區分 voucher-receipt 與 voucher-receipts 的標題。"""
    a = next((s for s in scenarios if s["id"] == "voucher-receipt"), None)
    b = next((s for s in scenarios if s["id"] == "voucher-receipts"), None)
    if not a or not b:
        return False
    a["title"] = "特殊收據(個人/寺廟/紅白帖)"
    a["subtitle"] = "個人收據、寺廟感謝狀、紅白帖等非常規憑證如何取信"
    b["title"] = "統一發票/收據格式要件"
    b["subtitle"] = "統一發票、普通收據、電子發票的格式與必要記載"
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    data = json.loads(SCN.read_text(encoding="utf-8"))
    scenarios = data["scenarios"]

    actions: list[str] = []

    # 1. abroad-airfare-receipts
    s = next((x for x in scenarios if x["id"] == "abroad-airfare-receipts"), None)
    if s and fix_abroad_airfare_receipts(s):
        actions.append("abroad-airfare-receipts:三項 → 二項憑證")

    # 2. abroad-airfare
    s = next((x for x in scenarios if x["id"] == "abroad-airfare"), None)
    if s and fix_abroad_airfare(s):
        actions.append("abroad-airfare:刪「出國事實證明」附件項")

    # 3. boarding-pass-lost (刪除)
    n_removed = remove_boarding_pass_lost(scenarios)
    if n_removed:
        actions.append(f"boarding-pass-lost:刪除整張({n_removed})")

    # 4. low-cost-carrier
    s = next((x for x in scenarios if x["id"] == "low-cost-carrier"), None)
    if s and fix_low_cost_carrier(s):
        actions.append("low-cost-carrier:刪「出國事實證明」附件項")

    # 5. onboard-overnight-living
    s = next((x for x in scenarios if x["id"] == "onboard-overnight-living"), None)
    if s and fix_onboard_overnight_living(s):
        actions.append("onboard-overnight-living:登機證 → 機票或行程證明")

    # 6. 合併 credit-card-fee-cap → registration-credit-card
    if merge_credit_card_scenarios(scenarios):
        actions.append("credit-card-fee-cap → registration-credit-card 合併")

    # 7. voucher-receipt / receipts 改名
    if fix_voucher_receipt_naming(scenarios):
        actions.append("voucher-receipt / voucher-receipts 改名差異化")

    print("─" * 80)
    print(f"模式:{'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"變動 {len(actions)} 項:")
    for a in actions:
        print(f"  · {a}")
    print(f"\n情境卡總數:{len(scenarios)}(原 119)")

    if args.apply:
        SCN.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n已寫入 {SCN}")
    else:
        print("\n[DRY-RUN] 加 --apply 實際寫入")
    return 0


if __name__ == "__main__":
    sys.exit(main())
